// K5 / S4 — D1, the input side: what the renderer receives carries no token (R-2, R-5; SH-07).
//
//   node --test test/view.tokenfree.test.mjs
//
// For every envelope of S2's corpus (dev/fixtures/envelopes, minted and hashed by the backend's own
// canonicaliser), the SHELL's ingest path — H7 on the full envelope, the vault, `shell/view.ts` — is run
// with a spy RenderFn, and the serialized `RenderInput` is searched for every secret the generator
// recorded: intent tokens, class-'i' refs, receipt pointers (except route keys, which the view keeps as
// keys), idempotency keys, the tenant, the seal and the principal proof hash. The view's structure is
// also held to the allowlist member by member.
//
// Then MUTATIONS: copies of `src/shell/view.ts`, each keeping one thing the allowlist drops, are
// loaded from a temporary directory and put through the same inspection. Every mutant must be caught;
// the unmutated copy must pass. A test that could not see a leak would prove nothing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { render } from '../src/renderer/render.ts';
import { verify } from '../src/integrity/h7.ts';
import { project, secretsOf } from '../src/shell/view.ts';
import { createShellRuntime } from '../src/shell/shell.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SH = path.resolve(HERE, '..');
const FIXTURES = path.join(SH, 'dev', 'fixtures', 'envelopes');
const INDEX = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'index.json'), 'utf8'));
const NOW = Date.parse(INDEX.now);
const ROUTE_KEYS = new Set([
  'shell.root', 'shell.account', 'shell.connections', 'shell.privacy', 'shell.notifications', 'shell.pay', 'shell.file',
  'fs.booking', 'fs.client-card', 'fs.calendar', 'fs.catalogue', 'fs.team-thread', 'fs.report', 'fs.consent', 'fs.payment', 'fs.media',
]);
const A11Y = { reduced_motion: false, forced_colors: false, text_scale: 1, pointer: 'fine', keyboard_only_hint: false, caption_preference: false };

const envelopeOf = (f) => JSON.parse(fs.readFileSync(path.join(FIXTURES, f.file), 'utf8'));
const secretValues = (f) => {
  const s = f.secrets;
  return [
    ...s.intent_tokens,
    ...s.class_i_refs,
    ...s.receipt_pointers.filter((p) => !ROUTE_KEYS.has(p)),
    ...s.idempotency_keys,
    s.tenant_id,
    s.envelope_seal,
    s.principal_proof_hash,
  ];
};

// ── a non-conformant envelope: the contract forbids all of this, the view must still not carry it ──
const PLANTED_TOKEN = 'PLANTEDtokenPLANTEDtokenPLANTED01';
const planted = () => {
  const base = INDEX.fixtures.find((f) => f.id === 'metric-class-i-target');
  const env = envelopeOf(base);
  const token = env.intents.find((i) => i.intent_token).intent_token;
  const classI = env.intents.find((i) => i.target?.class === 'i').target.ref;
  env.body.intent_token = PLANTED_TOKEN;
  env.presentation.text_equivalent.body = `${env.presentation.text_equivalent.body} ${token}`;
  env.presentation.text_equivalent.itemized = [...env.presentation.text_equivalent.itemized, `ref ${classI}`];
  env.provenance.tenant_id = env.tenant_id;
  env.limitations = [...env.limitations, { code: 'X', severity: 'info', text: env.integrity.envelope_seal, token: PLANTED_TOKEN }];
  env.intents[0].enabled = { ...env.intents[0].enabled, label: `${env.intents[0].enabled.label} ${env.integrity.principal_proof_hash}` };
  env.render.intents_withheld = [{ role: 'more', reason: 'capacity', reachable_via: 'unresolvedPointerNotARouteKey01' }];
  // Every target class, so a projection that keeps a `w`/`c` ref or an `s` param is visible.
  const extra = (ref, target) => ({ ...structuredClone(env.intents[0]), intent_ref: ref, intent_token: null, effect: 'NAVIGATE', target });
  env.intents = [
    ...env.intents,
    extra('pw', { class: 'w', ref: '01J9ZZPLANTEDWIDGETID00000' }),
    extra('pc', { class: 'c', ref: { space: 'C9', key: 'c9.planted' }, scope_ref: 'plantedScopeRef01' }),
    extra('ps', { class: 's', ref: { route: 'shell.pay', param: 'plantedPayHandle01' } }),
    // A carrier ref that is not also one of this envelope's tokens, named in copied text.
    extra('pi', { class: 'i', ref: 'plantedClassIRefCarrier01' }),
  ];
  env.presentation.text_equivalent.completeness_sentence = 'carrier plantedClassIRefCarrier01';
  return {
    id: 'planted-non-conformant',
    env,
    secrets: [token, classI, env.tenant_id, env.integrity.envelope_seal, env.integrity.principal_proof_hash, PLANTED_TOKEN, 'unresolvedPointerNotARouteKey01', '01J9ZZPLANTEDWIDGETID00000', 'plantedScopeRef01', 'plantedPayHandle01', 'plantedClassIRefCarrier01'],
  };
};

// ── closed-set members, object keys and the density carrying a token (integration finding) ─────
// `copyData` scrubs strings it copies, but enum members were copied raw and object KEYS were never
// checked, so a non-conformant envelope carried a token into RenderInput — and for lifecycle members,
// with verdict `valid`, into RenderResult. Each case plants one token in one such place.
// The planted value is one of the envelope's OWN intent tokens: the bytes the vault holds.
const ENUM_PLANTS = [
  ['kind', (e, t) => (e.kind = t)],
  ['body_version', (e, t) => (e.body_version = t)],
  ['lifecycle.state', (e, t) => (e.lifecycle.state = t)],
  ['lifecycle.input_lock', (e, t) => (e.lifecycle.input_lock = t)],
  ['lifecycle.on_expiry', (e, t) => (e.lifecycle.on_expiry = t)],
  ['render.render_tier', (e, t) => (e.render.render_tier = t)],
  ['render.intents_withheld[].role', (e, t) => (e.render.intents_withheld = [{ role: t, reason: 'capacity', reachable_via: 'shell.root' }])],
  ['render.intents_withheld[].reason', (e, t) => (e.render.intents_withheld = [{ role: 'more', reason: t, reachable_via: 'shell.root' }])],
  ['render.body_reductions[].reduction', (e, t) => (e.render.body_reductions = [{ path: 'options', reduction: t, restored_by: 'shell.root' }])],
  ['intents[].role', (e, t) => (e.intents[0].role = t)],
  ['intents[].effect', (e, t) => (e.intents[0].effect = t)],
  ['presentation.density', (e, t) => (e.presentation.density = t)],
  ['presentation.a11y.live_region', (e, t) => (e.presentation.a11y.live_region = t)],
  ['presentation.a11y.role_hint', (e, t) => (e.presentation.a11y.role_hint = `${t} with spaces`)],
  ['presentation.a11y.accessible_names KEY', (e, t) => (e.presentation.a11y.accessible_names[`intent:${t}`] = 'x')],
  ['body KEY', (e, t) => (e.body[t] = 1)],
];
const enumPlanted = () =>
  ENUM_PLANTS.map(([field, plant]) => {
    const env = envelopeOf(INDEX.fixtures.find((f) => f.id === 'kind-choice'));
    const token = env.intents.find((i) => typeof i.intent_token === 'string' && i.intent_token.length >= 8).intent_token;
    plant(env, token);
    return { id: `enum-planted ${field}`, env, secrets: [token] };
  });

// ── the allowlist, member by member ────────────────────────────────────────────────────────────
const keys = (o) => Object.keys(o).sort().join(',');
const structureProblems = (id, view) => {
  const p = [];
  const want = (what, got, expected) => got !== expected && p.push(`${id}: ${what} keys {${got}} ≠ {${expected}}`);
  want('view', keys(view), 'body,body_version,intents,kind,lifecycle,limitations,presentation,provenance,render');
  want('lifecycle', keys(view.lifecycle), 'input_lock,on_expiry,state');
  want('render', keys(view.render), 'reductions,render_tier,withheld');
  for (const w of view.render.withheld) {
    want('withheld', keys(w), 'reachable_via,reason,role');
    if (!['intent', 'route', 'unresolved'].includes(w.reachable_via.k)) p.push(`${id}: pointer kind ${w.reachable_via.k}`);
    want('pointer', keys(w.reachable_via), { intent: 'intent_ref,k', route: 'k,key', unresolved: 'k' }[w.reachable_via.k] ?? 'k');
  }
  for (const r of view.render.reductions) {
    want('reduction', keys(r), 'path,reduction,restored_by');
    want('pointer', keys(r.restored_by), { intent: 'intent_ref,k', route: 'k,key', unresolved: 'k' }[r.restored_by.k] ?? 'k');
  }
  for (const i of view.intents) {
    want('intent', keys(i), 'authority_hint,effect,enabled,input_schema,intent_ref,label,priority,role,target,utterance_preview');
    if (i.target !== null) want(`target ${i.target.class}`, keys(i.target), { w: 'class', i: 'class', c: 'class', s: 'class,route', detail: 'class,route_key' }[i.target.class] ?? '?');
  }
  const deep = JSON.stringify(view);
  for (const name of ['"intent_token"', '"token"', '"idempotency_key"', '"readback_ref"', '"envelope_seal"', '"principal_proof_hash"', '"tenant_id"'])
    if (deep.includes(`${name}:`)) p.push(`${id}: member ${name} in the view`);
  const intents = JSON.stringify(view.intents.map(({ enabled, authority_hint, input_schema, ...own }) => own));
  for (const name of ['"widget_id"', '"speech_aliases"', '"ordinal"', '"confirmation"', '"verification_floor"', '"capability"', '"handoff_capability_ref"', '"expires_at"', '"single_use"'])
    if (intents.includes(`${name}:`)) p.push(`${id}: intent member ${name} in the view`);
  return p;
};

const inputProblems = (id, serializedInput, secrets) => {
  const p = [];
  for (const s of secrets) if (serializedInput.includes(s)) p.push(`${id}: a secret (${s.slice(0, 6)}…) in the renderer input`);
  return p;
};

/** The whole inspection for one `project` implementation: corpus + planted, structure + bytes. */
const inspect = (projectFn) => {
  const problems = [];
  const cases = INDEX.fixtures.map((f) => ({ id: f.id, env: envelopeOf(f), secrets: secretValues(f) }));
  cases.push(planted(), ...enumPlanted());
  for (const c of cases) {
    let view;
    try {
      view = projectFn(structuredClone(c.env));
    } catch (error) {
      problems.push(`${c.id}: threw ${error.message}`);
      continue;
    }
    // As shell/intents.ts builds it: the density from the projected view.
    const input = { view, verdict: verify(c.env, INDEX.now), env: A11Y, density: view.presentation.density };
    problems.push(...structureProblems(c.id, view), ...inputProblems(c.id, JSON.stringify(input), c.secrets));
  }
  return problems;
};

// ── the shell path ─────────────────────────────────────────────────────────────────────────────

const runtimeWithSpy = () => {
  const inputs = [];
  const runtime = createShellRuntime({
    transport: { chat: () => assert.fail('no chat') },
    session: { view: () => ({ signedIn: true, display: { userName: 'Стас', tenantName: 'МЭ' } }), subscribe: () => () => undefined },
    render: (input) => {
      inputs.push(JSON.stringify(input));
      return render(input);
    },
    environment: { a11y: () => A11Y, onA11yChange: () => () => undefined, fragment: () => '' },
    scheduler: { now: () => NOW, after: () => () => undefined },
    history: { push() {}, back() {}, onBack: () => () => undefined },
    newAbort: () => new AbortController(),
    newId: () => 'nonce-00000001',
  });
  return { runtime, inputs };
};

test('D1 input side: for all 40 fixtures the renderer input from the shell ingest path carries 0 secret bytes', () => {
  let checked = 0;
  for (const f of INDEX.fixtures) {
    const { runtime, inputs } = runtimeWithSpy();
    const env = envelopeOf(f);
    const out = runtime.widgets.ingest(env);
    assert.equal(out.ingested, 'added', f.id);
    assert.equal(out.verdict, f.expect.verdict, `${f.id}: H7 on the full envelope`);
    assert.equal(inputs.length, 1, f.id);
    const input = JSON.parse(inputs[0]);
    assert.equal(input.verdict, f.expect.verdict);
    const secrets = secretValues(f);
    assert.ok(secrets.length >= 3, f.id);
    assert.deepEqual(inputProblems(f.id, inputs[0], secrets), []);
    assert.deepEqual(structureProblems(f.id, input.view), []);
    // The timeline item (what dom/ draws) carries none either.
    assert.deepEqual(inputProblems(f.id, JSON.stringify(runtime.conversation.view()), secrets), [], `${f.id}: timeline view`);
    checked += 1;
    runtime.dispose();
  }
  assert.equal(checked, INDEX.fixtures.length);
  assert.equal(checked, 40);
});

test('the view equals the member-by-member allowlist copy, with pointers rewritten and target refs dropped', () => {
  for (const f of INDEX.fixtures) {
    const env = envelopeOf(f);
    const tokens = new Map(env.intents.filter((i) => i.intent_token).map((i) => [i.intent_token, i.intent_ref]));
    const pointer = (p) => (tokens.has(p) ? { k: 'intent', intent_ref: tokens.get(p) } : ROUTE_KEYS.has(p) ? { k: 'route', key: p } : { k: 'unresolved' });
    const target = (t) => (t === null ? null : t.class === 's' ? { class: 's', route: t.ref.route } : t.class === 'detail' ? { class: 'detail', route_key: t.ref } : { class: t.class });
    const expected = {
      kind: env.kind,
      body_version: env.body_version,
      body: env.body,
      provenance: env.provenance,
      limitations: env.limitations,
      presentation: env.presentation,
      lifecycle: { state: env.lifecycle.state, input_lock: env.lifecycle.input_lock, on_expiry: env.lifecycle.on_expiry },
      render: {
        render_tier: env.render.render_tier,
        withheld: env.render.intents_withheld.map((w) => ({ role: w.role, reason: w.reason, reachable_via: pointer(w.reachable_via) })),
        reductions: env.render.body_reductions.map((r) => ({ path: r.path, reduction: r.reduction, restored_by: pointer(r.restored_by) })),
      },
      intents: env.intents.map((i) => ({
        intent_ref: i.intent_ref,
        role: i.role,
        label: i.label,
        utterance_preview: i.utterance_preview,
        priority: i.priority,
        effect: i.effect,
        enabled: i.enabled,
        authority_hint: i.authority_hint,
        input_schema: i.input_schema,
        target: target(i.target),
      })),
    };
    const view = project(env);
    assert.deepEqual(view, expected, f.id);
    // Shares no object with the envelope: mutating the view leaves the envelope untouched.
    view.body.__probe = 1;
    view.presentation.text_equivalent.headline = 'changed';
    assert.ok(!('__probe' in env.body));
    assert.notEqual(env.presentation.text_equivalent.headline, 'changed');
  }
  const receipt = project(envelopeOf(INDEX.fixtures.find((f) => f.id === 'schedule-withheld-reduced')));
  assert.deepEqual(receipt.render.withheld.map((w) => w.reachable_via), [{ k: 'intent', intent_ref: 'i1' }, { k: 'route', key: 'fs.calendar' }]);
  assert.deepEqual(receipt.render.reductions.map((r) => r.restored_by), [{ k: 'intent', intent_ref: 'i2' }]);
  const classI = project(envelopeOf(INDEX.fixtures.find((f) => f.id === 'metric-class-i-target')));
  assert.ok(classI.intents.some((i) => i.target !== null && i.target.class === 'i' && !('ref' in i.target)));
});

test('a non-conformant envelope (tokens planted in copied members) still yields a token-free view', () => {
  const c = planted();
  const view = project(c.env);
  assert.deepEqual(inspect(project), [], 'the whole corpus plus the planted envelope');
  const serialized = JSON.stringify(view);
  for (const s of c.secrets) assert.ok(!serialized.includes(s));
  assert.ok(!('intent_token' in view.body));
  assert.ok(!('tenant_id' in view.provenance));
  assert.ok(!('token' in view.limitations.at(-1)));
  assert.deepEqual(view.render.withheld.map((w) => w.reachable_via), [{ k: 'unresolved' }]);
  assert.ok(secretsOf(c.env).includes('unresolvedPointerNotARouteKey01'));
  assert.ok(!secretsOf(envelopeOf(INDEX.fixtures.find((f) => f.id === 'schedule-withheld-reduced'))).includes('fs.calendar'), 'a route key is not a secret');
});

test('a token in a closed-set member, an object key or the density never reaches the renderer input or its result, and such an envelope is never drawn as valid', () => {
  const leaks = [];
  for (const c of enumPlanted()) {
    const [token] = c.secrets;
    const { runtime, inputs } = runtimeWithSpy();
    let out;
    try {
      out = runtime.widgets.ingest(c.env);
    } catch (error) {
      leaks.push(`${c.id}: ingest threw ${error.message}`);
      continue;
    }
    if (out.ingested !== 'added') leaks.push(`${c.id}: not drawn (${out.ingested})`);
    if (inputs.length !== 1) leaks.push(`${c.id}: ${inputs.length} renderer inputs`);
    for (const raw of inputs) {
      if (raw.includes(token)) leaks.push(`${c.id}: token in the RenderInput`);
      if (JSON.parse(raw).verdict === 'valid') leaks.push(`${c.id}: a non-conformant envelope was rendered with verdict valid`);
    }
    if (JSON.stringify(runtime.conversation.view()).includes(token)) leaks.push(`${c.id}: token in the RenderResult on the timeline`);
    runtime.dispose();
  }
  assert.deepEqual(leaks, []);
});

// ── mutations ──────────────────────────────────────────────────────────────────────────────────

const VIEW_SRC = fs.readFileSync(path.join(SH, 'src/shell/view.ts'), 'utf8');
const REGISTRY_SRC = fs.readFileSync(path.join(SH, 'src/routes/registry.ts'), 'utf8');

const MUTANTS = [
  ['M1 an intent keeps intent_token', "  target: targetView(intent.target, secrets),\n});", "  target: targetView(intent.target, secrets),\n  intent_token: intent.intent_token,\n});"],
  ['M2 a class-i target keeps its ref', "      return { class: 'i' };", "      return { class: 'i', ref: target.ref };"],
  ['M3 a class-w target keeps its ref', "      return { class: 'w' };", "      return { class: 'w', ref: target.ref };"],
  ['M4 a class-s target keeps its param', "      return known === undefined ? null : { class: 's', route: known };", "      return known === undefined ? null : { class: 's', route: known, param: target.ref.param };"],
  ['M5 a pointer keeps the original token', "  if (intentRef !== null) return { k: 'intent', intent_ref: intentRef };", "  if (intentRef !== null) return { k: 'intent', intent_ref: pointer };"],
  ['M6 an unresolved pointer keeps its string', "  return route === null ? { k: 'unresolved' } : { k: 'route', key: route.key };", "  return route === null ? { k: 'route', key: pointer } : { k: 'route', key: route.key };"],
  ['M7 the whole render receipt is copied', "    render: receiptView(envelope, refOf, secrets),", "    render: { ...receiptView(envelope, refOf, secrets), receipt: envelope.render },"],
  ['M8 the root tenant_id is copied', '    body: copyAs(envelope.body, secrets),', '    tenant_id: envelope.tenant_id,\n    body: copyAs(envelope.body, secrets),'],
  ['M9 integrity is copied', '    body: copyAs(envelope.body, secrets),', '    integrity: envelope.integrity,\n    body: copyAs(envelope.body, secrets),'],
  ['M10 an intent keeps its confirmation', "  target: targetView(intent.target, secrets),\n});", "  target: targetView(intent.target, secrets),\n  confirmation: intent.confirmation,\n});"],
  ['M11 the lifecycle is copied whole', "const lifecycleView = (envelope: WidgetEnvelope): LifecycleView => ({", "const lifecycleView = (envelope: WidgetEnvelope): LifecycleView => ({\n  ...envelope.lifecycle,"],
  ['M12 token-named members survive a deep copy', '    if (TOKEN_MEMBERS.has(key) || carriesSecret(key, secrets)) continue;\n', '    if (carriesSecret(key, secrets)) continue;\n'],
  ['M13 strings carrying a secret are not blanked', 'const carriesSecret = (text: string, secrets: readonly string[]): boolean =>\n  secrets.some(', 'const carriesSecret = (text: string, secrets: readonly string[]): boolean =>\n  false && secrets.some('],
  ['M14 class-i refs are not secrets', "    if (intent.target !== null && typeof intent.target === 'object' && intent.target.class === 'i') add(intent.target.ref);\n", ''],
  ['M15 the body is passed by reference', '    body: copyAs(envelope.body, secrets),', '    body: envelope.body,'],
  ['M17 a class-c target keeps its ref', "      return { class: 'c' };", "      return { class: 'c', ref: target.ref, scope_ref: target.scope_ref };"],
  ['M16 an intent keeps its speech aliases', "  target: targetView(intent.target, secrets),\n});", "  target: targetView(intent.target, secrets),\n  speech_aliases: intent.speech_aliases,\n});"],
  ['M18 the lifecycle state is copied raw', "  state: closed(VIEW_LIFECYCLE_STATES, envelope.lifecycle.state, 'HISTORISED'),", '  state: envelope.lifecycle.state,'],
  ['M19 a withheld reason is copied raw', "      reason: closed(VIEW_WITHHELD_REASONS, w.reason, 'policy'),", '      reason: w.reason,'],
  ['M20 a member key carrying a secret survives the copy', '    if (TOKEN_MEMBERS.has(key) || carriesSecret(key, secrets)) continue;', '    if (TOKEN_MEMBERS.has(key)) continue;'],
  ['M21 the kind is copied raw', "    kind: closed(VIEW_KINDS, envelope.kind, 'METRIC'),", '    kind: envelope.kind,'],
  ['M22 an intent effect is copied raw', "  effect: closed(VIEW_EFFECTS, intent.effect, 'CONTROL'),", '  effect: intent.effect,'],
];

const loadVariant = async (dir, name, source) => {
  const root = path.join(dir, name);
  fs.mkdirSync(path.join(root, 'src', 'shell'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'routes'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}\n');
  fs.writeFileSync(path.join(root, 'src', 'routes', 'registry.ts'), REGISTRY_SRC);
  fs.writeFileSync(path.join(root, 'src', 'shell', 'view.ts'), source);
  return import(pathToFileURL(path.join(root, 'src', 'shell', 'view.ts')).href);
};

test('mutations: every view.ts variant that keeps a token, ref, pointer, seal, tenant or proof is caught; the original passes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-s4-view-mutants-'));
  try {
    const original = await loadVariant(dir, 'original', VIEW_SRC);
    assert.deepEqual(inspect(original.project), [], 'the unmutated copy passes');
    const results = [];
    for (const [i, [name, from, to]] of MUTANTS.entries()) {
      assert.ok(VIEW_SRC.includes(from), `${name}: the mutation site exists`);
      const mutated = VIEW_SRC.replace(from, to);
      assert.notEqual(mutated, VIEW_SRC, name);
      const mod = await loadVariant(dir, `m${i + 1}`, mutated);
      const problems = inspect(mod.project);
      results.push([name, problems.length]);
      assert.ok(problems.length > 0, `${name} survived`);
    }
    assert.equal(results.length, MUTANTS.length);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
