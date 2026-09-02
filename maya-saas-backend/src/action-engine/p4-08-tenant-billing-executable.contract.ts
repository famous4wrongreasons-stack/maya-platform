import { createHash } from 'node:crypto';

import type { ActionSourceType } from './action-engine.contract';
import { ActionContractError } from './action-engine.errors';

export const P4_08_ACTION_CLASSES = [
  'initiate_tenant_billing_checkout',
  'charge_tenant_billing_recurring',
  'apply_tenant_billing_payment_outcome',
  'transition_tenant_billing_past_due',
] as const;

export type P408ActionClass = (typeof P4_08_ACTION_CLASSES)[number];

export const P4_08_SHADOW_CAPABILITIES = Object.freeze({
  checkout: 'tenant-billing.checkout.shadow.v1',
  recurring: 'tenant-billing.recurring.shadow.v1',
  outcome: 'tenant-billing.payment-outcome.shadow.v1',
  pastDue: 'tenant-billing.past-due.shadow.v1',
});

export const P4_08_EXECUTABLE_CAPABILITIES = Object.freeze({
  checkout: 'tenant-billing.checkout.execute.v1',
  recurring: 'tenant-billing.recurring.execute.v1',
  outcome: 'tenant-billing.payment-outcome.execute.v1',
  pastDue: 'tenant-billing.past-due.execute.v1',
});

export const P4_08_SCHEDULER_ENVELOPE_CAPABILITY =
  'tenant-billing.scheduler-envelope.execute.v1' as const;
export const P4_08_SCHEDULER_ENVELOPE_CONTRACT =
  'maya.tenant-billing-scheduler-envelope/1' as const;
export const P4_08_POLICY_VERSION = 'p4-08.billing-policy.v1' as const;

export const P4_08_SAFETY_LIMITS = Object.freeze({
  maxChildrenPerEnvelope: 25,
  maxAutomaticPaymentKopecks: 300_000,
  maxAggregateValuePerEnvelopeKopecks: 7_500_000,
});

export interface P408Registration {
  capability: string;
  actionClass: P408ActionClass;
  targetKind: string;
  executorKey: string;
  allowedSourceTypes: readonly ActionSourceType[];
  providerDispatch: boolean;
  normalizeInput(value: unknown): Record<string, unknown>;
}

const OPAQUE = /^[A-Za-z0-9._:/-]{1,240}$/;
const ISO_CURRENCY = /^[A-Z]{3}$/;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ActionContractError('Tenant billing input must be an object');
  }
  return value as Record<string, unknown>;
}

function only(source: Record<string, unknown>, keys: readonly string[]): void {
  const allowed = new Set(keys);
  const extras = Object.keys(source).filter((key) => !allowed.has(key));
  if (extras.length) {
    throw new ActionContractError(
      `Unexpected tenant billing input: ${extras.join(', ')}`,
    );
  }
}

function text(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || !OPAQUE.test(value)) {
    throw new ActionContractError(`${key} must be an opaque reference`);
  }
  return value;
}

function nullableText(
  source: Record<string, unknown>,
  key: string,
): string | null {
  return source[key] === null ? null : text(source, key);
}

function integer(
  source: Record<string, unknown>,
  key: string,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const value = source[key];
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 0 ||
    Number(value) > maximum
  ) {
    throw new ActionContractError(`${key} is outside the approved range`);
  }
  return Number(value);
}

function instant(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string') {
    throw new ActionContractError(`${key} must be an ISO timestamp`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ActionContractError(`${key} must be an exact ISO timestamp`);
  }
  return value;
}

function nullableInstant(
  source: Record<string, unknown>,
  key: string,
): string | null {
  return source[key] === null ? null : instant(source, key);
}

function commonPolicy(source: Record<string, unknown>) {
  if (source.policyVersion !== P4_08_POLICY_VERSION) {
    throw new ActionContractError('policyVersion is not canonical');
  }
  if (
    source.approvalRequirement !== 'NONE_WITHIN_APPROVED_CAPS' &&
    source.approvalRequirement !== 'ACTOR_AUTHORITY_REQUIRED'
  ) {
    throw new ActionContractError('approvalRequirement is not canonical');
  }
  return {
    policyVersion: P4_08_POLICY_VERSION,
    policySnapshotHash: text(source, 'policySnapshotHash'),
    approvalRequirement: source.approvalRequirement,
  };
}

function money(source: Record<string, unknown>) {
  const amountKopecks = integer(source, 'amountKopecks');
  const currency = source.currency;
  if (typeof currency !== 'string' || !ISO_CURRENCY.test(currency)) {
    throw new ActionContractError('currency must be an ISO currency');
  }
  return { amountKopecks, currency };
}

const CHECKOUT_KEYS = [
  'tenantId',
  'planId',
  'planSnapshotHash',
  'amountKopecks',
  'currency',
  'activePlanId',
  'activeWindowEndsAt',
  'samePlanPrepayment',
  'checkoutIdentityHash',
  'providerRequestIdentitySeedHash',
  'returnUrlPolicyHash',
  'actorIdentityHash',
  'policyVersion',
  'policySnapshotHash',
  'approvalRequirement',
  'expectedProviderState',
  'providerDispatchPerformed',
  'paymentDerivedEntitlementMutations',
] as const;

export function tenantBillingCheckoutNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = record(value);
  only(source, CHECKOUT_KEYS);
  const activePlanId = nullableText(source, 'activePlanId');
  const activeWindowEndsAt = nullableInstant(source, 'activeWindowEndsAt');
  const samePlanPrepayment = source.samePlanPrepayment === true;
  if (
    (activeWindowEndsAt !== null && !activePlanId) ||
    (activeWindowEndsAt !== null && activePlanId !== source.planId) ||
    samePlanPrepayment !== (activeWindowEndsAt !== null)
  ) {
    throw new ActionContractError(
      'Active-window checkout must be same-plan-only',
    );
  }
  if (
    source.expectedProviderState !== 'PENDING' ||
    source.providerDispatchPerformed !== false ||
    source.paymentDerivedEntitlementMutations !== 0
  ) {
    throw new ActionContractError(
      'Checkout Shadow mutation boundary is invalid',
    );
  }
  return {
    tenantId: text(source, 'tenantId'),
    planId: text(source, 'planId'),
    planSnapshotHash: text(source, 'planSnapshotHash'),
    ...money(source),
    activePlanId,
    activeWindowEndsAt,
    samePlanPrepayment,
    checkoutIdentityHash: text(source, 'checkoutIdentityHash'),
    providerRequestIdentitySeedHash: text(
      source,
      'providerRequestIdentitySeedHash',
    ),
    returnUrlPolicyHash: text(source, 'returnUrlPolicyHash'),
    actorIdentityHash: text(source, 'actorIdentityHash'),
    ...commonPolicy(source),
    expectedProviderState: 'PENDING',
    providerDispatchPerformed: false,
    paymentDerivedEntitlementMutations: 0,
  };
}

const RECURRING_KEYS = [
  'tenantId',
  'planId',
  'planSnapshotHash',
  'amountKopecks',
  'currency',
  'dueWindowEndsAt',
  'billingMethodIdentityHash',
  'recurringIdentityHash',
  'providerRequestIdentitySeedHash',
  'envelopeIdentityHash',
  'childIndex',
  'envelopeChildCount',
  'envelopeAggregateKopecks',
  'maxChildrenPerEnvelope',
  'maxAutomaticPaymentKopecks',
  'maxAggregateValuePerEnvelopeKopecks',
  'policyVersion',
  'policySnapshotHash',
  'approvalRequirement',
  'expectedProviderState',
  'providerDispatchPerformed',
  'paymentDerivedEntitlementMutations',
] as const;

export function tenantBillingRecurringNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = record(value);
  only(source, RECURRING_KEYS);
  const amount = integer(
    source,
    'amountKopecks',
    P4_08_SAFETY_LIMITS.maxAutomaticPaymentKopecks,
  );
  const childCount = integer(
    source,
    'envelopeChildCount',
    P4_08_SAFETY_LIMITS.maxChildrenPerEnvelope,
  );
  const childIndex = integer(source, 'childIndex');
  const aggregate = integer(
    source,
    'envelopeAggregateKopecks',
    P4_08_SAFETY_LIMITS.maxAggregateValuePerEnvelopeKopecks,
  );
  if (
    childCount < 1 ||
    childIndex >= childCount ||
    amount < 1 ||
    aggregate < amount ||
    source.maxChildrenPerEnvelope !==
      P4_08_SAFETY_LIMITS.maxChildrenPerEnvelope ||
    source.maxAutomaticPaymentKopecks !==
      P4_08_SAFETY_LIMITS.maxAutomaticPaymentKopecks ||
    source.maxAggregateValuePerEnvelopeKopecks !==
      P4_08_SAFETY_LIMITS.maxAggregateValuePerEnvelopeKopecks ||
    source.expectedProviderState !== 'PENDING' ||
    source.providerDispatchPerformed !== false ||
    source.paymentDerivedEntitlementMutations !== 0
  ) {
    throw new ActionContractError('Recurring safety envelope is invalid');
  }
  const currency = source.currency;
  if (typeof currency !== 'string' || !ISO_CURRENCY.test(currency)) {
    throw new ActionContractError('currency must be an ISO currency');
  }
  return {
    tenantId: text(source, 'tenantId'),
    planId: text(source, 'planId'),
    planSnapshotHash: text(source, 'planSnapshotHash'),
    amountKopecks: amount,
    currency,
    dueWindowEndsAt: instant(source, 'dueWindowEndsAt'),
    billingMethodIdentityHash: text(source, 'billingMethodIdentityHash'),
    recurringIdentityHash: text(source, 'recurringIdentityHash'),
    providerRequestIdentitySeedHash: text(
      source,
      'providerRequestIdentitySeedHash',
    ),
    envelopeIdentityHash: text(source, 'envelopeIdentityHash'),
    childIndex,
    envelopeChildCount: childCount,
    envelopeAggregateKopecks: aggregate,
    ...P4_08_SAFETY_LIMITS,
    ...commonPolicy(source),
    expectedProviderState: 'PENDING',
    providerDispatchPerformed: false,
    paymentDerivedEntitlementMutations: 0,
  };
}

const OUTCOME_KEYS = [
  'tenantId',
  'billingPaymentId',
  'originActionExecutionId',
  'planId',
  'amountKopecks',
  'currency',
  'purpose',
  'providerPaymentIdentityHash',
  'providerStatus',
  'providerPaidAt',
  'providerMethodIdentityHash',
  'outcomeIdentityHash',
  'authoritativeProviderRead',
  'policyVersion',
  'policySnapshotHash',
  'approvalRequirement',
  'paymentDerivedEntitlementMutationPerformed',
] as const;

export function tenantBillingOutcomeNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = record(value);
  only(source, OUTCOME_KEYS);
  if (
    (source.providerStatus !== 'succeeded' &&
      source.providerStatus !== 'canceled') ||
    (source.purpose !== 'initial_checkout' && source.purpose !== 'recurring') ||
    source.authoritativeProviderRead !== true ||
    source.paymentDerivedEntitlementMutationPerformed !== false
  ) {
    throw new ActionContractError('Payment outcome is not authoritative');
  }
  const paidAt = nullableInstant(source, 'providerPaidAt');
  if (source.providerStatus === 'succeeded' && !paidAt) {
    throw new ActionContractError('Successful payment requires paidAt');
  }
  return {
    tenantId: text(source, 'tenantId'),
    billingPaymentId: text(source, 'billingPaymentId'),
    originActionExecutionId: text(source, 'originActionExecutionId'),
    planId: text(source, 'planId'),
    ...money(source),
    purpose: source.purpose,
    providerPaymentIdentityHash: text(source, 'providerPaymentIdentityHash'),
    providerStatus: source.providerStatus,
    providerPaidAt: paidAt,
    providerMethodIdentityHash: nullableText(
      source,
      'providerMethodIdentityHash',
    ),
    outcomeIdentityHash: text(source, 'outcomeIdentityHash'),
    authoritativeProviderRead: true,
    ...commonPolicy(source),
    paymentDerivedEntitlementMutationPerformed: false,
  };
}

const PAST_DUE_KEYS = [
  'tenantId',
  'accessWindowEndsAt',
  'transitionAt',
  'pastDueAt',
  'graceEndsAt',
  'canceledRecurringPaymentId',
  'transitionIdentityHash',
  'pendingPaymentExecutionIds',
  'policyVersion',
  'policySnapshotHash',
  'approvalRequirement',
  'pastDueMutationPerformed',
] as const;

export function tenantBillingPastDueNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = record(value);
  only(source, PAST_DUE_KEYS);
  if (
    !Array.isArray(source.pendingPaymentExecutionIds) ||
    source.pendingPaymentExecutionIds.length !== 0 ||
    source.pastDueMutationPerformed !== false
  ) {
    throw new ActionContractError(
      'Past-due transition requires zero unresolved payment executions',
    );
  }
  const transitionAt = instant(source, 'transitionAt');
  const accessWindowEndsAt = instant(source, 'accessWindowEndsAt');
  if (new Date(transitionAt) < new Date(accessWindowEndsAt)) {
    throw new ActionContractError('Paid/trial access window is not expired');
  }
  return {
    tenantId: text(source, 'tenantId'),
    accessWindowEndsAt,
    transitionAt,
    pastDueAt: instant(source, 'pastDueAt'),
    graceEndsAt: instant(source, 'graceEndsAt'),
    canceledRecurringPaymentId: nullableText(
      source,
      'canceledRecurringPaymentId',
    ),
    transitionIdentityHash: text(source, 'transitionIdentityHash'),
    pendingPaymentExecutionIds: [],
    ...commonPolicy(source),
    pastDueMutationPerformed: false,
  };
}

export const P4_08_REGISTRATIONS: readonly P408Registration[] = [
  {
    capability: P4_08_EXECUTABLE_CAPABILITIES.checkout,
    actionClass: 'initiate_tenant_billing_checkout',
    targetKind: 'tenant_billing_checkout',
    executorKey: 'tenant-billing.checkout',
    allowedSourceTypes: ['authenticated_request', 'legacy_bridge'],
    providerDispatch: true,
    normalizeInput: tenantBillingCheckoutNormalizer,
  },
  {
    capability: P4_08_EXECUTABLE_CAPABILITIES.recurring,
    actionClass: 'charge_tenant_billing_recurring',
    targetKind: 'tenant_billing_charge',
    executorKey: 'tenant-billing.recurring',
    allowedSourceTypes: ['scheduler', 'authenticated_request', 'legacy_bridge'],
    providerDispatch: true,
    normalizeInput: tenantBillingRecurringNormalizer,
  },
  {
    capability: P4_08_EXECUTABLE_CAPABILITIES.outcome,
    actionClass: 'apply_tenant_billing_payment_outcome',
    targetKind: 'billing_payment',
    executorKey: 'tenant-billing.payment-outcome',
    allowedSourceTypes: ['webhook', 'scheduler', 'legacy_bridge'],
    providerDispatch: false,
    normalizeInput: tenantBillingOutcomeNormalizer,
  },
  {
    capability: P4_08_EXECUTABLE_CAPABILITIES.pastDue,
    actionClass: 'transition_tenant_billing_past_due',
    targetKind: 'tenant_billing_access_window',
    executorKey: 'tenant-billing.past-due',
    allowedSourceTypes: ['scheduler', 'authenticated_request', 'legacy_bridge'],
    providerDispatch: false,
    normalizeInput: tenantBillingPastDueNormalizer,
  },
];

export interface P408BillingCandidate {
  tenantId: string;
  dueWindowEndsAt: string;
  planId: string;
  planSnapshotHash: string;
  amountKopecks: number;
  currency: string;
}

export interface P408SchedulerEnvelope {
  contract: typeof P4_08_SCHEDULER_ENVELOPE_CONTRACT;
  policyVersion: typeof P4_08_POLICY_VERSION;
  policyWindow: string;
  candidateSetHash: string;
  envelopeIdentityHash: string;
  childCount: number;
  aggregateKopecks: number;
  childExecutionIdentities: string[];
  maxChildrenPerEnvelope: number;
  maxAutomaticPaymentKopecks: number;
  maxAggregateValuePerEnvelopeKopecks: number;
  fanOutMode: 'BOUNDED_PER_TENANT_EXECUTIONS';
  paymentExecutionOwner: 'ACTION_ENGINE_CHILD';
}

function hash(parts: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('base64url');
}

export function p408Hash(parts: readonly string[]): string {
  return hash(parts);
}

export function buildTenantBillingSchedulerEnvelope(input: {
  now: Date;
  candidates: readonly P408BillingCandidate[];
}): P408SchedulerEnvelope {
  if (Number.isNaN(input.now.getTime())) {
    throw new ActionContractError('Scheduler time is invalid');
  }
  if (
    input.candidates.length < 1 ||
    input.candidates.length > P4_08_SAFETY_LIMITS.maxChildrenPerEnvelope
  ) {
    throw new ActionContractError('Billing envelope child cap exceeded');
  }
  const candidates = input.candidates
    .map((candidate) => {
      const source = record(candidate);
      const amountKopecks = integer(
        source,
        'amountKopecks',
        P4_08_SAFETY_LIMITS.maxAutomaticPaymentKopecks,
      );
      if (amountKopecks < 1) {
        throw new ActionContractError('Automatic payment must be positive');
      }
      return {
        tenantId: text(source, 'tenantId'),
        dueWindowEndsAt: instant(source, 'dueWindowEndsAt'),
        planId: text(source, 'planId'),
        planSnapshotHash: text(source, 'planSnapshotHash'),
        amountKopecks,
        currency: String(source.currency),
      };
    })
    .sort((a, b) =>
      [a.tenantId, a.dueWindowEndsAt, a.planId]
        .join(':')
        .localeCompare([b.tenantId, b.dueWindowEndsAt, b.planId].join(':')),
    );
  const identities = candidates.map((candidate) =>
    hash([
      'p4-08.recurring-child.v1',
      candidate.tenantId,
      candidate.dueWindowEndsAt,
      candidate.planId,
      candidate.planSnapshotHash,
      String(candidate.amountKopecks),
      candidate.currency,
    ]),
  );
  if (new Set(identities).size !== identities.length) {
    throw new ActionContractError(
      'Billing envelope contains duplicate children',
    );
  }
  const aggregateKopecks = candidates.reduce(
    (sum, candidate) => sum + candidate.amountKopecks,
    0,
  );
  if (
    aggregateKopecks > P4_08_SAFETY_LIMITS.maxAggregateValuePerEnvelopeKopecks
  ) {
    throw new ActionContractError('Billing envelope aggregate cap exceeded');
  }
  const policyWindow = input.now.toISOString().slice(0, 13);
  const candidateSetHash = hash(identities);
  return {
    contract: P4_08_SCHEDULER_ENVELOPE_CONTRACT,
    policyVersion: P4_08_POLICY_VERSION,
    policyWindow,
    candidateSetHash,
    envelopeIdentityHash: hash([
      P4_08_SCHEDULER_ENVELOPE_CONTRACT,
      P4_08_POLICY_VERSION,
      policyWindow,
      candidateSetHash,
    ]),
    childCount: candidates.length,
    aggregateKopecks,
    childExecutionIdentities: identities,
    ...P4_08_SAFETY_LIMITS,
    fanOutMode: 'BOUNDED_PER_TENANT_EXECUTIONS',
    paymentExecutionOwner: 'ACTION_ENGINE_CHILD',
  };
}

export function tenantBillingSchedulerEnvelopeNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = record(value);
  const allowed = [
    'contract',
    'policyVersion',
    'policyWindow',
    'candidateSetHash',
    'envelopeIdentityHash',
    'childCount',
    'aggregateKopecks',
    'childExecutionIdentities',
    'maxChildrenPerEnvelope',
    'maxAutomaticPaymentKopecks',
    'maxAggregateValuePerEnvelopeKopecks',
    'fanOutMode',
    'paymentExecutionOwner',
  ] as const;
  only(source, allowed);
  if (
    source.contract !== P4_08_SCHEDULER_ENVELOPE_CONTRACT ||
    source.policyVersion !== P4_08_POLICY_VERSION ||
    source.fanOutMode !== 'BOUNDED_PER_TENANT_EXECUTIONS' ||
    source.paymentExecutionOwner !== 'ACTION_ENGINE_CHILD'
  ) {
    throw new ActionContractError(
      'Billing scheduler envelope is not canonical',
    );
  }
  const identities = source.childExecutionIdentities;
  if (!Array.isArray(identities)) {
    throw new ActionContractError('childExecutionIdentities must be an array');
  }
  const normalized = identities.map((item) => {
    if (typeof item !== 'string' || !OPAQUE.test(item)) {
      throw new ActionContractError('Child identity must be opaque');
    }
    return item;
  });
  const childCount = integer(
    source,
    'childCount',
    P4_08_SAFETY_LIMITS.maxChildrenPerEnvelope,
  );
  const aggregateKopecks = integer(
    source,
    'aggregateKopecks',
    P4_08_SAFETY_LIMITS.maxAggregateValuePerEnvelopeKopecks,
  );
  if (
    childCount < 1 ||
    normalized.length !== childCount ||
    new Set(normalized).size !== normalized.length ||
    source.maxChildrenPerEnvelope !==
      P4_08_SAFETY_LIMITS.maxChildrenPerEnvelope ||
    source.maxAutomaticPaymentKopecks !==
      P4_08_SAFETY_LIMITS.maxAutomaticPaymentKopecks ||
    source.maxAggregateValuePerEnvelopeKopecks !==
      P4_08_SAFETY_LIMITS.maxAggregateValuePerEnvelopeKopecks
  ) {
    throw new ActionContractError('Billing scheduler caps are not canonical');
  }
  return {
    contract: P4_08_SCHEDULER_ENVELOPE_CONTRACT,
    policyVersion: P4_08_POLICY_VERSION,
    policyWindow: text(source, 'policyWindow'),
    candidateSetHash: text(source, 'candidateSetHash'),
    envelopeIdentityHash: text(source, 'envelopeIdentityHash'),
    childCount,
    aggregateKopecks,
    childExecutionIdentities: normalized,
    ...P4_08_SAFETY_LIMITS,
    fanOutMode: 'BOUNDED_PER_TENANT_EXECUTIONS',
    paymentExecutionOwner: 'ACTION_ENGINE_CHILD',
  };
}
