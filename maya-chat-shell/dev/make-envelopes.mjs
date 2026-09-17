#!/usr/bin/env node
// K5 — the independent H7 envelope corpus (SHELL-PLAN v2.1 §1.1 dev/, §2.7 step 10b; D11, V2-2, V2-10).
//
// The fixtures the renderer, the view projection and the H7 parity checks run against are minted
// HERE, and hashed with the BACKEND's own canonicaliser plus node:crypto — never with the shell's
// port in src/integrity/h7.ts. The canonicaliser is the source file itself
// (maya-saas-backend/src/action-engine/action-engine.identity.ts), transpiled in memory by the
// backend's TypeScript and evaluated in this process, so the bytes that hash are the minter's bytes
// at this HEAD and no compiled binary of unknown age is trusted.
//
// Locale is an input (R7-E6): the canonicaliser sorts keys with default-locale localeCompare, and
// Node honours LANG. So the reference run is pinned to LANG=LC_ALL=en_US.UTF-8 and re-run under
// ru_RU, et_EE and lt_LT; every fixture whose canonical bytes or body_hash change is recorded in
// locale-matrix.json. The corpus is split by a collation precheck — every object's key order under
// ru-RU, en-US, et-EE and lt-LT — into h7/invariant/** (P1 pass/fail everywhere) and h7/divergent/**
// (P1 pass/fail in en-US only; elsewhere R7-E6 evidence).
//
// Every random value (intent tokens: 24 random bytes = 32 base64url chars, V2-10; seals, proof
// hashes, tenant ids, widget ids) lives in index.json's `randoms` table and is reused on
// regeneration, so a re-run is byte-identical and `--check` is meaningful.
//
//   node dev/make-envelopes.mjs              regenerate dev/fixtures/envelopes/** (reusing randoms)
//   node dev/make-envelopes.mjs --check      regenerate into os.tmpdir() and fail on any byte of drift
//   node dev/make-envelopes.mjs --fresh      mint new random values (changes every token)
//
// Every exit code is the process's own; nothing is piped.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SH = path.resolve(HERE, '..');
export const BE = path.resolve(SH, '..', 'maya-saas-backend');
export const OUT = path.join(SH, 'dev', 'fixtures', 'envelopes');
export const REFERENCE_LANG = 'en_US.UTF-8';
export const MATRIX_LANGS = ['ru_RU.UTF-8', 'et_EE.UTF-8', 'lt_LT.UTF-8'];
export const COLLATION_LOCALES = ['ru-RU', 'en-US', 'et-EE', 'lt-LT'];
/** The instant verdicts are computed at. Valid fixtures expire in 2099; expired ones before this. */
export const NOW = '2026-09-17T09:05:00.000Z';
const ISSUED = '2026-09-17T09:00:00.000Z';
const AS_OF = '2026-09-17T08:55:00.000Z';
const FAR = '2099-12-31T23:59:59.000Z';
const PAST = '2026-09-17T09:01:30.000Z';
const PROBE = ['y', 'j', 'z', 't', 'a', 'Z'];

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const clone = (v) => JSON.parse(JSON.stringify(v));

// ── the backend canonicaliser, from source ─────────────────────────────────────────────────────

/** Transpile and evaluate maya-saas-backend/src/action-engine/action-engine.identity.ts in this process. */
export function loadBackendCanonicaliser() {
  const req = createRequire(import.meta.url);
  const ts = req(path.join(BE, 'node_modules', 'typescript'));
  const dir = path.join(BE, 'src', 'action-engine');
  const cache = new Map();
  const sources = {};
  const load = (name) => {
    if (cache.has(name)) return cache.get(name).exports;
    const file = path.join(dir, `${name}.ts`);
    const source = fs.readFileSync(file, 'utf8');
    sources[path.relative(path.resolve(SH, '..'), file)] = sha256(source);
    const js = ts.transpileModule(source, {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const mod = { exports: {} };
    cache.set(name, mod);
    const localRequire = (spec) => {
      if (spec === 'node:crypto' || spec === 'crypto') return req('node:crypto');
      if (spec.startsWith('./')) return load(spec.slice(2));
      throw new Error(`backend canonicaliser: unexpected import "${spec}"`);
    };
    vm.compileFunction(js, ['exports', 'require', 'module', '__filename', '__dirname'], { filename: file })(mod.exports, localRequire, mod, file, dir);
    return mod.exports;
  };
  const identity = load('action-engine.identity');
  if (typeof identity.stableActionJson !== 'function') throw new Error('action-engine.identity.ts exports no stableActionJson');
  return { stableActionJson: identity.stableActionJson, sources, typescript: ts.version };
}

// ── H1, assembled independently of src/integrity/h7.ts ─────────────────────────────────────────

/** WC §1.9 H1: the ten terms. The intent token is the only member removed; render contributes its tier alone. */
export function h1Terms(env) {
  return {
    contract: env.contract,
    kind: env.kind,
    body_version: env.body_version,
    body: env.body,
    cell_index_digest: env.integrity.cell_index_digest,
    provenance: env.provenance,
    limitations: env.limitations,
    intents: env.intents.map((intent) => {
      const { intent_token: _token, ...rest } = intent;
      return rest;
    }),
    presentation: env.presentation,
    render_tier: env.render.render_tier,
  };
}

export const canonicalOf = (canon, env) => canon.stableActionJson(h1Terms(env));
export const bodyHashOf = (canon, env) => sha256(canonicalOf(canon, env));

/** The verdict a correct H7 reaches, computed with the backend canonicaliser and Date. */
export function expectedVerdict(canon, env, now = NOW) {
  let hash = null;
  try {
    hash = bodyHashOf(canon, env);
  } catch {
    hash = null;
  }
  if (hash === null || hash !== env.integrity?.body_hash) return 'body_mismatch';
  const expires = Date.parse(env.lifecycle?.expires_at);
  if (!Number.isFinite(expires) || Date.parse(now) >= expires) return 'expired';
  return 'valid';
}

/** Every object in the hashed terms whose key order differs between the four matrix locales. */
export function collationDivergence(value) {
  const collators = COLLATION_LOCALES.map((l) => [l, new Intl.Collator(l)]);
  const hits = [];
  const walk = (v, pointer) => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${pointer}/${i}`));
    if (v === null || typeof v !== 'object') return;
    const keys = Object.keys(v);
    if (keys.length > 1) {
      const orders = collators.map(([l, c]) => [l, [...keys].sort((a, b) => c.compare(a, b)).join('\u0000')]);
      const reference = orders.find(([l]) => l === 'en-US')[1];
      const differ = orders.filter(([, o]) => o !== reference).map(([l]) => l);
      if (differ.length) hits.push({ pointer: pointer || '/', locales: differ, keys });
    }
    for (const [k, x] of Object.entries(v)) walk(x, `${pointer}/${k}`);
  };
  walk(value, '');
  return hits;
}

// ── random values, persisted ───────────────────────────────────────────────────────────────────

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function ulidAt(iso) {
  let t = Date.parse(iso);
  let time = '';
  for (let i = 0; i < 10; i += 1) {
    time = B32[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const r = randomBytes(16);
  let rand = '';
  for (let i = 0; i < 16; i += 1) rand += B32[r[i] % 32];
  return time + rand;
}

function randomTable(prior) {
  const table = { ...prior };
  const used = new Set();
  const take = (label, fresh) => {
    used.add(label);
    if (!(label in table)) table[label] = fresh();
    return table[label];
  };
  return {
    used,
    snapshot: () => Object.fromEntries(Object.keys(table).filter((k) => used.has(k)).sort().map((k) => [k, table[k]])),
    scoped: (id) => ({
      // ≤ 24 random bytes: 32 base64url characters, inside the contract's ≤ 34-byte token (V2-10).
      token: (l) => take(`${id}:token:${l}`, () => randomBytes(24).toString('base64url')),
      hex: (l) => take(`${id}:hex:${l}`, () => randomBytes(32).toString('hex')),
      uuid: (l) => take(`${id}:uuid:${l}`, () => randomUUID()),
      ulid: (l) => take(`${id}:ulid:${l}`, () => ulidAt(ISSUED)),
    }),
  };
}

// ── leaves ─────────────────────────────────────────────────────────────────────────────────────

const phrase = (key, rendered) => ({ phrase_key: key, rendered });
const narrative = (id, rendered) => ({ narrative_template_id: id, narrative_template_version: 1, slots: {}, rendered });
function cell(label, value, state = 'KNOWN', reason = null, next = null) {
  const known = state === 'KNOWN';
  return {
    state,
    value: known || state === 'PARTIAL' ? value : null,
    label,
    reason_code: known ? null : reason ?? 'NOT_COLLECTED',
    fact_ref: null,
    as_of: known ? AS_OF : null,
    evidence_refs: [],
    next_intent_ref: next,
  };
}
const unknown = (label, state, reason, next = null) => cell(label, null, state, reason, next);
function measure(key, unit, value, formatted, label, basis, opts = {}) {
  return {
    ...cell(label, value, opts.state ?? 'KNOWN', opts.reason ?? null, opts.next ?? null),
    key,
    unit,
    basis_key: null,
    basis,
    currency: unit === 'RUB' ? 'RUB' : null,
    formatted,
    comparison: opts.comparison ?? null,
  };
}
const usable = () => cell('Доступно', true);
const option = (id, label, intentRef, extra = {}) => ({
  option_id: id,
  label: cell(label, label),
  sublabel: null,
  badges: [],
  measures: [],
  media: null,
  intent_ref: intentRef,
  enabled: usable(),
  ...extra,
});

// ── intents ────────────────────────────────────────────────────────────────────────────────────

const selection = (domain) => ({
  fields: [{ name: 'selection', required: true, kind: 'enum', domain_ref: domain, selection_min: 1, selection_max: 1 }],
  max_total_bytes: 256,
  free_input_justification: null,
});
const route = (r, param = null) => ({ class: 's', ref: { route: r, param } });
const detail = (key) => ({ class: 'detail', ref: key });
const cap = (space, key) => ({ space, key });

function intent(R, ref, o) {
  const none = o.effect === 'NONE';
  return {
    intent_ref: ref,
    intent_token: none ? null : R.token(ref),
    role: o.role,
    label: o.label,
    utterance_preview: o.preview ?? o.label,
    speech_aliases: o.aliases ?? [o.label.toLowerCase()],
    ordinal: o.ordinal ?? null,
    priority: o.priority ?? 1,
    effect: o.effect,
    capability: o.capability ?? null,
    handoff_capability_ref: o.handoff ?? null,
    target: o.target ?? null,
    input_schema: o.input_schema ?? null,
    verification_floor: o.floor ?? 'ANONYMOUS',
    confirmation: o.confirmation ?? null,
    authority_hint: { emphasis: o.role === 'primary' ? 'primary' : 'secondary', disabled_because: o.disabled_because ?? null },
    enabled: o.enabled ?? usable(),
    expires_at: FAR,
    single_use: o.single_use ?? true,
  };
}
/** F60: NONE with a null token on RICH_INTERACTIVE, CONTROL carrying control.widget.dismiss elsewhere. */
const escapeIntent = (R, ref, tier, label = 'Закрыть') =>
  intent(R, ref, {
    role: 'escape',
    label,
    effect: tier === 'RICH_INTERACTIVE' ? 'NONE' : 'CONTROL',
    capability: tier === 'RICH_INTERACTIVE' ? null : cap('CONTROL', 'control.widget.dismiss'),
    priority: 0,
    aliases: ['отмена', 'стоп', 'закрыть'],
    single_use: false,
  });
const confirmation = (R, extra = {}) => ({
  risk_tier: 'medium_write',
  reversible: cell('можно отменить', true),
  audience_size: null,
  requires_explicit_confirm_step: true,
  requires_readback: false,
  readback_ref: null,
  readback_text: null,
  idempotency_key: R.hex('idempotency'),
  approval_policy: 'none',
  ...extra,
});

// ── the per-kind tables the minter reads (independent of src/renderer/kinds.ts) ────────────────

const ROLE_HINT = {
  CHOICE: (b) => (b.select === 'single' ? 'radiogroup' : 'listbox'),
  SERVICE_SELECTOR: (b) => (b.select === 'single' ? 'radiogroup' : 'listbox'),
  STAFF_SELECTOR: () => 'radiogroup',
  TIME_SLOT_SELECTOR: () => 'listbox',
  BOOKING_CONFIRMATION: () => 'region',
  SCHEDULE: () => 'grid',
  CLIENT_LIST: () => 'table',
  METRIC: () => 'group',
  CHART: (_b, tier) => (tier === 'TEXT_ONLY' ? 'table' : 'img'),
  REPORT: () => 'document',
  STRATEGY_OPTIONS: () => 'radiogroup',
  APPROVAL: () => 'region',
  PROGRESS: () => 'progressbar',
  LIMITATION: () => 'status',
  SOURCE_STATUS: () => 'status',
  SETTINGS_DRAFT: () => 'region',
  FORM: () => 'form',
  CONSENT_STATE: () => 'region',
  IDENTITY_BINDING: () => 'region',
  PAYMENT_HANDOFF: () => 'region',
  MEDIA_PREVIEW: () => 'img',
  ARTIFACT: () => 'link',
};
const LIVE_REGION = {
  CHOICE: 'off', SERVICE_SELECTOR: 'off', STAFF_SELECTOR: 'off', TIME_SLOT_SELECTOR: 'polite', BOOKING_CONFIRMATION: 'polite',
  SCHEDULE: 'polite', CLIENT_LIST: 'polite', METRIC: 'off', CHART: 'off', REPORT: 'off', STRATEGY_OPTIONS: 'off', APPROVAL: 'polite',
  PROGRESS: 'polite', LIMITATION: null, SOURCE_STATUS: 'polite', SETTINGS_DRAFT: 'polite', FORM: 'polite', CONSENT_STATE: 'polite',
  IDENTITY_BINDING: 'polite', PAYMENT_HANDOFF: 'polite', MEDIA_PREVIEW: 'off', ARTIFACT: 'off',
};
/** WC §2.6 "Interactive paths". A `?row_intents` suffix keeps only rows the table's row_intents names. */
export const INTERACTIVE_PATHS = {
  CHOICE: ['options[].option_id', 'more_intent'],
  SERVICE_SELECTOR: ['options[].option_id', 'more_intent'],
  STAFF_SELECTOR: ['options[].option_id', 'any_staff_option.option_id', 'more_intent'],
  TIME_SLOT_SELECTOR: ['groups[].slots[].slot_ref', 'more_intent', 'widen_window_intent', 'none_fit_intent'],
  BOOKING_CONFIRMATION: ['commit_intent', 'amend_intents[]', 'dismiss_intent'],
  SCHEDULE: ['entries[].entry_ref', 'detail_intent'],
  CLIENT_LIST: ['table.rows[].row_key?row_intents', 'bulk_intents[].intent_ref'],
  METRIC: ['compare_intent', 'drill_intent'],
  CHART: ['drill_intent', 'export_intent'],
  REPORT: ['fullscreen_intent', 'export_intent', 'sections[].table.rows[].row_key'],
  STRATEGY_OPTIONS: ['alternatives[].option_id', 'no_action_option.select_intent'],
  APPROVAL: ['approve_intent', 'reject_intent', 'detail_intent'],
  PROGRESS: ['cancel_intent', 'steps[].state.next_intent_ref'],
  LIMITATION: ['remedy_intents[]'],
  SOURCE_STATUS: ['sources[].reconnect_intent'],
  SETTINGS_DRAFT: ['apply_intent', 'discard_intent', 'editor_handoff_intent'],
  FORM: ['fields[].field_key', 'submit_intent', 'discard_intent', 'editor_handoff_intent'],
  CONSENT_STATE: ['change_handoff_intent'],
  IDENTITY_BINDING: ['bindings[].manage_handoff_intent'],
  PAYMENT_HANDOFF: ['commit_intent', 'continue_intent', 'dismiss_intent'],
  MEDIA_PREVIEW: ['regenerate_intent', 'fullscreen_intent'],
  ARTIFACT: ['fetch_intent', 'regenerate_intent'],
};
/** WC §4.8.2 accessible_name_suffix, keyed `${ref.k}:${role|*}`. */
export const NAME_SUFFIX = {
  SERVICE_SELECTOR: { 'option:*': { base: 'element', pointers: ['duration', 'price'] } },
  STAFF_SELECTOR: { 'option:*': { base: 'element', pointers: ['nearest_availability'] } },
  CLIENT_LIST: { 'intent:primary': { base: 'body', pointers: ['bulk_intents[⟨entry whose intent handle is ref.id⟩].audience_size'] } },
  APPROVAL: { 'intent:primary': { base: 'body', pointers: ['audience_size', 'risk_tier', 'reversible'] } },
  ARTIFACT: { 'intent:primary': { base: 'body', pointers: ['filename', 'format', 'size_bytes'] } },
};

function evalPath(body, spec) {
  const [p, filter] = spec.split('?');
  let current = [body];
  for (const seg of p.split('.')) {
    const many = seg.endsWith('[]');
    const key = many ? seg.slice(0, -2) : seg;
    const next = [];
    for (const v of current) {
      const x = v?.[key];
      if (x === null || x === undefined) continue;
      if (many) {
        if (Array.isArray(x)) next.push(...x);
      } else next.push(x);
    }
    current = next;
  }
  if (filter === 'row_intents') return current.filter((id) => body.table?.row_intents?.[id] !== undefined);
  return current;
}

/** WC §4.8 A-0: produced ++ every emitted intent not already produced, in emitted order, escape last. */
export function deriveReadingOrder(kind, body, intents) {
  const emittedRefs = new Set(intents.map((i) => i.intent_ref));
  const produced = [];
  for (const spec of INTERACTIVE_PATHS[kind]) {
    const k = /option_id$/.test(spec) ? 'option' : /field_key$/.test(spec) ? 'field' : /row_key(\?|$)/.test(spec) ? 'row' : /entry_ref$/.test(spec) ? 'entry' : /slot_ref$/.test(spec) ? 'slot' : 'intent';
    for (const id of evalPath(body, spec)) {
      if (typeof id !== 'string') continue;
      if (k === 'intent' && !emittedRefs.has(id)) continue;
      produced.push({ k, id });
    }
  }
  const producedKeys = new Set(produced.map((r) => `${r.k}:${r.id}`));
  const rest = intents.filter((i) => !producedKeys.has(`intent:${i.intent_ref}`));
  const appended = [...rest.filter((i) => i.role !== 'escape'), ...rest.filter((i) => i.role === 'escape')];
  return [...produced, ...appended.map((i) => ({ k: 'intent', id: i.intent_ref }))];
}

const mintedLabel = (v) => (v === null || v === undefined ? null : typeof v.formatted === 'string' ? v.formatted : typeof v.rendered === 'string' ? v.rendered : v.label);

function tables(body) {
  if (body.table) return [body.table];
  if (body.table_equivalent) return [body.table_equivalent];
  if (Array.isArray(body.sections)) return body.sections.map((s) => s.table).filter(Boolean);
  return [];
}

/** WC §4.8.1 A-2: nameSourceOf(ref).label + (suffix pointers ? ', ' + renderSuffix : ''). */
export function composeNames(kind, body, intents, order) {
  const names = {};
  for (const ref of order) {
    let label;
    let el;
    let role = null;
    switch (ref.k) {
      case 'intent':
        el = intents.find((i) => i.intent_ref === ref.id);
        label = el.label;
        role = el.role;
        break;
      case 'field':
        el = body.fields.find((f) => f.field_key === ref.id);
        label = el.label.rendered;
        break;
      case 'option':
        el = [...(body.options ?? []), ...(body.any_staff_option ? [body.any_staff_option] : []), ...(body.alternatives ?? [])].find((o) => o.option_id === ref.id);
        label = (el.label ?? el.title).label;
        break;
      case 'slot':
        el = body.groups.flatMap((g) => g.slots).find((s) => s.slot_ref === ref.id);
        label = el.start.label;
        break;
      case 'entry':
        el = body.entries.find((e) => e.entry_ref === ref.id);
        label = el.title.label;
        break;
      case 'row': {
        const table = tables(body).find((t) => t.rows.some((r) => r.row_key === ref.id));
        const row = table.rows.find((r) => r.row_key === ref.id);
        el = { table, row };
        label = row.cells[table.columns.find((c) => c.is_row_header).key].label;
        break;
      }
      case 'section':
        el = body.sections.find((s) => s.section_id === ref.id);
        label = el.heading.rendered;
        break;
      default:
        throw new Error(`unknown ref kind ${ref.k}`);
    }
    const table = NAME_SUFFIX[kind] ?? {};
    const suffix = ref.k === 'intent' ? table[`intent:${role}`] ?? table['intent:*'] : table[`${ref.k}:*`];
    const parts = [];
    for (const pointer of suffix?.pointers ?? []) {
      let value;
      if (pointer.startsWith('bulk_intents[')) value = body.bulk_intents.find((b) => b.intent_ref === ref.id)?.audience_size;
      else value = suffix.base === 'element' ? el[pointer] : body[pointer];
      const minted = mintedLabel(value);
      if (minted !== null) parts.push(minted);
    }
    names[`${ref.k}:${ref.id}`] = parts.length ? `${label}, ${parts.join(', ')}` : label;
  }
  return names;
}

// ── the envelope ───────────────────────────────────────────────────────────────────────────────

function envelope(R, spec) {
  const tier = spec.tier ?? 'RICH_INTERACTIVE';
  const order = deriveReadingOrder(spec.kind, spec.body, spec.intents);
  const live = LIVE_REGION[spec.kind] ?? (spec.body.severity === 'blocking' ? 'assertive' : 'polite');
  const completeness = { status: 'COMPLETE', requestedScopeHash: R.hex('scope'), returnedCount: 1, totalCount: 1, hasMore: false, cursorRef: null, truncated: false, reasonCodes: [] };
  return {
    contract: 'maya.widget.envelope/1',
    widget_id: R.ulid('widget'),
    kind: spec.kind,
    body_version: 1,
    tenant_id: R.uuid('tenant'),
    correlation: { run_id: null, turn_id: null, message_id: null, agent_id: null, parent_widget_id: null, step_index: null, step_total: null, trace_id: R.hex('trace').slice(0, 32) },
    source: { from: 'capability_envelope', capability: spec.capability, capability_version: 'v1', fact_index: 0 },
    origin: { trigger: 'user_turn', emitter: 'capability_read', moment_key: null, proactive_provenance: null },
    authority: { verification_level: 'SESSION_VERIFIED', pii_class: spec.pii ?? 'none', data_scope: { masked_fields: spec.masked ?? [] } },
    body: spec.body,
    intents: spec.intents,
    provenance: {
      source_capability: spec.capability,
      capability_version: 'v1',
      projector_id: `projector.${spec.kind.toLowerCase()}`,
      source_kind: 'capability_read',
      facts_used: [],
      facts_origin: [],
      facts_digest: R.hex('facts'),
      completeness,
      completeness_envelope_hash: R.hex('completeness'),
      evidence_refs: [],
      confidence: 'high',
      authorship: { body_values: 'server_formatter', body_phrases: 'server_catalogue', narrative: 'none', narrative_template_id: null, narrative_template_version: null, model_contribution: 'none', model_contribution_ref: null },
    },
    limitations: spec.limitations ?? [],
    lifecycle: {
      freshness_class: 'scenario',
      state: 'LIVE',
      issued_at: ISSUED,
      expires_at: FAR,
      flow_ttl_s: null,
      input_lock: spec.inputLock ?? 'none',
      on_expiry: spec.inputLock && spec.inputLock !== 'none' ? 're_resolve' : 'collapse_to_summary',
      supersedes_widget_id: null,
      superseded_by_widget_id: null,
      delivery: { delivery_state: 'live', answered_at: null, answering_channel: null, action_receipt_ref: null },
      historised_form: 'summary_bubble',
      timeline_placement: 'chronological',
      dedupe_key: R.hex('dedupe').slice(0, 24),
      retention_sec: 86400,
      delivery_channel: 'pwa',
    },
    presentation: {
      presentation_mode: 'client',
      density: spec.density ?? 'CARD',
      text_equivalent: {
        headline: spec.text.headline,
        body: spec.text.body,
        itemized: spec.text.itemized ?? [],
        completeness_sentence: spec.text.completeness ?? null,
        unknowns_sentence: spec.text.unknowns ?? null,
      },
      speech: null,
      a11y: {
        role_hint: ROLE_HINT[spec.kind](spec.body, tier),
        label: spec.text.headline,
        description: spec.text.body,
        reading_order: order,
        live_region: live,
        accessible_names: composeNames(spec.kind, spec.body, spec.intents, order),
      },
      fullscreen_detail: spec.fullscreen ?? null,
    },
    render: {
      contract: 'maya.render.receipt/1',
      profile_id: 'pwa.v1',
      profile_version: 1,
      render_tier: tier,
      intents_minted: spec.intents.length,
      intents_emitted: spec.intents.length,
      intents_withheld: [],
      body_reductions: [],
      text_equivalent_is_canonical: tier === 'TEXT_ONLY',
      escalation: null,
      degraded_at: ISSUED,
    },
    integrity: {
      body_hash: '',
      cell_index_digest: R.hex('cell-index'),
      envelope_seal: R.hex('seal'),
      seal_key_version: 1,
      principal_proof_hash: R.hex('principal'),
      approval_echo: null,
      policy_context_echo: null,
    },
  };
}

// ── the twenty-two kinds ───────────────────────────────────────────────────────────────────────

const SPECS = {
  CHOICE: (R, tier = 'RICH_INTERACTIVE') => ({
    kind: 'CHOICE',
    tier,
    capability: 'catalog.services.read',
    body: {
      prompt: phrase('choice.prompt.visit_goal', 'Что вы хотите сделать?'),
      select: 'single',
      min_select: 1,
      max_select: 1,
      options: [
        option('o-cut', 'Стрижка', 'i1'),
        option('o-beard', 'Оформление бороды', 'i1'),
        option('o-both', 'Стрижка и борода', 'i1', { enabled: unknown('Сейчас недоступно: мастер не принимает', 'UNAVAILABLE', 'PERMISSION') }),
      ],
      shown_count: 3,
      total_count: 3,
      more_intent: 'i2',
    },
    intents: [
      intent(R, 'i1', { role: 'primary', label: 'Выбрать', effect: 'REFINE', capability: cap('C9', 'catalog.services.read'), input_schema: selection('choice.visit_goal') }),
      intent(R, 'i2', { role: 'more', label: 'Показать ещё', effect: 'REFINE', capability: cap('C9', 'catalog.services.read') }),
      escapeIntent(R, 'i9', tier),
    ],
    inputLock: 'soft',
    text: {
      headline: 'Что вы хотите сделать?',
      body: 'Выберите один вариант: стрижка, оформление бороды или стрижка и борода.',
      itemized: ['Стрижка', 'Оформление бороды', 'Стрижка и борода — сейчас недоступно'],
      unknowns: 'Вариант «Стрижка и борода» сейчас недоступен.',
    },
  }),

  SERVICE_SELECTOR: (R) => ({
    kind: 'SERVICE_SELECTOR',
    capability: 'catalog.services.read',
    body: {
      prompt: phrase('service.prompt', 'Выберите услугу'),
      category_path: [phrase('category.hair', 'Стрижки и борода')],
      select: 'single',
      options: [
        {
          ...option('svc-cut', 'Мужская стрижка', 'i1'),
          service_ref: 'svc.cut',
          duration: measure('service.duration', 'minutes', 60, '60 мин', 'Длительность', 'по прайсу салона'),
          price: measure('service.price', 'RUB', 1500, '1 500 ₽', 'Цена', 'прайс салона на 17 сентября'),
          requires_consultation: cell('без консультации', false),
          combinable_with: ['svc.beard'],
        },
        {
          ...option('svc-beard', 'Оформление бороды', 'i1'),
          service_ref: 'svc.beard',
          duration: measure('service.duration', 'minutes', 40, '40 мин', 'Длительность', 'по прайсу салона'),
          price: measure('service.price', 'RUB', 900, '900 ₽', 'Цена', 'прайс салона на 17 сентября'),
          requires_consultation: cell('без консультации', false),
          combinable_with: ['svc.cut'],
        },
        {
          ...option('svc-camo', 'Камуфляж седины', 'i1'),
          service_ref: 'svc.camo',
          duration: measure('service.duration', 'minutes', 30, '30 мин', 'Длительность', 'по прайсу салона'),
          price: measure('service.price', 'RUB', null, 'цена уточняется', 'Цена уточняется у мастера', 'прайс салона на 17 сентября', { state: 'NOT_MEASURED', reason: 'NOT_COLLECTED' }),
          requires_consultation: cell('нужна консультация', true),
          combinable_with: [],
        },
      ],
      total_preview: null,
      shown_count: 3,
      total_count: 5,
      more_intent: 'i2',
    },
    intents: [
      intent(R, 'i1', { role: 'primary', label: 'Выбрать услугу', effect: 'REFINE', capability: cap('C9', 'catalog.services.read'), input_schema: selection('service.catalogue') }),
      intent(R, 'i2', { role: 'more', label: 'Все услуги', effect: 'REFINE', capability: cap('C9', 'catalog.services.read') }),
    ],
    text: {
      headline: 'Выберите услугу',
      body: 'Мужская стрижка — 60 мин, 1 500 ₽. Оформление бороды — 40 мин, 900 ₽. Камуфляж седины — 30 мин, цена уточняется.',
      itemized: ['Мужская стрижка, 60 мин, 1 500 ₽', 'Оформление бороды, 40 мин, 900 ₽', 'Камуфляж седины, 30 мин, цена уточняется у мастера'],
      completeness: 'Показаны 3 услуги из 5.',
      unknowns: 'Цена камуфляжа седины уточняется у мастера.',
    },
    fullscreen: { route_key: 'fs.catalogue', reason: 'exceeds_chat_density' },
  }),

  STAFF_SELECTOR: (R) => ({
    kind: 'STAFF_SELECTOR',
    capability: 'catalog.staff.read',
    body: {
      prompt: phrase('staff.prompt', 'Выберите мастера'),
      for_service_refs: ['svc.cut'],
      options: [
        {
          ...option('st-ilya', 'Илья', 'i1'),
          staff_ref: 'staff.ilya',
          role_label: cell('Старший мастер', 'Старший мастер'),
          nearest_availability: measure('staff.next_slot', 'datetime', '2026-09-18T07:00:00.000Z', 'завтра в 10:00', 'Ближайшее время', 'расписание мастера'),
          rating: measure('staff.rating', 'ratio', 4.9, '4,9', 'Рейтинг', 'отзывы клиентов'),
        },
        {
          ...option('st-anna', 'Анна', 'i1'),
          staff_ref: 'staff.anna',
          role_label: cell('Мастер', 'Мастер'),
          nearest_availability: measure('staff.next_slot', 'datetime', null, 'время уточняется', 'Ближайшее время не известно', 'расписание мастера', { state: 'PENDING', reason: 'IN_PROGRESS' }),
          rating: null,
        },
      ],
      any_staff_option: option('st-any', 'Любой мастер', 'i1'),
      shown_count: 2,
      total_count: 2,
      more_intent: null,
    },
    intents: [intent(R, 'i1', { role: 'primary', label: 'Выбрать мастера', effect: 'REFINE', capability: cap('C9', 'catalog.staff.read'), input_schema: selection('staff.for_service') })],
    text: {
      headline: 'Выберите мастера',
      body: 'Илья — старший мастер, ближайшее время завтра в 10:00. Анна — мастер, ближайшее время уточняется. Или любой мастер.',
      itemized: ['Илья, старший мастер, завтра в 10:00', 'Анна, мастер, время уточняется', 'Любой мастер'],
      unknowns: 'Ближайшее время Анны уточняется.',
    },
  }),

  TIME_SLOT_SELECTOR: (R) => {
    const slot = (ref, start, formatted, availability) => ({
      slot_ref: ref,
      start: measure('slot.start', 'datetime', start, formatted, formatted, 'расписание салона'),
      duration: measure('slot.duration', 'minutes', 60, '60 мин', 'Длительность', 'прайс салона'),
      staff_ref: 'staff.ilya',
      price: null,
      availability,
      intent_ref: 'i1',
    });
    return {
      kind: 'TIME_SLOT_SELECTOR',
      capability: 'booking.availability.read',
      body: {
        prompt: phrase('slot.prompt', 'Выберите время'),
        timezone: 'Europe/Moscow',
        window: { from: '2026-09-18T06:00:00.000Z', to: '2026-09-19T18:00:00.000Z' },
        grouping: 'by_day',
        groups: [
          {
            group_id: 'g-0918',
            label: phrase('slot.day', 'Четверг, 18 сентября'),
            slots: [
              slot('s-0918-1000', '2026-09-18T07:00:00.000Z', '10:00', cell('свободно', 'FREE')),
              slot('s-0918-1100', '2026-09-18T08:00:00.000Z', '11:00', cell('занято', 'TAKEN')),
              slot('s-0918-1200', '2026-09-18T09:00:00.000Z', '12:00', unknown('неизвестно: источник не ответил', 'UNAVAILABLE', 'PROVIDER_SILENT')),
            ],
          },
          { group_id: 'g-0919', label: phrase('slot.day', 'Пятница, 19 сентября'), slots: [slot('s-0919-1500', '2026-09-19T12:00:00.000Z', '15:00', cell('свободно', 'FREE'))] },
        ],
        shown_count: 4,
        total_count: null,
        more_intent: 'i2',
        widen_window_intent: 'i3',
        none_fit_intent: 'i4',
      },
      intents: [
        intent(R, 'i1', { role: 'primary', label: 'Записаться на выбранное время', effect: 'DRAFT', capability: cap('AE', 'appointments.own.create'), input_schema: selection('slots.window'), floor: 'BOUND_CLIENT' }),
        intent(R, 'i2', { role: 'more', label: 'Показать ещё время', effect: 'REFINE', capability: cap('C9', 'booking.availability.read') }),
        intent(R, 'i3', { role: 'secondary', label: 'Расширить период', effect: 'REFINE', capability: cap('C9', 'booking.availability.read') }),
        intent(R, 'i4', { role: 'remedy', label: 'Ничего не подходит', effect: 'REFINE', capability: cap('C9', 'booking.availability.read'), priority: 0 }),
        escapeIntent(R, 'i9', 'RICH_INTERACTIVE'),
      ],
      inputLock: 'soft',
      text: {
        headline: 'Выберите время',
        body: 'Четверг, 18 сентября: 10:00 свободно, 11:00 занято, 12:00 неизвестно. Пятница, 19 сентября: 15:00 свободно.',
        itemized: ['Четверг, 18 сентября: 10:00, 11:00 (занято), 12:00 (неизвестно)', 'Пятница, 19 сентября: 15:00'],
        completeness: 'Показаны 4 варианта времени.',
        unknowns: 'Доступность в 12:00 неизвестна: источник не ответил.',
      },
      fullscreen: { route_key: 'fs.calendar', reason: 'exceeds_chat_density' },
    };
  },

  BOOKING_CONFIRMATION: (R) => ({
    kind: 'BOOKING_CONFIRMATION',
    capability: 'appointments.own.create',
    body: {
      confirmation_subject: 'create',
      draft_ref: 'draft-booking-1',
      appointment_ref: null,
      lines: [
        { label: phrase('booking.line.service', 'Услуга'), detail: cell('Мужская стрижка', 'Мужская стрижка'), measures: [measure('service.price', 'RUB', 1500, '1 500 ₽', 'Цена', 'прайс салона')] },
        { label: phrase('booking.line.staff', 'Мастер'), detail: cell('Илья', 'Илья'), measures: [] },
      ],
      when: measure('booking.when', 'datetime', '2026-09-18T07:00:00.000Z', '18 сентября, 10:00', 'Время записи', 'расписание салона'),
      when_previous: null,
      staff_label: cell('Илья', 'Илья'),
      duration_total: measure('booking.duration', 'minutes', 60, '60 мин', 'Длительность', 'прайс салона'),
      price_total: measure('booking.price', 'RUB', 1500, '1 500 ₽', 'Итого', 'прайс салона'),
      price_delta: null,
      refund_preview: null,
      loyalty_applied: measure('loyalty.cashback', 'RUB', null, 'после визита', 'Кешбэк будет начислен после визита', 'программа лояльности', { state: 'PENDING', reason: 'IN_PROGRESS' }),
      policy_notices: [phrase('policy.cancel_window', 'Бесплатная отмена — не позднее чем за 3 часа.')],
      commit_intent: 'i1',
      amend_intents: ['i2', 'i3'],
      dismiss_intent: 'i9',
    },
    intents: [
      intent(R, 'i1', { role: 'primary', label: 'Подтвердить запись', effect: 'COMMIT', capability: cap('AE', 'appointments.own.create'), floor: 'SESSION_VERIFIED', confirmation: confirmation(R) }),
      intent(R, 'i2', { role: 'secondary', label: 'Изменить время', effect: 'REFINE', capability: cap('C9', 'booking.availability.read') }),
      intent(R, 'i3', { role: 'secondary', label: 'Выбрать другого мастера', effect: 'REFINE', capability: cap('C9', 'catalog.staff.read') }),
      escapeIntent(R, 'i9', 'RICH_INTERACTIVE'),
    ],
    inputLock: 'soft',
    text: {
      headline: 'Запись к Илье на мужскую стрижку, 18 сентября, 10:00',
      body: 'Мужская стрижка у Ильи, 18 сентября в 10:00, 60 минут, 1 500 ₽. Бесплатная отмена — не позднее чем за 3 часа.',
      itemized: ['Услуга: мужская стрижка, 1 500 ₽', 'Мастер: Илья', 'Итого: 1 500 ₽, 60 мин'],
      unknowns: 'Кешбэк будет начислен после визита.',
    },
    fullscreen: { route_key: 'fs.booking', reason: 'audit' },
  }),

  SCHEDULE: (R) => ({
    kind: 'SCHEDULE',
    capability: 'staff.schedule.read',
    masked: ['/entries/1/title'],
    body: {
      range: { from: '2026-09-18T07:00:00.000Z', to: '2026-09-18T10:00:00.000Z' },
      timezone: 'Europe/Moscow',
      lanes: [
        { lane_id: 'l-ilya', label: cell('Илья', 'Илья'), staff_ref: 'staff.ilya' },
        { lane_id: 'l-anna', label: cell('Анна', 'Анна'), staff_ref: 'staff.anna' },
      ],
      buckets: [
        { bucket_id: 'b10', start: '2026-09-18T07:00:00.000Z', end: '2026-09-18T08:00:00.000Z' },
        { bucket_id: 'b11', start: '2026-09-18T08:00:00.000Z', end: '2026-09-18T09:00:00.000Z' },
        { bucket_id: 'b12', start: '2026-09-18T09:00:00.000Z', end: '2026-09-18T10:00:00.000Z' },
      ],
      entries: [
        { entry_ref: 'e-1', lane_id: 'l-ilya', bucket_span: ['b10', 'b10'], title: cell('Мужская стрижка', 'Мужская стрижка'), subtitle: null, state: cell('занято', 'BOOKED'), pii_masked: false, detail_intent: 'i2', move_intent: 'i3', move_targets: ['b11', 'b12'] },
        { entry_ref: 'e-2', lane_id: 'l-ilya', bucket_span: ['b12', 'b12'], title: unknown('Запись клиента (данные скрыты)', 'UNAVAILABLE', 'PERMISSION'), subtitle: null, state: cell('занято', 'BOOKED'), pii_masked: true, detail_intent: 'i2', move_intent: null, move_targets: null },
        { entry_ref: 'e-3', lane_id: 'l-anna', bucket_span: ['b11', 'b11'], title: cell('Перерыв', 'Перерыв'), subtitle: null, state: cell('перерыв', 'BLOCKED'), pii_masked: false, detail_intent: null, move_intent: null, move_targets: null },
      ],
      gaps: [{ lane_id: 'l-anna', bucket_span: ['b10', 'b10'], recoverable: measure('gap.revenue', 'RUB', 1500, '1 500 ₽', 'Можно заполнить окно', 'средний чек салона') }],
      detail_intent: 'i1',
    },
    intents: [
      intent(R, 'i1', { role: 'secondary', label: 'Открыть расписание', effect: 'NAVIGATE', target: detail('fs.calendar') }),
      intent(R, 'i2', { role: 'secondary', label: 'Подробнее о записи', effect: 'REFINE', capability: cap('C9', 'staff.schedule.read'), input_schema: selection('schedule.entries') }),
      intent(R, 'i3', { role: 'secondary', label: 'Перенести запись', effect: 'REFINE', capability: cap('C9', 'appointments.own.reschedule'), input_schema: selection('schedule.move_targets') }),
    ],
    text: {
      headline: 'Расписание на 18 сентября, 10:00–13:00, 2 мастера',
      body: 'Илья: 10:00 мужская стрижка, 12:00 запись клиента. Анна: 11:00 перерыв; окно в 10:00 можно заполнить.',
      itemized: ['Илья: 10:00 — мужская стрижка; 12:00 — занято', 'Анна: 11:00 — перерыв'],
      unknowns: 'Данные одной записи скрыты.',
    },
    fullscreen: { route_key: 'fs.calendar', reason: 'exceeds_chat_density' },
  }),

  CLIENT_LIST: (R, columns = null) => {
    const cols = columns ?? { header: 'name', other: 'last_visit', count: 'visits' };
    return {
      kind: 'CLIENT_LIST',
      capability: 'clients.segment.read',
      pii: 'client_identified',
      body: {
        segment_label: phrase('segment.lapsed', 'Клиенты без визита больше 60 дней'),
        segment_ref: 'seg-lapsed-60',
        table: {
          caption: phrase('segment.lapsed', 'Клиенты без визита больше 60 дней'),
          columns: [
            { key: cols.header, label: phrase('col.client', 'Клиент'), type: 'text', sensitivity: 'pii', is_row_header: true },
            { key: cols.other, label: phrase('col.last_visit', 'Последний визит'), type: 'datetime', sensitivity: 'internal', is_row_header: false },
            { key: cols.count, label: phrase('col.visits', 'Визитов'), type: 'measure', sensitivity: 'internal', is_row_header: false, align: 'end' },
          ],
          rows: [
            { row_key: 'r-1', cells: { [cols.header]: cell('Иван П.', 'Иван П.'), [cols.other]: cell('12 июля', '2026-07-12'), [cols.count]: measure('client.visits', 'count', 7, '7', 'Визитов', 'журнал записей') } },
            { row_key: 'r-2', cells: { [cols.header]: cell('Сергей К.', 'Сергей К.'), [cols.other]: unknown('нет данных о последнем визите', 'NOT_MEASURED', 'NOT_COLLECTED'), [cols.count]: measure('client.visits', 'count', 2, '2', 'Визитов', 'журнал записей') } },
            { row_key: 'r-3', cells: { [cols.header]: cell('Олег В.', 'Олег В.'), [cols.other]: cell('2 июня', '2026-06-02'), [cols.count]: null } },
          ],
          row_intents: { 'r-1': 'i2', 'r-2': 'i2' },
          group_by: null,
        },
        pii_masked: false,
        bulk_intents: [{ intent_ref: 'i1', label: phrase('bulk.invite', 'Пригласить на визит'), audience_size: measure('audience.size', 'count', 42, '42 клиента', 'Получателей', 'сегмент на 17 сентября') }],
        page: { cursor_ref: 'cursor-2', has_more: true },
      },
      intents: [
        intent(R, 'i1', { role: 'primary', label: 'Пригласить на визит', effect: 'REQUEST_APPROVAL', capability: cap('AE', 'b35.confirm'), floor: 'SESSION_VERIFIED', confirmation: confirmation(R, { audience_size: measure('audience.size', 'count', 42, '42 клиента', 'Получателей', 'сегмент на 17 сентября'), approval_policy: 'owner' }) }),
        intent(R, 'i2', { role: 'secondary', label: 'Открыть карточку', effect: 'REFINE', capability: cap('C9', 'clients.dossier.read'), input_schema: selection('segment.rows') }),
      ],
      text: {
        headline: 'Клиенты без визита больше 60 дней: 42',
        body: 'Иван П. — последний визит 12 июля, 7 визитов. Сергей К. — нет данных о последнем визите, 2 визита. Олег В. — 2 июня.',
        itemized: ['Иван П., 12 июля, 7', 'Сергей К., нет данных, 2', 'Олег В., 2 июня'],
        completeness: 'Показаны 3 клиента из 42.',
        unknowns: 'Для одного клиента нет данных о последнем визите.',
      },
      fullscreen: { route_key: 'fs.client-card', reason: 'exceeds_chat_density' },
    };
  },

  METRIC: (R, classI = false) => {
    const compare = intent(R, 'i1', { role: 'secondary', label: 'Сравнить с другим периодом', effect: 'REFINE', capability: cap('C9', 'c7.measurement.read') });
    const drill = intent(R, 'i2', { role: 'secondary', label: 'Подробнее', effect: 'NAVIGATE', target: classI ? { class: 'i', ref: compare.intent_token } : detail('fs.report') });
    return {
      kind: 'METRIC',
      capability: 'c7.measurement.read',
      body: {
        period_label: phrase('period.week', 'Неделя 8–14 сентября'),
        metrics: [
          measure('visits.count', 'count', 64, '64', 'Визиты', 'журнал записей'),
          measure('revenue.net', 'RUB', 98500, '98 500 ₽', 'Выручка', 'касса салона', {
            comparison: { baseline_label: phrase('compare.prev_week', 'к прошлой неделе'), baseline: measure('revenue.net', 'RUB', 91200, '91 200 ₽', 'Выручка прошлой недели', 'касса салона'), delta: 7300, direction: 'up' },
          }),
          measure('retention.rate', 'percent', null, '—', 'Возвращаемость не измерена: период не закрыт', 'CRM салона', { state: 'NOT_MEASURED', reason: 'PERIOD_NOT_CLOSED' }),
        ],
        headline_metric_key: 'revenue.net',
        compare_intent: 'i1',
        drill_intent: 'i2',
      },
      intents: [compare, drill],
      text: {
        headline: 'Выручка за неделю 8–14 сентября: 98 500 ₽',
        body: 'Выручка 98 500 ₽, на 7 300 ₽ больше, чем неделей раньше. Визитов — 64.',
        itemized: ['Выручка: 98 500 ₽ (к прошлой неделе: 91 200 ₽)', 'Визиты: 64', 'Возвращаемость: не измерена'],
        unknowns: 'Возвращаемость не измерена: период не закрыт.',
      },
    };
  },

  CHART: (R) => {
    const day = (key, label, value, formatted, state = 'KNOWN') => ({
      row_key: key,
      cells: {
        day: cell(label, label),
        revenue: state === 'KNOWN' ? measure('revenue.day', 'RUB', value, formatted, 'Выручка', 'касса салона') : measure('revenue.day', 'RUB', null, '—', 'нет данных за среду', 'касса салона', { state, reason: 'PROVIDER_SILENT' }),
      },
    });
    const rows = [day('d-mon', 'Пн', 14000, '14 000 ₽'), day('d-tue', 'Вт', 16500, '16 500 ₽'), day('d-wed', 'Ср', null, '—', 'UNAVAILABLE')];
    return {
      kind: 'CHART',
      capability: 'c8.result.read',
      body: {
        chart_kind: 'line',
        dataset_ref: 'ds-revenue-week',
        projection_ref: 'proj-by-day',
        rows_digest: R.hex('rows-digest'),
        series_digest: R.hex('series-digest'),
        axes: {
          x: { label: phrase('axis.day', 'День'), type: 'category', buckets: [cell('Пн', 'Пн'), cell('Вт', 'Вт'), cell('Ср', 'Ср')] },
          y: { label: phrase('axis.revenue', 'Выручка'), unit: 'RUB' },
        },
        series: [{ series_id: 'ser-revenue', label: cell('Выручка', 'Выручка'), points: rows.map((r) => ({ x: r.cells.day, y: r.cells.revenue })) }],
        table_equivalent: {
          caption: phrase('chart.caption', 'Выручка по дням'),
          columns: [
            { key: 'day', label: phrase('col.day', 'День'), type: 'text', sensitivity: 'public', is_row_header: true },
            { key: 'revenue', label: phrase('col.revenue', 'Выручка'), type: 'measure', sensitivity: 'internal', is_row_header: false, align: 'end' },
          ],
          rows,
          row_intents: null,
          group_by: null,
        },
        gap_policy: 'RENDER_GAP',
        drill_intent: 'i1',
        export_intent: null,
      },
      intents: [intent(R, 'i1', { role: 'secondary', label: 'Подробнее по дням', effect: 'REFINE', capability: cap('C9', 'c8.result.read') })],
      text: {
        headline: 'Выручка по дням: понедельник — 14 000 ₽, вторник — 16 500 ₽',
        body: 'В понедельник выручка 14 000 ₽, во вторник 16 500 ₽; за среду данных нет, на графике разрыв.',
        itemized: ['Пн: 14 000 ₽', 'Вт: 16 500 ₽', 'Ср: нет данных'],
        unknowns: 'За среду данных нет.',
      },
      fullscreen: { route_key: 'fs.report', reason: 'exceeds_chat_density' },
    };
  },

  REPORT: (R) => ({
    kind: 'REPORT',
    capability: 'analytics.business.query',
    density: 'SHEET',
    body: {
      title: phrase('report.title', 'Отчёт за август'),
      period_label: phrase('period.month', 'Август 2026'),
      top_summary: [measure('revenue.month', 'RUB', 412000, '412 000 ₽', 'Выручка', 'касса салона'), measure('expenses.month', 'RUB', 96500, '96 500 ₽', 'Расходы', 'учёт расходов')],
      sections: [
        {
          section_id: 'sec-staff',
          heading: phrase('report.section.staff', 'Выручка по мастерам'),
          depth: 1,
          narrative: narrative('report.revenue_by_staff', 'Больше всего выручки принёс Илья.'),
          table: {
            caption: phrase('report.table.staff', 'Выручка по мастерам'),
            columns: [
              { key: 'staff', label: phrase('col.staff', 'Мастер'), type: 'text', sensitivity: 'internal', is_row_header: true },
              { key: 'shift', label: phrase('col.shift', 'Смена'), type: 'text', sensitivity: 'public', is_row_header: false },
              { key: 'revenue', label: phrase('col.revenue', 'Выручка'), type: 'measure', sensitivity: 'internal', is_row_header: false, align: 'end' },
            ],
            rows: [
              { row_key: 'rs-ilya', cells: { staff: cell('Илья', 'Илья'), shift: cell('дневная', 'day'), revenue: measure('revenue.staff', 'RUB', 210000, '210 000 ₽', 'Выручка', 'касса салона') } },
              { row_key: 'rs-anna', cells: { staff: cell('Анна', 'Анна'), shift: cell('дневная', 'day'), revenue: measure('revenue.staff', 'RUB', 142000, '142 000 ₽', 'Выручка', 'касса салона') } },
              { row_key: 'rs-oleg', cells: { staff: cell('Олег', 'Олег'), shift: cell('вечерняя', 'evening'), revenue: measure('revenue.staff', 'RUB', null, '—', 'выручка ещё считается', 'касса салона', { state: 'PARTIAL', reason: 'PERIOD_NOT_CLOSED' }) } },
            ],
            row_intents: { 'rs-ilya': 'i3', 'rs-anna': 'i3', 'rs-oleg': 'i3' },
            group_by: { key: 'shift', group_labels: { day: phrase('shift.day', 'Дневная смена'), evening: phrase('shift.evening', 'Вечерняя смена') } },
          },
          metrics: [],
        },
        {
          section_id: 'sec-expenses',
          heading: phrase('report.section.expenses', 'Расходы'),
          depth: 2,
          narrative: narrative('report.expenses', 'Основной расход — материалы.'),
          table: null,
          metrics: [measure('expenses.materials', 'RUB', 41000, '41 000 ₽', 'Материалы', 'учёт расходов')],
        },
      ],
      fullscreen_intent: 'i1',
      export_intent: 'i2',
    },
    intents: [
      intent(R, 'i1', { role: 'secondary', label: 'Открыть отчёт целиком', effect: 'NAVIGATE', target: detail('fs.report') }),
      intent(R, 'i2', { role: 'secondary', label: 'Выгрузить отчёт', effect: 'REFINE', capability: cap('C9', 'owner_report.download') }),
      intent(R, 'i3', { role: 'secondary', label: 'Записи мастера', effect: 'REFINE', capability: cap('C9', 'staff.schedule.read'), input_schema: selection('report.staff_rows') }),
    ],
    text: {
      headline: 'Отчёт за август 2026: выручка 412 000 ₽, расходы 96 500 ₽',
      body: 'Выручка за август 412 000 ₽, расходы 96 500 ₽. Больше всего выручки принёс Илья. Основной расход — материалы.',
      itemized: ['Илья: 210 000 ₽', 'Анна: 142 000 ₽', 'Олег: выручка ещё считается', 'Материалы: 41 000 ₽'],
      unknowns: 'Выручка Олега ещё считается.',
    },
    fullscreen: { route_key: 'fs.report', reason: 'audit' },
  }),

  STRATEGY_OPTIONS: (R) => ({
    kind: 'STRATEGY_OPTIONS',
    capability: 'c9.no_action',
    body: {
      revision_ref: 'rev-1',
      question: narrative('strategy.question', 'Как вернуть клиентов, которые не приходили больше 60 дней?'),
      alternatives: [
        {
          option_id: 'alt-invite',
          title: cell('Разослать приглашение', 'Разослать приглашение'),
          reasoning: narrative('strategy.reason.invite', 'Приглашение напоминает о салоне без скидки.'),
          expected_effect: measure('effect.visits', 'count', 6, 'около 6 визитов', 'Ожидаемый эффект', 'история рассылок'),
          risk_tier: cell('низкий риск', 'low_write'),
          reversible: unknown('обратимость не указана источником', 'NOT_MEASURED', 'NOT_COLLECTED'),
          audience_size: measure('audience.size', 'count', 42, '42 клиента', 'Получателей', 'сегмент на 17 сентября'),
          select_intent: 'i1',
        },
        {
          option_id: 'alt-discount',
          title: cell('Скидка 10% на следующий визит', 'Скидка 10% на следующий визит'),
          reasoning: narrative('strategy.reason.discount', 'Скидка сильнее мотивирует, но снижает средний чек.'),
          expected_effect: null,
          risk_tier: cell('средний риск', 'medium_write'),
          reversible: unknown('обратимость не указана источником', 'NOT_MEASURED', 'NOT_COLLECTED'),
          audience_size: measure('audience.size', 'count', 42, '42 клиента', 'Получателей', 'сегмент на 17 сентября'),
          select_intent: 'i1',
        },
      ],
      no_action_option: { title: phrase('strategy.no_action', 'Ничего не делать'), consequence: narrative('strategy.no_action.consequence', 'Часть клиентов может не вернуться.'), select_intent: 'i2' },
      review_state: 'not_an_approval',
      review_disclaimer: phrase('strategy.disclaimer', 'Это варианты, а не одобрение действия.'),
    },
    intents: [
      intent(R, 'i1', { role: 'primary', label: 'Выбрать вариант', effect: 'REFINE', capability: cap('C9', 'c9.revision.select'), input_schema: selection('strategy.alternatives') }),
      intent(R, 'i2', { role: 'secondary', label: 'Ничего не делать', effect: 'REFINE', capability: cap('C9', 'c9.no_action'), priority: 0 }),
    ],
    text: {
      headline: 'Как вернуть клиентов, которые не приходили больше 60 дней?',
      body: 'Два варианта: разослать приглашение (около 6 визитов, низкий риск) или скидка 10% (средний риск). Или ничего не делать.',
      itemized: ['Разослать приглашение: около 6 визитов, низкий риск, 42 клиента', 'Скидка 10%: средний риск, 42 клиента', 'Ничего не делать: часть клиентов может не вернуться'],
      unknowns: 'Обратимость вариантов источник не указал.',
    },
  }),

  APPROVAL: (R) => ({
    kind: 'APPROVAL',
    capability: 'b35.confirm',
    body: {
      approval_ref: 'ap-1',
      subject: cell('Рассылка «Мы скучаем»', 'Рассылка «Мы скучаем»'),
      effect_preview: [
        { label: phrase('approval.channel', 'Канал'), value: cell('Telegram', 'Telegram') },
        { label: phrase('approval.message', 'Сообщение'), value: cell('Приходите на стрижку — ждём вас', 'Приходите на стрижку — ждём вас') },
      ],
      audience_size: measure('audience.size', 'count', 42, '42 клиента', 'Получателей', 'сегмент на 17 сентября'),
      risk_tier: cell('средний риск', 'medium_write'),
      reversible: cell('необратимо: сообщение уйдёт клиентам', false),
      state: cell('ожидает решения', 'PENDING'),
      requested_by_label: cell('Администратор', 'Администратор'),
      expires_at: FAR,
      approve_intent: 'i1',
      reject_intent: 'i2',
      blocked_reason: null,
      detail_intent: 'i3',
    },
    intents: [
      intent(R, 'i1', { role: 'primary', label: 'Одобрить', effect: 'COMMIT', capability: cap('AE', 'b35.confirm'), floor: 'SESSION_VERIFIED', confirmation: confirmation(R, { approval_policy: 'owner', audience_size: measure('audience.size', 'count', 42, '42 клиента', 'Получателей', 'сегмент на 17 сентября') }) }),
      intent(R, 'i2', { role: 'destructive', label: 'Отклонить', effect: 'COMMIT', capability: cap('AE', 'b35.reject'), floor: 'SESSION_VERIFIED', confirmation: confirmation(R, { approval_policy: 'owner' }) }),
      intent(R, 'i3', { role: 'secondary', label: 'Подробнее', effect: 'NAVIGATE', target: detail('fs.team-thread') }),
    ],
    text: {
      headline: 'Рассылка «Мы скучаем» ждёт решения',
      body: 'Сообщение «Приходите на стрижку — ждём вас» уйдёт 42 клиентам в Telegram. Средний риск, необратимо.',
      itemized: ['Канал: Telegram', 'Получателей: 42', 'Риск: средний', 'Необратимо'],
    },
    fullscreen: { route_key: 'fs.team-thread', reason: 'audit' },
  }),

  PROGRESS: (R) => ({
    kind: 'PROGRESS',
    capability: 'owner_report.status',
    limitations: [{ code: 'SOURCE_UNLINKED', text: phrase('limitation.source_unlinked', 'Источник отзывов не подключён.'), severity: 'limitation', affects: ['/steps/2/state'], capability_gap_ref: null }],
    body: {
      run_ref: 'run-1',
      headline: cell('Шаг 2 из 3: собираю отзывы', 'Шаг 2 из 3: собираю отзывы'),
      steps: [
        { step_id: 'st-1', label: phrase('step.schedule', 'Проверить расписание'), state: cell('готово', 'DONE'), receipt_ref: null },
        { step_id: 'st-2', label: phrase('step.reviews', 'Собрать отзывы'), state: cell('выполняется', 'RUNNING'), receipt_ref: null },
        { step_id: 'st-3', label: phrase('step.report', 'Подготовить отчёт'), state: unknown('не начат: источник отзывов не подключён', 'UNAVAILABLE', 'SOURCE_UNLINKED', 'i2'), receipt_ref: null },
      ],
      step_index: 2,
      step_total: 3,
      budget_note: phrase('progress.budget', 'Платные рассуждения отключены.'),
      poll_after_ms: 5000,
      stream_ref: null,
      cancel_intent: 'i1',
    },
    intents: [
      intent(R, 'i1', { role: 'control', label: 'Остановить', effect: 'CONTROL', capability: cap('CONTROL', 'control.run.cancel'), floor: 'BOUND_CLIENT' }),
      intent(R, 'i2', { role: 'remedy', label: 'Подключить источник отзывов', effect: 'HANDOFF', handoff: cap('C9', 'support.contact-admin.request'), target: route('shell.connections') }),
    ],
    text: {
      headline: 'Шаг 2 из 3: собираю отзывы',
      body: 'Расписание проверено, отзывы собираются. Отчёт не начат: источник отзывов не подключён. Платные рассуждения отключены.',
      itemized: ['Проверить расписание — готово', 'Собрать отзывы — выполняется', 'Подготовить отчёт — не начат'],
      unknowns: 'Отчёт не начат: источник отзывов не подключён.',
    },
  }),

  LIMITATION: (R, severity = 'blocking') => ({
    kind: 'LIMITATION',
    capability: 'booking.availability.read',
    body: {
      severity,
      headline: severity === 'blocking' ? phrase('limitation.booking_down', 'Запись сейчас недоступна') : phrase('limitation.partial', 'Часть данных не загружена'),
      detail:
        severity === 'blocking'
          ? phrase('limitation.booking_down.detail', 'Сервис записи не отвечает. Попробуйте позже.')
          : phrase('limitation.partial.detail', 'Отзывы за сентябрь пока не загружены; остальное актуально.'),
      source_limitation_codes: [severity === 'blocking' ? 'PROVIDER_SILENT' : 'NOT_COLLECTED'],
      capability_gap_ref: null,
      remedy_intents: severity === 'blocking' ? ['i1'] : [],
    },
    intents: severity === 'blocking' ? [intent(R, 'i1', { role: 'remedy', label: 'Проверить ещё раз', effect: 'REFINE', capability: cap('C9', 'booking.availability.read'), priority: 0 })] : [],
    text:
      severity === 'blocking'
        ? { headline: 'Запись сейчас недоступна', body: 'Сервис записи не отвечает. Попробуйте позже.' }
        : { headline: 'Часть данных не загружена', body: 'Отзывы за сентябрь пока не загружены; остальное актуально.' },
  }),

  SOURCE_STATUS: (R) => ({
    kind: 'SOURCE_STATUS',
    capability: 'support.integration-status.read',
    body: {
      sources: [
        { source_id: 'src-crm', label: cell('Журнал записей', 'Журнал записей'), state: cell('подключено', 'CONNECTED'), as_of: cell('обновлено 5 минут назад', AS_OF), impact_text: phrase('source.ok', 'Расписание актуально.'), reconnect_intent: null },
        { source_id: 'src-tg', label: cell('Telegram', 'Telegram'), state: cell('не подключено', 'UNLINKED'), as_of: unknown('нет данных об обновлении', 'NOT_MEASURED', 'SOURCE_UNLINKED'), impact_text: phrase('source.tg.impact', 'Напоминания клиентам не отправляются.'), reconnect_intent: 'i1' },
      ],
      overall: cell('работает частично', 'PARTIAL'),
    },
    intents: [intent(R, 'i1', { role: 'handoff', label: 'Подключить Telegram', effect: 'HANDOFF', handoff: cap('C9', 'support.contact-admin.request'), target: route('shell.connections'), priority: 0 })],
    text: {
      headline: 'Источники данных: работает частично',
      body: 'Журнал записей подключён, обновлён 5 минут назад. Telegram не подключён: напоминания клиентам не отправляются.',
      itemized: ['Журнал записей — подключено', 'Telegram — не подключено'],
      unknowns: 'Для Telegram нет данных об обновлении.',
    },
  }),

  SETTINGS_DRAFT: (R) => ({
    kind: 'SETTINGS_DRAFT',
    capability: 'company.business-hours.update',
    body: {
      draft_ref: 'sd-1',
      draft_class: 'settings',
      scope_label: cell('Часы работы салона', 'Часы работы салона'),
      diff: [
        { path: '/hours/sat/close', label: phrase('settings.sat_close', 'Суббота, закрытие'), from: cell('20:00', '20:00'), to: cell('21:00', '21:00'), effect_text: phrase('settings.effect.later', 'Появятся записи до 21:00.'), reversible: cell('можно вернуть', true), bound_ref: null },
        { path: '/hours/sun/open', label: phrase('settings.sun_open', 'Воскресенье, открытие'), from: unknown('не задано', 'NOT_MEASURED', 'NOT_COLLECTED'), to: cell('11:00', '11:00'), effect_text: phrase('settings.effect.sunday', 'Салон начнёт принимать по воскресеньям.'), reversible: cell('можно вернуть', true), bound_ref: null },
      ],
      apply_intent: 'i1',
      discard_intent: 'i9',
      editor_handoff_intent: 'i2',
    },
    intents: [
      intent(R, 'i1', { role: 'primary', label: 'Применить', effect: 'COMMIT', capability: cap('AE', 'company.business-hours.update'), floor: 'SESSION_VERIFIED', confirmation: confirmation(R) }),
      escapeIntent(R, 'i9', 'RICH_INTERACTIVE', 'Отменить черновик'),
      intent(R, 'i2', { role: 'handoff', label: 'Открыть настройки', effect: 'HANDOFF', handoff: cap('AE', 'company.business-hours.update'), target: route('shell.account'), priority: 0 }),
    ],
    text: {
      headline: 'Изменение часов работы: 2 пункта',
      body: 'Суббота: закрытие было в 20:00, станет в 21:00. Воскресенье: открытие не задано, станет в 11:00. Оба изменения можно вернуть.',
      itemized: ['Суббота, закрытие: было 20:00, станет 21:00', 'Воскресенье, открытие: было не задано, станет 11:00'],
    },
    fullscreen: { route_key: 'fs.catalogue', reason: 'exact_configuration' },
  }),

  FORM: (R) => ({
    kind: 'FORM',
    capability: 'cash.declaration.draft',
    limitations: [{ code: 'VALUE_OUT_OF_BOUNDS', text: phrase('limitation.out_of_bounds', 'Сумма больше лимита кассы — проверьте.'), severity: 'limitation', affects: ['/fields/0/current'], capability_gap_ref: null }],
    body: {
      form_ref: 'form-cash-1',
      justification: 'LEGAL_EXACTNESS',
      schema_ref: 'schema.cash_declaration',
      fields: [
        {
          field_key: 'amount',
          label: phrase('form.amount', 'Сумма в кассе'),
          control: 'number',
          required: true,
          help: phrase('form.amount.help', 'Пересчитайте наличные перед вводом.'),
          max_len: null,
          pattern: null,
          options: null,
          current: cell('612 500 ₽', 612500),
          bound: { bound_ref: 'cash.declare#amount', min: measure('bound.min', 'RUB', 0, '0 ₽', 'Минимум', 'лимит кассы'), max: measure('bound.max', 'RUB', 500000, '500 000 ₽', 'Максимум', 'лимит кассы'), max_abs_delta: null, basis: phrase('form.amount.basis', 'Лимит кассы салона — 500 000 ₽.') },
          sensitivity: 'internal',
        },
        { field_key: 'comment', label: phrase('form.comment', 'Комментарий'), control: 'text', required: false, help: null, max_len: 200, pattern: null, options: null, current: unknown('комментарий не заполнен', 'NOT_MEASURED', 'NOT_COLLECTED'), bound: null, sensitivity: 'internal' },
        { field_key: 'shift', label: phrase('form.shift', 'Смена'), control: 'select', required: true, help: null, max_len: null, pattern: null, options: [option('sh-day', 'Дневная', 'i1'), option('sh-evening', 'Вечерняя', 'i1')], current: cell('Дневная', 'day'), bound: null, sensitivity: 'public' },
      ],
      submit_intent: 'i1',
      discard_intent: 'i9',
      editor_handoff_intent: 'i2',
      partial_save: false,
    },
    intents: [
      intent(R, 'i1', {
        role: 'primary',
        label: 'Сохранить черновик',
        effect: 'DRAFT',
        capability: cap('AE', 'cash.declaration.draft'),
        floor: 'BOUND_CLIENT',
        input_schema: { fields: [{ name: 'amount', required: true, kind: 'decimal', bounds: { min: 0, max: 500000, step: 1, unit_ref: 'RUB', bounds_source: 'cash.declare#amount' } }, { name: 'comment', required: false, kind: 'text', max_len: 200, normalizer_ref: 'plain_text' }], max_total_bytes: 1024, free_input_justification: 'LEGAL_EXACTNESS' },
      }),
      escapeIntent(R, 'i9', 'RICH_INTERACTIVE', 'Отменить'),
      intent(R, 'i2', { role: 'handoff', label: 'Открыть полную форму', effect: 'HANDOFF', handoff: cap('AE', 'cash.declaration.draft'), target: route('shell.account'), priority: 0 }),
    ],
    text: {
      headline: 'Декларация кассы за смену',
      body: 'Сумма в кассе 612 500 ₽ — больше лимита 500 000 ₽. Комментарий не заполнен. Смена: дневная.',
      itemized: ['Сумма в кассе: 612 500 ₽', 'Комментарий: не заполнен', 'Смена: дневная'],
      unknowns: 'Комментарий не заполнен.',
    },
    fullscreen: { route_key: 'fs.report', reason: 'exact_configuration' },
  }),

  CONSENT_STATE: (R) => ({
    kind: 'CONSENT_STATE',
    capability: 'consent.register.read',
    body: {
      consent_kind: 'MARKETING',
      subject_label: cell('Вы', 'Вы'),
      decision: cell('разрешено', 'GRANTED'),
      recorded_at: cell('12 августа 2026', '2026-08-12T10:00:00.000Z'),
      recorded_via: cell('приложение салона', 'pwa'),
      scope_text: [phrase('consent.scope', 'Салон может присылать предложения в Telegram.')],
      change_effect_text: [phrase('consent.change', 'Если отозвать согласие, предложения приходить перестанут.')],
      register_ref: 'reg-1',
      change_handoff_intent: 'i1',
      capability_gap_ref: null,
    },
    intents: [
      intent(R, 'i1', { role: 'handoff', label: 'Изменить согласие', effect: 'HANDOFF', handoff: cap('AE', 'consent.marketing.revoke'), target: route('shell.privacy'), floor: 'SESSION_VERIFIED', priority: 0 }),
      escapeIntent(R, 'i9', 'RICH_INTERACTIVE'),
    ],
    text: {
      headline: 'Согласие на предложения: разрешено',
      body: 'Вы разрешили предложения 12 августа 2026 в приложении салона. Салон может присылать предложения в Telegram. Изменить согласие можно в разделе «Приватность».',
      itemized: ['Решение: разрешено', 'Когда: 12 августа 2026', 'Где: приложение салона'],
    },
    fullscreen: { route_key: 'fs.consent', reason: 'audit' },
  }),

  IDENTITY_BINDING: (R) => ({
    kind: 'IDENTITY_BINDING',
    capability: 'identity.channels.read',
    body: {
      subject_label: cell('Ваш аккаунт', 'Ваш аккаунт'),
      bindings: [
        { binding_id: 'b-tg', channel: 'telegram', label: cell('Telegram', 'Telegram'), state: cell('связан', 'LINKED'), since: cell('3 марта 2026', '2026-03-03T10:00:00.000Z'), unlocks_text: [phrase('binding.tg.unlocks', 'Напоминания о записи приходят в Telegram.')], loss_on_unbind_text: [phrase('binding.tg.loss', 'Напоминания перестанут приходить.')], manage_handoff_intent: 'i1' },
        { binding_id: 'b-email', channel: 'email', label: cell('Email', 'Email'), state: cell('не связан', 'UNLINKED'), since: unknown('не подключался', 'NOT_MEASURED', 'NOT_COLLECTED'), unlocks_text: [phrase('binding.email.unlocks', 'Чеки будут приходить на почту.')], loss_on_unbind_text: [], manage_handoff_intent: 'i2' },
      ],
      capability_gap_ref: null,
    },
    intents: [
      intent(R, 'i1', { role: 'handoff', label: 'Управлять Telegram', effect: 'HANDOFF', handoff: cap('AE', 'identity.client.channel.unbind'), target: route('shell.connections'), floor: 'SESSION_VERIFIED' }),
      intent(R, 'i2', { role: 'handoff', label: 'Подключить email', effect: 'HANDOFF', handoff: cap('AE', 'identity.client.channel.bind'), target: route('shell.connections'), floor: 'SESSION_VERIFIED' }),
    ],
    text: {
      headline: 'Связанные каналы: Telegram',
      body: 'Telegram связан с 3 марта 2026: напоминания о записи приходят туда. Email не связан; если подключить, чеки будут приходить на почту.',
      itemized: ['Telegram — связан с 3 марта 2026', 'Email — не связан'],
    },
    fullscreen: { route_key: 'fs.consent', reason: 'exact_configuration' },
  }),

  PAYMENT_HANDOFF: (R) => {
    // An opaque server handle carried by the body and by the NAVIGATE target's param; not an intent token.
    const session = R.hex('session').slice(0, 32);
    return {
      kind: 'PAYMENT_HANDOFF',
      capability: 'gift_certificate.checkout',
      body: {
        order_ref: 'ord-1',
        subject: 'gift_certificate',
        lines: [{ label: phrase('payment.line.certificate', 'Подарочный сертификат'), amount: measure('payment.line', 'RUB', 3000, '3 000 ₽', 'Сумма', 'номинал сертификата') }],
        amount_total: measure('payment.total', 'RUB', 3000, '3 000 ₽', 'Итого', 'номинал сертификата'),
        beneficiary_label: cell('Салон «Мужская Эстетика»', 'Салон «Мужская Эстетика»'),
        acquirer_label: cell('Платёжный сервис салона', 'Платёжный сервис салона'),
        returns_text: phrase('payment.returns', 'Сертификат придёт на ваш email.'),
        policy_notices: [phrase('payment.policy', 'Сертификат действует 12 месяцев.')],
        session: { session_ref: session, expires_at: FAR, resume_widget_id: R.ulid('resume') },
        commit_intent: 'i1',
        continue_intent: 'i2',
        dismiss_intent: 'i9',
        capability_gap_ref: null,
      },
      intents: [
        intent(R, 'i1', { role: 'primary', label: 'Оплатить 3 000 ₽', effect: 'COMMIT', capability: cap('AE', 'gift_certificate.checkout'), floor: 'SESSION_VERIFIED', confirmation: confirmation(R) }),
        intent(R, 'i2', { role: 'secondary', label: 'Продолжить к оплате', effect: 'NAVIGATE', target: route('shell.pay', session) }),
        escapeIntent(R, 'i9', 'RICH_INTERACTIVE'),
      ],
      text: {
        headline: 'Подарочный сертификат на 3 000 ₽',
        body: 'Оплата 3 000 ₽ салону «Мужская Эстетика». Сертификат придёт на ваш email и действует 12 месяцев.',
        itemized: ['Подарочный сертификат: 3 000 ₽', 'Получатель платежа: салон «Мужская Эстетика»'],
      },
      fullscreen: { route_key: 'fs.payment', reason: 'exact_configuration' },
    };
  },

  MEDIA_PREVIEW: (R) => ({
    kind: 'MEDIA_PREVIEW',
    capability: 'cutmatch.generate',
    body: {
      media_ref: 'media-1',
      alt: phrase('media.alt', 'Мужская стрижка «кроп» с чёткой линией у висков.'),
      recipe: {
        requested: cell('Стрижка кроп, фото анфас', 'Стрижка кроп, фото анфас'),
        parameters: [{ label: phrase('media.param.style', 'Стиль'), value: cell('кроп', 'crop') }],
        produced_at: unknown('изображение готовится', 'PENDING', 'IN_PROGRESS'),
        producer_label: cell('Подбор стрижки', 'Подбор стрижки'),
      },
      subject_is_principal: true,
      expires_at: FAR,
      regenerate_intent: 'i1',
      fullscreen_intent: 'i2',
    },
    intents: [
      intent(R, 'i1', { role: 'secondary', label: 'Сгенерировать заново', effect: 'REFINE', capability: cap('C9', 'cutmatch.generate') }),
      intent(R, 'i2', { role: 'secondary', label: 'Открыть изображение', effect: 'NAVIGATE', target: detail('fs.media') }),
    ],
    text: {
      headline: 'Подбор стрижки: кроп',
      body: 'Запрошено: стрижка кроп, фото анфас. Стиль: кроп. Изображение готовится.',
      itemized: ['Запрос: стрижка кроп, фото анфас', 'Стиль: кроп'],
      unknowns: 'Изображение ещё готовится.',
    },
    fullscreen: { route_key: 'fs.media', reason: 'non_textual_medium' },
  }),

  ARTIFACT: (R) => {
    // An opaque server handle carried by the body and by the NAVIGATE target's param; not an intent token.
    const handle = R.hex('artifact').slice(0, 32);
    return {
      kind: 'ARTIFACT',
      capability: 'owner_report.download',
      body: {
        artifact_ref: handle,
        filename: cell('otchet-avgust.pdf', 'otchet-avgust.pdf'),
        format: cell('PDF', 'pdf'),
        size_bytes: measure('file.size', 'count', 184320, '180 КБ', 'Размер', 'файл отчёта'),
        contains_text: phrase('artifact.contains', 'Отчёт о выручке и расходах за август.'),
        contains_pii: cell('без персональных данных', false),
        produced_at: cell('17 сентября, 11:40', AS_OF),
        expires_at: FAR,
        fetch_intent: 'i1',
        regenerate_intent: 'i2',
      },
      intents: [
        intent(R, 'i1', { role: 'primary', label: 'Скачать', effect: 'NAVIGATE', target: route('shell.file', handle) }),
        intent(R, 'i2', { role: 'secondary', label: 'Сформировать заново', effect: 'REFINE', capability: cap('C9', 'owner_report.download') }),
      ],
      text: {
        headline: 'Файл отчёта: otchet-avgust.pdf',
        body: 'PDF, 180 КБ: отчёт о выручке и расходах за август, без персональных данных.',
        itemized: ['otchet-avgust.pdf', 'PDF, 180 КБ', 'Без персональных данных'],
      },
    };
  },
};

// ── the corpus ─────────────────────────────────────────────────────────────────────────────────

const kindId = (kind) => `kind-${kind.toLowerCase().replaceAll('_', '-')}`;

/** Build every fixture: {id, category, env, note}. `seal` computes body_hash with the backend canonicaliser. */
export function buildCorpus(canon, table) {
  const out = [];
  const seal = (env) => {
    // provenance is an H1 term, so its own derived hash is set BEFORE the body hash is taken.
    env.provenance.completeness_envelope_hash = sha256(canon.stableActionJson(env.provenance.completeness));
    env.integrity.body_hash = bodyHashOf(canon, env);
    return env;
  };
  const make = (id, spec) => seal(envelope(table.scoped(id), spec(table.scoped(id))));
  const add = (id, category, env, note) => out.push({ id, category, env, note });

  for (const kind of Object.keys(SPECS)) {
    const id = kind === 'LIMITATION' ? 'kind-limitation-blocking' : kindId(kind);
    add(id, 'kind', make(id, SPECS[kind]), `the ${kind} branch`);
  }
  add('limitation-non-blocking', 'kind', make('limitation-non-blocking', (R) => SPECS.LIMITATION(R, 'limitation')), 'LIMITATION with severity limitation: live region polite');
  add('choice-text-only', 'tier', make('choice-text-only', (R) => SPECS.CHOICE(R, 'TEXT_ONLY')), 'CHOICE fitted at TEXT_ONLY: the escape is CONTROL with a token');

  const booking = (id) => make(id, SPECS.BOOKING_CONFIRMATION);
  {
    const e = make('booking-expired', (R) => ({ ...SPECS.BOOKING_CONFIRMATION(R) }));
    e.lifecycle.expires_at = PAST;
    e.lifecycle.state = 'LIVE';
    add('booking-expired', 'expiry', e, 'expires_at before NOW: expired (lifecycle is not a hash term, so the seal still holds)');
  }
  {
    const e = booking('booking-tampered-body');
    e.body.price_total.formatted = '150 ₽';
    add('booking-tampered-body', 'tamper', e, 'a minted Measure.formatted changed after sealing: body_mismatch');
  }
  {
    const e = booking('booking-token-changed');
    e.intents[0].intent_token = table.scoped('booking-token-changed').token('i1-replaced');
    add('booking-token-changed', 'term-coverage', e, 'an intent_token changed after sealing: valid (stripIntentToken removes it)');
  }
  {
    const e = booking('booking-receipt-pointers-changed');
    e.render.intents_withheld.push({ role: 'more', reason: 'capacity', reachable_via: e.intents[1].intent_token });
    e.render.intents_emitted = e.intents.length;
    add('booking-receipt-pointers-changed', 'term-coverage', e, 'the render receipt changed beyond its tier: valid (the whole receipt is never a term)');
  }
  {
    const e = booking('booking-render-tier-changed');
    e.render.render_tier = 'RICH_CONSTRAINED';
    add('booking-render-tier-changed', 'tamper', e, 'render.render_tier changed after sealing: body_mismatch');
  }
  {
    const e = booking('booking-cell-index-digest-changed');
    e.integrity.cell_index_digest = table.scoped('booking-cell-index-digest-changed').hex('cell-index-replaced');
    add('booking-cell-index-digest-changed', 'tamper', e, 'integrity.cell_index_digest changed after sealing: body_mismatch');
  }
  {
    const e = booking('booking-root-values-changed');
    const R = table.scoped('booking-root-values-changed');
    e.integrity.envelope_seal = R.hex('seal-replaced');
    e.integrity.principal_proof_hash = R.hex('principal-replaced');
    e.tenant_id = R.uuid('tenant-replaced');
    e.widget_id = R.ulid('widget-replaced');
    add('booking-root-values-changed', 'term-coverage', e, 'seal, proof hash, tenant and widget id changed: valid (none is an H1 term)');
  }
  add('metric-class-i-target', 'class-i', make('metric-class-i-target', (R) => SPECS.METRIC(R, true)), "a NAVIGATE whose target is {class:'i', ref: another intent's token}: valid");
  {
    const e = make('metric-class-i-ref-tampered', (R) => SPECS.METRIC(R, true));
    e.intents[1].target.ref = table.scoped('metric-class-i-ref-tampered').token('class-i-replaced');
    add('metric-class-i-ref-tampered', 'tamper', e, "a class-'i' target ref changed after sealing: body_mismatch (class-'i' refs are hash terms, R7-E5)");
  }
  {
    const e = make('schedule-withheld-reduced', SPECS.SCHEDULE);
    e.render.intents_minted = e.intents.length + 1;
    e.render.intents_withheld = [
      { role: 'more', reason: 'capacity', reachable_via: e.intents[0].intent_token },
      { role: 'secondary', reason: 'carrier_limit', reachable_via: 'fs.calendar' },
    ];
    e.render.body_reductions = [{ path: 'entries', reduction: 'paginated', restored_by: e.intents[1].intent_token }];
    add('schedule-withheld-reduced', 'receipt', e, 'withheld intents and a body reduction pointing at an emitted token and a route key: valid');
  }
  {
    const pred = make('slots-superseded-predecessor', SPECS.TIME_SLOT_SELECTOR);
    const succ = make('slots-superseded-successor', SPECS.TIME_SLOT_SELECTOR);
    pred.lifecycle.state = 'SUPERSEDED';
    pred.lifecycle.superseded_by_widget_id = succ.widget_id;
    succ.lifecycle.supersedes_widget_id = pred.widget_id;
    add('slots-superseded-predecessor', 'lifecycle', pred, 'SUPERSEDED, replaced in place by the successor: valid, drawn as static text');
    add('slots-superseded-successor', 'lifecycle', succ, 'supersedes the predecessor: valid');
  }
  {
    const e = make('approval-consumed', SPECS.APPROVAL);
    e.lifecycle.state = 'CONSUMED';
    e.lifecycle.delivery = { delivery_state: 'answered_in_this_channel', answered_at: ISSUED, answering_channel: 'pwa', action_receipt_ref: 'receipt-1' };
    add('approval-consumed', 'lifecycle', e, 'CONSUMED: valid verdict; a terminal item draws no control (FR2)');
  }
  // Deliberately locale-sensitive Record keys (V2-2): table column keys whose order some collations flip.
  add('collation-lt-y-j', 'collation', make('collation-lt-y-j', (R) => SPECS.CLIENT_LIST(R, { header: 'j', other: 'y', count: 'i' })), "column keys i/j/y: Lithuanian collates y between i and j");
  add('collation-et-z-t', 'collation', make('collation-et-z-t', (R) => SPECS.CLIENT_LIST(R, { header: 'z', other: 't', count: 's' })), 'column keys s/t/z: Estonian collates z between s and t');
  add('collation-digits-case', 'collation', make('collation-digits-case', (R) => SPECS.CLIENT_LIST(R, { header: 'Z', other: '10', count: 'a' })), "column keys Z/a/10: integer-like keys serialise in index order in every engine; 'a' before 'Z' in every matrix locale");
  return out;
}

/** The secrets a token-free view must not carry, per fixture (for the view/DOM token searches). */
function secretsOf(env) {
  const tokens = env.intents.map((i) => i.intent_token).filter((t) => typeof t === 'string');
  const classI = env.intents.filter((i) => i.target?.class === 'i').map((i) => i.target.ref);
  const pointers = [...env.render.intents_withheld.map((w) => w.reachable_via), ...env.render.body_reductions.map((r) => r.restored_by)];
  const idempotency = env.intents.map((i) => i.confirmation?.idempotency_key).filter(Boolean);
  return {
    intent_tokens: tokens,
    class_i_refs: classI,
    receipt_pointers: pointers,
    idempotency_keys: idempotency,
    tenant_id: env.tenant_id,
    envelope_seal: env.integrity.envelope_seal,
    principal_proof_hash: env.integrity.principal_proof_hash,
  };
}

/**
 * The members a token-free view copies whole (body, provenance, limitations, presentation) must carry
 * none of the fixture's secrets, or a view test could not tell a leak from the fixture itself.
 */
function assertSecretsOutsideView(fixture) {
  const s = secretsOf(fixture.env);
  const values = [...s.intent_tokens, ...s.class_i_refs, ...s.receipt_pointers.filter((p) => !p.startsWith('fs.')), ...s.idempotency_keys, s.tenant_id, s.envelope_seal, s.principal_proof_hash];
  const copied = JSON.stringify([fixture.env.body, fixture.env.provenance, fixture.env.limitations, fixture.env.presentation]);
  for (const v of values) if (copied.includes(v)) throw new Error(`${fixture.id}: a secret value appears in a member the view copies whole`);
}

const expectedMode = (fixture, verdict) => {
  const { env } = fixture;
  if (verdict !== 'valid' || env.lifecycle.state === 'EXPIRED') return 'frozen_prose';
  if (!['MINTED', 'DELIVERED', 'LIVE'].includes(env.lifecycle.state)) return 'frozen_prose';
  if (['CHART', 'CONSENT_STATE', 'IDENTITY_BINDING', 'PAYMENT_HANDOFF', 'MEDIA_PREVIEW'].includes(env.kind) || env.render.render_tier === 'TEXT_ONLY') return 'prose';
  return 'structured';
};

// ── phases ─────────────────────────────────────────────────────────────────────────────────────

const collationProbe = () => [...PROBE].sort((a, b) => a.localeCompare(b)).join('');
const resolvedLocale = () => new Intl.Collator().resolvedOptions().locale;
const langToTag = (lang) => lang.split('.')[0].replace('_', '-');

function assertLocale(lang) {
  const want = langToTag(lang);
  const got = resolvedLocale();
  if (got !== want) throw new Error(`locale not applied: LANG=${lang} resolved ${got} (want ${want})`);
  for (const l of COLLATION_LOCALES) {
    // ICU resolves a collator to its language when the region adds no tailoring (ru-RU -> ru).
    const r = new Intl.Collator(l).resolvedOptions().locale;
    if (r.split('-')[0] !== l.split('-')[0]) throw new Error(`ICU has no collation data for ${l} (resolved ${r}); the corpus split would be vacuous`);
  }
}

const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

function referencePhase(dir, fresh) {
  assertLocale(REFERENCE_LANG);
  const canon = loadBackendCanonicaliser();
  const priorPath = path.join(OUT, 'index.json');
  const prior = !fresh && fs.existsSync(priorPath) ? JSON.parse(fs.readFileSync(priorPath, 'utf8')).randoms ?? {} : {};
  const table = randomTable(prior);
  const corpus = buildCorpus(canon, table);
  const fixtures = [];
  for (const f of corpus) {
    const divergence = collationDivergence(h1Terms(f.env));
    const group = divergence.length === 0 ? 'invariant' : 'divergent';
    const file = `h7/${group}/${f.id}.json`;
    const verdict = expectedVerdict(canon, f.env);
    assertSecretsOutsideView(f);
    const canonical = canonicalOf(canon, f.env);
    writeJson(path.join(dir, file), f.env);
    fixtures.push({
      id: f.id,
      file,
      group,
      category: f.category,
      kind: f.env.kind,
      tier: f.env.render.render_tier,
      density: f.env.presentation.density,
      lifecycle_state: f.env.lifecycle.state,
      note: f.note,
      expect: { verdict, mode: expectedMode(f, verdict), live_region: f.env.presentation.a11y.live_region },
      reference: { body_hash: sha256(canonical), canonical_bytes: Buffer.byteLength(canonical, 'utf8') },
      collation: divergence,
      secrets: secretsOf(f.env),
    });
  }
  const index = {
    corpus: 'maya.shell.h7.fixtures/1',
    generated_by: 'dev/make-envelopes.mjs',
    hashed_with: 'maya-saas-backend/src/action-engine/action-engine.identity.ts stableActionJson (transpiled from source) + node:crypto sha256',
    reference_lang: REFERENCE_LANG,
    matrix_langs: MATRIX_LANGS,
    collation_locales: COLLATION_LOCALES,
    now: NOW,
    canonicaliser_sources: canon.sources,
    counts: {
      fixtures: fixtures.length,
      invariant: fixtures.filter((f) => f.group === 'invariant').length,
      divergent: fixtures.filter((f) => f.group === 'divergent').length,
      kinds: new Set(fixtures.map((f) => f.kind)).size,
    },
    fixtures,
    randoms: table.snapshot(),
  };
  writeJson(path.join(dir, 'index.json'), index);
  return { resolved: resolvedLocale(), probe: collationProbe(), count: fixtures.length };
}

function matrixPhase(dir, lang) {
  assertLocale(lang);
  const canon = loadBackendCanonicaliser();
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  const perFixture = {};
  for (const f of index.fixtures) {
    const env = JSON.parse(fs.readFileSync(path.join(dir, f.file), 'utf8'));
    const canonical = canonicalOf(canon, env);
    const bodyHash = sha256(canonical);
    perFixture[f.id] = { body_hash: bodyHash, canonical_bytes: Buffer.byteLength(canonical, 'utf8'), equals_reference: bodyHash === f.reference.body_hash, verdict: expectedVerdict(canon, env) };
  }
  return { lang, resolved: resolvedLocale(), probe: collationProbe(), fixtures: perFixture };
}

function runChild(phase, dir, lang, extra = []) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), `--phase=${phase}`, `--dir=${dir}`, `--lang=${lang}`, ...extra], {
    env: { ...process.env, LANG: lang, LC_ALL: lang },
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`${phase} (${lang}) exited ${r.status}:\n${r.stderr}`);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

function listFiles(dir) {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(dir, rel);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(r);
      else out.push(r);
    }
  };
  walk('');
  return out.sort();
}

export function main(argv) {
  const arg = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const phase = arg('phase');
  if (phase === 'reference') {
    console.log(JSON.stringify(referencePhase(arg('dir'), argv.includes('--fresh'))));
    return 0;
  }
  if (phase === 'matrix') {
    console.log(JSON.stringify(matrixPhase(arg('dir'), arg('lang'))));
    return 0;
  }

  const check = argv.includes('--check');
  const dir = check ? fs.mkdtempSync(path.join(os.tmpdir(), 'maya-h7-fixtures-')) : OUT;
  try {
    if (!check) fs.rmSync(path.join(OUT, 'h7'), { recursive: true, force: true });
    const reference = runChild('reference', dir, REFERENCE_LANG, argv.includes('--fresh') ? ['--fresh'] : []);
    const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
    const runs = MATRIX_LANGS.map((lang) => runChild('matrix', dir, lang));
    const matrix = {
      corpus: index.corpus,
      reference: { lang: REFERENCE_LANG, resolved: reference.resolved, probe: reference.probe },
      runs: runs.map((r) => ({
        lang: r.lang,
        resolved: r.resolved,
        probe: r.probe,
        changed: Object.entries(r.fixtures).filter(([, v]) => !v.equals_reference).map(([id]) => id),
        changed_invariant: Object.entries(r.fixtures).filter(([id, v]) => !v.equals_reference && index.fixtures.find((f) => f.id === id).group === 'invariant').map(([id]) => id),
        fixtures: r.fixtures,
      })),
    };
    writeJson(path.join(dir, 'locale-matrix.json'), matrix);
    for (const run of matrix.runs)
      console.log(`matrix ${run.lang}: resolved ${run.resolved} probe ${run.probe}; changed ${run.changed.length} (${run.changed.join(', ') || 'none'}); invariant changed ${run.changed_invariant.length}`);
    console.log(`reference ${REFERENCE_LANG}: resolved ${reference.resolved} probe ${reference.probe}; ${index.counts.fixtures} fixtures (${index.counts.invariant} invariant, ${index.counts.divergent} divergent), ${index.counts.kinds} kinds`);
    if (matrix.runs.some((r) => r.changed_invariant.length > 0)) {
      console.error('an INVARIANT fixture changed under a matrix locale: the collation precheck is wrong');
      return 1;
    }
    if (check) {
      const fresh = listFiles(dir);
      const committed = listFiles(OUT);
      const drift = [];
      for (const f of new Set([...fresh, ...committed])) {
        const a = path.join(dir, f);
        const b = path.join(OUT, f);
        if (!fs.existsSync(a)) drift.push(`${f}: committed but no longer generated`);
        else if (!fs.existsSync(b)) drift.push(`${f}: generated but not committed`);
        else if (Buffer.compare(fs.readFileSync(a), fs.readFileSync(b)) !== 0) drift.push(`${f}: bytes differ`);
      }
      if (drift.length) {
        console.error(`FIXTURE DRIFT (${drift.length}):\n  ${drift.join('\n  ')}`);
        return 1;
      }
      console.log(`check: ${fresh.length} files byte-identical to dev/fixtures/envelopes`);
      return 0;
    }
    console.log(`wrote ${listFiles(OUT).length} files to dev/fixtures/envelopes`);
    return 0;
  } finally {
    if (check) fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main(process.argv.slice(2));
}
