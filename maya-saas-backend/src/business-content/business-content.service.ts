import { BadRequestException, Injectable } from '@nestjs/common';
import type { BusinessReview, TenantCatalogItem } from '@prisma/client';

import { AuditLogService } from '../audit-log/audit-log.service';
import { Package5Wave4CanonicalCutoverService } from '../package5-wave4/package5-wave4-canonical-cutover.service';
import { Package5Wave4ReviewFactService } from '../package5-wave4/package5-wave4.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
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
    } = {},
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const from = this.reviewFrom(options.days);
    const rows = await this.prisma.businessReview.findMany({
      where: {
        tenantId: scopedTenantId,
        ...(from ? { occurredAt: { gte: from } } : {}),
        ...(options.rating ? { rating: options.rating } : {}),
        ...(options.branchId ? { branchId: options.branchId } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: Math.min(Math.max(options.limit ?? 20, 1), 50),
    });
    return {
      configured: rows.length > 0,
      source: rows.length > 0 ? 'tenant_review_registry' : 'not_configured',
      count: rows.length,
      reviews: rows.map((row) => this.serializeReview(row)),
      privacy: 'review_text_redacted_from_ai',
    };
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
      (value): value is string => typeof value === 'string',
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
