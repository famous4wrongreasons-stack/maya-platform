// K5 — the local-API tests (S7): the proof-DB guard (always), and against the real NestJS binary on the
// isolated proof DB (only when given): D6 history (untruncated → 400, truncated → 200), password sign-in
// with a business address (V2-6), the locally producible sign-in failures (V2-16), refresh rotation,
// 402/429 when provoked, and the approval_required attempt (V2-5: PASS or NOT EXERCISED).
//
//   node --test test/local-api.history.test.mjs                        guard tests; the API part is SKIPPED (not a PASS)
//   node test/local-api.history.test.mjs --api=http://127.0.0.1:3310/api \
//        --env=<SCRATCH>/backend.local.env --fixture=<SCRATCH>/shell-fixture.<slug>.json --evidence=<SCRATCH>/local-api-evidence.json
//   (or MAYA_SHELL_LOCAL_API, MAYA_SHELL_LOCAL_ENV, MAYA_SHELL_FIXTURE, MAYA_SHELL_EVIDENCE)
//
// Requests go through dev/serve.mjs's relay (in process, 127.0.0.1) to the binary; nothing leaves the
// machine. The evidence records HEAD, the dist build time, the newest commit not newer than it, and the
// label "pre-HEAD binary" whenever that commit is not HEAD (V2-14): it proves the shell against that
// binary only, never against HEAD.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PROOF_DATABASE_URL, assertProofDatabaseUrl, assertScratchPath, buildEnv, launchCommand, serializeEnv, verifyEnv } from '../dev/local-api-env.mjs';
import { assertFixtureSlug, rateLimitSubjectHash } from '../dev/local-api-fixture.mjs';
import { AI_CORE_CHAT_DTO, LOGIN_DTO, loadApiFixture, validateDto } from '../dev/scenarios.mjs';
import { assertLocalUpstream, createDevServer } from '../dev/serve.mjs';

const SH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANON = path.resolve(SH, '..');
const BE = path.join(CANON, 'maya-saas-backend');

const arg = (name, envName) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : process.env[envName] ?? null;
};
const API = arg('api', 'MAYA_SHELL_LOCAL_API');
const ENV_FILE = arg('env', 'MAYA_SHELL_LOCAL_ENV');
const FIXTURE_FILE = arg('fixture', 'MAYA_SHELL_FIXTURE');
const EVIDENCE_FILE = arg('evidence', 'MAYA_SHELL_EVIDENCE');

// ── evidence labelling (V2-14) ─────────────────────────────────────────────────────────────────

const git = (...args) => execFileSync('git', ['-C', CANON, ...args], { encoding: 'utf8' }).trim();

/** Pure: the label for a binary whose newest source commit is `sourceCommit` while the tree is at `head`. */
export function binaryLabel(head, sourceCommit) {
  if (!sourceCommit) return 'pre-HEAD binary (no commit precedes the build time)';
  return sourceCommit === head ? 'HEAD binary' : 'pre-HEAD binary';
}

function binaryProvenance() {
  const main = path.join(BE, 'dist', 'src', 'main.js');
  const mainMtime = fs.statSync(main).mtime;
  let newest = mainMtime;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) {
        const m = fs.statSync(p).mtime;
        if (m > newest) newest = m;
      }
    }
  };
  walk(path.join(BE, 'dist', 'src'));
  const head = git('rev-parse', 'HEAD');
  const headTime = git('log', '-1', '--format=%cI', 'HEAD');
  const sourceLine = git('log', '-1', `--before=${newest.toISOString()}`, '--format=%H %cI', 'HEAD');
  const [sourceCommit, sourceTime] = sourceLine ? sourceLine.split(' ') : [null, null];
  const dirty = git('status', '--porcelain', '--', 'maya-saas-backend').split('\n').filter(Boolean).length;
  return {
    head,
    headCommitTime: headTime,
    distMainMtime: mainMtime.toISOString(),
    distNewestJsMtime: newest.toISOString(),
    sourceCommit,
    sourceCommitTime: sourceTime,
    label: binaryLabel(head, sourceCommit),
    uncommittedBackendPathsAtRun: dirty,
    note: 'The source commit is the newest commit not newer than the newest dist/src/**/*.js mtime; uncommitted backend edits may or may not be in the binary.',
  };
}

// ── always: the proof-DB guard ─────────────────────────────────────────────────────────────────

describe('proof-DB guard (§2.5)', () => {
  test('admits exactly 127.0.0.1:55611/maya_widget_gate_proof_local', () => {
    assert.equal(assertProofDatabaseUrl(PROOF_DATABASE_URL).database, 'maya_widget_gate_proof_local');
    assert.equal(assertProofDatabaseUrl('postgresql://maya@127.0.0.1:55611/maya_widget_gate_proof_local').port, '55611');
  });

  test('refuses :5432, any other port, host or database, prod/clone names and redirecting parameters', () => {
    const refused = [
      ['postgresql://maya@127.0.0.1:5432/maya_widget_gate_proof_local', /5432 is the shared local cluster/],
      ['postgresql://maya@127.0.0.1/maya_widget_gate_proof_local', /no port/],
      ['postgresql://maya@127.0.0.1:05432/maya_widget_gate_proof_local', /5432/],
      ['postgresql://maya@127.0.0.1:55612/maya_widget_gate_proof_local', /not exactly 55611/],
      ['postgresql://maya@localhost:55611/maya_widget_gate_proof_local', /not exactly 127\.0\.0\.1/],
      ['postgresql://maya@10.0.0.5:55611/maya_widget_gate_proof_local', /not exactly 127\.0\.0\.1/],
      ['postgresql://maya@127.0.0.1:55611/maya_widget_gate_proof_other', /not exactly maya_widget_gate_proof_local/],
      ['postgresql://maya@127.0.0.1:55611/maya_saas', /contains/],
      ['postgresql://maya@127.0.0.1:55611/maya_prod_clone', /contains/],
      ['postgresql://maya@127.0.0.1:55611/postgres', /contains/],
      ['postgresql://maya@127.0.0.1:55611/maya_widget_gate_proof_local?host=/tmp', /query parameter/],
      ['postgresql://maya@127.0.0.1:55611/maya_widget_gate_proof_local?port=5432', /query parameter/],
      ['mysql://maya@127.0.0.1:55611/maya_widget_gate_proof_local', /protocol/],
      ['', /not set/],
      [undefined, /not set/],
    ];
    for (const [url, reason] of refused) assert.throws(() => assertProofDatabaseUrl(url), reason, String(url));
  });

  test('a generated env is admitted; a :5432 env is refused by --verify and by the fixture script before any connection', () => {
    const env = buildEnv();
    assert.deepEqual(verifyEnv(env), []);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-shell-guard-'));
    try {
      const bad = path.join(dir, 'bad.env');
      fs.writeFileSync(bad, serializeEnv({ ...env, DATABASE_URL: 'postgresql://maya@127.0.0.1:5432/maya_widget_gate_proof_local' }), { mode: 0o600 });
      const verify = spawnSync(process.execPath, [path.join(SH, 'dev', 'local-api-env.mjs'), `--verify=${bad}`], { encoding: 'utf8' });
      assert.equal(verify.status, 1);
      assert.match(verify.stderr, /5432 is the shared local cluster/);
      const started = Date.now();
      const fixture = spawnSync(process.execPath, [path.join(SH, 'dev', 'local-api-fixture.mjs'), `--env=${bad}`, '--status', '--slug=shell-p1-20260101000000'], { encoding: 'utf8', timeout: 15_000 });
      assert.equal(fixture.status, 1);
      assert.match(fixture.stderr, /env refused[\s\S]*5432/);
      assert.ok(Date.now() - started < 10_000);
      const otherDb = path.join(dir, 'other.env');
      fs.writeFileSync(otherDb, serializeEnv({ ...env, DATABASE_URL: 'postgresql://maya@127.0.0.1:55611/maya_saas_dev' }), { mode: 0o600 });
      const refusedDb = spawnSync(process.execPath, [path.join(SH, 'dev', 'local-api-fixture.mjs'), `--env=${otherDb}`, '--remove', '--slug=shell-p1-20260101000000'], { encoding: 'utf8', timeout: 15_000 });
      assert.equal(refusedDb.status, 1);
      assert.match(refusedDb.stderr, /env refused[\s\S]*maya_saas/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fixture fence and scratch-only secrets', () => {
    assert.equal(assertFixtureSlug('shell-p1-20260917120000'), 'shell-p1-20260917120000');
    for (const bad of ['demo-business', 'shell-p1-1', 'widgets-live-abc', 'shell-p1-20260917120000x', undefined]) assert.throws(() => assertFixtureSlug(bad), /refused/);
    assert.throws(() => assertScratchPath(path.join(SH, 'dev', 'backend.local.env')), /inside (a git work tree|the repository)/);
    const rel = rateLimitSubjectHash('s', 'auth.password_login.preflight.ip.15m', '127.0.0.1');
    assert.match(rel, /^[0-9a-f]{64}$/);
  });

  test('the secrets fence fails closed: git missing, misdirected or answering "outside" never admits a path inside the repository (integration finding)', () => {
    const inRepo = path.join(SH, 'dev', 'backend.local.env');
    const probe = (target, env) => {
      const code = `import(${JSON.stringify(path.join(SH, 'dev', 'local-api-env.mjs'))}).then((m) => { try { m.assertScratchPath(${JSON.stringify(target)}); console.log('admitted'); } catch (e) { console.log('refused: ' + e.message); } })`;
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', env });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout.trim();
    };
    const base = { HOME: os.homedir() };
    // git not on PATH at all
    assert.match(probe(inRepo, { ...base, PATH: '/usr/sbin' }), /^refused/, 'git missing');
    // git misdirected by the environment
    assert.match(probe(inRepo, { ...process.env, GIT_DIR: '/nonexistent' }), /^refused/, 'GIT_DIR misdirected');
    assert.match(probe(inRepo, { ...process.env, GIT_WORK_TREE: os.tmpdir(), GIT_DIR: path.join(os.tmpdir(), 'no-such-git-dir') }), /^refused/, 'GIT_WORK_TREE misdirected');
    // a git that says "not in a work tree": the repository prefix still refuses
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-shell-fakegit-'));
    try {
      fs.writeFileSync(path.join(bin, 'git'), '#!/bin/sh\necho false\nexit 0\n', { mode: 0o755 });
      assert.match(probe(inRepo, { ...base, PATH: `${bin}:/usr/bin:/bin` }), /^refused/, 'a lying git');
    } finally {
      fs.rmSync(bin, { recursive: true, force: true });
    }
    // scratch stays admitted with a working git, and a misdirecting GIT_DIR cannot change that answer …
    const scratch = path.join(os.tmpdir(), 'maya-shell-scratch-probe', 'backend.local.env');
    assert.equal(probe(scratch, process.env), 'admitted');
    assert.equal(probe(scratch, { ...process.env, GIT_DIR: path.join(SH, '..', '.git'), GIT_WORK_TREE: path.join(SH, '..') }), 'admitted');
    // … but without git the fence cannot tell, so it refuses even there (fail closed)
    assert.match(probe(scratch, { ...base, PATH: '/usr/sbin' }), /^refused: .*cannot tell/);
  });

  test('the backend launch fence reads the EFFECTIVE environment: an inherited DATABASE_URL, HOST or PORT that overrides the env file is refused before main.js loads (integration finding)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-shell-launch-'));
    try {
      const envFile = path.join(dir, 'backend.local.env');
      fs.writeFileSync(envFile, serializeEnv(buildEnv()), { mode: 0o600 });
      const main = path.join(dir, 'main.mjs');
      fs.writeFileSync(main, "console.log('MAIN RAN ' + process.env.DATABASE_URL.split('@')[1]);\n");
      const guard = path.join(SH, 'dev', 'local-api-guard.mjs');
      const run = (env) => spawnSync(process.execPath, [`--env-file=${envFile}`, `--import=${guard}`, main], { encoding: 'utf8', env });
      const scrubbed = run({ PATH: process.env.PATH, HOME: os.homedir() });
      assert.equal(scrubbed.status, 0, scrubbed.stderr);
      assert.match(scrubbed.stdout, /MAIN RAN 127\.0\.0\.1:55611\/maya_widget_gate_proof_local/);
      for (const [key, value, reason] of [
        ['DATABASE_URL', 'postgresql://maya@127.0.0.1:5432/maya_widget_gate_proof_local', /5432/],
        ['HOST', '0.0.0.0', /HOST/],
        ['PORT', '3107', /PORT/],
        ['OPENAI_API_KEY', 'sk-not-a-real-key', /OPENAI_API_KEY/],
      ]) {
        const r = run({ PATH: process.env.PATH, HOME: os.homedir(), [key]: value });
        assert.notEqual(r.status, 0, `${key}: ${r.stdout}`);
        assert.doesNotMatch(r.stdout, /MAIN RAN/, key);
        assert.match(r.stderr, reason, key);
      }
      // The launch command itself scrubs the inherited environment: the same inherited 5432 URL runs
      // main against the proof DB, because `env -i` dropped it and the guard saw the file's value.
      const command = launchCommand({ envFile, cwd: dir, main });
      assert.match(command, /exec env -i /);
      assert.ok(command.includes(`--import='${guard}'`));
      const launched = spawnSync('sh', ['-c', command], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'postgresql://maya@127.0.0.1:5432/x', NODE_OPTIONS: '--require=/nonexistent' } });
      assert.equal(launched.status, 0, launched.stderr);
      assert.match(launched.stdout, /MAIN RAN 127\.0\.0\.1:55611\/maya_widget_gate_proof_local/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('evidence label: pre-HEAD whenever the binary source commit is not HEAD (V2-14)', () => {
    assert.equal(binaryLabel('abc', 'abc'), 'HEAD binary');
    assert.equal(binaryLabel('abc', 'def'), 'pre-HEAD binary');
    assert.match(binaryLabel('abc', null), /^pre-HEAD binary/);
  });
});

// ── only with --api: the real binary ───────────────────────────────────────────────────────────

describe('local API on the isolated proof DB (D6, V2-5, V2-6, V2-16)', () => {
  const NOT_GIVEN = 'LOCAL API NOT GIVEN — skipped, this is NOT a PASS (run with --api, --env and --fixture)';
  const evidence = { startedAt: new Date().toISOString(), api: API, results: {}, notExercised: {} };
  let dev;
  let devRoot;
  let base;
  let credentials;
  let envPath;
  const subjects = new Set();
  const record = (key, value) => {
    evidence.results[key] = value;
  };

  before(async () => {
    if (!API) return;
    const upstream = assertLocalUpstream(API);
    assert.ok(ENV_FILE && FIXTURE_FILE, '--env and --fixture are required with --api');
    envPath = path.resolve(ENV_FILE);
    credentials = JSON.parse(fs.readFileSync(path.resolve(FIXTURE_FILE), 'utf8'));
    evidence.binary = binaryProvenance();
    evidence.upstreamHost = upstream.hostname;
    evidence.fixture = { slug: credentials.slug, access: credentials.access };
    devRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-shell-api-root-'));
    dev = createDevServer({ root: devRoot, api: API });
    const { port } = await dev.listen(0);
    base = `http://127.0.0.1:${port}/api`;
    subjects.add('127.0.0.1');
  });

  after(async () => {
    if (!API) return;
    await dev?.close();
    if (devRoot) fs.rmSync(devRoot, { recursive: true, force: true });
    evidence.finishedAt = new Date().toISOString();
    const ledger = path.join(path.dirname(envPath), 'rate-limit-subjects.json');
    const existing = fs.existsSync(ledger) ? JSON.parse(fs.readFileSync(ledger, 'utf8')).subjects ?? [] : [];
    fs.writeFileSync(ledger, `${JSON.stringify({ note: 'rate-limit subjects used by S7 local-API runs (dev-only)', subjects: [...new Set([...existing, ...subjects])] }, null, 2)}\n`, { mode: 0o600 });
    if (EVIDENCE_FILE) {
      const out = assertScratchPath(EVIDENCE_FILE);
      fs.writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`);
    }
  });

  const post = async (p, body, token = null, raw = false) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}${p}`, { method: 'POST', headers, body: raw ? body : JSON.stringify(body) });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // not JSON
    }
    return { status: res.status, headers: Object.fromEntries(res.headers), json, text };
  };
  const password = () => ({ tenantSlug: credentials.slug, email: credentials.email, password: credentials.password });
  const loginHint = (slug, email) => JSON.stringify([slug.trim().toLowerCase(), email.trim().toLowerCase()]);
  const fixtureBody = (rel) => loadApiFixture(rel).body;
  const keys = (o) => Object.keys(o ?? {}).sort();

  test('health, and password sign-in with the typed business address (V2-6)', async (t) => {
    if (!API) return t.skip(NOT_GIVEN);
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    subjects.add(loginHint(credentials.slug, credentials.email));
    const signed = await post('/auth/login', password());
    assert.equal(signed.status, loadApiFixture('auth/login.201.json').status);
    assert.deepEqual(keys(signed.json), keys(fixtureBody('auth/login.201.json')));
    assert.deepEqual(keys(signed.json.user), keys(fixtureBody('auth/login.201.json').user));
    assert.deepEqual(keys(signed.json.session), keys(fixtureBody('auth/login.201.json').session));
    assert.equal(signed.json.user.tenant.name, credentials.tenantName, 'tenant nested at user.tenant');
    assert.equal(signed.json.tenant, undefined, 'no top-level tenant on /auth/login');
    assert.equal(signed.json.user.name, credentials.userName);
    record('password_sign_in', { status: signed.status, keys: keys(signed.json), userTenantNested: true });

    subjects.add(loginHint('platform', credentials.email));
    const slugless = await post('/auth/login', { email: credentials.email, password: credentials.password });
    assert.deepEqual([slugless.status, slugless.json], [401, fixtureBody('auth/errors/login-invalid-credentials.401.json')]);
    const wrong = await post('/auth/login', { ...password(), password: `${credentials.password}x` });
    assert.deepEqual([wrong.status, wrong.json], [401, fixtureBody('auth/errors/login-invalid-credentials.401.json')]);
    const unknownSlug = 'shell-p1-00000000000000';
    subjects.add(loginHint(unknownSlug, credentials.email));
    const unknown = await post('/auth/login', { ...password(), tenantSlug: unknownSlug });
    assert.deepEqual([unknown.status, unknown.json], [404, fixtureBody('auth/errors/tenant-not-found.404.json')]);
    const invalid = await post('/auth/login', { tenantSlug: credentials.slug, email: 'nope', password: '1' });
    assert.deepEqual([invalid.status, invalid.json], [400, validateDto({ tenantSlug: credentials.slug, email: 'nope', password: '1' }, LOGIN_DTO)]);
    record('sign_in_failures_password', {
      slugless_401: slugless.status,
      wrong_password_401: wrong.status,
      unknown_business_404: unknown.status,
      validation_400_matches_mock: true,
      finding: 'an unknown business address answers 404 «Tenant not found», not 401 (not a §1.4 row)',
    });
  });

  test('D6: an untruncated 3 500-char assistant item gets 400; the 2 000-unit cut gets 201', async (t) => {
    if (!API) return t.skip(NOT_GIVEN);
    const token = (await post('/auth/login', password())).json.access_token;
    const long = loadApiFixture('ai/chat.201.long-reply.json').body.reply;
    const untruncated = await post('/ai/chat', { surface: 'web', requestId: `shell-d6-${Date.now()}-a`, messages: [{ role: 'user', content: 'Привет' }, { role: 'assistant', content: long }, { role: 'user', content: 'Дальше' }] }, token);
    assert.equal(untruncated.status, 400);
    assert.equal(untruncated.json.error.field, 'messages.1.content');
    assert.deepEqual(untruncated.json, validateDto({ surface: 'web', requestId: 'shell-d6-x-a', messages: [{ role: 'user', content: 'Привет' }, { role: 'assistant', content: long }, { role: 'user', content: 'Дальше' }] }, AI_CORE_CHAT_DTO));
    let cut = long.slice(0, 2000);
    if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
    const truncated = await post('/ai/chat', { surface: 'web', requestId: `shell-d6-${Date.now()}-b`, messages: [{ role: 'user', content: 'Привет' }, { role: 'assistant', content: cut }, { role: 'user', content: 'Дальше' }] }, token);
    assert.equal(truncated.status, loadApiFixture('ai/chat.201.reply.json').status, truncated.text);
    assert.equal(typeof truncated.json.reply, 'string');
    assert.deepEqual(keys(truncated.json).filter((k) => !['widget', 'widget_data'].includes(k)), keys(fixtureBody('ai/chat.201.reply.json')));
    record('d6_history', { untruncated: untruncated.status, truncated: truncated.status, cutLength: cut.length, replySource: truncated.json.source });
    const bad = await post('/ai/chat', { surface: 'web', requestId: 'shell-d6-bad', messages: [{ role: 'user', content: 'x' }], audience: 'owner', tenant: 'x' }, token);
    assert.deepEqual([bad.status, bad.json], [400, validateDto({ surface: 'web', requestId: 'shell-d6-bad', messages: [{ role: 'user', content: 'x' }], audience: 'owner', tenant: 'x' }, AI_CORE_CHAT_DTO)]);
  });

  test('approval_required attempt (V2-5): PASS only if the binary reaches an approval-gated tool', async (t) => {
    if (!API) return t.skip(NOT_GIVEN);
    const token = (await post('/auth/login', password())).json.access_token;
    const res = await post('/ai/chat', { surface: 'web', requestId: `shell-appr-${Date.now()}`, messages: [{ role: 'user', content: 'Запиши меня на стрижку завтра в 12:00' }] }, token);
    assert.equal(res.status, 201, res.text);
    const status = res.json.action?.status ?? null;
    if (status === 'approval_required') {
      assert.deepEqual(keys(res.json.action), ['approval', 'status']);
      record('approval_required', { outcome: 'PASS', actionStatus: status });
    } else {
      evidence.notExercised.approval_required = {
        outcome: 'NOT EXERCISED',
        actionStatus: status,
        toolsUsed: (res.json.tools_used ?? []).map((u) => u.name),
        reason: 'AI_CORE_PROVIDER=safe has no model candidates (ai-core-model.service.ts:1323-1325) and no preset tool call is approval-gated; the mock scenario is the P1 proof',
      };
    }
  });

  test('email OTP (debug code): wrong code → 400 email_code_invalid, right code → session with top-level tenant; refresh rotation and reuse', async (t) => {
    if (!API) return t.skip(NOT_GIVEN);
    subjects.add(JSON.stringify(['*', credentials.email]));
    const start = await post('/auth/email/start', { email: credentials.email });
    assert.equal(start.status, loadApiFixture('auth/email-start.201.json').status, start.text);
    assert.deepEqual(keys(start.json), keys(fixtureBody('auth/email-start.201.json')));
    assert.equal(start.json.next_step, 'verify_email_code');
    const wrongCode = start.json.debug_code === '000000' ? '111111' : '000000';
    const wrong = await post('/auth/email/verify', { email: credentials.email, code: wrongCode });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.json.error.code, 'email_code_invalid');
    assert.deepEqual(keys(wrong.json.error), keys(fixtureBody('auth/errors/email-code-invalid.400.json').error));
    const verified = await post('/auth/email/verify', { email: credentials.email, code: start.json.debug_code });
    assert.equal(verified.status, loadApiFixture('auth/email-verify.201.session.json').status, verified.text);
    assert.deepEqual(keys(verified.json), keys(fixtureBody('auth/email-verify.201.session.json')));
    assert.equal(verified.json.tenant.name, credentials.tenantName);
    const again = await post('/auth/email/verify', { email: credentials.email, code: start.json.debug_code });
    assert.equal(again.status, 400);
    assert.equal(again.json.error.code, 'email_code_missing', 'a consumed code is missing');
    record('email_otp', { start: start.status, wrongCode: wrong.json.error.code, verify: verified.status, reuse: again.json.error.code, select_business: 'NOT EXERCISED (one membership by design; the mock proves it)' });

    subjects.add(verified.json.refresh_token);
    const refreshed = await post('/auth/refresh', { refreshToken: verified.json.refresh_token });
    assert.equal(refreshed.status, loadApiFixture('auth/refresh.201.json').status, refreshed.text);
    assert.deepEqual(keys(refreshed.json), keys(fixtureBody('auth/refresh.201.json')));
    subjects.add(refreshed.json.refresh_token);
    const reused = await post('/auth/refresh', { refreshToken: verified.json.refresh_token });
    assert.deepEqual([reused.status, reused.json], [401, fixtureBody('auth/errors/refresh-token-reused.401.json')]);
    const afterReuse = await post('/auth/refresh', { refreshToken: refreshed.json.refresh_token });
    assert.deepEqual([afterReuse.status, afterReuse.json.error.code], [401, 'session_revoked']);
    record('refresh', { rotated: refreshed.status, reuse: reused.json.error.code, afterReuse: afterReuse.json.error.code });
  });

  test('logout revokes the session; transcribe without a provider key answers 503 (voice is verified with mocks)', async (t) => {
    if (!API) return t.skip(NOT_GIVEN);
    const token = (await post('/auth/login', password())).json.access_token;
    const header = Buffer.alloc(44);
    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(36 + 1600, 4);
    header.write('WAVEfmt ', 8, 'ascii');
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(16000, 24);
    header.writeUInt32LE(32000, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36, 'ascii');
    header.writeUInt32LE(1600, 40);
    const wav = Buffer.concat([header, Buffer.alloc(1600)]).toString('base64');
    const transcribe = await post('/ai/transcribe', { audioBase64: `data:audio/wav;base64,${wav}` }, token);
    assert.deepEqual([transcribe.status, transcribe.json], [503, fixtureBody('ai/errors/speech-provider-unavailable.503.json')]);
    const badAudio = await post('/ai/transcribe', { audioBase64: 'AAAA' }, token);
    assert.deepEqual([badAudio.status, badAudio.json.error.code], [400, 'invalid_speech_audio']);
    const logout = await post('/auth/logout', {}, token);
    assert.deepEqual([logout.status, logout.json], [loadApiFixture('auth/logout.201.json').status, { ok: true, revoked: true }]);
    const afterLogout = await post('/ai/chat', { surface: 'web', requestId: `shell-out-${Date.now()}`, messages: [{ role: 'user', content: 'x' }] }, token);
    assert.equal(afterLogout.status, 401);
    record('logout_transcribe', { transcribe: transcribe.status, badAudio: badAudio.status, logout: logout.status, chatAfterLogout: afterLogout.status, afterLogoutBody: afterLogout.json });
  });

  test('402 provoked on the fixture tenant only (trialEndsAt in the past), then restored', async (t) => {
    if (!API) return t.skip(NOT_GIVEN);
    const token = (await post('/auth/login', password())).json.access_token;
    const fixtureScript = path.join(SH, 'dev', 'local-api-fixture.mjs');
    const provoke = spawnSync(process.execPath, [fixtureScript, `--env=${envPath}`, '--provoke-402', `--slug=${credentials.slug}`], { encoding: 'utf8' });
    try {
      assert.equal(provoke.status, 0, provoke.stderr);
      const refused = await post('/ai/chat', { surface: 'web', requestId: `shell-402-${Date.now()}`, messages: [{ role: 'user', content: 'x' }] }, token);
      assert.equal(refused.status, 402, refused.text);
      assert.deepEqual(keys(refused.json.error), keys(fixtureBody('ai/errors/subscription-required.402.json').error));
      record('provoked_402', { status: refused.status, code: refused.json.error.code });
    } finally {
      const restore = spawnSync(process.execPath, [fixtureScript, `--env=${envPath}`, '--restore-402', `--slug=${credentials.slug}`], { encoding: 'utf8' });
      assert.equal(restore.status, 0, restore.stderr);
    }
    const restored = await post('/ai/chat', { surface: 'web', requestId: `shell-402r-${Date.now()}`, messages: [{ role: 'user', content: 'x' }] }, token);
    assert.equal(restored.status, 201, restored.text);
  });

  test('429 auth_rate_limited with Retry-After through the relay (provoked with a non-user identity on the fixture tenant)', async (t) => {
    if (!API) return t.skip(NOT_GIVEN);
    const email = `${credentials.slug}-ratelimit@shell-fixture.local`;
    subjects.add(loginHint(credentials.slug, email));
    let limited = null;
    for (let i = 0; i < 14 && !limited; i += 1) {
      const res = await post('/auth/login', { tenantSlug: credentials.slug, email, password: 'not-the-password-1' });
      if (res.status === 429) limited = res;
      else assert.equal(res.status, 401, res.text);
    }
    assert.ok(limited, 'no 429 within 14 attempts');
    assert.match(limited.headers['retry-after'] ?? '', /^\d+$/);
    assert.deepEqual(keys(limited.json.error), keys(fixtureBody('auth/errors/auth-rate-limited.429.json').error));
    record('provoked_429', { status: 429, retryAfter: limited.headers['retry-after'], code: limited.json.error.code });
  });
});

// Direct run: `node test/local-api.history.test.mjs --api=…` executes the suites above via node:test.
