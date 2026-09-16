// The bindings that turn the certified contract's floor derivation from text into behaviour.
//
// `src/widget-contract/` is generated from the contract and is correct. It does not RUN, for a
// reason that is easy to miss and was: `ambient.ts` declares its dependencies with `export declare`
// — compile-time names with no runtime value — and `tsconfig.build.json` excludes the whole
// directory from the production build. So `verificationFloor()` existed as text and never as
// behaviour, and every intent record written so far stored a literal `'ANONYMOUS'` instead of a
// derived floor.
//
// This file supplies every one of those names from the real registries. It AUTHORS NO POLICY: the
// tables it re-exports are the generated ones, the predicates are §0.7 F32's, and the one table
// that carries owner policy — WIDGET_CAPABILITY_POLICY — comes from `capability-policy.ts` under
// the signed SHEET 01 / OPTION A ruling.
//
// It imports nothing from `widget-contract` except types and already-initialised constants, so
// there is no import cycle: tables.ts never imports back from here.

import { createHash } from 'node:crypto';

import { ActionCapabilityRegistry as RealActionCapabilityRegistry } from '../../action-engine/action-engine.registry';
import type { RegisteredActionCapabilityV1 } from '../../action-engine/action-engine.contract';
import { MAYA_AI_TOOL_CATALOG as REAL_TOOL_CATALOG } from '../../ai-tools/ai-tool.catalog';
import type { AiToolDefinition } from '../../ai-tools/ai-tool.types';
import {
  C9_CAPABILITIES as REAL_C9,
  C9_REGISTRY_HASH as REAL_C9_HASH,
  type C9Capability,
} from '../../orchestration/c9.registry';
import {
  MONEY_FACETS,
  MONEY_TARGET_KINDS,
  TARGET_FLOOR,
} from '../../widget-contract/tables';
import type { VerificationLevel } from '../../widget-contract/envelope';
import type { CapabilityRef } from '../../widget-contract/capability-ref';
import type { IntentTarget } from '../../widget-contract/intent';
import type { AeCommitRow } from '../../widget-contract/registries';
import { AE_WIDGET_COMMIT_ALLOWLIST as K7_ALLOWLIST } from '../booking/booking-allowlist';
import { VERIFICATION_RANK } from './ladder';

// ── the three registries, as the contract names them ─────────────────────────────────────────────

export const C9_CAPABILITIES: readonly C9Capability[] = REAL_C9;
export const MAYA_AI_TOOL_CATALOG: readonly AiToolDefinition[] =
  REAL_TOOL_CATALOG;
export const C9_REGISTRY_HASH: string = REAL_C9_HASH;

const c9ByKey = new Map(REAL_C9.map((c) => [c.capabilityKey, c]));
export const c9Registry = Object.freeze({
  tryGet: (key: string): C9Capability | undefined => c9ByKey.get(key),
});

const aeList: readonly RegisteredActionCapabilityV1[] =
  new RealActionCapabilityRegistry().list();
const aeByKey = new Map(aeList.map((c) => [c.capability, c]));

export const actionCapabilityRegistry = Object.freeze({
  get: (key: string): RegisteredActionCapabilityV1 => {
    const cap = aeByKey.get(key);
    if (!cap) throw new Error(`AE capability ${key} is not registered`);
    return cap;
  },
  tryGet: (key: string): RegisteredActionCapabilityV1 | undefined =>
    aeByKey.get(key),
});

export { RealActionCapabilityRegistry as ActionCapabilityRegistry };

/** The three by-key maps `capability-ref.ts` builds and could not, because its source was ambient. */
export const C9_CAP_BY_KEY: ReadonlyMap<string, C9Capability> = c9ByKey;
export const AE_CAP_BY_KEY: ReadonlyMap<string, RegisteredActionCapabilityV1> =
  aeByKey;
export const MAYA_AI_TOOL_CATALOG_BY_NAME: ReadonlyMap<
  string,
  AiToolDefinition
> = new Map(REAL_TOOL_CATALOG.map((t) => [t.name, t]));

// ── the helpers the contract names ───────────────────────────────────────────────────────────────

/** `${space}:${key}` — the spelling F24 requires, so two spaces cannot collide by key alone. */
export const capKey = (ref: CapabilityRef): string => `${ref.space}:${ref.key}`;

export class MintRefusal extends Error {}
export const refuseMint = (code: string): never => {
  throw new MintRefusal(code);
};

/**
 * The highest of the levels given, fail-closed on an empty call.
 *
 * Shares `VERIFICATION_RANK` with K4's ladder rather than ordering the rungs a second time — two
 * orderings of one ladder is how a floor quietly stops meaning what it says.
 */
export const maxLevel = (...levels: VerificationLevel[]): VerificationLevel => {
  if (!levels.length) return 'STEP_UP_VERIFIED';
  return levels.reduce((a, b) =>
    VERIFICATION_RANK[b] > VERIFICATION_RANK[a] ? b : a,
  );
};

/** Total over the five target classes and null, from the generated table. Nothing authored. */
export const targetFloor = (t: IntentTarget | null): VerificationLevel => {
  if (t === null || t === undefined) return TARGET_FLOOR.null;
  const cls = (t as { class?: string }).class as
    keyof typeof TARGET_FLOOR | undefined;
  if (cls === undefined) return 'STEP_UP_VERIFIED'; // FAIL CLOSED — a target with no class
  return TARGET_FLOOR[cls] ?? 'STEP_UP_VERIFIED'; // FAIL CLOSED — a class the table lacks
};

/** Canonical JSON: key order is not information, so it is removed before hashing. */
export const stableActionJson = (v: unknown): string => {
  const walk = (x: unknown): unknown => {
    if (x === null || typeof x !== 'object') return x;
    if (Array.isArray(x)) return x.map(walk);
    const o = x as Record<string, unknown>;
    return Object.keys(o)
      .sort()
      .reduce<Record<string, unknown>>((a, k) => {
        a[k] = walk(o[k]);
        return a;
      }, {});
  };
  return JSON.stringify(walk(v));
};

export const sha256Hex = (s: string): string =>
  createHash('sha256').update(s, 'utf8').digest('hex');

// ── §0.7 F32's family predicates, each stated once ───────────────────────────────────────────────
//
// Each is the contract's own two-disjunct form. `CONSENT` and `IDENTITY` are re-exported from K12,
// which already owns them and whose suite already exercises both arms — there is no second copy.

export {
  isConsentCapability as CONSENT,
  isIdentityCapability as IDENTITY,
} from '../consent/data-subject-acts';

export const BOOKING = (cap: RegisteredActionCapabilityV1): boolean =>
  (cap as { targetKind?: string }).targetKind === 'appointment';

const MARKETING_ACTION_CLASSES = [
  'deliver_bulk_campaign',
  'send_bulk_campaign',
];
const MARKETING_TARGET_KINDS = [
  'marketing_campaign',
  'marketing_client_recipient',
  'audience',
];
export const MARKETING_FANOUT = (
  cap: RegisteredActionCapabilityV1,
): boolean => {
  const c = cap as { actionClass?: string; targetKind?: string };
  return (
    MARKETING_ACTION_CLASSES.includes(c.actionClass ?? '') ||
    MARKETING_TARGET_KINDS.includes(c.targetKind ?? '')
  );
};

const TENANT_TARGET_KINDS = ['tenant', 'tenant_settings', 'tenant_billing'];
export const TENANT_AUTHORITY = (cap: RegisteredActionCapabilityV1): boolean =>
  TENANT_TARGET_KINDS.includes(
    (cap as { targetKind?: string }).targetKind ?? '',
  );

/** §3.10's predicate, over the sets extracted from the contract — 92 of the 226. */
export const MONEY = (cap: RegisteredActionCapabilityV1): boolean => {
  const c = cap as { targetKind?: string; riskFacets?: readonly string[] };
  const facets = new Set<string>(MONEY_FACETS as readonly string[]);
  const kinds = new Set<string>(MONEY_TARGET_KINDS as readonly string[]);
  return (
    (c.riskFacets ?? []).some((f) => facets.has(f)) ||
    kinds.has(c.targetKind ?? '')
  );
};

// ── the two tables the generated modules declare and do not define ───────────────────────────────

export { WIDGET_CAPABILITY_POLICY } from './capability-policy';

export interface AeCommitRowLike {
  /** The generated union, not `string` — AE_FAMILY_FLOOR is keyed by it and must stay total. */
  readonly family: AeCommitRow['family'];
  readonly min_verification: VerificationLevel;
  readonly requires_ae_approval: boolean;
  readonly propose: CapabilityRef;
}

/**
 * `AE_WIDGET_COMMIT_ALLOWLIST` in the keyed shape the derivation reads.
 *
 * DERIVED from K7's three rows, which remain the only allowlist. The three columns the generated
 * shape adds are not authored here either: `family` is `booking` because all three rows are
 * booking capabilities; `requires_ae_approval` is read from the live registry, which the contract
 * requires it to EQUAL; and `min_verification` is `SESSION_VERIFIED` because the generated type's
 * own comment fixes it — "≥ SESSION_VERIFIED for every row".
 */
export const AE_WIDGET_COMMIT_ALLOWLIST: Readonly<
  Record<string, AeCommitRowLike>
> = Object.freeze(
  Object.fromEntries(
    K7_ALLOWLIST.map((row) => [
      row.ae,
      Object.freeze({
        family: 'booking' as const,
        min_verification: 'SESSION_VERIFIED',
        requires_ae_approval:
          (aeByKey.get(row.ae) as { approvalRequirement?: string } | undefined)
            ?.approvalRequirement === 'REQUIRED',
        propose: { space: 'C9' as const, key: row.proposeKey },
      }),
    ]),
  ),
);

// ── §3.5's subject capability, one body ──────────────────────────────────────────────────────────

export interface IntentSubjectLike {
  readonly capability: CapabilityRef | null;
  readonly handoff_capability_ref: CapabilityRef | null;
  readonly target: IntentTarget | null;
}

/**
 * The single body §3.5 declares. Null for a `NONE` effect and for a `w`/`i`/`s`/`detail`
 * `NAVIGATE`, and **every caller must guard that null** — a null subject means no capability is
 * exercised, so a gate that dispatches on it has nothing to dispatch on.
 */
export const subjectCapability = (
  i: IntentSubjectLike,
): CapabilityRef | null => {
  if (i.capability !== null && i.capability !== undefined) return i.capability;
  if (
    i.handoff_capability_ref !== null &&
    i.handoff_capability_ref !== undefined
  )
    return i.handoff_capability_ref;
  const t = i.target as { class?: string; ref?: CapabilityRef } | null;
  if (t?.class === 'c' && t.ref) return t.ref;
  return null;
};
