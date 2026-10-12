// Native synthetic storage only: this suite never opens a Keychain or the UI.
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { buildHelper } from './build-local-keychain-helper.mjs';
import {
  assertKeychainHelper,
  readKeychainCredential,
  readCredentialFromHelper,
  validateKeychainSource,
} from './local-keychain-source.mjs';
import { writePartnerPipe } from './local-credential-pipe.mjs';
import { installLocalPartnerCredential } from './local-owner-keychain.mjs';

const root = fs.mkdtempSync('/private/tmp/maya-keychain-test-');
let source;
before(() => {
  source = {
    ...buildHelper(path.join(root, 'synthetic'), true).source,
    storageApprovalRef: 'SYNTHETIC_MEMORY_ONLY_NOT_REAL_STORAGE',
  };
});
after(() => fs.rmSync(root, { recursive: true, force: true }));
const options = () => ({ assertCurrent() {}, timeoutMs: 3000 });

test('native memory enrollment, duplicate, restart, lock, delete and rollback', () => {
  assert.equal(
    execFileSync(source.reference, ['--self-test'], {
      env: { PATH: '/usr/bin:/bin' },
      encoding: 'utf8',
    }).trim(),
    'MEMORY_ONLY_SETUP_RESTART_LOCK_DELETE_ROLLBACK_PASS',
  );
});
test('synthetic binary refuses setup and stdout export, without touching real storage', () => {
  assert.throws(() =>
    execFileSync(source.reference, ['--setup'], {
      env: { PATH: '/usr/bin:/bin' },
      stdio: 'ignore',
    }),
  );
  assert.throws(() =>
    execFileSync(source.reference, ['--read', 'deepseek'], {
      env: { PATH: '/usr/bin:/bin' },
      stdio: 'ignore',
    }),
  );
});
test('two exact native items travel only through fd3; new process needs no enrollment', async () => {
  let launches = 0;
  const io = {
    verify: assertKeychainHelper,
    spawn(file, args, config) {
      launches++;
      assert.equal(file, source.reference);
      assert.deepEqual(config.env, { PATH: '/usr/bin:/bin' });
      assert.deepEqual(config.stdio, ['ignore', 'ignore', 'ignore', 'pipe']);
      assert.ok(['deepseek', 'yclientsPartner'].includes(args[1]));
      return spawn(file, args, config);
    },
  };
  for (let run = 0; run < 2; run++) {
    assert.equal(
      await readCredentialFromHelper(source, 'deepseek', options(), io),
      'SYNTHETIC_DEEPSEEK_KEY_ONLY',
    );
    assert.equal(
      await readCredentialFromHelper(source, 'yclientsPartner', options(), io),
      'SYNTHETIC_PARTNER_KEY_ONLY',
    );
  }
  assert.equal(launches, 4);
});
for (const [label, patch] of [
  ['hash', { sha256: '0'.repeat(64) }],
  ['signature', { cdhash: '0'.repeat(40) }],
  ['owner', { owner: source?.owner ?? 999999, reader: 999999 }],
  ['source shape', { extra: 'refused' }],
  ['ambient file', { kind: 'file' }],
  ['unapproved storage', { storageApprovalRef: 'PREPARED_NOT_AUTHORIZED' }],
])
  test(label + ' refuses before secret output', async () => {
    await assert.rejects(
      readKeychainCredential({ ...source, ...patch }, 'deepseek', options()),
    );
  });
test('unknown credential and missing admission refuse before helper launch', async () => {
  let launched = false;
  const io = {
    verify: assertKeychainHelper,
    spawn() {
      launched = true;
      throw Error('must not launch');
    },
  };
  await assert.rejects(
    readCredentialFromHelper(source, 'telegram', options(), io),
  );
  await assert.rejects(
    readCredentialFromHelper(
      source,
      'deepseek',
      {
        ...options(),
        assertCurrent() {
          throw Error('expired permit');
        },
      },
      io,
    ),
  );
  assert.equal(launched, false);
});
test('helper symlink and writable replacement are refused', () => {
  const link = path.join(
    root,
    'linked',
    'MayaLocalCredentials.app',
    'Contents',
    'MacOS',
  );
  fs.mkdirSync(link, { recursive: true });
  fs.symlinkSync(source.reference, path.join(link, 'MayaLocalCredentials'));
  assert.throws(() =>
    assertKeychainHelper({
      ...source,
      reference: path.join(link, 'MayaLocalCredentials'),
    }),
  );
  fs.chmodSync(source.reference, 0o722);
  try {
    assert.throws(() => assertKeychainHelper(source));
  } finally {
    fs.chmodSync(source.reference, 0o500);
  }
});

function fakeIo({
  data,
  exit = 0,
  delay = 0,
  error = false,
  hang = false,
  onStart = () => {},
} = {}) {
  const child = new EventEmitter();
  child.stdio = [null, null, null, new PassThrough()];
  let reaped = false,
    killed = false;
  let timer;
  const close = (code, signal) => {
    if (reaped) return;
    reaped = true;
    clearTimeout(timer);
    child.stdio[3].end();
    child.emit('close', code, signal);
  };
  child.kill = () => {
    killed = true;
    setImmediate(() => close(null, 'SIGKILL'));
    return true;
  };
  return {
    get killed() {
      return killed;
    },
    get reaped() {
      return reaped;
    },
    io: {
      verify() {},
      spawn() {
        onStart();
        timer = setTimeout(() => {
          if (error) {
            child.emit('error', Error('SYNTHETIC_PRIVATE_ERROR'));
            close(null, null);
            return;
          }
          if (data) child.stdio[3].write(data);
          if (!hang) close(exit, null);
        }, delay);
        return child;
      },
    },
  };
}
for (const [label, spec] of [
  ['locked or denied', { exit: 70 }],
  ['missing item', { exit: 70 }],
  ['oversize', { data: Buffer.alloc(5000, 65) }],
  ['malformed', { data: Buffer.from('invalid\nvalue') }],
  ['spawn failure', { error: true }],
  ['timeout', { hang: true }],
]) {
  test(
    label + ' closes owned helper and reports only a fixed error',
    async () => {
      const f = fakeIo(spec);
      await assert.rejects(
        readCredentialFromHelper(
          source,
          'deepseek',
          { ...options(), timeoutMs: 200 },
          f.io,
        ),
        { message: 'local_keychain_refused' },
      );
      assert.equal(f.reaped, true);
      if (spec.data) assert.ok(spec.data.every((byte) => byte === 0));
    },
  );
}
for (const reason of ['revoked', 'expired', 'cancelled'])
  test(
    reason + ' during helper read refuses and reaps before returning',
    async () => {
      let current = true;
      const abort = new AbortController();
      const f = fakeIo({
        hang: true,
        data: Buffer.from('SYNTHETIC_PARTIAL_VALUE'),
        onStart: () =>
          setTimeout(() => {
            current = false;
            if (reason === 'cancelled') abort.abort();
          }, 25),
      });
      await assert.rejects(
        readCredentialFromHelper(
          source,
          'deepseek',
          {
            timeoutMs: 3000,
            signal: abort.signal,
            assertCurrent() {
              if (!current) throw Error('not current');
            },
          },
          f.io,
        ),
        { message: 'local_keychain_refused' },
      );
      assert.equal(f.reaped, true);
      assert.equal(f.killed, true);
    },
  );
test('post-read admission and signature reread refuse a changed source', async () => {
  let checks = 0;
  const f = fakeIo({ data: Buffer.from('SYNTHETIC_VALID_MODEL_KEY') });
  await assert.rejects(
    readCredentialFromHelper(source, 'deepseek', options(), {
      ...f.io,
      verify() {
        if (++checks > 1) throw Error('changed');
      },
    }),
  );
  assert.equal(checks, 2);
  assert.equal(f.reaped, true);
});
test('native fd3 → parent → runtime fd4 never puts either value in argv/environment', async () => {
  const partner = await readKeychainCredential(
    source,
    'yclientsPartner',
    options(),
  );
  const moduleUrl = new URL('./local-credential-pipe.mjs', import.meta.url)
    .href;
  const code = `import {readPartnerPipe} from ${JSON.stringify(moduleUrl)}; const v=await readPartnerPipe(); if(Object.keys(process.env).some(k=>/TOKEN|KEY|SECRET/.test(k)))process.exit(71); if(v!=='SYNTHETIC_PARTNER_KEY_ONLY')process.exit(72); process.stdout.write('PIPE_ONLY_PASS');`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
    env: { PATH: '/usr/bin:/bin' },
    stdio: ['ignore', 'pipe', 'pipe', 'ignore', 'pipe'],
  });
  let out = '',
    err = '';
  child.stdout.on('data', (b) => (out += b));
  child.stderr.on('data', (b) => (err += b));
  const closed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  await writePartnerPipe(child.stdio[4], partner);
  assert.deepEqual(await closed, { code: 0, signal: null });
  assert.equal(out, 'PIPE_ONLY_PASS');
  assert.equal(err, '');
});
test('credential closure clears on stop and never falls back after revocation', () => {
  let reader,
    current = true;
  const clear = installLocalPartnerCredential(
    {
      installPartnerTokenReader(r) {
        reader = r;
      },
    },
    'SYNTHETIC_PARTNER_KEY_ONLY',
    () => {
      if (!current) throw Error('revoked');
    },
  );
  assert.equal(reader(), 'SYNTHETIC_PARTNER_KEY_ONLY');
  current = false;
  assert.throws(() => reader(), /revoked/);
  current = true;
  clear();
  assert.throws(() => reader(), /unavailable/);
});
test('missing fields and malformed item reference refuse', () => {
  for (const key of Object.keys(source)) {
    const value = { ...source };
    delete value[key];
    assert.throws(() => validateKeychainSource(value));
  }
});
