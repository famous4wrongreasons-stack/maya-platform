import { createHash, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActionApprovalDecision,
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
  PACKAGE5_WAVE5_POLICY_VERSION,
  PACKAGE5_WAVE5_REGISTRATIONS,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import {
  canonicalStateFingerprint,
  DOMAIN_EVENT_TYPE,
  DOMAIN_EVENT_VERSION,
  type DomainEntityType,
  type DomainEventType,
  type IngestionMethod,
} from '../domain';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

const DAY_MS = 86_400_000;
const MAX_ATTRIBUTION_DAYS = 90;
const OPAQUE = /^[A-Za-z0-9._:/-]{1,240}$/;
const HASH = /^[0-9a-f]{64}$/;
const REQUESTER_ROLES = new Set([
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
  'manager',
]);
const OWNER_ROLES = new Set(['tenant_owner', 'business_owner']);
const TOUCHPOINT_STATUSES = new Set(['sent', 'delivered', 'failed']);
const CORRECTION_REASONS = new Set([
  'authoritative_source_correction',
  'operator_evidence_correction',
]);

type Tx = Prisma.TransactionClient;
type Mode = 'shadow' | 'execute';

export interface RecoveryTouchpointObservation {
  tenantId: string;
  externalEventId: string;
  subjectRef: string;
  kind: string;
  channel: string;
  status: 'sent' | 'delivered' | 'failed';
  occurredAt: Date;
  attributionWindowDays: number;
  source: string;
  ingestionMethod: Extract<IngestionMethod, 'webhook' | 'internal'>;
}

export interface RecoveryBookingObservation {
  tenantId: string;
  externalBookingRef: string;
  subjectRef: string;
  crmExternalId?: string | null;
  bookedAt: Date;
  visitAt?: Date | null;
  bookedValueKopecks?: number | null;
  currency?: string | null;
  filledWindow?: boolean;
  source: string;
  ingestionMethod: Extract<
    IngestionMethod,
    'webhook' | 'reconciliation' | 'internal'
  >;
}

export interface RecoveryAttributionCorrectionCommand {
  sourceIntentRef: string;
  conversionId: string;
  touchpointId: string;
  sourceEvidenceEventId: string;
  reasonCode:
    'authoritative_source_correction' | 'operator_evidence_correction';
}

export interface Package5Wave5Prepared {
  request: TrustedActionExecutionRequestV1;
  command: RecoveryAttributionCorrectionCommand;
  actorUserId: string;
  existingExecution: ActionExecution | null;
}

export interface Package5Wave5ShadowResult {
  actionClass: 'correct_recovery_attribution';
  actionExecutionId: string;
  outcome: 'planned';
  shadowDivergences: 0;
  businessMutations: 0;
  providerWrites: 0;
}

export interface Package5Wave5ExecutionValue {
  actionClass: 'correct_recovery_attribution';
  actionExecutionId: string;
  conversionId: string;
  touchpointId: string;
  targetGeneration: number;
  businessMutations: 1;
  sourceFactsMutated: 0;
  providerWrites: 0;
  unknownApplicable: false;
}

export class Package5Wave5Error extends Error {}

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonical(nested)]),
    );
  }
  return value;
}

export function package5Wave5Hash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

/**
 * AC4/AC5 source-fact plane for A29. It deliberately creates no
 * ActionExecution: authenticated observations are facts and their rows are
 * current projections, not commands. Every accepted change is committed with
 * one immutable DomainEvent in the same PostgreSQL transaction.
 */
@Injectable()
export class Package5Wave5RecoveryFactPlaneService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async acceptTouchpoint(input: RecoveryTouchpointObservation) {
    const tenantId = this.tenantContext.assertTenantId(input.tenantId);
    const normalized = this.touchpoint(input);
    return this.serializable(async (tx) => {
      await this.lock(tx, tenantId, 'touchpoint', normalized.externalEventId);
      const existing = await tx.recoveryTouchpoint.findUnique({
        where: {
          tenantId_externalEventId: {
            tenantId,
            externalEventId: normalized.externalEventId,
          },
        },
      });
      if (existing) {
        if (
          existing.subjectRef !== normalized.subjectRef ||
          existing.kind !== normalized.kind ||
          existing.channel !== normalized.channel ||
          existing.occurredAt.getTime() !== normalized.occurredAt.getTime() ||
          existing.attributionWindowDays !== normalized.attributionWindowDays
        ) {
          throw new ConflictException(
            'Recovery touchpoint identity reused with changed source fact',
          );
        }
        if (existing.status === normalized.status) {
          return {
            outcome: 'duplicate' as const,
            touchpointId: existing.id,
            eventsCreated: 0 as const,
          };
        }
        this.assertTouchpointStatusTransition(
          existing.status,
          normalized.status,
        );
        await this.appendEvent(tx, {
          tenantId,
          type: DOMAIN_EVENT_TYPE.recoveryTouchpointStatusChanged,
          entityType: 'recovery_touchpoint',
          entityId: existing.id,
          occurredAt: normalized.occurredAt,
          source: normalized.source,
          sourceRefHash: package5Wave5Hash(normalized.externalEventId),
          ingestionMethod: normalized.ingestionMethod,
          state: {
            previous_status: existing.status,
            status: normalized.status,
          },
        });
        await tx.recoveryTouchpoint.update({
          where: { id: existing.id },
          data: { status: normalized.status },
        });
        return {
          outcome: 'updated' as const,
          touchpointId: existing.id,
          eventsCreated: 1 as const,
        };
      }

      const touchpointId = this.deterministicId(
        'touchpoint',
        tenantId,
        normalized.externalEventId,
      );
      await this.appendEvent(tx, {
        tenantId,
        type: DOMAIN_EVENT_TYPE.recoveryTouchpointObserved,
        entityType: 'recovery_touchpoint',
        entityId: touchpointId,
        occurredAt: normalized.occurredAt,
        source: normalized.source,
        sourceRefHash: package5Wave5Hash(normalized.externalEventId),
        ingestionMethod: normalized.ingestionMethod,
        state: {
          external_event_ref_hash: package5Wave5Hash(
            normalized.externalEventId,
          ),
          subject_ref: normalized.subjectRef,
          kind: normalized.kind,
          channel: normalized.channel,
          status: normalized.status,
          occurred_at: normalized.occurredAt.toISOString(),
          attribution_window_days: normalized.attributionWindowDays,
        },
      });
      await tx.recoveryTouchpoint.create({
        data: {
          id: touchpointId,
          tenantId,
          externalEventId: normalized.externalEventId,
          subjectRef: normalized.subjectRef,
          kind: normalized.kind,
          channel: normalized.channel,
          status: normalized.status,
          occurredAt: normalized.occurredAt,
          attributionWindowDays: normalized.attributionWindowDays,
        },
      });
      return {
        outcome: 'created' as const,
        touchpointId,
        eventsCreated: 1 as const,
      };
    });
  }

  async acceptBooking(input: RecoveryBookingObservation) {
    const tenantId = this.tenantContext.assertTenantId(input.tenantId);
    const normalized = this.booking(input);
    return this.serializable(async (tx) => {
      await this.lock(tx, tenantId, 'booking', normalized.externalBookingRef);
      const existing = await tx.recoveryConversion.findUnique({
        where: {
          tenantId_externalBookingRef: {
            tenantId,
            externalBookingRef: normalized.externalBookingRef,
          },
        },
      });
      const touchpoint = await this.latestEligibleTouchpoint(
        tx,
        tenantId,
        normalized.subjectRef,
        normalized.bookedAt,
      );
      const conversionId =
        existing?.id ??
        this.deterministicId(
          'conversion',
          tenantId,
          normalized.externalBookingRef,
        );
      const state = {
        external_booking_ref_hash: package5Wave5Hash(
          normalized.externalBookingRef,
        ),
        crm_external_id_hash: normalized.crmExternalId
          ? package5Wave5Hash(normalized.crmExternalId)
          : null,
        subject_ref: normalized.subjectRef,
        booked_at: normalized.bookedAt.toISOString(),
        visit_at: normalized.visitAt?.toISOString() ?? null,
        booked_value_kopecks: normalized.bookedValueKopecks,
        currency: normalized.currency,
        filled_window: normalized.filledWindow,
      };
      const eventCreated = await this.appendEvent(tx, {
        tenantId,
        type: DOMAIN_EVENT_TYPE.recoveryBookingObserved,
        entityType: 'recovery_conversion',
        entityId: conversionId,
        occurredAt: normalized.bookedAt,
        source: normalized.source,
        sourceRefHash: package5Wave5Hash(normalized.externalBookingRef),
        ingestionMethod: normalized.ingestionMethod,
        state,
      });
      if (!touchpoint) {
        if (existing) {
          throw new ConflictException(
            'Existing recovery conversion lost its eligible source fact',
          );
        }
        return {
          outcome: 'not_attributed' as const,
          conversionId: null,
          eventsCreated: eventCreated ? (1 as const) : (0 as const),
        };
      }

      if (!existing) {
        await tx.recoveryConversion.create({
          data: {
            id: conversionId,
            tenantId,
            touchpointId: touchpoint.id,
            externalBookingRef: normalized.externalBookingRef,
            crmExternalId: normalized.crmExternalId,
            subjectRef: normalized.subjectRef,
            bookedAt: normalized.bookedAt,
            visitAt: normalized.visitAt,
            status: 'booked',
            filledWindow:
              normalized.filledWindow ?? touchpoint.kind === 'freed_slot',
            bookedValueKopecks: normalized.bookedValueKopecks,
            currency: normalized.currency,
          },
        });
        return {
          outcome: 'created' as const,
          conversionId,
          touchpointId: touchpoint.id,
          eventsCreated: eventCreated ? (1 as const) : (0 as const),
        };
      }

      const desired = {
        touchpointId: touchpoint.id,
        crmExternalId: normalized.crmExternalId,
        subjectRef: normalized.subjectRef,
        bookedAt: normalized.bookedAt,
        visitAt: normalized.visitAt,
        filledWindow: normalized.filledWindow ?? existing.filledWindow,
        bookedValueKopecks: normalized.bookedValueKopecks,
        currency: normalized.currency,
      };
      const changed =
        existing.touchpointId !== desired.touchpointId ||
        existing.crmExternalId !== desired.crmExternalId ||
        existing.subjectRef !== desired.subjectRef ||
        existing.bookedAt.getTime() !== desired.bookedAt.getTime() ||
        existing.visitAt?.getTime() !== desired.visitAt?.getTime() ||
        existing.filledWindow !== desired.filledWindow ||
        existing.bookedValueKopecks !== desired.bookedValueKopecks ||
        existing.currency !== desired.currency;
      if (changed) {
        await tx.recoveryConversion.update({
          where: { id: existing.id },
          data: desired,
        });
      }
      return {
        outcome: changed ? ('updated' as const) : ('duplicate' as const),
        conversionId: existing.id,
        touchpointId: touchpoint.id,
        eventsCreated: eventCreated ? (1 as const) : (0 as const),
      };
    });
  }

  async acceptBookingStatus(input: {
    tenantId: string;
    externalBookingRef: string;
    status: 'booked' | 'canceled';
    occurredAt: Date;
    source: string;
    ingestionMethod: Extract<
      IngestionMethod,
      'webhook' | 'reconciliation' | 'internal'
    >;
  }) {
    const tenantId = this.tenantContext.assertTenantId(input.tenantId);
    const externalBookingRef = this.opaque(
      input.externalBookingRef,
      'external booking reference',
    );
    const source = this.opaque(input.source, 'source');
    this.date(input.occurredAt, 'status occurredAt');
    return this.serializable(async (tx) => {
      await this.lock(tx, tenantId, 'booking', externalBookingRef);
      const existing = await tx.recoveryConversion.findUnique({
        where: {
          tenantId_externalBookingRef: { tenantId, externalBookingRef },
        },
      });
      if (!existing) throw new NotFoundException('Recovery conversion missing');
      if (existing.status === input.status) {
        return { outcome: 'duplicate' as const, conversionId: existing.id };
      }
      if (existing.status === 'canceled' || input.status !== 'canceled') {
        throw new ConflictException('Recovery booking status cannot regress');
      }
      await this.appendEvent(tx, {
        tenantId,
        type: DOMAIN_EVENT_TYPE.recoveryBookingStatusChanged,
        entityType: 'recovery_conversion',
        entityId: existing.id,
        occurredAt: input.occurredAt,
        source,
        sourceRefHash: package5Wave5Hash(externalBookingRef),
        ingestionMethod: input.ingestionMethod,
        state: { previous_status: existing.status, status: input.status },
      });
      await tx.recoveryConversion.update({
        where: { id: existing.id },
        data: { status: input.status },
      });
      return { outcome: 'updated' as const, conversionId: existing.id };
    });
  }

  private async latestEligibleTouchpoint(
    tx: Tx,
    tenantId: string,
    subjectRef: string,
    bookedAt: Date,
  ) {
    const candidates = await tx.recoveryTouchpoint.findMany({
      where: {
        tenantId,
        subjectRef,
        status: { in: ['sent', 'delivered'] },
        occurredAt: {
          gte: new Date(bookedAt.getTime() - MAX_ATTRIBUTION_DAYS * DAY_MS),
          lte: bookedAt,
        },
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
      take: 100,
    });
    return (
      candidates.find(
        (candidate) =>
          bookedAt.getTime() - candidate.occurredAt.getTime() <=
          candidate.attributionWindowDays * DAY_MS,
      ) ?? null
    );
  }

  private async appendEvent(
    tx: Tx,
    input: {
      tenantId: string;
      type: DomainEventType;
      entityType: DomainEntityType;
      entityId: string;
      occurredAt: Date;
      source: string;
      sourceRefHash: string;
      ingestionMethod: IngestionMethod;
      state: Record<string, unknown>;
    },
  ): Promise<boolean> {
    const dedupFingerprint = canonicalStateFingerprint({
      source: input.source,
      entityType: input.entityType,
      entityId: input.entityId,
      type: input.type,
      state: input.state,
    });
    const existing = await tx.domainEvent.findUnique({
      where: {
        tenantId_dedupFingerprint: {
          tenantId: input.tenantId,
          dedupFingerprint,
        },
      },
      select: { id: true },
    });
    if (existing) return false;
    await tx.domainEvent.create({
      data: {
        tenantId: input.tenantId,
        type: input.type,
        version: DOMAIN_EVENT_VERSION,
        entityType: input.entityType,
        entityId: input.entityId,
        occurredAt: input.occurredAt,
        source: input.source,
        sourceRef: input.sourceRefHash,
        ingestionMethod: input.ingestionMethod,
        observation: 'after_watch_started',
        dedupFingerprint,
        payload: canonical(input.state) as Prisma.InputJsonValue,
      },
    });
    return true;
  }

  private touchpoint(input: RecoveryTouchpointObservation) {
    this.date(input.occurredAt, 'touchpoint occurredAt');
    if (!HASH.test(input.subjectRef)) {
      throw new BadRequestException('Recovery subject must be a safe HMAC');
    }
    if (!TOUCHPOINT_STATUSES.has(input.status)) {
      throw new BadRequestException('Recovery touchpoint status is invalid');
    }
    if (
      !Number.isInteger(input.attributionWindowDays) ||
      input.attributionWindowDays < 1 ||
      input.attributionWindowDays > MAX_ATTRIBUTION_DAYS
    ) {
      throw new BadRequestException('Attribution window is outside policy');
    }
    return {
      ...input,
      externalEventId: this.opaque(input.externalEventId, 'external event id'),
      kind: this.opaque(input.kind, 'touchpoint kind'),
      channel: this.opaque(input.channel, 'touchpoint channel'),
      source: this.opaque(input.source, 'touchpoint source'),
    };
  }

  private booking(input: RecoveryBookingObservation) {
    this.date(input.bookedAt, 'booking bookedAt');
    if (input.visitAt) this.date(input.visitAt, 'booking visitAt');
    if (!HASH.test(input.subjectRef)) {
      throw new BadRequestException('Recovery subject must be a safe HMAC');
    }
    if (
      input.bookedValueKopecks !== undefined &&
      input.bookedValueKopecks !== null &&
      (!Number.isSafeInteger(input.bookedValueKopecks) ||
        input.bookedValueKopecks < 0)
    ) {
      throw new BadRequestException('Booked value is invalid');
    }
    const currency = (input.currency || 'RUB').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new BadRequestException('Booking currency is invalid');
    }
    return {
      ...input,
      externalBookingRef: this.opaque(
        input.externalBookingRef,
        'external booking reference',
      ),
      crmExternalId: input.crmExternalId
        ? this.opaque(input.crmExternalId, 'CRM external id')
        : null,
      visitAt: input.visitAt ?? null,
      bookedValueKopecks: input.bookedValueKopecks ?? null,
      currency,
      source: this.opaque(input.source, 'booking source'),
    };
  }

  private assertTouchpointStatusTransition(previous: string, next: string) {
    if (previous !== 'sent' || (next !== 'delivered' && next !== 'failed')) {
      throw new ConflictException('Recovery touchpoint status cannot regress');
    }
  }

  private deterministicId(kind: string, tenantId: string, sourceRef: string) {
    return `p5w5-${kind}-${package5Wave5Hash({ tenantId, sourceRef }).slice(0, 24)}`;
  }

  private opaque(value: unknown, label: string) {
    if (typeof value !== 'string' || !OPAQUE.test(value)) {
      throw new BadRequestException(`${label} is invalid`);
    }
    return value;
  }

  private date(value: Date, label: string) {
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new BadRequestException(`${label} is invalid`);
    }
  }

  private async lock(tx: Tx, tenantId: string, kind: string, identity: string) {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:p5-wave5:${kind}:${identity}`}, 0))`,
    );
  }

  private async serializable<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          attempt < 3 &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new Package5Wave5Error('Serializable fact transaction exhausted');
  }
}

@Injectable()
export class Package5Wave5ShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly kernel: ActionEngineKernel,
  ) {}

  async plan(
    tenantId: string,
    actorUserId: string,
    command: RecoveryAttributionCorrectionCommand,
  ): Promise<Package5Wave5ShadowResult> {
    const prepared = await this.build(tenantId, actorUserId, command, 'shadow');
    const execution =
      prepared.existingExecution ??
      (await this.actionEngine.planShadow(prepared.request));
    if (
      !execution.dryRun ||
      execution.state !== ActionExecutionState.NOT_EXECUTED ||
      execution.notExecutedReasonCode !== 'shadow_only'
    ) {
      throw new Package5Wave5Error('Wave 5 Shadow crossed mutation boundary');
    }
    return {
      actionClass: 'correct_recovery_attribution',
      actionExecutionId: execution.id,
      outcome: 'planned',
      shadowDivergences: 0,
      businessMutations: 0,
      providerWrites: 0,
    };
  }

  async build(
    tenantId: string,
    actorUserId: string,
    command: RecoveryAttributionCorrectionCommand,
    mode: Mode,
  ): Promise<Package5Wave5Prepared> {
    const scoped = this.tenantContext.assertTenantId(tenantId);
    const sourceIntentRef = this.opaque(
      command.sourceIntentRef,
      'source intent',
    );
    if (!CORRECTION_REASONS.has(command.reasonCode)) {
      throw new BadRequestException('Correction reason is not allowlisted');
    }
    const actor = await this.actor(scoped, actorUserId);
    const capability =
      mode === 'shadow'
        ? PACKAGE5_WAVE5_REGISTRATIONS[0].shadowCapability
        : PACKAGE5_WAVE5_REGISTRATIONS[0].executableCapability;
    const sourceRef = `p5w5:${package5Wave5Hash({
      tenantId: scoped,
      sourceIntentRef,
    })}`;
    const prior = await this.prisma.actionExecution.findMany({
      where: { tenantId: scoped, capability, sourceRef },
      orderBy: { createdAt: 'asc' },
      take: 2,
    });
    if (prior.length > 1) {
      throw new Package5Wave5Error('Correction source has multiple executions');
    }
    const requestMaterialHash = package5Wave5Hash({
      conversionId: command.conversionId,
      touchpointId: command.touchpointId,
      sourceEvidenceEventId: command.sourceEvidenceEventId,
      reasonCode: command.reasonCode,
    });
    if (prior[0] && mode === 'execute') {
      const input = await this.kernel.readTrustedNormalizedInput(
        scoped,
        prior[0].id,
      );
      if (
        input.requestMaterialHash !== requestMaterialHash ||
        input.actorIdentityHash !== actor.actorIdentityHash
      ) {
        throw new ConflictException(
          'Correction source identity reused with changed material',
        );
      }
      return {
        request: this.retryRequest(
          scoped,
          actorUserId,
          capability,
          sourceRef,
          prior[0],
          input,
          mode,
        ),
        command,
        actorUserId,
        existingExecution: prior[0],
      };
    }

    const facts = await this.facts(scoped, command);
    const targetGeneration = await this.nextGeneration(
      scoped,
      'recovery_attribution',
      facts.conversion.id,
    );
    const beforeStateHash = package5Wave5Hash({
      touchpointId: facts.conversion.touchpointId,
    });
    const afterStateHash = package5Wave5Hash({
      touchpointId: facts.touchpoint.id,
    });
    const sourceEvidenceHash = this.eventHash(facts.event);
    const policySnapshotHash = package5Wave5Hash({
      contract: PACKAGE5_WAVE5_POLICY_VERSION,
      tenantId: scoped,
      conversionId: facts.conversion.id,
      touchpointId: facts.touchpoint.id,
      targetGeneration,
      actorRole: actor.role,
      reasonCode: command.reasonCode,
      ownerApprovalRequired: true,
      oneTargetCount: 1,
      immutableSourceFacts: true,
    });
    const request: TrustedActionExecutionRequestV1 = {
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: scoped,
      capability,
      source: {
        type: mode === 'shadow' ? 'synthetic_shadow' : 'authenticated_request',
        occurrenceScope: `package5-wave5:recovery-attribution:${facts.conversion.id}:g${targetGeneration}`,
        sourceRef,
        actorUserId,
      },
      targetRef: facts.conversion.id,
      input: {
        operation: 'correct_recovery_attribution',
        targetKind: 'recovery_attribution',
        targetRef: facts.conversion.id,
        mutationKey: `g${targetGeneration}:correct_recovery_attribution`,
        targetGeneration,
        beforeStateHash,
        afterStateHash,
        requestMaterialHash,
        sourceEvidenceEventId: facts.event.id,
        sourceEvidenceHash,
        reasonCode: command.reasonCode,
        actorMembershipId: actor.membershipId,
        actorRole: actor.role,
        actorIdentityHash: actor.actorIdentityHash,
        policyVersion: PACKAGE5_WAVE5_POLICY_VERSION,
        policySnapshotHash,
        approvalRequirement: 'OWNER_APPROVAL_REQUIRED',
        oneTargetCount: 1,
        bulkMutation: false,
        immutableSourceFacts: true,
        mutationPerformed: false,
      },
      evidenceRefs: [
        `domain-event:${facts.event.id}`,
        `package5-wave5-policy:${policySnapshotHash}`,
      ],
      callerIdempotency: {
        scope: `package5.wave5.${mode}.correct-recovery-attribution`,
        key: sourceRef,
      },
    };
    return { request, command, actorUserId, existingExecution: null };
  }

  async assertStillCurrent(
    tenantId: string,
    actorUserId: string,
    command: RecoveryAttributionCorrectionCommand,
    input: Record<string, unknown>,
  ) {
    await this.actor(tenantId, actorUserId);
    const facts = await this.facts(tenantId, command);
    if (
      facts.conversion.id !== input.targetRef ||
      package5Wave5Hash({ touchpointId: facts.conversion.touchpointId }) !==
        input.beforeStateHash ||
      package5Wave5Hash({ touchpointId: facts.touchpoint.id }) !==
        input.afterStateHash ||
      this.eventHash(facts.event) !== input.sourceEvidenceHash
    ) {
      throw new ConflictException(
        'Recovery attribution changed after planning',
      );
    }
  }

  private async facts(
    tenantId: string,
    command: RecoveryAttributionCorrectionCommand,
  ) {
    const [conversion, touchpoint, event] = await Promise.all([
      this.prisma.recoveryConversion.findFirst({
        where: { id: command.conversionId, tenantId },
      }),
      this.prisma.recoveryTouchpoint.findFirst({
        where: { id: command.touchpointId, tenantId },
      }),
      this.prisma.domainEvent.findFirst({
        where: { id: command.sourceEvidenceEventId, tenantId },
      }),
    ]);
    if (!conversion)
      throw new NotFoundException('Recovery conversion not found');
    if (!touchpoint)
      throw new NotFoundException('Recovery touchpoint not found');
    if (!event)
      throw new NotFoundException('Recovery source evidence not found');
    if (
      event.type !== DOMAIN_EVENT_TYPE.recoveryTouchpointObserved ||
      event.entityType !== 'recovery_touchpoint' ||
      event.entityId !== touchpoint.id
    ) {
      throw new ConflictException('Source evidence does not prove touchpoint');
    }
    if (conversion.touchpointId === touchpoint.id) {
      throw new ConflictException(
        'Recovery attribution already has desired state',
      );
    }
    if (
      conversion.subjectRef !== touchpoint.subjectRef ||
      touchpoint.status === 'failed' ||
      touchpoint.occurredAt > conversion.bookedAt ||
      conversion.bookedAt.getTime() - touchpoint.occurredAt.getTime() >
        touchpoint.attributionWindowDays * DAY_MS
    ) {
      throw new ConflictException(
        'Recovery correction is outside frozen evidence boundary',
      );
    }
    return { conversion, touchpoint, event };
  }

  private async actor(tenantId: string, userId: string) {
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
      !REQUESTER_ROLES.has(String(membership.role))
    ) {
      throw new ForbiddenException('Recovery correction authority required');
    }
    return {
      membershipId: membership.id,
      role: String(membership.role),
      actorIdentityHash: package5Wave5Hash({
        tenantId,
        userId,
        role: membership.role,
      }),
    };
  }

  private eventHash(event: {
    id: string;
    tenantId: string;
    type: string;
    version: number;
    entityType: string;
    entityId: string;
    occurredAt: Date;
    source: string;
    sourceRef: string | null;
    dedupFingerprint: string;
    payload: unknown;
  }) {
    return package5Wave5Hash({
      id: event.id,
      tenantId: event.tenantId,
      type: event.type,
      version: event.version,
      entityType: event.entityType,
      entityId: event.entityId,
      occurredAt: event.occurredAt,
      source: event.source,
      sourceRef: event.sourceRef,
      dedupFingerprint: event.dedupFingerprint,
      payload: event.payload,
    });
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

  private retryRequest(
    tenantId: string,
    actorUserId: string,
    capability: string,
    sourceRef: string,
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
        occurrenceScope: `package5-wave5:recovery-attribution:${execution.targetRef}:g${String(input.targetGeneration)}`,
        sourceRef,
        actorUserId,
      },
      targetRef: execution.targetRef,
      input,
      evidenceRefs: [`package5-wave5-retry:${execution.id}`],
      callerIdempotency: {
        scope: `package5.wave5.${mode}.correct-recovery-attribution`,
        key: sourceRef,
      },
    };
  }

  private opaque(value: unknown, label: string) {
    if (typeof value !== 'string' || !OPAQUE.test(value)) {
      throw new BadRequestException(`${label} is invalid`);
    }
    return value;
  }
}

export class Package5Wave5ExecutableService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ingress: CanonicalActionIngressService,
    private readonly kernel: ActionEngineKernel,
    private readonly planner: Package5Wave5ShadowService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(prepared: Package5Wave5Prepared) {
    const execution = await this.ingress.createExecution(prepared.request);
    if (execution.state === ActionExecutionState.SUCCEEDED) {
      return this.restore(execution);
    }
    if (execution.state === ActionExecutionState.PENDING_APPROVAL) {
      throw new Package5Wave5Error('ACTION_APPROVAL_REQUIRED');
    }
    if (execution.state !== ActionExecutionState.READY) {
      throw new Package5Wave5Error(
        `Execution cannot run from ${execution.state}`,
      );
    }
    const input = await this.kernel.readTrustedNormalizedInput(
      execution.tenantId,
      execution.id,
    );
    await this.planner.assertStillCurrent(
      execution.tenantId,
      prepared.actorUserId,
      prepared.command,
      input,
    );
    return this.serializable(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${execution.tenantId}:p5-wave5:recovery-attribution:${execution.targetRef}`}, 0))`,
      );
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "ActionExecution" WHERE id = ${execution.id} AND "tenantId" = ${execution.tenantId} FOR UPDATE`,
      );
      const locked = await tx.actionExecution.findUniqueOrThrow({
        where: {
          id_tenantId: { id: execution.id, tenantId: execution.tenantId },
        },
      });
      if (locked.state === ActionExecutionState.SUCCEEDED) {
        return this.restore(locked);
      }
      this.assertExecutable(locked);
      await this.assertAuthority(tx, locked, input);
      const touchpointId = await this.assertEvidence(tx, locked, input);
      const attemptId = await this.begin(tx, locked);
      await tx.recoveryConversion.update({
        where: { id: locked.targetRef },
        data: { touchpointId },
      });
      await tx.actionTargetMutation.create({
        data: {
          tenantId: locked.tenantId,
          actionExecutionId: locked.id,
          mutationKey: this.text(input.mutationKey),
          targetKind: 'recovery_attribution',
          targetRef: locked.targetRef,
          mutationKind: 'correct_recovery_attribution',
          targetGeneration: this.integer(input.targetGeneration),
          beforeStateHash: this.text(input.beforeStateHash),
          afterStateHash: this.text(input.afterStateHash),
        },
      });
      const value: Package5Wave5ExecutionValue = {
        actionClass: 'correct_recovery_attribution',
        actionExecutionId: locked.id,
        conversionId: locked.targetRef,
        touchpointId,
        targetGeneration: this.integer(input.targetGeneration),
        businessMutations: 1,
        sourceFactsMutated: 0,
        providerWrites: 0,
        unknownApplicable: false,
      };
      await this.finalize(tx, locked, attemptId, value);
      return value;
    });
  }

  async resume(prepared: Package5Wave5Prepared) {
    return this.execute(prepared);
  }

  private assertExecutable(execution: ActionExecution) {
    if (
      execution.state !== ActionExecutionState.READY ||
      execution.policyDecision !== ActionPolicyDecision.ALLOW ||
      execution.approvalRequirement !== 'REQUIRED' ||
      execution.approvalDecision !== ActionApprovalDecision.APPROVED ||
      execution.dryRun ||
      execution.actionClass !== 'correct_recovery_attribution' ||
      execution.capability !==
        PACKAGE5_WAVE5_REGISTRATIONS[0].executableCapability
    ) {
      throw new Package5Wave5Error(
        'Execution is not an approved canonical Wave 5 action',
      );
    }
  }

  private async assertAuthority(
    tx: Tx,
    execution: ActionExecution,
    input: Record<string, unknown>,
  ) {
    if (!execution.actorUserId || !execution.approvalDecidedByUserId) {
      throw new Package5Wave5Error('Requester and owner approver are required');
    }
    const [actor, approver] = await Promise.all([
      tx.membership.findUnique({
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
      }),
      tx.membership.findUnique({
        where: {
          userId_tenantId: {
            userId: execution.approvalDecidedByUserId,
            tenantId: execution.tenantId,
          },
        },
        select: {
          role: true,
          status: true,
          user: { select: { status: true } },
        },
      }),
    ]);
    if (
      !actor ||
      actor.status !== 'active' ||
      actor.user.status !== 'active' ||
      actor.id !== input.actorMembershipId ||
      actor.role !== input.actorRole ||
      !REQUESTER_ROLES.has(String(actor.role))
    ) {
      throw new Package5Wave5Error(
        'Requester authority changed after planning',
      );
    }
    if (
      !approver ||
      approver.status !== 'active' ||
      approver.user.status !== 'active' ||
      !OWNER_ROLES.has(String(approver.role))
    ) {
      throw new Package5Wave5Error('Owner approval authority is absent');
    }
  }

  private async assertEvidence(
    tx: Tx,
    execution: ActionExecution,
    input: Record<string, unknown>,
  ): Promise<string> {
    const conversion = await tx.recoveryConversion.findFirst({
      where: { id: execution.targetRef, tenantId: execution.tenantId },
    });
    const event = await tx.domainEvent.findFirst({
      where: {
        id: this.text(input.sourceEvidenceEventId),
        tenantId: execution.tenantId,
      },
    });
    if (!conversion || !event) {
      throw new Package5Wave5Error('Correction evidence disappeared');
    }
    if (
      package5Wave5Hash({ touchpointId: conversion.touchpointId }) !==
      input.beforeStateHash
    ) {
      throw new Package5Wave5Error('Attribution changed before commit');
    }
    const eventHash = package5Wave5Hash({
      id: event.id,
      tenantId: event.tenantId,
      type: event.type,
      version: event.version,
      entityType: event.entityType,
      entityId: event.entityId,
      occurredAt: event.occurredAt,
      source: event.source,
      sourceRef: event.sourceRef,
      dedupFingerprint: event.dedupFingerprint,
      payload: event.payload,
    });
    const touchpoint = await tx.recoveryTouchpoint.findFirst({
      where: {
        id: event.entityId,
        tenantId: execution.tenantId,
      },
    });
    if (
      eventHash !== input.sourceEvidenceHash ||
      event.type !== DOMAIN_EVENT_TYPE.recoveryTouchpointObserved ||
      event.entityType !== 'recovery_touchpoint' ||
      !touchpoint ||
      package5Wave5Hash({ touchpointId: touchpoint.id }) !==
        input.afterStateHash ||
      touchpoint.status === 'failed' ||
      touchpoint.subjectRef !== conversion.subjectRef ||
      touchpoint.occurredAt > conversion.bookedAt ||
      conversion.bookedAt.getTime() - touchpoint.occurredAt.getTime() >
        touchpoint.attributionWindowDays * DAY_MS
    ) {
      throw new Package5Wave5Error('Correction evidence is not authoritative');
    }
    return touchpoint.id;
  }

  private async begin(tx: Tx, execution: ActionExecution) {
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
        executorKey: 'package5.wave5.local-correction',
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
        leaseOwner: `package5-wave5:${execution.id}`,
        leaseTokenHash: `local-transaction:${execution.id}`,
        leaseExpiresAt: new Date(now.getTime() + 60_000),
        revision: { increment: 1 },
      },
    });
    return attemptId;
  }

  private async finalize(
    tx: Tx,
    execution: ActionExecution,
    attemptId: string,
    value: Package5Wave5ExecutionValue,
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

  private restore(execution: ActionExecution): Package5Wave5ExecutionValue {
    if (
      !execution.safeResultSummaryJson ||
      typeof execution.safeResultSummaryJson !== 'object' ||
      Array.isArray(execution.safeResultSummaryJson)
    ) {
      throw new Package5Wave5Error('Safe Wave 5 result is missing');
    }
    return execution.safeResultSummaryJson as unknown as Package5Wave5ExecutionValue;
  }

  private text(value: unknown) {
    if (typeof value !== 'string' || !value) {
      throw new Package5Wave5Error('Expected durable text');
    }
    return value;
  }

  private integer(value: unknown) {
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
      throw new Package5Wave5Error('Expected target generation');
    }
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
          attempt < 3 &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new Package5Wave5Error('Serializable correction exhausted');
  }
}
