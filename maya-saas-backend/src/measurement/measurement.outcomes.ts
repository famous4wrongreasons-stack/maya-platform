import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  MeasurementResult,
  NormalizedMeasurementIntent,
} from './measurement.contract';
import {
  exactCapacityOutcome,
  exactOutcomeAttribution,
  outcomeAttemptHashFact,
  outcomeBaseMetrics,
  outcomeBound,
  outcomeMetric,
  outcomeQuery,
  outcomeRecord,
  outcomeSource,
  outcomeUnavailable,
  OutcomeExecution,
  OutcomeSourceBoundError,
  OUTCOME_READ_LIMIT,
} from './measurement.outcomes.facts';
import { readOutcomeFunnel } from './measurement.outcomes.funnel';

/** The module provides only this existing owner read. No executor or crypto API. */
export interface MeasurementOutcomeEvidenceReader {
  readTrustedNormalizedInput(
    tenantId: string,
    executionId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Record<string, unknown>>;
}
export const outcomeAppointmentSelect = {
  id: true,
  tenantId: true,
  mayaClientId: true,
  source: true,
  crmProvider: true,
  crmExternalId: true,
  status: true,
  attendance: true,
  branchId: true,
  staffId: true,
  staffExternalId: true,
  startAt: true,
  endAt: true,
  blockedStartAt: true,
  blockedEndAt: true,
  totalPriceKopecks: true,
  currency: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AppointmentSelect;

@Injectable()
export class MeasurementOutcomesReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly evidence: MeasurementOutcomeEvidenceReader,
  ) {}

  supports(kind: string): boolean {
    return ['appointment_outcome', 'execution_funnel'].includes(kind);
  }

  async authorize(
    tenantId: string,
    i: NormalizedMeasurementIntent,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    this.context.assertTenantId(tenantId);
    if (this.context.get()?.source !== 'system' || this.context.get()?.userId)
      throw new Error('measurement_system_producer_required');
    if (!this.supports(i.kind)) throw new Error('measurement_rule_not_enabled');
    if (
      i.scope.capabilityKey !== 'measurement.read' ||
      Object.keys(i.scope.dimensions).length ||
      Object.keys(i.scope.sourceQuery).length ||
      i.configurationUserId ||
      (i.kind === 'execution_funnel' &&
        (i.clientId ||
          i.appointmentId ||
          i.branchId ||
          i.staffId ||
          i.scope.branchIds.length))
    )
      throw new Error('measurement_scope_not_supported_by_rule');
    if (
      i.branchId &&
      i.scope.branchIds.length &&
      !i.scope.branchIds.includes(i.branchId)
    )
      throw new Error('measurement_branch_scope_conflict');
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true, defaultTimezone: true },
    });
    if (tenant?.status !== 'active')
      throw new Error('measurement_tenant_inactive');
    if (
      !tenant.defaultTimezone ||
      new Intl.DateTimeFormat('en', {
        timeZone: tenant.defaultTimezone,
      }).resolvedOptions().timeZone !== i.timezone
    )
      throw new Error('measurement_outcomes_timezone_mismatch');
    // The shared publisher checks the admitted historical Client under FOR SHARE.
    // Re-authorizing that receipt must not strand a corrected pending outcome.
    if (
      i.appointmentId &&
      !(await db.appointment.findFirst({
        where: {
          tenantId,
          id: i.appointmentId,
          ...(i.branchId ? { branchId: i.branchId } : {}),
          ...(i.scope.branchIds.length
            ? { branchId: { in: i.scope.branchIds } }
            : {}),
          ...(i.staffId ? { staffId: i.staffId } : {}),
        },
        select: { id: true },
      }))
    )
      throw new Error('measurement_appointment_scope_mismatch');
  }

  async read(
    tenantId: string,
    i: NormalizedMeasurementIntent,
    db: Prisma.TransactionClient,
  ): Promise<MeasurementResult> {
    await this.authorize(tenantId, i, db);
    const observedAt = new Date();
    try {
      return i.kind === 'execution_funnel'
        ? await readOutcomeFunnel(db, tenantId, i, observedAt)
        : await this.appointment(db, tenantId, i, observedAt);
    } catch (error) {
      if (!(error instanceof OutcomeSourceBoundError)) throw error;
      const unavailable = outcomeUnavailable(error.message);
      if (i.kind === 'execution_funnel')
        unavailable.attributionStatus = 'NOT_APPLICABLE';
      return unavailable;
    }
  }

  private async appointment(
    db: Prisma.TransactionClient,
    tenantId: string,
    i: NormalizedMeasurementIntent,
    observedAt: Date,
  ): Promise<MeasurementResult> {
    const a = await db.appointment.findFirst({
      where: { tenantId, id: i.appointmentId!, mayaClientId: i.clientId },
      select: outcomeAppointmentSelect,
    });
    if (!a) return outcomeUnavailable('source_subject_changed');
    const bounded = {
      take: OUTCOME_READ_LIMIT + 1,
      orderBy: { id: 'asc' as const },
    };
    const bindings = outcomeBound(
      await db.actionExecutionIdempotencyBinding.findMany({
        where: {
          tenantId,
          clientId: i.clientId!,
          idempotencyScope: 'appointments.client.create.v1',
        },
        take: OUTCOME_READ_LIMIT + 1,
        orderBy: [
          { actionExecutionId: 'asc' },
          { requestIdempotencyKeyHash: 'asc' },
        ],
        select: {
          tenantId: true,
          clientId: true,
          actionExecutionId: true,
          idempotencyScope: true,
          requestIdempotencyKeyHash: true,
          createdAt: true,
        },
      }),
    );
    const rows = outcomeBound(
      await db.actionExecution.findMany({
        where: {
          tenantId,
          id: { in: bindings.map((b) => b.actionExecutionId) },
          capability: 'crm.appointment.create.v1',
        },
        ...bounded,
        select: {
          id: true,
          tenantId: true,
          capability: true,
          sourceType: true,
          agentTaskId: true,
          dryRun: true,
          policyDecision: true,
          approvalDecision: true,
          state: true,
          bookingIntentContract: true,
          bookingIntentHash: true,
          normalizedInputHash: true,
          normalizedInputContract: true,
          normalizedInputEncrypted: true,
          createdAt: true,
          finalizedAt: true,
          updatedAt: true,
        },
      }),
    );
    const executions: OutcomeExecution[] = rows.map(
      ({ normalizedInputEncrypted, ...e }) => ({
        ...e,
        hasInput: normalizedInputEncrypted !== null,
      }),
    );
    const attempts = outcomeBound(
      await db.actionAttempt.findMany({
        where: {
          tenantId,
          actionExecutionId: { in: executions.map((e) => e.id) },
        },
        ...bounded,
        select: {
          id: true,
          tenantId: true,
          actionExecutionId: true,
          kind: true,
          state: true,
          externalDispatchState: true,
          startedAt: true,
          finishedAt: true,
          safeResultJson: true,
        },
      }),
    );
    const events = outcomeBound(
      await db.domainEvent.findMany({
        where: { tenantId, entityType: 'appointment', entityId: a.id },
        ...bounded,
        select: {
          id: true,
          tenantId: true,
          entityId: true,
          type: true,
          version: true,
          entitySequence: true,
          occurredAt: true,
          receivedAt: true,
          source: true,
          ingestionMethod: true,
          observation: true,
          dedupFingerprint: true,
        },
      }),
    );
    const trustedInputs = new Map<string, Record<string, unknown>>();
    const reasons = [
      'cash_and_refund_require_qualified_financial_evidence',
      'incremental_revenue_not_measured',
      'a29_assignment_has_no_exact_client_execution_binding',
    ];
    for (const e of executions) {
      if (a.source !== 'internal' || a.id !== `appointment-action:${e.id}`)
        continue;
      if (!e.hasInput) {
        reasons.push('action_input_unavailable_after_retention');
        continue;
      }
      try {
        trustedInputs.set(
          e.id,
          await this.evidence.readTrustedNormalizedInput(tenantId, e.id, db),
        );
      } catch (error) {
        if (outcomeRecord(error).code !== 'ACTION_CONTRACT_INVALID')
          throw error;
        reasons.push('action_input_integrity_unavailable');
      }
    }
    const attribution = exactOutcomeAttribution({
      appointment: a,
      bindings,
      executions,
      attempts,
      trustedInputs,
      asOf: i.asOf,
    });
    const query = outcomeQuery(i);
    const sources = [
      {
        ...outcomeSource(
          tenantId,
          'Appointment',
          'canonical_appointment',
          query,
          a,
          observedAt,
        ),
        id: a.id,
        coverage: 'canonical_stored_appointment',
      },
      outcomeSource(
        tenantId,
        'ActionExecutionIdempotencyBinding',
        'canonical_booking_binding',
        query,
        bindings,
        observedAt,
      ),
      outcomeSource(
        tenantId,
        'ActionExecution',
        'canonical_appointment_execution',
        query,
        executions,
        observedAt,
      ),
      outcomeSource(
        tenantId,
        'ActionAttempt',
        'canonical_effect_attempt',
        query,
        attempts.map(outcomeAttemptHashFact),
        observedAt,
      ),
      outcomeSource(
        tenantId,
        'DomainEvent',
        'canonical_outcome_event_query',
        query,
        events,
        observedAt,
      ),
    ];
    const metrics = outcomeBaseMetrics(a);
    metrics.push(
      outcomeMetric(
        'outcome_event_count',
        String(events.length),
        [0, 4],
        'exact_appointment_event_history_observed_at_read',
      ),
    );
    metrics.push(
      outcomeMetric(
        'outcome_removed_event_count',
        String(events.filter((e) => e.type === 'appointment.removed').length),
        [0, 4],
        'exact_appointment_event_history_observed_at_read',
      ),
    );
    metrics.push(
      outcomeMetric(
        'current_active_booking',
        a.status === 'confirmed',
        [0],
        'current_canonical_appointment_state',
        'COMPLETE',
        'boolean',
      ),
    );
    metrics.push(
      outcomeMetric(
        'current_attended_outcome',
        a.attendance === null
          ? null
          : a.status === 'confirmed' && a.attendance === 'arrived',
        [0],
        'current_attendance_fact',
        a.attendance === null ? 'NOT_MEASURED' : 'COMPLETE',
        'boolean',
      ),
    );
    metrics.push(
      outcomeMetric(
        'exact_attributed_active_booking',
        attribution.attributionStatus === 'ATTRIBUTED'
          ? a.status === 'confirmed'
          : null,
        [0, 1, 2, 3],
        'b31_direct_effect_exact_client_current_outcome',
        attribution.attributionStatus === 'ATTRIBUTED'
          ? 'COMPLETE'
          : 'NOT_MEASURED',
        'boolean',
      ),
    );
    const credited = executions.find(
      (e) => e.id === attribution.creditedExecutionId,
    );
    const task = credited?.agentTaskId
      ? await db.agentTask.findFirst({
          where: { tenantId, id: credited.agentTaskId },
          select: { id: true, tenantId: true, opportunityId: true },
        })
      : null;
    const opportunity = task
      ? await db.opportunity.findFirst({
          where: { tenantId, id: task.opportunityId },
          select: {
            id: true,
            tenantId: true,
            type: true,
            affectedEntityKind: true,
            affectedEntityRef: true,
            evidenceRefsJson: true,
            evidenceObservedAt: true,
          },
        })
      : null;
    const originals = opportunity
      ? outcomeBound(
          await db.appointment.findMany({
            where: {
              tenantId,
              staffId: a.staffId,
              branchId: a.branchId,
              blockedStartAt: { lte: a.startAt },
              blockedEndAt: { gte: a.endAt },
            },
            select: outcomeAppointmentSelect,
            ...bounded,
          }),
        )
      : [];
    const capacity = exactCapacityOutcome({
      outcome: a,
      opportunity,
      originals,
    });
    const capacityRefs = [0, 1, 2, 3];
    if (opportunity) {
      capacityRefs.push(sources.length);
      sources.push(
        outcomeSource(
          tenantId,
          'Opportunity',
          'canonical_capacity_evidence',
          query,
          { task, opportunity, originals },
          observedAt,
        ),
      );
    }
    metrics.push(
      outcomeMetric(
        'filled_capacity',
        capacity.filled,
        capacityRefs,
        'exact_original_capacity_and_current_outcome',
        capacity.filled === null ? 'NOT_MEASURED' : 'COMPLETE',
        'boolean',
      ),
    );
    metrics.push(
      outcomeMetric(
        'filled_capacity_attended',
        capacity.attended,
        capacityRefs,
        'exact_original_capacity_and_attendance',
        capacity.attended === null ? 'NOT_MEASURED' : 'COMPLETE',
        'boolean',
      ),
    );
    reasons.push(capacity.reason);
    if (attribution.attributionStatus !== 'ATTRIBUTED')
      reasons.push(
        attribution.attributionStatus === 'AMBIGUOUS'
          ? 'multiple_exact_effect_candidates'
          : 'attribution_requires_exact_effect_lineage',
      );
    if (a.source !== 'internal')
      reasons.push('external_effect_provider_namespace_not_frozen_in_receipt');
    if (a.updatedAt > i.asOf || events.some((e) => e.receivedAt > i.asOf))
      reasons.push('source_observed_after_business_cutoff');
    return {
      sources,
      dependencies: [],
      metrics,
      reasons,
      completeness: 'PARTIAL',
      qualification: 'VERIFIED',
      ...attribution,
    };
  }
}
