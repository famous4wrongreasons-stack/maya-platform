// GENERATED FROM THE CERTIFIED CONTRACT - do not hand-edit.
// Source:     docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md, section 0.8 F44 / section 0.7 F27 / section 0.7 F32
// Regenerate: node scripts/widget-contract/build-tables.mjs
// The contract states these as MARKDOWN tables rather than fenced TypeScript. They are as
// normative as anything in a code block, and a compiled contract without its floors would be
// a compiled contract that cannot derive one.
import type { VerificationLevel } from './envelope';
import type { WidgetKind } from './kinds';
import type { EffectClass } from './intent';
import type { CapabilityRef } from './capability-ref';
import type { RegisteredActionCapabilityV1 } from '../action-engine/action-engine.contract';

export type RiskTier =
  'read' | 'low_write' | 'medium_write' | 'high_write' | 'restricted';
export type ConsentClass =
  'none' | 'communication' | 'personal_data' | 'identity_binding' | 'finance';
export type TargetClass = 'w' | 'i' | 's' | 'c' | 'detail';

// F44 - total over the eight effect classes.
export const EFFECT_FLOOR: Readonly<Record<EffectClass, VerificationLevel>> =
  Object.freeze({
    NONE: 'ANONYMOUS',
    NAVIGATE: 'ANONYMOUS',
    REFINE: 'ANONYMOUS',
    HANDOFF: 'ANONYMOUS',
    CONTROL: 'ANONYMOUS',
    DRAFT: 'BOUND_CLIENT',
    REQUEST_APPROVAL: 'SESSION_VERIFIED',
    COMMIT: 'SESSION_VERIFIED',
  });

// F44 - total over the twenty-two kinds. Five are named; the rest take the table's default.
export const KIND_FLOOR: Readonly<Record<WidgetKind, VerificationLevel>> =
  Object.freeze({
    CHOICE: 'ANONYMOUS',
    SERVICE_SELECTOR: 'ANONYMOUS',
    STAFF_SELECTOR: 'ANONYMOUS',
    TIME_SLOT_SELECTOR: 'ANONYMOUS',
    BOOKING_CONFIRMATION: 'ANONYMOUS',
    SCHEDULE: 'ANONYMOUS',
    CLIENT_LIST: 'SESSION_VERIFIED',
    METRIC: 'ANONYMOUS',
    CHART: 'ANONYMOUS',
    REPORT: 'ANONYMOUS',
    STRATEGY_OPTIONS: 'ANONYMOUS',
    APPROVAL: 'SESSION_VERIFIED',
    PROGRESS: 'ANONYMOUS',
    LIMITATION: 'ANONYMOUS',
    SOURCE_STATUS: 'ANONYMOUS',
    SETTINGS_DRAFT: 'ANONYMOUS',
    FORM: 'ANONYMOUS',
    CONSENT_STATE: 'SESSION_VERIFIED',
    IDENTITY_BINDING: 'SESSION_VERIFIED',
    PAYMENT_HANDOFF: 'SESSION_VERIFIED',
    MEDIA_PREVIEW: 'ANONYMOUS',
    ARTIFACT: 'ANONYMOUS',
  });

// F44 - RISK_FLOOR['read'] is ANONYMOUS because a read capability's protection is its
// WIDGET_CAPABILITY_POLICY row plus Gate 6, not its risk tier.
export const RISK_FLOOR: Readonly<Record<RiskTier, VerificationLevel>> =
  Object.freeze({
    read: 'ANONYMOUS',
    low_write: 'BOUND_CLIENT',
    medium_write: 'SESSION_VERIFIED',
    high_write: 'SESSION_VERIFIED',
    restricted: 'STEP_UP_VERIFIED',
  });

// F44 - total over the five consent classes.
export const CONSENT_CLASS_FLOOR: Readonly<
  Record<ConsentClass, VerificationLevel>
> = Object.freeze({
  none: 'ANONYMOUS',
  communication: 'SESSION_VERIFIED',
  personal_data: 'SESSION_VERIFIED',
  identity_binding: 'SESSION_VERIFIED',
  finance: 'SESSION_VERIFIED',
});

// F44 - targetFloor's table. targetFloor(null) is ANONYMOUS, and so is class 'c', because
// subjectCapability already resolves a c-class target to its own ref and the term would
// otherwise double-count.
export const TARGET_FLOOR: Readonly<
  Record<TargetClass | 'null', VerificationLevel>
> = Object.freeze({
  null: 'ANONYMOUS',
  w: 'ANONYMOUS',
  i: 'ANONYMOUS',
  detail: 'ANONYMOUS',
  c: 'ANONYMOUS',
  s: 'SESSION_VERIFIED',
});

// F27 - CONTROL_REGISTRY, closed at three keys. A control registry that can grow a fourth key
// without review is not closed, so this is compiled in rather than stored.
export type ControlRegistryRow = {
  readonly ownerEndpoint: string;
  readonly controlFloor: VerificationLevel;
  readonly changes: string;
};
export const CONTROL_REGISTRY: Readonly<
  Record<
    | 'control.run.cancel'
    | 'control.widget.dismiss'
    | 'control.delivery.resolve',
    ControlRegistryRow
  >
> = Object.freeze({
  'control.run.cancel': Object.freeze({
    ownerEndpoint: 'POST /api/orchestration/runs/:id/cancel',
    controlFloor: 'BOUND_CLIENT',
    changes: 'terminates an unstarted coordination run',
  }),
  'control.widget.dismiss': Object.freeze({
    ownerEndpoint: 'widget layer',
    controlFloor: 'ANONYMOUS',
    changes: 'sets Lifecycle.delivery on one emission',
  }),
  'control.delivery.resolve': Object.freeze({
    ownerEndpoint: 'widget layer',
    controlFloor: 'BOUND_CLIENT',
    changes: 'resolves one dedupe_key across channels',
  }),
});
export const CONTROL_FLOOR: Readonly<
  Record<keyof typeof CONTROL_REGISTRY, VerificationLevel>
> = Object.freeze({
  'control.run.cancel': 'BOUND_CLIENT',
  'control.widget.dismiss': 'ANONYMOUS',
  'control.delivery.resolve': 'BOUND_CLIENT',
});

// F28 - WIDGET_CAPABILITY_POLICY, total over C9-CAP's 56 rows AND OVER THOSE ONLY. The three
// columns are C9/TOOL concepts and have no meaning over AE-CAP; AE totality is carried by
// AE_WIDGET_COMMIT_ALLOWLIST union AE_CAPABILITY_GAP_LEDGER under F31.
export interface WidgetCapabilityPolicyRow {
  readonly min_verification: VerificationLevel;
  readonly consent_class: ConsentClass;
  readonly dispatch_is_synchronous: boolean; // R3.11.5, read through the C9 PROPOSE key
}
export declare const WIDGET_CAPABILITY_POLICY: Readonly<
  Record<string, WidgetCapabilityPolicyRow>
>;

// F32 - the family predicates, each stated once, each verified exhaustively by enumeration.
// Extracted from contract §3.10. 16 facets, 27 target kinds.
export const MONEY_TARGET_KINDS = Object.freeze([
  'loyalty_account',
  'loyalty_client',
  'loyalty_redemption',
  'loyalty_redemption_grant',
  'loyalty_bulk_batch',
  'gift_certificate',
  'gift_certificate_checkout',
  'gift_certificate_redemption',
  'customer_subscription_term',
  'customer_subscription_checkout',
  'customer_subscription_renewal_checkout',
  'customer_subscription_usage',
  'customer_subscription_scheduler_batch',
  'expense',
  'expense_period',
  'cash_declaration',
  'tenant_billing_checkout',
  'tenant_billing_charge',
  'tenant_billing_access_window',
  'tenant_billing_scheduler_envelope',
  'billing_payment',
  'referral_reward',
  'referral_reward_issuance',
  'referral_reward_batch',
  'referral_program',
  'commerce_integration',
  'tenant_catalog_item',
] as const);
export const MONEY_FACETS = Object.freeze([
  'financial',
  'financial_equivalent',
  'payment_value',
  'provider_payment',
  'payment_evidence',
  'customer_value',
  'tenant_billing',
  'expense_ledger',
  'gift_certificate',
  'referral_reward',
  'value_configuration',
  'credential_authority',
  'bearer_secret',
  'bearer_claim',
  'bearer_presentation',
  'frozen_discount_entitlement',
] as const);
export declare function BOOKING(cap: RegisteredActionCapabilityV1): boolean;
export declare function CONSENT(cap: RegisteredActionCapabilityV1): boolean;
export declare function IDENTITY(cap: RegisteredActionCapabilityV1): boolean;
export declare function MARKETING_FANOUT(
  cap: RegisteredActionCapabilityV1,
): boolean;
export declare function TENANT_AUTHORITY(
  cap: RegisteredActionCapabilityV1,
): boolean;
export declare function MONEY(cap: RegisteredActionCapabilityV1): boolean;
export declare function SENSITIVE_DEST_REF(r: CapabilityRef | null): boolean;
