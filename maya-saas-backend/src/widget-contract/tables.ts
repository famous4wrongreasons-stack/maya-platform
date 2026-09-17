// GENERATED FROM THE CERTIFIED CONTRACT - do not hand-edit.
// Source:     docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md, section 0.8 F44 / section 0.7 F27 / section 0.7 F32
//             and section 2.3.4 / 2.4 / 3.2 R3.2.2, R3.2.3 / 4.5.3 CH1 / 0.9 F60 (the effect tables)
// Regenerate: node scripts/widget-contract/build-tables.mjs
// The contract states these as MARKDOWN tables rather than fenced TypeScript. They are as
// normative as anything in a code block, and a compiled contract without its floors would be
// a compiled contract that cannot derive one.
import type { VerificationLevel } from './envelope';
import type { WidgetKind } from './kinds';
import type { EffectClass } from './intent';
import type { CapabilityRef, CapabilitySpace } from './capability-ref';
import type { ChannelId, RenderTier } from './lifecycle';
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

// ── U-TAB (GATES-PLAN-V11 D-5): the effect tables ────────────────────────────────────────────

// §2.4 - "Permitted effects": the CLOSED set of effect classes mintable onto each kind. The bold
// ceiling phrase is K3's derived label over the ordered members and is not a table.
export const KIND_PERMITTED_EFFECTS: Readonly<
  Record<WidgetKind, readonly EffectClass[]>
> = Object.freeze({
  CHOICE: Object.freeze([
    'NONE',
    'NAVIGATE',
    'REFINE',
    'CONTROL',
    'HANDOFF',
  ] as const),
  SERVICE_SELECTOR: Object.freeze([
    'NONE',
    'NAVIGATE',
    'REFINE',
    'CONTROL',
    'DRAFT',
  ] as const),
  STAFF_SELECTOR: Object.freeze([
    'NONE',
    'NAVIGATE',
    'REFINE',
    'CONTROL',
    'DRAFT',
  ] as const),
  TIME_SLOT_SELECTOR: Object.freeze([
    'NONE',
    'NAVIGATE',
    'REFINE',
    'CONTROL',
    'DRAFT',
  ] as const),
  BOOKING_CONFIRMATION: Object.freeze([
    'NONE',
    'NAVIGATE',
    'REFINE',
    'CONTROL',
    'COMMIT',
    'HANDOFF',
  ] as const),
  SCHEDULE: Object.freeze([
    'NONE',
    'NAVIGATE',
    'REFINE',
    'CONTROL',
    'HANDOFF',
  ] as const),
  CLIENT_LIST: Object.freeze([
    'NONE',
    'NAVIGATE',
    'REFINE',
    'CONTROL',
    'REQUEST_APPROVAL',
    'HANDOFF',
  ] as const),
  METRIC: Object.freeze(['NONE', 'NAVIGATE', 'REFINE', 'CONTROL'] as const),
  CHART: Object.freeze(['NONE', 'NAVIGATE', 'REFINE', 'CONTROL'] as const),
  REPORT: Object.freeze(['NONE', 'NAVIGATE', 'REFINE', 'CONTROL'] as const),
  STRATEGY_OPTIONS: Object.freeze([
    'NONE',
    'NAVIGATE',
    'REFINE',
    'CONTROL',
    'REQUEST_APPROVAL',
  ] as const),
  APPROVAL: Object.freeze([
    'NONE',
    'NAVIGATE',
    'CONTROL',
    'COMMIT',
    'HANDOFF',
  ] as const),
  PROGRESS: Object.freeze(['NONE', 'NAVIGATE', 'REFINE', 'CONTROL'] as const),
  LIMITATION: Object.freeze([
    'NONE',
    'NAVIGATE',
    'CONTROL',
    'HANDOFF',
  ] as const),
  SOURCE_STATUS: Object.freeze([
    'NONE',
    'NAVIGATE',
    'CONTROL',
    'HANDOFF',
  ] as const),
  SETTINGS_DRAFT: Object.freeze([
    'NONE',
    'NAVIGATE',
    'REFINE',
    'CONTROL',
    'COMMIT',
    'HANDOFF',
  ] as const),
  FORM: Object.freeze([
    'NONE',
    'NAVIGATE',
    'REFINE',
    'CONTROL',
    'DRAFT',
    'HANDOFF',
  ] as const),
  CONSENT_STATE: Object.freeze(['NONE', 'CONTROL', 'HANDOFF'] as const),
  IDENTITY_BINDING: Object.freeze(['NONE', 'CONTROL', 'HANDOFF'] as const),
  PAYMENT_HANDOFF: Object.freeze([
    'NONE',
    'NAVIGATE',
    'REFINE',
    'CONTROL',
    'COMMIT',
    'HANDOFF',
  ] as const),
  MEDIA_PREVIEW: Object.freeze([
    'NONE',
    'NAVIGATE',
    'REFINE',
    'CONTROL',
  ] as const),
  ARTIFACT: Object.freeze(['NONE', 'NAVIGATE', 'CONTROL', 'HANDOFF'] as const),
});

// §2.3.4 - allowed_target_classes: 'w', 'i', 'detail' for every kind, plus 's' where
// the kind permits HANDOFF. 'c' is permitted on no kind in this contract version.
export const KIND_ALLOWED_TARGET_CLASSES: Readonly<
  Record<WidgetKind, readonly TargetClass[]>
> = Object.freeze({
  CHOICE: Object.freeze(['w', 'i', 'detail', 's'] as const),
  SERVICE_SELECTOR: Object.freeze(['w', 'i', 'detail'] as const),
  STAFF_SELECTOR: Object.freeze(['w', 'i', 'detail'] as const),
  TIME_SLOT_SELECTOR: Object.freeze(['w', 'i', 'detail'] as const),
  BOOKING_CONFIRMATION: Object.freeze(['w', 'i', 'detail', 's'] as const),
  SCHEDULE: Object.freeze(['w', 'i', 'detail', 's'] as const),
  CLIENT_LIST: Object.freeze(['w', 'i', 'detail', 's'] as const),
  METRIC: Object.freeze(['w', 'i', 'detail'] as const),
  CHART: Object.freeze(['w', 'i', 'detail'] as const),
  REPORT: Object.freeze(['w', 'i', 'detail'] as const),
  STRATEGY_OPTIONS: Object.freeze(['w', 'i', 'detail'] as const),
  APPROVAL: Object.freeze(['w', 'i', 'detail', 's'] as const),
  PROGRESS: Object.freeze(['w', 'i', 'detail'] as const),
  LIMITATION: Object.freeze(['w', 'i', 'detail', 's'] as const),
  SOURCE_STATUS: Object.freeze(['w', 'i', 'detail', 's'] as const),
  SETTINGS_DRAFT: Object.freeze(['w', 'i', 'detail', 's'] as const),
  FORM: Object.freeze(['w', 'i', 'detail', 's'] as const),
  CONSENT_STATE: Object.freeze(['w', 'i', 'detail', 's'] as const),
  IDENTITY_BINDING: Object.freeze(['w', 'i', 'detail', 's'] as const),
  PAYMENT_HANDOFF: Object.freeze(['w', 'i', 'detail', 's'] as const),
  MEDIA_PREVIEW: Object.freeze(['w', 'i', 'detail'] as const),
  ARTIFACT: Object.freeze(['w', 'i', 'detail', 's'] as const),
});

// R3.2.2 - the key spaces an intent of each effect class may name through subjectCapability. NAVIGATE's
// C9 ref is a class-'c' target's; HANDOFF's refs are handoff_capability_ref, AE referenced and never
// invoked; no effect class may name a TOOL ref.
export const EFFECT_KEY_SPACES: Readonly<
  Record<EffectClass, readonly CapabilitySpace[]>
> = Object.freeze({
  NONE: Object.freeze([] as const),
  NAVIGATE: Object.freeze(['C9'] as const),
  REFINE: Object.freeze(['C9'] as const),
  CONTROL: Object.freeze(['CONTROL'] as const),
  DRAFT: Object.freeze(['C9'] as const),
  REQUEST_APPROVAL: Object.freeze(['AE'] as const),
  COMMIT: Object.freeze(['AE'] as const),
  HANDOFF: Object.freeze(['C9', 'AE'] as const),
});

// §4.5.3 - the tier each channel is fitted to. Total over ChannelId.
export const CHANNEL_TIER: Readonly<Record<ChannelId, RenderTier>> =
  Object.freeze({
    pwa: 'RICH_INTERACTIVE',
    'native-shell': 'RICH_INTERACTIVE',
    'telegram-miniapp': 'RICH_INTERACTIVE',
    'telegram-bot': 'RICH_CONSTRAINED',
    'web-push': 'ANNOUNCEMENT',
    'realtime-voice': 'SPOKEN',
    'guest-chat': 'ANONYMOUS_CHAT',
    'web-public': 'PUBLIC_READ',
    'public-community': 'PUBLIC_READ',
    sms: 'TEXT_ONLY',
    email: 'TEXT_ONLY',
  });

// §4.5.3 CH1 - each tier's effect ceiling is an ALLOWLIST, never an ordered ceiling. R3.2.3 keeps NONE
// on RICH_INTERACTIVE alone. `escape` is true exactly where the cell does not reach CONTROL: there the
// one tokened F60 escape (TIER_ESCAPE) is admitted as well, and no other CONTROL intent.
export type TierEffectCell = {
  readonly effects: readonly EffectClass[];
  readonly escape: boolean;
};
export const TIER_EFFECTS: Readonly<Record<RenderTier, TierEffectCell>> =
  Object.freeze({
    RICH_INTERACTIVE: Object.freeze({
      effects: Object.freeze([
        'NONE',
        'NAVIGATE',
        'REFINE',
        'CONTROL',
        'DRAFT',
        'REQUEST_APPROVAL',
        'COMMIT',
        'HANDOFF',
      ] as const),
      escape: false,
    }),
    RICH_CONSTRAINED: Object.freeze({
      effects: Object.freeze([
        'NAVIGATE',
        'REFINE',
        'CONTROL',
        'DRAFT',
        'REQUEST_APPROVAL',
        'COMMIT',
        'HANDOFF',
      ] as const),
      escape: false,
    }),
    ANNOUNCEMENT: Object.freeze({
      effects: Object.freeze(['NAVIGATE', 'HANDOFF'] as const),
      escape: true,
    }),
    SPOKEN: Object.freeze({
      effects: Object.freeze([
        'NAVIGATE',
        'REFINE',
        'CONTROL',
        'DRAFT',
        'REQUEST_APPROVAL',
        'COMMIT',
        'HANDOFF',
      ] as const),
      escape: false,
    }),
    TEXT_ONLY: Object.freeze({
      effects: Object.freeze(['HANDOFF'] as const),
      escape: true,
    }),
    PUBLIC_READ: Object.freeze({
      effects: Object.freeze(['NAVIGATE', 'HANDOFF'] as const),
      escape: true,
    }),
    ANONYMOUS_CHAT: Object.freeze({
      effects: Object.freeze(['REFINE', 'HANDOFF'] as const),
      escape: true,
    }),
  });

// §0.9 F60 - the escape on every tier other than RICH_INTERACTIVE: this effect, this CONTROL key,
// this priority, and nothing else. Read by carrierAdmits alone.
export const TIER_ESCAPE: Readonly<{
  effect: EffectClass;
  space: 'CONTROL';
  key: keyof typeof CONTROL_REGISTRY;
  priority: number;
}> = Object.freeze({
  effect: 'CONTROL',
  space: 'CONTROL',
  key: 'control.widget.dismiss',
  priority: 0,
});
