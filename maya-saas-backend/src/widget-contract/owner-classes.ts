// U-TAB (GATES-PLAN-V11 D-5) — §2.4's owner classes, at runtime.
//
// `kinds.ts` DECLARES `ownerClassKeys` and `allowedKinds` (§2.4, C11:2853-2860) and `KindRule` carries
// `owner_class` and a derived `emittable`, but nothing gave any of them a value. This module is the one
// implementation that K20's `emittable`, the minter's `allowedKinds`, R3.9.4's remedy and Gate 10's
// `ownerSet` share (AREA-B: "Gate 10 must not carry its own copy"). It authors no policy:
//   - `KIND_OWNER_CLASS` and the key patterns are §2.4's "Owner class → registry keys" column, and
//     `SETTINGS_OWNER`'s keys are §0.14 F79's six classes; the spec re-reads both from the contract;
//   - wildcards (`clients.*`) and brace sets (`b35.{preview,status,confirm}`) are expanded over the C9
//     registry, the space §2.4 says an owner class resolves in;
//   - REGISTERED_KEYS is K20's space-qualified union of C9-CAP, AE-CAP and CONTROL_REGISTRY (C11:2927).
//
// The registries are read from their own released modules, not through `widgets/authority/
// contract-bindings.ts`: that file re-exports `assertOwnerClassesResolve` for `widgets.module.ts`
// (IR-TAB-1), and importing it back from here would be a load cycle.
//
// Reading choices, each recorded in the U-TAB report:
//   - CLIENT_LIST's cell names two classes (`CLIENT_READ` + `BULK_AUDIENCE_OWNER`); `KindRule.owner_class`
//     holds one, so the first named is used. Every key of the cell maps to that one label, so no
//     same-owner comparison can differ (plan §0.2, "outcome-neutral").
//   - `INHERITED` (CHOICE, FORM) resolves to NOTHING at registry load — integrator ruling IR-TAB-2
//     (CKPT-W0 review finding 5), which replaces U-TAB's reading that it resolves to every C9 key.
//     C11:2856-2857 says it resolves "to the keys the intent's own capability names", which is a
//     property of one intent and so cannot be a registry-load constant, and C11:2864-2866 exempts
//     `'INHERITED'` (with `'NONE'`) from the load-time "resolves to at least one key" duty. Resolving
//     it to the whole C9 registry would make `allowedKinds` admit CHOICE and FORM for all 56 C9 keys,
//     read keys and `c9.no_action` included, and `allowedKinds` is the fence on the composer's
//     `kind_proposal` (C11:2113, 2145) — a fail-OPEN widening. The empty set is the fail-closed
//     reading: a consumer that would emit an INHERITED kind checks `isInheritedOwner(kind)` and
//     admits it against the INTENT's own capability (for FORM, a registered draft-owner key named by
//     `submit_intent.capability`, C11:2893, C11:3458), never against this table. Gate 10's `ownerSet`
//     excludes INHERITED kinds by its own clause (C11:4836) and R3.9.4 admits them by its own
//     disjunct (C11:4913); both read the owner class, so neither needs a key set here.
//   - `ACTION_EXECUTION` ("the Action Engine approval path") resolves to the AE capabilities whose
//     `approvalRequirement` is REQUIRED.
//   - `ORCHESTRATION_RUN`'s cells name run revisions and the run's existence, which are not registry
//     keys; only the named keys resolve (`c9.no_action`; `owner_report.status`). `control.run.cancel` in
//     PROGRESS's cell is its cancellation control, not an owner key.
//   - `COMMERCE_OWNER` names no key or pattern ("commerce/loyalty write keys (unregistered)") and
//     resolves to nothing.
//   - `emittable` is K20's formula, except for the two owner classes C11:2864-2866 exempts from the
//     load-time resolution duty, `NONE` and `INHERITED`: §2.7 (C11:3617) lists LIMITATION, CHOICE and
//     FORM among the sixteen emittable kinds, and K20 (C11:2927) makes a LIMITATION the fail-closed
//     emission of every kind that is not. Their admission is decided per intent, not here.

import { ActionCapabilityRegistry } from '../action-engine/action-engine.registry';
import { C9_CAPABILITIES } from '../orchestration/c9.registry';
import type { CapabilityRef, CapabilityRefKey } from './capability-ref';
import type { OwnerClass, WidgetKind } from './kinds';
import { CONTROL_REGISTRY, KIND_PERMITTED_EFFECTS } from './tables';

/** §2.4's closed `OwnerClass` union, as a value. A `Record` over the union, so a missing or extra member does not compile. */
const OWNER_CLASS_MEMBERS: Readonly<Record<OwnerClass, true>> = Object.freeze({
  CATALOG_READ: true,
  AVAILABILITY_READ: true,
  SCHEDULE_READ: true,
  CLIENT_READ: true,
  MEASUREMENT_READ: true,
  RESULT_READ: true,
  ANALYTICS_READ: true,
  INTEGRATION_STATUS: true,
  BOOKING_OWNER: true,
  BULK_AUDIENCE_OWNER: true,
  ORCHESTRATION_RUN: true,
  ACTION_EXECUTION: true,
  CONSENT_REGISTER: true,
  IDENTITY_BINDING_OWNER: true,
  COMMERCE_OWNER: true,
  MEDIA_GENERATION_OWNER: true,
  ARTIFACT_OWNER: true,
  SETTINGS_OWNER: true,
  NOTIFICATION_PREF_OWNER: true,
  SCHEDULE_RULE_OWNER: true,
  TENANT_CONFIG_OWNER: true,
  TASK_OWNER: true,
  AUDIENCE_OWNER: true,
  INHERITED: true,
  NONE: true,
});
export const OWNER_CLASSES: readonly OwnerClass[] = Object.freeze(
  Object.keys(OWNER_CLASS_MEMBERS) as OwnerClass[],
);

/** §0.14 F79 — the six admissible SETTINGS_DRAFT owner classes and their keys. */
export const F79_OWNER_CLASS_KEYS: Readonly<
  Record<
    | 'SETTINGS_OWNER'
    | 'NOTIFICATION_PREF_OWNER'
    | 'SCHEDULE_RULE_OWNER'
    | 'TENANT_CONFIG_OWNER'
    | 'TASK_OWNER'
    | 'AUDIENCE_OWNER',
    readonly string[]
  >
> = Object.freeze({
  SETTINGS_OWNER: Object.freeze(['settings.read', 'settings.update']),
  NOTIFICATION_PREF_OWNER: Object.freeze([
    'notifications.appointments.read',
    'notifications.appointments.update',
  ]),
  SCHEDULE_RULE_OWNER: Object.freeze(['staff.schedule.update']),
  TENANT_CONFIG_OWNER: Object.freeze(['a22.configuration']),
  TASK_OWNER: Object.freeze(['tasks.create', 'tasks.complete', 'tasks.list']),
  AUDIENCE_OWNER: Object.freeze(['b35.preview', 'b35.status', 'b35.confirm']),
});

interface OwnerKeyRow {
  readonly ownerClass: OwnerClass;
  /** C9 key patterns as §2.4 writes them: a key, a `{a,b}` brace set, or a trailing `.*` wildcard. */
  readonly c9: readonly string[];
  /** §2.4 marks the cell "(unregistered — §2.7)": it may resolve to no registered key today. */
  readonly unregistered: boolean;
}
const row = (
  ownerClass: OwnerClass,
  c9: readonly string[],
  unregistered = false,
): OwnerKeyRow =>
  Object.freeze({ ownerClass, c9: Object.freeze([...c9]), unregistered });

/** §2.4, "Owner class → registry keys", one row per kind. Total over WidgetKind by its type. */
const OWNER_KEY_ROWS: Readonly<Record<WidgetKind, OwnerKeyRow>> = Object.freeze(
  {
    CHOICE: row('INHERITED', []),
    SERVICE_SELECTOR: row('CATALOG_READ', ['catalog.services.read']),
    STAFF_SELECTOR: row('CATALOG_READ', ['catalog.staff.read']),
    TIME_SLOT_SELECTOR: row('AVAILABILITY_READ', [
      'booking.availability.read',
      'booking.group-availability.read',
    ]),
    BOOKING_CONFIRMATION: row('BOOKING_OWNER', [
      'appointments.own.{create,reschedule,cancel}',
    ]),
    SCHEDULE: row('SCHEDULE_READ', [
      'staff.schedule.read',
      'staff.schedule.own.read',
      'operations.journal.read',
      'company.business-hours.read',
    ]),
    CLIENT_LIST: row('CLIENT_READ', [
      'clients.*',
      'customers.count',
      'b35.{preview,status,confirm}',
    ]),
    METRIC: row('MEASUREMENT_READ', [
      'c7.measurement.read',
      'analytics.team-kpi.read',
    ]),
    CHART: row('RESULT_READ', ['c8.result.read', 'c7.measurement.read']),
    REPORT: row('ANALYTICS_READ', [
      'analytics.business.{query,profit}',
      'analytics.revenue.forecast',
      'analytics.branches.compare',
      'reports.recovered',
      'expenses.read',
      'clients.dossier.read',
    ]),
    STRATEGY_OPTIONS: row('ORCHESTRATION_RUN', ['c9.no_action']),
    APPROVAL: row('ACTION_EXECUTION', []),
    PROGRESS: row('ORCHESTRATION_RUN', ['owner_report.status']),
    LIMITATION: row('NONE', []),
    SOURCE_STATUS: row('INTEGRATION_STATUS', [
      'support.integration-status.read',
      'support.contact-admin.request',
    ]),
    SETTINGS_DRAFT: row(
      'SETTINGS_OWNER',
      Object.values(F79_OWNER_CLASS_KEYS).flat(),
    ),
    FORM: row('INHERITED', []),
    CONSENT_STATE: row('CONSENT_REGISTER', ['consent.*'], true),
    IDENTITY_BINDING: row('IDENTITY_BINDING_OWNER', ['identity.*'], true),
    PAYMENT_HANDOFF: row('COMMERCE_OWNER', [], true),
    MEDIA_PREVIEW: row('MEDIA_GENERATION_OWNER', ['cutmatch.*'], true),
    ARTIFACT: row('ARTIFACT_OWNER', [
      'owner_report.download',
      'owner_report.status',
    ]),
  },
);

/** `WidgetKind`, from a generated table that is total over it. */
const KINDS: readonly WidgetKind[] = Object.freeze(
  Object.keys(KIND_PERMITTED_EFFECTS) as WidgetKind[],
);

export const KIND_OWNER_CLASS: Readonly<Record<WidgetKind, OwnerClass>> =
  Object.freeze(
    Object.fromEntries(
      KINDS.map((k) => [k, OWNER_KEY_ROWS[k].ownerClass]),
    ) as Record<WidgetKind, OwnerClass>,
  );

// ── the registries, space-qualified (K20: never a bare name) ──────────────────────────────────────

const keyOf = (ref: CapabilityRef): CapabilityRefKey =>
  `${ref.space}:${ref.key}`;

const C9_KEYS: readonly string[] = Object.freeze(
  C9_CAPABILITIES.map((c) => c.capabilityKey),
);
const AE_CAPABILITIES = new ActionCapabilityRegistry().list();

/** K20's REGISTERED_KEYS: {C9} × C9_CAPABILITIES ∪ {AE} × ActionCapabilityRegistry.list() ∪ {CONTROL} × CONTROL_REGISTRY. */
export const REGISTERED_KEYS: ReadonlySet<CapabilityRefKey> =
  new Set<CapabilityRefKey>([
    ...C9_KEYS.map((k): CapabilityRefKey => `C9:${k}`),
    ...AE_CAPABILITIES.map((c): CapabilityRefKey => `AE:${c.capability}`),
    ...Object.keys(CONTROL_REGISTRY).map(
      (k): CapabilityRefKey => `CONTROL:${k}`,
    ),
  ]);

/** One frozen ref object per space-qualified key, so a returned set's members compare by identity too. */
const interned = new Map<CapabilityRefKey, CapabilityRef>();
const internRef = (space: 'C9' | 'AE', key: string): CapabilityRef => {
  const k: CapabilityRefKey = `${space}:${key}`;
  const known = interned.get(k);
  if (known) return known;
  const ref: CapabilityRef = Object.freeze(
    space === 'C9'
      ? { space: 'C9' as const, key }
      : { space: 'AE' as const, key },
  );
  interned.set(k, ref);
  return ref;
};

/** A §2.4 pattern over the C9 registry. A `.*` wildcard expands to the registered keys under its prefix. */
const expandC9Pattern = (pattern: string): readonly string[] => {
  const brace = pattern.match(/^([^{}*]+)\{([^{}*]+)\}$/);
  if (brace)
    return brace[2].split(',').map((member) => `${brace[1]}${member.trim()}`);
  if (/^[^{}*]+\.\*$/.test(pattern)) {
    const prefix = pattern.slice(0, -1);
    return C9_KEYS.filter((k) => k.startsWith(prefix));
  }
  return [pattern];
};

/**
 * The two owner classes C11:2864-2866 exempts from the load-time resolution duty. Neither resolves to a
 * registry-load key set: `NONE` cites no owner, and `INHERITED` cites the intent's own capability
 * (IR-TAB-2). Both are emittable; an INHERITED kind is admitted against that intent, never against this
 * module's tables.
 */
const INTENT_OWNED: ReadonlySet<OwnerClass> = new Set<OwnerClass>([
  'NONE',
  'INHERITED',
]);

const resolveRow = (kind: WidgetKind): readonly CapabilityRef[] => {
  const r = OWNER_KEY_ROWS[kind];
  if (INTENT_OWNED.has(r.ownerClass)) return [];
  if (r.ownerClass === 'ACTION_EXECUTION')
    return AE_CAPABILITIES.filter(
      (c) => c.approvalRequirement === 'REQUIRED',
    ).map((c) => internRef('AE', c.capability));
  return [...new Set(r.c9.flatMap(expandC9Pattern))].map((k) =>
    internRef('C9', k),
  );
};

const RESOLVED: ReadonlyMap<WidgetKind, ReadonlySet<CapabilityRef>> = new Map(
  KINDS.map((k) => [k, new Set(resolveRow(k))]),
);
const RESOLVED_KEYS: ReadonlyMap<
  WidgetKind,
  ReadonlySet<CapabilityRefKey>
> = new Map(
  KINDS.map((k) => [k, new Set([...(RESOLVED.get(k) ?? [])].map(keyOf))]),
);
const EMPTY_REFS: ReadonlySet<CapabilityRef> = new Set();
const EMPTY_KINDS: ReadonlySet<WidgetKind> = new Set();

const ALLOWED: ReadonlyMap<CapabilityRefKey, ReadonlySet<WidgetKind>> = (() => {
  const index = new Map<CapabilityRefKey, Set<WidgetKind>>();
  for (const kind of KINDS)
    for (const k of RESOLVED_KEYS.get(kind) ?? []) {
      const kinds = index.get(k) ?? new Set<WidgetKind>();
      kinds.add(kind);
      index.set(k, kinds);
    }
  return index;
})();

const isKind = (kind: string): kind is WidgetKind =>
  Object.prototype.hasOwnProperty.call(OWNER_KEY_ROWS, kind);

/**
 * `ownerClassKeys(kind)` (§2.4): the registry keys `KIND_REGISTRY[kind].owner_class` resolves to. Total
 * over WidgetKind; `NONE` → ∅. An unknown kind resolves to ∅ (fail closed). Members are interned, but
 * compare refs by value with `isOwnerClassKey` rather than by `Set.has` on a ref built elsewhere.
 */
const resolveOwnerClassKeys = (kind: WidgetKind): ReadonlySet<CapabilityRef> =>
  (isKind(kind) && RESOLVED.get(kind)) || EMPTY_REFS;

/**
 * Whether the kind's owner is named by the intent's own capability (§2.4 `INHERITED`: CHOICE, FORM).
 * `ownerClassKeys` is empty for such a kind (IR-TAB-2), so a consumer that may emit one checks the
 * INTENT's capability — for FORM the registered draft owner named by `submit_intent.capability`
 * (C11:2893, C11:3458) — and never `allowedKinds`.
 */
export const isInheritedOwner = (kind: WidgetKind): boolean =>
  isKind(kind) && KIND_OWNER_CLASS[kind] === 'INHERITED';

/** `ref ∈ ownerClassKeys(kind)`, by space-qualified key. */
export const isOwnerClassKey = (
  kind: WidgetKind,
  ref: CapabilityRef,
): boolean =>
  isKind(kind) && (RESOLVED_KEYS.get(kind)?.has(keyOf(ref)) ?? false);

/** `allowedKinds(capability)` (§2.4, B-27): `{ kind : capability ∈ ownerClassKeys(kind) }`, and nothing else. */
const resolveAllowedKinds = (
  capability: CapabilityRef,
): ReadonlySet<WidgetKind> => ALLOWED.get(keyOf(capability)) ?? EMPTY_KINDS;

/** K20: `emittable(kind) = ∃ k ∈ ownerClassKeys(kind) : k ∈ REGISTERED_KEYS`; `NONE` and `INHERITED` are emittable. */
const EMITTABLE: ReadonlyMap<WidgetKind, boolean> = new Map(
  KINDS.map((kind) => [
    kind,
    INTENT_OWNED.has(KIND_OWNER_CLASS[kind]) ||
      [...(RESOLVED_KEYS.get(kind) ?? [])].some((k) => REGISTERED_KEYS.has(k)),
  ]),
);
export const emittable = (kind: WidgetKind): boolean =>
  isKind(kind) && EMITTABLE.get(kind) === true;

// `kinds.ts` declares these two names (the contract's signatures, §2.4); this module is their one body,
// exported under the contract's names.
export {
  resolveOwnerClassKeys as ownerClassKeys,
  resolveAllowedKinds as allowedKinds,
};

/**
 * §2.4's EP-REGISTRY-LOAD assertion: throws, naming every failure, unless
 *   (1) every kind's owner class is a member of the closed `OwnerClass` union;
 *   (2) every key a kind resolves to is registered in its own space (a key §2.4 or F79 names that the
 *       registry lacks is a transcription error, not an empty set);
 *   (3) every kind whose owner class is neither NONE nor INHERITED (C11:2864-2866 exempts both), and
 *       whose cell §2.4 does not mark unregistered, resolves to at least one key;
 *   (4) every wildcard or brace pattern is well formed, and every F79 class is an `OwnerClass`.
 * `widgets.module.ts` calls it from `onModuleInit` through `authority/contract-bindings.ts` (IR-TAB-1).
 */
export const assertOwnerClassesResolve = (): void => {
  const problems: string[] = [];
  for (const kind of KINDS) {
    const r = OWNER_KEY_ROWS[kind];
    if (
      !Object.prototype.hasOwnProperty.call(OWNER_CLASS_MEMBERS, r.ownerClass)
    )
      problems.push(
        `${kind}: owner class ${r.ownerClass} is not an OwnerClass`,
      );
    for (const pattern of r.c9)
      if (/[{}*]/.test(pattern) && expandC9Pattern(pattern)[0] === pattern)
        problems.push(`${kind}: malformed key pattern ${pattern}`);
    const keys = RESOLVED_KEYS.get(kind) ?? new Set<CapabilityRefKey>();
    for (const k of keys)
      if (!REGISTERED_KEYS.has(k))
        problems.push(
          `${kind}: ${r.ownerClass} names ${k}, which is not registered in its space`,
        );
    if (!INTENT_OWNED.has(r.ownerClass) && !r.unregistered && keys.size === 0)
      problems.push(`${kind}: ${r.ownerClass} resolves to no registered key`);
  }
  for (const ownerClass of Object.keys(F79_OWNER_CLASS_KEYS))
    if (!Object.prototype.hasOwnProperty.call(OWNER_CLASS_MEMBERS, ownerClass))
      problems.push(`F79: ${ownerClass} is not an OwnerClass`);
  if (problems.length)
    throw new Error(
      `owner classes do not resolve at registry load (§2.4):\n  ${problems.join('\n  ')}`,
    );
};
