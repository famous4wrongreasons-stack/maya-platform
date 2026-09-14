import { createHash } from 'node:crypto';

import type { ActionExecution } from '@prisma/client';

import {
  ActionEngineRuntimeService,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  LEGACY_LOYALTY_GRANT_CONSUME_SHADOW_BRIDGE_CONTRACT,
  LegacyLoyaltyGrantConsumeShadowDto,
} from './dto/legacy-loyalty-grant-consume-shadow.dto';
import { LegacyLoyaltyGrantConsumeShadowService } from './legacy-loyalty-grant-consume-shadow.service';
import {
  issueLoyaltyRedemptionClaim,
  loyaltyRedemptionClaimLookup,
} from './loyalty-redemption-claim.contract';

const CODE_PEPPER = 'test-only-code-pepper-'.padEnd(64, 'x');
const RAW_CODE = 'LOY-ONE-TIME-8008';
const NOW = new Date('2026-08-30T12:00:00.000Z');

function hash(parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\u001f')).digest('hex');
}

function codeHash(code: string): string {
  return loyaltyRedemptionClaimLookup(CODE_PEPPER, code);
}

const LOGICAL_IDENTITY = hash([
  'p4-03.consume-loyalty-redemption-grant.identity.v1',
  'tenant-a',
  'grant-8',
  'legacy-one-time-grant-consume.v1',
]);

const validDto = (): LegacyLoyaltyGrantConsumeShadowDto => ({
  contract: LEGACY_LOYALTY_GRANT_CONSUME_SHADOW_BRIDGE_CONTRACT,
  provider: 'yclients',
  external_company_id: 'company-42',
  requester_identity_provider: 'telegram',
  external_requester_id: '8008',
  initiator_kind: 'telegram_cashier',
  redemption_code: RAW_CODE,
  legacy_claimed_points: 1200,
  legacy_claimed_balance_points: 1500,
  legacy_claimed_used: false,
  legacy_claimed_expired: false,
});

function canonicalGrant() {
  return {
    id: 'grant-8',
    tenantId: 'tenant-a',
    clientId: 'client-8',
    codeHash: codeHash(RAW_CODE),
    serviceRef: 'yclients:service-spa',
    points: 1200,
    issuedAt: new Date('2026-08-29T12:00:00.000Z'),
    expiresAt: new Date('2026-09-13T12:00:00.000Z'),
    issueExecutionId: 'execution-issue-8',
    issueExecution: {
      id: 'execution-issue-8',
      tenantId: 'tenant-a',
      actionClass: 'issue_loyalty_redemption_grant',
      state: 'SUCCEEDED',
    },
    client: {
      id: 'client-8',
      mergedIntoClientId: null,
    },
    redemption: null,
    revocation: null,
  };
}

function buildHarness() {
  const planShadow: jest.MockedFunction<
    ActionEngineRuntimeService['planShadow']
  > = jest.fn((request: TrustedActionExecutionRequestV1) => {
    void request;
    return Promise.resolve({
      id: 'execution-grant-consume-1',
    } as ActionExecution);
  });
  const requesterFindUnique = jest.fn().mockResolvedValue({
    user: { id: 'owner-8', status: 'active' },
    membership: {
      id: 'membership-owner-8',
      role: 'business_owner',
      status: 'active',
      branchId: null,
    },
  });
  const grantFindUnique = jest.fn().mockResolvedValue(canonicalGrant());
  const accountFindUnique = jest.fn().mockResolvedValue({
    id: 'account-8',
    balance: 1500,
  });
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
  const service = new LegacyLoyaltyGrantConsumeShadowService(
    { planShadow } as unknown as ActionEngineRuntimeService,
    {
      authIdentity: { findUnique: requesterFindUnique },
      loyaltyRedemptionGrant: { findUnique: grantFindUnique },
      loyaltyAccount: { findUnique: accountFindUnique },
    } as unknown as PrismaService,
    bridgeSource as unknown as BridgeSourceService,
    { runAsSystemTenant } as unknown as TenantContextService,
  );

  return {
    service,
    planShadow,
    requesterFindUnique,
    grantFindUnique,
    accountFindUnique,
    bridgeSource,
    runAsSystemTenant,
  };
}

describe('LegacyLoyaltyGrantConsumeShadowService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    process.env = {
      ...originalEnv,
      MAYA_LEGACY_LOYALTY_GRANT_CONSUME_SHADOW_ENABLED: 'true',
      MAYA_LEGACY_LOYALTY_GRANT_CONSUME_MAX_POINTS: '2000',
      MAYA_LEGACY_LOYALTY_GRANT_CONSUME_CASHIER_USER_IDS: 'cashier-8',
      MAYA_LOYALTY_REDEMPTION_CODE_PEPPER: CODE_PEPPER,
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = originalEnv;
  });

  it('converges Telegram and panel onto one grant claim without persisting bearer material', async () => {
    const telegram = buildHarness();
    const panel = buildHarness();
    const panelDto = validDto();
    panelDto.initiator_kind = 'panel_cashier';
    panelDto.redemption_code = RAW_CODE.toLowerCase();

    const telegramResult = await telegram.service.planConsume(validDto());
    const panelResult = await panel.service.planConsume(panelDto);

    expect(panelResult).toEqual(telegramResult);
    expect(telegramResult).toMatchObject({
      outcome: 'planned',
      actionExecutionId: 'execution-grant-consume-1',
      shadowDivergences: 0,
      intendedMutation: {
        redemptionModel: 'LoyaltyRedemption',
        ledgerModel: 'LoyaltyTransaction',
        grantId: 'grant-8',
        serviceRef: 'yclients:service-spa',
        points: 1200,
        balanceDeltaPoints: -1200,
        consumeExecutionBindingRequired: true,
        oneTimeClaimRequired: true,
        providerProjectionEvaluated: false,
        writesPerformed: false,
      },
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    });
    const [telegramRequest] = telegram.planShadow.mock.calls[0];
    const [panelRequest] = panel.planShadow.mock.calls[0];
    expect(panelRequest).toEqual(telegramRequest);
    expect(telegramRequest).toMatchObject({
      tenantId: 'tenant-a',
      capability: 'loyalty.redemption-grant.consume.shadow.v1',
      source: {
        type: 'legacy_bridge',
        sourceRef: 'legacy-loyalty:redemption-grant-consume',
        occurrenceScope: `p4-03:grant-consume:${LOGICAL_IDENTITY}`,
        actorUserId: 'owner-8',
      },
      input: {
        canonicalGrantId: 'grant-8',
        canonicalClientId: 'client-8',
        requesterRole: 'business_owner',
        requesterAuthority: 'administrative_role',
        serviceRef: 'yclients:service-spa',
        grantPoints: 1200,
        availableBalancePoints: 1500,
        consumeDecision: 'consume',
        perRedemptionCapPoints: 2000,
        expiryDecision: 'unexpired',
        balanceDecision: 'sufficient',
        capDecision: 'within_cap',
        existingRedemptionDecision: 'none',
        providerProjectionDecision: 'not_evaluated_in_shadow',
        authorizationEvidence: 'server_resolved_cashier_or_admin',
        divergenceCodes: [],
      },
      callerIdempotency: {
        scope: 'p4-03.consume-loyalty-redemption-grant.shadow',
        key: LOGICAL_IDENTITY,
      },
    });
    expect(JSON.stringify(telegramRequest)).not.toContain(RAW_CODE);
    expect(JSON.stringify(telegramRequest.input)).not.toContain(
      codeHash(RAW_CODE),
    );
  });

  it('resolves the bearer only through a tenant-scoped server HMAC claim', async () => {
    const setup = buildHarness();

    await setup.service.planConsume(validDto());

    expect(setup.grantFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_codeHash: {
            tenantId: 'tenant-a',
            codeHash: codeHash(RAW_CODE),
          },
        },
      }),
    );
  });

  it('accepts the exact issue artifact after a service restart without storing raw bearer material', async () => {
    const claim = issueLoyaltyRedemptionClaim();
    const issuedGrant = {
      ...canonicalGrant(),
      codeHash: codeHash(claim.bearer),
    };
    const firstProcess = buildHarness();
    const restartedProcess = buildHarness();
    firstProcess.grantFindUnique.mockResolvedValue(issuedGrant);
    restartedProcess.grantFindUnique.mockResolvedValue(issuedGrant);
    const dto = validDto();
    dto.redemption_code = claim.bearer;

    const beforeRestart = await firstProcess.service.planConsume(dto);
    const afterRestart = await restartedProcess.service.planConsume(dto);

    expect(afterRestart).toEqual(beforeRestart);
    expect(afterRestart).toMatchObject({
      outcome: 'planned',
      intendedMutation: { grantId: 'grant-8' },
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    });
    expect(restartedProcess.grantFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_codeHash: {
            tenantId: 'tenant-a',
            codeHash: issuedGrant.codeHash,
          },
        },
      }),
    );
    expect(JSON.stringify(issuedGrant)).not.toContain(claim.bearer);
    expect(
      JSON.stringify(restartedProcess.planShadow.mock.calls[0]?.[0]),
    ).not.toContain(claim.bearer);
  });

  it('fails closed for a wrong bearer or the same bearer under another tenant', async () => {
    const wrongBearer = buildHarness();
    wrongBearer.grantFindUnique.mockImplementation(
      (query: {
        where: { tenantId_codeHash: { tenantId: string; codeHash: string } };
      }) =>
        Promise.resolve(
          query.where.tenantId_codeHash.codeHash === codeHash(RAW_CODE)
            ? canonicalGrant()
            : null,
        ),
    );
    const wrongCodeDto = validDto();
    wrongCodeDto.redemption_code = 'LOY-WRONG-BEARER-9009';

    await expect(
      wrongBearer.service.planConsume(wrongCodeDto),
    ).resolves.toMatchObject({
      outcome: 'evidence_unresolved',
      actionExecutionId: null,
      newPathProviderWrites: 0,
    });
    expect(wrongBearer.planShadow).not.toHaveBeenCalled();

    const wrongTenant = buildHarness();
    wrongTenant.bridgeSource.resolveTenantByIntegration.mockResolvedValue({
      tenantId: 'tenant-b',
      slug: 'tenant-b',
      resolvedBy: 'integration',
    });
    wrongTenant.grantFindUnique.mockResolvedValue(null);

    await expect(
      wrongTenant.service.planConsume(validDto()),
    ).resolves.toMatchObject({
      outcome: 'evidence_unresolved',
      actionExecutionId: null,
    });
    expect(wrongTenant.grantFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_codeHash: {
            tenantId: 'tenant-b',
            codeHash: codeHash(RAW_CODE),
          },
        },
      }),
    );
  });

  it('fails closed for an unmapped, inactive, or cross-tenant requester', async () => {
    const setup = buildHarness();
    setup.requesterFindUnique.mockResolvedValue(null);

    await expect(setup.service.planConsume(validDto())).resolves.toMatchObject({
      outcome: 'identity_unresolved',
      actionExecutionId: null,
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    });
    expect(setup.grantFindUnique).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('accepts a staff cashier only from the exact server-owned allowlist', async () => {
    const denied = buildHarness();
    denied.requesterFindUnique.mockResolvedValue({
      user: { id: 'other-staff', status: 'active' },
      membership: {
        id: 'membership-staff',
        role: 'staff',
        status: 'active',
        branchId: 'branch-a',
      },
    });
    await expect(denied.service.planConsume(validDto())).resolves.toMatchObject(
      { outcome: 'policy_unresolved', actionExecutionId: null },
    );
    expect(denied.planShadow).not.toHaveBeenCalled();

    const allowed = buildHarness();
    allowed.requesterFindUnique.mockResolvedValue({
      user: { id: 'cashier-8', status: 'active' },
      membership: {
        id: 'membership-cashier',
        role: 'staff',
        status: 'active',
        branchId: 'branch-a',
      },
    });
    await expect(
      allowed.service.planConsume(validDto()),
    ).resolves.toMatchObject({
      outcome: 'planned',
      intendedMutation: { grantId: 'grant-8' },
    });
    expect(allowed.planShadow.mock.calls[0]?.[0]).toMatchObject({
      source: { actorUserId: 'cashier-8' },
      input: {
        requesterRole: 'staff',
        requesterAuthority: 'server_cashier_allowlist',
      },
    });
  });

  it('requires an exact succeeded issue binding and active canonical account', async () => {
    const setup = buildHarness();
    setup.grantFindUnique.mockResolvedValue({
      ...canonicalGrant(),
      issueExecution: {
        id: 'execution-issue-8',
        tenantId: 'tenant-a',
        actionClass: 'some_other_action',
        state: 'SUCCEEDED',
      },
    });

    await expect(setup.service.planConsume(validDto())).resolves.toMatchObject({
      outcome: 'evidence_unresolved',
      actionExecutionId: null,
    });
    expect(setup.accountFindUnique).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('plans no mutation for expiry, insufficient balance, or cap denial', async () => {
    const setup = buildHarness();
    setup.grantFindUnique.mockResolvedValue({
      ...canonicalGrant(),
      expiresAt: new Date('2026-08-30T11:00:00.000Z'),
    });
    setup.accountFindUnique.mockResolvedValue({
      id: 'account-8',
      balance: 900,
    });
    process.env.MAYA_LEGACY_LOYALTY_GRANT_CONSUME_MAX_POINTS = '1000';
    const dto = validDto();
    dto.legacy_claimed_balance_points = 900;

    const result = await setup.service.planConsume(dto);

    expect(result).toMatchObject({
      outcome: 'planned',
      shadowDivergences: 4,
      intendedMutation: null,
    });
    expect(setup.planShadow.mock.calls[0]?.[0].input).toMatchObject({
      consumeDecision: 'do_not_consume',
      expiryDecision: 'expired',
      balanceDecision: 'insufficient',
      capDecision: 'exceeds_cap',
      divergenceCodes: [
        'canonical_grant_expired',
        'insufficient_canonical_balance',
        'legacy_expiry_mismatch',
        'per_redemption_cap_exceeded',
      ],
    });
  });

  it('fails closed before planning when the grant has an append-only revocation', async () => {
    const setup = buildHarness();
    setup.grantFindUnique.mockResolvedValue({
      ...canonicalGrant(),
      revocation: { id: 'revocation-8' },
    });

    await expect(setup.service.planConsume(validDto())).resolves.toMatchObject({
      outcome: 'evidence_unresolved',
      actionExecutionId: null,
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    });
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('recognizes one exact existing claim and rejects contradictory reuse', async () => {
    const exact = buildHarness();
    exact.grantFindUnique.mockResolvedValue({
      ...canonicalGrant(),
      redemption: {
        id: 'redemption-8',
        grantId: 'grant-8',
        actionExecutionId: 'execution-consume-old',
        redeemedAt: new Date('2026-08-30T10:00:00.000Z'),
        legacySourceRef: LOGICAL_IDENTITY,
        actionExecution: {
          id: 'execution-consume-old',
          tenantId: 'tenant-a',
          actionClass: 'consume_loyalty_redemption_grant',
          state: 'SUCCEEDED',
        },
      },
    });
    const exactDto = validDto();
    exactDto.legacy_claimed_used = true;

    await expect(exact.service.planConsume(exactDto)).resolves.toMatchObject({
      outcome: 'planned',
      shadowDivergences: 1,
      intendedMutation: null,
      newPathValueMutations: 0,
    });
    expect(exact.planShadow.mock.calls[0]?.[0].input).toMatchObject({
      existingRedemptionDecision: 'already_redeemed',
      consumeDecision: 'do_not_consume',
      divergenceCodes: ['canonical_grant_already_redeemed'],
    });

    const contradictory = buildHarness();
    contradictory.grantFindUnique.mockResolvedValue({
      ...canonicalGrant(),
      redemption: {
        id: 'redemption-8',
        grantId: 'grant-8',
        actionExecutionId: 'execution-consume-old',
        redeemedAt: new Date('2026-08-30T10:00:00.000Z'),
        legacySourceRef: 'another-logical-claim',
        actionExecution: {
          id: 'execution-consume-old',
          tenantId: 'tenant-a',
          actionClass: 'consume_loyalty_redemption_grant',
          state: 'SUCCEEDED',
        },
      },
    });
    await expect(
      contradictory.service.planConsume(validDto()),
    ).resolves.toMatchObject({
      outcome: 'evidence_unresolved',
      actionExecutionId: null,
    });
    expect(contradictory.planShadow).not.toHaveBeenCalled();
  });

  it('keeps one grant identity while changed requester evidence collides fail closed', async () => {
    const first = buildHarness();
    const changedRequester = buildHarness();
    changedRequester.requesterFindUnique.mockResolvedValue({
      user: { id: 'owner-other', status: 'active' },
      membership: {
        id: 'membership-owner-other',
        role: 'tenant_owner',
        status: 'active',
        branchId: null,
      },
    });

    await first.service.planConsume(validDto());
    await changedRequester.service.planConsume(validDto());

    const firstRequest = first.planShadow.mock.calls[0]?.[0];
    const changedRequest = changedRequester.planShadow.mock.calls[0]?.[0];
    expect(changedRequest.callerIdempotency).toEqual(
      firstRequest.callerIdempotency,
    );
    expect(changedRequest.source.occurrenceScope).toBe(
      firstRequest.source.occurrenceScope,
    );
    expect(changedRequest.input).not.toEqual(firstRequest.input);
  });

  it('treats legacy value/use/expiry assertions only as divergence evidence', async () => {
    const setup = buildHarness();
    const dto = validDto();
    dto.legacy_claimed_points = 1000;
    dto.legacy_claimed_balance_points = 1400;
    dto.legacy_claimed_used = true;
    dto.legacy_claimed_expired = true;

    const result = await setup.service.planConsume(dto);

    expect(result).toMatchObject({
      outcome: 'planned',
      shadowDivergences: 4,
      intendedMutation: { points: 1200, balanceDeltaPoints: -1200 },
    });
    expect(setup.planShadow.mock.calls[0]?.[0].input).toMatchObject({
      grantPoints: 1200,
      availableBalancePoints: 1500,
      consumeDecision: 'consume',
      divergenceCodes: [
        'legacy_balance_mismatch',
        'legacy_expiry_mismatch',
        'legacy_points_mismatch',
        'legacy_used_state_mismatch',
      ],
    });
  });
});
