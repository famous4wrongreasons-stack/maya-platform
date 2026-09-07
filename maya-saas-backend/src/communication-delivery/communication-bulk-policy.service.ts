import { ConfigService } from '@nestjs/config';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { ActionIdentityService } from '../action-engine/action-engine.identity';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, type MarketingCampaignRecipient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { EncryptionService } from '../encryption/encryption.service';
import { ClientChannelLinkService } from '../crm/client-channel-link.service';
import { resolveVerifiedClientDeliveryEndpoint } from '../crm/client-delivery-endpoint';
import { ClientWebPushService } from '../crm/client-web-push.service';
import { evaluateTenantAccessState } from '../tenants/tenant-access-state';
import {
  notificationOverrides,
  preferenceObject,
  exactPreferenceKeys,
} from '../action-engine/client-preferences.contract';
import { type BulkRoute } from '../marketing/canonical-bulk.contract';

type Tx = Prisma.TransactionClient;
@Injectable()
export class CommunicationBulkPolicyService {
  private readonly links: ClientChannelLinkService;
  private readonly identity: ActionIdentityService;
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly encryption: EncryptionService,
    private readonly webPush: ClientWebPushService,
    private readonly entitlements: EntitlementsService,
    config: ConfigService,
  ) {
    this.identity = new ActionIdentityService(
      config.get<string>('ACTION_ENGINE_IDENTITY_SECRET') ??
        config.getOrThrow<string>('CRM_ENCRYPTION_KEY'),
      config.get<string>('ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET') ??
        config.getOrThrow<string>('CRM_ENCRYPTION_KEY'),
    );
    const unavailable = () =>
      Promise.reject(new ForbiddenException('Verified binding required'));
    this.links = new ClientChannelLinkService(prisma, context, {
      verifyLink: unavailable,
      verifyRevocation: unavailable,
    });
  }
  hash(kind: string, value: unknown) {
    return this.identity.hmac(`b35.${kind}/1`, value);
  }
  async plan(tx: Tx, tenantId: string, clientId: string): Promise<BulkRoute> {
    await this.links.assertClientEligible(tx, tenantId, clientId);
    const plan: BulkRoute = {
      contract: 'maya.bulk-client-route/1',
      primary: 'none',
      link: null,
      userId: null,
      webPushEndpoints: [],
      apnsDevices: [],
      policyVersion: 1,
    };
    const links = await tx.clientChannelLink.findMany({
      where: {
        tenantId,
        clientId,
        revokedAt: null,
        provider: { in: ['maya_user', 'telegram'] },
      },
      orderBy: [{ verifiedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    for (const provider of ['maya_user', 'telegram']) {
      for (const link of links.filter((l) => l.provider === provider)) {
        const target = await resolveVerifiedClientDeliveryEndpoint(
          tx,
          this.encryption,
          this.links,
          tenantId,
          clientId,
          link.id,
        );
        if (!target) continue;
        plan.primary = target.provider === 'maya_user' ? 'inbox' : 'telegram';
        plan.userId = target.provider === 'maya_user' ? target.address : null;
        plan.link = {
          id: link.id,
          provider: link.provider,
          subjectHash: link.providerSubjectHash,
          verificationEvidenceHash: link.verificationEvidenceHash,
        };
        break;
      }
      if (plan.link) break;
    }
    const endpoints = await tx.clientWebPushEndpoint.findMany({
      where: { tenantId, clientId, endedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 5,
    });
    for (const ep of endpoints) {
      if (await this.webPush.resolveForDelivery(tenantId, clientId, ep.id, tx))
        plan.webPushEndpoints.push({
          id: ep.id,
          materialHash: ep.materialHash,
          clientChannelLinkId: ep.clientChannelLinkId,
        });
    }
    if (!plan.link && plan.webPushEndpoints.length) plan.primary = 'web_push';
    if (plan.primary === 'inbox') {
      const devices = await tx.devicePushToken.findMany({
        where: { tenantId, userId: plan.userId!, platform: 'ios' },
        orderBy: { id: 'asc' },
      });
      plan.apnsDevices = devices
        .filter((d) => /^[a-f0-9]{64}$/i.test(d.token))
        .map((d) => ({
          id: d.id,
          tokenHash: this.hash('apns-token', [
            tenantId,
            clientId,
            d.id,
            d.token,
          ]),
        }));
    }
    return plan;
  }
  /** The caller owns the Communication Delivery boundary transaction. */
  async current(
    tx: Tx,
    child: MarketingCampaignRecipient,
    route: BulkRoute,
    endpointRef?: string,
  ) {
    const tenantId = this.context.assertTenantId(child.tenantId);
    const clientId = child.clientId!;
    // Same-Client claims and policy writers must commit in a single order.
    await tx.$queryRaw`SELECT id FROM "Client" WHERE id=${clientId} AND "tenantId"=${tenantId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "CustomerProfile" WHERE "clientId"=${clientId} AND "tenantId"=${tenantId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id=${tenantId} FOR UPDATE`;
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
    const profile = await tx.customerProfile.findUnique({
      where: { tenantId_clientId: { tenantId, clientId } },
      select: {
        privacyConsentAt: true,
        marketingConsentAt: true,
        notificationPreferencesJson: true,
      },
    });
    const root = await tx.marketingCampaign.findUniqueOrThrow({
      where: { id: child.campaignId },
    });
    const history = await tx.marketingPolicy.findUnique({
      where: { tenantId },
    });
    const now = new Date();
    const proof: Record<string, unknown> = {
      contract: 'maya.bulk-dispatch-eligibility/1',
      tenantId,
      clientId,
      decision: 'DENY',
      checkedAt: now.toISOString(),
      policyVersion: 1,
      routeHash: this.hash('route', route),
      coverageEpoch: history?.canonicalHistoryStartedAt?.toISOString() ?? null,
    };
    const deny = (reason: string) => ({
      allowed: false as const,
      reason,
      proof: { ...proof, reason },
    });
    if (
      !tenant ||
      !['active', 'trial_active', 'past_due_grace'].includes(
        evaluateTenantAccessState(tenant, now).accessState,
      )
    )
      return deny('TENANT_INELIGIBLE');
    if (!root.confirmedAt || !root.confirmedByUserId || root.expiresAt <= now)
      return deny('BULK_EXPIRED_OR_UNAPPROVED');
    const category = await this.entitlements.resolveFeatureRequirements(
      tenantId,
      ['notifications.core'],
    );
    if (!category.allowed) return deny('MARKETING_CATEGORY_UNAVAILABLE');
    proof.categoryPolicyHash = this.hash('category-policy', [
      category.planId,
      category.requiredFeatures,
      category.allowed,
    ]);
    await tx.$queryRaw`SELECT id FROM "Membership" WHERE "tenantId"=${tenantId} AND "userId"=${root.confirmedByUserId} FOR UPDATE`;
    const owner = await tx.membership.findFirst({
      where: {
        tenantId,
        userId: root.confirmedByUserId,
        status: 'active',
        role: { in: ['tenant_owner', 'business_owner'] },
        user: { status: 'active' },
      },
    });
    if (!owner) return deny('APPROVING_AUTHORITY_REVOKED');
    try {
      await this.links.assertClientEligible(tx, tenantId, clientId);
    } catch {
      return deny('CLIENT_INELIGIBLE');
    }
    for (const kind of ['privacy', 'marketing']) {
      const facts = await tx.clientConsentFact.findMany({
        where: { tenantId, clientId, kind, effectiveAt: { lte: now } },
        orderBy: [
          { effectiveAt: 'desc' },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        take: 2,
      });
      const latest = facts[0];
      if (
        !latest ||
        latest.decision !== 'grant' ||
        (facts[1]?.effectiveAt.getTime() === latest.effectiveAt.getTime() &&
          facts[1].decision !== latest.decision)
      )
        return deny('CONSENT_NOT_GRANTED');
      proof[`${kind}Fact`] = latest.id;
    }
    if (!profile?.privacyConsentAt || !profile.marketingConsentAt)
      return deny('CONSENT_PROJECTION_UNAVAILABLE');
    let overrides: ReturnType<typeof notificationOverrides> = {};
    try {
      if (profile.notificationPreferencesJson !== null) {
        const p = preferenceObject(profile.notificationPreferencesJson);
        exactPreferenceKeys(p, ['version', 'overrides']);
        if (p.version !== 1) return deny('PREFERENCE_VERSION_UNSUPPORTED');
        overrides = notificationOverrides(p.overrides);
      }
    } catch {
      return deny('PREFERENCES_UNAVAILABLE');
    }
    proof.preferencesHash = this.hash('preferences', overrides);
    proof.tenantPolicyHash = this.hash('tenant-policy', [
      tenant.status,
      tenant.defaultTimezone,
      owner.id,
      owner.role,
    ]);
    if (overrides.marketing === false) return deny('MARKETING_DISABLED');
    if (
      typeof overrides.quiet_from === 'number' &&
      typeof overrides.quiet_to === 'number' &&
      overrides.quiet_from !== overrides.quiet_to
    ) {
      let hour: number;
      try {
        hour = Number(
          new Intl.DateTimeFormat('en-GB', {
            hour: '2-digit',
            hourCycle: 'h23',
            timeZone: tenant.defaultTimezone,
          }).format(now),
        );
      } catch {
        return deny('TIMEZONE_UNAVAILABLE');
      }
      const from = overrides.quiet_from,
        to = overrides.quiet_to;
      if (from < to ? hour >= from && hour < to : hour >= from || hour < to)
        return deny('QUIET_HOURS');
    }
    if (!history?.canonicalHistoryStartedAt)
      return deny('FREQUENCY_HISTORY_UNAVAILABLE');
    const days =
      overrides.marketing_freq === 'week'
        ? 7
        : overrides.marketing_freq === '2weeks'
          ? 14
          : overrides.marketing_freq === 'month'
            ? 30
            : 0;
    const since = new Date(now.getTime() - days * 86400000);
    if (days && history.canonicalHistoryStartedAt > since)
      return deny('FREQUENCY_HISTORY_UNAVAILABLE');
    const other = await tx.marketingCampaignRecipient.findMany({
      where: { tenantId, clientId, lifecycleVersion: 2, id: { not: child.id } },
      select: { id: true },
    });
    const evidence = other.length
      ? await tx.marketingDeliveryAttempt.findMany({
          where: {
            tenantId,
            campaign: { parentRecipientId: { in: other.map((r) => r.id) } },
            kind: 'EXECUTION',
            OR: [
              { state: 'STARTED' },
              { recipient: { is: { deliveryState: 'UNKNOWN' } } },
              ...(days
                ? [
                    {
                      recipient: {
                        is: {
                          deliveryState: {
                            in: ['ACCEPTED', 'DELIVERED'] as (
                              'ACCEPTED' | 'DELIVERED'
                            )[],
                          },
                        },
                      },
                      dispatchedAt: { gte: since },
                    },
                  ]
                : []),
            ],
          },
          select: { id: true },
          take: 1,
        })
      : [];
    if (evidence.length) return deny('FREQUENCY_OR_UNRESOLVED_DELIVERY');
    if (route.primary === 'none') return deny('NO_ELIGIBLE_ENDPOINT');
    if (route.link) {
      await tx.$queryRaw`SELECT id FROM "ClientChannelLink" WHERE id=${route.link.id} AND "tenantId"=${tenantId} FOR UPDATE`;
      const link = await tx.clientChannelLink.findUnique({
        where: { id: route.link.id },
      });
      const target = await resolveVerifiedClientDeliveryEndpoint(
        tx,
        this.encryption,
        this.links,
        tenantId,
        clientId,
        route.link.id,
      );
      if (
        !link ||
        !target ||
        link.providerSubjectHash !== route.link.subjectHash ||
        link.verificationEvidenceHash !== route.link.verificationEvidenceHash ||
        (route.primary === 'inbox' && target.address !== route.userId)
      )
        return deny('FIXED_ROUTE_REVOKED_OR_CHANGED');
    }
    if (endpointRef?.startsWith('b35:endpoint:')) {
      const id = endpointRef.slice('b35:endpoint:'.length),
        pinned = route.webPushEndpoints.find((e) => e.id === id);
      await tx.$queryRaw`SELECT id FROM "ClientWebPushEndpoint" WHERE id=${id} AND "tenantId"=${tenantId} FOR UPDATE`;
      const ep = await tx.clientWebPushEndpoint.findUnique({ where: { id } });
      if (ep)
        await tx.$queryRaw`SELECT id FROM "ClientChannelLink" WHERE id=${ep.clientChannelLinkId} AND "tenantId"=${tenantId} FOR UPDATE`;
      if (
        !ep ||
        !pinned ||
        ep.materialHash !== pinned.materialHash ||
        ep.clientChannelLinkId !== pinned.clientChannelLinkId ||
        !(await this.webPush.resolveForDelivery(tenantId, clientId, id, tx))
      )
        return deny('FIXED_ENDPOINT_UNAVAILABLE');
    }
    if (endpointRef?.startsWith('b35:device:')) {
      const id = endpointRef.slice('b35:device:'.length),
        pinned = route.apnsDevices.find((d) => d.id === id);
      await tx.$queryRaw`SELECT id FROM "DevicePushToken" WHERE id=${id} AND "tenantId"=${tenantId} FOR UPDATE`;
      const d = await tx.devicePushToken.findUnique({ where: { id } });
      if (
        !d ||
        !pinned ||
        d.tenantId !== tenantId ||
        d.userId !== route.userId ||
        this.hash('apns-token', [tenantId, clientId, id, d.token]) !==
          pinned.tokenHash
      )
        return deny('FIXED_DEVICE_UNAVAILABLE');
    }
    return {
      allowed: true as const,
      reason: 'ALLOW',
      proof: { ...proof, decision: 'ALLOW' },
    };
  }
}
