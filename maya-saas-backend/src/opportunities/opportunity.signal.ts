import type {
  BusinessFact,
  BusinessFactState,
  DomainEventType,
  IngestionMethod,
  ObservationOrigin,
} from '../domain';
import { DOMAIN_EVENT_TYPE } from '../domain';
import type { ClientRecencyFacts } from '../business-facts/client-recency-facts.service';
import type { OpportunityEntityRef } from './opportunity.contract';

export type EvidenceLifecycle = 'active' | 'resolved' | 'expired';

interface OpportunitySignalBase {
  tenantId: string;
  observedAt: string;
  /** Family-owned validity boundary. Chapter 5 has no global fallback TTL. */
  expiresAt: string;
  evidenceLifecycle: EvidenceLifecycle;
}

export interface ClientRecencySignalV1 extends OpportunitySignalBase {
  kind: 'client_recency';
  clientRef: string;
  factRef: string;
  asOf: string;
  distance: {
    days: number | null;
    state: BusinessFactState;
    reason: string | null;
  };
  attendanceProven: boolean;
  basis: string | null;
}

export interface AppointmentRemovedCapacitySignalV1 extends OpportunitySignalBase {
  kind: 'appointment_removed_capacity';
  eventRef: string;
  appointmentRef: string;
  eventType: DomainEventType;
  ingestionMethod: IngestionMethod;
  observationOrigin: ObservationOrigin;
  occurredAt: string;
  cutoverAt: string;
  capacity: {
    state: BusinessFactState;
    durationMinutes: number | null;
    intervalRef: string | null;
    basis: string;
  };
}

export interface BusinessFactChangeSignalV1 extends OpportunitySignalBase {
  kind: 'business_fact_change';
  changeRef: string;
  currentFactRef: string;
  previousFactRef: string;
  metricKey: string;
  direction: 'increased' | 'decreased' | 'changed';
  currentState: BusinessFactState;
  previousState: BusinessFactState;
  affectedEntity: OpportunityEntityRef;
  basis: 'canonical_business_state_comparison';
}

export interface CriticalBusinessInputSignalV1 extends OpportunitySignalBase {
  kind: 'critical_business_input';
  factRef: string;
  factKey: string;
  state: BusinessFactState;
  affectedEntity: OpportunityEntityRef;
  basis: string;
}

export interface IncomingCustomerRequestSignalV1 extends OpportunitySignalBase {
  kind: 'incoming_customer_request';
  requestRef: string;
  /** The engine intentionally never copies this text into evidence or tasks. */
  untrustedText?: string;
}

export type OpportunitySignalV1 =
  | ClientRecencySignalV1
  | AppointmentRemovedCapacitySignalV1
  | BusinessFactChangeSignalV1
  | CriticalBusinessInputSignalV1
  | IncomingCustomerRequestSignalV1;

export function recencySignalFromFacts(input: {
  tenantId: string;
  clientRef: string;
  factRef: string;
  facts: ClientRecencyFacts;
  observedAt: string;
  expiresAt: string;
  evidenceLifecycle?: EvidenceLifecycle;
}): ClientRecencySignalV1 {
  return {
    kind: 'client_recency',
    tenantId: input.tenantId,
    clientRef: input.clientRef,
    factRef: input.factRef,
    asOf: input.facts.as_of.instant,
    distance: input.facts.days_since_last_attended_visit,
    attendanceProven: input.facts.last_attended_visit.attendance_proven,
    basis: input.facts.last_attended_visit.basis,
    observedAt: input.observedAt,
    expiresAt: input.expiresAt,
    evidenceLifecycle: input.evidenceLifecycle ?? 'active',
  };
}

export function appointmentRemovedCapacitySignal(input: {
  tenantId: string;
  eventRef: string;
  appointmentRef: string;
  eventType: DomainEventType;
  ingestionMethod: IngestionMethod;
  observationOrigin: ObservationOrigin;
  occurredAt: string;
  cutoverAt: string;
  capacity: AppointmentRemovedCapacitySignalV1['capacity'];
  observedAt: string;
  expiresAt: string;
  evidenceLifecycle?: EvidenceLifecycle;
}): AppointmentRemovedCapacitySignalV1 {
  return {
    kind: 'appointment_removed_capacity',
    ...input,
    evidenceLifecycle: input.evidenceLifecycle ?? 'active',
  };
}

export function businessFactChangeSignal(input: {
  changeRef: string;
  currentFactRef: string;
  previousFactRef: string;
  current: BusinessFact;
  previous: BusinessFact;
  direction: BusinessFactChangeSignalV1['direction'];
  affectedEntity: OpportunityEntityRef;
  observedAt: string;
  expiresAt: string;
  evidenceLifecycle?: EvidenceLifecycle;
}): BusinessFactChangeSignalV1 {
  if (input.current.tenantId !== input.previous.tenantId) {
    throw new Error('Business fact change cannot cross tenant boundaries.');
  }
  if (input.current.key !== input.previous.key) {
    throw new Error('Business fact change must compare the same metric key.');
  }

  return {
    kind: 'business_fact_change',
    tenantId: input.current.tenantId,
    changeRef: input.changeRef,
    currentFactRef: input.currentFactRef,
    previousFactRef: input.previousFactRef,
    metricKey: input.current.key,
    direction: input.direction,
    currentState: input.current.state,
    previousState: input.previous.state,
    affectedEntity: input.affectedEntity,
    basis: 'canonical_business_state_comparison',
    observedAt: input.observedAt,
    expiresAt: input.expiresAt,
    evidenceLifecycle: input.evidenceLifecycle ?? 'active',
  };
}

export function criticalBusinessInputSignal(input: {
  factRef: string;
  fact: BusinessFact;
  affectedEntity: OpportunityEntityRef;
  observedAt: string;
  expiresAt: string;
  evidenceLifecycle?: EvidenceLifecycle;
}): CriticalBusinessInputSignalV1 {
  return {
    kind: 'critical_business_input',
    tenantId: input.fact.tenantId,
    factRef: input.factRef,
    factKey: input.fact.key,
    state: input.fact.state,
    affectedEntity: input.affectedEntity,
    basis: input.fact.basis ?? input.fact.observation.source,
    observedAt: input.observedAt,
    expiresAt: input.expiresAt,
    evidenceLifecycle: input.evidenceLifecycle ?? 'active',
  };
}

export function incomingCustomerRequestSignal(input: {
  tenantId: string;
  requestRef: string;
  observedAt: string;
  untrustedText?: string;
  expiresAt: string;
  evidenceLifecycle?: EvidenceLifecycle;
}): IncomingCustomerRequestSignalV1 {
  return {
    kind: 'incoming_customer_request',
    ...input,
    evidenceLifecycle: input.evidenceLifecycle ?? 'active',
  };
}

export function isCanonicalRemovedEvent(
  signal: AppointmentRemovedCapacitySignalV1,
): boolean {
  return signal.eventType === DOMAIN_EVENT_TYPE.appointmentRemoved;
}
