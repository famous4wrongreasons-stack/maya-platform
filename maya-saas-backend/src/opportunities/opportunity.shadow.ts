import { createHash } from 'node:crypto';

import {
  APPOINTMENT_REMOVED_STATUS,
  DOMAIN_EVENT_TYPE,
  type IngestionMethod,
} from '../domain';
import type { OpportunityProjectionV1 } from './opportunity.contract';
import { CanonicalOpportunityEngine } from './opportunity.engine';
import { appointmentRemovedCapacitySignal } from './opportunity.signal';

export const OPPORTUNITY_SHADOW_CONTRACT =
  'maya.opportunity-shadow-projection/1' as const;

export function opportunityShadowTenantRef(tenantId: string): string {
  return opaqueRef('tenant', tenantId);
}

export function opportunityShadowAppointmentRef(
  tenantId: string,
  appointmentId: string,
): string {
  return opaqueRef('appointment', `${tenantId}:${appointmentId}`);
}

export function opportunityShadowIntervalRef(input: {
  tenantId: string;
  appointmentId: string;
  blockedStartAt: string;
  blockedEndAt: string;
}): string {
  return opaqueRef(
    'interval',
    `${input.tenantId}:${input.appointmentId}:${input.blockedStartAt}:${input.blockedEndAt}`,
  );
}

export function opportunityShadowScheduleRef(input: {
  tenantId: string;
  staffExternalId: string;
  localDate: string;
  scheduleFingerprint: string;
}): string {
  return opaqueRef(
    'schedule',
    `${input.tenantId}:${input.staffExternalId}:${input.localDate}:${input.scheduleFingerprint}`,
  );
}

export type OpportunityShadowRejectionReason =
  | 'unsupported_event_type'
  | 'unsupported_entity_type'
  | 'unsupported_ingestion_method'
  | 'bootstrap'
  | 'wrong_observation_origin'
  | 'watch_not_started'
  | 'invalid_timestamp'
  | 'before_cutover'
  | 'event_after_projection'
  | 'appointment_missing'
  | 'appointment_tenant_mismatch'
  | 'appointment_not_removed'
  | 'capacity_unavailable'
  | 'capacity_incomplete'
  | 'invalid_interval'
  | 'expired_capacity';

export interface OpportunityShadowAppointmentV1 {
  id: string;
  tenantId: string;
  status: string;
  blockedStartAt: string | null;
  blockedEndAt: string | null;
  currentCapacity: {
    availability: 'available' | 'unavailable' | 'unknown';
    completeness: 'complete' | 'partial' | 'unknown';
    scheduleRef: string | null;
    basis: string;
  } | null;
}

/**
 * Normalized read model for a shadow projection. It deliberately contains no
 * payload, sourceRef, client identity, contact data, or provider credentials.
 */
export interface OpportunityShadowEventRowV1 {
  tenantId: string;
  eventId: string;
  entityType: string;
  entityId: string;
  eventType: string;
  occurredAt: string;
  receivedAt: string;
  ingestionMethod: string;
  observationOrigin: string;
  watchStartedAt: string | null;
  appointment: OpportunityShadowAppointmentV1 | null;
}

export interface OpportunityShadowProjectionInputV1 {
  rows: OpportunityShadowEventRowV1[];
  /** Explicit global lower bound, normally the approved release cutover. */
  cutoverAt: string;
  /** Explicit projection clock. The projector never reads the system clock. */
  asOf: string;
}

export interface OpportunityShadowProjectionResultV1 {
  contract: typeof OPPORTUNITY_SHADOW_CONTRACT;
  mode: 'L2_5_SHADOW';
  cutoverAt: string;
  asOf: string;
  source: {
    rowsRead: number;
    accepted: number;
    rejected: number;
    rejectedByReason: Record<OpportunityShadowRejectionReason, number>;
  };
  projection: OpportunityProjectionV1;
  safety: {
    readOnly: true;
    sideEffects: false;
    executed: 0;
    identifiers: 'opaque_sha256_refs';
  };
}

const REJECTION_REASONS: readonly OpportunityShadowRejectionReason[] = [
  'unsupported_event_type',
  'unsupported_entity_type',
  'unsupported_ingestion_method',
  'bootstrap',
  'wrong_observation_origin',
  'watch_not_started',
  'invalid_timestamp',
  'before_cutover',
  'event_after_projection',
  'appointment_missing',
  'appointment_tenant_mismatch',
  'appointment_not_removed',
  'capacity_unavailable',
  'capacity_incomplete',
  'invalid_interval',
  'expired_capacity',
];

/**
 * Converts proven WATCH rows into canonical signals and runs the one Chapter 5
 * Opportunity owner. This module has no persistence, queue, network, model, or
 * action dependency; production access belongs only to the read-only CLI edge.
 */
export function projectAppointmentRemovalShadow(
  input: OpportunityShadowProjectionInputV1,
): OpportunityShadowProjectionResultV1 {
  const cutoverAt = parseRequiredInstant(input.cutoverAt, 'shadow cutoverAt');
  const asOf = parseRequiredInstant(input.asOf, 'shadow asOf');
  const rejectedByReason = emptyRejectionCounts();
  const signals = [...input.rows].sort(compareRows).flatMap((row) => {
    const normalized = normalizeRow({ row, cutoverAt, asOf });
    if ('reason' in normalized) {
      rejectedByReason[normalized.reason] += 1;
      return [];
    }
    return [normalized.signal];
  });

  const projection = new CanonicalOpportunityEngine().project({
    signals,
    policies: [],
    asOf: asOf.toISOString(),
  });

  if (projection.metrics.executed !== 0) {
    throw new Error('Shadow projection crossed the Chapter 5 action boundary.');
  }

  return {
    contract: OPPORTUNITY_SHADOW_CONTRACT,
    mode: 'L2_5_SHADOW',
    cutoverAt: cutoverAt.toISOString(),
    asOf: asOf.toISOString(),
    source: {
      rowsRead: input.rows.length,
      accepted: signals.length,
      rejected: input.rows.length - signals.length,
      rejectedByReason,
    },
    projection,
    safety: {
      readOnly: true,
      sideEffects: false,
      executed: 0,
      identifiers: 'opaque_sha256_refs',
    },
  };
}

function normalizeRow(input: {
  row: OpportunityShadowEventRowV1;
  cutoverAt: Date;
  asOf: Date;
}):
  | { signal: ReturnType<typeof appointmentRemovedCapacitySignal> }
  | { reason: OpportunityShadowRejectionReason } {
  const { row, cutoverAt, asOf } = input;
  if (row.eventType !== DOMAIN_EVENT_TYPE.appointmentRemoved) {
    return { reason: 'unsupported_event_type' };
  }
  if (row.entityType !== 'appointment') {
    return { reason: 'unsupported_entity_type' };
  }
  if (row.ingestionMethod === 'bootstrap') {
    return { reason: 'bootstrap' };
  }
  if (!isLiveIngestionMethod(row.ingestionMethod)) {
    return { reason: 'unsupported_ingestion_method' };
  }
  if (row.observationOrigin !== 'after_watch_started') {
    return { reason: 'wrong_observation_origin' };
  }
  if (!row.watchStartedAt) {
    return { reason: 'watch_not_started' };
  }

  const occurredAt = parseOptionalInstant(row.occurredAt);
  const receivedAt = parseOptionalInstant(row.receivedAt);
  const watchStartedAt = parseOptionalInstant(row.watchStartedAt);
  if (!occurredAt || !receivedAt || !watchStartedAt) {
    return { reason: 'invalid_timestamp' };
  }

  const effectiveCutover = new Date(
    Math.max(cutoverAt.getTime(), watchStartedAt.getTime()),
  );
  if (occurredAt.getTime() < effectiveCutover.getTime()) {
    return { reason: 'before_cutover' };
  }
  if (occurredAt.getTime() > asOf.getTime()) {
    return { reason: 'event_after_projection' };
  }

  const appointment = row.appointment;
  if (!appointment) return { reason: 'appointment_missing' };
  if (
    appointment.tenantId !== row.tenantId ||
    appointment.id !== row.entityId
  ) {
    return { reason: 'appointment_tenant_mismatch' };
  }
  if (appointment.status !== APPOINTMENT_REMOVED_STATUS) {
    return { reason: 'appointment_not_removed' };
  }
  if (!appointment.blockedStartAt || !appointment.blockedEndAt) {
    return { reason: 'capacity_unavailable' };
  }

  const blockedStartAt = parseOptionalInstant(appointment.blockedStartAt);
  const blockedEndAt = parseOptionalInstant(appointment.blockedEndAt);
  if (!blockedStartAt || !blockedEndAt) {
    return { reason: 'invalid_timestamp' };
  }
  const durationMinutes =
    (blockedEndAt.getTime() - blockedStartAt.getTime()) / 60_000;
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    return { reason: 'invalid_interval' };
  }
  if (blockedEndAt.getTime() <= asOf.getTime()) {
    return { reason: 'expired_capacity' };
  }

  const currentCapacity = appointment.currentCapacity;
  if (!currentCapacity) return { reason: 'capacity_unavailable' };
  if (currentCapacity.completeness !== 'complete') {
    return { reason: 'capacity_incomplete' };
  }
  if (
    currentCapacity.availability !== 'available' ||
    !currentCapacity.scheduleRef
  ) {
    return { reason: 'capacity_unavailable' };
  }

  const tenantRef = opportunityShadowTenantRef(row.tenantId);
  const eventRef = opaqueRef('event', `${row.tenantId}:${row.eventId}`);
  const appointmentRef = opportunityShadowAppointmentRef(
    row.tenantId,
    row.entityId,
  );
  const intervalRef = opportunityShadowIntervalRef({
    tenantId: row.tenantId,
    appointmentId: row.entityId,
    blockedStartAt: blockedStartAt.toISOString(),
    blockedEndAt: blockedEndAt.toISOString(),
  });

  return {
    signal: appointmentRemovedCapacitySignal({
      tenantId: tenantRef,
      eventRef,
      appointmentRef,
      eventType: DOMAIN_EVENT_TYPE.appointmentRemoved,
      ingestionMethod: row.ingestionMethod,
      observationOrigin: row.observationOrigin,
      occurredAt: occurredAt.toISOString(),
      cutoverAt: effectiveCutover.toISOString(),
      capacity: {
        state: 'measured',
        availability: currentCapacity.availability,
        completeness: currentCapacity.completeness,
        durationMinutes,
        intervalRef,
        scheduleRef: currentCapacity.scheduleRef,
        basis: currentCapacity.basis,
      },
      observedAt: receivedAt.toISOString(),
      expiresAt: blockedEndAt.toISOString(),
    }),
  };
}

function emptyRejectionCounts(): Record<
  OpportunityShadowRejectionReason,
  number
> {
  return Object.fromEntries(
    REJECTION_REASONS.map((reason) => [reason, 0]),
  ) as Record<OpportunityShadowRejectionReason, number>;
}

function isLiveIngestionMethod(value: string): value is IngestionMethod {
  return value === 'webhook' || value === 'reconciliation';
}

function parseRequiredInstant(value: string, label: string): Date {
  const parsed = parseOptionalInstant(value);
  if (!parsed) throw new Error(`${label} must be a valid ISO instant.`);
  return parsed;
}

function parseOptionalInstant(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function opaqueRef(namespace: string, value: string): string {
  const digest = createHash('sha256')
    .update(`${namespace}\u0000${value}`, 'utf8')
    .digest('hex');
  return `${namespace}_${digest.slice(0, 32)}`;
}

function compareRows(
  left: OpportunityShadowEventRowV1,
  right: OpportunityShadowEventRowV1,
): number {
  return [left.tenantId, left.eventId, left.receivedAt]
    .join('\u0000')
    .localeCompare(
      [right.tenantId, right.eventId, right.receivedAt].join('\u0000'),
    );
}
