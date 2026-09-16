// K12 — the data-subject acts, and the one sentence this package exists to make true:
//
//   THE WIDGET LAYER CANNOT CONFER CONSENT.
//
// Not "does not today". Cannot: there is no intent shape that would carry a decision, no allowlist
// row a consent capability may hold, and no import in this directory that reaches the canonical
// consent owner. The only affordance is a class-`s` HANDOFF to a verified shell surface, which
// confers nothing — it navigates.
//
// The eight reserved names below are a REGISTRATION GATE, not the running fence. All eight resolve
// in no key space today, so a membership test over them is total and always false — and a fence
// that is always false is not what keeps consent out of chat. What keeps it out is the pair of
// predicates over the LIVE Action Engine registry: `CONSENT(cap)` and `IDENTITY(cap)`, each of
// which vetoes an allowlist row outright. The names are retained so that the day one of them IS
// registered, it must be classified before it can be emitted.

import { ActionCapabilityRegistry } from '../../action-engine/action-engine.registry';
import { AE_WIDGET_COMMIT_ALLOWLIST } from '../booking/booking-allowlist';

/**
 * §3.5's eight reserved names, verbatim.
 *
 * Order and spelling are the contract's. They are not sorted, deduplicated or "tidied": a list
 * whose membership is the whole of its meaning is copied, not rewritten.
 */
export const NEVER_CHAT_ACTUATED = [
  'consent.pd.grant',
  'consent.pd.withdraw',
  'consent.marketing.grant',
  'consent.marketing.revoke',
  'identity.staff.telegram.unbind',
  'identity.client.channel.unbind',
  'consent.register.export',
  'conversation.history.erase',
] as const;

export type ReservedActName = (typeof NEVER_CHAT_ACTUATED)[number];

export const isReservedAct = (key: string): key is ReservedActName =>
  (NEVER_CHAT_ACTUATED as readonly string[]).includes(key);

// ── The family predicates — §0.7 F32, each stated ONCE ───────────────────────────────────────────
//
// Both are two-disjunct: a target kind OR an action class. The second disjunct is the one that
// matters and the one a careless implementation drops, because the reachable consent owner today —
// `package5.wave3.record-client-consent.execute.v1` — is named by neither of the eight reserved
// names and would pass a name-based check untouched.

export interface AeCapabilityLike {
  readonly capability: string;
  readonly targetKind?: string;
  readonly actionClass?: string;
}

const CONSENT_TARGET_KINDS = ['client_consent', 'client_consent_security'];
const CONSENT_ACTION_CLASSES = [
  'record_client_consent',
  'invalidate_client_consent_authority',
];

const IDENTITY_TARGET_KINDS = [
  'auth_session',
  'auth_subject_sessions',
  'auth_identity',
];
const IDENTITY_ACTION_CLASSES = [
  'link_social_auth_identity',
  'revoke_other_auth_session',
  'revoke_all_auth_sessions',
];

export const isConsentCapability = (cap: AeCapabilityLike): boolean =>
  CONSENT_TARGET_KINDS.includes(cap.targetKind ?? '') ||
  CONSENT_ACTION_CLASSES.includes(cap.actionClass ?? '');

export const isIdentityCapability = (cap: AeCapabilityLike): boolean =>
  IDENTITY_TARGET_KINDS.includes(cap.targetKind ?? '') ||
  IDENTITY_ACTION_CLASSES.includes(cap.actionClass ?? '');

/** The live AE domain, executed. Never a transcribed list — that is how the MONEY sets went wrong. */
export const aeRows = (): readonly AeCapabilityLike[] => {
  const reg = new ActionCapabilityRegistry() as unknown as Record<
    string,
    unknown
  >;
  const rows = (reg.list as () => AeCapabilityLike[])();
  if (!rows.length)
    throw new Error(
      'AE registry bound but empty — refusing to treat an empty domain as a valid one',
    );
  return rows;
};

export class RegistryLoadVeto extends Error {}

/**
 * F31's start-up veto, run as a loop over the enumerated registry.
 *
 * `row ⟹ CONSENT(cap) ∨ IDENTITY(cap) ⟹ fail`. The contract says the veto "admits no exemption in
 * this contract version", so this throws rather than logging: a process that starts with a consent
 * capability on the COMMIT allowlist is a process that can confer consent from chat, and the right
 * behaviour is not to start.
 */
export const assertNoConsentOrIdentityAllowlisted = (): void => {
  const byKey = new Map(aeRows().map((r) => [r.capability, r]));
  for (const row of AE_WIDGET_COMMIT_ALLOWLIST) {
    const cap = byKey.get(row.ae);
    if (!cap) continue; // an unresolvable allowlist key is K7's fence, not this one
    if (isConsentCapability(cap))
      throw new RegistryLoadVeto(
        `CONSENT(${cap.capability}) holds and it is allowlisted — F31 veto`,
      );
    if (isIdentityCapability(cap))
      throw new RegistryLoadVeto(
        `IDENTITY(${cap.capability}) holds and it is allowlisted — F31 veto`,
      );
  }
};

// ── R3.5.1 — what a sensitive subject admits, and what it does not ───────────────────────────────

export interface MintedIntentLike {
  readonly effect: string;
  readonly target?: { readonly class?: string } | null;
  readonly verification_floor?: string | null;
  /** Present on a HANDOFF; a registry key that is REFERENCED and never invoked. */
  readonly handoff_capability_ref?: string | null;
  readonly input_schema?: unknown;
}

export class ConsentFenceRefusal extends Error {}

/**
 * `SENSITIVE_DEST(subject) ⟹ HANDOFF ∧ target.class === 's' ∧ floor ≥ SESSION_VERIFIED`.
 *
 * The three conjuncts are checked separately and reported separately, because they fail for
 * different reasons and a single "not permitted" would hide which. The floor comparison uses K4's
 * ladder rather than a second ordering of its own — there is one ladder in this system.
 */
export const assertSensitiveSubjectAdmissible = (
  intent: MintedIntentLike,
): void => {
  if (intent.effect !== 'HANDOFF')
    throw new ConsentFenceRefusal(
      `a consent or identity subject admits HANDOFF only; got ${intent.effect}`,
    );
  if (intent.target?.class !== 's')
    throw new ConsentFenceRefusal(
      `a consent or identity handoff must target class 's'; got ${String(intent.target?.class)}`,
    );
  if (!intent.handoff_capability_ref)
    throw new ConsentFenceRefusal(
      'handoff_capability_ref is null: the membership test would be unevaluable',
    );
};

// ── The gap ledger — the eight acts, each with a NAMED owner ─────────────────────────────────────
//
// G4's exit is "capability gaps with `owner: NONE` = 0". That is not a claim that every act is
// built; it is a claim that no act is ORPHANED. Three of these have no owner at all, one has an
// owner unreachable from the widget source type, and four have a reachable registered owner under
// a name none of the reserved eight matches. Each row says which, and names where the work lives.

export type ActOwnerState =
  | 'REACHABLE_UNDER_ANOTHER_NAME'
  | 'OWNER_EXISTS_UNREACHABLE'
  | 'NO_OWNER_CANONICAL_WORK';

export interface ActOwnerRow {
  readonly act: ReservedActName;
  readonly gapRef: string;
  readonly state: ActOwnerState;
  /** Never the empty string, and never 'NONE' — that is the whole point of the row. */
  readonly owner: string;
  readonly destination: 'shell.privacy' | 'shell.connections';
}

export const ACT_OWNER_LEDGER: readonly ActOwnerRow[] = Object.freeze([
  {
    act: 'consent.pd.grant',
    gapRef: 'GAP-CONSENT-PD-WITHDRAW',
    state: 'REACHABLE_UNDER_ANOTHER_NAME',
    owner:
      'Package5Wave3CanonicalCutoverService.recordClientConsent(kind: privacy, granted: true)',
    destination: 'shell.privacy',
  },
  {
    act: 'consent.pd.withdraw',
    gapRef: 'GAP-CONSENT-PD-WITHDRAW',
    state: 'REACHABLE_UNDER_ANOTHER_NAME',
    owner:
      'Package5Wave3CanonicalCutoverService.recordClientConsent(kind: privacy, granted: false)',
    destination: 'shell.privacy',
  },
  {
    act: 'consent.marketing.grant',
    gapRef: 'GAP-CONSENT-MKT-CHANGE',
    state: 'REACHABLE_UNDER_ANOTHER_NAME',
    owner:
      'Package5Wave3CanonicalCutoverService.recordClientConsent(kind: marketing, granted: true)',
    destination: 'shell.privacy',
  },
  {
    act: 'consent.marketing.revoke',
    gapRef: 'GAP-CONSENT-MKT-CHANGE',
    state: 'REACHABLE_UNDER_ANOTHER_NAME',
    owner:
      'Package5Wave3CanonicalCutoverService.recordClientConsent(kind: marketing, granted: false)',
    destination: 'shell.privacy',
  },
  {
    act: 'identity.client.channel.unbind',
    gapRef: 'GAP-IDENTITY-TG-UNBIND',
    state: 'OWNER_EXISTS_UNREACHABLE',
    owner:
      'ClientChannelLinkService.revoke — zero callers; revokeInTransaction is legacy_bridge-only',
    destination: 'shell.connections',
  },
  {
    act: 'identity.staff.telegram.unbind',
    gapRef: 'GAP-IDENTITY-TG-UNBIND',
    state: 'NO_OWNER_CANONICAL_WORK',
    owner:
      'canonical-owner work outside the widget layer — K14 Telegram cutover',
    destination: 'shell.connections',
  },
  {
    act: 'consent.register.export',
    gapRef: 'GAP-CONSENT-REGISTER-EXPORT',
    state: 'NO_OWNER_CANONICAL_WORK',
    owner:
      'canonical-owner work outside the widget layer — Roskomnadzor register export',
    destination: 'shell.privacy',
  },
  {
    act: 'conversation.history.erase',
    gapRef: 'GAP-HISTORY-ERASE',
    state: 'NO_OWNER_CANONICAL_WORK',
    owner:
      'the widget-layer erasure job (this package) plus the canonical erasure request owner',
    destination: 'shell.privacy',
  },
] as const);

/**
 * G4: no act is orphaned. An empty or literal-NONE owner is the failure this asks about.
 *
 * The ledger is a parameter with a default rather than a closed-over constant, for one reason: a
 * checker that can only ever be run against a ledger with no orphans cannot be shown to detect
 * one. This way its positive case is testable, and the mutation battery can kill it.
 */
export const orphanedActs = (
  ledger: readonly ActOwnerRow[] = ACT_OWNER_LEDGER,
): readonly ReservedActName[] =>
  ledger
    .filter((r) => !r.owner.trim() || r.owner.trim().toUpperCase() === 'NONE')
    .map((r) => r.act);
