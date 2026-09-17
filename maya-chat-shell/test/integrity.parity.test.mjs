// K5 — H7 parity, independent of the port it checks (SHELL-PLAN v2.1 §2.7 step 10b; D11, V2-2, V2-10).
//
// The reference hashes were minted by dev/make-envelopes.mjs with the BACKEND's canonicaliser
// (action-engine.identity.ts, transpiled from source) and node:crypto, never with
// src/integrity/h7.ts. This suite checks the port against those hashes and against the backend
// canonicaliser live, in child processes whose LANG/LC_ALL is pinned per run:
//
//   en_US.UTF-8   the reference: every fixture, invariant and divergent, must agree
//   ru_RU, et_EE, lt_LT   the matrix: every INVARIANT fixture must agree; divergent fixtures are
//                 recorded (R7-E6 evidence, status RUL) and do not fail the run
//
// In every locale, including the divergent ones, the port and the backend canonicaliser running in
// the same process must produce the same bytes: the port is a port, whatever the locale does.
// Each child asserts its resolved collator locale first, so a matrix that silently ran in one
// locale is a failure ("locale not applied"), never a pass.
//
//   node --test test/integrity.parity.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { bodyHash, bodyHashTerms, canonicalJson, parseInstant, sha256Bytes, sha256Hex, stripIntentToken, utf8, verify } from '../src/integrity/h7.ts';
import { h1Terms, loadBackendCanonicaliser } from '../dev/make-envelopes.mjs';

const SH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(SH, 'dev', 'fixtures', 'envelopes');
const INDEX = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'index.json'), 'utf8'));
const MATRIX = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'locale-matrix.json'), 'utf8'));
const LOCALES = [
  { lang: 'en_US.UTF-8', tag: 'en-US', probe: 'ajtyzZ', reference: true },
  { lang: 'ru_RU.UTF-8', tag: 'ru-RU', probe: 'ajtyzZ', reference: false },
  { lang: 'et_EE.UTF-8', tag: 'et-EE', probe: 'ajzZty', reference: false },
  { lang: 'lt_LT.UTF-8', tag: 'lt-LT', probe: 'ayjtzZ', reference: false },
];
const nodeSha = (s) => createHash('sha256').update(s).digest('hex');
const envelopeOf = (f) => JSON.parse(fs.readFileSync(path.join(FIXTURES, f.file), 'utf8'));

// ── the primitives, in this process ─────────────────────────────────────────────────────────────

test('SHA-256 port equals node:crypto on block boundaries, Unicode, lone surrogates and random input', () => {
  const cases = ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(63), 'a'.repeat(64), 'a'.repeat(65), 'b'.repeat(119), 'c'.repeat(1000), 'Привет, MAYA', '🚀💈 стрижка', '\ud800', 'x\udfff', '\udc00\ud800', 'z'.repeat(200000)];
  for (let i = 0; i < 200; i += 1) cases.push(String.fromCharCode(...randomBytes(1 + (i % 97)).map((b) => (b * 257) % 0xffff)));
  for (const c of cases) assert.equal(sha256Hex(c), nodeSha(c), JSON.stringify(c.slice(0, 16)));
  for (let n = 0; n < 130; n += 1) {
    const bytes = randomBytes(n);
    assert.equal(sha256Bytes(new Uint8Array(bytes)), createHash('sha256').update(bytes).digest('hex'), `bytes ${n}`);
    assert.deepEqual(Buffer.from(utf8(String.fromCharCode(...bytes))), Buffer.from(String.fromCharCode(...bytes), 'utf8'));
  }
  assert.notEqual(sha256Hex('abc'), sha256Hex('abd'), 'non-vacuity');
});

test('the canonicaliser port equals the backend stableActionJson byte-for-byte, including what both refuse', () => {
  const canon = loadBackendCanonicaliser();
  const values = [
    null,
    true,
    0,
    -0,
    1.5e300,
    'строка',
    [],
    {},
    { b: 1, a: [3, { d: undefined, c: -0 }], '': 'empty' },
    { 10: 'x', 2: 'y', 1: 'z', a: 1, Z: 2, z: 3 },
    JSON.parse('{"__proto__": {"x": 1}, "y": 2}'),
    { 'ключ': 1, key: 2, 'ё': 3, e: 4 },
    { nested: { deeper: [{ k2: 'v', k1: null }] } },
    bodyHashTerms(envelopeOf(INDEX.fixtures[0])),
  ];
  for (const v of values) assert.equal(canonicalJson(v), canon.stableActionJson(v), JSON.stringify(v)?.slice(0, 60));
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, [undefined], [() => 1], 10n, Symbol('s')]) {
    assert.throws(() => canon.stableActionJson(bad), undefined, `backend accepts ${String(bad)}`);
    assert.throws(() => canonicalJson(bad), undefined, `port accepts ${String(bad)}`);
  }
});

test('parseInstant equals Date.parse on RFC 3339 instants and refuses what is not one', () => {
  const good = ['2026-09-17T09:05:00.000Z', '2026-09-17T09:05:00Z', '1970-01-01T00:00:00Z', '2000-02-29T23:59:59.999+03:00', '1969-12-31T23:59:59.5-01:30', '2099-12-31T23:59:59.000Z', '1900-03-01T00:00:00Z', '2026-09-17t09:05:00z'];
  for (const s of good) assert.equal(parseInstant(s), Date.parse(s.toUpperCase()), s);
  for (const s of ['', '2026-09-17', '2026-13-01T00:00:00Z', '2026-02-30T00:00:00Z', '2026-09-17T24:00:00Z', '2026-09-17T09:05:00', 'now', 42, null, undefined])
    assert.equal(parseInstant(s), null, String(s));
});

test('stripIntentToken removes the intent_token member and nothing else (R7-E5, SH-07)', () => {
  const env = envelopeOf(INDEX.fixtures.find((f) => f.id === 'metric-class-i-target'));
  for (const intent of env.intents) {
    const stripped = stripIntentToken(intent);
    assert.equal(Object.hasOwn(stripped, 'intent_token'), false);
    const { intent_token: _t, ...rest } = intent;
    assert.deepEqual(stripped, rest);
  }
  const classI = env.intents.find((i) => i.target?.class === 'i');
  assert.equal(stripIntentToken(classI).target.ref, classI.target.ref, "a class-'i' ref stays a hash term");
  assert.deepEqual(bodyHashTerms(env), h1Terms(env), 'the port assembles the same ten terms as the independent generator');
  assert.equal(Object.keys(bodyHashTerms(env)).length, 10);
});

// ── the corpus ─────────────────────────────────────────────────────────────────────────────────

test('the corpus: 22 kinds, every H7 category, both collation groups, and tokens of at most 24 random bytes', () => {
  assert.equal(new Set(INDEX.fixtures.map((f) => f.kind)).size, 22);
  const categories = new Set(INDEX.fixtures.map((f) => f.category));
  for (const c of ['kind', 'tier', 'expiry', 'tamper', 'term-coverage', 'class-i', 'receipt', 'lifecycle', 'collation']) assert.ok(categories.has(c), c);
  assert.ok(INDEX.fixtures.some((f) => f.id === 'kind-limitation-blocking' && f.expect.live_region === 'assertive'));
  assert.ok(INDEX.fixtures.some((f) => f.id === 'limitation-non-blocking' && f.expect.live_region === 'polite'));
  for (const verdict of ['valid', 'body_mismatch', 'expired']) assert.ok(INDEX.fixtures.some((f) => f.expect.verdict === verdict), verdict);
  assert.ok(INDEX.counts.invariant > 0 && INDEX.counts.divergent > 0);
  for (const f of INDEX.fixtures) {
    assert.ok(f.file.startsWith(`h7/${f.group}/`), f.id);
    const env = envelopeOf(f);
    for (const i of env.intents) {
      if (i.effect === 'NONE') assert.equal(i.intent_token, null, `${f.id}: NONE carries no token`);
      else {
        assert.match(i.intent_token, /^[A-Za-z0-9_-]{32}$/, `${f.id}: token shape`);
        assert.ok(Buffer.from(i.intent_token, 'base64url').length <= 24, `${f.id}: ≤ 24 random bytes (V2-10)`);
      }
    }
  }
});

test('the generator is independent of the port: it never loads src/integrity', () => {
  const source = fs.readFileSync(path.join(SH, 'dev', 'make-envelopes.mjs'), 'utf8');
  // Code lines only: the header comment names the port it deliberately does not use.
  const code = source.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
  assert.ok(!/src\/integrity|integrity\/h7|h7\.(ts|js)/.test(code), 'the generator code names the shell integrity module');
  assert.ok(!/src\/integrity/.test(code.replace(/\s+/g, '')), 'not even split across lines');
  assert.match(code, /action-engine\.identity/);
});

test('the fixtures reproduce byte-for-byte from the generator (pinned LANG, persisted random values)', () => {
  const r = spawnSync(process.execPath, [path.join(SH, 'dev', 'make-envelopes.mjs'), '--check'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /check: \d+ files byte-identical/);
});

// ── the locale matrix, in child processes ──────────────────────────────────────────────────────

const CHILD = `
const [h7Url, genUrl, fixturesDir, now, tag] = process.argv.slice(1);
const fs = await import('node:fs');
const path = await import('node:path');
const { createHash } = await import('node:crypto');
const h7 = await import(h7Url);
const gen = await import(genUrl);
const resolved = new Intl.Collator().resolvedOptions().locale;
if (resolved !== tag) { console.log(JSON.stringify({ error: 'locale not applied', resolved })); process.exit(0); }
const canon = gen.loadBackendCanonicaliser();
const index = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'index.json'), 'utf8'));
const out = { resolved, probe: ['y', 'j', 'z', 't', 'a', 'Z'].sort((a, b) => a.localeCompare(b)).join(''), fixtures: {} };
for (const f of index.fixtures) {
  const env = JSON.parse(fs.readFileSync(path.join(fixturesDir, f.file), 'utf8'));
  const portBytes = h7.canonicalJson(h7.bodyHashTerms(env));
  const backendBytes = canon.stableActionJson(gen.h1Terms(env));
  out.fixtures[f.id] = {
    port: h7.bodyHash(env),
    backend: createHash('sha256').update(backendBytes).digest('hex'),
    same_bytes: portBytes === backendBytes,
    verdict: h7.verify(env, now),
  };
}
console.log(JSON.stringify(out));
`;

const runs = new Map();
const runLocale = (loc) => {
  if (runs.has(loc.lang)) return runs.get(loc.lang);
  const args = ['--input-type=module', '-e', CHILD, pathToFileURL(path.join(SH, 'src', 'integrity', 'h7.ts')).href, pathToFileURL(path.join(SH, 'dev', 'make-envelopes.mjs')).href, FIXTURES, INDEX.now, loc.tag];
  const r = spawnSync(process.execPath, args, { env: { ...process.env, LANG: loc.lang, LC_ALL: loc.lang }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr);
  const parsed = JSON.parse(r.stdout.trim().split('\n').pop());
  runs.set(loc.lang, parsed);
  return parsed;
};

for (const loc of LOCALES) {
  test(`${loc.lang}: the locale is really applied, and the port equals the backend canonicaliser for every fixture`, () => {
    const run = runLocale(loc);
    assert.equal(run.error, undefined, `${loc.lang}: ${run.error} (resolved ${run.resolved})`);
    assert.equal(run.resolved, loc.tag);
    assert.equal(run.probe, loc.probe, `${loc.lang}: collation probe`);
    for (const f of INDEX.fixtures) {
      const got = run.fixtures[f.id];
      assert.ok(got, f.id);
      assert.equal(got.same_bytes, true, `${loc.lang} ${f.id}: port bytes differ from the backend's in the same process`);
      assert.equal(got.port, got.backend, `${loc.lang} ${f.id}`);
    }
  });

  test(`${loc.lang}: ${loc.reference ? 'every fixture' : 'every INVARIANT fixture'} hashes to the pinned en_US reference and reaches its expected verdict`, () => {
    const run = runLocale(loc);
    const divergentDiffs = [];
    for (const f of INDEX.fixtures) {
      const got = run.fixtures[f.id];
      if (loc.reference || f.group === 'invariant') {
        assert.equal(got.port, f.reference.body_hash, `${loc.lang} ${f.id}: body_hash`);
        assert.equal(got.verdict, f.expect.verdict, `${loc.lang} ${f.id}: verdict`);
      } else if (got.port !== f.reference.body_hash) divergentDiffs.push(`${f.id} (verdict ${got.verdict})`);
    }
    if (!loc.reference) {
      // Recorded, not judged: R7-E6 evidence. It must agree with what the generator recorded for its own LANG run.
      const recorded = MATRIX.runs.find((r) => r.lang === loc.lang);
      assert.ok(recorded, `locale-matrix.json has a ${loc.lang} run`);
      assert.deepEqual(divergentDiffs.map((d) => d.split(' ')[0]).sort(), [...recorded.changed].sort(), `${loc.lang}: the port disagrees where the minter would not`);
      console.log(`# R7-E6 evidence ${loc.lang}: ${divergentDiffs.length} divergent fixture(s) hash differently from the en_US reference: ${divergentDiffs.join(', ') || 'none'}`);
    }
  });
}

test('the invariant/divergent split is not vacuous: some divergent fixture does change under some matrix locale', () => {
  const changed = LOCALES.filter((l) => !l.reference).flatMap((l) => {
    const run = runLocale(l);
    return INDEX.fixtures.filter((f) => f.group === 'divergent' && run.fixtures[f.id].port !== f.reference.body_hash).map((f) => `${l.lang}:${f.id}`);
  });
  assert.ok(changed.length > 0, 'no divergent fixture changed — the matrix would pass whatever the collation');
});

test('sealed body_hash: every fixture whose verdict is not body_mismatch carries the reference hash, and tampered ones do not', () => {
  for (const f of INDEX.fixtures) {
    const env = envelopeOf(f);
    if (f.expect.verdict === 'body_mismatch') assert.notEqual(env.integrity.body_hash, f.reference.body_hash, f.id);
    else assert.equal(env.integrity.body_hash, f.reference.body_hash, f.id);
  }
});

test('H1 term coverage: tokens, the whole receipt, seal, tenant and ids are outside the hash; tier, class-i refs and the cell index digest are inside', () => {
  const by = (id) => INDEX.fixtures.find((f) => f.id === id);
  const now = INDEX.now;
  const verdictOf = (id) => verify(envelopeOf(by(id)), now);
  for (const id of ['booking-token-changed', 'booking-receipt-pointers-changed', 'booking-root-values-changed']) assert.equal(verdictOf(id), 'valid', id);
  for (const id of ['booking-render-tier-changed', 'metric-class-i-ref-tampered', 'booking-cell-index-digest-changed', 'booking-tampered-body']) assert.equal(verdictOf(id), 'body_mismatch', id);
  assert.equal(verdictOf('booking-expired'), 'expired');
  // Mutations of the port's reading would be seen: hashing the whole receipt, or stripping class-i refs.
  const env = envelopeOf(by('booking-receipt-pointers-changed'));
  const wholeReceipt = sha256Hex(canonicalJson({ ...bodyHashTerms(env), render_tier: env.render }));
  assert.notEqual(wholeReceipt, env.integrity.body_hash);
  const metric = envelopeOf(by('metric-class-i-target'));
  const refsStripped = sha256Hex(canonicalJson({ ...bodyHashTerms(metric), intents: metric.intents.map((i) => ({ ...stripIntentToken(i), target: i.target?.class === 'i' ? { class: 'i' } : i.target })) }));
  assert.notEqual(refsStripped, metric.integrity.body_hash);
  assert.equal(bodyHash(metric), metric.integrity.body_hash);
});

test('verify fails closed: missing hash, unreadable instants and refused values never read as valid', () => {
  const env = envelopeOf(INDEX.fixtures.find((f) => f.id === 'kind-choice'));
  assert.equal(verify(env, INDEX.now), 'valid');
  assert.equal(verify({ ...env, integrity: { ...env.integrity, body_hash: undefined } }, INDEX.now), 'body_mismatch');
  assert.equal(verify({ ...env, integrity: undefined }, INDEX.now), 'body_mismatch');
  assert.equal(verify(env, 'not an instant'), 'expired');
  assert.equal(verify({ ...env, lifecycle: { ...env.lifecycle, expires_at: 'soon' } }, INDEX.now), 'expired');
  assert.equal(verify(env, env.lifecycle.expires_at), 'expired', 'expired at the instant itself');
  const nan = structuredClone(env);
  nan.body.shown_count = Number.NaN;
  assert.equal(verify(nan, INDEX.now), 'body_mismatch');
});

test('the emitted integrity/h7.js (when dist/web is built from these sources) hashes the corpus identically', (t) => {
  const manifestPath = path.join(SH, 'dist', 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
  const entry = manifest?.web?.files?.find((f) => f.path === 'src/integrity/h7.js');
  const file = entry ? path.join(SH, 'dist', 'web', manifest.web.modulePath, entry.path) : null;
  if (!file || !fs.existsSync(file) || nodeSha(fs.readFileSync(file)) !== entry.sha256) {
    t.skip('dist/web has no emitted integrity/h7.js matching dist/manifest.json (run node build.mjs); Chrome parity is CDP step 10b');
    return;
  }
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD, pathToFileURL(file).href, pathToFileURL(path.join(SH, 'dev', 'make-envelopes.mjs')).href, FIXTURES, INDEX.now, 'en-US'], {
    env: { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(r.status, 0, r.stderr);
  const run = JSON.parse(r.stdout.trim().split('\n').pop());
  for (const f of INDEX.fixtures) {
    assert.equal(run.fixtures[f.id].port, f.reference.body_hash, `emitted ${f.id}`);
    assert.equal(run.fixtures[f.id].verdict, f.expect.verdict, `emitted ${f.id}`);
  }
});
