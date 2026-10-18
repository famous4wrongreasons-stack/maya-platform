import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { guardedNativeEgress } from './phone-native-run-guard.mjs';
import { LIFECYCLE_EGRESS_CONTRACT } from './phone-native-create-egress.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => JSON.stringify(value, null, 2) + '\n';
const NOW = Date.parse('2026-10-18T12:00:00Z');
const credential =
  'Bearer SYNTHETIC_RUN_GUARD_PARTNER, User SYNTHETIC_RUN_GUARD_USER';

function fixture(t) {
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), 'maya-native-run-'),
  );
  fs.chmodSync(root, 0o700);
  const installed = path.join(root, 'installed'),
    state = path.join(root, 'state');
  fs.mkdirSync(installed, { mode: 0o700 });
  fs.mkdirSync(state, { mode: 0o700 });
  const scope = {
    contract: LIFECYCLE_EGRESS_CONTRACT,
    maxReschedules: 1,
    maxCancels: 1,
    candidate: '6356db1875545337e34b6c8888b7ca858bb64361',
    profile: 'closed-input.no-handoff.no-price-goods@1',
    tenantId: 'synthetic-run-tenant',
    companyId: '450001',
    executionAuthorizationDigest: 'a'.repeat(64),
    credentialDigest: sha(credential),
    notBefore: new Date(NOW - 1000).toISOString(),
    expiresAt: new Date(NOW + 60000).toISOString(),
    maxReads: 64,
    maxCreates: 1,
  };
  const scopeFile = path.join(installed, 'scope.json');
  const bytes = canonical(scope);
  fs.writeFileSync(scopeFile, bytes, { mode: 0o600 });
  const calls = [],
    apps = [];
  let time = NOW,
    admitted = true,
    checks = 0;
  const options = {
    scopeFile,
    scopeSha256: sha(bytes),
    ledgerDirectory: state,
    operatorUid: process.getuid(),
    clock: () => time,
    assertCurrent(value) {
      checks++;
      // Explicitly synthetic external authority. Scope files do not supply it.
      return admitted && canonical(value) === bytes;
    },
    nativeFetch: async (...args) => {
      calls.push(args);
      return new Response('{"success":true,"data":[]}');
    },
  };
  const open = (patch = {}) => {
    const app = guardedNativeEgress({ ...options, ...patch });
    apps.push(app);
    return app;
  };
  t.after(async () => {
    for (const app of apps) {
      app.close();
      app.server.closeAllConnections();
      if (app.server.listening)
        await new Promise((resolve) => app.server.close(resolve));
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  const claim = path.join(
    state,
    scope.executionAuthorizationDigest + '.consumed',
  );
  const ledger = path.join(
    state,
    scope.executionAuthorizationDigest + '.jsonl',
  );
  const marker = path.join(
    state,
    scope.executionAuthorizationDigest + '.revoked',
  );
  return {
    root,
    installed,
    state,
    scope,
    scopeFile,
    bytes,
    options,
    open,
    calls,
    claim,
    ledger,
    marker,
    time: (n) => {
      time = n;
    },
    admit: (v) => {
      admitted = v;
    },
    checks: () => checks,
  };
}
async function listen(app) {
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
}
function request(
  app,
  method = 'GET',
  route = '/api/v1/services/450001',
  value,
) {
  return new Promise((resolve, reject) => {
    const body = value === undefined ? '' : JSON.stringify(value);
    const req = http.request(
      {
        host: '127.0.0.1',
        port: app.server.address().port,
        path: route,
        method,
        agent: false,
        headers: {
          authorization: credential,
          accept: 'application/vnd.yclients.v2+json',
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (b) => chunks.push(b));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString(),
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('error', (e) =>
      e.code === 'ECONNRESET' ? resolve({ socketLost: true }) : reject(e),
    );
    req.end(body);
  });
}

test('owned pinned scope plus independent admission opens the existing transport', async (t) => {
  const f = fixture(t),
    app = f.open();
  await listen(app);
  assert.equal((await request(app)).status, 200);
  assert.equal(f.calls.length, 1);
  assert(f.checks() > 3);
  assert.equal(app.snapshot().reads, 1);
  assert.deepEqual(
    fs.readdirSync(f.state).sort(),
    [path.basename(f.claim), path.basename(f.ledger)].sort(),
  );
  const text =
    fs.readFileSync(f.claim, 'utf8') + fs.readFileSync(f.ledger, 'utf8');
  assert(!text.includes(credential));
  assert(!text.includes(f.scope.tenantId));
  assert(!text.includes('services/450001'));
  assert.equal(fs.statSync(f.claim).mode & 0o777, 0o600);
});

for (const [name, check] of [
  ['missing', undefined],
  ['false', () => false],
  ['undefined', () => undefined],
  ['async', () => Promise.resolve(true)],
])
  test(
    'scope cannot replace ' + name + ' independent execution admission',
    (t) => {
      const f = fixture(t);
      assert.throws(
        () => f.open({ assertCurrent: check }),
        /phone_native_run_refused/,
      );
      assert.deepEqual(fs.readdirSync(f.state), []);
    },
  );

test('caller-selected ledger path is refused before any claim', (t) => {
  const f = fixture(t);
  assert.throws(() =>
    f.open({ ledgerPath: path.join(f.state, 'another.jsonl') }),
  );
  assert.deepEqual(fs.readdirSync(f.state), []);
});
test('valid scope substitution cannot borrow another execution authority', (t) => {
  const f = fixture(t);
  for (const patch of [
    { tenantId: 'synthetic-other-tenant' },
    { companyId: '450002' },
    { executionAuthorizationDigest: 'b'.repeat(64) },
    { credentialDigest: 'c'.repeat(64) },
  ]) {
    const bytes = canonical({ ...f.scope, ...patch });
    fs.writeFileSync(f.scopeFile, bytes);
    assert.throws(() => f.open({ scopeSha256: sha(bytes) }));
    assert.deepEqual(fs.readdirSync(f.state), []);
  }
});
test('restart cannot reset budget even after the attempt ledger disappears', (t) => {
  const f = fixture(t),
    app = f.open();
  app.close();
  fs.unlinkSync(f.ledger);
  assert.throws(() => f.open(), /phone_native_run_refused/);
  assert(fs.existsSync(f.claim));
  assert(!fs.existsSync(f.ledger));
});
test('changed scope pin cannot reset the same authorization namespace', (t) => {
  const f = fixture(t),
    app = f.open();
  app.close();
  fs.unlinkSync(f.ledger);
  const next = canonical({ ...f.scope, maxReads: 1 });
  fs.writeFileSync(f.scopeFile, next);
  assert.throws(() =>
    f.open({ scopeSha256: sha(next), assertCurrent: () => true }),
  );
  assert(!fs.existsSync(f.ledger));
});
test('failure after claim burns the run without a rollback or restart', (t) => {
  const f = fixture(t);
  let n = 0;
  assert.throws(() => f.open({ assertCurrent: () => ++n === 1 }));
  assert(fs.existsSync(f.claim));
  assert(!fs.existsSync(f.ledger));
  assert.throws(() => f.open());
});

for (const mode of [
  'scope-symlink',
  'scope-hardlink',
  'scope-mode',
  'parent-symlink',
  'parent-mode',
  'state-symlink',
  'state-mode',
  'wrong-owner',
  'digest',
  'duplicate-json',
  'oversize',
  'wildcard-tenant',
  'extra-authority',
  'expired',
  'future',
]) {
  test('installation refuses ' + mode + ' before claiming', (t) => {
    const f = fixture(t);
    let patch = {};
    if (mode === 'scope-symlink') {
      fs.renameSync(f.scopeFile, f.scopeFile + '.real');
      fs.symlinkSync(f.scopeFile + '.real', f.scopeFile);
    }
    if (mode === 'scope-hardlink')
      fs.linkSync(f.scopeFile, f.scopeFile + '.alias');
    if (mode === 'scope-mode') fs.chmodSync(f.scopeFile, 0o644);
    if (mode === 'parent-mode') fs.chmodSync(f.installed, 0o755);
    if (mode === 'state-mode') fs.chmodSync(f.state, 0o755);
    if (mode === 'parent-symlink') {
      fs.symlinkSync(f.installed, f.root + '/alias');
      patch.scopeFile = f.root + '/alias/scope.json';
    }
    if (mode === 'state-symlink') {
      fs.symlinkSync(f.state, f.root + '/alias');
      patch.ledgerDirectory = f.root + '/alias';
    }
    if (mode === 'wrong-owner') patch.operatorUid = process.getuid() + 1;
    if (mode === 'digest') patch.scopeSha256 = 'b'.repeat(64);
    if (
      [
        'duplicate-json',
        'oversize',
        'wildcard-tenant',
        'extra-authority',
      ].includes(mode)
    ) {
      const next =
        mode === 'duplicate-json'
          ? f.bytes.replace('{', '{"maxReads":64,')
          : mode === 'oversize'
            ? ' '.repeat(9000)
            : canonical({
                ...f.scope,
                ...(mode === 'wildcard-tenant'
                  ? { tenantId: '*' }
                  : { role: 'platform_owner' }),
              });
      fs.writeFileSync(f.scopeFile, next);
      patch.scopeSha256 = sha(next);
    }
    if (mode === 'expired') f.time(NOW + 60000);
    if (mode === 'future') f.time(NOW - 1001);
    assert.throws(() => f.open(patch));
    assert.deepEqual(fs.readdirSync(f.state), []);
  });
}

for (const mode of [
  'scope-replace',
  'scope-change',
  'claim-delete',
  'claim-replace',
  'state-replace',
  'marker',
  'dangling-marker',
  'expiry',
  'authority',
]) {
  test('current run refuses ' + mode + ' before dispatch', async (t) => {
    const f = fixture(t),
      app = f.open();
    await listen(app);
    if (mode === 'scope-replace') {
      fs.unlinkSync(f.scopeFile);
      fs.writeFileSync(f.scopeFile, f.bytes, { mode: 0o600 });
    }
    if (mode === 'scope-change') fs.appendFileSync(f.scopeFile, ' ');
    if (mode === 'claim-delete') fs.unlinkSync(f.claim);
    if (mode === 'claim-replace') {
      const bytes = fs.readFileSync(f.claim);
      fs.renameSync(f.claim, f.claim + '.old');
      fs.writeFileSync(f.claim, bytes, { mode: 0o600 });
    }
    if (mode === 'state-replace') {
      fs.renameSync(f.state, f.state + '.old');
      fs.mkdirSync(f.state, { mode: 0o700 });
    }
    if (mode === 'marker') fs.writeFileSync(f.marker, '', { mode: 0o600 });
    if (mode === 'dangling-marker')
      fs.symlinkSync(f.root + '/absent', f.marker);
    if (mode === 'expiry') f.time(NOW + 60000);
    if (mode === 'authority') f.admit(false);
    assert.equal((await request(app)).status, 403);
    assert.equal(f.calls.length, 0);
  });
}
test('restoring authority cannot revive a poisoned process', async (t) => {
  const f = fixture(t),
    app = f.open();
  await listen(app);
  f.admit(false);
  assert.equal((await request(app)).status, 403);
  f.admit(true);
  assert.equal((await request(app)).status, 403);
  assert.equal(f.calls.length, 0);
});
test('preexisting revocation including a dangling marker refuses startup', (t) => {
  const f = fixture(t);
  fs.symlinkSync(f.root + '/absent', f.marker);
  assert.throws(() => f.open());
  assert(!fs.existsSync(f.claim));
});
test('production default refuses a non-root test installation', (t) => {
  const f = fixture(t);
  assert.notEqual(process.getuid(), 0, 'Run as ordinary synthetic test user');
  const { operatorUid, ...options } = f.options;
  assert.throws(() => guardedNativeEgress(options));
  assert(!fs.existsSync(f.claim));
});
test('revocation after provider commit preserves uncertainty instead of a false rejection', async (t) => {
  const f = fixture(t);
  let release, entered;
  const started = new Promise((r) => {
    entered = r;
  });
  const response = new Promise((r) => {
    release = r;
  });
  let commits = 0;
  const app = f.open({
    nativeFetch: async () => {
      commits++;
      entered();
      return response;
    },
  });
  await listen(app);
  const pending = request(app, 'POST', '/api/v1/book_record/450001', {
    phone: '79990000001',
    fullname: 'Synthetic client',
    email: '',
    comment: '',
    type: 'mobile',
    notify_by_sms: 0,
    notify_by_email: 0,
    appointments: [
      { id: 1, services: [81], staff_id: 71, datetime: '2026-10-19T17:00:00' },
    ],
  });
  await started;
  fs.writeFileSync(f.marker, '', { mode: 0o600 });
  release(new Response('{"success":true,"data":[{"id":1,"record_id":123}]}'));
  assert.deepEqual(await pending, { socketLost: true });
  assert.equal(commits, 1);
  assert.equal(app.snapshot().uncertainTransport, 1);
  assert.equal((await request(app)).status, 403);
  assert.equal(commits, 1);
});

test('four concurrent processes consume one authorization at most once', async (t) => {
  const f = fixture(t);
  const moduleUrl = new URL('./phone-native-run-guard.mjs', import.meta.url)
    .href;
  const code = `import {guardedNativeEgress} from ${JSON.stringify(moduleUrl)};
    try { const app=guardedNativeEgress({scopeFile:process.argv[1],scopeSha256:process.argv[2],
      ledgerDirectory:process.argv[3],operatorUid:process.getuid(),clock:()=>${NOW},
      assertCurrent:()=>true,nativeFetch:()=>{throw Error('no external requests')}});
      app.close(); console.log('CLAIMED'); } catch { console.log('REFUSED'); }`;
  const results = await Promise.all(
    Array.from(
      { length: 4 },
      () =>
        new Promise((resolve, reject) => {
          const child = spawn(
            process.execPath,
            [
              '--input-type=module',
              '-e',
              code,
              f.scopeFile,
              f.options.scopeSha256,
              f.state,
            ],
            { stdio: ['ignore', 'pipe', 'pipe'] },
          );
          let text = '',
            error = '';
          child.stdout.on('data', (b) => {
            text += b;
          });
          child.stderr.on('data', (b) => {
            error += b;
          });
          const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
          child.once('error', reject);
          child.once('close', (code, signal) => {
            clearTimeout(timer);
            if (code !== 0 || signal || error)
              reject(Error('Synthetic child failed'));
            else resolve(text.trim());
          });
        }),
    ),
  );
  assert.equal(results.filter((x) => x === 'CLAIMED').length, 1);
  assert.equal(results.filter((x) => x === 'REFUSED').length, 3);
  assert(fs.existsSync(f.claim) && fs.existsSync(f.ledger));
});
