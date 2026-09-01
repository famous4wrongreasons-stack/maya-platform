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
  REFERRAL_REWARD_FULFILL_SHADOW_BRIDGE_CONTRACT,
  ReferralRewardFulfillShadowDto,
} from './dto/referral-reward-fulfill-shadow.dto';
import { referralRewardClaimLookup } from './referral-reward-claim.contract';
import { ReferralRewardFulfillShadowService } from './referral-reward-fulfill-shadow.service';

const CLAIM_SECRET = 'p4-04-fulfillment-test-secret-000000000000';
const RAW_CLAIM = 'MAYA-RR-ABC12345';

const validDto = (): ReferralRewardFulfillShadowDto => ({
  contract: REFERRAL_REWARD_FULFILL_SHADOW_BRIDGE_CONTRACT,
  initiator: 'admin_claim',
  provider: 'yclients',
  external_company_id: 'company-42',
  requester_identity_provider: 'telegram',
  external_requester_id: 'provider-requester-1',
  recipient_external_client_id: 'provider-recipient-8',
  reward_claim: RAW_CLAIM,
  legacy_claimed_value_kopecks: 1_500,
  legacy_claimed_fulfilled: false,
});

function issuedReward() {
  const issuedAt = new Date('2026-09-01T00:00:00.000Z');
  return {
    id: 'reward-1',
    tenantId: 'tenant-a',
    issuanceId: 'issuance-1',
    recipientClientId: 'client-referred-8',
    rewardSlot: 'invitee',
    codeHash: referralRewardClaimLookup(CLAIM_SECRET, RAW_CLAIM),
    amountKopecks: 1_500,
    currency: 'RUB',
    percentBasisPoints: null,
    issuedAt,
    expiresAt: new Date('2099-10-01T00:00:00.000Z'),
    fulfillment: null,
    recipient: {
      id: 'client-referred-8',
      userId: 'recipient-user-8',
      mergedIntoClientId: null,
      crmLinks: [{ externalId: 'provider-recipient-8' }],
    },
    issuance: {
      id: 'issuance-1',
      tenantId: 'tenant-a',
      referralId: 'referral-1',
      actionExecutionId: 'execution-issuance-1',
      policySnapshotHash: 'issuance-policy-hash',
      issuedAt,
      referral: { id: 'referral-1', status: 'qualified' },
      actionExecution: {
        id: 'execution-issuance-1',
        tenantId: 'tenant-a',
        actionClass: 'issue_referral_rewards',
        state: 'SUCCEEDED',
        policyDecision: 'ALLOW',
      },
    },
  };
}

function buildHarness() {
  const reward = issuedReward();
  const planShadow: jest.MockedFunction<
    ActionEngineRuntimeService['planShadow']
  > = jest.fn((request: TrustedActionExecutionRequestV1) => {
    void request;
    return Promise.resolve({
      id: 'execution-fulfillment-1',
    } as ActionExecution);
  });
  const findReward = jest.fn(
    (args: { where: { tenantId_codeHash: { codeHash: string } } }) =>
      Promise.resolve(
        args.where.tenantId_codeHash.codeHash === reward.codeHash
          ? reward
          : null,
      ),
  );
  const findRequester = jest.fn().mockResolvedValue({
    user: { id: 'requester-1', status: 'active' },
    membership: {
      id: 'membership-1',
      role: 'tenant_owner',
      status: 'active',
      branchId: null,
    },
  });
  const findAccount = jest.fn().mockResolvedValue({
    id: 'account-8',
    tenantId: 'tenant-a',
    clientId: 'client-referred-8',
    balance: 0,
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
  const service = new ReferralRewardFulfillShadowService(
    { planShadow } as unknown as ActionEngineRuntimeService,
    {
      authIdentity: { findUnique: findRequester },
      referralReward: { findUnique: findReward },
      loyaltyAccount: { findUnique: findAccount },
    } as unknown as PrismaService,
    bridgeSource as unknown as BridgeSourceService,
    { runAsSystemTenant } as unknown as TenantContextService,
    { checkCrmClientRegistrationGuard } as unknown as ClientIdentityService,
  );

  return {
    service,
    reward,
    planShadow,
    findReward,
    findRequester,
    findAccount,
    checkCrmClientRegistrationGuard,
    bridgeSource,
  };
}

describe('ReferralRewardFulfillShadowService', () => {
  const originalEnvironment = {
    enabled: process.env.MAYA_REFERRAL_REWARD_FULFILL_SHADOW_ENABLED,
    secret: process.env.MAYA_REFERRAL_REWARD_CLAIM_SECRET,
    cashier: process.env.MAYA_REFERRAL_REWARD_FULFILL_CASHIER_USER_IDS,
  };

  beforeEach(() => {
    process.env.MAYA_REFERRAL_REWARD_FULFILL_SHADOW_ENABLED = 'true';
    process.env.MAYA_REFERRAL_REWARD_CLAIM_SECRET = CLAIM_SECRET;
    process.env.MAYA_REFERRAL_REWARD_FULFILL_CASHIER_USER_IDS = '';
  });

  afterAll(() => {
    for (const [key, value] of Object.entries({
      MAYA_REFERRAL_REWARD_FULFILL_SHADOW_ENABLED: originalEnvironment.enabled,
      MAYA_REFERRAL_REWARD_CLAIM_SECRET: originalEnvironment.secret,
      MAYA_REFERRAL_REWARD_FULFILL_CASHIER_USER_IDS:
        originalEnvironment.cashier,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('plans one exact local-only fulfillment with zero side effects', async () => {
    const setup = buildHarness();

    const result = await setup.service.planFulfillment(validDto());

    expect(result).toMatchObject({
      outcome: 'planned',
      actionExecutionId: 'execution-fulfillment-1',
      shadowDivergences: 0,
      intendedFulfillment: {
        model: 'ReferralRewardFulfillment',
        rewardId: 'reward-1',
        originatingReferralId: 'referral-1',
        recipientClientId: 'client-referred-8',
        loyaltyAccountId: 'account-8',
        rewardAmountKopecks: 1_500,
        currency: 'RUB',
        oneTimeClaimRequired: true,
        requesterAuthority: 'administrative_role',
        approvalRequirement: 'NONE_ACTOR_AUTHORIZED',
        providerBoundary: 'LOCAL_ONLY',
        unknownApplicable: false,
        valueApplication: 'REFERRAL_REWARD_CLAIM_ONLY',
        writesPerformed: false,
      },
      newPathFulfillments: 0,
      newPathLoyaltyValueMutations: 0,
      newPathProviderWrites: 0,
      newPathMessages: 0,
    });
    const [request] = setup.planShadow.mock.calls[0];
    expect(request).toMatchObject({
      tenantId: 'tenant-a',
      capability: 'referrals.referral-reward-fulfill.shadow.v1',
      source: {
        type: 'legacy_bridge',
        sourceRef: 'legacy-referral:fulfill-referral-reward',
        actorUserId: 'requester-1',
      },
      callerIdempotency: {
        scope: 'p4-04.fulfill-referral-reward.shadow',
      },
    });
    expect(request.input).not.toHaveProperty('reward_claim');
    expect(request.input).not.toHaveProperty('codeHash');
    expect(JSON.stringify(request)).not.toContain(RAW_CLAIM);
    expect(request.evidenceRefs).toHaveLength(7);
  });

  it('converges retry, restart, and concurrent claims to one logical identity', async () => {
    const first = buildHarness();
    const restarted = buildHarness();

    await Promise.all([
      first.service.planFulfillment(validDto()),
      first.service.planFulfillment(validDto()),
    ]);
    await restarted.service.planFulfillment(validDto());

    expect(first.planShadow.mock.calls[1]?.[0]).toEqual(
      first.planShadow.mock.calls[0]?.[0],
    );
    expect(restarted.planShadow.mock.calls[0]?.[0]).toEqual(
      first.planShadow.mock.calls[0]?.[0],
    );
  });

  it('fails closed for an already fulfilled reward or wrong bearer', async () => {
    const fulfilled = buildHarness();
    fulfilled.reward.fulfillment = {
      id: 'fulfillment-existing',
      actionExecutionId: 'execution-existing',
    };
    await expect(
      fulfilled.service.planFulfillment(validDto()),
    ).resolves.toMatchObject({ outcome: 'already_fulfilled' });
    expect(fulfilled.planShadow).not.toHaveBeenCalled();

    const wrongClaim = buildHarness();
    await expect(
      wrongClaim.service.planFulfillment({
        ...validDto(),
        reward_claim: 'MAYA-RR-WRONG999',
      }),
    ).resolves.toMatchObject({ outcome: 'reward_unresolved' });
    expect(wrongClaim.planShadow).not.toHaveBeenCalled();
  });

  it('rejects wrong tenant, recipient, held identity, and guard failure', async () => {
    const wrongTenant = buildHarness();
    wrongTenant.reward.tenantId = 'tenant-b';
    await expect(
      wrongTenant.service.planFulfillment(validDto()),
    ).resolves.toMatchObject({ outcome: 'reward_unresolved' });

    const wrongRecipient = buildHarness();
    wrongRecipient.reward.recipient.crmLinks = [
      { externalId: 'different-recipient' },
    ];
    await expect(
      wrongRecipient.service.planFulfillment(validDto()),
    ).resolves.toMatchObject({ outcome: 'reward_unresolved' });

    for (const decision of [
      { allowed: false, reasonCode: CLIENT_IDENTITY_UNRESOLVED },
      { allowed: false, reasonCode: CLIENT_IDENTITY_GUARD_UNAVAILABLE },
    ]) {
      const held = buildHarness();
      held.checkCrmClientRegistrationGuard.mockResolvedValueOnce(decision);
      await expect(
        held.service.planFulfillment(validDto()),
      ).resolves.toMatchObject({
        outcome:
          decision.reasonCode === CLIENT_IDENTITY_UNRESOLVED
            ? 'identity_unresolved'
            : 'identity_guard_unavailable',
      });
      expect(held.planShadow).not.toHaveBeenCalled();
    }
  });

  it('requires an exact canonical LoyaltyAccount and unexpired issued reward', async () => {
    const missingAccount = buildHarness();
    missingAccount.findAccount.mockResolvedValueOnce(null);
    await expect(
      missingAccount.service.planFulfillment(validDto()),
    ).resolves.toMatchObject({ outcome: 'loyalty_account_unresolved' });
    expect(missingAccount.planShadow).not.toHaveBeenCalled();

    const expired = buildHarness();
    expired.reward.issuedAt = new Date('2026-01-01T00:00:00.000Z');
    expired.reward.issuance.issuedAt = expired.reward.issuedAt;
    expired.reward.expiresAt = new Date('2026-02-01T00:00:00.000Z');
    await expect(
      expired.service.planFulfillment(validDto()),
    ).resolves.toMatchObject({ outcome: 'reward_expired' });
    expect(expired.planShadow).not.toHaveBeenCalled();
  });

  it('separates authenticated actor authority from the recipient value owner', async () => {
    const missingActor = buildHarness();
    missingActor.findRequester.mockResolvedValueOnce(null);
    await expect(
      missingActor.service.planFulfillment(validDto()),
    ).resolves.toMatchObject({ outcome: 'identity_unresolved' });

    const recipient = buildHarness();
    recipient.findRequester.mockResolvedValueOnce({
      user: { id: 'recipient-user-8', status: 'active' },
      membership: {
        id: 'recipient-membership',
        role: 'client',
        status: 'active',
        branchId: null,
      },
    });
    await expect(
      recipient.service.planFulfillment({
        ...validDto(),
        initiator: 'client_claim',
      }),
    ).resolves.toMatchObject({
      outcome: 'planned',
      intendedFulfillment: { requesterAuthority: 'reward_recipient' },
    });

    const forgedCashier = buildHarness();
    forgedCashier.findRequester.mockResolvedValueOnce({
      user: { id: 'cashier-not-allowlisted', status: 'active' },
      membership: {
        id: 'cashier-membership',
        role: 'manager',
        status: 'active',
        branchId: null,
      },
    });
    await expect(
      forgedCashier.service.planFulfillment({
        ...validDto(),
        initiator: 'cashier_claim',
      }),
    ).resolves.toMatchObject({ outcome: 'policy_unresolved' });
    expect(forgedCashier.planShadow).not.toHaveBeenCalled();
  });

  it('uses server-derived reward value and records caller comparison divergence only', async () => {
    const setup = buildHarness();
    const result = await setup.service.planFulfillment({
      ...validDto(),
      legacy_claimed_value_kopecks: 49_999,
      legacy_claimed_fulfilled: true,
    });

    expect(result).toMatchObject({
      outcome: 'planned',
      shadowDivergences: 2,
      intendedFulfillment: { rewardAmountKopecks: 1_500 },
    });
    expect(setup.planShadow.mock.calls[0]?.[0].input).toMatchObject({
      rewardAmountKopecks: 1_500,
      legacyClaimedValueKopecks: 49_999,
      legacyClaimedFulfilledDecision: 'already_fulfilled',
      divergenceCodes: ['legacy_value_mismatch', 'legacy_fulfillment_mismatch'],
    });
  });

  it('rejects caller-selected identity, policy, value, and execution authority at HTTP boundary', async () => {
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
      { canonicalRewardId: 'reward-forged' },
      { rewardAmountKopecks: 49_999 },
      { claimBindingHash: 'forged' },
      { fulfilled: true },
    ]) {
      await expect(
        pipe.transform(
          { ...validDto(), ...forged },
          { type: 'body', metatype: ReferralRewardFulfillShadowDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('does not plan when Shadow is disabled or the claim policy is unavailable', async () => {
    process.env.MAYA_REFERRAL_REWARD_FULFILL_SHADOW_ENABLED = 'false';
    const disabled = buildHarness();
    await expect(
      disabled.service.planFulfillment(validDto()),
    ).resolves.toMatchObject({ outcome: 'shadow_disabled' });
    expect(
      disabled.bridgeSource.resolveTenantByIntegration,
    ).not.toHaveBeenCalled();

    process.env.MAYA_REFERRAL_REWARD_FULFILL_SHADOW_ENABLED = 'true';
    process.env.MAYA_REFERRAL_REWARD_CLAIM_SECRET = 'short';
    const unavailable = buildHarness();
    await expect(
      unavailable.service.planFulfillment(validDto()),
    ).resolves.toMatchObject({ outcome: 'policy_unresolved' });
    expect(unavailable.planShadow).not.toHaveBeenCalled();
  });
});
