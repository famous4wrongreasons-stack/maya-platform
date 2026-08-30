import { createHash } from 'node:crypto';

import type { ActionExecution } from '@prisma/client';

import {
  ActionEngineRuntimeService,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import { CrmService } from '../crm/crm.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  LEGACY_LOYALTY_GRANT_ISSUE_SHADOW_BRIDGE_CONTRACT,
  LegacyLoyaltyGrantIssueShadowDto,
} from './dto/legacy-loyalty-grant-issue-shadow.dto';
import { LegacyLoyaltyGrantIssueShadowService } from './legacy-loyalty-grant-issue-shadow.service';

function hash(parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\u001f')).digest('hex');
}

const REQUEST_IDENTITY = hash([
  'p4-03.issue-loyalty-redemption-grant.request.v1',
  'tenant-a',
  'client-canonical-7',
  'request-9001',
]);

const validDto = (): LegacyLoyaltyGrantIssueShadowDto => ({
  contract: LEGACY_LOYALTY_GRANT_ISSUE_SHADOW_BRIDGE_CONTRACT,
  provider: 'yclients',
  external_company_id: 'company-42',
  external_client_id: '7007',
  initiator_kind: 'telegram_client',
  caller_request_id: 'request-9001',
  service_id: 'service-spa',
  legacy_claimed_service_title: 'SPA для лица',
  legacy_claimed_points: 1200,
});

function buildHarness() {
  const planShadow: jest.MockedFunction<
    ActionEngineRuntimeService['planShadow']
  > = jest.fn((request: TrustedActionExecutionRequestV1) => {
    void request;
    return Promise.resolve({
      id: 'execution-grant-issue-1',
    } as ActionExecution);
  });
  const clientFindUnique = jest.fn().mockResolvedValue({
    unlinkedAt: null,
    client: {
      id: 'client-canonical-7',
      userId: 'user-7',
      mergedIntoClientId: null,
      user: { status: 'active' },
    },
  });
  const accountFindUnique = jest.fn().mockResolvedValue({
    id: 'account-7',
    balance: 1500,
    membership: { status: 'active' },
  });
  const grantFindMany = jest.fn().mockResolvedValue([]);
  const getExternalProviderKey = jest.fn().mockResolvedValue('yclients');
  const getServices = jest.fn().mockResolvedValue([
    {
      id: 'service-spa',
      name: 'SPA для лица',
      price: 1200,
      duration_minutes: 40,
      currency: 'RUB',
    },
    {
      id: 'service-mask',
      name: 'Черная маска',
      price: 800,
      duration_minutes: 30,
      currency: 'RUB',
    },
  ]);
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
  const service = new LegacyLoyaltyGrantIssueShadowService(
    { planShadow } as unknown as ActionEngineRuntimeService,
    {
      crmClientLink: { findUnique: clientFindUnique },
      loyaltyAccount: { findUnique: accountFindUnique },
      loyaltyRedemptionGrant: { findMany: grantFindMany },
    } as unknown as PrismaService,
    {
      getExternalProviderKey,
      getServices,
    } as unknown as CrmService,
    bridgeSource as unknown as BridgeSourceService,
    { runAsSystemTenant } as unknown as TenantContextService,
  );

  return {
    service,
    planShadow,
    clientFindUnique,
    accountFindUnique,
    grantFindMany,
    getExternalProviderKey,
    getServices,
    bridgeSource,
    runAsSystemTenant,
  };
}

describe('LegacyLoyaltyGrantIssueShadowService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      MAYA_LEGACY_LOYALTY_GRANT_ISSUE_SHADOW_ENABLED: 'true',
      MAYA_LEGACY_LOYALTY_GRANT_PER_GRANT_CAP_POINTS: '2000',
      MAYA_LEGACY_LOYALTY_GRANT_TTL_DAYS: '14',
      MAYA_LEGACY_LOYALTY_GRANT_ALLOWED_SERVICE_IDS: 'service-spa,service-mask',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('converges Telegram and PWA candidates onto one request/client/service identity', async () => {
    const telegram = buildHarness();
    const pwa = buildHarness();
    const pwaDto = validDto();
    pwaDto.initiator_kind = 'pwa_client';

    const telegramResult = await telegram.service.planIssue(validDto());
    const pwaResult = await pwa.service.planIssue(pwaDto);

    expect(telegramResult).toEqual(pwaResult);
    expect(telegramResult).toMatchObject({
      outcome: 'planned',
      actionExecutionId: 'execution-grant-issue-1',
      shadowDivergences: 0,
      intendedMutation: {
        model: 'LoyaltyRedemptionGrant',
        serviceRef: 'yclients:service-spa',
        points: 1200,
        ttlDays: 14,
        issueExecutionBindingRequired: true,
        codeMaterialGenerated: false,
        balanceMutation: false,
      },
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    });
    const [telegramRequest] = telegram.planShadow.mock.calls[0];
    const [pwaRequest] = pwa.planShadow.mock.calls[0];
    expect(pwaRequest).toEqual(telegramRequest);
    expect(telegramRequest).toMatchObject({
      tenantId: 'tenant-a',
      capability: 'loyalty.redemption-grant.issue.shadow.v1',
      source: {
        type: 'legacy_bridge',
        sourceRef: 'legacy-loyalty:redemption-grant-issue',
        occurrenceScope: `p4-03:grant-issue:${REQUEST_IDENTITY}`,
      },
      targetRef: `grant-request:${REQUEST_IDENTITY}`,
      input: {
        canonicalClientId: 'client-canonical-7',
        requestIdentityHash: REQUEST_IDENTITY,
        serviceRef: 'yclients:service-spa',
        servicePoints: 1200,
        legacyClaimedPoints: 1200,
        availableBalancePoints: 1500,
        grantDecision: 'issue',
        grantPolicy: 'legacy-one-time-service-grant.v1',
        catalogPolicyVersion: 'server-redeemable-service-allowlist.v1',
        ttlDays: 14,
        perGrantCapPoints: 2000,
        serviceEligibility: 'allowed',
        balanceDecision: 'sufficient',
        capDecision: 'within_cap',
        existingGrantDecision: 'none',
        authorizationEvidence: 'trusted_shadow_candidate_only',
        divergenceCodes: [],
      },
      callerIdempotency: {
        scope: 'p4-03.issue-loyalty-redemption-grant.shadow',
        key: REQUEST_IDENTITY,
      },
    });
  });

  it('fails closed for an unmapped, merged, inactive, or cross-tenant client', async () => {
    const setup = buildHarness();
    setup.clientFindUnique.mockResolvedValue(null);

    await expect(setup.service.planIssue(validDto())).resolves.toMatchObject({
      outcome: 'identity_unresolved',
      actionExecutionId: null,
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    });
    expect(setup.getServices).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('requires an active membership and canonical account balance', async () => {
    const setup = buildHarness();
    setup.accountFindUnique.mockResolvedValue({
      id: 'account-7',
      balance: 1500,
      membership: { status: 'revoked' },
    });

    await expect(setup.service.planIssue(validDto())).resolves.toMatchObject({
      outcome: 'identity_unresolved',
      actionExecutionId: null,
    });
    expect(setup.getServices).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('requires an exact external provider and catalog service', async () => {
    const setup = buildHarness();
    setup.getExternalProviderKey.mockResolvedValue('other-provider');

    await expect(setup.service.planIssue(validDto())).resolves.toMatchObject({
      outcome: 'evidence_unresolved',
      actionExecutionId: null,
    });
    expect(setup.getServices).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('uses server catalog price and title rather than legacy claims', async () => {
    const setup = buildHarness();
    const dto = validDto();
    dto.legacy_claimed_service_title = 'Другая услуга';
    dto.legacy_claimed_points = 1000;

    const result = await setup.service.planIssue(dto);

    expect(result).toMatchObject({
      outcome: 'planned',
      shadowDivergences: 2,
      intendedMutation: { points: 1200 },
    });
    expect(setup.planShadow.mock.calls[0]?.[0].input).toMatchObject({
      servicePoints: 1200,
      legacyClaimedPoints: 1000,
      grantDecision: 'issue',
      divergenceCodes: [
        'legacy_points_mismatch',
        'legacy_service_title_mismatch',
      ],
    });
  });

  it('plans no grant for insufficient balance, cap, or disallowed service', async () => {
    const setup = buildHarness();
    setup.accountFindUnique.mockResolvedValue({
      id: 'account-7',
      balance: 1000,
      membership: { status: 'active' },
    });
    process.env.MAYA_LEGACY_LOYALTY_GRANT_PER_GRANT_CAP_POINTS = '1100';
    process.env.MAYA_LEGACY_LOYALTY_GRANT_ALLOWED_SERVICE_IDS = 'service-mask';

    const result = await setup.service.planIssue(validDto());

    expect(result).toMatchObject({
      outcome: 'planned',
      shadowDivergences: 3,
      intendedMutation: null,
    });
    expect(setup.planShadow.mock.calls[0]?.[0].input).toMatchObject({
      grantDecision: 'do_not_issue',
      balanceDecision: 'insufficient',
      capDecision: 'exceeds_cap',
      serviceEligibility: 'not_allowed',
      divergenceCodes: [
        'insufficient_canonical_balance',
        'per_grant_cap_exceeded',
        'service_not_allowed',
      ],
    });
  });

  it('creates no second intent for an exact existing one-time grant', async () => {
    const setup = buildHarness();
    setup.grantFindMany.mockResolvedValue([
      {
        id: 'grant-7',
        clientId: 'client-canonical-7',
        serviceRef: 'yclients:service-spa',
        points: 1200,
        issueExecutionId: 'execution-grant-old',
        codeHash: 'stored-server-hash',
        expiresAt: new Date('2026-09-13T00:00:00.000Z'),
      },
    ]);

    const result = await setup.service.planIssue(validDto());

    expect(result).toMatchObject({
      outcome: 'planned',
      shadowDivergences: 1,
      intendedMutation: null,
      newPathValueMutations: 0,
    });
    expect(setup.planShadow.mock.calls[0]?.[0].input).toMatchObject({
      grantDecision: 'do_not_issue',
      existingGrantDecision: 'already_issued',
      divergenceCodes: ['canonical_grant_already_exists'],
    });
  });

  it('fails closed when one request is already bound to changed grant facts', async () => {
    const setup = buildHarness();
    setup.grantFindMany.mockResolvedValue([
      {
        id: 'grant-7',
        clientId: 'client-canonical-7',
        serviceRef: 'yclients:service-mask',
        points: 800,
        issueExecutionId: 'execution-grant-old',
        codeHash: 'stored-server-hash',
        expiresAt: new Date('2026-09-13T00:00:00.000Z'),
      },
    ]);

    await expect(setup.service.planIssue(validDto())).resolves.toMatchObject({
      outcome: 'evidence_unresolved',
      actionExecutionId: null,
    });
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('does not use route label to split idempotency or authorize issuance', async () => {
    const first = buildHarness();
    const changedTarget = buildHarness();
    const changedDto = validDto();
    changedDto.initiator_kind = 'pwa_client';
    changedDto.service_id = 'service-mask';
    changedDto.legacy_claimed_service_title = 'Черная маска';
    changedDto.legacy_claimed_points = 800;

    await first.service.planIssue(validDto());
    await changedTarget.service.planIssue(changedDto);

    const firstRequest = first.planShadow.mock.calls[0]?.[0];
    const changedRequest = changedTarget.planShadow.mock.calls[0]?.[0];
    expect(changedRequest.callerIdempotency).toEqual(
      firstRequest.callerIdempotency,
    );
    expect(changedRequest.source.occurrenceScope).toBe(
      firstRequest.source.occurrenceScope,
    );
    expect(changedRequest.input).not.toEqual(firstRequest.input);
  });
});
