import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ActionExecution } from '@prisma/client';

import {
  ActionEngineRuntimeService,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import {
  CLIENT_IDENTITY_GUARD_UNAVAILABLE,
  CLIENT_IDENTITY_UNRESOLVED,
  ClientIdentityService,
} from '../crm/client-identity.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  REFERRAL_CREATE_SHADOW_BRIDGE_CONTRACT,
  ReferralCreateShadowDto,
} from './dto/referral-create-shadow.dto';
import { ReferralCreateShadowService } from './referral-create-shadow.service';

const validDto = (): ReferralCreateShadowDto => ({
  contract: REFERRAL_CREATE_SHADOW_BRIDGE_CONTRACT,
  initiator: 'telegram_referral_start',
  provider: 'yclients',
  external_company_id: 'company-42',
  referrer_external_client_id: 'provider-referrer-7',
  referred_external_client_id: 'provider-referred-8',
});

const exactLinks = () => [
  {
    externalId: 'provider-referrer-7',
    client: { id: 'client-referrer-7', mergedIntoClientId: null },
  },
  {
    externalId: 'provider-referred-8',
    client: { id: 'client-referred-8', mergedIntoClientId: null },
  },
];

type ExactLink = ReturnType<typeof exactLinks>[number];
type FindManyArgs = {
  where: {
    tenantId: string;
    provider: string;
    externalId: { in: string[] };
    unlinkedAt: null;
  };
};

function buildHarness() {
  const planShadow: jest.MockedFunction<
    ActionEngineRuntimeService['planShadow']
  > = jest.fn((request: TrustedActionExecutionRequestV1) => {
    void request;
    return Promise.resolve({ id: 'execution-referral-1' } as ActionExecution);
  });
  const findMany: jest.MockedFunction<
    (args: FindManyArgs) => Promise<ExactLink[]>
  > = jest.fn().mockResolvedValue(exactLinks());
  const findProgram = jest.fn().mockResolvedValue({
    id: 'program-1',
    enabled: true,
    inviterRewardKopecks: null,
    inviteeRewardKopecks: null,
    currency: 'RUB',
    codePrefix: 'REF',
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  });
  const checkCrmClientRegistrationGuard = jest
    .fn()
    .mockResolvedValue({ allowed: true, reasonCode: null });
  const bridgeSource = {
    assertBridgeSecret: jest.fn(),
    assertBridgeIntegrationBinding: jest.fn().mockReturnValue({
      provider: 'yclients',
      externalCompanyId: 'company-42',
    }),
    resolveTenantByIntegration: jest.fn().mockResolvedValue({
      tenantId: 'tenant-a',
      slug: 'tenant-a',
      resolvedBy: 'integration',
    }),
  };
  const runAsSystemTenant = jest.fn(
    (_tenantId: string, callback: () => unknown) => callback(),
  );
  const service = new ReferralCreateShadowService(
    { planShadow } as unknown as ActionEngineRuntimeService,
    {
      crmClientLink: { findMany },
      referralProgram: { findUnique: findProgram },
    } as unknown as PrismaService,
    bridgeSource as unknown as BridgeSourceService,
    { runAsSystemTenant } as unknown as TenantContextService,
    { checkCrmClientRegistrationGuard } as unknown as ClientIdentityService,
  );

  return {
    service,
    planShadow,
    findMany,
    findProgram,
    checkCrmClientRegistrationGuard,
    bridgeSource,
    runAsSystemTenant,
  };
}

describe('ReferralCreateShadowService', () => {
  const originalEnabled = process.env.MAYA_REFERRAL_CREATE_SHADOW_ENABLED;

  beforeEach(() => {
    process.env.MAYA_REFERRAL_CREATE_SHADOW_ENABLED = 'true';
  });

  afterAll(() => {
    if (originalEnabled === undefined) {
      delete process.env.MAYA_REFERRAL_CREATE_SHADOW_ENABLED;
    } else {
      process.env.MAYA_REFERRAL_CREATE_SHADOW_ENABLED = originalEnabled;
    }
  });

  it('plans one exact server-derived referral intent with no business side effect', async () => {
    const setup = buildHarness();

    const result = await setup.service.planCreate(validDto());

    expect(result).toMatchObject({
      outcome: 'planned',
      actionExecutionId: 'execution-referral-1',
      shadowDivergences: 0,
      intendedMutation: {
        model: 'CustomerReferral',
        status: 'pending',
        referrerClientId: 'client-referrer-7',
        referredClientId: 'client-referred-8',
        policyProfile: 'p4-04.referral-create.shadow-policy.v1',
        eligibility: 'eligible',
        approvalRequirement: 'NONE',
      },
      newPathReferralRelationships: 0,
      newPathRewardValueMutations: 0,
      newPathProviderWrites: 0,
      newPathMessages: 0,
    });
    const [request] = setup.planShadow.mock.calls[0];
    expect(request).toMatchObject({
      tenantId: 'tenant-a',
      capability: 'referrals.customer-referral-create.shadow.v1',
      source: {
        type: 'legacy_bridge',
        sourceRef: 'legacy-referral:create-customer-referral',
      },
      input: {
        provider: 'yclients',
        canonicalReferrerClientId: 'client-referrer-7',
        canonicalReferredClientId: 'client-referred-8',
        policyProfile: 'p4-04.referral-create.shadow-policy.v1',
        eligibilityDecision: 'eligible',
        intendedStatus: 'pending',
      },
      callerIdempotency: {
        scope: 'p4-04.create-customer-referral.shadow',
      },
    });
    expect(request.targetRef).toMatch(/^referral:/);
    expect(request.source.occurrenceScope).toContain(
      request.callerIdempotency.key,
    );
    expect(request.evidenceRefs).toHaveLength(2);
    expect(setup.runAsSystemTenant).toHaveBeenCalledWith(
      'tenant-a',
      expect.any(Function),
    );
  });

  it('converges a retry to the same logical request identity', async () => {
    const setup = buildHarness();

    await setup.service.planCreate(validDto());
    await setup.service.planCreate(validDto());

    expect(setup.planShadow.mock.calls[1]?.[0]).toEqual(
      setup.planShadow.mock.calls[0]?.[0],
    );
  });

  it('preserves the same logical identity after service restart', async () => {
    const first = buildHarness();
    const restarted = buildHarness();

    await first.service.planCreate(validDto());
    await restarted.service.planCreate(validDto());

    expect(restarted.planShadow.mock.calls[0]?.[0]).toEqual(
      first.planShadow.mock.calls[0]?.[0],
    );
  });

  it('fails closed when one provider identity belongs outside the resolved tenant', async () => {
    const setup = buildHarness();
    setup.findMany.mockResolvedValue([exactLinks()[0]]);

    await expect(setup.service.planCreate(validDto())).resolves.toMatchObject({
      outcome: 'identity_unresolved',
      actionExecutionId: null,
    });
    const findArgs = setup.findMany.mock.calls[0]?.[0] as {
      where: { tenantId: string };
    };
    expect(findArgs.where.tenantId).toBe('tenant-a');
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('rejects self-referral before a canonical execution exists', async () => {
    const setup = buildHarness();

    await expect(
      setup.service.planCreate({
        ...validDto(),
        referred_external_client_id: 'provider-referrer-7',
      }),
    ).resolves.toMatchObject({
      outcome: 'self_referral',
      actionExecutionId: null,
    });
    expect(setup.findMany).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('rejects an unresolved or merged canonical Client identity', async () => {
    for (const links of [
      [exactLinks()[0]],
      [
        exactLinks()[0],
        {
          ...exactLinks()[1],
          client: {
            id: 'client-referred-8',
            mergedIntoClientId: 'client-canonical-winner',
          },
        },
      ],
    ]) {
      const setup = buildHarness();
      setup.findMany.mockResolvedValue(links);

      await expect(setup.service.planCreate(validDto())).resolves.toMatchObject(
        { outcome: 'identity_unresolved', actionExecutionId: null },
      );
      expect(setup.planShadow).not.toHaveBeenCalled();
    }
  });

  it('blocks P02/P03-style active holds and guard lookup failures', async () => {
    for (const decision of [
      { allowed: false, reasonCode: CLIENT_IDENTITY_UNRESOLVED },
      { allowed: false, reasonCode: CLIENT_IDENTITY_GUARD_UNAVAILABLE },
    ]) {
      const setup = buildHarness();
      setup.checkCrmClientRegistrationGuard
        .mockResolvedValueOnce({ allowed: true, reasonCode: null })
        .mockResolvedValueOnce(decision);

      const result = await setup.service.planCreate(validDto());

      expect(result.outcome).toBe(
        decision.reasonCode === CLIENT_IDENTITY_UNRESOLVED
          ? 'identity_unresolved'
          : 'identity_guard_unavailable',
      );
      expect(setup.findMany).not.toHaveBeenCalled();
      expect(setup.planShadow).not.toHaveBeenCalled();
    }
  });

  it('rejects forged authority and eligibility at the HTTP boundary', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => new BadRequestException(errors),
    });

    for (const forged of [
      { tenantId: 'tenant-b' },
      { eligible: true },
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { policyDecision: 'ALLOW' },
      { approvalBindingHash: 'forged' },
      { executor: 'legacy.direct' },
    ]) {
      await expect(
        pipe.transform(
          { ...validDto(), ...forged },
          { type: 'body', metatype: ReferralCreateShadowDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('converges different legacy initiators to one relationship identity', async () => {
    const telegram = buildHarness();
    const webhook = buildHarness();

    await telegram.service.planCreate(validDto());
    await webhook.service.planCreate({ ...validDto(), initiator: 'webhook' });

    expect(webhook.planShadow.mock.calls[0]?.[0]).toEqual(
      telegram.planShadow.mock.calls[0]?.[0],
    );
  });

  it('does not plan when server policy disables eligibility or Shadow', async () => {
    const programDisabled = buildHarness();
    programDisabled.findProgram.mockResolvedValue({
      id: 'program-1',
      enabled: false,
      inviterRewardKopecks: null,
      inviteeRewardKopecks: null,
      currency: 'RUB',
      codePrefix: 'REF',
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    });
    await expect(
      programDisabled.service.planCreate(validDto()),
    ).resolves.toMatchObject({ outcome: 'not_eligible' });
    expect(programDisabled.planShadow).not.toHaveBeenCalled();

    const shadowDisabled = buildHarness();
    process.env.MAYA_REFERRAL_CREATE_SHADOW_ENABLED = 'false';
    await expect(
      shadowDisabled.service.planCreate(validDto()),
    ).resolves.toMatchObject({ outcome: 'shadow_disabled' });
    expect(
      shadowDisabled.bridgeSource.resolveTenantByIntegration,
    ).not.toHaveBeenCalled();
    expect(shadowDisabled.planShadow).not.toHaveBeenCalled();
  });
});
