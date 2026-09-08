import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { EncryptionService } from '../encryption/encryption.service';
import { ClientChannelLinkService } from '../crm/client-channel-link.service';
import { resolveVerifiedClientDeliveryEndpoint } from '../crm/client-delivery-endpoint';
import { ClientWebPushService } from '../crm/client-web-push.service';
import { assertConsentChannelBinding } from '../crm/client-consent-authority';
import { evaluateTenantAccessState } from '../tenants/tenant-access-state';
import { exactPreferenceKeys, notificationOverrides, preferenceObject } from '../action-engine/client-preferences.contract';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { FEEDBACK_ROLES, feedbackHash, feedbackSlotKey, type FeedbackPlan, type FeedbackSlot } from './native-feedback.contract';

type Tx = Prisma.TransactionClient;
@Injectable()
export class NativeFeedbackPolicyService {
  readonly links: ClientChannelLinkService;
  constructor(private readonly prisma: PrismaService, private readonly context: TenantContextService,
    private readonly encryption: EncryptionService, private readonly webPush: ClientWebPushService,
    private readonly entitlements: EntitlementsService, @Optional() private readonly clock: () => Date = () => new Date()) {
    const unavailable = () => Promise.reject(new ForbiddenException('Existing verified Client binding required'));
    this.links = new ClientChannelLinkService(prisma, context, { verifyLink: unavailable, verifyRevocation: unavailable });
  }
  async client(tx: Tx, tenantId: string, clientId: string) {
    this.context.assertTenantId(tenantId);
    await this.links.assertClientEligible(tx, tenantId, clientId);
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (!['active', 'trial_active', 'past_due_grace'].includes(evaluateTenantAccessState(tenant, this.clock()).accessState)) throw new ForbiddenException('Current tenant unavailable');
    return tenant;
  }
  async management(tx: Tx, tenantId: string, userId: string, branchId?: string) {
    const member = await tx.membership.findUnique({ where: { userId_tenantId: { userId, tenantId } }, include: { user: { select: { status: true } }, tenant: { select: { status: true } } } });
    if (!member || member.status !== 'active' || member.user.status !== 'active' || member.tenant.status !== 'active' || !FEEDBACK_ROLES.includes(member.role) || (branchId && member.branchId && member.branchId !== branchId)) throw new ForbiddenException('Exact current feedback management authority required');
    return member;
  }
  /** The canonical consent facts and preferences remain the authority. This
   * reader creates neither consent, delivery history nor a separate policy. */
  async marketingAllowed(tx: Tx, tenantId: string, clientId: string, requestId?: string) {
    const tenant = await this.client(tx, tenantId, clientId);
    if (!(await this.entitlements.resolveFeatureRequirements(tenantId, ['notifications.core'])).allowed) return false;
    const now = this.clock();
    const profile = await tx.customerProfile.findUnique({ where: { tenantId_clientId: { tenantId, clientId } } });
    if (!profile?.privacyConsentAt || !profile.marketingConsentAt) return false;
    for (const kind of ['privacy', 'marketing']) {
      const facts = await tx.clientConsentFact.findMany({ where: { tenantId, clientId, kind, effectiveAt: { lte: now } }, orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }], take: 2 });
      if (!facts[0] || facts[0].decision !== 'grant' || (facts[1]?.effectiveAt.getTime() === facts[0].effectiveAt.getTime() && facts[1].decision !== facts[0].decision)) return false;
    }
    try {
      const prefs = profile.notificationPreferencesJson === null ? {} : (() => { const p = preferenceObject(profile.notificationPreferencesJson); exactPreferenceKeys(p, ['version', 'overrides']); if (p.version !== 1) throw new Error('Unsupported preference version'); return notificationOverrides(p.overrides); })();
      if (prefs.marketing === false) return false;
      const from = prefs.quiet_from, to = prefs.quiet_to;
      if (typeof from === 'number' && typeof to === 'number' && from !== to) {
        const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tenant.defaultTimezone, hour: '2-digit', hourCycle: 'h23' }).format(now));
        if (from < to ? hour >= from && hour < to : hour >= from || hour < to) return false;
      }
      const days = prefs.marketing_freq === 'week' ? 7 : prefs.marketing_freq === '2weeks' ? 14 : prefs.marketing_freq === 'month' ? 30 : 0;
      if (days) {
        const since = new Date(now.getTime() - days * 86400000);
        const policy = await tx.marketingPolicy.findUnique({ where: { tenantId } });
        if (!policy?.canonicalHistoryStartedAt || policy.canonicalHistoryStartedAt > since) return false;
        const bulkParents = await tx.marketingCampaignRecipient.findMany({ where: { tenantId, clientId, lifecycleVersion: 2 }, select: { id: true } });
        const prior = await tx.marketingDeliveryAttempt.findFirst({ where: { tenantId, kind: 'EXECUTION', campaign: { OR: [
          { parentRecipientId: { in: bulkParents.map(p => p.id) } },
          { actionExecution: { nativeFeedbackRequest: { clientId, ...(requestId ? { id: { not: requestId } } : {}) } } },
        ] }, OR: [{ state: 'STARTED' }, { recipient: { is: { deliveryState: 'UNKNOWN' } } }, { dispatchedAt: { gte: since }, recipient: { is: { deliveryState: { in: ['ACCEPTED', 'DELIVERED'] } } } }] } });
        if (prior) return false;
      }
      return true;
    } catch { return false; }
  }
  private slot(plan: FeedbackPlan, material: Omit<FeedbackSlot, 'slotKey'>): FeedbackSlot {
    return { ...material, slotKey: feedbackSlotKey({ tenantId: plan.tenantId, clientId: plan.clientId, requestId: plan.requestId, revisionId: plan.revisionId, phase: plan.phase, contentHash: plan.contentHash }, material) };
  }
  async invitationSlots(tx: Tx, plan: FeedbackPlan): Promise<FeedbackSlot[]> {
    if (!(await this.marketingAllowed(tx, plan.tenantId, plan.clientId))) return [];
    const links = await tx.clientChannelLink.findMany({ where: { tenantId: plan.tenantId, clientId: plan.clientId, provider: 'telegram', revokedAt: null }, orderBy: { id: 'asc' } });
    const empty = { userId: null, membershipId: null, memberRole: null, branchId: null, link: null, endpointId: null, endpointMaterialHash: null, endpointLinkId: null };
    for (const link of links) {
      if (!await resolveVerifiedClientDeliveryEndpoint(tx, this.encryption, this.links, plan.tenantId, plan.clientId, link.id)) continue;
      return [this.slot(plan, { ...empty, channel: 'telegram', recipientRef: plan.clientId, link: { linkId: link.id, provider: 'telegram', providerSubjectHash: link.providerSubjectHash, verificationEvidenceHash: link.verificationEvidenceHash } })];
    }
    const slots: FeedbackSlot[] = [];
    const endpoints = await tx.clientWebPushEndpoint.findMany({ where: { tenantId: plan.tenantId, clientId: plan.clientId, endedAt: null }, orderBy: { id: 'asc' } });
    for (const ep of endpoints) {
      if (!await this.webPush.resolveForDelivery(plan.tenantId, plan.clientId, ep.id, tx)) continue;
      slots.push(this.slot(plan, { ...empty, channel: 'web_push', recipientRef: plan.clientId, endpointId: ep.id, endpointLinkId: ep.clientChannelLinkId, endpointMaterialHash: ep.materialHash }));
      if (slots.length === 5) break;
    }
    return slots;
  }
  async responseSlots(tx: Tx, plan: FeedbackPlan): Promise<FeedbackSlot[]> {
    const members = await tx.membership.findMany({ where: { tenantId: plan.tenantId, status: 'active', user: { status: 'active' }, role: { in: FEEDBACK_ROLES }, OR: [{ branchId: null }, { branchId: plan.branchId }] }, orderBy: { userId: 'asc' } });
    return members.map(m => this.slot(plan, { channel: 'inbox', recipientRef: m.userId, userId: m.userId, membershipId: m.id, memberRole: m.role, branchId: m.branchId, link: null, endpointId: null, endpointMaterialHash: null, endpointLinkId: null }));
  }
  async authorize(tx: Tx, plan: FeedbackPlan, slot: FeedbackSlot) {
    await this.client(tx, plan.tenantId, plan.clientId);
    if (plan.phase === 'response') {
      const m = await this.management(tx, plan.tenantId, slot.userId!, plan.branchId);
      if (m.id !== slot.membershipId || m.role !== slot.memberRole || m.branchId !== slot.branchId) throw new ForbiddenException('Frozen feedback management recipient changed');
      return { address: m.userId, proof: feedbackHash('management', [m.id, m.role, m.branchId]) };
    }
    if (this.clock() < new Date(plan.eligibleAt) || this.clock() >= new Date(plan.expiresAt) || !await this.marketingAllowed(tx, plan.tenantId, plan.clientId, plan.requestId)) throw new ForbiddenException('Feedback invitation not eligible');
    if (slot.channel === 'telegram') {
      await assertConsentChannelBinding(tx, plan.tenantId, plan.clientId, slot.link!);
      const target = await resolveVerifiedClientDeliveryEndpoint(tx, this.encryption, this.links, plan.tenantId, plan.clientId, slot.link!.linkId);
      if (!target || target.provider !== 'telegram') throw new ForbiddenException('Frozen feedback Telegram binding unavailable');
      return { address: target.address, proof: feedbackHash('telegram', slot.link) };
    }
    const ep = await tx.clientWebPushEndpoint.findUnique({ where: { id: slot.endpointId! } });
    const material = await this.webPush.resolveForDelivery(plan.tenantId, plan.clientId, slot.endpointId!, tx);
    if (!ep || !material || ep.materialHash !== slot.endpointMaterialHash || ep.clientChannelLinkId !== slot.endpointLinkId) throw new ForbiddenException('Frozen feedback Web Push endpoint unavailable');
    return { address: ep.id, proof: feedbackHash('web-push', [ep.id, ep.materialHash]) };
  }
}
