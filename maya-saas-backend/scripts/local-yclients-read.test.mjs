// Pure launcher/TTY seams only. Public deterministic strings, no actual terminal,
// RNG, listener, build, PostgreSQL, AppModule or provider is exercised here.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import test from 'node:test';
import { PRIVATE_KEYS } from './local-onboarding-profile.mjs';
import { realReadEnvironment } from './local-yclients-read-profile.mjs';
import { sessionPlan } from './local-onboarding.mjs';
import { readSessionPlan, READ_SOURCE_FILES, LOCAL_READ_HEADERS, protectWebResponse, readSummaryProjection, partnerTokenShape, promptPartnerToken, LANDING_HTML } from './local-yclients-read.mjs';

const token = 'PublicTestPartnerToken_1234567890';
const options = { stateDirectory: '/private/tmp/local-yclients-read-unit-only', pgBin: '/opt/homebrew/opt/postgresql@16/bin', database: 'maya_local_onboarding_0123456789abcdef', pgPort: 55431, apiPort: 55432, webPort: 55433, minutes: 15 };
class FakeTTY extends EventEmitter {
  isTTY = true; isRaw = false; paused = true; modes = []; readableLength = 0; readableEncoding = null;
  get readableFlowing() { return !this.paused; }
  isPaused() { return this.paused; }
  setRawMode(value) { this.isRaw = value; this.modes.push(value); }
  pause() { this.paused = true; }
  resume() { this.paused = false; }
}
const tty = () => {
  const input = new FakeTTY(), writes = [];
  return { input, writes, output: { isTTY: true, write: text => writes.push(text) } };
};
const restored = fake => {
  assert.equal(fake.input.isRaw, false); assert.equal(fake.input.isPaused(), true);
  assert.equal(fake.input.listenerCount('data') + fake.input.listenerCount('end') + fake.input.listenerCount('error'), 0);
  assert.equal(fake.writes.join('').includes(token), false);
};

test('read session reuses exact preparation and cleanup without changing stage 0', () => {
  const before = sessionPlan(options), read = readSessionPlan(options), after = sessionPlan(options);
  assert.deepEqual(before, after); assert.deepEqual(read.setup, before.setup); assert.deepEqual(read.stop, before.stop);
  assert.equal(path.basename(read.runtime.args[0]), 'local-yclients-read-runtime.mjs');
  assert.equal(path.basename(before.runtime.args[0]), 'local-onboarding-runtime.mjs');
  assert.equal(read.runtime.cwd, options.stateDirectory);
  assert.equal(read.durationMs, 900000); assert.equal(read.promptDeadlineMs, 600000); assert.equal(read.preparationDeadlineMs, 900000);
  assert.throws(() => readSessionPlan({ ...options, minutes: 16 }));
  assert.throws(() => readSessionPlan({ ...options, database: 'existing_unowned_database' }));
});
test('all finite read-profile sources are explicitly bound and landing uses current form', () => {
  assert.equal(READ_SOURCE_FILES.length, 6); assert.equal(new Set(READ_SOURCE_FILES).size, 6);
  for (const name of ['local-yclients-read.mjs', 'local-yclients-read-profile.mjs', 'local-yclients-read-runtime.mjs', 'local-yclients-read-transport.mjs', 'local-yclients-read-profile.test.mjs', 'local-yclients-read.test.mjs']) assert.ok(READ_SOURCE_FILES.some(file => path.basename(file) === name));
  assert.ok(LANDING_HTML.includes('href="/?local_crm_setup=1"'));
  assert.ok(LANDING_HTML.includes('Партнёрский токен вводится скрыто'));
  assert.ok(LANDING_HTML.includes('Отдельная активация'));
  assert.equal(/<script|https?:\/\//.test(LANDING_HTML), false);
});
test('persistable preparation environment has no inherited partner or user credentials', () => {
  const keys = Object.fromEntries(PRIVATE_KEYS.map((name, index) => [name, (index + 1).toString(16).padStart(64, '0')]));
  const envOptions = { databaseUrl: `postgresql://maya_local_onboarding:${'f'.repeat(64)}@127.0.0.1:55431/maya_local_onboarding_0123456789abcdef`, keys, apiPort: options.apiPort, origin: `http://127.0.0.1:${options.webPort}`, stateDirectory: options.stateDirectory };
  const before = realReadEnvironment({ PATH: '/usr/bin:/bin', YCLIENTS_PARTNER_TOKEN: 'InheritedMustNotPass', YCLIENTS_USER_TOKEN: 'InheritedMustNotPass', OPENAI_API_KEY: 'InheritedMustNotPass' }, envOptions);
  assert.equal(Object.hasOwn(before, 'YCLIENTS_PARTNER_TOKEN'), false);
  assert.equal(Object.hasOwn(before, 'YCLIENTS_USER_TOKEN'), false);
  assert.equal(Object.hasOwn(before, 'OPENAI_API_KEY'), false);
  assert.equal(Object.hasOwn(before, 'MAYA_LOCAL_ONBOARDING_PROFILE'), false);
  assert.equal(before.MAYA_LOCAL_YCLIENTS_READ_PROFILE, 'read_setup_v1');
  const serializedBefore = JSON.stringify(before);
  const child = realReadEnvironment(before, envOptions, token);
  assert.equal(child.YCLIENTS_PARTNER_TOKEN, token);
  assert.equal(JSON.stringify(before), serializedBefore);
  assert.equal(serializedBefore.includes(token), false);
});
test('local web CSP and no-store headers override shared static/relay values', () => {
  const calls = [], response = { writeHead(...args) { calls.push(args); return this; } };
  protectWebResponse(response);
  assert.equal(response.writeHead(200, { 'content-security-policy': "default-src *", 'Cache-Control': 'public, immutable', 'referrer-policy': 'unsafe-url', 'Content-Type': 'application/json' }), response);
  assert.deepEqual(calls[0], [200, { 'Content-Type': 'application/json', ...LOCAL_READ_HEADERS }]);
  response.writeHead(403, 'Forbidden', { 'content-type': 'text/plain' });
  assert.deepEqual(calls[1], [403, 'Forbidden', { 'content-type': 'text/plain', ...LOCAL_READ_HEADERS }]);
  response.writeHead(204);
  assert.deepEqual(calls[2], [204, LOCAL_READ_HEADERS]);
  for (const directive of ["connect-src 'self'", "img-src 'self' data:", "font-src 'self'", "script-src 'self'", "form-action 'self'", "frame-ancestors 'none'"]) assert.ok(LOCAL_READ_HEADERS['Content-Security-Policy'].includes(directive));
});
test('partner shape is bounded printable ASCII without comma, whitespace or controls', () => {
  assert.equal(partnerTokenShape(token), true);
  assert.equal(partnerTokenShape('a'.repeat(4096)), true);
  for (const value of ['', 'a'.repeat(15), 'a'.repeat(4097), token + ',', token + ' ', token + '\n', token + '\0', token + 'я', [token], null]) assert.equal(partnerTokenShape(value), false);
});
test('runtime summary projects only closed bounded route-kind counters', () => {
  const valid = { type: 'read-summary', contract: 'maya.local-yclients-read/1', calls: 3, refused: 1, routes: { companies: 1, team: 2 } };
  assert.deepEqual(readSummaryProjection(valid), { calls: 3, refused: 1, routes: { companies: 1, team: 2 } });
  for (const changed of [
    { calls: 257 }, { calls: -1 }, { calls: 2 }, { refused: 0.5 }, { refused: -1 },
    { routes: { 'https://example.invalid/company/123': 3 } }, { routes: { team: 3, companyId: 0 } },
    { routes: [] }, { token: 'MustNotBeRecorded' }, { contract: 'other' }, { type: 'ready' },
  ]) assert.equal(readSummaryProjection({ ...valid, ...changed }), null);
});
test('hidden prompt returns exact explicit TTY bytes without echo and restores terminal', async () => {
  const fake = tty();
  const pending = promptPartnerToken(fake);
  const first = Buffer.from(token.slice(0, 8)), second = Buffer.from(token.slice(8) + 'x\x7f\r\n');
  fake.input.emit('data', first);
  fake.input.emit('data', second);
  assert.equal(await pending, token);
  assert.equal(first.every(byte => byte === 0), true); assert.equal(second.every(byte => byte === 0), true);
  restored(fake); assert.deepEqual(fake.input.modes, [true, false]);
});
test('hidden prompt refuses prebuffer, encoding or another reader before enabling raw input', async () => {
  for (const configure of [
    input => { input.readableLength = 1; }, input => { input.readableEncoding = 'utf8'; },
    input => { input.on('data', () => {}); }, input => { input.on('readable', () => {}); },
  ]) {
    const fake = tty(); configure(fake.input);
    await assert.rejects(promptPartnerToken(fake));
    assert.deepEqual(fake.input.modes, []); assert.deepEqual(fake.writes, []);
  }
});
test('hidden prompt refuses non-TTY, malformed, oversized and multiple values', async () => {
  await assert.rejects(promptPartnerToken({ ...tty(), input: { isTTY: false } }));
  await assert.rejects(promptPartnerToken({ ...tty(), output: { isTTY: false } }));
  for (const input of [token + ',\n', 'short\n', 'a'.repeat(4097), token + '\n' + token, token + '\x1b', token + '\u0410']) {
    const fake = tty(), pending = promptPartnerToken(fake);
    const bytes = Buffer.from(input); fake.input.emit('data', bytes);
    await assert.rejects(pending); restored(fake);
    assert.equal(bytes.every(byte => byte === 0), true);
  }
});
test('hidden prompt cancels on Ctrl-C, Ctrl-D, EOF and abort without echo', async () => {
  for (const ending of ['\x03', '\x04', null]) {
    const fake = tty(), pending = promptPartnerToken(fake);
    fake.input.emit('data', Buffer.from(token));
    if (ending === null) fake.input.emit('end'); else fake.input.emit('data', Buffer.from(ending));
    await assert.rejects(pending, { code: 'local_yclients_read_cancelled' }); restored(fake);
  }
  const abort = new AbortController(), fake = tty();
  const pending = promptPartnerToken({ ...fake, signal: abort.signal }); abort.abort();
  await assert.rejects(pending, { code: 'local_yclients_read_cancelled' }); restored(fake);
});
test('hidden prompt has a finite deadline and preserves an already-raw terminal', async () => {
  const fake = tty(); fake.input.isRaw = true; fake.input.paused = false;
  await assert.rejects(promptPartnerToken({ ...fake, timeoutMs: 5 }), /deadline/);
  assert.equal(fake.input.isRaw, true); assert.equal(fake.input.isPaused(), false);
  assert.equal(fake.input.listenerCount('data'), 0);
  await assert.rejects(promptPartnerToken({ ...tty(), timeoutMs: 600001 }));
});
