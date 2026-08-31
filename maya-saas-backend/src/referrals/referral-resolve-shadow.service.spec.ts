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
  REFERRAL_RESOLVE_SHADOW_BRIDGE_CONTRACT,
  ReferralResolveShadowDto,
} from './dto/referral-resolve-shadow.dto';
import { ReferralResolveShadowService } from './referral-resolve-shadow.service';

function isoDate(offsetDays = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

const validDto = (): ReferralResolveShadowDto => ({
  contract: REFERRAL_RESOLVE_SHADOW_BRIDGE_CONTRACT,
  initiator: 'scheduled_resolver',
  provider: 'yclients',
  external_company_id: 'company-42',
  referrer_external_client_id: 'provider-referrer-7',
  referred_external_client_id: 'provider-referred-8',
  evaluation_date: isoDate(),
  provider_read_status: 'succeeded',
  visit_record_id: 'visit-9001',
  visit_occurred_on: isoDate(-1),
  visit_attendance: 1,
  legacy_claimed_outcome: 'qualified',
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
type ReferralQuery = {
  where: { tenantId_identityHash: { identityHash: string } };
};

function buildHarness() {
  const planShadow: jest.MockedFunction<
    ActionEngineRuntimeService['planShadow']
  > = jest.fn((request: TrustedActionExecutionRequestV1) => {
    void request;
    return Promise.resolve({ id: 'execution-resolution-1' } as ActionExecution);
  });
  const findMany: jest.MockedFunction<() => Promise<ExactLink[]>> = jest
    .fn()
    .mockResolvedValue(exactLinks());
  const findReferral = jest.fn((args: ReferralQuery) =>
    Promise.resolve({
      id: 'referral-1',
      status: 'pending',
      referrerClientId: 'client-referrer-7',
      referredClientId: 'client-referred-8',
      identityHash: args.where.tenantId_identityHash.identityHash,
      joinedAt: new Date(`${isoDate(-10)}T00:00:00.000Z`),
    }),
  );
  const findProgram = jest.fn().mockResolvedValue({
    id: 'program-1',
    enabled: true,
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
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
  const service = new ReferralResolveShadowService(
    { planShadow } as unknown as ActionEngineRuntimeService,
    {
      crmClientLink: { findMany },
      customerReferral: { findUnique: findReferral },
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
    findReferral,
    findProgram,
    checkCrmClientRegistrationGuard,
    bridgeSource,
  };
}

describe('ReferralResolveShadowService', () => {
  const originalEnabled = process.env.MAYA_REFERRAL_RESOLVE_SHADOW_ENABLED;

  beforeEach(() => {
    process.env.MAYA_REFERRAL_RESOLVE_SHADOW_ENABLED = 'true';
  });

  afterAll(() => {
    if (originalEnabled === undefined) {
      delete process.env.MAYA_REFERRAL_RESOLVE_SHADOW_ENABLED;
    } else {
      process.env.MAYA_REFERRAL_RESOLVE_SHADOW_ENABLED = originalEnabled;
    }
  });

  it('plans an exact qualified outcome and stops before every mutation', async () => {
    const setup = buildHarness();

    const result = await setup.service.planResolution(validDto());

    expect(result).toMatchObject({
      outcome: 'planned',
      actionExecutionId: 'execution-resolution-1',
      shadowDivergences: 0,
      intendedMutation: {
        model: 'CustomerReferral',
        referralId: 'referral-1',
        status: 'qualified',
        referredClientId: 'client-referred-8',
        policyProfile: 'p4-04.referral-resolve.shadow-policy.v1',
        evidenceDecision: 'exact_attended_visit',
        approvalRequirement: 'NONE',
      },
      newPathReferralMutations: 0,
      newPathRewardValueMutations: 0,
      newPathProviderWrites: 0,
      newPathMessages: 0,
    });
    const [request] = setup.planShadow.mock.calls[0];
    expect(request).toMatchObject({
      tenantId: 'tenant-a',
      capability: 'referrals.customer-referral-resolve.shadow.v1',
      source: {
        type: 'legacy_bridge',
        sourceRef: 'legacy-referral:resolve-customer-referral',
      },
      targetRef: 'referral:referral-1',
      input: {
        terminalOutcome: 'qualified',
        evidenceDecision: 'exact_attended_visit',
        eligibilityDecision: 'eligible_for_resolution',
        shadowDivergence: false,
      },
      callerIdempotency: {
        scope: 'p4-04.resolve-customer-referral.shadow',
      },
    });
    expect(request.evidenceRefs).toHaveLength(4);
  });

  it('derives expiration from the server policy window without visit authority', async () => {
    const setup = buildHarness();
    setup.findReferral.mockImplementation((args: ReferralQuery) =>
      Promise.resolve({
        id: 'referral-1',
        status: 'pending',
        referrerClientId: 'client-referrer-7',
        referredClientId: 'client-referred-8',
        identityHash: args.where.tenantId_identityHash.identityHash,
        joinedAt: new Date(`${isoDate(-62)}T00:00:00.000Z`),
      }),
    );

    const result = await setup.service.planResolution({
      ...validDto(),
      provider_read_status: 'not_run',
      visit_record_id: undefined,
      visit_occurred_on: undefined,
      visit_attendance: undefined,
      legacy_claimed_outcome: 'expired',
    });

    expect(result).toMatchObject({
      outcome: 'planned',
      shadowDivergences: 0,
      intendedMutation: {
        status: 'expired',
        providerVisitIdentityHash: null,
        evidenceDecision: 'pending_ttl_elapsed',
      },
    });
  });

  it('derives canonical self-blocking without trusting a legacy outcome', async () => {
    const setup = buildHarness();
    setup.findMany.mockResolvedValue([
      exactLinks()[0],
      {
        ...exactLinks()[1],
        client: { id: 'client-referrer-7', mergedIntoClientId: null },
      },
    ]);
    setup.findReferral.mockImplementation((args: ReferralQuery) =>
      Promise.resolve({
        id: 'referral-1',
        status: 'pending',
        referrerClientId: 'client-referrer-7',
        referredClientId: 'client-referrer-7',
        identityHash: args.where.tenantId_identityHash.identityHash,
        joinedAt: new Date(`${isoDate(-10)}T00:00:00.000Z`),
      }),
    );

    const result = await setup.service.planResolution({
      ...validDto(),
      provider_read_status: 'not_run',
      visit_record_id: undefined,
      visit_occurred_on: undefined,
      visit_attendance: undefined,
      legacy_claimed_outcome: 'self_blocked',
    });

    expect(result).toMatchObject({
      outcome: 'planned',
      shadowDivergences: 0,
      intendedMutation: {
        status: 'self_blocked',
        evidenceDecision: 'canonical_self_referral',
      },
    });
  });

  it('converges retry, restart, and different initiators to one identity', async () => {
    const first = buildHarness();
    const restarted = buildHarness();

    await first.service.planResolution(validDto());
    await first.service.planResolution({
      ...validDto(),
      initiator: 'admin_command',
    });
    await restarted.service.planResolution({
      ...validDto(),
      initiator: 'owner_panel',
    });

    expect(first.planShadow.mock.calls[1]?.[0]).toEqual(
      first.planShadow.mock.calls[0]?.[0],
    );
    expect(restarted.planShadow.mock.calls[0]?.[0]).toEqual(
      first.planShadow.mock.calls[0]?.[0],
    );
  });

  it('fails closed for cross-tenant, merged, or held Client identity', async () => {
    const crossTenant = buildHarness();
    crossTenant.findMany.mockResolvedValue([exactLinks()[0]]);
    await expect(
      crossTenant.service.planResolution(validDto()),
    ).resolves.toMatchObject({ outcome: 'identity_unresolved' });
    expect(crossTenant.planShadow).not.toHaveBeenCalled();

    const merged = buildHarness();
    merged.findMany.mockResolvedValue([
      exactLinks()[0],
      {
        ...exactLinks()[1],
        client: { id: 'client-referred-8', mergedIntoClientId: 'winner' },
      },
    ]);
    await expect(
      merged.service.planResolution(validDto()),
    ).resolves.toMatchObject({ outcome: 'identity_unresolved' });
    expect(merged.planShadow).not.toHaveBeenCalled();

    for (const decision of [
      { allowed: false, reasonCode: CLIENT_IDENTITY_UNRESOLVED },
      { allowed: false, reasonCode: CLIENT_IDENTITY_GUARD_UNAVAILABLE },
    ]) {
      const held = buildHarness();
      held.checkCrmClientRegistrationGuard.mockResolvedValueOnce(decision);
      await expect(
        held.service.planResolution(validDto()),
      ).resolves.toMatchObject({
        outcome:
          decision.reasonCode === CLIENT_IDENTITY_UNRESOLVED
            ? 'identity_unresolved'
            : 'identity_guard_unavailable',
      });
      expect(held.planShadow).not.toHaveBeenCalled();
    }
  });

  it('requires the exact pending relationship and exact referred Client', async () => {
    for (const referral of [
      null,
      {
        id: 'referral-1',
        status: 'qualified',
        referrerClientId: 'client-referrer-7',
        referredClientId: 'client-referred-8',
        identityHash: 'unused',
        joinedAt: new Date(),
      },
      {
        id: 'referral-1',
        status: 'pending',
        referrerClientId: 'client-referrer-7',
        referredClientId: 'different-client',
        identityHash: 'unused',
        joinedAt: new Date(),
      },
    ]) {
      const setup = buildHarness();
      setup.findReferral.mockImplementation((args: ReferralQuery) =>
        Promise.resolve(
          referral && {
            ...referral,
            identityHash: args.where.tenantId_identityHash.identityHash,
          },
        ),
      );

      await expect(
        setup.service.planResolution(validDto()),
      ).resolves.toMatchObject({ outcome: 'referral_not_resolvable' });
      expect(setup.planShadow).not.toHaveBeenCalled();
    }
  });

  it('fails closed on provider read failure, stale window, or incomplete visit evidence', async () => {
    for (const dto of [
      { ...validDto(), provider_read_status: 'failed' as const },
      { ...validDto(), evaluation_date: isoDate(-1) },
      { ...validDto(), visit_record_id: undefined },
      { ...validDto(), visit_attendance: 0 },
      { ...validDto(), visit_occurred_on: isoDate(-11) },
    ]) {
      const setup = buildHarness();
      await expect(setup.service.planResolution(dto)).resolves.toMatchObject({
        outcome: 'provider_evidence_unavailable',
        actionExecutionId: null,
      });
      expect(setup.planShadow).not.toHaveBeenCalled();
    }
  });

  it('records but never follows a forged legacy terminal claim', async () => {
    const setup = buildHarness();

    const result = await setup.service.planResolution({
      ...validDto(),
      legacy_claimed_outcome: 'expired',
    });

    expect(result).toMatchObject({
      outcome: 'planned',
      shadowDivergences: 1,
      intendedMutation: { status: 'qualified' },
    });
    expect(setup.planShadow.mock.calls[0]?.[0].input).toMatchObject({
      terminalOutcome: 'qualified',
      legacyClaimedOutcome: 'expired',
      shadowDivergence: true,
    });
  });

  it('rejects forged authority at the HTTP boundary', async () => {
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
      { terminalOutcome: 'qualified' },
    ]) {
      await expect(
        pipe.transform(
          { ...validDto(), ...forged },
          { type: 'body', metatype: ReferralResolveShadowDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('does not plan when the server program or Shadow is disabled', async () => {
    const programDisabled = buildHarness();
    programDisabled.findProgram.mockResolvedValue({
      id: 'program-1',
      enabled: false,
      updatedAt: new Date(),
    });
    await expect(
      programDisabled.service.planResolution(validDto()),
    ).resolves.toMatchObject({ outcome: 'not_eligible' });
    expect(programDisabled.planShadow).not.toHaveBeenCalled();

    process.env.MAYA_REFERRAL_RESOLVE_SHADOW_ENABLED = 'false';
    const shadowDisabled = buildHarness();
    await expect(
      shadowDisabled.service.planResolution(validDto()),
    ).resolves.toMatchObject({ outcome: 'shadow_disabled' });
    expect(
      shadowDisabled.bridgeSource.resolveTenantByIntegration,
    ).not.toHaveBeenCalled();
  });
});
