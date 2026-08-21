import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OpportunityLifecycleStatus,
  type Appointment,
  type DomainEvent,
  type Opportunity,
} from '@prisma/client';

import { APPOINTMENT_REMOVED_STATUS, DOMAIN_EVENT_TYPE } from '../domain';
import {
  OPPORTUNITY_TYPE,
  type OpportunityEvidenceV1,
} from '../opportunities/opportunity.contract';
import {
  OpportunityLifecycleRepository,
  bindProjectionToTrustedTenant,
  resolutionEvidenceFingerprint,
  type CurrentStateScanCompleteness,
  type OpportunityCurrentStateResolutionV1,
  type OpportunityLifecycleSnapshot,
} from '../opportunities/opportunity.lifecycle';
import {
  opportunityShadowAppointmentRef,
  opportunityShadowScheduleRef,
  opportunityShadowTenantRef,
  projectAppointmentRemovalShadow,
  type OpportunityShadowAppointmentV1,
  type OpportunityShadowEventRowV1,
} from '../opportunities/opportunity.shadow';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { scheduleSlotsContain } from './staff-schedule.utils';
import { CrmService } from './crm.service';

const EVENT_SCAN_LIMIT = 5_000;
const FAMILY = OPPORTUNITY_TYPE.appointmentCancellationRecovery;

export type OpportunityLifecycleSourceCompleteness =
  'complete' | 'partial' | 'provider_failure';

export interface OpportunityLifecycleRunResult {
  status: 'disabled' | 'skipped_watch_not_started' | 'ran';
  completeness: CurrentStateScanCompleteness;
  detectedNow: number;
  durableActiveBefore: number;
  resolved: number;
  expired: number;
  superseded: number;
  durableActiveAfter: number;
  currentTasks: number;
  staleTasks: number;
  duplicateAttemptsCollapsed: number;
  actionIntentsProposed: number;
  actionIntentsExecuted: 0;
  externalSideEffects: 0;
}

type AppointmentRead = Pick<
  Appointment,
  | 'id'
  | 'tenantId'
  | 'branchId'
  | 'staffExternalId'
  | 'serviceIds'
  | 'blockedStartAt'
  | 'blockedEndAt'
  | 'status'
>;

type AppointmentIdentityRead = Pick<Appointment, 'id'>;

type EventRead = Pick<
  DomainEvent,
  | 'id'
  | 'tenantId'
  | 'entityType'
  | 'entityId'
  | 'type'
  | 'occurredAt'
  | 'receivedAt'
  | 'ingestionMethod'
  | 'observation'
>;

type ActiveOpportunityRead = Pick<
  Opportunity,
  'semanticKey' | 'affectedEntityRef'
>;

interface CurrentConditionEvaluation {
  appointmentRef: string;
  state: 'present' | 'absent' | 'unknown';
  basis: string;
}

/**
 * Production Chapter 5 hook. It reads canonical WATCH/current CRM state,
 * persists only Opportunity/AgentTask lifecycle, and deliberately stops before
 * any Chapter 6 action owner.
 */
@Injectable()
export class OpportunityLifecycleRunner {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly crm: CrmService,
    private readonly config: ConfigService,
    private readonly lifecycle: OpportunityLifecycleRepository,
  ) {}

  async run(input: {
    tenantId: string;
    asOf: Date;
    sourceCompleteness: OpportunityLifecycleSourceCompleteness;
  }): Promise<OpportunityLifecycleRunResult> {
    const tenantId = this.tenantContext.assertTenantId(input.tenantId);
    assertInstant(input.asOf, 'Opportunity lifecycle asOf');

    const [before, staleBefore] = await Promise.all([
      this.lifecycle.snapshot(tenantId),
      this.lifecycle.countStaleCurrentTasks({
        tenantId,
        asOf: input.asOf,
      }),
    ]);
    if (!this.isEnabled()) {
      return emptyResult(
        'disabled',
        input.sourceCompleteness,
        before,
        staleBefore,
      );
    }

    const cutoverAt = this.cutoverAt();
    const [tenant, integration, activeOpportunities] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { defaultTimezone: true },
      }),
      this.prisma.crmIntegration.findUnique({
        where: { tenantId },
        select: { watchStartedAt: true },
      }),
      this.prisma.opportunity.findMany({
        where: {
          tenantId,
          type: FAMILY,
          status: OpportunityLifecycleStatus.active,
        },
        select: { semanticKey: true, affectedEntityRef: true },
      }) as Promise<ActiveOpportunityRead[]>,
    ]);
    if (!tenant) throw new Error('Opportunity lifecycle tenant not found.');
    if (!integration?.watchStartedAt) {
      return emptyResult(
        'skipped_watch_not_started',
        'unknown',
        before,
        staleBefore,
      );
    }

    const effectiveCutoverAt = new Date(
      Math.max(cutoverAt.getTime(), integration.watchStartedAt.getTime()),
    );
    const queriedEvents = (await this.prisma.domainEvent.findMany({
      where: {
        tenantId,
        type: DOMAIN_EVENT_TYPE.appointmentRemoved,
        entityType: 'appointment',
        ingestionMethod: { in: ['webhook', 'reconciliation'] },
        observation: 'after_watch_started',
        occurredAt: { gte: effectiveCutoverAt, lte: input.asOf },
      },
      orderBy: [
        { entityId: 'asc' },
        { occurredAt: 'desc' },
        { receivedAt: 'desc' },
        { id: 'desc' },
      ],
      take: EVENT_SCAN_LIMIT + 1,
      select: {
        id: true,
        tenantId: true,
        entityType: true,
        entityId: true,
        type: true,
        occurredAt: true,
        receivedAt: true,
        ingestionMethod: true,
        observation: true,
      },
    })) as EventRead[];

    const limitReached = queriedEvents.length > EVENT_SCAN_LIMIT;
    const latestEvents = latestEventPerAppointment(
      queriedEvents.slice(0, EVENT_SCAN_LIMIT),
    );
    const eventAppointmentIds = latestEvents.map((event) => event.entityId);
    const eventAppointmentRefs = new Set(
      eventAppointmentIds.map((appointmentId) =>
        opportunityShadowAppointmentRef(tenantId, appointmentId),
      ),
    );
    const unmatchedActiveRefs = new Set(
      activeOpportunities
        .map((opportunity) => opportunity.affectedEntityRef)
        .filter(
          (ref): ref is string =>
            ref !== null && !eventAppointmentRefs.has(ref),
        ),
    );

    // Historical events never enter the projector. Existing durable conditions
    // may still be reconciled against current canonical appointment state by
    // matching their tenant-bound opaque identity.
    const legacyAppointmentIds =
      unmatchedActiveRefs.size > 0
        ? (
            (await this.prisma.appointment.findMany({
              where: { tenantId },
              select: { id: true },
            })) as AppointmentIdentityRead[]
          )
            .filter((appointment) =>
              unmatchedActiveRefs.has(
                opportunityShadowAppointmentRef(tenantId, appointment.id),
              ),
            )
            .map((appointment) => appointment.id)
        : [];
    const appointmentIds = [
      ...new Set([...eventAppointmentIds, ...legacyAppointmentIds]),
    ].sort();
    const appointments = appointmentIds.length
      ? ((await this.prisma.appointment.findMany({
          where: { tenantId, id: { in: appointmentIds } },
          select: {
            id: true,
            tenantId: true,
            branchId: true,
            staffExternalId: true,
            serviceIds: true,
            blockedStartAt: true,
            blockedEndAt: true,
            status: true,
          },
        })) as AppointmentRead[])
      : [];

    const appointmentById = new Map(
      appointments.map((appointment) => [appointment.id, appointment]),
    );
    const rows: OpportunityShadowEventRowV1[] = [];
    const evaluations = new Map<string, CurrentConditionEvaluation>();
    const capacityByAppointmentId = new Map<
      string,
      OpportunityShadowAppointmentV1['currentCapacity']
    >();
    let providerFailure = false;

    for (const appointmentId of appointmentIds) {
      const appointment = appointmentById.get(appointmentId) ?? null;
      const appointmentRef = opportunityShadowAppointmentRef(
        tenantId,
        appointmentId,
      );
      let currentCapacity: OpportunityShadowAppointmentV1['currentCapacity'] =
        null;
      let evaluation: CurrentConditionEvaluation = {
        appointmentRef,
        state: 'unknown',
        basis: 'canonical_current_state_unavailable',
      };

      if (appointment) {
        if (appointment.status !== APPOINTMENT_REMOVED_STATUS) {
          evaluation = {
            appointmentRef,
            state:
              input.sourceCompleteness === 'complete' ? 'absent' : 'unknown',
            basis: 'canonical_appointment_no_longer_removed',
          };
        } else if (appointment.blockedEndAt.getTime() <= input.asOf.getTime()) {
          evaluation = {
            appointmentRef,
            state: 'absent',
            basis: 'canonical_released_capacity_expired',
          };
        } else {
          try {
            currentCapacity = await this.currentCapacity({
              tenantId,
              timezone: tenant.defaultTimezone,
              appointment,
            });
            const isPresent =
              currentCapacity.completeness === 'complete' &&
              currentCapacity.availability === 'available' &&
              Boolean(currentCapacity.scheduleRef);
            evaluation = {
              appointmentRef,
              state: isPresent
                ? 'present'
                : input.sourceCompleteness === 'complete' &&
                    currentCapacity.completeness === 'complete' &&
                    currentCapacity.availability === 'unavailable'
                  ? 'absent'
                  : 'unknown',
              basis: currentCapacity.basis,
            };
          } catch {
            providerFailure = true;
            evaluation = {
              appointmentRef,
              state: 'unknown',
              basis: 'provider_current_capacity_read_failed',
            };
          }
        }
      }
      evaluations.set(appointmentRef, evaluation);
      capacityByAppointmentId.set(appointmentId, currentCapacity);
    }

    for (const event of latestEvents) {
      const appointment = appointmentById.get(event.entityId) ?? null;
      rows.push({
        tenantId,
        eventId: event.id,
        entityType: event.entityType,
        entityId: event.entityId,
        eventType: event.type,
        occurredAt: event.occurredAt.toISOString(),
        receivedAt: event.receivedAt.toISOString(),
        ingestionMethod: event.ingestionMethod,
        observationOrigin: event.observation,
        watchStartedAt: integration.watchStartedAt.toISOString(),
        appointment: appointment
          ? {
              id: appointment.id,
              tenantId: appointment.tenantId,
              status: appointment.status,
              blockedStartAt: appointment.blockedStartAt.toISOString(),
              blockedEndAt: appointment.blockedEndAt.toISOString(),
              currentCapacity:
                capacityByAppointmentId.get(appointment.id) ?? null,
            }
          : null,
      });
    }

    const projectionResult = projectAppointmentRemovalShadow({
      rows,
      cutoverAt: cutoverAt.toISOString(),
      asOf: input.asOf.toISOString(),
    });
    const projection = bindProjectionToTrustedTenant({
      projection: projectionResult.projection,
      sourceTenantRef: opportunityShadowTenantRef(tenantId),
      trustedTenantId: tenantId,
    });
    const completeness: CurrentStateScanCompleteness = providerFailure
      ? 'provider_failure'
      : limitReached
        ? 'partial'
        : input.sourceCompleteness;
    const presentSemanticKeys = new Set(
      projection.opportunities.map((opportunity) => opportunity.semanticKey),
    );
    const resolutions =
      completeness === 'complete'
        ? buildResolutions({
            activeOpportunities,
            evaluations,
            presentSemanticKeys,
            observedAt: input.asOf,
          })
        : [];

    const reconciled = await this.lifecycle.reconcileCurrentProjection({
      tenantId,
      projection,
      validatedAt: input.asOf,
      currentState: {
        completeness,
        opportunityTypes: [FAMILY],
        resolutions,
      },
    });
    const [after, staleTasks] = await Promise.all([
      this.lifecycle.snapshot(tenantId),
      this.lifecycle.countStaleCurrentTasks({
        tenantId,
        asOf: input.asOf,
      }),
    ]);

    return {
      status: 'ran',
      completeness,
      detectedNow: projection.opportunities.length,
      durableActiveBefore: before.opportunities.active,
      resolved: increase(
        after.opportunities.resolved,
        before.opportunities.resolved,
      ),
      expired: increase(
        after.opportunities.expired,
        before.opportunities.expired,
      ),
      superseded: increase(
        after.opportunities.superseded,
        before.opportunities.superseded,
      ),
      durableActiveAfter: after.opportunities.active,
      currentTasks: after.agentTasks.current,
      staleTasks,
      duplicateAttemptsCollapsed:
        projection.metrics.deduplicated + reconciled.duplicateAttemptsCollapsed,
      actionIntentsProposed: projection.actionIntents.length,
      actionIntentsExecuted: 0,
      externalSideEffects: 0,
    };
  }

  private async currentCapacity(input: {
    tenantId: string;
    timezone: string;
    appointment: AppointmentRead;
  }): Promise<NonNullable<OpportunityShadowAppointmentV1['currentCapacity']>> {
    const localStart = localDateTime(
      input.appointment.blockedStartAt,
      input.timezone,
    );
    const localEnd = localDateTime(
      input.appointment.blockedEndAt,
      input.timezone,
    );
    if (localStart.date !== localEnd.date) {
      return {
        availability: 'unknown',
        completeness: 'unknown',
        scheduleRef: null,
        basis: 'cross_day_capacity_not_supported',
      };
    }

    const serviceIds = stringArray(input.appointment.serviceIds);
    if (serviceIds.length === 0) {
      return {
        availability: 'unknown',
        completeness: 'unknown',
        scheduleRef: null,
        basis: 'appointment_service_identity_incomplete',
      };
    }

    const [schedule, availableSlots] = await Promise.all([
      this.crm.getStaffScheduleDay(input.tenantId, {
        staffId: input.appointment.staffExternalId,
        date: localStart.date,
      }),
      this.crm.getAvailableSlots(input.tenantId, {
        date: localStart.date,
        staffId: input.appointment.staffExternalId,
        serviceIds,
        ...(input.appointment.branchId
          ? { branchId: input.appointment.branchId }
          : {}),
      }),
    ]);
    if (
      schedule.staff_id !== input.appointment.staffExternalId ||
      schedule.date !== localStart.date
    ) {
      return {
        availability: 'unknown',
        completeness: 'unknown',
        scheduleRef: null,
        basis: 'provider_schedule_identity_mismatch',
      };
    }

    const scheduleRef = opportunityShadowScheduleRef({
      tenantId: input.tenantId,
      staffExternalId: input.appointment.staffExternalId,
      localDate: localStart.date,
      scheduleFingerprint: schedule.revision,
    });
    const insideWorkingSchedule =
      schedule.is_working &&
      scheduleSlotsContain(
        schedule.slots,
        localStart.minutes,
        localEnd.minutes,
      );
    const providerSlotAvailable = availableSlots.some((slot) => {
      const start = new Date(slot.start);
      const end = new Date(slot.end);
      return (
        !Number.isNaN(start.getTime()) &&
        !Number.isNaN(end.getTime()) &&
        slot.staff_id === input.appointment.staffExternalId &&
        start.getTime() <= input.appointment.blockedStartAt.getTime() &&
        end.getTime() >= input.appointment.blockedEndAt.getTime()
      );
    });

    return {
      availability:
        insideWorkingSchedule && providerSlotAvailable
          ? 'available'
          : 'unavailable',
      completeness: 'complete',
      scheduleRef,
      basis:
        insideWorkingSchedule && providerSlotAvailable
          ? 'provider_schedule_and_available_slot_confirmed'
          : 'provider_schedule_or_available_slot_absent',
    };
  }

  private isEnabled(): boolean {
    const raw = String(
      this.config.get<string>('OPPORTUNITY_LIFECYCLE_ENABLED') ?? '',
    )
      .trim()
      .toLowerCase();
    return ['1', 'true', 'on', 'yes'].includes(raw);
  }

  private cutoverAt(): Date {
    const raw = String(
      this.config.get<string>('OPPORTUNITY_LIFECYCLE_CUTOVER_AT') ?? '',
    ).trim();
    const parsed = new Date(raw);
    if (!raw || Number.isNaN(parsed.getTime())) {
      throw new Error(
        'OPPORTUNITY_LIFECYCLE_CUTOVER_AT must be a valid ISO instant when lifecycle is enabled.',
      );
    }
    return parsed;
  }
}

function latestEventPerAppointment(events: EventRead[]): EventRead[] {
  const latest = new Map<string, EventRead>();
  for (const event of events) {
    if (!latest.has(event.entityId)) latest.set(event.entityId, event);
  }
  return [...latest.values()].sort((left, right) =>
    left.entityId.localeCompare(right.entityId),
  );
}

function buildResolutions(input: {
  activeOpportunities: ActiveOpportunityRead[];
  evaluations: Map<string, CurrentConditionEvaluation>;
  presentSemanticKeys: Set<string>;
  observedAt: Date;
}): OpportunityCurrentStateResolutionV1[] {
  const resolutions: OpportunityCurrentStateResolutionV1[] = [];
  for (const opportunity of input.activeOpportunities) {
    if (
      !opportunity.affectedEntityRef ||
      input.presentSemanticKeys.has(opportunity.semanticKey)
    ) {
      continue;
    }
    const evaluation = input.evaluations.get(opportunity.affectedEntityRef);
    if (!evaluation || evaluation.state !== 'absent') continue;
    const evidence: OpportunityEvidenceV1[] = [
      {
        owner: 'occupancy_capacity',
        capability: 'occupancy.capacity.read',
        factRef: evaluation.appointmentRef,
        version: 1,
        observedAt: input.observedAt.toISOString(),
        asOf: input.observedAt.toISOString(),
        completeness: 'complete',
        basis: evaluation.basis,
      },
    ];
    resolutions.push({
      semanticKey: opportunity.semanticKey,
      proof: {
        evidenceFingerprint: resolutionEvidenceFingerprint(evidence),
        evidence,
        observedAt: input.observedAt.toISOString(),
        reasonCode: evaluation.basis,
      },
    });
  }
  return resolutions;
}

function localDateTime(
  instant: Date,
  timezone: string,
): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = value('year');
  const month = value('month');
  const day = value('day');
  const hour = Number(value('hour'));
  const minute = Number(value('minute'));
  if (
    !year ||
    !month ||
    !day ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    throw new Error('Unable to derive tenant-local appointment time.');
  }
  return { date: `${year}-${month}-${day}`, minutes: hour * 60 + minute };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).filter(Boolean))].sort();
}

function emptyResult(
  status: OpportunityLifecycleRunResult['status'],
  completeness: CurrentStateScanCompleteness,
  snapshot: OpportunityLifecycleSnapshot,
  staleTasks: number,
): OpportunityLifecycleRunResult {
  return {
    status,
    completeness,
    detectedNow: 0,
    durableActiveBefore: snapshot.opportunities.active,
    resolved: 0,
    expired: 0,
    superseded: 0,
    durableActiveAfter: snapshot.opportunities.active,
    currentTasks: snapshot.agentTasks.current,
    staleTasks,
    duplicateAttemptsCollapsed: 0,
    actionIntentsProposed: 0,
    actionIntentsExecuted: 0,
    externalSideEffects: 0,
  };
}

function increase(after: number, before: number): number {
  return Math.max(0, after - before);
}

function assertInstant(value: Date, label: string): void {
  if (!Number.isFinite(value.getTime())) {
    throw new Error(`${label} must be a valid instant.`);
  }
}
