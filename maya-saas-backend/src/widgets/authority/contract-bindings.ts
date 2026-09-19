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
import { TARGET_FLOOR } from '../../widget-contract/tables';
import type { VerificationLevel } from '../../widget-contract/envelope';
import type { CapabilityRef } from '../../widget-contract/capability-ref';
import type { IntentTarget } from '../../widget-contract/intent';
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

// ── the two tables the generated modules declare and do not define ───────────────────────────────

export { WIDGET_CAPABILITY_POLICY } from './capability-policy';

// P-23 is the one runtime statement of F31/F32. Re-exporting it keeps every existing gate reader
// on the completed table without creating a second predicate or three-row booking-only shadow.
export {
  AE_WIDGET_COMMIT_ALLOWLIST,
  BOOKING,
  CONSENT,
  IDENTITY,
  MARKETING_FANOUT,
  MONEY,
  TENANT_AUTHORITY,
} from './ae-commit-allowlist.runtime';

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
// ── §2.4 owner classes (U-TAB, IR-TAB-1) ────────────────────────────────────────────────────────
//
// Re-exported so `widgets.module.ts` can run the EP-REGISTRY-LOAD assertion without importing from
// `../widget-contract/` (k3-exit-gate admits no `from '../<dir>/` import there other than prisma).
export { assertOwnerClassesResolve } from '../../widget-contract/owner-classes';
