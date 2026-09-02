import type { ActionSourceType } from './action-engine.contract';
import { giftCertificateActivationShadowNormalizer } from './gift-certificate-activation-shadow.contract';
import { giftCertificatePurchaseShadowNormalizer } from './gift-certificate-purchase-shadow.contract';
import { giftCertificateRedemptionShadowNormalizer } from './gift-certificate-redemption-shadow.contract';

export const P4_06_EXECUTABLE_CAPABILITIES = {
  initiatePurchase: 'gift-certificates.purchase.execute.v1',
  activate: 'gift-certificates.activation.execute.v1',
  redeem: 'gift-certificates.redemption.execute.v1',
} as const;

export type P406ExecutableActionClass =
  | 'initiate_gift_certificate_purchase'
  | 'activate_gift_certificate'
  | 'redeem_gift_certificate';

export interface P406ExecutableRegistration {
  capability: string;
  actionClass: P406ExecutableActionClass;
  targetKind: string;
  executorKey: string;
  allowedSourceTypes: readonly ActionSourceType[];
  providerDispatch: boolean;
  riskFacets: readonly string[];
  normalizeInput: (value: unknown) => Record<string, unknown>;
}

/**
 * The executable family reuses the accepted strict Shadow normalizers. All
 * monetary, provider, certificate, target, actor, and policy facts are
 * derived before Action Ingress and are re-verified by the executor.
 */
export const P4_06_EXECUTABLE_REGISTRATIONS: readonly P406ExecutableRegistration[] =
  [
    {
      capability: P4_06_EXECUTABLE_CAPABILITIES.initiatePurchase,
      actionClass: 'initiate_gift_certificate_purchase',
      targetKind: 'gift_certificate_checkout',
      executorKey: 'gift-certificates.checkout',
      allowedSourceTypes: ['authenticated_request', 'legacy_bridge'],
      providerDispatch: true,
      riskFacets: ['provider_payment', 'customer_intent', 'no_value_grant'],
      normalizeInput: giftCertificatePurchaseShadowNormalizer,
    },
    {
      capability: P4_06_EXECUTABLE_CAPABILITIES.activate,
      actionClass: 'activate_gift_certificate',
      targetKind: 'gift_certificate',
      executorKey: 'gift-certificates.activation',
      allowedSourceTypes: ['webhook', 'scheduler', 'legacy_bridge'],
      providerDispatch: false,
      riskFacets: [
        'financial_equivalent',
        'one_time_activation',
        'bearer_presentation',
      ],
      normalizeInput: giftCertificateActivationShadowNormalizer,
    },
    {
      capability: P4_06_EXECUTABLE_CAPABILITIES.redeem,
      actionClass: 'redeem_gift_certificate',
      targetKind: 'gift_certificate_redemption',
      executorKey: 'gift-certificates.redemption',
      allowedSourceTypes: ['authenticated_request', 'legacy_bridge'],
      providerDispatch: false,
      riskFacets: [
        'financial_equivalent',
        'full_only',
        'one_time_claim',
        'exact_business_target',
        'actor_authorized',
      ],
      normalizeInput: giftCertificateRedemptionShadowNormalizer,
    },
  ];
