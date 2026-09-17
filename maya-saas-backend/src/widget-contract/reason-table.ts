// P-RENDER — the runtime values behind §1.6.7 P9 and P10, and the refusal phrase catalogue.
//
// TRANSCRIBED FROM THE CERTIFIED CONTRACT — hand-written, not generated. There is no emitter for
// this file: the contract states P9's and P10's SHAPES in fenced TypeScript (`envelope.ts:276-292`,
// where both constants are `declare`) but states their CONTENT as prose, so the rows are a
// transcription with a stated rule rather than an extraction.
// Source: docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md §1.6.7 P9/P10 (C11:2486-2511), §3.9 R3.9.3
//         (C11:4897-4905), §3.9's gate table (C11:4718-4734), §1.3 C4 (C11:2302), §4.5.2 L8
//         (C11:5506-5507).
//
// Why a second module rather than a value in `envelope.ts`: `envelope.ts` is the compiled contract
// and declares both constants ambiently, exactly as the contract's own code block does. The runtime
// value lives beside it under its own name, which is the pattern `VERIFICATION_RANK` already
// follows (`declare`d at `envelope.ts:302`, valued in `widgets/authority/ladder.ts`). This file is
// therefore NOT re-exported from `./index`: the barrel already re-exports the ambient declarations,
// and a second `export *` would make both names ambiguous. Consumers import this path directly.
//
// The one rule this file exists to hold: **a refusal is not a failure** (R3.9.3). Every §3.9 code
// and every canonical denial code renders as a neutral statement. There is no `error` severity
// anywhere below — §1.6.7 P9 says so in a comment on the type itself — and `anti-error-lint.spec.ts`
// reads the bytes of this file rather than trusting that sentence.

import type {
  CellState,
  DenialProjection,
  LimitationReason,
  ReasonCode,
} from './envelope';

/**
 * The catalogue version. §1.2 keys a `Phrase` by `WIDGET_PHRASES@<catalogue_version>`; this is the
 * refusal half of that catalogue, which is the half the gate pipeline mints. The body half (Cell
 * labels, narrative slots) belongs to the composer and is not stated here.
 */
export const REFUSAL_PHRASE_CATALOGUE_VERSION = 1;

/**
 * The rendered bytes, by `text_key`. P9: "the rendered text is minted, never authored" — so the
 * text is server-owned, and no caller may pass a string in.
 *
 * Every value is checked against §1.3 C4's label lint, `/ошибк|error|fail|сбо[йя]|недоступн.*попроб/i`,
 * by `rendering/anti-error-lint.spec.ts`. That is not decoration: a refusal that reads like a fault
 * IS a fault to the person holding the phone, whatever severity the JSON carries.
 */
export const REFUSAL_PHRASES: Readonly<Record<string, string>> = Object.freeze({
  // — §3.9 row 1 and §4.5.2 L8 —
  'widget.refusal.expired':
    'Срок действия этой карточки истёк. Откройте актуальную версию.',
  'widget.refusal.superseded':
    'Эта карточка заменена более новой версией. Откройте её.',
  // — §3.9 rows 2, 3, 4 —
  'widget.refusal.unauthenticated':
    'Сессия не распознана. Войдите в приложение и повторите действие.',
  'widget.refusal.principal_mismatch':
    'Эта карточка выпущена для другого профиля. Откройте свою версию.',
  'widget.refusal.tenant_mismatch': 'Эта карточка относится к другой компании.',
  // — §3.9 row 5 —
  'widget.refusal.policy_floor_changed':
    'Правила подтверждения обновились. Откройте актуальную версию карточки.',
  'widget.refusal.needs_second_channel':
    'Нужно подтвердить личность во втором канале, чтобы продолжить.',
  'widget.refusal.handoff_required':
    'Это действие продолжается на отдельном экране.',
  // — §3.9 rows 6, 7 —
  'widget.refusal.insufficient_authority':
    'У этого профиля нет прав на это действие.',
  'widget.refusal.effect_not_admissible':
    'Это действие не предусмотрено для этой карточки.',
  'widget.refusal.booking_confirmation_required':
    'Сначала нужно подтвердить запись.',
  // — §3.9 rows 8, 8-R —
  'widget.refusal.selection_out_of_domain':
    'Выбранный вариант больше не входит в список. Выберите из актуального списка.',
  'widget.refusal.bound_violation': 'Значение выходит за допустимые границы.',
  'widget.refusal.use_secure_surface':
    'Эти данные вводятся на защищённом экране.',
  'widget.refusal.oversize_submission':
    'Отправка слишком большая. Сократите выбор.',
  'widget.refusal.readback_missing': 'Нужно подтвердить зачитанные условия.',
  'widget.refusal.readback_mismatch':
    'Подтверждение относится к другой версии условий.',
  // — §3.9 rows 10, 11 —
  'widget.refusal.intent_divergence':
    'Запрос и карточка ведут к разным действиям. Повторите выбор.',
  'widget.refusal.handle_stale':
    'Данные изменились с момента показа. Откройте актуальную версию.',
  // — §1.3's reason codes, which P10 projects denials onto —
  'widget.limitation.source_unlinked': 'Источник данных ещё не подключён.',
  'widget.limitation.period_not_closed': 'Период ещё не закрыт.',
  'widget.limitation.not_collected': 'Эти данные пока не собраны.',
  'widget.limitation.out_of_scope': 'Эти данные вне выбранной области.',
  'widget.limitation.permission': 'Эти данные закрыты для этого профиля.',
  'widget.limitation.provider_silent': 'Источник пока не отвечает.',
  'widget.limitation.no_owner': 'Для этого запроса пока нет владельца.',
  'widget.limitation.in_progress': 'Расчёт ещё идёт.',
});

/**
 * One `LimitationReason`. Kept as a function so that every row states the same three things in the
 * same order, and so that the default severity is written once — P9: "Its default severity is
 * `limitation`".
 */
function reasonRow(
  reason_code: string,
  text_key: string,
  severity: LimitationReason['severity'] = 'limitation',
): LimitationReason {
  return Object.freeze({ reason_code, severity, text_key });
}

/**
 * P9 — `severity` and `text` are table-derived, never model-authored and never emitter-authored.
 * "Its default severity is `limitation`": `caveat` is used only where the state is genuinely
 * transient (`PENDING`) or where the answer is present but partial.
 *
 * The keys are, exactly (REN-1 holds this):
 *   - every §3.9 refusal code, `unauthenticated` … `handle_stale` and `intent_divergence`;
 *   - every response outcome §4.5.2 L8 and §3.9 rows 1 and 5 name — `EXPIRED`, `SUPERSEDED`,
 *     `NEEDS_SECOND_CHANNEL`, `HANDOFF_REQUIRED`;
 *   - every §1.3 `ReasonCode`, because `DenialProjection.reason_code` is "a
 *     LIMITATION_REASON_TABLE key" and P10(b)'s default names `PROVIDER_SILENT`.
 *
 * `SUPERSEDED` is one row and not two: §4.5.2 L8's outcome and §1.3's reason code are the same
 * word for the same fact, and a second row would let the two drift apart.
 */
const REASON_ROWS: Readonly<Record<string, LimitationReason>> = Object.freeze({
  // Response outcomes (L8; §3.9 rows 1 and 5). An outcome is not an error type: L8 says so.
  EXPIRED: reasonRow('EXPIRED', 'widget.refusal.expired'),
  SUPERSEDED: reasonRow('SUPERSEDED', 'widget.refusal.superseded'),
  NEEDS_SECOND_CHANNEL: reasonRow(
    'NEEDS_SECOND_CHANNEL',
    'widget.refusal.needs_second_channel',
  ),
  HANDOFF_REQUIRED: reasonRow(
    'HANDOFF_REQUIRED',
    'widget.refusal.handoff_required',
  ),

  // §3.9 refusal codes, in the table's own row order.
  unauthenticated: reasonRow(
    'unauthenticated',
    'widget.refusal.unauthenticated',
  ),
  widget_principal_mismatch: reasonRow(
    'widget_principal_mismatch',
    'widget.refusal.principal_mismatch',
  ),
  tenant_mismatch: reasonRow(
    'tenant_mismatch',
    'widget.refusal.tenant_mismatch',
  ),
  policy_floor_changed: reasonRow(
    'policy_floor_changed',
    'widget.refusal.policy_floor_changed',
  ),
  needs_second_channel: reasonRow(
    'needs_second_channel',
    'widget.refusal.needs_second_channel',
  ),
  handoff_required: reasonRow(
    'handoff_required',
    'widget.refusal.handoff_required',
  ),
  insufficient_authority: reasonRow(
    'insufficient_authority',
    'widget.refusal.insufficient_authority',
  ),
  effect_not_admissible: reasonRow(
    'effect_not_admissible',
    'widget.refusal.effect_not_admissible',
  ),
  booking_confirmation_required: reasonRow(
    'booking_confirmation_required',
    'widget.refusal.booking_confirmation_required',
  ),
  selection_out_of_domain: reasonRow(
    'selection_out_of_domain',
    'widget.refusal.selection_out_of_domain',
  ),
  bound_violation: reasonRow(
    'bound_violation',
    'widget.refusal.bound_violation',
  ),
  use_secure_surface: reasonRow(
    'use_secure_surface',
    'widget.refusal.use_secure_surface',
  ),
  oversize_submission: reasonRow(
    'oversize_submission',
    'widget.refusal.oversize_submission',
  ),
  readback_missing: reasonRow(
    'readback_missing',
    'widget.refusal.readback_missing',
  ),
  readback_mismatch: reasonRow(
    'readback_mismatch',
    'widget.refusal.readback_mismatch',
  ),
  intent_divergence: reasonRow(
    'intent_divergence',
    'widget.refusal.intent_divergence',
  ),
  handle_stale: reasonRow('handle_stale', 'widget.refusal.handle_stale'),

  // §1.3's reason codes. `SUPERSEDED` is above.
  SOURCE_UNLINKED: reasonRow(
    'SOURCE_UNLINKED',
    'widget.limitation.source_unlinked',
  ),
  PERIOD_NOT_CLOSED: reasonRow(
    'PERIOD_NOT_CLOSED',
    'widget.limitation.period_not_closed',
    'caveat',
  ),
  NOT_COLLECTED: reasonRow('NOT_COLLECTED', 'widget.limitation.not_collected'),
  OUT_OF_SCOPE: reasonRow('OUT_OF_SCOPE', 'widget.limitation.out_of_scope'),
  PERMISSION: reasonRow('PERMISSION', 'widget.limitation.permission'),
  PROVIDER_SILENT: reasonRow(
    'PROVIDER_SILENT',
    'widget.limitation.provider_silent',
  ),
  NO_OWNER: reasonRow('NO_OWNER', 'widget.limitation.no_owner'),
  IN_PROGRESS: reasonRow(
    'IN_PROGRESS',
    'widget.limitation.in_progress',
    'caveat',
  ),
});

/**
 * P10(b) — "at runtime, an unmapped code projects to `state: 'UNAVAILABLE'`, `reason_code:
 * 'PROVIDER_SILENT'` and a `limitation`-severity `Limitation`, so a new upstream code degrades to
 * an honest unknown rather than to a red box."
 *
 * Stated as a value rather than inline in the lookup so that a mutant can neutralise it and be
 * seen doing so.
 */
export const UNMAPPED_DENIAL_PROJECTION: DenialProjection = Object.freeze({
  cell_state: 'UNAVAILABLE',
  reason_code: 'PROVIDER_SILENT',
  limitation_severity: 'limitation',
});

/**
 * The projection families. P10 requires a row for each of the **118 distinct** `c9Deny('…')` codes
 * under `src/orchestration/`; it does not require 118 distinct projections, and inventing 118 would
 * be inventing meaning the contract does not carry. So the codes are grouped by what the denial
 * says about the CELL, and the rule for each group is written down where a reviewer can disagree
 * with it. `denial-projection.ratchet.spec.ts` holds the totality; the grouping is the judgement.
 *
 * No group projects to `KNOWN`: a denial is by construction not a measured answer. `CellState` has
 * no failure member at all, which is P10's "never a failure state" in the type system.
 */
const PROJECTION_FAMILIES: readonly {
  readonly cell_state: CellState;
  readonly reason_code: ReasonCode;
  readonly limitation_severity: LimitationReason['severity'];
  readonly why: string;
  readonly codes: readonly string[];
}[] = [
  {
    // R3.9.3 names five of these by name as "policy fences, not faults".
    cell_state: 'UNAVAILABLE',
    reason_code: 'PERMISSION',
    limitation_severity: 'limitation',
    why: 'a fence: the caller may not have this, and saying so is the answer',
    codes: [
      'agent_context_domain',
      'bi_read_only',
      'binding_tenant',
      'event_principal',
      'paid_allowance_absent',
      'paid_capability_not_activated',
      'policy_owner_required',
      'policy_requires_supported_reader',
      'read_capability_exposure',
      'reference_is_not_access',
      'result_action',
      'result_capability',
      'route_domain_budget',
      'run_authority',
      'source_admission_required',
      'source_reader_authority',
      'source_requires_supported_reader',
      'step_capability_mode',
      'step_fenced',
      'step_scope',
      'tool_requires_registered_domain',
      'use_secure_surface',
      'work_capability_mode',
      'work_fenced',
      'work_scope',
    ],
  },
  {
    cell_state: 'UNAVAILABLE',
    reason_code: 'SUPERSEDED',
    limitation_severity: 'limitation',
    why: 'the answer existed and is no longer current: expiry, staleness, a race',
    codes: [
      'assignment_mismatch',
      'binding_conflict',
      'cancel_conflict',
      'cancel_races_dispatched_work',
      'event_expired',
      'event_validity',
      'idempotency_conflict',
      'price_allowance_expired',
      'price_expired',
      'proposal_budget_changed',
      'proposal_validity_expanded',
      'request_event_mismatch',
      'review_conflict',
      'review_snapshot',
      'review_stale',
      'run_expired_or_terminal',
      'run_retention_expired',
      'settlement_conflict',
      'source_changed',
      'source_expired',
      'source_retention_before_validity',
      'source_validity_expanded',
    ],
  },
  {
    cell_state: 'NOT_MEASURED',
    reason_code: 'NO_OWNER',
    limitation_severity: 'limitation',
    why: 'nothing canonical is registered for this — §1.6.7 P2 territory',
    codes: [
      'capability_not_registered',
      'connector_reference_required',
      'input_contract_version',
      'model_release_version_required',
      'no_action_payload',
      'owner_draft_adapter_unavailable',
      'registry_version_unavailable',
      'unmapped_catalog_tool',
      'unregistered_model_task',
      'unregistered_objective',
      'unregistered_skill_bundle',
      'valuation_policy_reference',
    ],
  },
  {
    cell_state: 'UNAVAILABLE',
    reason_code: 'SOURCE_UNLINKED',
    limitation_severity: 'limitation',
    why: 'the source is named but not bound, published or resolvable',
    codes: [
      'context_fact_source_unavailable',
      'context_handle_unqualified',
      'duplicate_option',
      'duplicate_report_preference',
      'duplicate_source_reference',
      'empty_source_reference',
      'invalid_dependency',
      'source_missing',
      'source_not_published',
      'source_qualification',
      'source_subject',
      'source_url',
      'source_url_scheme',
      'unknown_requires_binding',
    ],
  },
  {
    cell_state: 'PENDING',
    reason_code: 'IN_PROGRESS',
    limitation_severity: 'caveat',
    why: 'in flight: an answer is expected, so §1.3 gives it PENDING/IN_PROGRESS',
    codes: [
      'assignment_unavailable',
      'opportunity_unavailable',
      'selected_opportunity',
      'work_not_dispatched',
    ],
  },
  {
    cell_state: 'NOT_MEASURED',
    reason_code: 'NOT_COLLECTED',
    limitation_severity: 'caveat',
    why: 'the evidence or the basis for the number was never collected',
    codes: [
      'completeness_count',
      'context_metric_code',
      'false_completeness',
      'measured_without_evidence',
      'missingness_required',
      'ungrounded_finding',
      'unpriced_work_basis',
      'unqualified_result_evidence',
      'unverified_cost_basis',
      'unverified_usage',
    ],
  },
  {
    cell_state: 'UNAVAILABLE',
    reason_code: 'OUT_OF_SCOPE',
    limitation_severity: 'limitation',
    why: 'the request is outside the shape, bounds or vocabulary the owner accepts',
    codes: [
      'alternatives',
      'array_bounds',
      'boolean',
      'enum',
      'event_encoding',
      'event_receipt',
      'event_signature',
      'exposure_cost_basis',
      'exposure_discount_basis',
      'instant',
      'integer',
      'money_overflow',
      'object_required',
      'payload_bounds',
      'price_denominator',
      'price_manifest_digest',
      'price_manifest_encoding',
      'price_manifest_unrecognized',
      'result_recommendation',
      'reviewed_plan_required',
      'single_branch_profile',
      'single_recommendation',
      'skill_bundle_bounds',
      'solo_profile_branches',
      'step_bounds',
      'step_contract',
      'step_fields',
      'step_order',
      'string',
      'table',
      'unknown_field',
    ],
  },
];

/**
 * P10 — "`C9_DENIAL_PROJECTION` maps each `c9Deny(...)` code to `{ cell_state, reason_code,
 * limitation_severity }`". Built from the families above so that the mapping and its reasons cannot
 * be edited apart.
 */
const DENIAL_PROJECTION_BY_CODE: Readonly<Record<string, DenialProjection>> =
  Object.freeze(
    Object.fromEntries(
      PROJECTION_FAMILIES.flatMap((f) =>
        f.codes.map((code) => [
          code,
          Object.freeze({
            cell_state: f.cell_state,
            reason_code: f.reason_code,
            limitation_severity: f.limitation_severity,
          }) satisfies DenialProjection,
        ]),
      ),
    ),
  );

/** The families, for the ratchet and for anyone auditing the grouping judgement. */
export const C9_DENIAL_FAMILIES = PROJECTION_FAMILIES;

/**
 * The two constants leave under the contract's own names, so that every import site reads the
 * contract's vocabulary — but their local bindings above are named differently ON PURPOSE.
 *
 * `scripts/widget-contract-check.mjs` check 5 holds "every identifier is declared in exactly one
 * module" over `src/widget-contract/*.ts`, and `envelope.ts:280,:290` already DECLARE both names
 * (ambiently, exactly as the contract's own §1.6.7 code block does). A second top-level `const` of
 * the same name in this directory is a second declaration of the identifier, and the check is right
 * to say so. This module does not re-declare the identifier; it supplies the value the ambient
 * declaration has no way to carry, and hands it out under the declared name.
 *
 * That leaves one real hazard, written down rather than papered over: `./index` re-exports
 * `envelope.ts`, so `import { LIMITATION_REASON_TABLE } from '../widget-contract'` resolves to the
 * ambient declaration and is `undefined` at run time. **Import this module by path.** IR-REN-3 asks
 * the integrator to close the hazard for good — either by admitting the pair in check 5's `ADMITTED`
 * map (the way F6a's `subjectCapability` pair is admitted) and re-exporting this module from the
 * barrel, or by dropping the two `declare const`s from `envelope.ts` through `postprocess.mjs`.
 * Both are edits to integrator-only files, so neither is made here (D-18).
 */
export { REASON_ROWS as LIMITATION_REASON_TABLE };
export { DENIAL_PROJECTION_BY_CODE as C9_DENIAL_PROJECTION };
