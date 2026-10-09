import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { BusinessReview, TenantCatalogItem } from '@prisma/client';

import { AuditLogService } from '../audit-log/audit-log.service';
import { Package5Wave4CanonicalCutoverService } from '../package5-wave4/package5-wave4-canonical-cutover.service';
import { Package5Wave4ReviewFactService } from '../package5-wave4/package5-wave4.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { isUsableTimezone } from '../tenants/salon-timezone';
import { localDateMinuteToUtc } from '../internal-calendar/internal-calendar.utils';
import { localCalendarDate } from '../owner-reports/owner-reports.time';
import type { IngestBusinessReviewDto } from './dto/business-review.dto';
import type { UpsertCatalogItemDto } from './dto/catalog-item.dto';
import type { UpdateReferralProgramDto } from './dto/referral-program.dto';
import { P409ValueConfigurationCanonicalCutoverService } from './p4-09-value-configuration-canonical-cutover.service';

export const BUSINESS_CONTENT_KINDS = [
  'inventory',
  'certificate',
  'membership',
] as const;

export type BusinessContentKind = (typeof BUSINESS_CONTENT_KINDS)[number];

export type ReviewCalendarWindow = Readonly<{
  month: string;
  timezone: string;
  fromInclusive: string;
  toExclusive: string;
}>;

const REVIEW_TOPICS = {
  service_quality: [
    'качество',
    'результат',
    'стрижк',
    'услуг',
    'процедур',
    'работ',
  ],
  staff: ['мастер', 'барбер', 'врач', 'специалист', 'сотрудник'],
  wait: ['ждал', 'ждать', 'ожидани', 'задерж', 'опоздал'],
  booking: ['запис', 'перенос', 'отмен', 'время', 'слот'],
  cleanliness: ['чист', 'гряз', 'стерил', 'уборк'],
  atmosphere: ['атмосфер', 'уют', 'музык', 'интерьер'],
  price: ['цен', 'дорог', 'стоимост', 'дешев'],
  location: ['парков', 'адрес', 'местополож', 'добраться'],
  communication: ['общени', 'вежлив', 'груб', 'администратор', 'ответил'],
  result: ['понрав', 'доволен', 'довольна', 'идеаль', 'испортили'],
} as const;

@Injectable()
export class BusinessContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly auditLog: AuditLogService,
    private readonly canonicalValueConfiguration: P409ValueConfigurationCanonicalCutoverService,
    private readonly canonicalWave4: Package5Wave4CanonicalCutoverService,
    private readonly reviewFacts: Package5Wave4ReviewFactService,
  ) {}

  async listCatalog(
    tenantId: string,
    kind: BusinessContentKind,
    options: { activeOnly?: boolean; lowStockOnly?: boolean } = {},
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const rows = await this.prisma.tenantCatalogItem.findMany({
      where: {
        tenantId: scopedTenantId,
        kind,
        ...(options.activeOnly === false ? {} : { active: true }),
      },
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
    });
    const items = rows
      .filter(
        (row) =>
          !options.lowStockOnly ||
          (row.quantity !== null &&
            row.lowStockThreshold !== null &&
            row.quantity <= row.lowStockThreshold),
      )
      .map((row) => this.serializeCatalogItem(row));
    return {
      configured: rows.length > 0,
      source: rows.length > 0 ? this.catalogSource(rows) : 'not_configured',
      kind,
      count: items.length,
      items,
    };
  }

  async createCatalogItem(
    tenantId: string,
    actorUserId: string,
    kind: BusinessContentKind,
    dto: UpsertCatalogItemDto,
    idempotencyKey?: string,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    if (kind !== 'inventory') {
      const result = await this.canonicalValueConfiguration.createOffer(
        scopedTenantId,
        actorUserId,
        kind,
        dto,
      );
      return this.catalogItemResult(scopedTenantId, kind, result.targetId);
    }
    return this.canonicalWave4.createInventoryItem(
      scopedTenantId,
      actorUserId,
      dto,
      idempotencyKey,
    );
  }

  async updateCatalogItem(
    tenantId: string,
    actorUserId: string,
    kind: BusinessContentKind,
    itemId: string,
    dto: UpsertCatalogItemDto,
    idempotencyKey?: string,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    if (kind !== 'inventory') {
      const result = await this.canonicalValueConfiguration.updateOffer(
        scopedTenantId,
        actorUserId,
        kind,
        itemId,
        dto,
      );
      return this.catalogItemResult(scopedTenantId, kind, result.targetId);
    }
    return this.canonicalWave4.updateInventoryItem(
      scopedTenantId,
      actorUserId,
      itemId,
      dto,
      idempotencyKey,
    );
  }

  async deleteCatalogItem(
    tenantId: string,
    actorUserId: string,
    kind: BusinessContentKind,
    itemId: string,
    idempotencyKey?: string,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    if (kind !== 'inventory') {
      await this.canonicalValueConfiguration.retireOffer(
        scopedTenantId,
        actorUserId,
        kind,
        itemId,
      );
      return { ok: true, deleted: true, id: itemId, retired: true };
    }
    return this.canonicalWave4.archiveInventoryItem(
      scopedTenantId,
      actorUserId,
      itemId,
      idempotencyKey,
    );
  }

  async getReferralProgram(tenantId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const row = await this.prisma.referralProgram.findUnique({
      where: { tenantId: scopedTenantId },
    });
    if (!row) {
      return {
        configured: false,
        enabled: false,
        source: 'not_configured',
      };
    }
    return {
      configured: true,
      enabled: row.enabled,
      inviter_reward_kopecks: row.inviterRewardKopecks,
      invitee_reward_kopecks: row.inviteeRewardKopecks,
      currency: row.currency,
      terms: row.terms,
      code_prefix: row.codePrefix,
      source: 'tenant_configuration',
      updated_at: row.updatedAt,
    };
  }

  async updateReferralProgram(
    tenantId: string,
    actorUserId: string,
    dto: UpdateReferralProgramDto,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.canonicalValueConfiguration.updateReferralPolicy(
      scopedTenantId,
      actorUserId,
      dto,
    );
    return this.getReferralProgram(scopedTenantId);
  }

  async ingestReview(
    tenantId: string,
    actorUserId: string,
    dto: IngestBusinessReviewDto,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const normalizedText = dto.text?.trim() || null;
    const topicTags = this.reviewTopics(normalizedText);
    const externalRef = dto.externalRef?.trim();
    if (!externalRef) {
      throw new BadRequestException('Exact review source identity required');
    }
    const row = await this.reviewFacts.accept({
      tenantId: scopedTenantId,
      source: dto.source.trim().toLowerCase(),
      externalRef,
      rating: dto.rating,
      occurredAt: new Date(dto.occurredAt),
      text: normalizedText,
      topicTags,
      branchId: dto.branchId?.trim() || null,
      staffExternalId: dto.staffExternalId?.trim() || null,
    });
    await this.auditLog.log({
      tenantId: scopedTenantId,
      userId: actorUserId,
      action: 'business_content.review.ingested',
      entityType: 'business_review',
      entityId: row.id,
      metadata: { source: row.source, rating: row.rating, topicTags },
    });
    return this.serializeReview(row);
  }

  async listReviews(
    tenantId: string,
    options: {
      days?: number;
      rating?: number;
      branchId?: string;
      limit?: number;
      calendar?: ReviewCalendarWindow;
      allRatings?: true;
    } = {},
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    if (options.calendar !== undefined) {
      return this.listCalendarReviews(scopedTenantId, options);
    }
    const from = this.reviewFrom(options.days);
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
    const rows = await this.prisma.businessReview.findMany({
      where: {
        tenantId: scopedTenantId,
        ...(from ? { occurredAt: { gte: from } } : {}),
        ...(options.rating ? { rating: options.rating } : {}),
        ...(options.branchId ? { branchId: options.branchId } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });
    return {
      configured: rows.length > 0,
      source: rows.length > 0 ? 'tenant_review_registry' : 'not_configured',
      count: rows.length,
      reviews: rows.map((row) => this.serializeReview(row)),
      privacy: 'review_text_redacted_from_ai',
      // Facts about this one query, not integration/setup status. Keep the
      // historical configured/source fields for existing HTTP consumers.
      read_scope: {
        contract: 'maya.review-registry-query/1' as const,
        from_inclusive: from?.toISOString() ?? null,
        to_exclusive: null,
        rating_exact: options.rating || null,
        scope: options.branchId ? ('one_branch' as const) : ('tenant' as const),
        order: 'occurred_at_desc' as const,
        limit,
        returned_count: rows.length,
        limit_reached: rows.length === limit,
        configuration_status: 'not_observed' as const,
      },
    };
  }

  /** Local registry scope; this does not establish a CRM integration. */
  async reviewCalendarTimezone(tenantId: string, branchId?: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    if (
      branchId !== undefined &&
      (typeof branchId !== 'string' ||
        branchId.length < 1 ||
        branchId.length > 128 ||
        branchId.trim() !== branchId ||
        Array.from(branchId).some((character) => {
          const code = character.charCodeAt(0);
          return code < 32 || code === 127;
        }))
    ) {
      throw new BadRequestException('review_calendar_query_invalid');
    }
    let timezone: unknown;
    try {
      if (branchId !== undefined) {
        const branch = await this.prisma.branch.findFirst({
          where: { id: branchId, tenantId: scopedTenantId },
          select: { timezone: true },
        });
        timezone = branch?.timezone;
      } else {
        const tenant = await this.prisma.tenant.findUnique({
          where: { id: scopedTenantId },
          select: { defaultTimezone: true },
        });
        timezone = tenant?.defaultTimezone;
      }
    } catch {
      throw new ServiceUnavailableException(
        'review_calendar_source_unavailable',
      );
    }
    if (
      !isUsableTimezone(timezone) ||
      timezone.trim() !== timezone ||
      timezone.length > 100
    ) {
      throw new ServiceUnavailableException(
        'review_calendar_source_unavailable',
      );
    }
    return timezone;
  }

  private async listCalendarReviews(
    tenantId: string,
    options: {
      days?: number;
      rating?: number;
      branchId?: string;
      limit?: number;
      calendar?: ReviewCalendarWindow;
      allRatings?: true;
    },
  ) {
    const calendar = options.calendar;
    const limit = options.limit ?? 20;
    const rating = options.rating;
    const branchId = options.branchId;
    if (
      !calendar ||
      Object.keys(calendar).sort().join(',') !==
        'fromInclusive,month,timezone,toExclusive' ||
      Object.keys(options).some(
        (key) =>
          !['rating', 'allRatings', 'branchId', 'limit', 'calendar'].includes(
            key,
          ),
      ) ||
      typeof calendar.month !== 'string' ||
      calendar.month.length !== 7 ||
      !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/u.test(calendar.month) ||
      !isUsableTimezone(calendar.timezone) ||
      calendar.timezone.trim() !== calendar.timezone ||
      calendar.timezone.length > 100 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      (rating === undefined
        ? options.allRatings !== true
        : !Number.isInteger(rating) ||
          rating < 1 ||
          rating > 5 ||
          options.allRatings !== undefined)
    ) {
      throw new BadRequestException('review_calendar_query_invalid');
    }
    // Capture every caller-owned field before the first asynchronous read.
    const window = { ...calendar };
    if (
      window.month >= localCalendarDate(window.timezone, new Date()).slice(0, 7)
    ) {
      throw new ConflictException('review_calendar_period_unavailable');
    }
    const next = new Date(`${window.month}-01T00:00:00.000Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const from = localDateMinuteToUtc(`${window.month}-01`, 0, window.timezone);
    const to = localDateMinuteToUtc(
      next.toISOString().slice(0, 10),
      0,
      window.timezone,
    );
    if (
      window.fromInclusive !== from.toISOString() ||
      window.toExclusive !== to.toISOString()
    ) {
      throw new BadRequestException('review_calendar_query_invalid');
    }
    if (to.getTime() > Date.now()) {
      throw new ConflictException('review_calendar_period_unavailable');
    }
    if (
      (await this.reviewCalendarTimezone(tenantId, branchId)) !==
      window.timezone
    ) {
      throw new ConflictException('review_calendar_scope_changed');
    }
    let snapshot;
    try {
      const rows = await this.prisma.businessReview.findMany({
        where: {
          tenantId,
          ...(branchId === undefined ? {} : { branchId }),
          ...(rating === undefined ? {} : { rating }),
          occurredAt: { gte: from, lt: to },
        },
        select: {
          id: true,
          tenantId: true,
          branchId: true,
          rating: true,
          occurredAt: true,
          topicTagsJson: true,
        },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      });
      const ids = new Set<string>();
      let previousTime = Infinity;
      if (!Array.isArray(rows) || rows.length > limit + 1)
        throw new Error('invalid_review_rows');
      const reviews = rows
        .map((row) => {
          const time =
            row.occurredAt instanceof Date ? row.occurredAt.getTime() : NaN;
          if (
            typeof row.id !== 'string' ||
            !row.id ||
            ids.has(row.id) ||
            row.tenantId !== tenantId ||
            (branchId !== undefined && row.branchId !== branchId) ||
            !Number.isInteger(row.rating) ||
            row.rating < 1 ||
            row.rating > 5 ||
            (rating !== undefined && row.rating !== rating) ||
            !Number.isFinite(time) ||
            time < from.getTime() ||
            time >= to.getTime() ||
            time > previousTime
          )
            throw new Error('invalid_review_row');
          ids.add(row.id);
          previousTime = time;
          return {
            rating: row.rating,
            occurred_at: row.occurredAt.toISOString(),
            topics: Array.isArray(row.topicTagsJson)
              ? [
                  ...new Set(
                    row.topicTagsJson.filter(
                      (topic): topic is string =>
                        typeof topic === 'string' &&
                        Object.hasOwn(REVIEW_TOPICS, topic),
                    ),
                  ),
                ]
              : [],
          };
        })
        .slice(0, limit);
      snapshot = {
        configured: reviews.length > 0,
        source: 'tenant_review_registry' as const,
        count: reviews.length,
        reviews,
        privacy: 'review_text_redacted_from_ai' as const,
        read_scope: {
          contract: 'maya.review-registry-query/2' as const,
          month: window.month,
          timezone: window.timezone,
          from_inclusive: window.fromInclusive,
          to_exclusive: window.toExclusive,
          branch_id: branchId ?? null,
          rating_mode:
            rating === undefined ? ('all' as const) : ('exact' as const),
          rating_exact: rating ?? null,
          scope:
            branchId === undefined
              ? ('tenant' as const)
              : ('one_branch' as const),
          order: 'occurred_at_desc' as const,
          limit,
          returned_count: reviews.length,
          has_more: rows.length > limit,
          configuration_status: 'not_observed' as const,
          observed_at: new Date().toISOString(),
        },
      };
    } catch {
      throw new ServiceUnavailableException(
        'review_calendar_source_unavailable',
      );
    }
    if (
      (await this.reviewCalendarTimezone(tenantId, branchId)) !==
      window.timezone
    ) {
      throw new ConflictException('review_calendar_scope_changed');
    }
    return snapshot;
  }

  async analyzeReviews(
    tenantId: string,
    options: { days?: number; branchId?: string } = {},
  ) {
    const rows = await this.reviewRows(tenantId, options);
    const distribution = Object.fromEntries(
      [1, 2, 3, 4, 5].map((rating) => [
        String(rating),
        rows.filter((row) => row.rating === rating).length,
      ]),
    );
    const topicCounts = new Map<string, number>();
    for (const row of rows) {
      for (const topic of this.topicTags(row)) {
        topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
      }
    }
    return {
      configured: rows.length > 0,
      source: rows.length > 0 ? 'tenant_review_registry' : 'not_configured',
      review_count: rows.length,
      average_rating: this.averageRating(rows),
      rating_distribution: distribution,
      topics: [...topicCounts.entries()]
        .map(([topic, count]) => ({ topic, count }))
        .sort(
          (left, right) =>
            right.count - left.count || left.topic.localeCompare(right.topic),
        ),
      privacy: 'aggregated_topics_only',
    };
  }

  async reviewTrend(
    tenantId: string,
    options: { days?: number; branchId?: string } = {},
  ) {
    const rows = await this.reviewRows(tenantId, options);
    const buckets = new Map<string, BusinessReview[]>();
    for (const row of rows) {
      const month = row.occurredAt.toISOString().slice(0, 7);
      buckets.set(month, [...(buckets.get(month) ?? []), row]);
    }
    const periods = [...buckets.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([month, reviews]) => ({
        month,
        review_count: reviews.length,
        average_rating: this.averageRating(reviews),
      }));
    const first = periods.at(0)?.average_rating ?? null;
    const last = periods.at(-1)?.average_rating ?? null;
    const delta =
      first === null || last === null
        ? null
        : Number((last - first).toFixed(2));
    return {
      configured: rows.length > 0,
      source: rows.length > 0 ? 'tenant_review_registry' : 'not_configured',
      review_count: rows.length,
      periods,
      rating_change: delta,
      direction:
        delta === null || delta === 0
          ? 'stable_or_insufficient_data'
          : delta > 0
            ? 'improving'
            : 'declining',
    };
  }

  private async reviewRows(
    tenantId: string,
    options: { days?: number; branchId?: string },
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const from = this.reviewFrom(options.days ?? 365);
    return this.prisma.businessReview.findMany({
      where: {
        tenantId: scopedTenantId,
        ...(from ? { occurredAt: { gte: from } } : {}),
        ...(options.branchId ? { branchId: options.branchId } : {}),
      },
      orderBy: { occurredAt: 'asc' },
      take: 10_000,
    });
  }

  private reviewFrom(days?: number): Date | null {
    if (!days) return null;
    return new Date(
      Date.now() - Math.min(Math.max(days, 1), 3650) * 86_400_000,
    );
  }

  private averageRating(rows: BusinessReview[]): number | null {
    if (rows.length === 0) return null;
    return Number(
      (rows.reduce((sum, row) => sum + row.rating, 0) / rows.length).toFixed(2),
    );
  }

  private topicTags(row: BusinessReview): string[] {
    if (!Array.isArray(row.topicTagsJson)) return [];
    return row.topicTagsJson.filter(
      (value): value is string =>
        typeof value === 'string' && Object.hasOwn(REVIEW_TOPICS, value),
    );
  }

  private reviewTopics(text: string | null): string[] {
    if (!text) return [];
    const normalized = text.toLocaleLowerCase('ru-RU');
    return Object.entries(REVIEW_TOPICS)
      .filter(([, markers]) =>
        markers.some((marker) => normalized.includes(marker)),
      )
      .map(([topic]) => topic);
  }

  private serializeReview(row: BusinessReview) {
    return {
      id: row.id,
      source: row.source,
      rating: row.rating,
      occurred_at: row.occurredAt,
      topics: this.topicTags(row),
      branch_id: row.branchId,
      staff_external_id: row.staffExternalId,
      has_private_text: Boolean(row.encryptedText),
    };
  }

  private async catalogItemResult(
    tenantId: string,
    kind: Exclude<BusinessContentKind, 'inventory'>,
    itemId: string,
  ) {
    const row = await this.prisma.tenantCatalogItem.findFirst({
      where: { id: itemId, tenantId, kind },
    });
    if (!row) {
      throw new BadRequestException(
        'Canonical offer result is missing its committed row',
      );
    }
    return this.serializeCatalogItem(row);
  }

  private catalogSource(rows: TenantCatalogItem[]): string {
    const sources = [...new Set(rows.map((row) => row.source))];
    return sources.length === 1 ? sources[0] : 'mixed';
  }

  private serializeCatalogItem(row: TenantCatalogItem) {
    const lowStock =
      row.quantity !== null &&
      row.lowStockThreshold !== null &&
      row.quantity <= row.lowStockThreshold;
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      description: row.description,
      price_kopecks: row.priceKopecks,
      currency: row.currency,
      quantity: row.quantity,
      low_stock_threshold: row.lowStockThreshold,
      low_stock: lowStock,
      active: row.active,
      source: row.source,
      updated_at: row.updatedAt,
    };
  }
}
