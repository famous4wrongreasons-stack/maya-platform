import { ConfigService } from '@nestjs/config';
import type { MarketingCampaignRecipient } from '@prisma/client';
import { EncryptionService } from '../encryption/encryption.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { clientChannelSubjectHash } from '../crm/client-channel-subject';
import type { BulkRoute } from '../marketing/canonical-bulk.contract';
import { CommunicationBulkPolicyService } from './communication-bulk-policy.service';

function fixture() {
  const now = new Date(),
    config = new ConfigService({
      CRM_ENCRYPTION_KEY: 'b35-unit-fixture-secret-not-production',
    }),
    encryption = new EncryptionService(config),
    context = new TenantContextService();
  const link = {
    id: 'link',
    tenantId: 'tenant',
    clientId: 'client',
    provider: 'telegram',
    revokedAt: null as Date | null,
    verificationVersion: 1,
    subjectHashVersion: 1,
    deliveryAddressEncrypted: encryption.encrypt('10001'),
    providerSubjectHash: clientChannelSubjectHash(
      encryption,
      'telegram',
      '10001',
    ),
    verificationEvidenceHash: 'a'.repeat(64),
  };
  const profile = {
    privacyConsentAt: now,
    marketingConsentAt: now as Date | null,
    notificationPreferencesJson: null as unknown,
  };
  const root = {
    id: 'bulk',
    confirmedAt: now,
    confirmedByUserId: 'owner',
    expiresAt: new Date(now.getTime() + 86400000),
  };
  const tenant = {
    id: 'tenant',
    status: 'active',
    defaultTimezone: 'UTC',
    planId: null,
    trialEndsAt: null,
    trialFullAccess: false,
    currentPeriodEnd: null,
    pastDueAt: null,
    graceEndsAt: null,
  };
  const history = {
    canonicalHistoryStartedAt: new Date(
      now.getTime() - 31 * 86400000,
    ) as Date | null,
  };
  const db = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
    client: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'client',
        tenantId: 'tenant',
        mergedIntoClientId: null,
        crmLinks: [],
      }),
    },
    customerProfile: { findUnique: jest.fn().mockResolvedValue(profile) },
    marketingCampaign: { findUniqueOrThrow: jest.fn().mockResolvedValue(root) },
    marketingPolicy: { findUnique: jest.fn().mockResolvedValue(history) },
    membership: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'owner-membership', role: 'tenant_owner' }),
    },
    clientConsentFact: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: 'consent-fact', decision: 'grant', effectiveAt: now },
        ]),
    },
    marketingCampaignRecipient: { findMany: jest.fn().mockResolvedValue([]) },
    marketingDeliveryAttempt: { findMany: jest.fn().mockResolvedValue([]) },
    clientChannelLink: {
      findUnique: jest.fn().mockResolvedValue(link),
      findMany: jest.fn().mockResolvedValue([link]),
    },
    clientWebPushEndpoint: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
    },
    devicePushToken: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        status: 'active',
        memberships: [{ id: 'membership' }],
      }),
    },
  };
  const endpoints = { resolveForDelivery: jest.fn().mockResolvedValue(null) };
  const entitlements = {
    resolveFeatureRequirements: jest.fn().mockResolvedValue({
      allowed: true,
      planId: null,
      requiredFeatures: [{ featureKey: 'notifications.core', enabled: true }],
    }),
  };
  const policy = new CommunicationBulkPolicyService(
    db as never,
    context,
    encryption,
    endpoints as never,
    entitlements as never,
    config,
  );
  const route: BulkRoute = {
    contract: 'maya.bulk-client-route/1',
    primary: 'telegram',
    link: {
      id: link.id,
      provider: link.provider,
      subjectHash: link.providerSubjectHash,
      verificationEvidenceHash: link.verificationEvidenceHash,
    },
    userId: null,
    webPushEndpoints: [],
    apnsDevices: [],
    policyVersion: 1,
  };
  const child = {
    id: 'child',
    tenantId: 'tenant',
    clientId: 'client',
    campaignId: 'bulk',
  } as MarketingCampaignRecipient;
  return {
    now,
    db,
    profile,
    root,
    tenant,
    history,
    link,
    route,
    child,
    endpoints,
    entitlements,
    policy,
    context,
    encryption,
    run: () =>
      context.runAsPublicTenant('tenant', () =>
        policy.current(db as never, child, route, 'b35:link:link'),
      ),
  };
}
describe('B35 fresh per-Client dispatch policy', () => {
  it('supports a verified Client without Maya User and returns safe current evidence', async () => {
    const f = fixture(),
      r = await f.run();
    expect(r.allowed).toBe(true);
    expect(r.proof).toMatchObject({
      tenantId: 'tenant',
      clientId: 'client',
      decision: 'ALLOW',
      marketingFact: 'consent-fact',
    });
    expect(JSON.stringify(r.proof)).not.toContain('10001');
    expect(f.db.$queryRaw).toHaveBeenCalled();
  });
  it('denies an invalidated grant despite audience, approval, preferences and stale positive profile timestamps', async () => {
    const f = fixture();
    f.db.clientConsentFact.findMany.mockResolvedValue([
      {
        id: 'bad-grant',
        decision: 'grant',
        effectiveAt: f.now,
        invalidation: { id: 'security-fact' },
      },
    ] as never);
    const result = await f.run();
    expect(result).toMatchObject({
      allowed: false,
      reason: 'CONSENT_NOT_GRANTED',
    });
    expect(f.endpoints.resolveForDelivery).not.toHaveBeenCalled();
  });
  it.each(['revoke', 'unknown'])(
    'a %s fact cannot be replaced by audience membership or a profile timestamp',
    async (decision) => {
      const f = fixture();
      f.db.clientConsentFact.findMany.mockResolvedValue([
        { decision, effectiveAt: f.now },
      ]);
      expect((await f.run()).reason).toBe('CONSENT_NOT_GRANTED');
    },
  );
  it('missing fact fails closed even with legacy consent timestamps', async () => {
    const f = fixture();
    f.db.clientConsentFact.findMany.mockResolvedValue([]);
    expect((await f.run()).allowed).toBe(false);
  });
  it('same-time contradictory facts are not treated as consent', async () => {
    const f = fixture();
    f.db.clientConsentFact.findMany.mockResolvedValue([
      { decision: 'grant', effectiveAt: f.now },
      { decision: 'revoke', effectiveAt: f.now },
    ]);
    expect((await f.run()).allowed).toBe(false);
  });
  it('a revoked profile projection blocks dispatch', async () => {
    const f = fixture();
    f.profile.marketingConsentAt = null;
    expect((await f.run()).reason).toBe('CONSENT_PROJECTION_UNAVAILABLE');
  });
  it('does not let owner approval override a marketing preference', async () => {
    const f = fixture();
    f.profile.notificationPreferencesJson = {
      version: 1,
      overrides: { marketing: false },
    };
    expect((await f.run()).reason).toBe('MARKETING_DISABLED');
  });
  it('unsupported preference version denies rather than inventing defaults', async () => {
    const f = fixture();
    f.profile.notificationPreferencesJson = { version: 9, overrides: {} };
    expect((await f.run()).allowed).toBe(false);
  });
  it('quiet hours use the tenant timezone', async () => {
    const f = fixture();
    const hour = f.now.getUTCHours();
    f.profile.notificationPreferencesJson = {
      version: 1,
      overrides: { quiet_from: hour, quiet_to: (hour + 1) % 24 },
    };
    expect((await f.run()).reason).toBe('QUIET_HOURS');
  });
  it('missing epoch cannot become invented legacy history', async () => {
    const f = fixture();
    f.history.canonicalHistoryStartedAt = null;
    expect((await f.run()).reason).toBe('FREQUENCY_HISTORY_UNAVAILABLE');
  });
  it.each(['week', '2weeks', 'month'])(
    'requires complete %s lookback',
    async (marketing_freq) => {
      const f = fixture();
      f.profile.notificationPreferencesJson = {
        version: 1,
        overrides: { marketing_freq },
      };
      f.history.canonicalHistoryStartedAt = new Date();
      expect((await f.run()).reason).toBe('FREQUENCY_HISTORY_UNAVAILABLE');
    },
  );
  it('does not add an implicit weekly limit when the Client has no frequency override', async () => {
    const f = fixture();
    f.history.canonicalHistoryStartedAt = new Date();
    expect((await f.run()).allowed).toBe(true);
  });
  it('past accepted delivery and unresolved attempts occupy one logical Client lane', async () => {
    const f = fixture();
    f.db.marketingCampaignRecipient.findMany.mockResolvedValue([
      { id: 'other-logical-client-child' },
    ]);
    f.db.marketingDeliveryAttempt.findMany.mockResolvedValue([
      { id: 'prior-attempt' },
    ]);
    expect((await f.run()).reason).toBe('FREQUENCY_OR_UNRESOLVED_DELIVERY');
    const calls = f.db.marketingDeliveryAttempt.findMany.mock
      .calls as unknown as Array<
      [{ where: { campaign: { parentRecipientId: { in: string[] } } } }]
    >;
    expect(calls[0][0].where.campaign.parentRecipientId.in).toEqual([
      'other-logical-client-child',
    ]);
  });
  it('revoked owner, tenant or category denies before dispatch', async () => {
    const owner = fixture();
    owner.db.membership.findFirst.mockResolvedValue(null);
    expect((await owner.run()).reason).toBe('APPROVING_AUTHORITY_REVOKED');
    const tenant = fixture();
    tenant.tenant.status = 'suspended';
    expect((await tenant.run()).reason).toBe('TENANT_INELIGIBLE');
    const category = fixture();
    category.entitlements.resolveFeatureRequirements.mockResolvedValue({
      allowed: false,
    });
    expect((await category.run()).reason).toBe(
      'MARKETING_CATEGORY_UNAVAILABLE',
    );
  });
  it('a changed or revoked fixed link never selects another channel', async () => {
    const f = fixture();
    f.link.revokedAt = new Date();
    expect((await f.run()).reason).toBe('FIXED_ROUTE_REVOKED_OR_CHANGED');
    expect(f.db.clientChannelLink.findMany).not.toHaveBeenCalled();
  });
  it('another Client or tenant cannot borrow the selected link', async () => {
    const f = fixture();
    f.link.clientId = 'foreign-client';
    expect((await f.run()).allowed).toBe(false);
    await expect(
      f.context.runAsPublicTenant('foreign-tenant', () =>
        f.policy.current(f.db as never, f.child, f.route),
      ),
    ).rejects.toThrow('Cross-tenant');
  });
  it('routing uses verified binding and allows Telegram without User', async () => {
    const f = fixture();
    const route = await f.context.runAsPublicTenant('tenant', () =>
      f.policy.plan(f.db as never, 'tenant', 'client'),
    );
    expect(route.primary).toBe('telegram');
    expect(route.userId).toBeNull();
  });
  it('missing delivery address produces no endpoint, not a guessed chat id', async () => {
    const f = fixture();
    f.link.deliveryAddressEncrypted = 'invalid';
    const route = await f.context.runAsPublicTenant('tenant', () =>
      f.policy.plan(f.db as never, 'tenant', 'client'),
    );
    expect(route.primary).toBe('none');
  });
});
