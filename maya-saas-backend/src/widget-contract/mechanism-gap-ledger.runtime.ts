// GENERATED from §A1 of the certified contract and K1's versioned ledger — do not hand-edit.
// Source:     docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md §A1, §0.7 F35, §0.18 F92, §A2.4 (errata EC-5)
//             docs/rebuild/evidence/maya-chat-first-ux/k1/k1-mechanism-gap-ledger.json
// Regenerate: node scripts/widget-contract/emit-ledgers.mjs
// Module:     mechanism-gap-ledger (P-29's own row, P-LEDGER)
//
// `registries.ts` DECLARES `MECHANISM_GAP_LEDGER` and never defines it. This module defines it, under
// a name of its own so the declaration stays where the contract emitter put it. Every row is §A1's,
// cross-read against K1's versioned ledger by the generator; the per-status counts are DERIVED here
// and never transcribed (§A5, F92).
//
// A row's `gap_key` is `MG-` + its `p_ref` — F35's own composition, which spells K1's `MG-P-01`
// where F35's prose range writes `MG-P01`. Read a row through `MECHANISM_GAP_BY_PREF` and the
// spelling never reaches a caller.
//
// `blocking_rules` is derived from every normative paragraph's own Status sentence. F35 (2)/(3)
// is checked in both directions: each clause reaches every named row, and no row carries a clause
// its status sentence does not name.

import type { MechanismGap } from './registries';

/** F35's declared range, read from its own block: `'P-01' … 'P-39'`. */
export const MECHANISM_GAP_PREREQUISITE_FIRST = 1;
export const MECHANISM_GAP_PREREQUISITE_LAST = 39;
/** F92's thirty-nine rows, as a number the start-up assertion can compare the ledger against. */
export const MECHANISM_GAP_DECLARED_ROW_COUNT = 39;

const MECHANISM_GAP_LEDGER_SOURCE: MechanismGap[] = [
  {
    gap_key: 'MG-P-01',
    p_ref: 'P-01',
    component: 'IntentGateway JWT widget route',
    status: '[EXISTS]',
    package: 'K3',
    blocking_rules: [],
  },
  {
    gap_key: 'MG-P-33',
    p_ref: 'P-33',
    component: 'The internal Telegram command ingress',
    status: '[ABSENT]',
    package: 'K14',
    blocking_rules: ['NP-baf9f90d76548a4c'],
  },
  {
    gap_key: 'MG-P-02',
    p_ref: 'P-02',
    component: 'IntentRecord',
    status: '[ABSENT]',
    package: 'K3',
    blocking_rules: [
      'NP-60285de7e4a83ec3',
      'NP-6b44191ce6a0c77e',
      'NP-74e5aa76e447f542',
      'NP-a10e7e6ba2de166d',
      'NP-a766de93521269df',
    ],
  },
  {
    gap_key: 'MG-P-03',
    p_ref: 'P-03',
    component: 'Timeline store',
    status: '[ABSENT]',
    package: 'K3',
    blocking_rules: [],
  },
  {
    gap_key: 'MG-P-04',
    p_ref: 'P-04',
    component: 'Receipt store',
    status: '[ABSENT]',
    package: 'K3+K12',
    blocking_rules: [],
  },
  {
    gap_key: 'MG-P-05',
    p_ref: 'P-05',
    component: 'Emission / receipt store',
    status: '[ABSENT]',
    package: 'K3+K6',
    blocking_rules: [],
  },
  {
    gap_key: 'MG-P-06',
    p_ref: 'P-06',
    component: 'Free-input ledger',
    status: '[ABSENT]',
    package: 'K3',
    blocking_rules: [],
  },
  {
    gap_key: 'MG-P-07',
    p_ref: 'P-07',
    component: 'Capability-gap ledger',
    status: '[ABSENT]',
    package: 'K1',
    blocking_rules: [],
  },
  {
    gap_key: 'MG-P-08',
    p_ref: 'P-08',
    component: 'Server-owned draft store',
    status: '[EXISTS]',
    package: 'K3+K7',
    blocking_rules: [],
  },
  {
    gap_key: 'MG-P-09',
    p_ref: 'P-09',
    component: 'Consent-register read projection',
    status: '[PARTIAL]',
    package: 'K12',
    blocking_rules: [],
  },
  {
    gap_key: 'MG-P-10',
    p_ref: 'P-10',
    component: 'WIDGET_CAPABILITY_POLICY',
    status: '[ABSENT]',
    package: 'K2+K1',
    blocking_rules: [],
  },
  {
    gap_key: 'MG-P-11',
    p_ref: 'P-11',
    component: 'VerificationLevel ladder and verificationFloor()',
    status: '[ABSENT]',
    package: 'K2+K4',
    blocking_rules: [
      'NP-3967577d0093a34f',
      'NP-6764621e5569f2a4',
      'NP-c4f024295af6eaa0',
    ],
  },
  {
    gap_key: 'MG-P-12',
    p_ref: 'P-12',
    component: 'STEP_UP_VERIFIED reachability',
    status: '[ABSENT]',
    package: 'NONE - outside the sixteen',
    blocking_rules: [],
  },
  {
    gap_key: 'MG-P-13',
    p_ref: 'P-13',
    component: 'CHART read facade',
    status: '[ABSENT]',
    package: 'K10',
    blocking_rules: [],
  },
  {
    gap_key: 'MG-P-14',
    p_ref: 'P-14',
    component: 'shell.pay',
    status: '[ABSENT]',
    package: 'K5+K9',
    blocking_rules: [],
  },
  {
    gap_key: 'MG-P-15',
    p_ref: 'P-15',
    component: 'shell.file',
    status: '[ABSENT]',
    package: 'K5+K10',
    blocking_rules: [],
  },
  {
    gap_key: 'MG-P-16',
    p_ref: 'P-16',
    component: 'control.widget.dismiss',
    status: '[EXISTS]',
    package: 'K3+K6',
    blocking_rules: [],
  },
  {
    gap_key: 'MG-P-17',
    p_ref: 'P-17',
    component: 'control.delivery.resolve',
    status: '[ABSENT]',
    package: 'K13',
    blocking_rules: ['NP-7caf6408e9465cd8'],
  },
  {
    gap_key: 'MG-P-34',
    p_ref: 'P-34',
    component: 'The staff marketing-revoke door',
    status: '[ABSENT]',
    package: 'K14',
    blocking_rules: ['NP-673b3fc1ef835229', 'NP-7eba5cf393449863'],
  },
  {
    gap_key: 'MG-P-35',
    p_ref: 'P-35',
    component: 'Step 0 Telegram callback-token carrier',
    status: '[ABSENT]',
    package: 'K14',
    blocking_rules: [],
  },
  {
    gap_key: 'MG-P-36',
    p_ref: 'P-36',
    component: 'Step 0 web-push action carrier',
    status: '[ABSENT]',
    package: 'K13',
    blocking_rules: [],
  },
  {
    gap_key: 'MG-P-37',
    p_ref: 'P-37',
    component: 'Step 0 voice carrier',
    status: '[ABSENT]',
    package: 'K6',
    blocking_rules: [],
  },
  {
    gap_key: 'MG-P-38',
    p_ref: 'P-38',
    component: 'Step 0 SMS/e-mail signed-link carrier',
    status: '[ABSENT]',
    package: 'K6',
    blocking_rules: [],
  },
  {
    gap_key: 'MG-P-39',
    p_ref: 'P-39',
    component: 'The spoken-readback path',
    status: '[ABSENT]',
    package: 'K6',
    blocking_rules: ['NP-a10e7e6ba2de166d'],
  },
  {
    gap_key: 'MG-P-18',
    p_ref: 'P-18',
    component: 'produced_by_intent_token_hash: string \\| null',
    status: '[EXISTS]',
    package: 'K3+K7',
    blocking_rules: [],
  },
  {
    gap_key: 'MG-P-19',
    p_ref: 'P-19',
    component: 'Renderer sandboxing / import-graph allowlist',
    status: '[UNENFORCEABLE-TODAY]',
    package: 'K5+K15',
    blocking_rules: [
      'NP-3967577d0093a34f',
      'NP-6764621e5569f2a4',
      'NP-94ce85517e8bf971',
      'NP-bc82abdc4fcbb88a',
      'NP-c4f024295af6eaa0',
      'NP-e63da67d0864b0ac',
    ],
  },
  {
    gap_key: 'MG-P-20',
    p_ref: 'P-20',
    component: 'Gate 10 refusal criterion',
    status: '[ABSENT]',
    package: 'K3+K14',
    blocking_rules: [],
  },
  {
    gap_key: 'MG-P-21',
    p_ref: 'P-21',
    component: 'GAP-ATTENDANCE-CONFIRM',
    status: '[ABSENT]',
    package: 'K13',
    blocking_rules: [],
  },
  {
    gap_key: 'MG-P-22',
    p_ref: 'P-22',
    component: 'NEVER_CHAT_ACTUATED — the eight reserved names',
    status: '[ABSENT]',
    package: 'K12',
    blocking_rules: ['NP-8ec369d49df7c0bc'],
  },
  {
    gap_key: 'MG-P-23',
    p_ref: 'P-23',
    component:
      'AE_WIDGET_COMMIT_ALLOWLIST + AE_CAPABILITY_GAP_LEDGER, with the start-up assertion set',
    status: '[EXISTS]',
    package: 'K2+K4',
    blocking_rules: [],
  },
  {
    gap_key: 'MG-P-24',
    p_ref: 'P-24',
    component: 'CapabilityRef and the per-effect key-space rule',
    status: '[ABSENT]',
    package: 'K2',
    blocking_rules: [
      'NP-12da373e00c0e596',
      'NP-2ded496dfa94a8a9',
      'NP-910daee079c2fb1a',
      'NP-ea396e0385e57f6f',
    ],
  },
  {
    gap_key: 'MG-P-25',
    p_ref: 'P-25',
    component: 'AE_PROPOSE_PAIRING',
    status: '[EXISTS]',
    package: 'K2+K7',
    blocking_rules: [],
  },
  {
    gap_key: 'MG-P-26',
    p_ref: 'P-26',
    component: "Gate 6's key-space dispatch",
    status: '[EXISTS]',
    package: 'K4',
    blocking_rules: [],
  },
  {
    gap_key: 'MG-P-27',
    p_ref: 'P-27',
    component: 'The controlledFixtureMode === false build assertion',
    status: '[ABSENT]',
    package: 'K3',
    blocking_rules: ['NP-048cb92576ace3ff'],
  },
  {
    gap_key: 'MG-P-28',
    p_ref: 'P-28',
    component: 'The widget ActionSourceType discipline',
    status: '[ABSENT]',
    package: 'K4',
    blocking_rules: ['NP-81e9dcb058c0a1c3'],
  },
  {
    gap_key: 'MG-P-29',
    p_ref: 'P-29',
    component: 'MECHANISM_GAP_LEDGER',
    status: '[ABSENT]',
    package: 'K1',
    blocking_rules: ['NP-da84d6f05a04d484'],
  },
  {
    gap_key: 'MG-P-30',
    p_ref: 'P-30',
    component: "The gateway's retained record fields",
    status: '[EXISTS]',
    package: 'K3',
    blocking_rules: [],
  },
  {
    gap_key: 'MG-P-31',
    p_ref: 'P-31',
    component: 'A11yBlock.accessible_names',
    status: '[ABSENT]',
    package: 'K5',
    blocking_rules: ['NP-94ce85517e8bf971', 'NP-e63da67d0864b0ac'],
  },
  {
    gap_key: 'MG-P-32',
    p_ref: 'P-32',
    component: 'The moment, notification-consent and template catalogues',
    status: '[ABSENT]',
    package: 'K13',
    blocking_rules: ['NP-7caf6408e9465cd8'],
  },
];

/** The prerequisite register, frozen, in K1's order — the order a withdrawal diff is read in. */
export const MECHANISM_GAP_ROWS: readonly Readonly<MechanismGap>[] =
  Object.freeze(
    MECHANISM_GAP_LEDGER_SOURCE.map((row) => {
      Object.freeze(row.blocking_rules);
      return Object.freeze(row);
    }),
  );

/** `MECHANISM_GAP_LEDGER` with a value: keyed by `gap_key`, which is what A2.4 resolves a row under. */
export const MECHANISM_GAP_LEDGER_RUNTIME: Readonly<
  Record<string, Readonly<MechanismGap>>
> = Object.freeze(
  Object.fromEntries(MECHANISM_GAP_ROWS.map((row) => [row.gap_key, row])),
);

/** By `p_ref`, so no caller has to know how `gap_key` is spelled. */
export const MECHANISM_GAP_BY_PREF: ReadonlyMap<
  string,
  Readonly<MechanismGap>
> = new Map(MECHANISM_GAP_ROWS.map((row) => [row.p_ref, row]));

/** F92's build-printed counts, derived from the rows above. Never transcribed (§A5). */
export const MECHANISM_GAP_STATUS_COUNTS: Readonly<
  Record<MechanismGap['status'], number>
> = Object.freeze(
  MECHANISM_GAP_ROWS.reduce<Record<MechanismGap['status'], number>>(
    (counts, row) => {
      counts[row.status] += 1;
      return counts;
    },
    {
      '[ABSENT]': 0,
      '[EXISTS]': 0,
      '[PARTIAL]': 0,
      '[UNENFORCEABLE-TODAY]': 0,
    },
  ),
);

/** F35 (2)/(3)'s clause→row side, derived from the contract Status sentences. */
export const NORMATIVE_PENDING_BINDINGS = Object.freeze([
  Object.freeze({
    clause_id: 'NP-048cb92576ace3ff',
    p_refs: Object.freeze(['P-27']),
  }),
  Object.freeze({
    clause_id: 'NP-12da373e00c0e596',
    p_refs: Object.freeze(['P-24']),
  }),
  Object.freeze({
    clause_id: 'NP-2ded496dfa94a8a9',
    p_refs: Object.freeze(['P-24']),
  }),
  Object.freeze({
    clause_id: 'NP-3967577d0093a34f',
    p_refs: Object.freeze(['P-11', 'P-19']),
  }),
  Object.freeze({
    clause_id: 'NP-60285de7e4a83ec3',
    p_refs: Object.freeze(['P-02']),
  }),
  Object.freeze({
    clause_id: 'NP-673b3fc1ef835229',
    p_refs: Object.freeze(['P-34']),
  }),
  Object.freeze({
    clause_id: 'NP-6764621e5569f2a4',
    p_refs: Object.freeze(['P-11', 'P-19']),
  }),
  Object.freeze({
    clause_id: 'NP-6b44191ce6a0c77e',
    p_refs: Object.freeze(['P-02']),
  }),
  Object.freeze({
    clause_id: 'NP-74e5aa76e447f542',
    p_refs: Object.freeze(['P-02']),
  }),
  Object.freeze({
    clause_id: 'NP-7caf6408e9465cd8',
    p_refs: Object.freeze(['P-17', 'P-32']),
  }),
  Object.freeze({
    clause_id: 'NP-7eba5cf393449863',
    p_refs: Object.freeze(['P-34']),
  }),
  Object.freeze({
    clause_id: 'NP-81e9dcb058c0a1c3',
    p_refs: Object.freeze(['P-28']),
  }),
  Object.freeze({
    clause_id: 'NP-8ec369d49df7c0bc',
    p_refs: Object.freeze(['P-22']),
  }),
  Object.freeze({
    clause_id: 'NP-910daee079c2fb1a',
    p_refs: Object.freeze(['P-24']),
  }),
  Object.freeze({
    clause_id: 'NP-94ce85517e8bf971',
    p_refs: Object.freeze(['P-19', 'P-31']),
  }),
  Object.freeze({
    clause_id: 'NP-a10e7e6ba2de166d',
    p_refs: Object.freeze(['P-02', 'P-39']),
  }),
  Object.freeze({
    clause_id: 'NP-a766de93521269df',
    p_refs: Object.freeze(['P-02']),
  }),
  Object.freeze({
    clause_id: 'NP-baf9f90d76548a4c',
    p_refs: Object.freeze(['P-33']),
  }),
  Object.freeze({
    clause_id: 'NP-bc82abdc4fcbb88a',
    p_refs: Object.freeze(['P-19']),
  }),
  Object.freeze({
    clause_id: 'NP-c4f024295af6eaa0',
    p_refs: Object.freeze(['P-11', 'P-19']),
  }),
  Object.freeze({
    clause_id: 'NP-da84d6f05a04d484',
    p_refs: Object.freeze(['P-29']),
  }),
  Object.freeze({
    clause_id: 'NP-e63da67d0864b0ac',
    p_refs: Object.freeze(['P-19', 'P-31']),
  }),
  Object.freeze({
    clause_id: 'NP-ea396e0385e57f6f',
    p_refs: Object.freeze(['P-24']),
  }),
]);

export const mechanismGapForPRef = (
  pRef: string,
): Readonly<MechanismGap> | undefined => MECHANISM_GAP_BY_PREF.get(pRef);

/**
 * A2.1: a rule whose mechanism is not `[EXISTS]` is NORMATIVE-PENDING, and A2.6 (3) puts
 * `[PARTIAL]` on identical terms. A `p_ref` no row declares answers true — a mechanism nobody
 * registered is not a mechanism that exists.
 */
export const isMechanismNormativePending = (pRef: string): boolean =>
  MECHANISM_GAP_BY_PREF.get(pRef)?.status !== '[EXISTS]';

/** F35's build assertion, one half: the mechanism ledger's key shape. */
export const MECHANISM_GAP_KEY_PREFIX = 'MG-';
