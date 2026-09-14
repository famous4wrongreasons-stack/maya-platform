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
  REFERRAL_REWARD_ISSUE_SHADOW_BRIDGE_CONTRACT,
  ReferralRewardIssueShadowDto,
} from './dto/referral-reward-issue-shadow.dto';
import { ReferralRewardIssueShadowService } from './referral-reward-issue-shadow.service';

const validDto = (): ReferralRewardIssueShadowDto => ({
  contract: REFERRAL_REWARD_ISSUE_SHADOW_BRIDGE_CONTRACT,
  initiator: 'qualified_resolution',
  provider: 'yclients',
  external_company_id: 'company-42',
  referrer_external_client_id: 'provider-referrer-7',
  referred_external_client_id: 'provider-referred-8',
  legacy_claimed_inviter_reward_kopecks: 1_500,
  legacy_claimed_invitee_reward_kopecks: 1_500,
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

function qualifiedReferral(identityHash: string) {
  return {
    id: 'referral-1',
    status: 'qualified',
    referrerClientId: 'client-referrer-7',
    referredClientId: 'client-referred-8',
    identityHash,
    resolutionExecutionId: 'resolution-1',
    resolvedAt: new Date('2026-09-01T00:00:00.000Z'),
    rewardIssuance: null,
    resolutionExecution: {
      id: 'resolution-1',
      tenantId: 'tenant-a',
      actionClass: 'resolve_customer_referral',
      state: 'SUCCEEDED',
      policyDecision: 'ALLOW',
      normalizedInputHash: 'resolution-input-hash',
      policyContextHash: 'resolution-policy-hash',
      finalizedAt: new Date('2026-09-01T00:00:00.000Z'),
    },
  };
}

function buildHarness() {
  const planShadow: jest.MockedFunction<
    ActionEngineRuntimeService['planShadow']
  > = jest.fn((request: TrustedActionExecutionRequestV1) => {
    void request;
    return Promise.resolve({ id: 'execution-issuance-1' } as ActionExecution);
  });
  const findMany: jest.MockedFunction<() => Promise<ExactLink[]>> = jest
    .fn()
    .mockResolvedValue(exactLinks());
  const findReferral = jest.fn((args: ReferralQuery) =>
    Promise.resolve(
      qualifiedReferral(args.where.tenantId_identityHash.identityHash),
    ),
  );
  const findProgram = jest.fn().mockResolvedValue({
    id: 'program-1',
    enabled: true,
    inviterRewardKopecks: 1_500,
    inviteeRewardKopecks: 1_500,
    inviterRewardPercentBasisPoints: null,
    inviteeRewardPercentBasisPoints: null,
    inviterRewardLiabilityCapKopecks: null,
    inviteeRewardLiabilityCapKopecks: null,
    currency: 'RUB',
    updatedAt: new Date('2026-08-31T00:00:00.000Z'),
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
  const service = new ReferralRewardIssueShadowService(
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

describe('ReferralRewardIssueShadowService', () => {
  const originalEnvironment = {
    enabled: process.env.MAYA_REFERRAL_REWARD_ISSUE_SHADOW_ENABLED,
    presentationKey: process.env.MAYA_REFERRAL_REWARD_PRESENTATION_KEY,
    presentationVersion:
      process.env.MAYA_REFERRAL_REWARD_PRESENTATION_KEY_VERSION,
    lookupKey: process.env.MAYA_REFERRAL_REWARD_CLAIM_SECRET,
  };

  beforeEach(() => {
    process.env.MAYA_REFERRAL_REWARD_ISSUE_SHADOW_ENABLED = 'true';
    process.env.MAYA_REFERRAL_REWARD_PRESENTATION_KEY =
      'p4-04-presentation-test-secret-000000000000';
    process.env.MAYA_REFERRAL_REWARD_PRESENTATION_KEY_VERSION = 'test-v1';
    process.env.MAYA_REFERRAL_REWARD_CLAIM_SECRET =
      'p4-04-lookup-test-secret-0000000000000000';
  });

  afterAll(() => {
    for (const [key, value] of Object.entries({
      MAYA_REFERRAL_REWARD_ISSUE_SHADOW_ENABLED: originalEnvironment.enabled,
      MAYA_REFERRAL_REWARD_PRESENTATION_KEY:
        originalEnvironment.presentationKey,
      MAYA_REFERRAL_REWARD_PRESENTATION_KEY_VERSION:
        originalEnvironment.presentationVersion,
      MAYA_REFERRAL_REWARD_CLAIM_SECRET: originalEnvironment.lookupKey,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('plans one deterministic two-recipient issuance with zero side effects', async () => {
    const setup = buildHarness();

    const result = await setup.service.planIssuance(validDto());

    expect(result).toMatchObject({
      outcome: 'planned',
      actionExecutionId: 'execution-issuance-1',
      shadowDivergences: 0,
      intendedIssuance: {
        model: 'ReferralRewardIssuance',
        referralId: 'referral-1',
        resolutionExecutionId: 'resolution-1',
        policyProfile: 'p4-04.referral-reward-issuance.shadow-policy.v1',
        valueContract: 'p4-04.discount-entitlement.v1',
        currency: 'RUB',
        aggregateLiabilityKopecks: 3_000,
        maxRecipients: 2,
        perRewardLiabilityCapKopecks: 50_000,
        perIssuanceLiabilityCapKopecks: 100_000,
        approvalThresholdKopecks: 1,
        executableApprovalRequirement: 'REQUIRED',
        presentationContract: 'referral-reward-presentation.v1',
        claimLookupContract: 'referralRewardClaimLookup.v1',
        capDecision: 'within_cap',
      },
      newPathRewardIssuances: 0,
      newPathRewards: 0,
      newPathLoyaltyValueMutations: 0,
      newPathProviderWrites: 0,
      newPathMessages: 0,
    });
    expect(result.intendedIssuance?.rewards).toEqual([
      expect.objectContaining({
        slot: 'inviter',
        recipientClientId: 'client-referrer-7',
        denomination: 'FIXED_MONEY_DISCOUNT',
        amountKopecks: 1_500,
        percentBasisPoints: null,
        liabilityCapKopecks: 1_500,
      }),
      expect.objectContaining({
        slot: 'invitee',
        recipientClientId: 'client-referred-8',
        denomination: 'FIXED_MONEY_DISCOUNT',
        amountKopecks: 1_500,
        liabilityCapKopecks: 1_500,
      }),
    ]);
    expect(result.intendedIssuance?.rewards[0]?.rewardIdentityHash).not.toBe(
      result.intendedIssuance?.rewards[1]?.rewardIdentityHash,
    );
    const [request] = setup.planShadow.mock.calls[0];
    expect(request).toMatchObject({
      tenantId: 'tenant-a',
      capability: 'referrals.referral-reward-issue.shadow.v1',
      source: {
        type: 'legacy_bridge',
        sourceRef: 'legacy-referral:issue-referral-rewards',
      },
      targetRef: 'referral:referral-1',
      callerIdempotency: {
        scope: 'p4-04.issue-referral-rewards.shadow',
      },
    });
    expect(request.evidenceRefs).toHaveLength(3);
    expect(request.input).toHaveProperty('rewards.0.codeHash');
    expect(request.input).not.toHaveProperty('bearer');
    expect(JSON.stringify(request.input)).not.toContain('MAYA-RR-');
  });

  it('supports exactly one configured recipient without duplicate value', async () => {
    const setup = buildHarness();
    setup.findProgram.mockResolvedValue({
      id: 'program-1',
      enabled: true,
      inviterRewardKopecks: 2_000,
      inviteeRewardKopecks: null,
      currency: 'RUB',
      updatedAt: new Date('2026-08-31T00:00:00.000Z'),
    });

    const result = await setup.service.planIssuance({
      ...validDto(),
      legacy_claimed_inviter_reward_kopecks: 2_000,
      legacy_claimed_invitee_reward_kopecks: 0,
    });

    expect(result.intendedIssuance?.rewards).toEqual([
      expect.objectContaining({
        slot: 'inviter',
        recipientClientId: 'client-referrer-7',
        amountKopecks: 2_000,
      }),
    ]);
    expect(result.intendedIssuance?.aggregateLiabilityKopecks).toBe(2_000);
    expect(result.shadowDivergences).toBe(0);
  });

  it('freezes a percentage discount with an explicit maximum liability', async () => {
    const setup = buildHarness();
    setup.findProgram.mockResolvedValue({
      id: 'program-1',
      enabled: true,
      inviterRewardKopecks: null,
      inviteeRewardKopecks: null,
      inviterRewardPercentBasisPoints: 1_000,
      inviteeRewardPercentBasisPoints: null,
      inviterRewardLiabilityCapKopecks: 4_000,
      inviteeRewardLiabilityCapKopecks: null,
      currency: 'RUB',
      updatedAt: new Date('2026-08-31T00:00:00.000Z'),
    });

    const result = await setup.service.planIssuance({
      ...validDto(),
      legacy_claimed_inviter_reward_kopecks: 4_000,
      legacy_claimed_invitee_reward_kopecks: 0,
    });

    expect(result.intendedIssuance?.rewards).toEqual([
      expect.objectContaining({
        slot: 'inviter',
        denomination: 'PERCENT_DISCOUNT',
        amountKopecks: null,
        percentBasisPoints: 1_000,
        liabilityCapKopecks: 4_000,
      }),
    ]);
    expect(result.intendedIssuance?.aggregateLiabilityKopecks).toBe(4_000);
  });

  it('converges retry, restart, and distinct initiators to one issuance identity', async () => {
    const first = buildHarness();
    const restarted = buildHarness();

    await first.service.planIssuance(validDto());
    await first.service.planIssuance({
      ...validDto(),
      initiator: 'scheduled_convergence',
    });
    await restarted.service.planIssuance({
      ...validDto(),
      initiator: 'admin_convergence',
    });

    expect(first.planShadow.mock.calls[1]?.[0]).toEqual(
      first.planShadow.mock.calls[0]?.[0],
    );
    expect(restarted.planShadow.mock.calls[0]?.[0]).toEqual(
      first.planShadow.mock.calls[0]?.[0],
    );
  });

  it('rejects wrong-tenant, merged, self, held, or guard-unavailable identity', async () => {
    const wrongTenant = buildHarness();
    wrongTenant.findMany.mockResolvedValue([exactLinks()[0]]);
    await expect(
      wrongTenant.service.planIssuance(validDto()),
    ).resolves.toMatchObject({ outcome: 'identity_unresolved' });
    expect(wrongTenant.planShadow).not.toHaveBeenCalled();

    const merged = buildHarness();
    merged.findMany.mockResolvedValue([
      exactLinks()[0],
      {
        ...exactLinks()[1],
        client: { id: 'client-referred-8', mergedIntoClientId: 'winner' },
      },
    ]);
    await expect(
      merged.service.planIssuance(validDto()),
    ).resolves.toMatchObject({ outcome: 'identity_unresolved' });

    const self = buildHarness();
    self.findMany.mockResolvedValue([
      exactLinks()[0],
      {
        ...exactLinks()[1],
        client: { id: 'client-referrer-7', mergedIntoClientId: null },
      },
    ]);
    await expect(self.service.planIssuance(validDto())).resolves.toMatchObject({
      outcome: 'identity_unresolved',
    });

    for (const decision of [
      { allowed: false, reasonCode: CLIENT_IDENTITY_UNRESOLVED },
      { allowed: false, reasonCode: CLIENT_IDENTITY_GUARD_UNAVAILABLE },
    ]) {
      const held = buildHarness();
      held.checkCrmClientRegistrationGuard.mockResolvedValueOnce(decision);
      await expect(
        held.service.planIssuance(validDto()),
      ).resolves.toMatchObject({
        outcome:
          decision.reasonCode === CLIENT_IDENTITY_UNRESOLVED
            ? 'identity_unresolved'
            : 'identity_guard_unavailable',
      });
      expect(held.planShadow).not.toHaveBeenCalled();
    }
  });

  it('requires a successful canonical qualified resolution and exact recipients', async () => {
    for (const change of [
      { status: 'pending' },
      { referredClientId: null },
      { resolutionExecutionId: null },
      { resolutionExecution: null },
      {
        resolutionExecution: {
          ...qualifiedReferral('unused').resolutionExecution,
          state: 'NOT_EXECUTED',
        },
      },
      {
        resolutionExecution: {
          ...qualifiedReferral('unused').resolutionExecution,
          actionClass: 'legacy_direct_resolution',
        },
      },
    ]) {
      const setup = buildHarness();
      setup.findReferral.mockImplementation((args: ReferralQuery) =>
        Promise.resolve({
          ...qualifiedReferral(args.where.tenantId_identityHash.identityHash),
          ...change,
        }),
      );

      await expect(
        setup.service.planIssuance(validDto()),
      ).resolves.toMatchObject({ outcome: 'referral_not_qualified' });
      expect(setup.planShadow).not.toHaveBeenCalled();
    }
  });

  it('rejects a referral that already has its one issuance', async () => {
    const setup = buildHarness();
    setup.findReferral.mockImplementation((args: ReferralQuery) =>
      Promise.resolve({
        ...qualifiedReferral(args.where.tenantId_identityHash.identityHash),
        rewardIssuance: { id: 'existing-issuance' },
      }),
    );

    await expect(setup.service.planIssuance(validDto())).resolves.toMatchObject(
      {
        outcome: 'reward_already_issued',
      },
    );
    expect(setup.planShadow).not.toHaveBeenCalled();
    expect(setup.findProgram).not.toHaveBeenCalled();
  });

  it('enforces server-derived per-reward and aggregate caps', async () => {
    for (const amounts of [
      { inviterRewardKopecks: 50_001, inviteeRewardKopecks: 1_000 },
      { inviterRewardKopecks: 50_000, inviteeRewardKopecks: 50_001 },
    ]) {
      const setup = buildHarness();
      setup.findProgram.mockResolvedValue({
        id: 'program-1',
        enabled: true,
        ...amounts,
        currency: 'RUB',
        updatedAt: new Date('2026-08-31T00:00:00.000Z'),
      });

      await expect(
        setup.service.planIssuance(validDto()),
      ).resolves.toMatchObject({ outcome: 'reward_cap_exceeded' });
      expect(setup.planShadow).not.toHaveBeenCalled();
    }
  });

  it('fails closed for disabled, empty, negative, or malformed reward policy', async () => {
    for (const policy of [
      {
        enabled: false,
        inviterRewardKopecks: 1_500,
        inviteeRewardKopecks: 1_500,
        currency: 'RUB',
      },
      {
        enabled: true,
        inviterRewardKopecks: null,
        inviteeRewardKopecks: null,
        currency: 'RUB',
      },
      {
        enabled: true,
        inviterRewardKopecks: -1,
        inviteeRewardKopecks: 1_500,
        currency: 'RUB',
      },
      {
        enabled: true,
        inviterRewardKopecks: 1_500,
        inviteeRewardKopecks: 1_500,
        currency: 'rubles',
      },
    ]) {
      const setup = buildHarness();
      setup.findProgram.mockResolvedValue({
        id: 'program-1',
        ...policy,
        updatedAt: new Date('2026-08-31T00:00:00.000Z'),
      });
      await expect(
        setup.service.planIssuance(validDto()),
      ).resolves.toMatchObject({ outcome: 'reward_policy_invalid' });
      expect(setup.planShadow).not.toHaveBeenCalled();
    }
  });

  it('ignores forged reward authority and records legacy amount divergence only', async () => {
    const setup = buildHarness();
    const result = await setup.service.planIssuance({
      ...validDto(),
      legacy_claimed_inviter_reward_kopecks: 99_999,
      legacy_claimed_invitee_reward_kopecks: 88_888,
    });

    expect(result.shadowDivergences).toBe(2);
    expect(result.intendedIssuance?.rewards).toEqual([
      expect.objectContaining({ slot: 'inviter', amountKopecks: 1_500 }),
      expect.objectContaining({ slot: 'invitee', amountKopecks: 1_500 }),
    ]);
    expect(setup.planShadow.mock.calls[0]?.[0].input).toMatchObject({
      shadowDivergence: true,
      legacyClaimedInviterRewardKopecks: 99_999,
      legacyClaimedInviteeRewardKopecks: 88_888,
    });
  });

  it('rejects forged authority and caller-selected reward policy at the HTTP boundary', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => new BadRequestException(errors),
    });
    for (const forged of [
      { tenantId: 'tenant-b' },
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { policyDecision: 'ALLOW' },
      { approvalBindingHash: 'forged' },
      { executor: 'legacy.direct' },
      { inviter_reward_kopecks: 99_999 },
      { rewardPolicy: 'caller-policy' },
      { expiresAt: '2099-01-01T00:00:00.000Z' },
    ]) {
      await expect(
        pipe.transform(
          { ...validDto(), ...forged },
          { type: 'body', metatype: ReferralRewardIssueShadowDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('does not plan when Shadow is disabled', async () => {
    process.env.MAYA_REFERRAL_REWARD_ISSUE_SHADOW_ENABLED = 'false';
    const setup = buildHarness();

    await expect(setup.service.planIssuance(validDto())).resolves.toMatchObject(
      {
        outcome: 'shadow_disabled',
      },
    );
    expect(
      setup.bridgeSource.resolveTenantByIntegration,
    ).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });
});
