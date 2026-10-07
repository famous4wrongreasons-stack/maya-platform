import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { localProofProfile } from './current-candidate-local-profile.mjs';
function fixture(t) {
  const pgBin = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-profile-test-'));
  t.after(() => fs.rmSync(pgBin, { recursive: true, force: true }));
  for (const name of ['postgres', 'initdb', 'pg_ctl', 'createdb'])
    fs.writeFileSync(path.join(pgBin, name), 'synthetic binary', {
      mode: 0o700,
    });
  const calls = [];
  return {
    pgBin,
    platform: 'linux',
    nodeVersion: '24.15.0',
    calls,
    readVersion: (file) => {
      calls.push(file);
      return path.basename(file) + ' (PostgreSQL) 16.14 (synthetic)\n';
    },
  };
}
test('explicit installed profile reads exactly four versions and hashes without resource creation', (t) => {
  const f = fixture(t),
    before = fs.readdirSync(f.pgBin),
    result = localProofProfile(f);
  assert.equal(result.mode, 'NO_UPSTREAM_ONLY');
  assert.equal(result.pgBin, fs.realpathSync(f.pgBin));
  assert.equal(result.resourcesCreated, false);
  assert.equal(result.remoteServerQualified, false);
  assert.equal(result.credentialsRead, false);
  assert.equal(result.paidAuthorized, false);
  assert.equal(f.calls.length, 4);
  assert.deepEqual(fs.readdirSync(f.pgBin), before);
  for (const binary of Object.values(result.binaries)) {
    assert.equal(binary.version, '16.14');
    assert.match(binary.sha256, /^[a-f0-9]{64}$/);
  }
});
test('no remote directory guessing, relative path or unqualified Node major', () => {
  for (const options of [
    { platform: 'linux' },
    { pgBin: 'relative' },
    { pgBin: '/tmp', nodeVersion: '22.1.0' },
  ])
    assert.throws(() => localProofProfile(options), /candidate_/);
});
test('mixed or unsupported PG versions and malformed banners refuse', (t) => {
  const f = fixture(t);
  for (const readVersion of [
    () => 'postgres (PostgreSQL) 17.1',
    () => 'garbage',
    (file) =>
      path.basename(file) +
      ' (PostgreSQL) ' +
      (path.basename(file) === 'pg_ctl' ? '16.13' : '16.14'),
  ])
    assert.throws(() => localProofProfile({ ...f, readVersion }), /candidate_/);
});
test('missing or non-executable binaries and failed version reads refuse', (t) => {
  const f = fixture(t);
  assert.throws(
    () =>
      localProofProfile({
        ...f,
        readVersion: () => {
          throw new Error('synthetic timeout');
        },
      }),
    /timeout/,
  );
  fs.chmodSync(path.join(f.pgBin, 'initdb'), 0o600);
  assert.throws(() => localProofProfile(f));
  fs.unlinkSync(path.join(f.pgBin, 'createdb'));
  fs.chmodSync(path.join(f.pgBin, 'initdb'), 0o700);
  assert.throws(() => localProofProfile(f));
});
test('binary symlink cannot silently mix a second installation', (t) => {
  const f = fixture(t),
    other = fixture(t);
  fs.unlinkSync(path.join(f.pgBin, 'postgres'));
  fs.symlinkSync(
    path.join(other.pgBin, 'postgres'),
    path.join(f.pgBin, 'postgres'),
  );
  assert.throws(() => localProofProfile(f), /outside_install/);
});
test('CLI rejects conflicting preflight and invalid installation before creating output', (t) => {
  const f = fixture(t);
  const output = path.join(f.pgBin, 'must-not-exist');
  const script = new URL('./current-candidate-http.mjs', import.meta.url);
  for (const args of [
    ['--preflight', '--run', '--output', output],
    ['--run', '--output', output, '--pg-bin', path.join(f.pgBin, 'missing')],
  ]) {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(script), ...args],
      {
        encoding: 'utf8',
        timeout: 5000,
        env: { LANG: 'C', TZ: 'UTC' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /candidate_profile_mode_conflict|ENOENT/);
    assert.equal(fs.existsSync(output), false);
  }
});
