import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import {
  ActionAttemptState,
  ActionExecutionState,
  ActionPolicyDecision,
  ExternalDispatchState,
} from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
  CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_CAPABILITY,
  CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_POLICY_PROFILE,
  CUSTOMER_SUBSCRIPTION_RENEWAL_TERM_CONTRACT_VERSION,
  resolveCustomerSubscriptionPurchaseOffer,
} from '../action-engine';
import {
  YooKassaClientService,
  type YooKassaPayment,
} from '../billing/yookassa-client.service';
import {
  CLIENT_IDENTITY_GUARD_UNAVAILABLE,
  CLIENT_IDENTITY_UNRESOLVED,
  ClientIdentityService,
} from '../crm/client-identity.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { CustomerSubscriptionRenewalActivationShadowDto } from './dto/customer-subscription-renewal-activation-shadow.dto';

export type CustomerSubscriptionRenewalActivationShadowOutcome =
  | 'planned'
  | 'shadow_disabled'
  | 'identity_unresolved'
  | 'identity_guard_unavailable'
  | 'checkout_not_activatable'
  | 'predecessor_not_renewable'
  | 'payment_pending'
  | 'payment_unknown'
  | 'payment_not_succeeded'
  | 'payment_evidence_mismatch'
  | 'provider_evidence_unavailable'
  | 'activation_already_claimed';

export interface CustomerSubscriptionRenewalActivationShadowResult {
  outcome: CustomerSubscriptionRenewalActivationShadowOutcome;
  actionExecutionId: string | null;
  shadowDivergences: number;
  intendedActivation: {
    model: 'CustomerSubscription';
    status: 'active';
    canonicalClientId: string;
    previousSubscriptionId: string;
    predecessorTermIdentityHash: string;
    predecessorTermStartsAt: string;
    predecessorTermEndsAt: string;
    checkoutExecutionId: string;
    providerPaymentIdentityHash: string;
    activationIdentityHash: string;
    termIdentityHash: string;
    planCode: string;
    tier: string;
    priceKopecks: number;
    currency: 'RUB';
    visitsIncluded: number;
    termStartsAt: string;
    termEndsAt: string;
    policyProfile: typeof CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_POLICY_PROFILE;
    oneTimeActivationEligible: true;
    approvalRequirement: 'NONE';
    providerWritesRequired: false;
    unknownApplicable: false;
    mutatesPredecessor: false;
    writesPerformed: false;
  } | null;
  subscriptionsCreatedOrActivatedByNewPath: 0;
  predecessorTermMutationsByNewPath: 0;
  paymentMutationsByNewPath: 0;
  providerWritesByNewPath: 0;
  usageClaimsCreatedByNewPath: 0;
  messagesSentByNewPath: 0;
}

type RenewalCheckoutSafeResult = {
  checkoutMode: 'renewal';
  canonicalClientId: string;
  providerClientIdentityHash: string;
  predecessorSubscriptionId: string;
  predecessorTermIdentityHash: string;
  predecessorStatus: 'active';
  predecessorTermStartsAt: string;
  predecessorTermEndsAt: string;
  renewalIntentIdentityHash: string;
  checkoutIdentityHash: string;
  canonicalOfferId: string;
  offerValueVersionId: string;
  offerValueSnapshotHash: string;
  offerCode: string;
  planCode: string;
  tier: string;
  catalogVersion: string;
  planSnapshotHash: string;
  serviceScopeHash: string;
  priceKopecks: number;
  currency: string;
  visitsIncluded: number;
  termDays: number;
  nextTermStartRule: 'later_of_predecessor_end_or_payment_succeeded_at';
  paymentProvider: 'yookassa';
  providerRequestIdentityHash: string;
};

type RenewalPredecessor = {
  id: string;
  clientId: string;
  termIdentityHash: string;
  planCode: string;
  planSnapshotHash: string;
  serviceScopeHash: string;
  priceKopecks: number;
  currency: string;
  visitsIncluded: number;
  status: string;
  termStartsAt: Date;
  termEndsAt: Date;
};

@Injectable()
export class CustomerSubscriptionRenewalActivationShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly bridgeSource: BridgeSourceService,
    private readonly tenantContext: TenantContextService,
    private readonly clientIdentity: ClientIdentityService,
    private readonly encryption: EncryptionService,
    private readonly yooKassa: YooKassaClientService,
  ) {}

  assertSecret(header: string | undefined): void {
    this.bridgeSource.assertBridgeSecret(header, 'MAYA_INBOX_BRIDGE_TOKEN', {
      disabled:
        'customer_subscription_renewal_activation_shadow_bridge_disabled',
      unauthorized:
        'customer_subscription_renewal_activation_shadow_unauthorized',
    });
  }

  async planActivation(
    dto: CustomerSubscriptionRenewalActivationShadowDto,
  ): Promise<CustomerSubscriptionRenewalActivationShadowResult> {
    if (!this.enabled()) return this.noPlan('shadow_disabled', 0);

    const boundSource = this.bridgeSource.assertBridgeIntegrationBinding(
      {
        provider: dto.provider,
        externalCompanyId: dto.external_company_id,
      },
      {
        provider:
          'MAYA_CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_SOURCE_PROVIDER',
        externalCompanyId:
          'MAYA_CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_SOURCE_COMPANY_ID',
      },
      {
        disabled:
          'customer_subscription_renewal_activation_shadow_source_disabled',
        mismatch:
          'customer_subscription_renewal_activation_shadow_source_mismatch',
      },
    );
    const tenant = await this.bridgeSource.resolveTenantByIntegration(
      boundSource,
      'customer_subscription_renewal_activation_shadow_tenant_not_found',
    );
    const externalClientId = dto.external_client_id.trim();
    const checkoutExecutionId = dto.checkout_execution_id.trim();
    if (!externalClientId || !checkoutExecutionId) {
      return this.noPlan('identity_unresolved', 1);
    }

    return this.tenantContext.runAsSystemTenant(tenant.tenantId, () =>
      this.planInsideTenant({
        tenantId: tenant.tenantId,
        crmProvider: boundSource.provider,
        externalClientId,
        checkoutExecutionId,
      }),
    );
  }

  private async planInsideTenant(input: {
    tenantId: string;
    crmProvider: string;
    externalClientId: string;
    checkoutExecutionId: string;
  }): Promise<CustomerSubscriptionRenewalActivationShadowResult> {
    const guard = await this.clientIdentity.checkCrmClientRegistrationGuard({
      tenantId: input.tenantId,
      provider: input.crmProvider,
      externalId: input.externalClientId,
    });
    if (!guard.allowed) {
      return this.noPlan(
        guard.reasonCode === CLIENT_IDENTITY_UNRESOLVED
          ? 'identity_unresolved'
          : guard.reasonCode === CLIENT_IDENTITY_GUARD_UNAVAILABLE
            ? 'identity_guard_unavailable'
            : 'identity_unresolved',
        1,
      );
    }

    const link = await this.prisma.crmClientLink.findUnique({
      where: {
        tenantId_provider_externalId: {
          tenantId: input.tenantId,
          provider: input.crmProvider,
          externalId: input.externalClientId,
        },
      },
      select: { client: { select: { id: true, mergedIntoClientId: true } } },
    });
    if (!link || link.client.mergedIntoClientId !== null) {
      return this.noPlan('identity_unresolved', 1);
    }

    const checkout = await this.prisma.actionExecution.findUnique({
      where: {
        id_tenantId: {
          id: input.checkoutExecutionId,
          tenantId: input.tenantId,
        },
      },
      select: {
        id: true,
        tenantId: true,
        actionClass: true,
        state: true,
        dryRun: true,
        policyDecision: true,
        finalOutcomeCode: true,
        safeResultSummaryJson: true,
      },
    });
    if (!checkout) return this.noPlan('checkout_not_activatable', 1);
    if (checkout.state === ActionExecutionState.UNKNOWN) {
      return this.noPlan('payment_unknown', 0);
    }
    if (
      checkout.actionClass !== 'initiate_customer_subscription_renewal' ||
      checkout.state !== ActionExecutionState.SUCCEEDED ||
      checkout.dryRun ||
      checkout.policyDecision !== ActionPolicyDecision.ALLOW ||
      checkout.finalOutcomeCode !== 'provider_checkout_created'
    ) {
      return this.noPlan('checkout_not_activatable', 1);
    }

    const checkoutFacts = this.checkoutFacts(checkout.safeResultSummaryJson);
    if (
      !checkoutFacts ||
      checkoutFacts.checkoutMode !== 'renewal' ||
      checkoutFacts.canonicalClientId !== link.client.id ||
      checkoutFacts.paymentProvider !== 'yookassa'
    ) {
      return this.noPlan('payment_evidence_mismatch', 1);
    }
    const offer = resolveCustomerSubscriptionPurchaseOffer(
      checkoutFacts.offerCode,
    );
    if (!offer || !this.checkoutFactsMatchOffer(checkoutFacts, offer)) {
      return this.noPlan('payment_evidence_mismatch', 1);
    }

    const predecessor = await this.prisma.customerSubscription.findUnique({
      where: {
        id_tenantId: {
          id: checkoutFacts.predecessorSubscriptionId,
          tenantId: input.tenantId,
        },
      },
      select: {
        id: true,
        clientId: true,
        termIdentityHash: true,
        planCode: true,
        planSnapshotHash: true,
        serviceScopeHash: true,
        priceKopecks: true,
        currency: true,
        visitsIncluded: true,
        status: true,
        termStartsAt: true,
        termEndsAt: true,
      },
    });
    if (
      !predecessor ||
      !this.predecessorMatchesCheckout(
        predecessor,
        checkoutFacts,
        link.client.id,
      )
    ) {
      return this.noPlan('predecessor_not_renewable', 1);
    }
    if (!['active', 'expired'].includes(predecessor.status)) {
      return this.noPlan('predecessor_not_renewable', 1);
    }

    const attempt = await this.prisma.actionAttempt.findFirst({
      where: {
        tenantId: input.tenantId,
        actionExecutionId: checkout.id,
        state: ActionAttemptState.SUCCEEDED,
        externalDispatchState: ExternalDispatchState.ACKNOWLEDGED,
      },
      orderBy: { attemptNumber: 'desc' },
      select: {
        providerRequestIdentityHash: true,
        providerReferenceEncrypted: true,
        providerReferenceHash: true,
      },
    });
    if (
      !attempt?.providerReferenceEncrypted ||
      !attempt.providerReferenceHash ||
      !attempt.providerRequestIdentityHash ||
      attempt.providerRequestIdentityHash !==
        checkoutFacts.providerRequestIdentityHash
    ) {
      return this.noPlan('payment_evidence_mismatch', 1);
    }

    let providerPaymentId: string;
    let providerPayment: YooKassaPayment;
    try {
      providerPaymentId = this.encryption.decrypt(
        attempt.providerReferenceEncrypted,
      );
      providerPayment = await this.yooKassa.getPayment(providerPaymentId);
    } catch {
      return this.noPlan('provider_evidence_unavailable', 0);
    }
    if (providerPayment.id !== providerPaymentId) {
      return this.noPlan('payment_evidence_mismatch', 1);
    }
    if (providerPayment.status === 'pending') {
      return this.noPlan('payment_pending', 0);
    }
    if (providerPayment.status === 'unknown') {
      return this.noPlan('payment_unknown', 0);
    }
    if (
      providerPayment.status !== 'succeeded' ||
      providerPayment.paid !== true
    ) {
      return this.noPlan('payment_not_succeeded', 0);
    }
    if (
      this.paymentAmountKopecks(providerPayment) !==
        checkoutFacts.priceKopecks ||
      providerPayment.amount?.currency !== checkoutFacts.currency ||
      !this.providerMetadataMatches(
        providerPayment,
        input.tenantId,
        checkout.id,
        checkoutFacts,
      )
    ) {
      return this.noPlan('payment_evidence_mismatch', 1);
    }

    const paidAt = this.providerPaidAt(providerPayment);
    if (!paidAt) return this.noPlan('payment_evidence_mismatch', 1);
    const providerPaymentIdentityHash = this.hash([
      'p4-05.yookassa-payment.v1',
      input.tenantId,
      attempt.providerReferenceHash,
    ]);
    const activationIdentityHash = this.hash([
      CUSTOMER_SUBSCRIPTION_RENEWAL_TERM_CONTRACT_VERSION,
      input.tenantId,
      predecessor.id,
      predecessor.termIdentityHash,
      checkout.id,
      'yookassa',
      providerPaymentIdentityHash,
      'succeeded',
    ]);
    const termStartsAt = new Date(
      Math.max(predecessor.termEndsAt.getTime(), paidAt.getTime()),
    ).toISOString();
    const termEndsAt = new Date(
      new Date(termStartsAt).getTime() + checkoutFacts.termDays * 86_400_000,
    ).toISOString();
    const termIdentityHash = this.hash([
      'p4-05.customer-subscription-term.v1',
      input.tenantId,
      link.client.id,
      predecessor.id,
      activationIdentityHash,
      checkoutFacts.planSnapshotHash,
      termStartsAt,
      termEndsAt,
    ]);

    const claimed = await this.prisma.customerSubscription.findFirst({
      where: {
        tenantId: input.tenantId,
        OR: [
          {
            provider: 'yookassa',
            providerPaymentRefHash: providerPaymentIdentityHash,
          },
          { termIdentityHash },
          { previousSubscriptionId: predecessor.id },
        ],
      },
      select: { id: true },
    });
    if (claimed) return this.noPlan('activation_already_claimed', 0);

    const policySnapshotHash = this.hash([
      CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_POLICY_PROFILE,
      input.tenantId,
      link.client.id,
      predecessor.id,
      predecessor.termIdentityHash,
      checkoutFacts.planSnapshotHash,
      providerPaymentIdentityHash,
      'eligible_for_one_time_renewal_activation',
    ]);
    const predecessorTermStartsAt = predecessor.termStartsAt.toISOString();
    const predecessorTermEndsAt = predecessor.termEndsAt.toISOString();
    const providerPaidAt = paidAt.toISOString();
    const canonicalInput = {
      canonicalClientId: link.client.id,
      providerClientIdentityHash: checkoutFacts.providerClientIdentityHash,
      predecessorSubscriptionId: predecessor.id,
      predecessorTermIdentityHash: predecessor.termIdentityHash,
      predecessorStatusAtCheckout: 'active',
      predecessorTermStartsAt,
      predecessorTermEndsAt,
      checkoutExecutionId: checkout.id,
      checkoutIdentityHash: checkoutFacts.checkoutIdentityHash,
      renewalIntentIdentityHash: checkoutFacts.renewalIntentIdentityHash,
      canonicalOfferId: checkoutFacts.canonicalOfferId,
      offerValueVersionId: checkoutFacts.offerValueVersionId,
      offerValueSnapshotHash: checkoutFacts.offerValueSnapshotHash,
      offerCode: offer.offerCode,
      planCode: offer.planCode,
      tier: offer.tier,
      catalogVersion: CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
      planSnapshotHash: checkoutFacts.planSnapshotHash,
      serviceScopeHash: checkoutFacts.serviceScopeHash,
      priceKopecks: checkoutFacts.priceKopecks,
      currency: offer.currency,
      visitsIncluded: offer.visitsIncluded,
      termDays: offer.termDays,
      paymentProvider: 'yookassa',
      providerRequestIdentityHash: checkoutFacts.providerRequestIdentityHash,
      providerPaymentIdentityHash,
      providerPaymentState: 'succeeded',
      providerPaidAt,
      activationIdentityHash,
      termIdentityHash,
      termStartsAt,
      termEndsAt,
      activationContractVersion:
        CUSTOMER_SUBSCRIPTION_RENEWAL_TERM_CONTRACT_VERSION,
      policyProfile:
        CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_POLICY_PROFILE,
      policySnapshotHash,
      eligibilityDecision: 'eligible_for_one_time_renewal_activation',
      oneTimeActivationEligible: true,
      approvalRequirement: 'NONE',
      intendedStatus: 'active',
      unknownApplicable: false,
      providerWritesRequired: false,
      mutatesPredecessor: false,
    };
    const execution = await this.actionEngine.planShadow({
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: input.tenantId,
      capability: CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_CAPABILITY,
      source: {
        type: 'legacy_bridge',
        occurrenceScope: `p4-05:activate-renewal:${activationIdentityHash}`,
        sourceRef: 'legacy-subscription:renewal-payment-evidence',
      },
      targetRef: `customer-subscription-term:${termIdentityHash}`,
      input: canonicalInput,
      evidenceRefs: [
        `predecessor-subscription:${predecessor.id}`,
        `predecessor-term:${predecessor.termIdentityHash}`,
        `checkout-execution:${checkout.id}`,
        `provider-payment:${providerPaymentIdentityHash}`,
        `provider-client:${checkoutFacts.providerClientIdentityHash}`,
        `subscription-plan:${checkoutFacts.planSnapshotHash}`,
      ],
      callerIdempotency: {
        scope: 'p4-05.activate-customer-subscription-renewal.shadow',
        key: activationIdentityHash,
      },
    });

    return {
      outcome: 'planned',
      actionExecutionId: execution.id,
      shadowDivergences: 0,
      intendedActivation: {
        model: 'CustomerSubscription',
        status: 'active',
        canonicalClientId: link.client.id,
        previousSubscriptionId: predecessor.id,
        predecessorTermIdentityHash: predecessor.termIdentityHash,
        predecessorTermStartsAt,
        predecessorTermEndsAt,
        checkoutExecutionId: checkout.id,
        providerPaymentIdentityHash,
        activationIdentityHash,
        termIdentityHash,
        planCode: offer.planCode,
        tier: offer.tier,
        priceKopecks: checkoutFacts.priceKopecks,
        currency: offer.currency,
        visitsIncluded: offer.visitsIncluded,
        termStartsAt,
        termEndsAt,
        policyProfile:
          CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_POLICY_PROFILE,
        oneTimeActivationEligible: true,
        approvalRequirement: 'NONE',
        providerWritesRequired: false,
        unknownApplicable: false,
        mutatesPredecessor: false,
        writesPerformed: false,
      },
      subscriptionsCreatedOrActivatedByNewPath: 0,
      predecessorTermMutationsByNewPath: 0,
      paymentMutationsByNewPath: 0,
      providerWritesByNewPath: 0,
      usageClaimsCreatedByNewPath: 0,
      messagesSentByNewPath: 0,
    };
  }

  private checkoutFacts(value: unknown): RenewalCheckoutSafeResult | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const source = value as Record<string, unknown>;
    const stringFields = [
      'canonicalClientId',
      'providerClientIdentityHash',
      'predecessorSubscriptionId',
      'predecessorTermIdentityHash',
      'predecessorStatus',
      'predecessorTermStartsAt',
      'predecessorTermEndsAt',
      'renewalIntentIdentityHash',
      'checkoutIdentityHash',
      'canonicalOfferId',
      'offerValueVersionId',
      'offerValueSnapshotHash',
      'offerCode',
      'planCode',
      'tier',
      'catalogVersion',
      'planSnapshotHash',
      'serviceScopeHash',
      'currency',
      'nextTermStartRule',
      'paymentProvider',
      'providerRequestIdentityHash',
    ] as const;
    if (stringFields.some((key) => typeof source[key] !== 'string')) {
      return null;
    }
    if (
      source.checkoutMode !== 'renewal' ||
      source.predecessorStatus !== 'active' ||
      source.nextTermStartRule !==
        'later_of_predecessor_end_or_payment_succeeded_at' ||
      !Number.isSafeInteger(source.priceKopecks) ||
      !Number.isSafeInteger(source.visitsIncluded) ||
      !Number.isSafeInteger(source.termDays)
    ) {
      return null;
    }
    for (const key of [
      'predecessorTermStartsAt',
      'predecessorTermEndsAt',
    ] as const) {
      if (Number.isNaN(Date.parse(String(source[key])))) return null;
    }
    return source as unknown as RenewalCheckoutSafeResult;
  }

  private checkoutFactsMatchOffer(
    facts: RenewalCheckoutSafeResult,
    offer: NonNullable<
      ReturnType<typeof resolveCustomerSubscriptionPurchaseOffer>
    >,
  ): boolean {
    return (
      facts.planCode === offer.planCode &&
      facts.tier === offer.tier &&
      facts.catalogVersion === CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION &&
      facts.priceKopecks > 0 &&
      facts.priceKopecks <= 600_000 &&
      facts.currency === offer.currency &&
      facts.visitsIncluded === offer.visitsIncluded &&
      facts.termDays === offer.termDays
    );
  }

  private predecessorMatchesCheckout(
    predecessor: RenewalPredecessor,
    facts: RenewalCheckoutSafeResult,
    canonicalClientId: string,
  ): boolean {
    return (
      predecessor.clientId === canonicalClientId &&
      predecessor.termIdentityHash === facts.predecessorTermIdentityHash &&
      predecessor.planCode === facts.planCode &&
      predecessor.currency === facts.currency &&
      predecessor.termStartsAt.toISOString() ===
        new Date(facts.predecessorTermStartsAt).toISOString() &&
      predecessor.termEndsAt.toISOString() ===
        new Date(facts.predecessorTermEndsAt).toISOString()
    );
  }

  private providerMetadataMatches(
    payment: YooKassaPayment,
    tenantId: string,
    checkoutExecutionId: string,
    facts: RenewalCheckoutSafeResult,
  ): boolean {
    return (
      payment.metadata?.tenant_id === tenantId &&
      payment.metadata?.checkout_execution_id === checkoutExecutionId &&
      payment.metadata?.checkout_identity_hash === facts.checkoutIdentityHash &&
      payment.metadata?.canonical_client_id === facts.canonicalClientId &&
      payment.metadata?.predecessor_subscription_id ===
        facts.predecessorSubscriptionId
    );
  }

  private paymentAmountKopecks(payment: YooKassaPayment): number | null {
    const value = payment.amount?.value;
    if (!value || !/^\d+\.\d{2}$/.test(value)) return null;
    const [rubles, kopecks] = value.split('.');
    const amount = Number(rubles) * 100 + Number(kopecks);
    return Number.isSafeInteger(amount) ? amount : null;
  }

  private providerPaidAt(payment: YooKassaPayment): Date | null {
    if (!payment.captured_at) return null;
    const paidAt = new Date(payment.captured_at);
    return Number.isNaN(paidAt.getTime()) ? null : paidAt;
  }

  private enabled(): boolean {
    return ['1', 'true', 'on', 'yes'].includes(
      String(
        process.env
          .MAYA_CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_ENABLED || '',
      )
        .trim()
        .toLowerCase(),
    );
  }

  private hash(parts: readonly string[]): string {
    return createHash('sha256')
      .update(JSON.stringify(parts))
      .digest('base64url');
  }

  private noPlan(
    outcome: Exclude<
      CustomerSubscriptionRenewalActivationShadowOutcome,
      'planned'
    >,
    shadowDivergences: number,
  ): CustomerSubscriptionRenewalActivationShadowResult {
    return {
      outcome,
      actionExecutionId: null,
      shadowDivergences,
      intendedActivation: null,
      subscriptionsCreatedOrActivatedByNewPath: 0,
      predecessorTermMutationsByNewPath: 0,
      paymentMutationsByNewPath: 0,
      providerWritesByNewPath: 0,
      usageClaimsCreatedByNewPath: 0,
      messagesSentByNewPath: 0,
    };
  }
}
