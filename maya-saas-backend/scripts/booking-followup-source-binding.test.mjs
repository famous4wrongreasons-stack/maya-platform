// Execute the real source-binding preflight in a disposable Git fixture. Stop
// before database creation, builds, browser launch or external transports.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
const source = path.join(path.dirname(fileURLToPath(import.meta.url)), 'booking-confirmation-proof.mjs');
const helper = 'test/widgets-diagnostics/support/booking-followup-native.ts';
const text = 'export const syntheticOnly = true;\n';
function preflight(dirty) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-binding-preflight-'));
  try {
    const backend = path.join(root, 'maya-saas-backend');
    fs.mkdirSync(path.join(backend, 'scripts'), { recursive: true });
    fs.mkdirSync(path.dirname(path.join(backend, helper)), { recursive: true });
    fs.mkdirSync(path.join(root, 'tmp'));
    const runner = fs.readFileSync(source, 'utf8');
    const boundary = 'const save = () =>';
    assert.equal(runner.split(boundary).length, 2, 'exact preflight boundary');
    fs.writeFileSync(path.join(backend, 'scripts/booking-confirmation-proof.mjs'), runner.slice(0, runner.indexOf(boundary)) + '\nconsole.log(JSON.stringify({ sourceHashes }));\n');
    fs.writeFileSync(path.join(backend, helper), text);
    const env = { PATH: process.env.PATH, HOME: root, TMPDIR: path.join(root, 'tmp'), LANG: 'C' };
    const git = (...args) => execFileSync('git', ['-c', 'user.name=Synthetic Proof', '-c', 'user.email=proof@example.invalid', ...args], { cwd: root, env, stdio: 'pipe' });
    git('init', '-q'); git('add', '.'); git('commit', '-qm', 'synthetic source-binding fixture');
    if (dirty) fs.appendFileSync(path.join(backend, helper), '// changed after committed candidate\n');
    const result = spawnSync(process.execPath, [path.join(backend, 'scripts/booking-confirmation-proof.mjs'), '--run', '--browser-only', '--exact-followup', '--native-followup', '--output', path.join(root, 'proof')], { cwd: backend, env, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.error, undefined); assert.equal(result.signal, null);
    return result;
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
test('native followup preflight hashes its relocated provider fixture', () => {
  const r = preflight(false); assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).sourceHashes[helper], createHash('sha256').update(text).digest('hex'));
});
test('changed relocated fixture refuses exact-source proof before database/bootstrap', () => {
  const r = preflight(true); assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Commit exact source before the proof/);
});
