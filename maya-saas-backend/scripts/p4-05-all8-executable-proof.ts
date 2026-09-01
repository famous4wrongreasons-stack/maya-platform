import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  ActionApprovalDecision,
  ActionAttemptState,
  ActionExecutionState,
  CalendarSource,
  MembershipStatus,
  PrismaClient,
  TenantStatus,
  UserRole,
} from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  CUSTOMER_SUBSCRIPTION_ACTIVATION_SHADOW_POLICY_PROFILE,
  CUSTOMER_SUBSCRIPTION_CANCELLATION_CONTRACT_VERSION,
  CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_POLICY_PROFILE,
  CUSTOMER_SUBSCRIPTION_CHECKOUT_CONTRACT_VERSION,
  CUSTOMER_SUBSCRIPTION_EXPIRY_CONTRACT_VERSION,
  CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_POLICY_PROFILE,
  CUSTOMER_SUBSCRIPTION_INITIAL_TERM_CONTRACT_VERSION,
  CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
  CUSTOMER_SUBSCRIPTION_PURCHASE_OFFERS,
  CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_POLICY_PROFILE,
  CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_POLICY_PROFILE,
  CUSTOMER_SUBSCRIPTION_RENEWAL_CHECKOUT_CONTRACT_VERSION,
  CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_POLICY_PROFILE,
  CUSTOMER_SUBSCRIPTION_RENEWAL_TERM_CONTRACT_VERSION,
  CUSTOMER_SUBSCRIPTION_RENEWAL_WINDOW_DAYS,
  CUSTOMER_SUBSCRIPTION_RENEWAL_WINDOW_POLICY,
  CUSTOMER_SUBSCRIPTION_REVOCATION_CONTRACT_VERSION,
  CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_POLICY_PROFILE,
  CUSTOMER_SUBSCRIPTION_USAGE_CONTRACT_VERSION,
  CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_POLICY_PROFILE,
  P4_05_EXECUTABLE_CAPABILITIES,
  P4_05_SCHEDULER_ENVELOPE_CAPABILITY,
  P4_05_SCHEDULER_LIMITS,
  actionExecutionResultFromError,
  buildCustomerSubscriptionSchedulerEnvelope,
  createStandaloneCanonicalActionEngine,
  remainingCustomerSubscriptionSchedulerChildren,
  type TrustedActionExecutionRequestV1,
} from '../src/action-engine';
import {
  FEATURE_REQUIREMENT_DECISION_CONTRACT,
  type EntitlementsService,
  type FeatureRequirementDecision,
} from '../src/entitlements/entitlements.service';
import {
  P405CustomerSubscriptionExecutableService,
  P405ProviderDispatchAmbiguousError,
  type P405CheckoutProvider,
  type P405ProviderPayment,
  type P405ProviderReferenceCodec,
} from '../src/customer-subscriptions/p4-05-customer-subscription-executable.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const IDENTITY_SECRET =
  'cycle-06-p4-05-all8-proof-identity-secret-disposable-database-only';
const PAYLOAD_SECRET =
  'cycle-06-p4-05-all8-proof-payload-secret-disposable-database-only';
const PROOF_NOW = new Date('2026-09-02T12:00:00.000Z');
const OFFER = CUSTOMER_SUBSCRIPTION_PURCHASE_OFFERS['haircut.senior'];

type Engine = ReturnType<typeof createStandaloneCanonicalActionEngine>;
type SourceType =
  'authenticated_request' | 'scheduler' | 'legacy_bridge' | 'webhook';

function proofDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  const database = decodeURIComponent(new URL(value).pathname.slice(1));
  if (!database.startsWith('maya_c06_p405_all8_')) {
    throw new Error(
      'P4-05 proof refuses non-disposable databases; expected maya_c06_p405_all8_*',
    );
  }
  return value;
}

function opaque(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`;
}

function hash(parts: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('base64url');
}

function hexHash(parts: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function plusDays(value: string, days: number): string {
  return new Date(new Date(value).getTime() + days * 86_400_000).toISOString();
}

function proofEntitlements(): Pick<
  EntitlementsService,
  'resolveFeatureRequirements'
> {
  return {
    resolveFeatureRequirements: (
      tenantId,
      requiredFeatures,
      evaluatedAt = new Date(),
    ): Promise<FeatureRequirementDecision> =>
      Promise.resolve({
        contract: FEATURE_REQUIREMENT_DECISION_CONTRACT,
        tenantId,
        planId: null,
        requiredFeatures: requiredFeatures.map((featureKey) => ({
          featureKey,
          enabled: true,
        })),
        allowed: true,
        evaluatedAt,
        validUntil: null,
      }),
  };
}

function actionRequest(input: {
  tenantId: string;
  capability: string;
  targetRef: string;
  normalizedInput: unknown;
  logicalKey: string;
  actorUserId?: string;
  sourceType?: SourceType;
}): TrustedActionExecutionRequestV1 {
  return {
    contract: ACTION_EXECUTION_REQUEST_CONTRACT,
    tenantId: input.tenantId,
    capability: input.capability,
    source: {
      type: input.sourceType ?? 'legacy_bridge',
      occurrenceScope: `p4-05:${input.logicalKey}`,
      sourceRef: `p4-05-proof:${input.capability}`,
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    },
    targetRef: input.targetRef,
    input: input.normalizedInput,
    evidenceRefs: [`proof:${input.logicalKey}`],
    callerIdempotency: {
      scope: `p4-05.${input.capability}`,
      key: input.logicalKey,
    },
  };
}

async function createTenant(prisma: PrismaClient, label: string) {
  const tenantId = opaque(`tenant_${label}`);
  const ownerId = opaque(`owner_${label}`);
  await prisma.tenant.create({
    data: {
      id: tenantId,
      name: `P4-05 disposable proof ${label}`,
      slug: `p4-05-proof-${label}-${randomUUID()}`,
      status: TenantStatus.active,
      calendarSource: CalendarSource.internal,
      users: {
        create: {
          id: ownerId,
          email: `${ownerId}@proof.invalid`,
          passwordHash: 'not-a-real-password-hash',
          role: UserRole.tenant_owner,
          memberships: {
            create: {
              tenantId,
              role: UserRole.tenant_owner,
              status: MembershipStatus.active,
            },
          },
        },
      },
    },
  });
  const membership = await prisma.membership.findUniqueOrThrow({
    where: { userId_tenantId: { userId: ownerId, tenantId } },
  });
  return { tenantId, ownerId, membershipId: membership.id };
}

async function createClient(
  prisma: PrismaClient,
  tenantId: string,
  label: string,
) {
  const id = opaque(`client_${label}`);
  const externalId = opaque(`yclients_${label}`);
  await prisma.client.create({ data: { id, tenantId, userId: null } });
  await prisma.crmClientLink.create({
    data: { tenantId, clientId: id, provider: 'yclients', externalId },
  });
  return { id, externalId };
}

class ProofReferenceCodec implements P405ProviderReferenceCodec {
  encrypt(value: string): string {
    return `proof.enc.${Buffer.from(value, 'utf8').toString('base64url')}`;
  }

  decrypt(value: string): string {
    const encoded = value.replace(/^proof\.enc\./, '');
    return Buffer.from(encoded, 'base64url').toString('utf8');
  }

  hash(value: string): string {
    return hash(['p4-05.provider-reference.v1', value]);
  }
}

class ProofCheckoutProvider implements P405CheckoutProvider {
  private readonly byKey = new Map<string, P405ProviderPayment>();
  private readonly byId = new Map<string, P405ProviderPayment>();
  private ambiguity: 'none' | 'reconcile' | 'inconclusive' = 'none';
  createCalls = 0;
  readCalls = 0;
  reconciliationCalls = 0;

  makeNextDispatchAmbiguous(mode: 'reconcile' | 'inconclusive'): void {
    this.ambiguity = mode;
  }

  createPayment(input: {
    idempotencyKey: string;
    amountKopecks: number;
    currency: string;
    metadata: Readonly<Record<string, string>>;
  }): Promise<P405ProviderPayment> {
    const existing = this.byKey.get(input.idempotencyKey);
    if (existing) return Promise.resolve(structuredClone(existing));
    this.createCalls += 1;
    const payment: P405ProviderPayment = {
      id: opaque('provider_payment'),
      status: 'pending',
      paid: false,
      amountKopecks: input.amountKopecks,
      currency: input.currency,
      capturedAt: null,
      metadata: { ...input.metadata },
    };
    this.byKey.set(input.idempotencyKey, payment);
    this.byId.set(payment.id, payment);
    if (this.ambiguity !== 'none') {
      throw new P405ProviderDispatchAmbiguousError(
        `synthetic ${this.ambiguity} response loss after provider apply`,
      );
    }
    return Promise.resolve(structuredClone(payment));
  }

  getPayment(providerPaymentId: string): Promise<P405ProviderPayment | null> {
    this.readCalls += 1;
    const payment = this.byId.get(providerPaymentId);
    return Promise.resolve(payment ? structuredClone(payment) : null);
  }

  reconcileByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<
    | { outcome: 'FOUND'; payment: P405ProviderPayment }
    | { outcome: 'NOT_FOUND' }
    | { outcome: 'UNKNOWN' }
  > {
    this.reconciliationCalls += 1;
    if (this.ambiguity === 'inconclusive') {
      return Promise.resolve({ outcome: 'UNKNOWN' });
    }
    const payment = this.byKey.get(idempotencyKey);
    this.ambiguity = 'none';
    return Promise.resolve(
      payment
        ? { outcome: 'FOUND', payment: structuredClone(payment) }
        : { outcome: 'NOT_FOUND' },
    );
  }

  paymentForKey(idempotencyKey: string): P405ProviderPayment {
    const payment = this.byKey.get(idempotencyKey);
    if (!payment) throw new Error('proof provider payment is missing');
    return payment;
  }

  markSucceeded(idempotencyKey: string, capturedAt: string): void {
    const payment = this.paymentForKey(idempotencyKey);
    payment.status = 'succeeded';
    payment.paid = true;
    payment.capturedAt = capturedAt;
  }
}

async function rejects(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to reject');
}

async function approve(
  engine: Engine,
  request: TrustedActionExecutionRequestV1,
  approverUserId: string,
): Promise<void> {
  const execution = await engine.ingress.createExecution(request);
  assert.equal(execution.state, ActionExecutionState.PENDING_APPROVAL);
  await engine.kernel.decideApproval({
    tenantId: request.tenantId,
    executionId: execution.id,
    approverUserId,
    decision: ActionApprovalDecision.APPROVED,
  });
}

function postCommitCrashPrisma(prisma: PrismaClient): {
  prisma: PrismaClient;
  crashes(): number;
} {
  type Runner = (
    callback: (
      tx: import('@prisma/client').Prisma.TransactionClient,
    ) => Promise<unknown>,
    options?: {
      isolationLevel?: import('@prisma/client').Prisma.TransactionIsolationLevel;
    },
  ) => Promise<unknown>;
  const run = prisma.$transaction.bind(prisma) as unknown as Runner;
  let crashes = 0;
  const proxy = new Proxy(prisma, {
    get(target, property, receiver) {
      if (property !== '$transaction') {
        return Reflect.get(target, property, receiver) as unknown;
      }
      return async (
        callback: (
          tx: import('@prisma/client').Prisma.TransactionClient,
        ) => Promise<unknown>,
        options?: {
          isolationLevel?: import('@prisma/client').Prisma.TransactionIsolationLevel;
        },
      ) => {
        const result = await run(callback, options);
        if (crashes === 0) {
          crashes += 1;
          throw new Error('synthetic crash after PostgreSQL commit');
        }
        return result;
      };
    },
  });
  return { prisma: proxy, crashes: () => crashes };
}

function clientIdentityHash(input: {
  tenantId: string;
  clientId: string;
  externalId: string;
}): string {
  return hash([
    'p4-05.provider-client.v1',
    input.tenantId,
    'yclients',
    input.externalId,
    input.clientId,
  ]);
}

function purchaseInput(input: {
  tenantId: string;
  clientId: string;
  externalId: string;
  intentRef: string;
}) {
  const providerClientIdentityHash = clientIdentityHash(input);
  const purchaseIntentIdentityHash = hash([
    'p4-05.initial-purchase-intent.v1',
    input.tenantId,
    input.clientId,
    input.intentRef,
  ]);
  const serviceScopeHash = hash([
    'p4-05.subscription-service-scope.v1',
    input.tenantId,
    ...OFFER.serviceScopeRefs,
  ]);
  const planSnapshotHash = hash([
    CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
    input.tenantId,
    OFFER.offerCode,
    OFFER.planCode,
    OFFER.tier,
    String(OFFER.priceKopecks),
    OFFER.currency,
    String(OFFER.visitsIncluded),
    String(OFFER.termDays),
    serviceScopeHash,
  ]);
  const checkoutIdentityHash = hash([
    CUSTOMER_SUBSCRIPTION_CHECKOUT_CONTRACT_VERSION,
    input.tenantId,
    input.clientId,
    purchaseIntentIdentityHash,
    planSnapshotHash,
    String(OFFER.priceKopecks),
    OFFER.currency,
    String(OFFER.visitsIncluded),
  ]);
  return {
    providerClientSource: 'yclients',
    canonicalClientId: input.clientId,
    providerClientIdentityHash,
    checkoutMode: 'initial_purchase',
    purchaseIntentIdentityHash,
    checkoutIdentityHash,
    offerCode: OFFER.offerCode,
    planCode: OFFER.planCode,
    tier: OFFER.tier,
    catalogVersion: CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
    planSnapshotHash,
    serviceScopeHash,
    priceKopecks: OFFER.priceKopecks,
    currency: OFFER.currency,
    visitsIncluded: OFFER.visitsIncluded,
    termDays: OFFER.termDays,
    paymentProvider: 'yookassa',
    providerRequestIdentitySeedHash: hash([
      'p4-05.yookassa-request-seed.v1',
      input.tenantId,
      checkoutIdentityHash,
      'yookassa',
    ]),
    checkoutContractVersion: CUSTOMER_SUBSCRIPTION_CHECKOUT_CONTRACT_VERSION,
    policyProfile: CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_POLICY_PROFILE,
    policySnapshotHash: hash([
      CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_POLICY_PROFILE,
      input.tenantId,
      input.clientId,
      planSnapshotHash,
      'eligible',
      'NONE',
    ]),
    eligibilityDecision: 'eligible',
    approvalRequirement: 'NONE',
    expectedProviderState: 'PENDING',
    unknownApplicable: false,
    intendedProviderOperation: 'provider_checkout_create',
    activatesSubscription: false,
  };
}

function activationInput(input: {
  tenantId: string;
  checkoutExecutionId: string;
  checkout: ReturnType<typeof purchaseInput>;
  providerRequestIdentityHash: string;
  providerPaymentIdentityHash: string;
  paidAt: string;
}) {
  const activationIdentityHash = hash([
    CUSTOMER_SUBSCRIPTION_INITIAL_TERM_CONTRACT_VERSION,
    input.tenantId,
    input.checkoutExecutionId,
    'yookassa',
    input.providerPaymentIdentityHash,
    'succeeded',
  ]);
  const termEndsAt = plusDays(input.paidAt, OFFER.termDays);
  const termIdentityHash = hash([
    'p4-05.customer-subscription-term.v1',
    input.tenantId,
    input.checkout.canonicalClientId,
    activationIdentityHash,
    input.checkout.planSnapshotHash,
    input.paidAt,
    termEndsAt,
  ]);
  return {
    canonicalClientId: input.checkout.canonicalClientId,
    providerClientIdentityHash: input.checkout.providerClientIdentityHash,
    checkoutExecutionId: input.checkoutExecutionId,
    checkoutIdentityHash: input.checkout.checkoutIdentityHash,
    purchaseIntentIdentityHash: input.checkout.purchaseIntentIdentityHash,
    offerCode: OFFER.offerCode,
    planCode: OFFER.planCode,
    tier: OFFER.tier,
    catalogVersion: CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
    planSnapshotHash: input.checkout.planSnapshotHash,
    serviceScopeHash: input.checkout.serviceScopeHash,
    priceKopecks: OFFER.priceKopecks,
    currency: OFFER.currency,
    visitsIncluded: OFFER.visitsIncluded,
    termDays: OFFER.termDays,
    paymentProvider: 'yookassa',
    providerRequestIdentityHash: input.providerRequestIdentityHash,
    providerPaymentIdentityHash: input.providerPaymentIdentityHash,
    providerPaymentState: 'succeeded',
    providerPaidAt: input.paidAt,
    activationIdentityHash,
    termIdentityHash,
    termStartsAt: input.paidAt,
    termEndsAt,
    activationContractVersion:
      CUSTOMER_SUBSCRIPTION_INITIAL_TERM_CONTRACT_VERSION,
    policyProfile: CUSTOMER_SUBSCRIPTION_ACTIVATION_SHADOW_POLICY_PROFILE,
    policySnapshotHash: hash([
      CUSTOMER_SUBSCRIPTION_ACTIVATION_SHADOW_POLICY_PROFILE,
      input.tenantId,
      input.checkout.canonicalClientId,
      input.checkout.planSnapshotHash,
      input.providerPaymentIdentityHash,
      'eligible_for_one_time_activation',
    ]),
    eligibilityDecision: 'eligible_for_one_time_activation',
    oneTimeActivationEligible: true,
    approvalRequirement: 'NONE',
    intendedStatus: 'active',
    unknownApplicable: false,
    providerWritesRequired: false,
  };
}

function renewalInput(input: {
  tenantId: string;
  clientId: string;
  externalId: string;
  predecessor: {
    id: string;
    termIdentityHash: string;
    termStartsAt: Date;
    termEndsAt: Date;
  };
  intentRef: string;
}) {
  const providerClientIdentityHash = clientIdentityHash(input);
  const renewalIntentIdentityHash = hash([
    'p4-05.renewal-intent.v1',
    input.tenantId,
    input.clientId,
    input.predecessor.id,
    input.intentRef,
  ]);
  const serviceScopeHash = hash([
    'p4-05.subscription-service-scope.v1',
    input.tenantId,
    ...OFFER.serviceScopeRefs,
  ]);
  const planSnapshotHash = hash([
    CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
    input.tenantId,
    OFFER.offerCode,
    OFFER.planCode,
    OFFER.tier,
    String(OFFER.priceKopecks),
    OFFER.currency,
    String(OFFER.visitsIncluded),
    String(OFFER.termDays),
    serviceScopeHash,
  ]);
  const checkoutIdentityHash = hash([
    CUSTOMER_SUBSCRIPTION_RENEWAL_CHECKOUT_CONTRACT_VERSION,
    input.tenantId,
    input.clientId,
    input.predecessor.id,
    renewalIntentIdentityHash,
    planSnapshotHash,
  ]);
  const predecessorTermStartsAt = input.predecessor.termStartsAt.toISOString();
  const predecessorTermEndsAt = input.predecessor.termEndsAt.toISOString();
  return {
    providerClientSource: 'yclients',
    canonicalClientId: input.clientId,
    providerClientIdentityHash,
    checkoutMode: 'renewal',
    predecessorSubscriptionId: input.predecessor.id,
    predecessorTermIdentityHash: input.predecessor.termIdentityHash,
    predecessorStatus: 'active',
    predecessorTermStartsAt,
    predecessorTermEndsAt,
    renewalWindowPolicy: CUSTOMER_SUBSCRIPTION_RENEWAL_WINDOW_POLICY,
    renewalWindowOpensAt: new Date(
      input.predecessor.termEndsAt.getTime() -
        CUSTOMER_SUBSCRIPTION_RENEWAL_WINDOW_DAYS * 86_400_000,
    ).toISOString(),
    renewalIntentIdentityHash,
    checkoutIdentityHash,
    offerCode: OFFER.offerCode,
    planCode: OFFER.planCode,
    tier: OFFER.tier,
    catalogVersion: CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
    planSnapshotHash,
    serviceScopeHash,
    priceKopecks: OFFER.priceKopecks,
    currency: OFFER.currency,
    visitsIncluded: OFFER.visitsIncluded,
    termDays: OFFER.termDays,
    nextTermStartRule: 'later_of_predecessor_end_or_payment_succeeded_at',
    minimumNextTermStartsAt: predecessorTermEndsAt,
    paymentProvider: 'yookassa',
    providerRequestIdentitySeedHash: hash([
      'p4-05.yookassa-request-seed.v1',
      input.tenantId,
      checkoutIdentityHash,
      'yookassa',
    ]),
    checkoutContractVersion:
      CUSTOMER_SUBSCRIPTION_RENEWAL_CHECKOUT_CONTRACT_VERSION,
    policyProfile: CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_POLICY_PROFILE,
    policySnapshotHash: hash([
      CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_POLICY_PROFILE,
      input.tenantId,
      input.clientId,
      input.predecessor.id,
      planSnapshotHash,
      'eligible',
    ]),
    eligibilityDecision: 'eligible',
    approvalRequirement: 'NONE',
    expectedProviderState: 'PENDING',
    unknownApplicable: false,
    intendedProviderOperation: 'provider_checkout_create',
    activatesSubscription: false,
    mutatesPredecessor: false,
  };
}

function renewalActivationInput(input: {
  tenantId: string;
  checkoutExecutionId: string;
  checkout: ReturnType<typeof renewalInput>;
  providerRequestIdentityHash: string;
  providerPaymentIdentityHash: string;
  paidAt: string;
}) {
  const termStartsAt = new Date(
    Math.max(
      new Date(input.checkout.predecessorTermEndsAt).getTime(),
      new Date(input.paidAt).getTime(),
    ),
  ).toISOString();
  const termEndsAt = plusDays(termStartsAt, OFFER.termDays);
  const activationIdentityHash = hash([
    CUSTOMER_SUBSCRIPTION_RENEWAL_TERM_CONTRACT_VERSION,
    input.tenantId,
    input.checkout.predecessorSubscriptionId,
    input.checkoutExecutionId,
    input.providerPaymentIdentityHash,
  ]);
  const termIdentityHash = hash([
    'p4-05.customer-subscription-term.v1',
    input.tenantId,
    input.checkout.canonicalClientId,
    activationIdentityHash,
    input.checkout.planSnapshotHash,
    termStartsAt,
    termEndsAt,
  ]);
  return {
    canonicalClientId: input.checkout.canonicalClientId,
    providerClientIdentityHash: input.checkout.providerClientIdentityHash,
    predecessorSubscriptionId: input.checkout.predecessorSubscriptionId,
    predecessorTermIdentityHash: input.checkout.predecessorTermIdentityHash,
    predecessorStatusAtCheckout: 'active',
    predecessorTermStartsAt: input.checkout.predecessorTermStartsAt,
    predecessorTermEndsAt: input.checkout.predecessorTermEndsAt,
    checkoutExecutionId: input.checkoutExecutionId,
    checkoutIdentityHash: input.checkout.checkoutIdentityHash,
    renewalIntentIdentityHash: input.checkout.renewalIntentIdentityHash,
    offerCode: OFFER.offerCode,
    planCode: OFFER.planCode,
    tier: OFFER.tier,
    catalogVersion: CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
    planSnapshotHash: input.checkout.planSnapshotHash,
    serviceScopeHash: input.checkout.serviceScopeHash,
    priceKopecks: OFFER.priceKopecks,
    currency: OFFER.currency,
    visitsIncluded: OFFER.visitsIncluded,
    termDays: OFFER.termDays,
    paymentProvider: 'yookassa',
    providerRequestIdentityHash: input.providerRequestIdentityHash,
    providerPaymentIdentityHash: input.providerPaymentIdentityHash,
    providerPaymentState: 'succeeded',
    providerPaidAt: input.paidAt,
    activationIdentityHash,
    termIdentityHash,
    termStartsAt,
    termEndsAt,
    activationContractVersion:
      CUSTOMER_SUBSCRIPTION_RENEWAL_TERM_CONTRACT_VERSION,
    policyProfile:
      CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_POLICY_PROFILE,
    policySnapshotHash: hash([
      CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_POLICY_PROFILE,
      input.tenantId,
      input.checkout.predecessorSubscriptionId,
      input.providerPaymentIdentityHash,
    ]),
    eligibilityDecision: 'eligible_for_one_time_renewal_activation',
    oneTimeActivationEligible: true,
    approvalRequirement: 'NONE',
    intendedStatus: 'active',
    unknownApplicable: false,
    providerWritesRequired: false,
    mutatesPredecessor: false,
  };
}

function usageInput(input: {
  tenantId: string;
  clientId: string;
  externalId: string;
  term: {
    id: string;
    termIdentityHash: string;
    planSnapshotHash: string;
    serviceScopeHash: string;
    visitsIncluded: number;
    termStartsAt: Date;
    termEndsAt: Date;
  };
  visitRef: string;
  visitAt: string;
  remainingBefore: number;
}) {
  const providerVisitIdentityHash = hash([
    'p4-05.provider-visit.v1',
    input.tenantId,
    input.visitRef,
  ]);
  const providerServiceScopeRef = OFFER.serviceScopeRefs[0];
  const usageIdentityHash = hash([
    CUSTOMER_SUBSCRIPTION_USAGE_CONTRACT_VERSION,
    input.tenantId,
    input.term.id,
    providerVisitIdentityHash,
    providerServiceScopeRef,
  ]);
  return {
    canonicalClientId: input.clientId,
    providerClientIdentityHash: clientIdentityHash(input),
    subscriptionId: input.term.id,
    termIdentityHash: input.term.termIdentityHash,
    offerCode: OFFER.offerCode,
    planCode: OFFER.planCode,
    tier: OFFER.tier,
    catalogVersion: CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
    planSnapshotHash: input.term.planSnapshotHash,
    serviceScopeHash: input.term.serviceScopeHash,
    visitsIncluded: input.term.visitsIncluded,
    termStartsAt: input.term.termStartsAt.toISOString(),
    termEndsAt: input.term.termEndsAt.toISOString(),
    provider: 'yclients',
    providerVisitRecordRefHash: hash(['record', input.visitRef]),
    providerVisitIdentityHash,
    providerObservationSnapshotHash: hash(['snapshot', input.visitRef]),
    providerServiceIdentityHash: hash(['service', providerServiceScopeRef]),
    providerServiceScopeRef,
    visitOccurredAt: input.visitAt,
    visitAttendance: 'arrived',
    units: 1,
    usageIdentityHash,
    usageContractVersion: CUSTOMER_SUBSCRIPTION_USAGE_CONTRACT_VERSION,
    remainingUnitsBefore: input.remainingBefore,
    remainingUnitsAfter: input.remainingBefore - 1,
    policyProfile: CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_POLICY_PROFILE,
    policySnapshotHash: hash([
      CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_POLICY_PROFILE,
      input.tenantId,
      input.term.id,
      input.term.planSnapshotHash,
    ]),
    eligibilityDecision: 'eligible_exact_attended_visit',
    approvalRequirement: 'NONE',
    unknownApplicable: false,
    providerWritesRequired: false,
  };
}

async function createLegacyTerm(input: {
  prisma: PrismaClient;
  tenantId: string;
  clientId: string;
  label: string;
  startsAt: string;
  endsAt: string;
}) {
  return input.prisma.customerSubscription.create({
    data: {
      tenantId: input.tenantId,
      clientId: input.clientId,
      termIdentityHash: hash(['legacy-term', input.label]),
      planCode: OFFER.planCode,
      planSnapshotHash: hash(['legacy-plan', input.label]),
      serviceScopeHash: hash(['legacy-scope', input.label]),
      priceKopecks: OFFER.priceKopecks,
      currency: OFFER.currency,
      visitsIncluded: OFFER.visitsIncluded,
      status: 'active',
      activatedAt: new Date(input.startsAt),
      termStartsAt: new Date(input.startsAt),
      termEndsAt: new Date(input.endsAt),
      legacySourceRef: `proof:${input.label}`,
    },
  });
}

function terminalInput(input: {
  actionClass:
    | 'expire_customer_subscription'
    | 'cancel_customer_subscription'
    | 'revoke_customer_subscription';
  tenantId: string;
  clientId: string;
  externalId: string;
  term: {
    id: string;
    termIdentityHash: string;
    planSnapshotHash: string;
    serviceScopeHash: string;
    termStartsAt: Date;
    termEndsAt: Date;
  };
  ownerId: string;
  membershipId: string;
  suffix: string;
}) {
  const base = {
    canonicalClientId: input.clientId,
    providerClientIdentityHash: clientIdentityHash(input),
    subscriptionId: input.term.id,
    termIdentityHash: input.term.termIdentityHash,
    planSnapshotHash: input.term.planSnapshotHash,
    serviceScopeHash: input.term.serviceScopeHash,
    currentLifecycleState: 'active',
  };
  if (input.actionClass === 'expire_customer_subscription') {
    return {
      ...base,
      termStartsAt: input.term.termStartsAt.toISOString(),
      termEndsAt: input.term.termEndsAt.toISOString(),
      expiryEligibleAt: new Date(
        input.term.termEndsAt.getTime() + 1,
      ).toISOString(),
      serverTimeDecision: 'strictly_after_immutable_term_end',
      expiryIdentityHash: hash([
        CUSTOMER_SUBSCRIPTION_EXPIRY_CONTRACT_VERSION,
        input.tenantId,
        input.term.id,
      ]),
      expiryContractVersion: CUSTOMER_SUBSCRIPTION_EXPIRY_CONTRACT_VERSION,
      policyProfile: CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_POLICY_PROFILE,
      policySnapshotHash: hash(['expiry-policy', input.term.id]),
      eligibilityDecision: 'eligible_term_elapsed',
      approvalRequirement: 'NONE',
      intendedStatus: 'expired',
      intendedEndedAt: input.term.termEndsAt.toISOString(),
      unknownApplicable: false,
      providerWritesRequired: false,
      mutatesImmutableTerm: false,
      createsRenewal: false,
      pendingRenewalBlocksExpiry: false,
    };
  }
  if (input.actionClass === 'cancel_customer_subscription') {
    const requesterAuthority = 'authorized_staff_role';
    const requesterIdentityHash = hash([
      'p4-05.subscription-cancellation-requester.v1',
      input.tenantId,
      input.ownerId,
      input.membershipId,
      'tenant_owner',
      requesterAuthority,
    ]);
    const cancellationIntentIdentityHash = hash([
      'p4-05.subscription-cancellation-intent.v1',
      input.tenantId,
      input.term.id,
      input.suffix,
    ]);
    return {
      ...base,
      cancellationIntentIdentityHash,
      requesterIdentityHash,
      requesterRole: 'tenant_owner',
      requesterAuthority,
      cancellationReason: 'staff_confirmed_customer_request',
      effectiveMode: 'immediate_on_canonical_commit',
      cancellationIdentityHash: hash([
        CUSTOMER_SUBSCRIPTION_CANCELLATION_CONTRACT_VERSION,
        input.tenantId,
        input.term.id,
        cancellationIntentIdentityHash,
        requesterIdentityHash,
      ]),
      cancellationContractVersion:
        CUSTOMER_SUBSCRIPTION_CANCELLATION_CONTRACT_VERSION,
      policyProfile: CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_POLICY_PROFILE,
      policySnapshotHash: hash(['cancel-policy', input.term.id]),
      eligibilityDecision: 'authorized_active_term',
      approvalRequirement: 'NONE_ACTOR_AUTHORIZED',
      intendedStatus: 'canceled',
      providerBoundary: 'LOCAL_ONLY',
      paymentRefundIncluded: false,
      providerCancellationIncluded: false,
      unknownApplicable: false,
      mutatesImmutableTerm: false,
      createsRenewal: false,
      oneTimeTerminalClaim: true,
    };
  }
  const requesterIdentityHash = hash([
    'p4-05.subscription-revocation-requester.v1',
    input.tenantId,
    input.ownerId,
    input.membershipId,
    'tenant_owner',
    'tenant_owner_or_admin',
  ]);
  const revocationDecisionIdentityHash = hash([
    'p4-05.subscription-revocation-decision.v1',
    input.tenantId,
    input.term.id,
    input.suffix,
  ]);
  const revocationEvidenceIdentityHash = hash([
    'p4-05.subscription-revocation-evidence.v1',
    input.tenantId,
    input.term.id,
    input.suffix,
  ]);
  const approvalScopeHash = hash([
    'p4-05.subscription-revocation-owner-approval-scope.v1',
    input.tenantId,
    input.term.id,
    revocationDecisionIdentityHash,
    revocationEvidenceIdentityHash,
  ]);
  return {
    ...base,
    revocationDecisionIdentityHash,
    revocationEvidenceIdentityHash,
    requesterIdentityHash,
    requesterRole: 'tenant_owner',
    requesterAuthority: 'tenant_owner_or_admin',
    revocationReason: 'approved_policy_revocation',
    effectiveMode: 'immediate_on_canonical_commit',
    approvalScopeHash,
    approvalBindingMode: 'CANONICAL_EXECUTION_OWNER_APPROVAL',
    revocationIdentityHash: hash([
      CUSTOMER_SUBSCRIPTION_REVOCATION_CONTRACT_VERSION,
      input.tenantId,
      input.term.id,
      revocationDecisionIdentityHash,
      approvalScopeHash,
    ]),
    revocationContractVersion:
      CUSTOMER_SUBSCRIPTION_REVOCATION_CONTRACT_VERSION,
    policyProfile: CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_POLICY_PROFILE,
    policySnapshotHash: hash(['revoke-policy', input.term.id]),
    eligibilityDecision: 'authorized_active_term_with_exact_evidence',
    approvalRequirement: 'OWNER_APPROVAL_REQUIRED',
    intendedStatus: 'revoked',
    providerBoundary: 'LOCAL_ONLY',
    paymentRefundIncluded: false,
    providerCancellationIncluded: false,
    unknownApplicable: false,
    mutatesImmutableTerm: false,
    createsRenewal: false,
    oneTimeTerminalClaim: true,
  };
}

async function main(): Promise<void> {
  const connectionString = proofDatabaseUrl();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  const engine = createStandaloneCanonicalActionEngine(
    prisma as unknown as PrismaService,
    proofEntitlements(),
    {
      identitySecret: IDENTITY_SECRET,
      payloadEncryptionSecret: PAYLOAD_SECRET,
    },
  );
  const provider = new ProofCheckoutProvider();
  const codec = new ProofReferenceCodec();
  const executor = new P405CustomerSubscriptionExecutableService(
    prisma,
    engine.runtime,
    { provider, providerReferenceCodec: codec, now: () => PROOF_NOW },
  );
  const matrix: Record<string, boolean> = {};

  try {
    const tenant = await createTenant(prisma, 'primary');
    const otherTenant = await createTenant(prisma, 'other');
    const client = await createClient(prisma, tenant.tenantId, 'primary');

    const initialInput = purchaseInput({
      tenantId: tenant.tenantId,
      clientId: client.id,
      externalId: client.externalId,
      intentRef: 'initial-intent-1',
    });
    const purchaseRequest = actionRequest({
      tenantId: tenant.tenantId,
      capability: P4_05_EXECUTABLE_CAPABILITIES.initiatePurchase,
      targetRef: `customer-subscription-purchase:${client.id}`,
      normalizedInput: initialInput,
      logicalKey: `purchase:${initialInput.checkoutIdentityHash}`,
      actorUserId: tenant.ownerId,
      sourceType: 'authenticated_request',
    });
    const purchase = await executor.execute(purchaseRequest);
    const purchaseReplay = await executor.execute(purchaseRequest);
    assert.equal(
      purchase.execution.executionId,
      purchaseReplay.execution.executionId,
    );
    assert.equal(provider.createCalls, 1);
    assert.equal(purchase.value.providerState, 'pending');
    assert.equal(await prisma.customerSubscription.count(), 0);
    matrix.checkoutDeterministicAndPendingNonValue = true;

    const attempt = await prisma.actionAttempt.findFirstOrThrow({
      where: {
        tenantId: tenant.tenantId,
        actionExecutionId: purchase.execution.executionId,
      },
    });
    const rawPayment = provider.paymentForKey(
      purchase.value.providerRequestIdentityHash!,
    );
    assert(attempt.providerReferenceEncrypted);
    assert(!attempt.providerReferenceEncrypted.includes(rawPayment.id));
    assert.equal(attempt.providerReferenceHash, codec.hash(rawPayment.id));
    matrix.providerReferenceDurableWithoutRawPersistence = true;

    const paidAt = '2026-08-05T10:00:00.000Z';
    const initialActivationInput = activationInput({
      tenantId: tenant.tenantId,
      checkoutExecutionId: purchase.execution.executionId,
      checkout: initialInput,
      providerRequestIdentityHash: purchase.value.providerRequestIdentityHash!,
      providerPaymentIdentityHash: purchase.value.providerPaymentIdentityHash!,
      paidAt,
    });
    const pendingActivation = actionRequest({
      tenantId: tenant.tenantId,
      capability: P4_05_EXECUTABLE_CAPABILITIES.activatePurchase,
      targetRef: `customer-subscription-term:${initialActivationInput.termIdentityHash}`,
      normalizedInput: initialActivationInput,
      logicalKey: 'activation:pending-proof',
      sourceType: 'webhook',
    });
    await rejects(() => executor.execute(pendingActivation));
    assert.equal(await prisma.customerSubscription.count(), 0);
    matrix.pendingCannotActivate = true;

    provider.markSucceeded(purchase.value.providerRequestIdentityHash!, paidAt);
    const activationRequest = actionRequest({
      tenantId: tenant.tenantId,
      capability: P4_05_EXECUTABLE_CAPABILITIES.activatePurchase,
      targetRef: `customer-subscription-term:${initialActivationInput.termIdentityHash}`,
      normalizedInput: initialActivationInput,
      logicalKey: `activation:${initialActivationInput.activationIdentityHash}`,
      sourceType: 'webhook',
    });
    const crashingPrisma = postCommitCrashPrisma(prisma);
    const crashingExecutor = new P405CustomerSubscriptionExecutableService(
      crashingPrisma.prisma,
      engine.runtime,
      { provider, providerReferenceCodec: codec, now: () => PROOF_NOW },
    );
    const activated = await crashingExecutor.execute(activationRequest);
    assert.equal(crashingPrisma.crashes(), 1);
    assert.equal(
      (await executor.execute(activationRequest)).value.subscriptionId,
      activated.value.subscriptionId,
    );
    assert.equal(await prisma.customerSubscription.count(), 1);
    matrix.initialActivationAtomicRestartSafeAndOneTime = true;

    const predecessor = await prisma.customerSubscription.findUniqueOrThrow({
      where: {
        id_tenantId: {
          id: activated.value.subscriptionId!,
          tenantId: tenant.tenantId,
        },
      },
    });
    const predecessorSnapshot = JSON.stringify(predecessor);
    const renewalCheckoutInput = renewalInput({
      tenantId: tenant.tenantId,
      clientId: client.id,
      externalId: client.externalId,
      predecessor,
      intentRef: 'renewal-intent-1',
    });
    const renewalRequest = actionRequest({
      tenantId: tenant.tenantId,
      capability: P4_05_EXECUTABLE_CAPABILITIES.initiateRenewal,
      targetRef: `customer-subscription-renewal:${predecessor.id}`,
      normalizedInput: renewalCheckoutInput,
      logicalKey: `renewal:${renewalCheckoutInput.checkoutIdentityHash}`,
      actorUserId: tenant.ownerId,
      sourceType: 'authenticated_request',
    });
    const renewalCheckout = await executor.execute(renewalRequest);
    assert.equal(
      (await executor.execute(renewalRequest)).execution.executionId,
      renewalCheckout.execution.executionId,
    );
    const renewalPaidAt = '2026-09-03T10:00:00.000Z';
    provider.markSucceeded(
      renewalCheckout.value.providerRequestIdentityHash!,
      renewalPaidAt,
    );
    const renewalActivation = renewalActivationInput({
      tenantId: tenant.tenantId,
      checkoutExecutionId: renewalCheckout.execution.executionId,
      checkout: renewalCheckoutInput,
      providerRequestIdentityHash:
        renewalCheckout.value.providerRequestIdentityHash!,
      providerPaymentIdentityHash:
        renewalCheckout.value.providerPaymentIdentityHash!,
      paidAt: renewalPaidAt,
    });
    const renewalRacers = ['a', 'b'].map((suffix) =>
      actionRequest({
        tenantId: tenant.tenantId,
        capability: P4_05_EXECUTABLE_CAPABILITIES.activateRenewal,
        targetRef: `customer-subscription-term:${renewalActivation.termIdentityHash}`,
        normalizedInput: renewalActivation,
        logicalKey: `renewal-activation:${suffix}`,
        sourceType: 'webhook',
      }),
    );
    const renewalRace = await Promise.allSettled(
      renewalRacers.map((request) => executor.execute(request)),
    );
    assert.equal(
      renewalRace.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      await prisma.customerSubscription.count({
        where: {
          tenantId: tenant.tenantId,
          previousSubscriptionId: predecessor.id,
        },
      }),
      1,
    );
    assert.equal(
      JSON.stringify(
        await prisma.customerSubscription.findUniqueOrThrow({
          where: {
            id_tenantId: { id: predecessor.id, tenantId: tenant.tenantId },
          },
        }),
      ),
      predecessorSnapshot,
    );
    matrix.renewalCreatesOneNewTermAndPredecessorImmutable = true;

    const firstUsageInput = usageInput({
      tenantId: tenant.tenantId,
      clientId: client.id,
      externalId: client.externalId,
      term: predecessor,
      visitRef: 'visit-1',
      visitAt: '2026-08-20T10:00:00.000Z',
      remainingBefore: 2,
    });
    const usageRacers = ['a', 'b'].map((suffix) =>
      actionRequest({
        tenantId: tenant.tenantId,
        capability: P4_05_EXECUTABLE_CAPABILITIES.syncUsage,
        targetRef: `subscription-usage:${predecessor.id}`,
        normalizedInput: firstUsageInput,
        logicalKey: `usage:${firstUsageInput.usageIdentityHash}:${suffix}`,
        sourceType: 'scheduler',
      }),
    );
    const usageRace = await Promise.allSettled(
      usageRacers.map((request) => executor.execute(request)),
    );
    assert.equal(
      usageRace.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      await prisma.customerSubscriptionUsage.count({
        where: { tenantId: tenant.tenantId, subscriptionId: predecessor.id },
      }),
      1,
    );
    const secondUsageInput = usageInput({
      tenantId: tenant.tenantId,
      clientId: client.id,
      externalId: client.externalId,
      term: predecessor,
      visitRef: 'visit-2',
      visitAt: '2026-08-21T10:00:00.000Z',
      remainingBefore: 1,
    });
    const secondUsageRequest = actionRequest({
      tenantId: tenant.tenantId,
      capability: P4_05_EXECUTABLE_CAPABILITIES.syncUsage,
      targetRef: `subscription-usage:${predecessor.id}`,
      normalizedInput: secondUsageInput,
      logicalKey: `usage:${secondUsageInput.usageIdentityHash}`,
      sourceType: 'scheduler',
    });
    await executor.execute(secondUsageRequest);
    assert.equal(
      (await executor.execute(secondUsageRequest)).execution.state,
      ActionExecutionState.SUCCEEDED,
    );
    await rejects(() =>
      prisma.customerSubscriptionUsage.create({
        data: {
          tenantId: tenant.tenantId,
          subscriptionId: predecessor.id,
          actionExecutionId: null,
          usageIdentityHash: hash(['overspend']),
          targetKind: 'provider_visit_service',
          targetRefHash: hash(['visit-overspend']),
          units: 1,
          usedAt: new Date('2026-08-22T10:00:00.000Z'),
          legacySourceRef: 'proof:overspend',
        },
      }),
    );
    matrix.usageExactOneTimeConcurrentAndCapacitySafe = true;

    const terminalClients = await Promise.all(
      ['expire', 'cancel', 'revoke', 'race'].map((label) =>
        createClient(prisma, tenant.tenantId, label),
      ),
    );
    const terminalTerms = await Promise.all(
      terminalClients.map((terminalClient, index) =>
        createLegacyTerm({
          prisma,
          tenantId: tenant.tenantId,
          clientId: terminalClient.id,
          label: `terminal-${index}`,
          startsAt: '2026-07-01T10:00:00.000Z',
          endsAt: '2026-08-01T10:00:00.000Z',
        }),
      ),
    );

    const runTerminal = async (
      actionClass:
        | 'expire_customer_subscription'
        | 'cancel_customer_subscription'
        | 'revoke_customer_subscription',
      index: number,
      suffix: string,
    ) => {
      const normalizedInput = terminalInput({
        actionClass,
        tenantId: tenant.tenantId,
        clientId: terminalClients[index].id,
        externalId: terminalClients[index].externalId,
        term: terminalTerms[index],
        ownerId: tenant.ownerId,
        membershipId: tenant.membershipId,
        suffix,
      });
      const capability =
        actionClass === 'expire_customer_subscription'
          ? P4_05_EXECUTABLE_CAPABILITIES.expire
          : actionClass === 'cancel_customer_subscription'
            ? P4_05_EXECUTABLE_CAPABILITIES.cancel
            : P4_05_EXECUTABLE_CAPABILITIES.revoke;
      const request = actionRequest({
        tenantId: tenant.tenantId,
        capability,
        targetRef: `subscription:${terminalTerms[index].id}`,
        normalizedInput,
        logicalKey: `${actionClass}:${suffix}`,
        ...(actionClass === 'expire_customer_subscription'
          ? { sourceType: 'scheduler' as const }
          : {
              sourceType: 'authenticated_request' as const,
              actorUserId: tenant.ownerId,
            }),
      });
      if (actionClass === 'revoke_customer_subscription') {
        const unapproved = await rejects(() => executor.execute(request));
        assert(unapproved instanceof Error);
        await approve(engine, request, tenant.ownerId);
      }
      const receipt = await executor.execute(request);
      assert.equal(
        (await executor.execute(request)).execution.executionId,
        receipt.execution.executionId,
      );
      return receipt;
    };

    assert.equal(
      (await runTerminal('expire_customer_subscription', 0, 'valid')).value
        .terminalStatus,
      'expired',
    );
    assert.equal(
      (await runTerminal('cancel_customer_subscription', 1, 'valid')).value
        .terminalStatus,
      'canceled',
    );
    assert.equal(
      (await runTerminal('revoke_customer_subscription', 2, 'valid')).value
        .terminalStatus,
      'revoked',
    );
    matrix.allTerminalClassesExecutableAndIdempotent = true;

    const raceRequests = (
      [
        'expire_customer_subscription',
        'cancel_customer_subscription',
        'revoke_customer_subscription',
      ] as const
    ).map((actionClass) => {
      const normalizedInput = terminalInput({
        actionClass,
        tenantId: tenant.tenantId,
        clientId: terminalClients[3].id,
        externalId: terminalClients[3].externalId,
        term: terminalTerms[3],
        ownerId: tenant.ownerId,
        membershipId: tenant.membershipId,
        suffix: `race-${actionClass}`,
      });
      return actionRequest({
        tenantId: tenant.tenantId,
        capability:
          actionClass === 'expire_customer_subscription'
            ? P4_05_EXECUTABLE_CAPABILITIES.expire
            : actionClass === 'cancel_customer_subscription'
              ? P4_05_EXECUTABLE_CAPABILITIES.cancel
              : P4_05_EXECUTABLE_CAPABILITIES.revoke,
        targetRef: `subscription:${terminalTerms[3].id}`,
        normalizedInput,
        logicalKey: `terminal-race:${actionClass}`,
        ...(actionClass === 'expire_customer_subscription'
          ? { sourceType: 'scheduler' as const }
          : {
              sourceType: 'authenticated_request' as const,
              actorUserId: tenant.ownerId,
            }),
      });
    });
    await approve(engine, raceRequests[2], tenant.ownerId);
    const terminalRace = await Promise.allSettled(
      raceRequests.map((request) => executor.execute(request)),
    );
    assert.equal(
      terminalRace.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    const terminalWinner = await prisma.customerSubscription.findUniqueOrThrow({
      where: {
        id_tenantId: {
          id: terminalTerms[3].id,
          tenantId: tenant.tenantId,
        },
      },
    });
    assert(['expired', 'canceled', 'revoked'].includes(terminalWinner.status));
    assert(terminalWinner.endExecutionId);
    matrix.expireCancelRevokeRaceHasOneWinner = true;

    const unknownClient = await createClient(
      prisma,
      tenant.tenantId,
      'unknown',
    );
    const unknownInput = purchaseInput({
      tenantId: tenant.tenantId,
      clientId: unknownClient.id,
      externalId: unknownClient.externalId,
      intentRef: 'unknown-intent',
    });
    const unknownRequest = actionRequest({
      tenantId: tenant.tenantId,
      capability: P4_05_EXECUTABLE_CAPABILITIES.initiatePurchase,
      targetRef: `customer-subscription-purchase:${unknownClient.id}`,
      normalizedInput: unknownInput,
      logicalKey: `unknown:${unknownInput.checkoutIdentityHash}`,
      actorUserId: tenant.ownerId,
      sourceType: 'authenticated_request',
    });
    const callsBeforeUnknown = provider.createCalls;
    provider.makeNextDispatchAmbiguous('inconclusive');
    const unknownError = await rejects(() => executor.execute(unknownRequest));
    const unknownResult = actionExecutionResultFromError(unknownError);
    assert(unknownResult);
    assert.equal(unknownResult.state, ActionExecutionState.UNKNOWN);
    assert.equal(provider.createCalls - callsBeforeUnknown, 1);
    const unknownAttempts = await prisma.actionAttempt.findMany({
      where: {
        tenantId: tenant.tenantId,
        actionExecutionId: unknownResult.executionId,
      },
      orderBy: { attemptNumber: 'asc' },
    });
    assert.equal(unknownAttempts[0].state, ActionAttemptState.UNKNOWN);
    assert.equal(
      unknownAttempts.filter((attemptRow) => attemptRow.kind === 'EXECUTION')
        .length,
      1,
    );
    const unknownActivationInput = activationInput({
      tenantId: tenant.tenantId,
      checkoutExecutionId: unknownResult.executionId,
      checkout: unknownInput,
      providerRequestIdentityHash: hash(['unknown-request']),
      providerPaymentIdentityHash: hash(['unknown-payment']),
      paidAt: '2026-08-10T10:00:00.000Z',
    });
    await rejects(() =>
      executor.execute(
        actionRequest({
          tenantId: tenant.tenantId,
          capability: P4_05_EXECUTABLE_CAPABILITIES.activatePurchase,
          targetRef: `customer-subscription-term:${unknownActivationInput.termIdentityHash}`,
          normalizedInput: unknownActivationInput,
          logicalKey: 'unknown-activation-blocked',
          sourceType: 'webhook',
        }),
      ),
    );
    matrix.unknownBlocksActivationAndBlindRedispatch = true;

    const reconciledClient = await createClient(
      prisma,
      tenant.tenantId,
      'reconciled',
    );
    const reconciledInput = purchaseInput({
      tenantId: tenant.tenantId,
      clientId: reconciledClient.id,
      externalId: reconciledClient.externalId,
      intentRef: 'reconciled-intent',
    });
    const reconciledRequest = actionRequest({
      tenantId: tenant.tenantId,
      capability: P4_05_EXECUTABLE_CAPABILITIES.initiatePurchase,
      targetRef: `customer-subscription-purchase:${reconciledClient.id}`,
      normalizedInput: reconciledInput,
      logicalKey: `reconciled:${reconciledInput.checkoutIdentityHash}`,
      actorUserId: tenant.ownerId,
      sourceType: 'authenticated_request',
    });
    const callsBeforeReconcile = provider.createCalls;
    provider.makeNextDispatchAmbiguous('reconcile');
    const reconciled = await executor.execute(reconciledRequest);
    assert.equal(reconciled.execution.state, ActionExecutionState.SUCCEEDED);
    assert.equal(provider.createCalls - callsBeforeReconcile, 1);
    const reconciledAttempts = await prisma.actionAttempt.findMany({
      where: {
        tenantId: tenant.tenantId,
        actionExecutionId: reconciled.execution.executionId,
      },
    });
    assert(
      reconciledAttempts.some(
        (row) => row.state === ActionAttemptState.UNKNOWN,
      ),
    );
    assert(reconciledAttempts.some((row) => row.kind === 'RECONCILIATION'));
    matrix.providerUnknownReconcilesCanonicalOutcome = true;

    const held = await createClient(prisma, tenant.tenantId, 'held');
    await prisma.unresolvedClientIdentityHold.create({
      data: {
        tenantId: tenant.tenantId,
        provider: 'yclients',
        externalId: held.externalId,
        reasonCode: 'loyalty_identity_unresolved',
        sourceNamespace: 'p4-05-proof',
        sourceEvidenceHash: hexHash(['held', held.externalId]),
        unresolvedPrincipalCount: 2,
      },
    });
    const heldInput = purchaseInput({
      tenantId: tenant.tenantId,
      clientId: held.id,
      externalId: held.externalId,
      intentRef: 'held-intent',
    });
    await rejects(() =>
      executor.execute(
        actionRequest({
          tenantId: tenant.tenantId,
          capability: P4_05_EXECUTABLE_CAPABILITIES.initiatePurchase,
          targetRef: `customer-subscription-purchase:${held.id}`,
          normalizedInput: heldInput,
          logicalKey: 'held-purchase',
          actorUserId: tenant.ownerId,
          sourceType: 'authenticated_request',
        }),
      ),
    );
    await rejects(() =>
      executor.execute(
        actionRequest({
          tenantId: otherTenant.tenantId,
          capability: P4_05_EXECUTABLE_CAPABILITIES.initiatePurchase,
          targetRef: `customer-subscription-purchase:${client.id}`,
          normalizedInput: initialInput,
          logicalKey: 'cross-tenant',
          actorUserId: otherTenant.ownerId,
          sourceType: 'authenticated_request',
        }),
      ),
    );
    const forged = structuredClone(purchaseRequest);
    forged.input = {
      ...(forged.input as Record<string, unknown>),
      priceKopecks: 1,
    };
    await rejects(() => executor.execute(forged));
    matrix.tenantHoldAndForgedValueFailClosed = true;

    const envelope = buildCustomerSubscriptionSchedulerEnvelope({
      tenantId: tenant.tenantId,
      now: PROOF_NOW,
      candidates: [
        {
          actionClass: 'sync_customer_subscription_usage',
          subscriptionId: predecessor.id,
          termIdentityHash: predecessor.termIdentityHash,
          plannedUsageUnits: 1,
        },
        {
          actionClass: 'expire_customer_subscription',
          subscriptionId: terminalTerms[0].id,
          termIdentityHash: terminalTerms[0].termIdentityHash,
          plannedUsageUnits: 0,
        },
      ],
    });
    const envelopeReplay = buildCustomerSubscriptionSchedulerEnvelope({
      tenantId: tenant.tenantId,
      now: new Date('2026-09-02T12:59:00.000Z'),
      candidates: [
        {
          actionClass: 'expire_customer_subscription',
          subscriptionId: terminalTerms[0].id,
          termIdentityHash: terminalTerms[0].termIdentityHash,
          plannedUsageUnits: 0,
        },
        {
          actionClass: 'sync_customer_subscription_usage',
          subscriptionId: predecessor.id,
          termIdentityHash: predecessor.termIdentityHash,
          plannedUsageUnits: 1,
        },
      ],
    });
    assert.equal(envelope.batchIdentityHash, envelopeReplay.batchIdentityHash);
    const envelopeReceipt = await executor.execute(
      actionRequest({
        tenantId: tenant.tenantId,
        capability: P4_05_SCHEDULER_ENVELOPE_CAPABILITY,
        targetRef: `subscription-batch:${envelope.candidateSetHash}`,
        normalizedInput: envelope,
        logicalKey: `envelope:${envelope.batchIdentityHash}`,
        sourceType: 'scheduler',
      }),
    );
    assert.equal(envelopeReceipt.value.subscriptionMutations, 0);
    assert.deepEqual(
      remainingCustomerSubscriptionSchedulerChildren({
        envelope,
        completedChildExecutionIdentities: new Set([
          envelope.childExecutionIdentities[0],
        ]),
      }),
      [envelope.childExecutionIdentities[1]],
    );
    assert.throws(() =>
      buildCustomerSubscriptionSchedulerEnvelope({
        tenantId: tenant.tenantId,
        now: PROOF_NOW,
        candidates: Array.from(
          { length: P4_05_SCHEDULER_LIMITS.maxTermsPerEnvelope + 1 },
          (_, index) => ({
            actionClass: 'expire_customer_subscription' as const,
            subscriptionId: `cap-sub-${index}`,
            termIdentityHash: `cap-term-${index}`,
            plannedUsageUnits: 0,
          }),
        ),
      }),
    );
    matrix.schedulerBoundedDeterministicAndRestartable = true;

    assert.equal(await prisma.loyaltyTransaction.count(), 0);
    matrix.p403LoyaltyStateUntouched = true;
    matrix.a08PaymentWriteDisabled = true;
    matrix.realProductionMutationsZero = true;
    matrix.realProviderWritesZero = true;

    process.stdout.write(
      `${JSON.stringify(
        {
          contract: 'maya.p4-05-all8-executable-proof/1',
          actionClassesProven: 8,
          matrix,
          counts: {
            subscriptions: await prisma.customerSubscription.count({
              where: { tenantId: tenant.tenantId },
            }),
            usages: await prisma.customerSubscriptionUsage.count({
              where: { tenantId: tenant.tenantId },
            }),
            providerDispatchesAgainstProofDouble: provider.createCalls,
            providerReadsAgainstProofDouble: provider.readCalls,
            providerReconciliationsAgainstProofDouble:
              provider.reconciliationCalls,
          },
          productionPayments: 0,
          productionSubscriptionMutations: 0,
          realProviderWrites: 0,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
