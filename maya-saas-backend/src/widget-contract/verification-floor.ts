// GENERATED FROM THE CERTIFIED CONTRACT - do not hand-edit.
// Source:     docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md
// Regenerate: node scripts/widget-contract/emit.mjs
// Module:     verification-floor
/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import {
  C9Domain,
  C9_CAPABILITIES,
  actionCapabilityRegistry,
  c9Registry,
  maxLevel,
  targetFloor,
} from './ambient';
import {
  CONSENT,
  CONSENT_CLASS_FLOOR,
  CONTROL_FLOOR,
  EFFECT_FLOOR,
  IDENTITY,
  KIND_FLOOR,
  RISK_FLOOR,
  WIDGET_CAPABILITY_POLICY,
} from './tables';
import {
  AE_CAP_BY_KEY,
  CapabilityRef,
  MAYA_AI_TOOL_CATALOG_BY_NAME,
  capKey,
} from './capability-ref';
import { Correlation, VerificationLevel } from './envelope';
import {
  EffectClass,
  IntentRecord,
  IntentTarget,
  WidgetIntent,
} from './intent';
import { WidgetKind } from './kinds';
import { AE_WIDGET_COMMIT_ALLOWLIST, AeCommitRow } from './registries';

// --- section 0.8 (contract line 662) ---
// The intent shape the floor derivation reads: §3's WidgetIntent with its two capability
// members retyped per F21.
export type MintedIntent = Omit<
  WidgetIntent,
  'capability' | 'handoff_capability_ref'
> & {
  capability: CapabilityRef | null;
  handoff_capability_ref: CapabilityRef | null;
};

export type IntentSubject = {
  capability: CapabilityRef | null;
  handoff_capability_ref: CapabilityRef | null;
  target: IntentTarget | null;
};

export type FloorSubject = IntentSubject & {
  effect: EffectClass;
  priority: number;
};

export declare function subjectCapability(
  i: IntentSubject,
): CapabilityRef | null;
// SIGNATURE ONLY — the floor derivation below depends on it. Its single BODY is in §3.5,
// which §0.2's map gives the subject capability and the consent fence. A signature here
// and a body there is one declaration, not two; no third statement of either exists.

// --- section 0.8 (contract line 697) ---
// INPUTS: exactly i.effect, i.capability, i.handoff_capability_ref, i.target, i.priority,
// and kind. No other value is read. There is no `audience` term.
export function verificationFloor(
  i: FloorSubject,
  kind: WidgetKind,
): VerificationLevel {
  if (FLOOR_EXEMPT(i)) {
    // Waive EFFECT_FLOOR, KIND_FLOOR and targetFloor — and, for a HANDOFF ONLY, the
    // destination subject term. NEVER waive a subject's OWN floor: control.run.cancel is
    // CONTROL_FLOOR BOUND_CLIENT and stays there.
    return i.effect === 'HANDOFF'
      ? 'ANONYMOUS' // the destination authenticates at its ingress
      : subjectFloor(subjectCapability(i)); // CONTROL and the C9 LOCAL row keep their own
  }
  return maxLevel(
    EFFECT_FLOOR[i.effect], // total over the 8 effect classes
    KIND_FLOOR[kind], // total over the 22 kinds
    subjectFloor(subjectCapability(i)), // total, fail-closed, dispatched by space
    targetFloor(i.target), // total over the 5 target classes and null
  );
}

// --- section 0.8 (contract line 751) ---
export function subjectFloor(ref: CapabilityRef | null): VerificationLevel {
  if (ref === null) return 'ANONYMOUS'; // NONE; w/i/s/detail NAVIGATE
  switch (ref.space) {
    case 'CONTROL':
      return CONTROL_FLOOR[ref.key]; // closed at 3; a missing key fails the build
    case 'TOOL':
      return 'STEP_UP_VERIFIED'; // FAIL CLOSED — no intent may carry a TOOL ref
    case 'C9':
      return c9Floor(ref);
    case 'AE':
      return aeFloor(ref.key);
  }
}

// --- section 0.8 (contract line 765) ---
// Total over all 56 C9-CAP keys.
export function c9Floor(ref: CapabilityRef): VerificationLevel {
  const cap = c9Registry.tryGet(ref.key); // pure lookup over C9_CAPABILITIES
  if (cap === undefined) return 'STEP_UP_VERIFIED'; // FAIL CLOSED — unregistered
  const row = WIDGET_CAPABILITY_POLICY[capKey(ref)];
  if (row === undefined) return 'STEP_UP_VERIFIED'; // FAIL CLOSED — unclassified

  // TOOL-DEF's risk term applies to the 47 C9-CAP keys that are also catalogue names and to no
  // others. Where it does not apply it is REPLACED by terms that do — it is neither silently
  // strictest nor silently weakest.
  const def = MAYA_AI_TOOL_CATALOG_BY_NAME.get(ref.key); // ReadonlyMap.get — never throws
  const risk = def === undefined ? 'ANONYMOUS' : RISK_FLOOR[def.riskTier];

  return maxLevel(
    row.min_verification,
    risk,
    C9_MODE_FLOOR(cap.mode),
    C9_RESOURCE_FLOOR(cap.resourceClass),
    CONSENT_CLASS_FLOOR[row.consent_class],
  );
}

export function C9_MODE_FLOOR(mode: string): VerificationLevel {
  switch (mode) {
    case 'READ':
      return 'ANONYMOUS'; // reads carry their floor in min_verification
    case 'PROPOSE_ONLY':
      return 'SESSION_VERIFIED'; // a proposal is composed for a known session
    case 'OWNER_HANDOFF':
      return 'SESSION_VERIFIED'; // the owner surface adds its own step-up
    default:
      return 'STEP_UP_VERIFIED'; // FAIL-CLOSED DEFAULT — a widened union
  }
}

export function C9_RESOURCE_FLOOR(rc: string): VerificationLevel {
  switch (rc) {
    case 'LOCAL':
      return 'ANONYMOUS'; // touches no source
    case 'SOURCE_READ':
      return 'ANONYMOUS'; // a read's protection is its own row plus
    // Gate 6, never a blanket
    case 'SOURCE_HANDOFF':
      return 'SESSION_VERIFIED';
    default:
      return 'STEP_UP_VERIFIED'; // FAIL-CLOSED DEFAULT — a widened union
  }
}

// --- section 0.8 (contract line 817) ---
export function aeFloor(key: string): VerificationLevel {
  const cap = actionCapabilityRegistry.tryGet(key);
  if (cap === undefined) return 'STEP_UP_VERIFIED'; // FAIL CLOSED — unregistered
  const row = AE_WIDGET_COMMIT_ALLOWLIST[key];
  if (row === undefined) return 'STEP_UP_VERIFIED'; // FAIL CLOSED — not allowlisted
  if (cap.policyDecision !== 'ALLOW') return 'STEP_UP_VERIFIED'; // FAIL CLOSED — SHADOW_ONLY / DENY
  if (!cap.allowedSourceTypes.includes('authenticated_request'))
    return 'STEP_UP_VERIFIED'; // FAIL CLOSED — not widget-reachable
  return maxLevel(
    row.min_verification, // never below SESSION_VERIFIED
    AE_AUTONOMY_FLOOR(cap.autonomyLevel),
    AE_FAMILY_FLOOR[row.family],
  );
}

// autonomyLevel is typed `string`, not a union (action-engine.contract.ts:183), so this table
// CANNOT be total by type. It is made total by an explicit default.
export function AE_AUTONOMY_FLOOR(level: string): VerificationLevel {
  switch (level) {
    case 'L2_CONFIRMED_REQUEST':
      return 'SESSION_VERIFIED';
    case 'L2_SERVER_POLICY':
      return 'SESSION_VERIFIED';
    case 'L3_CANONICAL':
      return 'SESSION_VERIFIED';
    case 'L3_OWNER_APPROVED':
      return 'SESSION_VERIFIED';
    case 'L0_PROVIDER_DEFERRED':
      return 'STEP_UP_VERIFIED'; // provider-deferred: never chat-actuated
    case 'L2_5_SHADOW':
      return 'STEP_UP_VERIFIED'; // unreachable anyway (policyDecision)
    case 'KERNEL_TEST_ONLY':
      return 'STEP_UP_VERIFIED';
    default:
      return 'STEP_UP_VERIFIED'; // FAIL-CLOSED DEFAULT — a new level
  } // added upstream withholds, never admits
}

export const AE_FAMILY_FLOOR: Readonly<
  Record<AeCommitRow['family'], VerificationLevel>
> = {
  booking: 'SESSION_VERIFIED',
  settings: 'SESSION_VERIFIED',
  operational: 'SESSION_VERIFIED',
  marketing_fanout: 'STEP_UP_VERIFIED',
  money: 'STEP_UP_VERIFIED',
  consent: 'STEP_UP_VERIFIED',
  identity: 'STEP_UP_VERIFIED',
  tenant_authority: 'STEP_UP_VERIFIED',
};

// --- section 0.8 (contract line 864) ---
export function FLOOR_EXEMPT(i: FloorSubject): boolean {
  return (
    i.priority === 0 &&
    (i.effect === 'NONE' ||
      i.effect === 'REFINE' ||
      i.effect === 'CONTROL' ||
      i.effect === 'HANDOFF') &&
    (i.capability === null ||
      i.capability.space === 'CONTROL' || // closed at three
      (i.capability.space === 'C9' && // the unique LOCAL row
        c9Registry.tryGet(i.capability.key)?.resourceClass === 'LOCAL')) &&
    (i.effect !== 'HANDOFF' ||
      (i.target?.class === 's' && // a surface, not an act
        !SENSITIVE_DEST(i.handoff_capability_ref)))
  );
}

// CONSENT and IDENTITY are predicates over a REGISTERED AE capability — they read
// cap.targetKind and cap.actionClass — so they cannot be applied to a CapabilityRef directly.
// This is the ref-taking form: total over the four spaces by type, and fail-closed.
export function SENSITIVE_DEST(r: CapabilityRef | null): boolean {
  if (r === null) return false; // no destination named: nothing to classify
  switch (r.space) {
    case 'AE': {
      const cap = AE_CAP_BY_KEY.get(r.key);
      if (cap === undefined) return true; // FAIL CLOSED — unregistered destination
      return CONSENT(cap) || IDENTITY(cap);
    }
    case 'C9': {
      const row = WIDGET_CAPABILITY_POLICY[capKey(r)];
      if (row === undefined) return true; // FAIL CLOSED — unclassified
      return (
        row.consent_class === 'personal_data' ||
        row.consent_class === 'identity_binding'
      );
    }
    case 'CONTROL':
      return false; // closed at three, none of them sensitive
    case 'TOOL':
      return true; // FAIL CLOSED — no intent may carry a TOOL ref
  }
}

// --- section 0.8 (contract line 1032) ---
// on IntentRecord — mint class D, AUDIT_RETAINED
// [MEMBER FRAGMENT] c9_domain: C9Domain | null;   // the orchestrator's own published union
// ('ADMIN' | 'CLIENT_LIFECYCLE' | 'OCCUPANCY' |
//  'BUSINESS_INTELLIGENCE'), imported, never redeclared.
// Non-null IFF BOTH subjectCapability(record).space === 'C9'
// AND correlation.run_id !== null. Derived at EP-MINT from
// Correlation.agent_id — class D, derived by the minter from the
// run's registered agent. NEVER from the subject capability's own
// `domains`, which would compare a value with itself.
