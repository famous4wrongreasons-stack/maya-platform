import { Injectable, NotFoundException } from '@nestjs/common';
import type { BusinessReview, TenantCatalogItem } from '@prisma/client';

import { AuditLogService } from '../audit-log/audit-log.service';
import { asJson } from '../common/json.util';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { IngestBusinessReviewDto } from './dto/business-review.dto';
import type { UpsertCatalogItemDto } from './dto/catalog-item.dto';
import type { UpdateReferralProgramDto } from './dto/referral-program.dto';

export const BUSINESS_CONTENT_KINDS = [
  'inventory',
  'certificate',
  'membership',
] as const;

export type BusinessContentKind = (typeof BUSINESS_CONTENT_KINDS)[number];

type CatalogMutableData = {
  name: string;
  description: string | null;
  priceKopecks: number | null;
  currency: string;
  quantity: number | null;
  lowStockThreshold: number | null;
  active: boolean;
  source: string;
  externalRef: string | null;
};

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
    private readonly encryption: EncryptionService,
    private readonly auditLog: AuditLogService,
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
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const row = await this.prisma.tenantCatalogItem.create({
      data: {
        tenantId: scopedTenantId,
        kind,
        ...this.catalogData(kind, dto),
      },
    });
    await this.auditLog.log({
      tenantId: scopedTenantId,
      userId: actorUserId,
      action: 'business_content.catalog.created',
      entityType: 'tenant_catalog_item',
      entityId: row.id,
      metadata: { kind, source: row.source },
    });
    return this.serializeCatalogItem(row);
  }

  async updateCatalogItem(
    tenantId: string,
    actorUserId: string,
    kind: BusinessContentKind,
    itemId: string,
    dto: UpsertCatalogItemDto,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.requireCatalogItem(scopedTenantId, kind, itemId);
    const row = await this.prisma.tenantCatalogItem.update({
      where: { id: itemId },
      data: this.catalogData(kind, dto),
    });
    await this.auditLog.log({
      tenantId: scopedTenantId,
      userId: actorUserId,
      action: 'business_content.catalog.updated',
      entityType: 'tenant_catalog_item',
      entityId: row.id,
      metadata: { kind, source: row.source },
    });
    return this.serializeCatalogItem(row);
  }

  async deleteCatalogItem(
    tenantId: string,
    actorUserId: string,
    kind: BusinessContentKind,
    itemId: string,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.requireCatalogItem(scopedTenantId, kind, itemId);
    await this.prisma.tenantCatalogItem.delete({ where: { id: itemId } });
    await this.auditLog.log({
      tenantId: scopedTenantId,
      userId: actorUserId,
      action: 'business_content.catalog.deleted',
      entityType: 'tenant_catalog_item',
      entityId: itemId,
      metadata: { kind },
    });
    return { ok: true, deleted: true, id: itemId };
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
    const data = {
      ...(dto.enabled === undefined ? {} : { enabled: dto.enabled }),
      ...(dto.inviterRewardKopecks === undefined
        ? {}
        : { inviterRewardKopecks: dto.inviterRewardKopecks }),
      ...(dto.inviteeRewardKopecks === undefined
        ? {}
        : { inviteeRewardKopecks: dto.inviteeRewardKopecks }),
      ...(dto.currency === undefined
        ? {}
        : { currency: dto.currency.toUpperCase() }),
      ...(dto.terms === undefined ? {} : { terms: dto.terms.trim() || null }),
      ...(dto.codePrefix === undefined
        ? {}
        : { codePrefix: dto.codePrefix.toUpperCase() }),
    };
    const row = await this.prisma.referralProgram.upsert({
      where: { tenantId: scopedTenantId },
      update: data,
      create: { tenantId: scopedTenantId, ...data },
    });
    await this.auditLog.log({
      tenantId: scopedTenantId,
      userId: actorUserId,
      action: 'business_content.referrals.updated',
      entityType: 'referral_program',
      entityId: row.id,
      metadata: { enabled: row.enabled },
    });
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
    const data = {
      tenantId: scopedTenantId,
      source: dto.source.trim().toLowerCase(),
      externalRef: dto.externalRef?.trim() || null,
      rating: dto.rating,
      occurredAt: new Date(dto.occurredAt),
      encryptedText: normalizedText
        ? this.encryption.encrypt(normalizedText)
        : null,
      topicTagsJson: asJson(topicTags),
      branchId: dto.branchId?.trim() || null,
      staffExternalId: dto.staffExternalId?.trim() || null,
    };
    const row = data.externalRef
      ? await this.prisma.businessReview.upsert({
          where: {
            tenantId_source_externalRef: {
              tenantId: scopedTenantId,
              source: data.source,
              externalRef: data.externalRef,
            },
          },
          update: data,
          create: data,
        })
      : await this.prisma.businessReview.create({ data });
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

  private async requireCatalogItem(
    tenantId: string,
    kind: BusinessContentKind,
    itemId: string,
  ) {
    const row = await this.prisma.tenantCatalogItem.findFirst({
      where: { id: itemId, tenantId, kind },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException({
        message: 'Catalog item was not found.',
        error: { code: 'catalog_item_not_found' },
      });
    }
  }

  private catalogData(
    kind: BusinessContentKind,
    dto: UpsertCatalogItemDto,
  ): CatalogMutableData {
    return {
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      priceKopecks: dto.priceKopecks ?? null,
      currency: (dto.currency ?? 'RUB').toUpperCase(),
      quantity: kind === 'inventory' ? (dto.quantity ?? null) : null,
      lowStockThreshold:
        kind === 'inventory' ? (dto.lowStockThreshold ?? null) : null,
      active: dto.active ?? true,
      source: dto.source?.trim().toLowerCase() || 'manual',
      externalRef: dto.externalRef?.trim() || null,
    };
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
