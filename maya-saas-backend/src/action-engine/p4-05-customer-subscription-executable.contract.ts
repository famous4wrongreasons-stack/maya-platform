import { createHash } from 'node:crypto';

import type { ActionSourceType } from './action-engine.contract';
import { ActionContractError } from './action-engine.errors';
import { customerSubscriptionActivationShadowNormalizer } from './customer-subscription-activation-shadow.contract';
import { customerSubscriptionCancellationShadowNormalizer } from './customer-subscription-cancellation-shadow.contract';
import { customerSubscriptionExpiryShadowNormalizer } from './customer-subscription-expiry-shadow.contract';
import { customerSubscriptionPurchaseShadowNormalizer } from './customer-subscription-purchase-shadow.contract';
import { customerSubscriptionRenewalActivationShadowNormalizer } from './customer-subscription-renewal-activation-shadow.contract';
import { customerSubscriptionRenewalShadowNormalizer } from './customer-subscription-renewal-shadow.contract';
import { customerSubscriptionRevocationShadowNormalizer } from './customer-subscription-revocation-shadow.contract';
import { customerSubscriptionUsageShadowNormalizer } from './customer-subscription-usage-shadow.contract';

export const P4_05_EXECUTABLE_CAPABILITIES = {
  initiatePurchase: 'customer-subscriptions.purchase-checkout.execute.v1',
  activatePurchase: 'customer-subscriptions.activation.execute.v1',
  initiateRenewal: 'customer-subscriptions.renewal-checkout.execute.v1',
  activateRenewal: 'customer-subscriptions.renewal-activation.execute.v1',
  syncUsage: 'customer-subscriptions.usage-sync.execute.v1',
  expire: 'customer-subscriptions.expiry.execute.v1',
  cancel: 'customer-subscriptions.cancellation.execute.v1',
  revoke: 'customer-subscriptions.revocation.execute.v1',
} as const;

export const P4_05_SCHEDULER_ENVELOPE_CAPABILITY =
  'customer-subscriptions.scheduler-envelope.execute.v1' as const;

export const P4_05_SCHEDULER_ENVELOPE_CONTRACT =
  'maya.customer-subscription-scheduler-envelope/1' as const;
export const P4_05_SCHEDULER_POLICY_VERSION =
  'p4-05.subscription-scheduler.bounded-25.v1' as const;

export const P4_05_SCHEDULER_LIMITS = Object.freeze({
  maxTermsPerEnvelope: 25,
  maxAggregateUsageUnits: 50,
});

export type P405ExecutableActionClass =
  | 'initiate_customer_subscription_purchase'
  | 'activate_customer_subscription'
  | 'initiate_customer_subscription_renewal'
  | 'activate_customer_subscription_renewal'
  | 'sync_customer_subscription_usage'
  | 'expire_customer_subscription'
  | 'cancel_customer_subscription'
  | 'revoke_customer_subscription';

export interface P405ExecutableRegistration {
  capability: string;
  actionClass: P405ExecutableActionClass;
  targetKind: string;
  executorKey: string;
  allowedSourceTypes: readonly ActionSourceType[];
  approvalRequired: boolean;
  providerDispatch: boolean;
  riskFacets: readonly string[];
  normalizeInput: (value: unknown) => Record<string, unknown>;
}

/**
 * Executable contracts reuse the accepted strict Shadow normalizers. Trusted
 * planners derive the complete value/payment/actor evidence before Action
 * Ingress; the executor never accepts a caller-selected price, term, status,
 * usage allowance, policy, or approval flag.
 */
export const P4_05_EXECUTABLE_REGISTRATIONS: readonly P405ExecutableRegistration[] =
  [
    {
      capability: P4_05_EXECUTABLE_CAPABILITIES.initiatePurchase,
      actionClass: 'initiate_customer_subscription_purchase',
      targetKind: 'customer_subscription_checkout',
      executorKey: 'customer-subscriptions.checkout',
      allowedSourceTypes: ['authenticated_request', 'legacy_bridge'],
      approvalRequired: false,
      providerDispatch: true,
      riskFacets: ['provider_payment', 'customer_intent', 'no_value_grant'],
      normalizeInput: customerSubscriptionPurchaseShadowNormalizer,
    },
    {
      capability: P4_05_EXECUTABLE_CAPABILITIES.activatePurchase,
      actionClass: 'activate_customer_subscription',
      targetKind: 'customer_subscription_term',
      executorKey: 'customer-subscriptions.term',
      allowedSourceTypes: ['webhook', 'legacy_bridge', 'scheduler'],
      approvalRequired: false,
      providerDispatch: false,
      riskFacets: ['customer_value', 'one_time_activation'],
      normalizeInput: customerSubscriptionActivationShadowNormalizer,
    },
    {
      capability: P4_05_EXECUTABLE_CAPABILITIES.initiateRenewal,
      actionClass: 'initiate_customer_subscription_renewal',
      targetKind: 'customer_subscription_renewal_checkout',
      executorKey: 'customer-subscriptions.checkout',
      allowedSourceTypes: ['authenticated_request', 'legacy_bridge'],
      approvalRequired: false,
      providerDispatch: true,
      riskFacets: [
        'provider_payment',
        'customer_intent',
        'predecessor_bound',
        'no_value_grant',
      ],
      normalizeInput: customerSubscriptionRenewalShadowNormalizer,
    },
    {
      capability: P4_05_EXECUTABLE_CAPABILITIES.activateRenewal,
      actionClass: 'activate_customer_subscription_renewal',
      targetKind: 'customer_subscription_term',
      executorKey: 'customer-subscriptions.term',
      allowedSourceTypes: ['webhook', 'legacy_bridge', 'scheduler'],
      approvalRequired: false,
      providerDispatch: false,
      riskFacets: [
        'customer_value',
        'one_time_activation',
        'predecessor_bound',
      ],
      normalizeInput: customerSubscriptionRenewalActivationShadowNormalizer,
    },
    {
      capability: P4_05_EXECUTABLE_CAPABILITIES.syncUsage,
      actionClass: 'sync_customer_subscription_usage',
      targetKind: 'customer_subscription_usage',
      executorKey: 'customer-subscriptions.usage',
      allowedSourceTypes: ['scheduler', 'legacy_bridge'],
      approvalRequired: false,
      providerDispatch: false,
      riskFacets: ['customer_value', 'one_time_claim', 'bounded_fan_out'],
      normalizeInput: customerSubscriptionUsageShadowNormalizer,
    },
    {
      capability: P4_05_EXECUTABLE_CAPABILITIES.expire,
      actionClass: 'expire_customer_subscription',
      targetKind: 'customer_subscription_term',
      executorKey: 'customer-subscriptions.terminal',
      allowedSourceTypes: ['scheduler', 'legacy_bridge'],
      approvalRequired: false,
      providerDispatch: false,
      riskFacets: ['terminal', 'time_evidence'],
      normalizeInput: customerSubscriptionExpiryShadowNormalizer,
    },
    {
      capability: P4_05_EXECUTABLE_CAPABILITIES.cancel,
      actionClass: 'cancel_customer_subscription',
      targetKind: 'customer_subscription_term',
      executorKey: 'customer-subscriptions.terminal',
      allowedSourceTypes: ['authenticated_request', 'legacy_bridge'],
      approvalRequired: false,
      providerDispatch: false,
      riskFacets: ['terminal', 'actor_authorized'],
      normalizeInput: customerSubscriptionCancellationShadowNormalizer,
    },
    {
      capability: P4_05_EXECUTABLE_CAPABILITIES.revoke,
      actionClass: 'revoke_customer_subscription',
      targetKind: 'customer_subscription_term',
      executorKey: 'customer-subscriptions.terminal',
      allowedSourceTypes: ['authenticated_request', 'legacy_bridge'],
      approvalRequired: true,
      providerDispatch: false,
      riskFacets: ['terminal', 'destructive', 'approval_bound'],
      normalizeInput: customerSubscriptionRevocationShadowNormalizer,
    },
  ];

export interface P405SchedulerCandidate {
  actionClass:
    'sync_customer_subscription_usage' | 'expire_customer_subscription';
  subscriptionId: string;
  termIdentityHash: string;
  plannedUsageUnits: number;
}

export interface P405SchedulerEnvelope {
  contract: typeof P4_05_SCHEDULER_ENVELOPE_CONTRACT;
  tenantId: string;
  policyVersion: typeof P4_05_SCHEDULER_POLICY_VERSION;
  policyWindow: string;
  candidateSetHash: string;
  batchIdentityHash: string;
  candidateCount: number;
  aggregateUsageUnits: number;
  maxTermsPerEnvelope: number;
  maxAggregateUsageUnits: number;
  childExecutionIdentities: string[];
  fanOutMode: 'BOUNDED_PER_TERM_EXECUTIONS';
  approvalRequirement: 'NONE_WITHIN_CAP';
  providerPaymentExecutionOwner: false;
}

const OPAQUE = /^[A-Za-z0-9._:/-]{1,240}$/;

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !OPAQUE.test(value)) {
    throw new ActionContractError(`${label} must be an opaque reference`);
  }
  return value;
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new ActionContractError(`${label} must be a non-negative integer`);
  }
  return Number(value);
}

function hash(parts: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('base64url');
}

function windowFor(now: Date): string {
  if (Number.isNaN(now.getTime())) {
    throw new ActionContractError('scheduler time is invalid');
  }
  return now.toISOString().slice(0, 13);
}

export function buildCustomerSubscriptionSchedulerEnvelope(input: {
  tenantId: string;
  now: Date;
  candidates: readonly P405SchedulerCandidate[];
}): P405SchedulerEnvelope {
  const tenantId = text(input.tenantId, 'tenantId');
  if (
    input.candidates.length < 1 ||
    input.candidates.length > P4_05_SCHEDULER_LIMITS.maxTermsPerEnvelope
  ) {
    throw new ActionContractError('scheduler fan-out is outside the cap');
  }
  const canonical = input.candidates
    .map((candidate) => ({
      actionClass: candidate.actionClass,
      subscriptionId: text(candidate.subscriptionId, 'subscriptionId'),
      termIdentityHash: text(candidate.termIdentityHash, 'termIdentityHash'),
      plannedUsageUnits: integer(
        candidate.plannedUsageUnits,
        'plannedUsageUnits',
      ),
    }))
    .sort((left, right) =>
      [left.actionClass, left.subscriptionId, left.termIdentityHash].join(':') <
      [right.actionClass, right.subscriptionId, right.termIdentityHash].join(
        ':',
      )
        ? -1
        : 1,
    );
  const unique = new Set(
    canonical.map((candidate) =>
      [
        candidate.actionClass,
        candidate.subscriptionId,
        candidate.termIdentityHash,
      ].join(':'),
    ),
  );
  if (unique.size !== canonical.length) {
    throw new ActionContractError('scheduler candidates must be unique');
  }
  const aggregateUsageUnits = canonical.reduce(
    (sum, candidate) => sum + candidate.plannedUsageUnits,
    0,
  );
  if (aggregateUsageUnits > P4_05_SCHEDULER_LIMITS.maxAggregateUsageUnits) {
    throw new ActionContractError('scheduler aggregate usage exceeds the cap');
  }
  const policyWindow = windowFor(input.now);
  const candidateSetHash = hash(
    canonical.flatMap((candidate) => [
      candidate.actionClass,
      candidate.subscriptionId,
      candidate.termIdentityHash,
      String(candidate.plannedUsageUnits),
    ]),
  );
  const batchIdentityHash = hash([
    P4_05_SCHEDULER_ENVELOPE_CONTRACT,
    tenantId,
    P4_05_SCHEDULER_POLICY_VERSION,
    policyWindow,
    candidateSetHash,
  ]);
  const childExecutionIdentities = canonical.map((candidate) =>
    hash([
      P4_05_SCHEDULER_ENVELOPE_CONTRACT,
      tenantId,
      candidate.actionClass,
      candidate.subscriptionId,
      candidate.termIdentityHash,
    ]),
  );
  return {
    contract: P4_05_SCHEDULER_ENVELOPE_CONTRACT,
    tenantId,
    policyVersion: P4_05_SCHEDULER_POLICY_VERSION,
    policyWindow,
    candidateSetHash,
    batchIdentityHash,
    candidateCount: canonical.length,
    aggregateUsageUnits,
    maxTermsPerEnvelope: P4_05_SCHEDULER_LIMITS.maxTermsPerEnvelope,
    maxAggregateUsageUnits: P4_05_SCHEDULER_LIMITS.maxAggregateUsageUnits,
    childExecutionIdentities,
    fanOutMode: 'BOUNDED_PER_TERM_EXECUTIONS',
    approvalRequirement: 'NONE_WITHIN_CAP',
    providerPaymentExecutionOwner: false,
  };
}

export function customerSubscriptionSchedulerEnvelopeNormalizer(
  value: unknown,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ActionContractError('Scheduler envelope must be an object');
  }
  const source = value as Record<string, unknown>;
  const allowed = new Set([
    'contract',
    'tenantId',
    'policyVersion',
    'policyWindow',
    'candidateSetHash',
    'batchIdentityHash',
    'candidateCount',
    'aggregateUsageUnits',
    'maxTermsPerEnvelope',
    'maxAggregateUsageUnits',
    'childExecutionIdentities',
    'fanOutMode',
    'approvalRequirement',
    'providerPaymentExecutionOwner',
  ]);
  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new ActionContractError('Scheduler envelope contains extra facts');
  }
  if (
    source.contract !== P4_05_SCHEDULER_ENVELOPE_CONTRACT ||
    source.policyVersion !== P4_05_SCHEDULER_POLICY_VERSION ||
    source.fanOutMode !== 'BOUNDED_PER_TERM_EXECUTIONS' ||
    source.approvalRequirement !== 'NONE_WITHIN_CAP' ||
    source.providerPaymentExecutionOwner !== false ||
    source.maxTermsPerEnvelope !== P4_05_SCHEDULER_LIMITS.maxTermsPerEnvelope ||
    source.maxAggregateUsageUnits !==
      P4_05_SCHEDULER_LIMITS.maxAggregateUsageUnits
  ) {
    throw new ActionContractError('Scheduler policy is not canonical');
  }
  const candidateCount = integer(source.candidateCount, 'candidateCount');
  const aggregateUsageUnits = integer(
    source.aggregateUsageUnits,
    'aggregateUsageUnits',
  );
  if (
    candidateCount < 1 ||
    candidateCount > P4_05_SCHEDULER_LIMITS.maxTermsPerEnvelope ||
    aggregateUsageUnits > P4_05_SCHEDULER_LIMITS.maxAggregateUsageUnits ||
    !Array.isArray(source.childExecutionIdentities) ||
    source.childExecutionIdentities.length !== candidateCount
  ) {
    throw new ActionContractError('Scheduler envelope exceeds its cap');
  }
  return {
    contract: P4_05_SCHEDULER_ENVELOPE_CONTRACT,
    tenantId: text(source.tenantId, 'tenantId'),
    policyVersion: P4_05_SCHEDULER_POLICY_VERSION,
    policyWindow: text(source.policyWindow, 'policyWindow'),
    candidateSetHash: text(source.candidateSetHash, 'candidateSetHash'),
    batchIdentityHash: text(source.batchIdentityHash, 'batchIdentityHash'),
    candidateCount,
    aggregateUsageUnits,
    maxTermsPerEnvelope: P4_05_SCHEDULER_LIMITS.maxTermsPerEnvelope,
    maxAggregateUsageUnits: P4_05_SCHEDULER_LIMITS.maxAggregateUsageUnits,
    childExecutionIdentities: source.childExecutionIdentities.map((identity) =>
      text(identity, 'childExecutionIdentity'),
    ),
    fanOutMode: 'BOUNDED_PER_TERM_EXECUTIONS',
    approvalRequirement: 'NONE_WITHIN_CAP',
    providerPaymentExecutionOwner: false,
  };
}

export function remainingCustomerSubscriptionSchedulerChildren(input: {
  envelope: P405SchedulerEnvelope;
  completedChildExecutionIdentities: ReadonlySet<string>;
}): string[] {
  return input.envelope.childExecutionIdentities.filter(
    (identity) => !input.completedChildExecutionIdentities.has(identity),
  );
}
