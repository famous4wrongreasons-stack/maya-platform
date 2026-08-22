import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { asJson } from '../common/json.util';
import { phonesMatch } from '../common/phone.util';
import { ClientRecencyFactsService } from '../business-facts/client-recency-facts.service';
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
};

@Injectable()
export class MarketingService {
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

    const eligible = evaluated
      .filter(({ match }) => this.matchesRule(match, input.rule, when))
      .map(({ candidate }) => candidate.userId)
      .slice(0, input.rule.max_recipients);
    const unavailableCount = evaluated.filter(({ match }) => !match).length;
    const expiresAt = new Date(Date.now() + SNAPSHOT_TTL_MS);
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
      select: { userId: true, user: { select: { phone: true } } },
      orderBy: { createdAt: 'asc' },
      take: MAX_CANDIDATES,
    });
    return rows.flatMap((row) =>
      row.user.phone ? [{ userId: row.userId, phone: row.user.phone }] : [],
    );
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
