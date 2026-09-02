import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import {
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
  GIFT_CERTIFICATE_ACTIVATION_CONTRACT_VERSION,
  GIFT_CERTIFICATE_ACTIVATION_SHADOW_POLICY_PROFILE,
  GIFT_CERTIFICATE_CHECKOUT_CONTRACT_VERSION,
  GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION,
  GIFT_CERTIFICATE_EXPIRY_POLICY_VERSION,
  GIFT_CERTIFICATE_PRESENTATION_CONTRACT_VERSION,
  GIFT_CERTIFICATE_PRESENTATION_KEY_POLICY_VERSION,
  GIFT_CERTIFICATE_PURCHASE_CATALOG_VERSION,
  GIFT_CERTIFICATE_PURCHASE_OFFERS,
  GIFT_CERTIFICATE_PURCHASE_SHADOW_POLICY_PROFILE,
  GIFT_CERTIFICATE_REDEMPTION_CONTRACT_VERSION,
  GIFT_CERTIFICATE_REDEMPTION_RECONCILIATION_CONTRACT,
  GIFT_CERTIFICATE_REDEMPTION_SHADOW_POLICY_PROFILE,
  GIFT_CERTIFICATE_REDEMPTION_TARGET_CONTRACT,
  P4_06_EXECUTABLE_CAPABILITIES,
  actionExecutionResultFromError,
  createStandaloneCanonicalActionEngine,
  type TrustedActionExecutionRequestV1,
} from '../src/action-engine';
import {
  FEATURE_REQUIREMENT_DECISION_CONTRACT,
  type EntitlementsService,
  type FeatureRequirementDecision,
} from '../src/entitlements/entitlements.service';
import {
  giftCertificateClaimLookup,
  giftCertificatePresentation,
} from '../src/gift-certificates/gift-certificate-claim.contract';
import { GiftCertificatePresentationService } from '../src/gift-certificates/gift-certificate-presentation.service';
import {
  P406GiftCertificateExecutableService,
  P406ProviderDispatchAmbiguousError,
  type P406CheckoutProvider,
  type P406ProviderPayment,
  type P406ProviderReferenceCodec,
} from '../src/gift-certificates/p4-06-gift-certificate-executable.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const IDENTITY_SECRET =
  'cycle-06-p4-06-all3-proof-identity-secret-disposable-database-only';
const PAYLOAD_SECRET =
  'cycle-06-p4-06-all3-proof-payload-secret-disposable-database-only';
const PRESENTATION_KEY = 'presentation-key-v1-'.repeat(3);
const ROTATED_PRESENTATION_KEY = 'presentation-key-v2-'.repeat(3);
const LOOKUP_KEY = 'lookup-key-p4-06-'.repeat(3);
const PRESENTATION_KEY_VERSION = 'gift-cert-proof-v1';
const ROTATED_PRESENTATION_KEY_VERSION = 'gift-cert-proof-v2';
const PROOF_NOW = new Date('2026-09-02T12:00:00.000Z');
const OFFER = GIFT_CERTIFICATE_PURCHASE_OFFERS['gift-certificate.2000'];

function proofDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  const database = decodeURIComponent(new URL(value).pathname.slice(1));
  if (!database.startsWith('maya_c06_p406_all3_')) {
    throw new Error(
      'P4-06 proof refuses non-disposable databases; expected maya_c06_p406_all3_*',
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
  sourceType?: 'authenticated_request' | 'legacy_bridge' | 'webhook';
}): TrustedActionExecutionRequestV1 {
  return {
    contract: ACTION_EXECUTION_REQUEST_CONTRACT,
    tenantId: input.tenantId,
    capability: input.capability,
    source: {
      type: input.sourceType ?? 'legacy_bridge',
      occurrenceScope: `p4-06:${input.logicalKey}`,
      sourceRef: `p4-06-proof:${input.capability}`,
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    },
    targetRef: input.targetRef,
    input: input.normalizedInput,
    evidenceRefs: [`proof:${input.logicalKey}`],
    callerIdempotency: {
      scope: `p4-06.${input.capability}`,
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
      name: `P4-06 disposable proof ${label}`,
      slug: `p4-06-proof-${label}-${randomUUID()}`,
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

class ProofReferenceCodec implements P406ProviderReferenceCodec {
  encrypt(value: string): string {
    return `proof.enc.${Buffer.from(value, 'utf8').toString('base64url')}`;
  }

  decrypt(value: string): string {
    return Buffer.from(
      value.replace(/^proof\.enc\./, ''),
      'base64url',
    ).toString('utf8');
  }

  hash(value: string): string {
    return hash(['p4-06.provider-reference.v1', value]);
  }
}

class ProofCheckoutProvider implements P406CheckoutProvider {
  private readonly byKey = new Map<string, P406ProviderPayment>();
  private readonly byId = new Map<string, P406ProviderPayment>();
  private ambiguity: 'none' | 'reconcile' | 'inconclusive' = 'none';
  createCalls = 0;
  reconciliationCalls = 0;

  makeNextDispatchAmbiguous(mode: 'reconcile' | 'inconclusive'): void {
    this.ambiguity = mode;
  }

  createPayment(input: {
    idempotencyKey: string;
    amountKopecks: number;
    currency: string;
    metadata: Readonly<Record<string, string>>;
  }): Promise<P406ProviderPayment> {
    const existing = this.byKey.get(input.idempotencyKey);
    if (existing) return Promise.resolve(structuredClone(existing));
    this.createCalls += 1;
    const payment: P406ProviderPayment = {
      id: opaque('provider_payment'),
      status: 'pending',
      paid: false,
      amountKopecks: input.amountKopecks,
      currency: input.currency,
      capturedAt: null,
      confirmationUrl: 'https://proof.invalid/gift-certificate-checkout',
      metadata: { ...input.metadata },
    };
    this.byKey.set(input.idempotencyKey, payment);
    this.byId.set(payment.id, payment);
    if (this.ambiguity !== 'none') {
      throw new P406ProviderDispatchAmbiguousError(
        'synthetic response loss after provider apply',
      );
    }
    return Promise.resolve(structuredClone(payment));
  }

  getPayment(providerPaymentId: string): Promise<P406ProviderPayment | null> {
    const payment = this.byId.get(providerPaymentId);
    return Promise.resolve(payment ? structuredClone(payment) : null);
  }

  reconcileByIdempotencyKey(input: {
    idempotencyKey: string;
  }): Promise<
    | { outcome: 'FOUND'; payment: P406ProviderPayment }
    | { outcome: 'NOT_FOUND' }
    | { outcome: 'UNKNOWN' }
  > {
    this.reconciliationCalls += 1;
    if (this.ambiguity === 'inconclusive') {
      return Promise.resolve({ outcome: 'UNKNOWN' });
    }
    const payment = this.byKey.get(input.idempotencyKey);
    this.ambiguity = 'none';
    return Promise.resolve(
      payment
        ? { outcome: 'FOUND', payment: structuredClone(payment) }
        : { outcome: 'NOT_FOUND' },
    );
  }

  markSucceeded(idempotencyKey: string, capturedAt: string): void {
    const payment = this.byKey.get(idempotencyKey);
    if (!payment) throw new Error('proof provider payment is missing');
    payment.status = 'succeeded';
    payment.paid = true;
    payment.capturedAt = capturedAt;
  }
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

async function rejects(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to reject');
}

function purchaseInput(input: {
  tenantId: string;
  clientId: string;
  externalId: string;
  intentRef: string;
  recipientRef: string;
}) {
  const providerClientIdentityHash = hash([
    'p4-06.provider-client.v1',
    input.tenantId,
    'yclients',
    input.externalId,
    input.clientId,
  ]);
  const purchaseIntentIdentityHash = hash([
    'p4-06.purchase-intent.v1',
    input.tenantId,
    input.clientId,
    input.intentRef,
  ]);
  const recipientSubjectHash = hash([
    'p4-06.recipient-subject.v1',
    input.tenantId,
    input.recipientRef,
  ]);
  const offerSnapshotHash = hash([
    GIFT_CERTIFICATE_PURCHASE_CATALOG_VERSION,
    input.tenantId,
    OFFER.offerCode,
    OFFER.productCode,
    OFFER.denominationType,
    String(OFFER.nominalAmountKopecks),
    OFFER.currency,
    String(OFFER.expiryDays),
    GIFT_CERTIFICATE_EXPIRY_POLICY_VERSION,
  ]);
  const checkoutIdentityHash = hash([
    GIFT_CERTIFICATE_CHECKOUT_CONTRACT_VERSION,
    input.tenantId,
    input.clientId,
    purchaseIntentIdentityHash,
    offerSnapshotHash,
    String(OFFER.nominalAmountKopecks),
    OFFER.currency,
    recipientSubjectHash,
    GIFT_CERTIFICATE_EXPIRY_POLICY_VERSION,
  ]);
  return {
    providerClientSource: 'yclients',
    canonicalPurchaserClientId: input.clientId,
    providerClientIdentityHash,
    purchaseIntentIdentityHash,
    recipientSubjectHash,
    checkoutIdentityHash,
    offerCode: OFFER.offerCode,
    productCode: OFFER.productCode,
    catalogVersion: GIFT_CERTIFICATE_PURCHASE_CATALOG_VERSION,
    offerSnapshotHash,
    denominationType: OFFER.denominationType,
    nominalAmountKopecks: OFFER.nominalAmountKopecks,
    currency: OFFER.currency,
    expiryDays: OFFER.expiryDays,
    expiryPolicyVersion: GIFT_CERTIFICATE_EXPIRY_POLICY_VERSION,
    paymentProvider: 'yookassa',
    providerRequestIdentitySeedHash: hash([
      'p4-06.yookassa-request-seed.v1',
      input.tenantId,
      checkoutIdentityHash,
      'yookassa',
    ]),
    checkoutContractVersion: GIFT_CERTIFICATE_CHECKOUT_CONTRACT_VERSION,
    intendedCertificateSemantics: 'transferable_bearer_full_value',
    redemptionMode: 'full_only',
    presentationContractVersion: GIFT_CERTIFICATE_PRESENTATION_CONTRACT_VERSION,
    presentationKeyPolicyVersion:
      GIFT_CERTIFICATE_PRESENTATION_KEY_POLICY_VERSION,
    claimLookupContractVersion: GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION,
    policyProfile: GIFT_CERTIFICATE_PURCHASE_SHADOW_POLICY_PROFILE,
    policySnapshotHash: hash([
      GIFT_CERTIFICATE_PURCHASE_SHADOW_POLICY_PROFILE,
      input.tenantId,
      input.clientId,
      offerSnapshotHash,
      recipientSubjectHash,
      'eligible',
      'NONE',
    ]),
    eligibilityDecision: 'eligible',
    approvalRequirement: 'NONE',
    expectedProviderState: 'PENDING',
    unknownApplicable: false,
    intendedProviderOperation: 'provider_checkout_create',
    createsCertificate: false,
    issuesBearer: false,
  } as const;
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
    GIFT_CERTIFICATE_ACTIVATION_CONTRACT_VERSION,
    input.tenantId,
    input.checkoutExecutionId,
    'yookassa',
    input.providerPaymentIdentityHash,
    'succeeded',
    input.checkout.offerSnapshotHash,
    input.checkout.recipientSubjectHash,
    GIFT_CERTIFICATE_PRESENTATION_CONTRACT_VERSION,
  ]);
  const issuanceIdentityHash = hash([
    'p4-06.gift-certificate-issuance.v1',
    input.tenantId,
    activationIdentityHash,
    input.checkout.checkoutIdentityHash,
    input.checkout.offerSnapshotHash,
    input.checkout.recipientSubjectHash,
  ]);
  const certificateIdentityHash = hash([
    'p4-06.gift-certificate-identity.v1',
    input.tenantId,
    issuanceIdentityHash,
  ]);
  const expiresAt = new Date(
    new Date(input.paidAt).getTime() + OFFER.expiryDays * 86_400_000,
  ).toISOString();
  return {
    canonicalPurchaserClientId: input.checkout.canonicalPurchaserClientId,
    providerClientIdentityHash: input.checkout.providerClientIdentityHash,
    checkoutExecutionId: input.checkoutExecutionId,
    checkoutIdentityHash: input.checkout.checkoutIdentityHash,
    purchaseIntentIdentityHash: input.checkout.purchaseIntentIdentityHash,
    offerCode: input.checkout.offerCode,
    productCode: input.checkout.productCode,
    catalogVersion: input.checkout.catalogVersion,
    offerSnapshotHash: input.checkout.offerSnapshotHash,
    denominationType: input.checkout.denominationType,
    nominalAmountKopecks: input.checkout.nominalAmountKopecks,
    currency: input.checkout.currency,
    recipientSubjectHash: input.checkout.recipientSubjectHash,
    expiryDays: input.checkout.expiryDays,
    expiryPolicyVersion: input.checkout.expiryPolicyVersion,
    paymentProvider: 'yookassa',
    providerRequestIdentityHash: input.providerRequestIdentityHash,
    providerPaymentIdentityHash: input.providerPaymentIdentityHash,
    providerPaymentState: 'succeeded',
    providerPaidAt: input.paidAt,
    activationIdentityHash,
    issuanceIdentityHash,
    certificateIdentityHash,
    issuedAt: input.paidAt,
    expiresAt,
    presentationContractVersion: GIFT_CERTIFICATE_PRESENTATION_CONTRACT_VERSION,
    presentationKeyPolicyVersion:
      GIFT_CERTIFICATE_PRESENTATION_KEY_POLICY_VERSION,
    presentationKeyVersion: PRESENTATION_KEY_VERSION,
    claimLookupContractVersion: GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION,
    bearerDerivationIdentityHash: hash([
      GIFT_CERTIFICATE_PRESENTATION_CONTRACT_VERSION,
      input.tenantId,
      certificateIdentityHash,
      issuanceIdentityHash,
      activationIdentityHash,
      String(input.checkout.nominalAmountKopecks),
      input.checkout.currency,
      expiresAt,
      PRESENTATION_KEY_VERSION,
    ]),
    activationContractVersion: GIFT_CERTIFICATE_ACTIVATION_CONTRACT_VERSION,
    policyProfile: GIFT_CERTIFICATE_ACTIVATION_SHADOW_POLICY_PROFILE,
    policySnapshotHash: hash([
      GIFT_CERTIFICATE_ACTIVATION_SHADOW_POLICY_PROFILE,
      input.tenantId,
      activationIdentityHash,
      input.checkout.canonicalPurchaserClientId,
      input.checkout.offerSnapshotHash,
      input.checkout.recipientSubjectHash,
      input.providerPaymentIdentityHash,
      input.paidAt,
      PRESENTATION_KEY_VERSION,
      'eligible_for_one_time_activation',
      'NONE',
    ]),
    eligibilityDecision: 'eligible_for_one_time_activation',
    oneTimeActivationEligible: true,
    approvalRequirement: 'NONE',
    intendedPaymentStatus: 'paid',
    intendedCertificateMutation: 'create_paid_certificate',
    unknownApplicable: false,
    providerWritesRequired: false,
    certificateWritePerformed: false,
    rawBearerGenerated: false,
    rawCodePersisted: false,
    redemptionCreated: false,
  } as const;
}

function targetClientIdentityHash(input: {
  tenantId: string;
  clientId: string;
  externalId: string;
}) {
  return hash([
    'p4-06.gift-certificate-target-client.v1',
    input.tenantId,
    input.clientId,
    'yclients',
    input.externalId,
  ]);
}

function redemptionInput(input: {
  tenantId: string;
  certificate: Awaited<
    ReturnType<PrismaClient['giftCertificate']['findFirstOrThrow']>
  >;
  targetClientId: string;
  targetExternalId: string;
  appointmentId: string;
  recordId: string;
  visitId: string;
  serviceIds: string[];
  targetAmountKopecks: number;
  ownerId: string;
  membershipId: string;
}) {
  const targetClientHash = targetClientIdentityHash({
    tenantId: input.tenantId,
    clientId: input.targetClientId,
    externalId: input.targetExternalId,
  });
  const targetRefHash = hash([
    GIFT_CERTIFICATE_REDEMPTION_TARGET_CONTRACT,
    input.tenantId,
    input.targetClientId,
    input.appointmentId,
    'yclients',
    input.recordId,
    input.visitId,
    ...input.serviceIds,
    String(input.targetAmountKopecks),
    input.certificate.currency,
  ]);
  const certificateIdentityHash = hash([
    'p4-06.gift-certificate-identity.v1',
    input.tenantId,
    input.certificate.issuanceIdentityHash,
  ]);
  const claimBindingHash = hash([
    'p4-06.gift-certificate-claim-binding.v1',
    input.tenantId,
    input.certificate.id,
    input.certificate.codeHash,
    input.certificate.presentationKeyVersion ?? '',
    GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION,
  ]);
  const requesterIdentityHash = hash([
    input.tenantId,
    input.ownerId,
    input.membershipId,
    'tenant_owner',
    'administrative_role',
  ]);
  const redemptionIdentityHash = hash([
    GIFT_CERTIFICATE_REDEMPTION_CONTRACT_VERSION,
    input.tenantId,
    input.certificate.id,
    targetRefHash,
    input.targetClientId,
    requesterIdentityHash,
  ]);
  return {
    provider: 'yclients',
    canonicalCertificateId: input.certificate.id,
    issuanceIdentityHash: input.certificate.issuanceIdentityHash,
    issueExecutionId: input.certificate.issueExecutionId,
    recipientSubjectHash: input.certificate.recipientSubjectHash,
    offerSnapshotHash: input.certificate.offerSnapshotHash,
    certificateOwnershipSemantics: 'tenant_transferable_bearer_liability',
    purchaserIsRedemptionOwner: false,
    recipientSubjectIsClientIdentity: false,
    certificateIdentityHash,
    claimBindingHash,
    claimLookupContractVersion: GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION,
    presentationKeyVersion: input.certificate.presentationKeyVersion,
    nominalAmountKopecks: input.certificate.nominalAmountKopecks,
    currency: input.certificate.currency,
    issuedAt: input.certificate.issuedAt.toISOString(),
    paidAt: input.certificate.paidAt?.toISOString(),
    expiresAt: input.certificate.expiresAt.toISOString(),
    targetContractVersion: GIFT_CERTIFICATE_REDEMPTION_TARGET_CONTRACT,
    targetKind: 'appointment_service_bundle',
    targetAppointmentId: input.appointmentId,
    targetClientId: input.targetClientId,
    targetClientIdentityHash: targetClientHash,
    targetRefHash,
    providerRecordIdentity: input.recordId,
    providerVisitIdentity: input.visitId,
    serviceIds: input.serviceIds,
    targetAmountKopecks: input.targetAmountKopecks,
    targetCurrency: input.certificate.currency,
    requesterIdentityHash,
    requesterRole: 'tenant_owner',
    requesterAuthority: 'administrative_role',
    redemptionIdentityHash,
    redemptionContractVersion: GIFT_CERTIFICATE_REDEMPTION_CONTRACT_VERSION,
    policyProfile: GIFT_CERTIFICATE_REDEMPTION_SHADOW_POLICY_PROFILE,
    policySnapshotHash: hash([
      GIFT_CERTIFICATE_REDEMPTION_SHADOW_POLICY_PROFILE,
      input.tenantId,
      input.certificate.id,
      input.certificate.issuanceIdentityHash,
      input.certificate.offerSnapshotHash,
      targetRefHash,
      requesterIdentityHash,
      'eligible_for_full_redemption',
      'NONE_ACTOR_AUTHORIZED',
    ]),
    eligibilityDecision: 'eligible_for_full_redemption',
    redemptionMode: 'full_only',
    intendedValueApplication: 'consume_entire_certificate_nominal',
    approvalRequirement: 'NONE_ACTOR_AUTHORIZED',
    providerBoundary: 'LOCAL_ONLY',
    unknownApplicable: false,
    reconciliationContract: GIFT_CERTIFICATE_REDEMPTION_RECONCILIATION_CONTRACT,
    existingRedemptionDecision: 'none',
    intendedRedemptionMutation: 'insert_full_redemption_claim',
    redemptionWritePerformed: false,
    certificateValueMutationPerformed: false,
    loyaltyTransactionCreated: false,
    paymentMutationPerformed: false,
    providerWritesRequired: false,
    rawBearerPersisted: false,
  } as const;
}

async function main(): Promise<void> {
  const databaseUrl = proofDatabaseUrl();
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });
  const codec = new ProofReferenceCodec();
  const provider = new ProofCheckoutProvider();
  const engine = createStandaloneCanonicalActionEngine(
    prisma as unknown as PrismaService,
    proofEntitlements(),
    {
      identitySecret: IDENTITY_SECRET,
      payloadEncryptionSecret: PAYLOAD_SECRET,
    },
  );
  const executable = new P406GiftCertificateExecutableService(
    prisma,
    engine.runtime,
    {
      provider,
      providerReferenceCodec: codec,
      presentationKey: PRESENTATION_KEY,
      presentationKeyVersion: PRESENTATION_KEY_VERSION,
      claimLookupKey: LOOKUP_KEY,
      now: () => PROOF_NOW,
    },
  );

  try {
    const primary = await createTenant(prisma, 'primary');
    const other = await createTenant(prisma, 'other');
    const purchaser = await createClient(prisma, primary.tenantId, 'purchaser');
    const target = await createClient(prisma, primary.tenantId, 'target');
    const held = await createClient(prisma, primary.tenantId, 'held');
    await prisma.unresolvedClientIdentityHold.create({
      data: {
        tenantId: primary.tenantId,
        provider: 'yclients',
        externalId: held.externalId,
        reasonCode: 'loyalty_identity_unresolved',
        sourceNamespace: 'p4-06-proof',
        sourceEvidenceHash: hexHash(['held', held.id]),
        unresolvedPrincipalCount: 2,
      },
    });

    const checkoutInput = purchaseInput({
      tenantId: primary.tenantId,
      clientId: purchaser.id,
      externalId: purchaser.externalId,
      intentRef: 'intent-main',
      recipientRef: 'recipient-main',
    });
    const checkoutRequest = actionRequest({
      tenantId: primary.tenantId,
      capability: P4_06_EXECUTABLE_CAPABILITIES.initiatePurchase,
      targetRef: `gift-certificate-purchase:${checkoutInput.purchaseIntentIdentityHash}`,
      normalizedInput: checkoutInput,
      logicalKey: checkoutInput.checkoutIdentityHash,
      actorUserId: primary.ownerId,
      sourceType: 'authenticated_request',
    });
    const checkout = await executable.execute(checkoutRequest);
    assert.equal(checkout.execution.state, ActionExecutionState.SUCCEEDED);
    assert.equal(checkout.value.providerState, 'pending');
    assert.equal(await prisma.giftCertificate.count(), 0);
    const createCallsAfterCheckout = provider.createCalls;
    const checkoutRetry = await executable.execute(checkoutRequest);
    assert.equal(
      checkoutRetry.execution.executionId,
      checkout.execution.executionId,
    );
    assert.equal(provider.createCalls, createCallsAfterCheckout);

    const heldInput = purchaseInput({
      tenantId: primary.tenantId,
      clientId: held.id,
      externalId: held.externalId,
      intentRef: 'intent-held',
      recipientRef: 'recipient-held',
    });
    await rejects(() =>
      executable.execute(
        actionRequest({
          tenantId: primary.tenantId,
          capability: P4_06_EXECUTABLE_CAPABILITIES.initiatePurchase,
          targetRef: `gift-certificate-purchase:${heldInput.purchaseIntentIdentityHash}`,
          normalizedInput: heldInput,
          logicalKey: heldInput.checkoutIdentityHash,
        }),
      ),
    );
    assert.equal(provider.createCalls, createCallsAfterCheckout);

    const unknownInput = purchaseInput({
      tenantId: primary.tenantId,
      clientId: purchaser.id,
      externalId: purchaser.externalId,
      intentRef: 'intent-unknown',
      recipientRef: 'recipient-unknown',
    });
    const unknownRequest = actionRequest({
      tenantId: primary.tenantId,
      capability: P4_06_EXECUTABLE_CAPABILITIES.initiatePurchase,
      targetRef: `gift-certificate-purchase:${unknownInput.purchaseIntentIdentityHash}`,
      normalizedInput: unknownInput,
      logicalKey: unknownInput.checkoutIdentityHash,
    });
    provider.makeNextDispatchAmbiguous('reconcile');
    const reconciled = await executable.execute(unknownRequest);
    assert.equal(reconciled.execution.state, ActionExecutionState.SUCCEEDED);
    assert.ok(provider.reconciliationCalls > 0);
    const ambiguousAttempt = await prisma.actionAttempt.findFirstOrThrow({
      where: {
        tenantId: primary.tenantId,
        actionExecutionId: reconciled.execution.executionId,
        state: ActionAttemptState.UNKNOWN,
      },
    });
    assert.equal(ambiguousAttempt.reconciliationRequired, true);
    const callsAfterReconciliation = provider.createCalls;
    const inconclusiveInput = purchaseInput({
      tenantId: primary.tenantId,
      clientId: purchaser.id,
      externalId: purchaser.externalId,
      intentRef: 'intent-inconclusive',
      recipientRef: 'recipient-inconclusive',
    });
    const inconclusiveRequest = actionRequest({
      tenantId: primary.tenantId,
      capability: P4_06_EXECUTABLE_CAPABILITIES.initiatePurchase,
      targetRef: `gift-certificate-purchase:${inconclusiveInput.purchaseIntentIdentityHash}`,
      normalizedInput: inconclusiveInput,
      logicalKey: inconclusiveInput.checkoutIdentityHash,
    });
    provider.makeNextDispatchAmbiguous('inconclusive');
    const unknownError = await rejects(() =>
      executable.execute(inconclusiveRequest),
    );
    assert.equal(
      actionExecutionResultFromError(unknownError)?.state,
      ActionExecutionState.UNKNOWN,
    );
    assert.equal(provider.createCalls, callsAfterReconciliation + 1);
    await rejects(() => executable.execute(inconclusiveRequest));
    assert.equal(provider.createCalls, callsAfterReconciliation + 1);

    const checkoutAttempt = await prisma.actionAttempt.findFirstOrThrow({
      where: {
        tenantId: primary.tenantId,
        actionExecutionId: checkout.execution.executionId,
        providerReferenceHash: { not: null },
      },
      orderBy: { attemptNumber: 'desc' },
    });
    assert.equal(checkoutAttempt.state, ActionAttemptState.SUCCEEDED);
    provider.markSucceeded(
      checkoutAttempt.providerRequestIdentityHash as string,
      PROOF_NOW.toISOString(),
    );
    const activateInput = activationInput({
      tenantId: primary.tenantId,
      checkoutExecutionId: checkout.execution.executionId,
      checkout: checkoutInput,
      providerRequestIdentityHash:
        checkoutAttempt.providerRequestIdentityHash as string,
      providerPaymentIdentityHash: checkout.value
        .providerPaymentIdentityHash as string,
      paidAt: PROOF_NOW.toISOString(),
    });
    const activationRequest = actionRequest({
      tenantId: primary.tenantId,
      capability: P4_06_EXECUTABLE_CAPABILITIES.activate,
      targetRef: `gift-certificate:${activateInput.certificateIdentityHash}`,
      normalizedInput: activateInput,
      logicalKey: activateInput.activationIdentityHash,
      sourceType: 'webhook',
    });
    const crashingPrisma = postCommitCrashPrisma(prisma);
    const crashingExecutor = new P406GiftCertificateExecutableService(
      crashingPrisma.prisma,
      engine.runtime,
      {
        provider,
        providerReferenceCodec: codec,
        presentationKey: PRESENTATION_KEY,
        presentationKeyVersion: PRESENTATION_KEY_VERSION,
        claimLookupKey: LOOKUP_KEY,
        now: () => PROOF_NOW,
      },
    );
    const activated = await crashingExecutor.execute(activationRequest);
    assert.equal(crashingPrisma.crashes(), 1);
    assert.equal(activated.execution.state, ActionExecutionState.SUCCEEDED);
    assert.equal(await prisma.giftCertificate.count(), 1);
    const duplicateActivation = await executable.execute(activationRequest);
    assert.equal(
      duplicateActivation.execution.executionId,
      activated.execution.executionId,
    );
    assert.equal(await prisma.giftCertificate.count(), 1);

    const certificate = await prisma.giftCertificate.findFirstOrThrow({
      where: { tenantId: primary.tenantId },
    });
    const presentationFacts = {
      tenantId: certificate.tenantId,
      certificateId: certificate.id,
      issuanceIdentityHash: certificate.issuanceIdentityHash,
      activationExecutionId: certificate.issueExecutionId as string,
      nominalAmountKopecks: certificate.nominalAmountKopecks,
      currency: certificate.currency,
      expiresAt: certificate.expiresAt.toISOString(),
    };
    const initialPresentation = giftCertificatePresentation(presentationFacts, {
      presentationKey: PRESENTATION_KEY,
      presentationKeyVersion: PRESENTATION_KEY_VERSION,
      lookupKey: LOOKUP_KEY,
    });
    assert.equal(initialPresentation.codeHash, certificate.codeHash);
    assert.equal(
      giftCertificateClaimLookup(LOOKUP_KEY, initialPresentation.bearer),
      certificate.codeHash,
    );

    const originalEnvironment = {
      key: process.env.MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY,
      version: process.env.MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY_VERSION,
      keys: process.env.MAYA_GIFT_CERTIFICATE_PRESENTATION_KEYS,
      lookup: process.env.MAYA_GIFT_CERTIFICATE_CLAIM_SECRET,
    };
    process.env.MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY =
      ROTATED_PRESENTATION_KEY;
    process.env.MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY_VERSION =
      ROTATED_PRESENTATION_KEY_VERSION;
    process.env.MAYA_GIFT_CERTIFICATE_PRESENTATION_KEYS = JSON.stringify({
      [PRESENTATION_KEY_VERSION]: PRESENTATION_KEY,
    });
    process.env.MAYA_GIFT_CERTIFICATE_CLAIM_SECRET = LOOKUP_KEY;
    try {
      const presentationService = new GiftCertificatePresentationService(
        prisma as unknown as PrismaService,
      );
      const represented = await presentationService.present({
        tenantId: primary.tenantId,
        certificateId: certificate.id,
      });
      assert.equal(represented.outcome, 'presented');
      assert.equal(
        represented.outcome === 'presented' ? represented.bearer : null,
        initialPresentation.bearer,
      );
    } finally {
      const restore = (name: string, value: string | undefined) => {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      };
      restore(
        'MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY',
        originalEnvironment.key,
      );
      restore(
        'MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY_VERSION',
        originalEnvironment.version,
      );
      restore(
        'MAYA_GIFT_CERTIFICATE_PRESENTATION_KEYS',
        originalEnvironment.keys,
      );
      restore('MAYA_GIFT_CERTIFICATE_CLAIM_SECRET', originalEnvironment.lookup);
    }

    const appointmentId = opaque('appointment');
    const recordId = opaque('record');
    const visitId = opaque('visit');
    const serviceIds = ['service-proof'];
    await prisma.appointment.create({
      data: {
        id: appointmentId,
        tenantId: primary.tenantId,
        mayaClientId: target.id,
        crmProvider: 'yclients',
        crmExternalId: recordId,
        source: 'external',
        staffExternalId: 'staff-proof',
        serviceIds,
        startAt: new Date('2026-09-03T10:00:00.000Z'),
        endAt: new Date('2026-09-03T11:00:00.000Z'),
        blockedStartAt: new Date('2026-09-03T10:00:00.000Z'),
        blockedEndAt: new Date('2026-09-03T11:00:00.000Z'),
        status: 'confirmed',
        totalPriceKopecks: OFFER.nominalAmountKopecks,
        currency: OFFER.currency,
        providerPayload: { visit_id: visitId },
      },
    });
    const redeemInput = redemptionInput({
      tenantId: primary.tenantId,
      certificate,
      targetClientId: target.id,
      targetExternalId: target.externalId,
      appointmentId,
      recordId,
      visitId,
      serviceIds,
      targetAmountKopecks: OFFER.nominalAmountKopecks,
      ownerId: primary.ownerId,
      membershipId: primary.membershipId,
    });

    const heldTargetInput = {
      ...redeemInput,
      targetClientId: held.id,
      targetClientIdentityHash: targetClientIdentityHash({
        tenantId: primary.tenantId,
        clientId: held.id,
        externalId: held.externalId,
      }),
    };
    await rejects(() =>
      executable.execute(
        actionRequest({
          tenantId: primary.tenantId,
          capability: P4_06_EXECUTABLE_CAPABILITIES.redeem,
          targetRef: `gift-certificate:${certificate.id}:held`,
          normalizedInput: heldTargetInput,
          logicalKey: 'held-redemption',
          actorUserId: primary.ownerId,
          sourceType: 'authenticated_request',
        }),
      ),
    );

    await rejects(() =>
      executable.execute(
        actionRequest({
          tenantId: other.tenantId,
          capability: P4_06_EXECUTABLE_CAPABILITIES.redeem,
          targetRef: `gift-certificate:${certificate.id}:wrong-tenant`,
          normalizedInput: redeemInput,
          logicalKey: 'wrong-tenant-redemption',
          actorUserId: other.ownerId,
          sourceType: 'authenticated_request',
        }),
      ),
    );

    await rejects(() =>
      executable.execute(
        actionRequest({
          tenantId: primary.tenantId,
          capability: P4_06_EXECUTABLE_CAPABILITIES.redeem,
          targetRef: `gift-certificate:${certificate.id}:partial`,
          normalizedInput: { ...redeemInput, redemptionMode: 'partial' },
          logicalKey: 'partial-redemption',
          actorUserId: primary.ownerId,
          sourceType: 'authenticated_request',
        }),
      ),
    );

    const winnerRequest = actionRequest({
      tenantId: primary.tenantId,
      capability: P4_06_EXECUTABLE_CAPABILITIES.redeem,
      targetRef: `gift-certificate:${certificate.id}:${redeemInput.targetRefHash}`,
      normalizedInput: redeemInput,
      logicalKey: redeemInput.redemptionIdentityHash,
      actorUserId: primary.ownerId,
      sourceType: 'authenticated_request',
    });
    const competingAppointmentId = opaque('appointment_competing');
    const competingRecordId = opaque('record_competing');
    const competingVisitId = opaque('visit_competing');
    await prisma.appointment.create({
      data: {
        id: competingAppointmentId,
        tenantId: primary.tenantId,
        mayaClientId: target.id,
        crmProvider: 'yclients',
        crmExternalId: competingRecordId,
        source: 'external',
        staffExternalId: 'staff-proof',
        serviceIds,
        startAt: new Date('2026-09-03T12:00:00.000Z'),
        endAt: new Date('2026-09-03T13:00:00.000Z'),
        blockedStartAt: new Date('2026-09-03T12:00:00.000Z'),
        blockedEndAt: new Date('2026-09-03T13:00:00.000Z'),
        status: 'confirmed',
        totalPriceKopecks: OFFER.nominalAmountKopecks,
        currency: OFFER.currency,
        providerPayload: { visit_id: competingVisitId },
      },
    });
    const competingInput = redemptionInput({
      tenantId: primary.tenantId,
      certificate,
      targetClientId: target.id,
      targetExternalId: target.externalId,
      appointmentId: competingAppointmentId,
      recordId: competingRecordId,
      visitId: competingVisitId,
      serviceIds,
      targetAmountKopecks: OFFER.nominalAmountKopecks,
      ownerId: primary.ownerId,
      membershipId: primary.membershipId,
    });
    const competingRequest = actionRequest({
      tenantId: primary.tenantId,
      capability: P4_06_EXECUTABLE_CAPABILITIES.redeem,
      targetRef: `gift-certificate:${certificate.id}:competing`,
      normalizedInput: competingInput,
      logicalKey: competingInput.redemptionIdentityHash,
      actorUserId: primary.ownerId,
      sourceType: 'authenticated_request',
    });
    const race = await Promise.allSettled([
      executable.execute(winnerRequest),
      executable.execute(competingRequest),
    ]);
    assert.equal(race.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(race.filter((item) => item.status === 'rejected').length, 1);
    assert.equal(await prisma.giftCertificateRedemption.count(), 1);
    const redemptionRetry = await executable.execute(winnerRequest);
    assert.equal(redemptionRetry.value.redemptionClaims, 1);
    assert.equal(await prisma.giftCertificateRedemption.count(), 1);

    const serializedDurableState = JSON.stringify({
      certificate: await prisma.giftCertificate.findMany(),
      redemption: await prisma.giftCertificateRedemption.findMany(),
      executions: await prisma.actionExecution.findMany({
        select: { safeResultSummaryJson: true },
      }),
      attempts: await prisma.actionAttempt.findMany({
        select: { safeResultJson: true },
      }),
    });
    assert.equal(
      serializedDurableState.includes(initialPresentation.bearer),
      false,
    );
    assert.equal(serializedDurableState.includes(PRESENTATION_KEY), false);
    assert.equal(serializedDurableState.includes(LOOKUP_KEY), false);
    assert.equal(await prisma.loyaltyTransaction.count(), 0);

    console.log(
      JSON.stringify(
        {
          proof: 'P4-06 ALL-3 EXECUTABLE PROOF',
          result: 'PASS',
          actionClassesProven: 3,
          purchaseActivationChain: true,
          pendingIsNotUnknown: true,
          providerReconciliation: true,
          blindNewDispatchAfterUnknown: false,
          successfulPaymentCertificates: await prisma.giftCertificate.count(),
          crashSafeBearerPresentation: true,
          rawBearerCodeKeyPersisted: false,
          fullOneTimeRedemptions:
            await prisma.giftCertificateRedemption.count(),
          partialRedemptionPossible: false,
          duplicateCertificateOrValuePossible: false,
          unresolvedIdentityFailClosed: true,
          tenantIsolation: true,
          productionPaymentCertificateValueMutations: 0,
          productionProviderWrites: 0,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
