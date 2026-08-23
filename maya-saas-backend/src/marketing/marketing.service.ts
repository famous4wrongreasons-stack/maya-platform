import { createHash, randomUUID } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { asJson } from '../common/json.util';
import { phonesMatch } from '../common/phone.util';
import { ClientRecencyFactsService } from '../business-facts/client-recency-facts.service';
import { CommunicationShadowService } from '../communication-shadow';
import { CrmService } from '../crm/crm.service';
import type { CrmClientSearchResult } from '../crm/crm-adapter.interface';
import { InboxService } from '../inbox/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { RecoveryService } from '../recovery/recovery.service';
import { DEFAULT_SALON_TIMEZONE } from '../tenants/salon-timezone';

const DAY_MS = 24 * 60 * 60 * 1_000;
const SNAPSHOT_TTL_MS = DAY_MS;
const MAX_CANDIDATES = 500;
const CRM_LOOKUP_CONCURRENCY = 6;

export type MarketingAudienceRule = {
  inactive_days: number;
  minimum_visits: number;
  max_recipients: number;
};

type Candidate = {
  userId: string;
  phone: string;
  consentRecordedAt: Date;
};

@Injectable()
export class MarketingService {
  private readonly logger = new Logger(MarketingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crmService: CrmService,
    private readonly inboxService: InboxService,
    private readonly recoveryService: RecoveryService,
    /**
     * 🔴 Cycle 04 P9. Давность посещения — у владельца факта. Здесь стояло
     * собственное сравнение с `Date.now()` мимо часового пояса салона: у
     * московского арендатора граница «не был N дней» ехала на три часа, и
     * попадание в рассылку зависело от того, в котором часу нажали кнопку.
     */
    private readonly clientRecency: ClientRecencyFactsService,
    @Optional()
    private readonly communicationShadow?: CommunicationShadowService,
  ) {}

  async findAudience(input: {
    tenantId: string;
    actorUserId: string;
    rule: MarketingAudienceRule;
  }) {
    const candidates = await this.consentCandidates(input.tenantId);
    const when = await this.recencyAsOf(input.tenantId);
    const evaluated = await this.mapConcurrent(
      candidates,
      CRM_LOOKUP_CONCURRENCY,
      async (candidate) => ({
        candidate,
        match: await this.exactCrmMatch(input.tenantId, candidate.phone),
      }),
    );

    const eligibleCandidates = evaluated
      .filter(({ match }) => this.matchesRule(match, input.rule, when))
      .map(({ candidate }) => candidate)
      .slice(0, input.rule.max_recipients);
    const eligible = eligibleCandidates.map((candidate) => candidate.userId);
    const unavailableCount = evaluated.filter(({ match }) => !match).length;
    const expiresAt = new Date(Date.now() + SNAPSHOT_TTL_MS);
    const snapshotHash = this.audienceSnapshotHash(
      input.tenantId,
      input.rule,
      eligible,
    );
    const audience = await this.prisma.marketingAudience.create({
      data: {
        tenantId: input.tenantId,
        createdByUserId: input.actorUserId,
        ruleJson: asJson(input.rule),
        recipientUserIdsJson: asJson(eligible),
        candidateCount: candidates.length,
        eligibleCount: eligible.length,
        unavailableCount,
        expiresAt,
        provider: 'maya_inbox',
        status: 'AUDIENCE_CALCULATED',
        snapshotHash,
        recipients: {
          create: eligibleCandidates.map((candidate) => ({
            id: randomUUID(),
            tenantId: input.tenantId,
            externalClientId: candidate.userId,
            internalUserId: candidate.userId,
            eligibilityStatus: 'ALLOW',
            consentSource: 'customer_profile.marketingConsentAt',
            consentRecordedAt: candidate.consentRecordedAt,
          })),
        },
      },
      select: {
        id: true,
        candidateCount: true,
        eligibleCount: true,
        unavailableCount: true,
        expiresAt: true,
      },
    });

    return {
      audience_id: audience.id,
      source: 'yclients_exact_phone_match',
      candidate_count: audience.candidateCount,
      eligible_count: audience.eligibleCount,
      unavailable_count: audience.unavailableCount,
      capped: eligible.length >= input.rule.max_recipients,
      expires_at: audience.expiresAt.toISOString(),
      safeguards: {
        active_maya_accounts_only: true,
        marketing_consent_required: true,
        pii_returned_to_model: false,
      },
    };
  }

  async previewCampaign(input: {
    tenantId: string;
    actorUserId: string;
    audienceId: string;
    message: string;
  }) {
    const audience = await this.requireAudience(
      input.tenantId,
      input.audienceId,
    );
    const recipientIds = this.stringArray(audience.recipientUserIdsJson);
    const expiresAt = new Date(
      Math.min(audience.expiresAt.getTime(), Date.now() + SNAPSHOT_TTL_MS),
    );
    const campaign = await this.prisma.marketingCampaign.create({
      data: {
        tenantId: input.tenantId,
        createdByUserId: input.actorUserId,
        audienceId: audience.id,
        channel: 'app',
        status: 'draft',
        message: input.message,
        recipientUserIdsJson: asJson(recipientIds),
        recipientCount: recipientIds.length,
        expiresAt,
        provider: 'maya_inbox',
        audienceSnapshotHash:
          audience.snapshotHash ||
          this.audienceSnapshotHash(
            input.tenantId,
            this.audienceRule(audience.ruleJson),
            recipientIds,
          ),
        messageSnapshotHash: this.hash(input.message),
      },
      select: {
        id: true,
        recipientCount: true,
        channel: true,
        status: true,
        expiresAt: true,
      },
    });

    return {
      campaign_id: campaign.id,
      channel: campaign.channel,
      status: campaign.status,
      recipient_count: campaign.recipientCount,
      expires_at: campaign.expiresAt.toISOString(),
      next_action: 'request_owner_confirmation',
    };
  }

  async approvalPreview(tenantId: string, campaignId: string) {
    const campaign = await this.requireCampaign(tenantId, campaignId);
    return {
      campaign_id: campaign.id,
      channel: campaign.channel,
      recipient_count: campaign.recipientCount,
      message: campaign.message,
      expires_at: campaign.expiresAt.toISOString(),
    };
  }

  async sendCampaign(input: {
    tenantId: string;
    actorUserId: string;
    campaignId: string;
    idempotencyKey: string;
  }) {
    const campaign = await this.requireCampaign(
      input.tenantId,
      input.campaignId,
      false,
    );
    if (['sent', 'partial'].includes(campaign.status)) {
      return this.deliveryResult(campaign, true);
    }
    if (campaign.expiresAt.getTime() <= Date.now()) {
      await this.prisma.marketingCampaign.update({
        where: { id: campaign.id },
        data: { status: 'expired' },
      });
      throw new ConflictException({
        message: 'Marketing campaign preview has expired.',
        error: { code: 'marketing_campaign_expired' },
      });
    }

    const claimed = await this.prisma.marketingCampaign.updateMany({
      where: { id: campaign.id, tenantId: input.tenantId, status: 'draft' },
      data: { status: 'sending', idempotencyKey: input.idempotencyKey },
    });
    if (claimed.count !== 1) {
      const current = await this.requireCampaign(
        input.tenantId,
        input.campaignId,
        false,
      );
      if (['sent', 'partial'].includes(current.status)) {
        return this.deliveryResult(current, true);
      }
      throw new ConflictException({
        message: 'Marketing campaign is already being processed.',
        error: { code: 'marketing_campaign_busy' },
      });
    }

    if (!campaign.audienceId) {
      throw new ConflictException({
        message: 'Legacy marketing campaign has no audience.',
        error: { code: 'marketing_campaign_audience_missing' },
      });
    }
    const audience = await this.requireAudience(
      input.tenantId,
      campaign.audienceId,
    );
    const rule = this.audienceRule(audience.ruleJson);
    const requestedIds = new Set(
      this.stringArray(campaign.recipientUserIdsJson),
    );
    const currentCandidates = (
      await this.consentCandidates(input.tenantId)
    ).filter((candidate) => requestedIds.has(candidate.userId));
    const when = await this.recencyAsOf(input.tenantId);
    const revalidated = await this.mapConcurrent(
      currentCandidates,
      CRM_LOOKUP_CONCURRENCY,
      async (candidate) => ({
        candidate,
        match: await this.exactCrmMatch(input.tenantId, candidate.phone),
      }),
    );
    const recipients = revalidated.filter(({ match }) =>
      this.matchesRule(match, rule, when),
    );

    await this.planBulkCampaignShadow({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      idempotencyKey: input.idempotencyKey,
      campaign,
      audience,
      rule,
      recipients: recipients.map(({ candidate }) => candidate),
    });

    let sentCount = 0;
    let failedCount = 0;
    let attributionFailedCount = 0;
    await this.mapConcurrent(
      recipients,
      CRM_LOOKUP_CONCURRENCY,
      async (item) => {
        try {
          const delivery = await this.inboxService.publishForTenant(
            input.tenantId,
            {
              type: 'marketing_campaign',
              sourceEventId: `marketing:${campaign.id}`,
              title: 'MAYA',
              bodyText: campaign.message,
              payload: { campaign_id: campaign.id, kind: 'reactivation' },
              deepLink: 'maya://chat',
              userIds: [item.candidate.userId],
              fanoutOwners: false,
            },
          );
          if (delivery.stored !== 1) {
            failedCount += 1;
            return;
          }
          sentCount += 1;
        } catch {
          failedCount += 1;
          return;
        }
        try {
          await this.recoveryService.recordConsentSafeTouchpoint({
            tenantId: input.tenantId,
            phone: item.candidate.phone,
            externalEventId: `marketing:${campaign.id}:${item.candidate.userId}`,
            kind: 'reactivation_campaign',
            channel: 'app',
            occurredAt: new Date(),
            attributionWindowDays: 30,
          });
        } catch {
          attributionFailedCount += 1;
        }
      },
    );

    const skippedCount = requestedIds.size - recipients.length;
    const status = failedCount === 0 ? 'sent' : 'partial';
    const saved = await this.prisma.marketingCampaign.update({
      where: { id: campaign.id },
      data: { status, sentCount, sentAt: new Date() },
    });
    return {
      ...this.deliveryResult(saved, false),
      skipped_count: skippedCount,
      failed_count: failedCount,
      attribution_failed_count: attributionFailedCount,
    };
  }

  private async consentCandidates(tenantId: string): Promise<Candidate[]> {
    const rows = await this.prisma.membership.findMany({
      where: {
        tenantId,
        status: 'active',
        role: { in: [UserRole.customer, UserRole.client] },
        user: { status: 'active', phone: { not: null } },
        customerProfile: { is: { marketingConsentAt: { not: null } } },
      },
      select: {
        userId: true,
        user: { select: { phone: true } },
        customerProfile: { select: { marketingConsentAt: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_CANDIDATES,
    });
    return rows.flatMap((row) => {
      const consentRecordedAt = row.customerProfile?.marketingConsentAt;
      return row.user.phone && consentRecordedAt
        ? [
            {
              userId: row.userId,
              phone: row.user.phone,
              consentRecordedAt,
            },
          ]
        : [];
    });
  }

  private async planBulkCampaignShadow(input: {
    tenantId: string;
    actorUserId: string;
    idempotencyKey: string;
    campaign: {
      id: string;
      message: string;
      messageSnapshotHash?: string | null;
      expiresAt: Date;
    };
    audience: {
      id: string;
      tenantId: string;
      createdByUserId?: string;
      ruleJson: unknown;
      recipientUserIdsJson?: unknown;
      candidateCount?: number;
      eligibleCount?: number;
      unavailableCount?: number;
      expiresAt: Date;
      snapshotHash?: string;
    };
    rule: MarketingAudienceRule;
    recipients: Candidate[];
  }): Promise<void> {
    if (!this.communicationShadow || input.recipients.length === 0) return;

    try {
      const durableAudience = await this.ensureShadowAudience({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        audience: input.audience,
        rule: input.rule,
        recipients: input.recipients,
      });
      const messageSnapshotHash =
        input.campaign.messageSnapshotHash || this.hash(input.campaign.message);
      const inboxRecipients = await Promise.all(
        input.recipients.map((candidate) =>
          this.shadowMarketingRecipient(
            input.tenantId,
            durableAudience.snapshotHash,
            candidate,
            candidate.userId,
            'internal_user',
            'inbox',
          ),
        ),
      );
      const common = {
        tenantId: input.tenantId,
        sourceType: 'authenticated_request' as const,
        producerRef: 'marketing.sendCampaign',
        taxonomy: 'bulk_campaign' as const,
        templateRef: 'marketing.reactivation',
        contentIdentityParts: [messageSnapshotHash],
        eligibilityPolicyRef: 'marketing.consent-recency-revalidation.v1',
        legacyApprovalRequirement: 'OWNER_CONFIRMED' as const,
        expiresAt: input.campaign.expiresAt,
        actorUserId: input.actorUserId,
        audienceId: durableAudience.id,
        audienceSnapshotHash: durableAudience.snapshotHash,
        confirmedByUserId: input.actorUserId,
      };
      await this.communicationShadow.plan({
        ...common,
        logicalRef: `marketing:${input.campaign.id}:inbox:${input.idempotencyKey}`,
        channel: 'inbox',
        recipients: inboxRecipients,
      });

      const consentByUser = new Map(
        input.recipients.map((candidate) => [candidate.userId, candidate]),
      );
      const pushTokens = await this.prisma.devicePushToken.findMany({
        where: {
          tenantId: input.tenantId,
          userId: { in: input.recipients.map(({ userId }) => userId) },
        },
        select: { userId: true, token: true },
        orderBy: [{ userId: 'asc' }, { token: 'asc' }],
      });
      const pushRecipients = await Promise.all(
        pushTokens.flatMap((token) => {
          const candidate = consentByUser.get(token.userId);
          return candidate
            ? [
                this.shadowMarketingRecipient(
                  input.tenantId,
                  durableAudience.snapshotHash,
                  candidate,
                  token.token,
                  'apns_device',
                  'apns',
                ),
              ]
            : [];
        }),
      );
      if (pushRecipients.length > 0) {
        await this.communicationShadow.plan({
          ...common,
          logicalRef: `marketing:${input.campaign.id}:apns:${input.idempotencyKey}`,
          channel: 'apns',
          recipients: pushRecipients,
        });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(
        `Communication shadow plan failed for campaign ${input.campaign.id}: ${reason}`,
      );
    }
  }

  private async ensureShadowAudience(input: {
    tenantId: string;
    actorUserId: string;
    audience: {
      id: string;
      createdByUserId?: string;
      candidateCount?: number;
      unavailableCount?: number;
      expiresAt: Date;
      snapshotHash?: string;
    };
    rule: MarketingAudienceRule;
    recipients: Candidate[];
  }): Promise<{ id: string; snapshotHash: string }> {
    const userIds = input.recipients.map(({ userId }) => userId);
    const snapshotHash = this.audienceSnapshotHash(
      input.tenantId,
      input.rule,
      userIds,
    );
    if (input.audience.snapshotHash === snapshotHash) {
      return { id: input.audience.id, snapshotHash };
    }

    return this.prisma.marketingAudience.create({
      data: {
        tenantId: input.tenantId,
        createdByUserId: input.audience.createdByUserId || input.actorUserId,
        ruleJson: asJson(input.rule),
        recipientUserIdsJson: asJson([...userIds].sort()),
        candidateCount: input.audience.candidateCount ?? userIds.length,
        eligibleCount: userIds.length,
        unavailableCount: input.audience.unavailableCount ?? 0,
        expiresAt: input.audience.expiresAt,
        provider: 'maya_inbox',
        status: 'AUDIENCE_REVALIDATED_SHADOW',
        snapshotHash,
        recipients: {
          create: input.recipients.map((candidate) => ({
            id: randomUUID(),
            tenantId: input.tenantId,
            externalClientId: candidate.userId,
            internalUserId: candidate.userId,
            eligibilityStatus: 'ALLOW',
            consentSource: 'customer_profile.marketingConsentAt',
            consentRecordedAt: candidate.consentRecordedAt,
          })),
        },
      },
      select: { id: true, snapshotHash: true },
    });
  }

  private async shadowMarketingRecipient(
    tenantId: string,
    audienceSnapshotHash: string,
    candidate: Candidate,
    recipientRef: string,
    recipientKind: 'internal_user' | 'apns_device',
    channel: 'inbox' | 'apns',
  ) {
    const consentAt = candidate.consentRecordedAt.toISOString();
    const consentEvidence = await this.prisma.marketingConsentEvidence.upsert({
      where: {
        tenantId_externalClientId_channel: {
          tenantId,
          externalClientId: candidate.userId,
          channel,
        },
      },
      create: {
        id: `marketing-consent:${this.hash(
          JSON.stringify([tenantId, candidate.userId, channel]),
        )}`,
        tenantId,
        externalClientId: candidate.userId,
        channel,
        status: 'granted',
        source: 'customer_profile.marketingConsentAt.shadow_projection',
        evidenceRef: `customer-profile-consent:${this.hash(consentAt)}`,
        grantedAt: candidate.consentRecordedAt,
        updatedAt: new Date(),
      },
      // Existing evidence is authoritative. Revoked or expired evidence must
      // never be silently re-granted from the legacy profile flag.
      update: {},
    });
    const status = consentEvidence.status.trim().toLowerCase();
    const reasonCode = consentEvidence.revokedAt
      ? 'CONSENT_REVOKED'
      : consentEvidence.expiresAt &&
          consentEvidence.expiresAt.getTime() <= Date.now()
        ? 'CONSENT_EXPIRED'
        : status !== 'granted'
          ? 'CONSENT_NOT_GRANTED'
          : !consentEvidence.grantedAt
            ? 'CONSENT_EVIDENCE_INCOMPLETE'
            : undefined;
    return {
      recipientRef,
      recipientKind,
      internalUserId: candidate.userId,
      consentEvidenceId: consentEvidence.id,
      eligibility: {
        basis: 'consent_and_current_crm_recency',
        decision: reasonCode ? ('SKIP' as const) : ('ALLOW' as const),
        policyVersion: 1,
        evidenceRef: `consent-evidence:${this.hash(consentEvidence.id)}`,
        evidenceIdentityParts: [
          tenantId,
          candidate.userId,
          channel,
          consentEvidence.id,
          status,
          consentAt,
          consentEvidence.revokedAt?.toISOString() ?? '',
          consentEvidence.expiresAt?.toISOString() ?? '',
          audienceSnapshotHash,
        ],
        reasonCode,
      },
    };
  }

  private audienceSnapshotHash(
    tenantId: string,
    rule: MarketingAudienceRule,
    userIds: string[],
  ): string {
    return this.hash(
      JSON.stringify({
        tenantId,
        rule: {
          inactive_days: rule.inactive_days,
          minimum_visits: rule.minimum_visits,
          max_recipients: rule.max_recipients,
        },
        userIds: [...userIds].sort(),
      }),
    );
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('base64url');
  }

  private async exactCrmMatch(
    tenantId: string,
    phone: string,
  ): Promise<CrmClientSearchResult | null> {
    const candidates = await this.crmService.searchClients(tenantId, phone);
    return (
      candidates.find((candidate) => phonesMatch(phone, candidate.phone)) ??
      null
    );
  }

  private matchesRule(
    match: CrmClientSearchResult | null,
    rule: MarketingAudienceRule,
    when: { asOf: Date; timezone: string },
  ): boolean {
    if (!match || (match.visits_count ?? 0) < rule.minimum_visits) return false;
    const days = this.clientRecency.fromProviderCard(match, when).distance.days;
    // Неизвестная дата остаётся исключением из рассылки: «мы не знаем, когда он
    // был» — не то же самое, что «он давно не был».
    return days !== null && days >= rule.inactive_days;
  }

  /**
   * Точка отсчёта давности: один момент и один пояс на весь проход.
   *
   * Явная — потому что аудитория собирается и перепроверяется двумя разными
   * вызовами, и обе стороны обязаны считать сутки одинаково.
   */
  private async recencyAsOf(
    tenantId: string,
  ): Promise<{ asOf: Date; timezone: string }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { defaultTimezone: true },
    });
    return {
      asOf: new Date(Date.now()),
      timezone: tenant?.defaultTimezone?.trim() || DEFAULT_SALON_TIMEZONE,
    };
  }

  private async requireAudience(tenantId: string, audienceId: string) {
    const audience = await this.prisma.marketingAudience.findFirst({
      where: { id: audienceId, tenantId },
    });
    if (!audience) {
      throw new NotFoundException({
        message: 'Marketing audience not found.',
        error: { code: 'marketing_audience_not_found' },
      });
    }
    if (audience.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException({
        message: 'Marketing audience has expired.',
        error: { code: 'marketing_audience_expired' },
      });
    }
    return audience;
  }

  private async requireCampaign(
    tenantId: string,
    campaignId: string,
    requireDraft = true,
  ) {
    const campaign = await this.prisma.marketingCampaign.findFirst({
      where: { id: campaignId, tenantId },
    });
    if (!campaign) {
      throw new NotFoundException({
        message: 'Marketing campaign not found.',
        error: { code: 'marketing_campaign_not_found' },
      });
    }
    if (requireDraft && campaign.status !== 'draft') {
      throw new ConflictException({
        message: 'Marketing campaign is not a draft.',
        error: { code: 'marketing_campaign_not_draft' },
      });
    }
    if (requireDraft && campaign.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException({
        message: 'Marketing campaign preview has expired.',
        error: { code: 'marketing_campaign_expired' },
      });
    }
    return campaign;
  }

  private audienceRule(value: unknown): MarketingAudienceRule {
    const rule = (value ?? {}) as Partial<MarketingAudienceRule>;
    return {
      inactive_days: Number(rule.inactive_days),
      minimum_visits: Number(rule.minimum_visits),
      max_recipients: Number(rule.max_recipients),
    };
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private deliveryResult(
    campaign: {
      id: string;
      status: string;
      recipientCount: number;
      sentCount: number;
    },
    replayed: boolean,
  ) {
    return {
      campaign_id: campaign.id,
      status: campaign.status,
      recipient_count: campaign.recipientCount,
      sent_count: campaign.sentCount,
      replayed,
      source: 'maya_inbox',
      recovery_attribution_enabled: true,
    };
  }

  private async mapConcurrent<T, R>(
    values: T[],
    concurrency: number,
    worker: (value: T) => Promise<R>,
  ): Promise<R[]> {
    const results = new Array<R>(values.length);
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(concurrency, values.length) }, async () => {
        while (cursor < values.length) {
          const index = cursor;
          cursor += 1;
          results[index] = await worker(values[index]);
        }
      }),
    );
    return results;
  }
}
