import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TenantCatalogItem } from '@prisma/client';

import type { UpsertCatalogItemDto } from '../business-content/dto/catalog-item.dto';
import type { UploadedLogoFile } from '../branding/branding.service';
import type { CreateInternalProviderDto } from '../internal-calendar/dto/create-internal-provider.dto';
import type { CreateInternalServiceDto } from '../internal-calendar/dto/create-internal-service.dto';
import type { CreateTimeOffDto } from '../internal-calendar/dto/create-time-off.dto';
import type { WeeklyAvailabilityRuleDto } from '../internal-calendar/dto/replace-weekly-availability.dto';
import type { UpdateInternalProviderDto } from '../internal-calendar/dto/update-internal-provider.dto';
import type { UpdateInternalServiceDto } from '../internal-calendar/dto/update-internal-service.dto';
import {
  minuteToTime,
  parseTimeToMinute,
} from '../internal-calendar/internal-calendar.utils';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaResource } from '../quotas/quota-resource';
import { QuotaService } from '../quotas/quota.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  Package5Wave4ExecutableService,
  Package5Wave4ShadowService,
  type Package5Wave4Actor,
  type Package5Wave4Command,
  type Package5Wave4ExecutionValue,
} from './package5-wave4.service';

type CommandWithoutSource = Package5Wave4Command extends infer Command
  ? Command extends Package5Wave4Command
    ? Omit<Command, 'sourceIntentRef'>
    : never
  : never;

const SAFE_OCCURRENCE_ID = /^[A-Za-z0-9._:-]{8,240}$/;

/**
 * Production adapter for the twelve approved Wave 4 commands. Controllers
 * remain initiators only; every mutation crosses Canonical Action Ingress and
 * the Action Engine before the domain executor is allowed to commit it.
 */
@Injectable()
export class Package5Wave4CanonicalCutoverService {
  constructor(
    private readonly planner: Package5Wave4ShadowService,
    private readonly executor: Package5Wave4ExecutableService,
    private readonly tenantContext: TenantContextService,
    private readonly prisma: PrismaService,
    private readonly quotas: QuotaService,
  ) {}

  async execute(
    tenantId: string,
    actor: Package5Wave4Actor,
    command: CommandWithoutSource,
    idempotencyKey?: string,
  ): Promise<Package5Wave4ExecutionValue> {
    const prepared = await this.planner.build(
      tenantId,
      actor,
      { ...command, sourceIntentRef: this.intentRef(idempotencyKey) },
      'execute',
    );
    return prepared.existingExecution
      ? this.executor.resume(prepared)
      : this.executor.execute(prepared);
  }

  async createInventoryItem(
    tenantId: string,
    actorUserId: string,
    dto: UpsertCatalogItemDto,
    idempotencyKey?: string,
  ) {
    this.rejectInventoryOfferIdentity(dto);
    const result = await this.execute(
      tenantId,
      { userId: actorUserId },
      {
        operation: 'create_inventory_item',
        item: this.inventoryFields(dto),
      },
      idempotencyKey,
    );
    return this.inventoryResult(tenantId, result.targetRef);
  }

  async updateInventoryItem(
    tenantId: string,
    actorUserId: string,
    itemId: string,
    dto: UpsertCatalogItemDto,
    idempotencyKey?: string,
  ) {
    this.rejectInventoryOfferIdentity(dto);
    const result = await this.execute(
      tenantId,
      { userId: actorUserId },
      {
        operation: 'update_inventory_item',
        itemId,
        patch: this.inventoryFields(dto),
      },
      idempotencyKey,
    );
    return this.inventoryResult(tenantId, result.targetRef);
  }

  async archiveInventoryItem(
    tenantId: string,
    actorUserId: string,
    itemId: string,
    idempotencyKey?: string,
  ) {
    await this.execute(
      tenantId,
      { userId: actorUserId },
      { operation: 'archive_inventory_item', itemId },
      idempotencyKey,
    );
    return { ok: true, deleted: true, archived: true, id: itemId };
  }

  async createService(
    tenantId: string,
    actorUserId: string,
    dto: CreateInternalServiceDto,
    idempotencyKey?: string,
  ) {
    const result = await this.execute(
      tenantId,
      { userId: actorUserId },
      { operation: 'create_internal_service', service: { ...dto } },
      idempotencyKey,
    );
    return this.serviceResult(tenantId, result.targetRef);
  }

  async updateService(
    tenantId: string,
    actorUserId: string,
    serviceId: string,
    dto: UpdateInternalServiceDto,
    idempotencyKey?: string,
  ) {
    const result = await this.execute(
      tenantId,
      { userId: actorUserId },
      { operation: 'update_internal_service', serviceId, patch: { ...dto } },
      idempotencyKey,
    );
    return this.serviceResult(tenantId, result.targetRef);
  }

  async archiveService(
    tenantId: string,
    actorUserId: string,
    serviceId: string,
    idempotencyKey?: string,
  ) {
    const result = await this.execute(
      tenantId,
      { userId: actorUserId },
      { operation: 'archive_internal_service', serviceId },
      idempotencyKey,
    );
    return this.serviceResult(tenantId, result.targetRef);
  }

  async createProvider(
    tenantId: string,
    actorUserId: string,
    dto: CreateInternalProviderDto,
    idempotencyKey?: string,
  ) {
    this.rejectInlineAvatar(dto.avatarUrl);
    await this.quotas.assertCanCreate(tenantId, QuotaResource.STAFF);
    const result = await this.execute(
      tenantId,
      { userId: actorUserId },
      {
        operation: 'create_internal_provider',
        provider: {
          displayName: dto.displayName,
          title: dto.title,
          specialization: dto.specialization,
          branchId: dto.branchId,
          slotIntervalMinutes: dto.slotIntervalMinutes,
        },
      },
      idempotencyKey,
    );
    return this.providerResult(tenantId, result.targetRef);
  }

  async updateProvider(
    tenantId: string,
    actorUserId: string,
    providerId: string,
    dto: UpdateInternalProviderDto,
    idempotencyKey?: string,
  ) {
    this.rejectInlineAvatar(dto.avatarUrl);
    if (dto.active === true) {
      const current = await this.prisma.internalProvider.findUnique({
        where: { id_tenantId: { id: providerId, tenantId } },
        select: { active: true, userId: true },
      });
      if (!current) throw new NotFoundException('Internal provider not found');
      if (!current.active && current.userId === null) {
        await this.quotas.assertCanCreate(tenantId, QuotaResource.STAFF);
      }
    }
    const result = await this.execute(
      tenantId,
      { userId: actorUserId },
      {
        operation: 'update_internal_provider',
        providerId,
        patch: {
          displayName: dto.displayName,
          title: dto.title,
          specialization: dto.specialization,
          branchId: dto.branchId,
          slotIntervalMinutes: dto.slotIntervalMinutes,
          active: dto.active,
        },
      },
      idempotencyKey,
    );
    return this.providerResult(tenantId, result.targetRef);
  }

  async replaceWeeklyAvailability(
    tenantId: string,
    actorUserId: string,
    providerId: string,
    rules: WeeklyAvailabilityRuleDto[],
    idempotencyKey?: string,
  ) {
    await this.execute(
      tenantId,
      { userId: actorUserId },
      {
        operation: 'replace_weekly_availability',
        providerId,
        rules: rules.map((rule) => ({
          weekday: rule.weekday,
          startMinute: parseTimeToMinute(rule.startTime),
          endMinute: parseTimeToMinute(rule.endTime),
        })),
      },
      idempotencyKey,
    );
    return this.scheduleResult(tenantId, providerId);
  }

  async createTimeOff(
    tenantId: string,
    actorUserId: string,
    providerId: string,
    dto: CreateTimeOffDto,
    idempotencyKey?: string,
  ) {
    const result = await this.execute(
      tenantId,
      { userId: actorUserId },
      {
        operation: 'create_time_off',
        providerId,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        note: dto.note,
      },
      idempotencyKey,
    );
    const row = await this.prisma.internalAvailabilityException.findFirst({
      where: { id: result.targetRef, tenantId, providerId },
    });
    if (!row) throw new ConflictException('Canonical time-off result missing');
    return {
      id: row.id,
      provider_id: row.providerId,
      start_at: row.startAt,
      end_at: row.endAt,
      note: row.note,
    };
  }

  async deleteTimeOff(
    tenantId: string,
    actorUserId: string,
    providerId: string,
    exceptionId: string,
    idempotencyKey?: string,
  ) {
    await this.execute(
      tenantId,
      { userId: actorUserId },
      { operation: 'delete_time_off', providerId, exceptionId },
      idempotencyKey,
    );
    return { ok: true };
  }

  async uploadProviderAvatar(
    tenantId: string,
    actorUserId: string,
    providerId: string,
    file: UploadedLogoFile | undefined,
    idempotencyKey?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Provider avatar file is required');
    }
    const result = await this.execute(
      tenantId,
      { userId: actorUserId },
      {
        operation: 'upload_provider_avatar',
        providerId,
        mimeType: file.mimetype,
        bytes: file.buffer,
      },
      idempotencyKey,
    );
    const provider = await this.prisma.internalProvider.findUnique({
      where: { id_tenantId: { id: result.targetRef, tenantId } },
      select: { id: true, avatarUrl: true },
    });
    if (!provider?.avatarUrl) {
      throw new ConflictException('Canonical provider avatar result missing');
    }
    return { provider_id: provider.id, avatar_url: provider.avatarUrl };
  }

  intentRef(value?: string): string {
    const normalized =
      value?.trim() || this.tenantContext.get()?.requestId?.trim() || '';
    if (!SAFE_OCCURRENCE_ID.test(normalized)) {
      throw new BadRequestException(
        'A bounded idempotency identity is required',
      );
    }
    return normalized;
  }

  private inventoryFields(dto: UpsertCatalogItemDto) {
    return {
      name: dto.name,
      description: dto.description,
      priceKopecks: dto.priceKopecks,
      currency: dto.currency,
      quantity: dto.quantity,
      lowStockThreshold: dto.lowStockThreshold,
      active: dto.active,
      source: dto.source,
      externalRef: dto.externalRef,
    };
  }

  private async inventoryResult(tenantId: string, itemId: string) {
    const row = await this.prisma.tenantCatalogItem.findFirst({
      where: { id: itemId, tenantId, kind: 'inventory' },
    });
    if (!row) throw new ConflictException('Canonical inventory result missing');
    return this.serializeInventory(row);
  }

  private async serviceResult(tenantId: string, serviceId: string) {
    const row = await this.prisma.internalService.findUnique({
      where: { id_tenantId: { id: serviceId, tenantId } },
    });
    if (!row) throw new ConflictException('Canonical service result missing');
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      price: row.price,
      duration_minutes: row.durationMinutes,
      buffer_before_minutes: row.bufferBeforeMinutes,
      buffer_after_minutes: row.bufferAfterMinutes,
      currency: row.currency,
      category: 'Услуги',
      active: row.active,
      sort_order: row.sortOrder,
    };
  }

  private async providerResult(tenantId: string, providerId: string) {
    const row = await this.prisma.internalProvider.findUnique({
      where: { id_tenantId: { id: providerId, tenantId } },
      include: { branch: true },
    });
    if (!row) throw new ConflictException('Canonical provider result missing');
    return {
      id: row.id,
      user_id: row.userId,
      branch_id: row.branchId,
      name: row.displayName,
      title: row.title ?? undefined,
      specialization: row.specialization ?? undefined,
      avatar_url: row.avatarUrl,
      rating: null,
      active: row.active,
      slot_interval_minutes: row.slotIntervalMinutes,
      branch: row.branch
        ? {
            id: row.branch.id,
            name: row.branch.name,
            timezone: row.branch.timezone,
          }
        : null,
    };
  }

  private async scheduleResult(tenantId: string, providerId: string) {
    const provider = await this.prisma.internalProvider.findUnique({
      where: { id_tenantId: { id: providerId, tenantId } },
      select: { id: true },
    });
    if (!provider) throw new NotFoundException('Internal provider not found');
    const [rules, exceptions] = await Promise.all([
      this.prisma.internalAvailabilityRule.findMany({
        where: { tenantId, providerId, active: true },
        orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
      }),
      this.prisma.internalAvailabilityException.findMany({
        where: { tenantId, providerId, endAt: { gte: new Date() } },
        orderBy: { startAt: 'asc' },
      }),
    ]);
    return {
      provider_id: providerId,
      rules: rules.map((rule) => ({
        id: rule.id,
        weekday: rule.weekday,
        start_time: minuteToTime(rule.startMinute),
        end_time: minuteToTime(rule.endMinute),
      })),
      time_off: exceptions.map((exception) => ({
        id: exception.id,
        start_at: exception.startAt,
        end_at: exception.endAt,
        note: exception.note,
      })),
    };
  }

  private rejectInventoryOfferIdentity(dto: UpsertCatalogItemDto) {
    if (dto.canonicalTemplateKey !== undefined) {
      throw new BadRequestException(
        'Inventory cannot claim canonical value-offer identity',
      );
    }
  }

  private rejectInlineAvatar(avatarUrl: string | undefined) {
    if (avatarUrl !== undefined) {
      throw new BadRequestException(
        'Provider avatar must use the canonical upload action',
      );
    }
  }

  private serializeInventory(row: TenantCatalogItem) {
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      description: row.description,
      price_kopecks: row.priceKopecks,
      currency: row.currency,
      quantity: row.quantity,
      low_stock_threshold: row.lowStockThreshold,
      low_stock:
        row.quantity !== null &&
        row.lowStockThreshold !== null &&
        row.quantity <= row.lowStockThreshold,
      active: row.active,
      source: row.source,
      updated_at: row.updatedAt,
    };
  }
}
