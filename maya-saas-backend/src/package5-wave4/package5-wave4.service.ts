import { createHash, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ActionAttemptKind,
  ActionAttemptState,
  ActionExecutionState,
  ActionPolicyDecision,
  ExternalDispatchState,
  Prisma,
  type ActionExecution,
  type PrismaClient,
} from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineKernel,
  ActionEngineRuntimeService,
  CanonicalActionIngressService,
  PACKAGE5_WAVE4_POLICY_VERSION,
  PACKAGE5_WAVE4_REGISTRATIONS,
  type Package5Wave4ActionClass,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

type Tx = Prisma.TransactionClient;
type Mode = 'shadow' | 'execute';

const MANAGER_ROLES = new Set([
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
]);
const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_WEEKLY_RULES = 28;

type InventoryFields = {
  name: string;
  description?: string | null;
  priceKopecks?: number | null;
  currency?: string;
  quantity?: number | null;
  lowStockThreshold?: number | null;
  source?: string;
  externalRef?: string | null;
  active?: boolean;
};

type ServiceFields = {
  name?: string;
  description?: string | null;
  price?: number;
  currency?: string;
  durationMinutes?: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  sortOrder?: number;
  active?: boolean;
};

type ProviderFields = {
  displayName?: string;
  title?: string | null;
  specialization?: string | null;
  branchId?: string | null;
  slotIntervalMinutes?: number;
  active?: boolean;
};

export type Package5Wave4Command =
  | {
      operation: 'create_inventory_item';
      sourceIntentRef: string;
      item: InventoryFields;
    }
  | {
      operation: 'update_inventory_item';
      sourceIntentRef: string;
      itemId: string;
      patch: InventoryFields;
    }
  | {
      operation: 'archive_inventory_item';
      sourceIntentRef: string;
      itemId: string;
    }
  | {
      operation: 'create_internal_service';
      sourceIntentRef: string;
      service: Required<
        Pick<ServiceFields, 'name' | 'price' | 'durationMinutes'>
      > &
        ServiceFields;
    }
  | {
      operation: 'update_internal_service';
      sourceIntentRef: string;
      serviceId: string;
      patch: ServiceFields;
    }
  | {
      operation: 'archive_internal_service';
      sourceIntentRef: string;
      serviceId: string;
    }
  | {
      operation: 'create_internal_provider';
      sourceIntentRef: string;
      provider: Required<Pick<ProviderFields, 'displayName'>> & ProviderFields;
    }
  | {
      operation: 'update_internal_provider';
      sourceIntentRef: string;
      providerId: string;
      patch: ProviderFields;
    }
  | {
      operation: 'replace_weekly_availability';
      sourceIntentRef: string;
      providerId: string;
      rules: Array<{ weekday: number; startMinute: number; endMinute: number }>;
    }
  | {
      operation: 'create_time_off';
      sourceIntentRef: string;
      providerId: string;
      startAt: Date;
      endAt: Date;
      note?: string | null;
    }
  | {
      operation: 'delete_time_off';
      sourceIntentRef: string;
      providerId: string;
      exceptionId: string;
    }
  | {
      operation: 'upload_provider_avatar';
      sourceIntentRef: string;
      providerId: string;
      mimeType: string;
      bytes: Buffer;
    };

export interface Package5Wave4Actor {
  userId: string;
}

export interface Package5Wave4StoredObject {
  url: string;
  contentHash: string;
}

export interface Package5Wave4ObjectStore {
  put(input: {
    requestIdentityHash: string;
    contentHash: string;
    mimeType: string;
    bytes: Buffer;
  }): Promise<Package5Wave4StoredObject>;
  head(requestIdentityHash: string): Promise<Package5Wave4StoredObject | null>;
}

interface Facts {
  targetRef: string;
  before: unknown;
  desired: unknown;
  changedFields: string[];
  providerRequestIdentityHash: string | null;
  providerObjectContentHash: string | null;
}

export interface Package5Wave4Prepared {
  request: TrustedActionExecutionRequestV1;
  command: Package5Wave4Command;
  actor: Package5Wave4Actor;
  existingExecution: ActionExecution | null;
}

export interface Package5Wave4ShadowResult {
  actionClass: Package5Wave4ActionClass;
  actionExecutionId: string;
  outcome: 'planned';
  shadowDivergences: 0;
  businessMutations: 0;
  providerWrites: 0;
}

export interface Package5Wave4ExecutionValue {
  actionClass: Package5Wave4ActionClass;
  actionExecutionId: string;
  targetRef: string;
  targetGeneration: number;
  businessMutations: 1;
  providerWrites: 0 | 1;
  unknownApplicable: boolean;
}

export class Package5Wave4Error extends Error {}

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return wave4Hash(value);
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

export function wave4Hash(value: unknown): string {
  const material = Buffer.isBuffer(value)
    ? value
    : Buffer.from(JSON.stringify(canonical(value)));
  return createHash('sha256').update(material).digest('hex');
}

export class Package5Wave4ShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly kernel: ActionEngineKernel,
  ) {}

  async plan(
    tenantId: string,
    actor: Package5Wave4Actor,
    command: Package5Wave4Command,
  ): Promise<Package5Wave4ShadowResult> {
    const prepared = await this.build(tenantId, actor, command, 'shadow');
    const execution =
      prepared.existingExecution ??
      (await this.actionEngine.planShadow(prepared.request));
    if (
      !execution.dryRun ||
      execution.state !== ActionExecutionState.NOT_EXECUTED ||
      execution.notExecutedReasonCode !== 'shadow_only'
    ) {
      throw new Package5Wave4Error('Wave 4 Shadow crossed mutation boundary');
    }
    return {
      actionClass: execution.actionClass as Package5Wave4ActionClass,
      actionExecutionId: execution.id,
      outcome: 'planned',
      shadowDivergences: 0,
      businessMutations: 0,
      providerWrites: 0,
    };
  }

  async build(
    tenantId: string,
    actor: Package5Wave4Actor,
    command: Package5Wave4Command,
    mode: Mode,
  ): Promise<Package5Wave4Prepared> {
    const scoped = this.tenantContext.assertTenantId(tenantId);
    const registration = PACKAGE5_WAVE4_REGISTRATIONS.find(
      (candidate) => candidate.operation === command.operation,
    );
    if (!registration) throw new BadRequestException('Unknown Wave 4 action');
    const authority = await this.resolveActor(scoped, actor.userId);
    const sourceIntentRef = this.bounded(command.sourceIntentRef);
    const sourceRef = `p5w4:${wave4Hash({
      tenantId: scoped,
      operation: command.operation,
      sourceIntentRef,
    })}`;
    const capability =
      mode === 'shadow'
        ? registration.shadowCapability
        : registration.executableCapability;
    const prior = await this.prisma.actionExecution.findMany({
      where: { tenantId: scoped, capability, sourceRef },
      orderBy: { createdAt: 'asc' },
      take: 2,
    });
    if (prior.length > 1) {
      throw new Package5Wave4Error('Source identity has multiple executions');
    }
    const requestMaterialHash = this.requestMaterialHash(command);
    if (prior[0]) {
      const input = await this.kernel.readTrustedNormalizedInput(
        scoped,
        prior[0].id,
      );
      if (
        input.operation !== command.operation ||
        input.requestMaterialHash !== requestMaterialHash ||
        input.actorIdentityHash !== authority.actorIdentityHash
      ) {
        throw new ConflictException(
          'Source identity reused with changed Wave 4 material',
        );
      }
      return {
        request: this.retryRequest(
          scoped,
          capability,
          sourceRef,
          actor.userId,
          prior[0],
          input,
          mode,
        ),
        command,
        actor,
        existingExecution: prior[0],
      };
    }
    const facts = await this.resolveFacts(scoped, command, sourceIntentRef);
    const targetGeneration = await this.nextGeneration(
      scoped,
      registration.targetKind,
      facts.targetRef,
    );
    const beforeStateHash =
      facts.before === null ? null : wave4Hash(facts.before);
    const desiredStateHash = wave4Hash(facts.desired);
    const policySnapshotHash = wave4Hash({
      contract: PACKAGE5_WAVE4_POLICY_VERSION,
      tenantId: scoped,
      operation: command.operation,
      targetRef: facts.targetRef,
      targetGeneration,
      actorRole: authority.role,
      oneTargetCount: 1,
      bulkMutation: false,
      prospectiveOnly: true,
    });
    const request: TrustedActionExecutionRequestV1 = {
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: scoped,
      capability,
      source: {
        type: mode === 'shadow' ? 'synthetic_shadow' : 'authenticated_request',
        occurrenceScope: `package5-wave4:${command.operation}:${facts.targetRef}:g${targetGeneration}`,
        sourceRef,
        actorUserId: actor.userId,
      },
      targetRef: facts.targetRef,
      input: {
        operation: command.operation,
        targetKind: registration.targetKind,
        targetRef: facts.targetRef,
        mutationKey: `g${targetGeneration}:${command.operation}`,
        targetGeneration,
        beforeStateHash,
        afterStateHash: desiredStateHash,
        desiredStateHash,
        requestMaterialHash,
        actorMembershipId: authority.membershipId,
        actorRole: authority.role,
        actorIdentityHash: authority.actorIdentityHash,
        policyVersion: PACKAGE5_WAVE4_POLICY_VERSION,
        policySnapshotHash,
        approvalRequirement: 'SERVER_DERIVED_AUTHORITY',
        oneTargetCount: 1,
        bulkMutation: false,
        changedFields: facts.changedFields,
        intendedMutation: command.operation,
        mutationPerformed: false,
        providerOperation:
          registration.authorityClass === 'AC2'
            ? 'put_content_bound_provider_avatar'
            : null,
        providerRequestIdentityHash: facts.providerRequestIdentityHash,
        providerObjectContentHash: facts.providerObjectContentHash,
      },
      evidenceRefs: [
        `package5-wave4-policy:${policySnapshotHash}`,
        `package5-wave4-desired:${desiredStateHash}`,
      ],
      callerIdempotency: {
        scope: `package5.wave4.${mode}.${command.operation}`,
        key: sourceRef,
      },
    };
    return { request, command, actor, existingExecution: null };
  }

  async assertStillCurrent(
    tenantId: string,
    actorUserId: string,
    command: Package5Wave4Command,
    input: Record<string, unknown>,
  ) {
    await this.resolveActor(tenantId, actorUserId);
    const facts = await this.resolveFacts(
      tenantId,
      command,
      command.sourceIntentRef,
    );
    if (
      facts.targetRef !== input.targetRef ||
      (facts.before === null ? null : wave4Hash(facts.before)) !==
        input.beforeStateHash ||
      wave4Hash(facts.desired) !== input.desiredStateHash ||
      this.requestMaterialHash(command) !== input.requestMaterialHash
    ) {
      throw new ConflictException('Wave 4 target changed after planning');
    }
  }

  private async resolveActor(tenantId: string, userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: {
        id: true,
        role: true,
        status: true,
        user: { select: { status: true } },
      },
    });
    if (
      !membership ||
      membership.status !== 'active' ||
      membership.user.status !== 'active' ||
      !MANAGER_ROLES.has(String(membership.role))
    ) {
      throw new ForbiddenException('Wave 4 manager authority required');
    }
    return {
      membershipId: membership.id,
      role: String(membership.role),
      actorIdentityHash: wave4Hash({ tenantId, userId, role: membership.role }),
    };
  }

  private async resolveFacts(
    tenantId: string,
    command: Package5Wave4Command,
    sourceIntentRef: string,
  ): Promise<Facts> {
    const empty = {
      providerRequestIdentityHash: null,
      providerObjectContentHash: null,
    };
    if (command.operation === 'create_inventory_item') {
      const targetRef = this.deterministicId(
        'inventory',
        tenantId,
        sourceIntentRef,
      );
      const existing = await this.prisma.tenantCatalogItem.findUnique({
        where: { id_tenantId: { id: targetRef, tenantId } },
      });
      if (existing)
        throw new ConflictException('Inventory target already exists');
      const desired = this.canonicalInventoryCreate(command.item);
      return {
        ...empty,
        targetRef,
        before: null,
        desired,
        changedFields: Object.keys(desired),
      };
    }
    if (
      command.operation === 'update_inventory_item' ||
      command.operation === 'archive_inventory_item'
    ) {
      const row = await this.prisma.tenantCatalogItem.findFirst({
        where: { id: command.itemId, tenantId, kind: 'inventory' },
      });
      if (!row) throw new NotFoundException('Inventory item not found');
      if (row.currentValueVersionId || row.canonicalTemplateKey) {
        throw new ConflictException('Value-bearing offer belongs to P4-09');
      }
      const before = this.safeInventory(row);
      const desired =
        command.operation === 'archive_inventory_item'
          ? { ...before, active: false }
          : { ...before, ...this.canonicalInventoryPatch(command.patch) };
      if (wave4Hash(before) === wave4Hash(desired)) {
        throw new ConflictException('Inventory already has desired state');
      }
      return {
        ...empty,
        targetRef: row.id,
        before,
        desired,
        changedFields:
          command.operation === 'archive_inventory_item'
            ? ['active']
            : Object.keys(this.canonicalInventoryPatch(command.patch)),
      };
    }
    await this.assertInternalCalendar(tenantId);
    if (command.operation === 'create_internal_service') {
      const targetRef = this.deterministicId(
        'service',
        tenantId,
        sourceIntentRef,
      );
      const existing = await this.prisma.internalService.findUnique({
        where: { id_tenantId: { id: targetRef, tenantId } },
      });
      if (existing)
        throw new ConflictException('Service target already exists');
      const desired = this.canonicalServiceCreate(command.service);
      return {
        ...empty,
        targetRef,
        before: null,
        desired,
        changedFields: Object.keys(desired),
      };
    }
    if (
      command.operation === 'update_internal_service' ||
      command.operation === 'archive_internal_service'
    ) {
      const row = await this.prisma.internalService.findUnique({
        where: { id_tenantId: { id: command.serviceId, tenantId } },
      });
      if (!row) throw new NotFoundException('Internal service not found');
      const before = this.safeService(row);
      const patch =
        command.operation === 'archive_internal_service'
          ? { active: false }
          : this.canonicalServicePatch(command.patch);
      const desired = { ...before, ...patch };
      if (wave4Hash(before) === wave4Hash(desired)) {
        throw new ConflictException('Service already has desired state');
      }
      return {
        ...empty,
        targetRef: row.id,
        before,
        desired,
        changedFields: Object.keys(patch),
      };
    }
    if (command.operation === 'create_internal_provider') {
      const targetRef = this.deterministicId(
        'provider',
        tenantId,
        sourceIntentRef,
      );
      const existing = await this.prisma.internalProvider.findUnique({
        where: { id_tenantId: { id: targetRef, tenantId } },
      });
      if (existing)
        throw new ConflictException('Provider target already exists');
      const desired = await this.canonicalProviderCreate(
        tenantId,
        command.provider,
      );
      return {
        ...empty,
        targetRef,
        before: null,
        desired,
        changedFields: Object.keys(desired),
      };
    }
    if (command.operation === 'update_internal_provider') {
      const row = await this.requiredProvider(tenantId, command.providerId);
      const before = this.safeProvider(row);
      const patch = await this.canonicalProviderPatch(tenantId, command.patch);
      const desired = { ...before, ...patch };
      if (wave4Hash(before) === wave4Hash(desired)) {
        throw new ConflictException('Provider already has desired state');
      }
      return {
        ...empty,
        targetRef: row.id,
        before,
        desired,
        changedFields: Object.keys(patch),
      };
    }
    if (command.operation === 'replace_weekly_availability') {
      await this.requiredProvider(tenantId, command.providerId);
      const rules = this.canonicalWeeklyRules(command.rules);
      const existing = await this.prisma.internalAvailabilityRule.findMany({
        where: { tenantId, providerId: command.providerId },
        orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
      });
      const before = existing.map((row) => ({
        weekday: row.weekday,
        startMinute: row.startMinute,
        endMinute: row.endMinute,
        active: row.active,
      }));
      const desired = rules.map((rule) => ({ ...rule, active: true }));
      if (wave4Hash(before) === wave4Hash(desired)) {
        throw new ConflictException('Availability already has desired state');
      }
      return {
        ...empty,
        targetRef: command.providerId,
        before,
        desired,
        changedFields: ['weeklyRules'],
      };
    }
    if (command.operation === 'create_time_off') {
      await this.requiredProvider(tenantId, command.providerId);
      this.assertTimeOff(command.startAt, command.endAt);
      const targetRef = this.deterministicId(
        'timeoff',
        tenantId,
        sourceIntentRef,
      );
      const existing =
        await this.prisma.internalAvailabilityException.findUnique({
          where: { id: targetRef },
        });
      if (existing)
        throw new ConflictException('Time-off target already exists');
      return {
        ...empty,
        targetRef,
        before: null,
        desired: {
          providerId: command.providerId,
          startAt: command.startAt.toISOString(),
          endAt: command.endAt.toISOString(),
          note: this.optionalText(command.note, 500),
          kind: 'unavailable',
        },
        changedFields: ['providerId', 'startAt', 'endAt', 'note'],
      };
    }
    if (command.operation === 'delete_time_off') {
      const row = await this.prisma.internalAvailabilityException.findFirst({
        where: {
          id: command.exceptionId,
          tenantId,
          providerId: command.providerId,
        },
      });
      if (!row) throw new NotFoundException('Time-off entry not found');
      return {
        ...empty,
        targetRef: row.id,
        before: this.safeTimeOff(row),
        desired: { deleted: true },
        changedFields: ['deleted'],
      };
    }
    if (command.operation !== 'upload_provider_avatar') {
      throw new Package5Wave4Error('Wave 4 fact resolver is incomplete');
    }
    const provider = await this.requiredProvider(tenantId, command.providerId);
    if (
      !IMAGE_MIME_TYPES.has(command.mimeType) ||
      command.bytes.length < 1 ||
      command.bytes.length > MAX_IMAGE_BYTES
    ) {
      throw new BadRequestException('Provider avatar is invalid');
    }
    const contentHash = wave4Hash(command.bytes);
    const requestIdentity = wave4Hash({
      contract: 'package5.wave4.provider-avatar-request/1',
      tenantId,
      providerId: provider.id,
      sourceIntentRef,
      contentHash,
      mimeType: command.mimeType,
    });
    return {
      targetRef: provider.id,
      before: { avatarUrl: provider.avatarUrl },
      desired: { contentHash, requestIdentity },
      changedFields: ['avatarUrl'],
      providerRequestIdentityHash: requestIdentity,
      providerObjectContentHash: contentHash,
    };
  }

  private retryRequest(
    tenantId: string,
    capability: string,
    sourceRef: string,
    actorUserId: string,
    execution: ActionExecution,
    input: Record<string, unknown>,
    mode: Mode,
  ): TrustedActionExecutionRequestV1 {
    return {
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId,
      capability,
      source: {
        type: mode === 'shadow' ? 'synthetic_shadow' : 'authenticated_request',
        occurrenceScope: `package5-wave4:${String(input.operation)}:${execution.targetRef}:g${String(input.targetGeneration)}`,
        sourceRef,
        actorUserId,
      },
      targetRef: execution.targetRef,
      input,
      evidenceRefs: [`package5-wave4-retry:${execution.id}`],
      callerIdempotency: {
        scope: `package5.wave4.${mode}.${String(input.operation)}`,
        key: sourceRef,
      },
    };
  }

  private requestMaterialHash(command: Package5Wave4Command) {
    const material = { ...command } as Record<string, unknown>;
    delete material.sourceIntentRef;
    if (command.operation === 'upload_provider_avatar') {
      material.bytes = wave4Hash(command.bytes);
    }
    return wave4Hash(material);
  }

  private async assertInternalCalendar(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { calendarSource: true },
    });
    if (!tenant || tenant.calendarSource !== 'internal') {
      throw new ConflictException('Tenant does not use internal calendar');
    }
  }

  canonicalInventoryCreate(input: InventoryFields) {
    return {
      ...this.canonicalInventoryPatch(input),
      name: this.requiredText(input.name, 200),
      description: this.optionalText(input.description, 2_000),
      priceKopecks: this.optionalMoney(input.priceKopecks),
      currency: this.currency(input.currency),
      quantity: this.optionalInteger(input.quantity, 0, 1_000_000),
      lowStockThreshold: this.optionalInteger(
        input.lowStockThreshold,
        0,
        1_000_000,
      ),
      active: input.active ?? true,
      source: this.requiredText(input.source ?? 'manual', 80).toLowerCase(),
      externalRef: this.optionalOpaque(input.externalRef),
    };
  }

  canonicalInventoryPatch(input: InventoryFields) {
    const data: Record<string, unknown> = {};
    if (input.name !== undefined)
      data.name = this.requiredText(input.name, 200);
    if (input.description !== undefined)
      data.description = this.optionalText(input.description, 2_000);
    if (input.priceKopecks !== undefined)
      data.priceKopecks = this.optionalMoney(input.priceKopecks);
    if (input.currency !== undefined)
      data.currency = this.currency(input.currency);
    if (input.quantity !== undefined)
      data.quantity = this.optionalInteger(input.quantity, 0, 1_000_000);
    if (input.lowStockThreshold !== undefined)
      data.lowStockThreshold = this.optionalInteger(
        input.lowStockThreshold,
        0,
        1_000_000,
      );
    if (input.active !== undefined) data.active = Boolean(input.active);
    if (input.source !== undefined)
      data.source = this.requiredText(input.source, 80).toLowerCase();
    if (input.externalRef !== undefined)
      data.externalRef = this.optionalOpaque(input.externalRef);
    if (!Object.keys(data).length) throw new BadRequestException('Empty patch');
    return data;
  }

  private safeInventory(row: {
    name: string;
    description: string | null;
    priceKopecks: number | null;
    currency: string;
    quantity: number | null;
    lowStockThreshold: number | null;
    active: boolean;
    source: string;
    externalRef: string | null;
  }) {
    return {
      name: row.name,
      description: row.description,
      priceKopecks: row.priceKopecks,
      currency: row.currency,
      quantity: row.quantity,
      lowStockThreshold: row.lowStockThreshold,
      active: row.active,
      source: row.source,
      externalRef: row.externalRef,
    };
  }

  canonicalServiceCreate(input: ServiceFields) {
    return {
      name: this.requiredText(input.name, 200),
      description: this.optionalText(input.description, 2_000),
      price: this.money(input.price),
      currency: this.currency(input.currency),
      durationMinutes: this.integer(input.durationMinutes, 5, 24 * 60),
      bufferBeforeMinutes: this.integer(input.bufferBeforeMinutes ?? 0, 0, 240),
      bufferAfterMinutes: this.integer(input.bufferAfterMinutes ?? 0, 0, 240),
      sortOrder: this.integer(input.sortOrder ?? 0, -10_000, 10_000),
      active: input.active ?? true,
    };
  }

  canonicalServicePatch(input: ServiceFields) {
    const data: Record<string, unknown> = {};
    if (input.name !== undefined)
      data.name = this.requiredText(input.name, 200);
    if (input.description !== undefined)
      data.description = this.optionalText(input.description, 2_000);
    if (input.price !== undefined) data.price = this.money(input.price);
    if (input.currency !== undefined)
      data.currency = this.currency(input.currency);
    if (input.durationMinutes !== undefined)
      data.durationMinutes = this.integer(input.durationMinutes, 5, 24 * 60);
    if (input.bufferBeforeMinutes !== undefined)
      data.bufferBeforeMinutes = this.integer(
        input.bufferBeforeMinutes,
        0,
        240,
      );
    if (input.bufferAfterMinutes !== undefined)
      data.bufferAfterMinutes = this.integer(input.bufferAfterMinutes, 0, 240);
    if (input.sortOrder !== undefined)
      data.sortOrder = this.integer(input.sortOrder, -10_000, 10_000);
    if (input.active !== undefined) data.active = Boolean(input.active);
    if (!Object.keys(data).length) throw new BadRequestException('Empty patch');
    return data;
  }

  private safeService(row: {
    name: string;
    description: string | null;
    price: number;
    currency: string;
    durationMinutes: number;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
    sortOrder: number;
    active: boolean;
  }) {
    return {
      name: row.name,
      description: row.description,
      price: row.price,
      currency: row.currency,
      durationMinutes: row.durationMinutes,
      bufferBeforeMinutes: row.bufferBeforeMinutes,
      bufferAfterMinutes: row.bufferAfterMinutes,
      sortOrder: row.sortOrder,
      active: row.active,
    };
  }

  async canonicalProviderCreate(tenantId: string, input: ProviderFields) {
    const branchId = input.branchId ?? (await this.firstBranch(tenantId));
    await this.assertBranch(tenantId, branchId);
    return {
      displayName: this.requiredText(input.displayName, 200),
      title: this.optionalText(input.title ?? 'Специалист', 200),
      specialization: this.optionalText(input.specialization, 500),
      branchId,
      slotIntervalMinutes: this.integer(
        input.slotIntervalMinutes ?? 30,
        5,
        240,
      ),
      active: input.active ?? true,
    };
  }

  async canonicalProviderPatch(tenantId: string, input: ProviderFields) {
    const data: Record<string, unknown> = {};
    if (input.displayName !== undefined)
      data.displayName = this.requiredText(input.displayName, 200);
    if (input.title !== undefined)
      data.title = this.optionalText(input.title, 200);
    if (input.specialization !== undefined)
      data.specialization = this.optionalText(input.specialization, 500);
    if (input.branchId !== undefined) {
      await this.assertBranch(tenantId, input.branchId);
      data.branchId = input.branchId;
    }
    if (input.slotIntervalMinutes !== undefined)
      data.slotIntervalMinutes = this.integer(
        input.slotIntervalMinutes,
        5,
        240,
      );
    if (input.active !== undefined) data.active = Boolean(input.active);
    if (!Object.keys(data).length) throw new BadRequestException('Empty patch');
    return data;
  }

  private safeProvider(row: {
    displayName: string;
    title: string | null;
    specialization: string | null;
    branchId: string | null;
    slotIntervalMinutes: number;
    active: boolean;
    avatarUrl: string | null;
  }) {
    return {
      displayName: row.displayName,
      title: row.title,
      specialization: row.specialization,
      branchId: row.branchId,
      slotIntervalMinutes: row.slotIntervalMinutes,
      active: row.active,
      avatarUrl: row.avatarUrl,
    };
  }

  private safeTimeOff(row: {
    providerId: string;
    startAt: Date;
    endAt: Date;
    kind: string;
    note: string | null;
  }) {
    return {
      providerId: row.providerId,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      kind: row.kind,
      note: row.note,
    };
  }

  canonicalWeeklyRules(
    rules: Array<{ weekday: number; startMinute: number; endMinute: number }>,
  ) {
    if (rules.length > MAX_WEEKLY_RULES)
      throw new BadRequestException('Weekly availability is unbounded');
    const normalized = rules
      .map((rule) => ({
        weekday: this.integer(rule.weekday, 0, 6),
        startMinute: this.integer(rule.startMinute, 0, 1439),
        endMinute: this.integer(rule.endMinute, 1, 1440),
      }))
      .sort(
        (left, right) =>
          left.weekday - right.weekday || left.startMinute - right.startMinute,
      );
    for (const [index, rule] of normalized.entries()) {
      if (
        rule.startMinute >= rule.endMinute ||
        (index > 0 &&
          normalized[index - 1].weekday === rule.weekday &&
          normalized[index - 1].endMinute > rule.startMinute)
      ) {
        throw new BadRequestException('Weekly availability overlaps');
      }
    }
    return normalized;
  }

  private async requiredProvider(tenantId: string, providerId: string) {
    const row = await this.prisma.internalProvider.findUnique({
      where: { id_tenantId: { id: providerId, tenantId } },
    });
    if (!row) throw new NotFoundException('Internal provider not found');
    return row;
  }

  private async firstBranch(tenantId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return branch?.id ?? null;
  }

  private async assertBranch(tenantId: string, branchId: string | null) {
    if (branchId === null) return;
    const branch = await this.prisma.branch.findUnique({
      where: { id_tenantId: { id: branchId, tenantId } },
      select: { id: true },
    });
    if (!branch) throw new NotFoundException('Branch not found for tenant');
  }

  private assertTimeOff(startAt: Date, endAt: Date) {
    if (
      !Number.isFinite(startAt.getTime()) ||
      !Number.isFinite(endAt.getTime()) ||
      startAt >= endAt ||
      endAt.getTime() - startAt.getTime() > 366 * 86_400_000
    ) {
      throw new BadRequestException('Time-off interval is invalid');
    }
  }

  private requiredText(value: unknown, max: number) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
      throw new BadRequestException('Required text is invalid');
    return value.trim();
  }

  private optionalText(value: unknown, max: number): string | null {
    if (value === undefined || value === null || value === '') return null;
    return this.requiredText(value, max);
  }

  private optionalOpaque(value: unknown): string | null {
    const text = this.optionalText(value, 240);
    if (text !== null && !/^[A-Za-z0-9._:/-]+$/.test(text))
      throw new BadRequestException('External reference is invalid');
    return text;
  }

  private integer(value: unknown, min: number, max: number) {
    if (
      !Number.isSafeInteger(value) ||
      Number(value) < min ||
      Number(value) > max
    )
      throw new BadRequestException('Integer is outside approved bounds');
    return Number(value);
  }

  private money(value: unknown) {
    return this.integer(value, 0, 100_000_000);
  }

  private optionalMoney(value: unknown): number | null {
    if (value === undefined || value === null) return null;
    return this.money(value);
  }

  private optionalInteger(
    value: unknown,
    min: number,
    max: number,
  ): number | null {
    if (value === undefined || value === null) return null;
    return this.integer(value, min, max);
  }

  private currency(value: unknown) {
    if (value !== undefined && typeof value !== 'string')
      throw new BadRequestException('Currency is invalid');
    const normalized = value === undefined ? 'RUB' : value.toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalized))
      throw new BadRequestException('Currency is invalid');
    return normalized;
  }

  private deterministicId(kind: string, tenantId: string, source: string) {
    return `p5w4-${kind}-${wave4Hash({ tenantId, source }).slice(0, 24)}`;
  }

  private async nextGeneration(
    tenantId: string,
    targetKind: string,
    targetRef: string,
  ) {
    const latest = await this.prisma.actionTargetMutation.findFirst({
      where: { tenantId, targetKind, targetRef },
      orderBy: { targetGeneration: 'desc' },
      select: { targetGeneration: true },
    });
    return (latest?.targetGeneration ?? -1) + 1;
  }

  private bounded(value: string) {
    return this.requiredText(value, 240);
  }
}

export class Package5Wave4ExecutableService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ingress: CanonicalActionIngressService,
    private readonly kernel: ActionEngineKernel,
    private readonly runtime: ActionEngineRuntimeService,
    private readonly planner: Package5Wave4ShadowService,
    private readonly objectStore: Package5Wave4ObjectStore | null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(prepared: Package5Wave4Prepared) {
    const registration = PACKAGE5_WAVE4_REGISTRATIONS.find(
      (row) => row.executableCapability === prepared.request.capability,
    );
    if (!registration)
      throw new Package5Wave4Error('Capability not executable');
    return registration.authorityClass === 'AC2'
      ? this.executeExternal(prepared)
      : this.executeLocal(prepared, registration);
  }

  async resume(prepared: Package5Wave4Prepared) {
    return this.execute(prepared);
  }

  private async executeLocal(
    prepared: Package5Wave4Prepared,
    registration: (typeof PACKAGE5_WAVE4_REGISTRATIONS)[number],
  ) {
    const execution = await this.ingress.createExecution(prepared.request);
    if (execution.state === ActionExecutionState.SUCCEEDED)
      return this.restore(execution);
    if (execution.state !== ActionExecutionState.READY)
      throw new Package5Wave4Error(
        `Execution cannot run from ${execution.state}`,
      );
    const input = await this.kernel.readTrustedNormalizedInput(
      execution.tenantId,
      execution.id,
    );
    await this.planner.assertStillCurrent(
      execution.tenantId,
      prepared.actor.userId,
      prepared.command,
      input,
    );
    return this.serializable(async (tx) => {
      await this.lock(
        tx,
        execution.tenantId,
        this.text(input.targetKind),
        this.text(input.targetRef),
      );
      const locked = await tx.actionExecution.findUniqueOrThrow({
        where: {
          id_tenantId: { id: execution.id, tenantId: execution.tenantId },
        },
      });
      if (locked.state === ActionExecutionState.SUCCEEDED)
        return this.restore(locked);
      this.assertExecutable(locked, registration.actionClass);
      await this.assertActor(tx, locked, input);
      const attemptId = await this.begin(
        tx,
        locked,
        'package5.wave4.local-command',
      );
      await this.mutate(tx, locked, prepared.command, input);
      await this.recordMutation(tx, locked, input);
      const value = this.value(locked, input, 0, false);
      await this.finalize(tx, locked, attemptId, value);
      return value;
    });
  }

  private async executeExternal(prepared: Package5Wave4Prepared) {
    if (!this.objectStore)
      throw new Package5Wave4Error('Wave 4 object store is not configured');
    if (prepared.command.operation !== 'upload_provider_avatar')
      throw new Package5Wave4Error('External operation mismatch');
    const command = prepared.command;
    const runtimeValue = await this.runtime.execute(prepared.request, {
      prepare: async (input, context) => {
        const execution = await this.prisma.actionExecution.findUniqueOrThrow({
          where: {
            id_tenantId: {
              id: context.executionId,
              tenantId: context.tenantId,
            },
          },
        });
        await this.assertActor(this.prisma, execution, input);
        await this.planner.assertStillCurrent(
          context.tenantId,
          prepared.actor.userId,
          command,
          input,
        );
        return {
          providerRequestIdentityHash: this.text(
            input.providerRequestIdentityHash,
          ),
          contentHash: wave4Hash(command.bytes),
        };
      },
      dispatch: async (input, _transportKey, context) => {
        const stored = await this.objectStore!.put({
          requestIdentityHash: this.text(input.providerRequestIdentityHash),
          contentHash: this.text(input.providerObjectContentHash),
          mimeType: command.mimeType,
          bytes: command.bytes,
        });
        const value = await this.commitAvatar(
          context.tenantId,
          context.executionId,
          input,
          stored,
        );
        return {
          value,
          safeResult: value as unknown as Record<string, unknown>,
        };
      },
      reconcile: async (input, _pre, context) => {
        if (!context) return { outcome: 'STILL_UNKNOWN' };
        const stored = await this.objectStore!.head(
          this.text(input.providerRequestIdentityHash),
        );
        if (!stored) return { outcome: 'PROVEN_NOT_EXECUTED' };
        if (stored.contentHash !== input.providerObjectContentHash)
          return { outcome: 'STILL_UNKNOWN' };
        const value = await this.applyAvatarDuringReconciliation(
          context.tenantId,
          context.executionId,
          input,
          stored,
        );
        return {
          outcome: 'PROVEN_SUCCEEDED',
          safeResult: value as unknown as Record<string, unknown>,
        };
      },
      restore: (safe) => safe as unknown as Package5Wave4ExecutionValue,
      classifyError: (error, phase) => ({
        kind: phase === 'dispatch' ? 'unknown' : 'definitive',
        outcomeCode:
          phase === 'dispatch'
            ? 'provider_avatar_dispatch_ambiguous'
            : 'provider_avatar_prepare_failed',
        errorClass:
          error instanceof Error
            ? error.constructor.name
            : 'AvatarCommandError',
      }),
    });
    const input = await this.kernel.readTrustedNormalizedInput(
      prepared.request.tenantId,
      runtimeValue.actionExecutionId,
    );
    const stored = await this.objectStore.head(
      this.text(input.providerRequestIdentityHash),
    );
    if (!stored)
      throw new Package5Wave4Error(
        'Successful avatar execution is missing its provider object',
      );
    await this.commitAvatar(
      prepared.request.tenantId,
      runtimeValue.actionExecutionId,
      input,
      stored,
    );
    return runtimeValue;
  }

  private async applyAvatarDuringReconciliation(
    tenantId: string,
    executionId: string,
    input: Record<string, unknown>,
    stored: Package5Wave4StoredObject,
  ) {
    if (stored.contentHash !== this.text(input.providerObjectContentHash))
      throw new Package5Wave4Error('Stored avatar hash mismatch');
    return this.serializable(async (tx) => {
      await this.lock(
        tx,
        tenantId,
        this.text(input.targetKind),
        this.text(input.targetRef),
      );
      const execution = await tx.actionExecution.findUniqueOrThrow({
        where: { id_tenantId: { id: executionId, tenantId } },
      });
      const current = await tx.internalProvider.findUniqueOrThrow({
        where: {
          id_tenantId: { id: this.text(input.targetRef), tenantId },
        },
      });
      if (current.avatarUrl !== stored.url) {
        if (
          wave4Hash({ avatarUrl: current.avatarUrl }) !== input.beforeStateHash
        ) {
          throw new Package5Wave4Error(
            'Avatar target changed during object dispatch',
          );
        }
        await tx.internalProvider.update({
          where: { id_tenantId: { id: current.id, tenantId } },
          data: { avatarUrl: stored.url },
        });
      }
      return this.value(execution, input, 1, true);
    });
  }

  private async commitAvatar(
    tenantId: string,
    executionId: string,
    input: Record<string, unknown>,
    stored: Package5Wave4StoredObject,
  ) {
    if (stored.contentHash !== this.text(input.providerObjectContentHash))
      throw new Package5Wave4Error('Stored avatar hash mismatch');
    return this.serializable(async (tx) => {
      await this.lock(
        tx,
        tenantId,
        this.text(input.targetKind),
        this.text(input.targetRef),
      );
      const execution = await tx.actionExecution.findUniqueOrThrow({
        where: { id_tenantId: { id: executionId, tenantId } },
      });
      const existing = await tx.actionTargetMutation.findUnique({
        where: {
          tenantId_actionExecutionId_mutationKey: {
            tenantId,
            actionExecutionId: executionId,
            mutationKey: this.text(input.mutationKey),
          },
        },
      });
      if (!existing) {
        const provider = await tx.internalProvider.findUniqueOrThrow({
          where: { id_tenantId: { id: this.text(input.targetRef), tenantId } },
        });
        if (provider.avatarUrl !== stored.url) {
          if (
            wave4Hash({ avatarUrl: provider.avatarUrl }) !==
            input.beforeStateHash
          ) {
            throw new Package5Wave4Error(
              'Avatar target changed during dispatch',
            );
          }
          await tx.internalProvider.update({
            where: { id_tenantId: { id: provider.id, tenantId } },
            data: { avatarUrl: stored.url },
          });
        }
        await this.recordMutation(tx, execution, input);
      }
      return this.value(execution, input, 1, true);
    });
  }

  private async mutate(
    tx: Tx,
    execution: ActionExecution,
    command: Package5Wave4Command,
    input: Record<string, unknown>,
  ) {
    const tenantId = execution.tenantId;
    const targetRef = this.text(input.targetRef);
    switch (command.operation) {
      case 'create_inventory_item':
        await tx.tenantCatalogItem.create({
          data: {
            id: targetRef,
            tenantId,
            kind: 'inventory',
            ...this.planner.canonicalInventoryCreate(command.item),
          },
        });
        return;
      case 'update_inventory_item':
        await tx.tenantCatalogItem.update({
          where: { id_tenantId: { id: command.itemId, tenantId } },
          data: this.planner.canonicalInventoryPatch(command.patch),
        });
        return;
      case 'archive_inventory_item':
        await tx.tenantCatalogItem.update({
          where: { id_tenantId: { id: command.itemId, tenantId } },
          data: { active: false },
        });
        return;
      case 'create_internal_service': {
        const service = await tx.internalService.create({
          data: {
            id: targetRef,
            tenantId,
            ...this.planner.canonicalServiceCreate(command.service),
          },
        });
        const providers = await tx.internalProvider.findMany({
          where: { tenantId, active: true },
          select: { id: true },
        });
        if (providers.length)
          await tx.internalProviderService.createMany({
            data: providers.map((provider) => ({
              tenantId,
              providerId: provider.id,
              serviceId: service.id,
            })),
          });
        return;
      }
      case 'update_internal_service':
        await tx.internalService.update({
          where: { id_tenantId: { id: command.serviceId, tenantId } },
          data: this.planner.canonicalServicePatch(command.patch),
        });
        return;
      case 'archive_internal_service':
        await tx.internalService.update({
          where: { id_tenantId: { id: command.serviceId, tenantId } },
          data: { active: false },
        });
        return;
      case 'create_internal_provider': {
        const desired = await this.planner.canonicalProviderCreate(
          tenantId,
          command.provider,
        );
        const provider = await tx.internalProvider.create({
          data: {
            id: targetRef,
            tenantId,
            userId: null,
            ...desired,
          },
        });
        await tx.internalAvailabilityRule.createMany({
          data: [1, 2, 3, 4, 5].map((weekday) => ({
            tenantId,
            providerId: provider.id,
            weekday,
            startMinute: 540,
            endMinute: 1080,
          })),
        });
        const services = await tx.internalService.findMany({
          where: { tenantId, active: true },
          select: { id: true },
        });
        if (services.length)
          await tx.internalProviderService.createMany({
            data: services.map((service) => ({
              tenantId,
              providerId: provider.id,
              serviceId: service.id,
            })),
          });
        return;
      }
      case 'update_internal_provider':
        await tx.internalProvider.update({
          where: { id_tenantId: { id: command.providerId, tenantId } },
          data: await this.planner.canonicalProviderPatch(
            tenantId,
            command.patch,
          ),
        });
        return;
      case 'replace_weekly_availability':
        await tx.internalAvailabilityRule.deleteMany({
          where: { tenantId, providerId: command.providerId },
        });
        if (command.rules.length)
          await tx.internalAvailabilityRule.createMany({
            data: this.planner
              .canonicalWeeklyRules(command.rules)
              .map((rule) => ({
                tenantId,
                providerId: command.providerId,
                ...rule,
              })),
          });
        return;
      case 'create_time_off':
        await tx.internalAvailabilityException.create({
          data: {
            id: targetRef,
            tenantId,
            providerId: command.providerId,
            startAt: command.startAt,
            endAt: command.endAt,
            note: command.note?.trim() || null,
          },
        });
        return;
      case 'delete_time_off':
        await tx.internalAvailabilityException.delete({
          where: { id: command.exceptionId },
        });
        return;
      default:
        throw new Package5Wave4Error('Local mutation operation mismatch');
    }
  }

  private async assertActor(
    tx: PrismaClient | Tx,
    execution: ActionExecution,
    input: Record<string, unknown>,
  ) {
    if (!execution.actorUserId)
      throw new Package5Wave4Error('Actor binding missing');
    const membership = await tx.membership.findUnique({
      where: {
        userId_tenantId: {
          userId: execution.actorUserId,
          tenantId: execution.tenantId,
        },
      },
      select: {
        id: true,
        role: true,
        status: true,
        user: { select: { status: true } },
      },
    });
    if (
      !membership ||
      membership.status !== 'active' ||
      membership.user.status !== 'active' ||
      membership.id !== input.actorMembershipId ||
      String(membership.role) !== input.actorRole ||
      !MANAGER_ROLES.has(String(membership.role))
    ) {
      throw new Package5Wave4Error('Actor authority changed after planning');
    }
  }

  private assertExecutable(
    execution: ActionExecution,
    actionClass: Package5Wave4ActionClass,
  ) {
    if (
      execution.state !== ActionExecutionState.READY ||
      execution.policyDecision !== ActionPolicyDecision.ALLOW ||
      execution.dryRun ||
      execution.actionClass !== actionClass ||
      !execution.capability.endsWith('.execute.v1')
    ) {
      throw new Package5Wave4Error('Execution is not canonical Wave 4');
    }
  }

  private async lock(
    tx: Tx,
    tenantId: string,
    targetKind: string,
    targetRef: string,
  ) {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:p5-wave4:${targetKind}:${targetRef}`}, 0))`,
    );
  }

  private async begin(tx: Tx, execution: ActionExecution, executorKey: string) {
    const now = this.now();
    const attemptId = randomUUID();
    const attemptNumber = execution.executionAttemptCount + 1;
    await tx.actionAttempt.create({
      data: {
        id: attemptId,
        tenantId: execution.tenantId,
        actionExecutionId: execution.id,
        attemptNumber,
        kind: ActionAttemptKind.EXECUTION,
        state: ActionAttemptState.STARTED,
        executorKey,
        executorVersion: 1,
        externalDispatchState: ExternalDispatchState.NOT_CROSSED,
        reconciliationRequired: false,
        startedAt: now,
      },
    });
    await tx.actionExecution.update({
      where: {
        id_tenantId: { id: execution.id, tenantId: execution.tenantId },
      },
      data: {
        state: ActionExecutionState.EXECUTING,
        executionAttemptCount: attemptNumber,
        firstAttemptedAt: execution.firstAttemptedAt ?? now,
        leaseOwner: `package5-wave4:${execution.id}`,
        leaseTokenHash: `wave4:${execution.id}`,
        leaseExpiresAt: new Date(now.getTime() + 60_000),
        revision: { increment: 1 },
      },
    });
    return attemptId;
  }

  private async recordMutation(
    tx: Tx,
    execution: ActionExecution,
    input: Record<string, unknown>,
  ) {
    await tx.actionTargetMutation.create({
      data: {
        id: randomUUID(),
        tenantId: execution.tenantId,
        actionExecutionId: execution.id,
        mutationKey: this.text(input.mutationKey),
        targetKind: this.text(input.targetKind),
        targetRef: this.text(input.targetRef),
        mutationKind: this.text(input.operation),
        targetGeneration: this.integer(input.targetGeneration),
        beforeStateHash:
          input.beforeStateHash === null
            ? null
            : this.text(input.beforeStateHash),
        afterStateHash: this.text(input.afterStateHash),
      },
    });
  }

  private async finalize(
    tx: Tx,
    execution: ActionExecution,
    attemptId: string,
    value: Package5Wave4ExecutionValue,
  ) {
    const now = this.now();
    const safe = value as unknown as Prisma.InputJsonValue;
    await tx.actionAttempt.update({
      where: { id_tenantId: { id: attemptId, tenantId: execution.tenantId } },
      data: {
        state: ActionAttemptState.SUCCEEDED,
        outcomeCode: 'local_transaction_committed',
        safeResultJson: safe,
        reconciliationRequired: false,
        finishedAt: now,
      },
    });
    await tx.actionExecution.update({
      where: {
        id_tenantId: { id: execution.id, tenantId: execution.tenantId },
      },
      data: {
        state: ActionExecutionState.SUCCEEDED,
        finalOutcomeCode: 'local_transaction_committed',
        safeResultSummaryJson: safe,
        finalizedAt: now,
        reconciliationState: 'NOT_REQUIRED',
        leaseOwner: null,
        leaseTokenHash: null,
        leaseExpiresAt: null,
        revision: { increment: 1 },
      },
    });
  }

  private value(
    execution: ActionExecution,
    input: Record<string, unknown>,
    providerWrites: 0 | 1,
    unknownApplicable: boolean,
  ): Package5Wave4ExecutionValue {
    return {
      actionClass: execution.actionClass as Package5Wave4ActionClass,
      actionExecutionId: execution.id,
      targetRef: this.text(input.targetRef),
      targetGeneration: this.integer(input.targetGeneration),
      businessMutations: 1,
      providerWrites,
      unknownApplicable,
    };
  }

  private restore(execution: ActionExecution): Package5Wave4ExecutionValue {
    if (
      !execution.safeResultSummaryJson ||
      typeof execution.safeResultSummaryJson !== 'object' ||
      Array.isArray(execution.safeResultSummaryJson)
    ) {
      throw new Package5Wave4Error('Safe Wave 4 result missing');
    }
    return execution.safeResultSummaryJson as unknown as Package5Wave4ExecutionValue;
  }

  private text(value: unknown) {
    if (typeof value !== 'string' || !value)
      throw new Package5Wave4Error('Expected durable text');
    return value;
  }

  private integer(value: unknown) {
    if (!Number.isSafeInteger(value) || Number(value) < 0)
      throw new Package5Wave4Error('Expected target generation');
    return Number(value);
  }

  private async serializable<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          attempt === 3 ||
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2034'
        ) {
          throw error;
        }
      }
    }
    throw new Package5Wave4Error('Serializable transaction retry exhausted');
  }
}

/**
 * A27 review ingestion is an authenticated source-fact acceptance path (AC4),
 * not a governed ActionExecution. Duplicate source identity may converge only
 * when the immutable fact is identical.
 */
export class Package5Wave4ReviewFactService {
  constructor(private readonly prisma: PrismaClient) {}

  async accept(input: {
    tenantId: string;
    source: string;
    externalRef: string;
    rating: number;
    occurredAt: Date;
    encryptedText: string | null;
    topicTags: string[];
    branchId?: string | null;
    staffExternalId?: string | null;
  }) {
    if (!input.externalRef.trim())
      throw new BadRequestException('Exact review source identity required');
    const desiredHash = wave4Hash({
      source: input.source,
      externalRef: input.externalRef,
      rating: input.rating,
      occurredAt: input.occurredAt,
      encryptedText: input.encryptedText,
      topicTags: [...input.topicTags].sort(),
      branchId: input.branchId ?? null,
      staffExternalId: input.staffExternalId ?? null,
    });
    const find = () =>
      this.prisma.businessReview.findUnique({
        where: {
          tenantId_source_externalRef: {
            tenantId: input.tenantId,
            source: input.source,
            externalRef: input.externalRef,
          },
        },
      });
    const assertSame = (
      existing: NonNullable<Awaited<ReturnType<typeof find>>>,
    ) => {
      const existingHash = wave4Hash({
        source: existing.source,
        externalRef: existing.externalRef,
        rating: existing.rating,
        occurredAt: existing.occurredAt,
        encryptedText: existing.encryptedText,
        topicTags: Array.isArray(existing.topicTagsJson)
          ? [...existing.topicTagsJson].sort()
          : [],
        branchId: existing.branchId,
        staffExternalId: existing.staffExternalId,
      });
      if (existingHash !== desiredHash)
        throw new ConflictException('Review source identity conflicts');
      return existing;
    };
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.businessReview.findUnique({
          where: {
            tenantId_source_externalRef: {
              tenantId: input.tenantId,
              source: input.source,
              externalRef: input.externalRef,
            },
          },
        });
        if (existing) {
          return assertSame(existing);
        }
        return tx.businessReview.create({
          data: {
            tenantId: input.tenantId,
            source: input.source,
            externalRef: input.externalRef,
            rating: input.rating,
            occurredAt: input.occurredAt,
            encryptedText: input.encryptedText,
            topicTagsJson: input.topicTags,
            branchId: input.branchId ?? null,
            staffExternalId: input.staffExternalId ?? null,
          },
        });
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
      const winner = await find();
      if (!winner) throw error;
      return assertSame(winner);
    }
  }
}
