// Exercise the actual binding function against disposable Git repositories.
// Only its lexical repository/base projection are replaced; no production data,
// retained database, provider, credential or original worktree is used.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readSourceBinding } from './local-yclients-read.mjs';
import { sourceBinding } from './local-onboarding.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-binding-proof-'));
  fs.chmodSync(repo, 0o700);
  t.after(() => fs.rmSync(repo, { recursive: true }));
  const env = { PATH: process.env.PATH, HOME: repo, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'Synthetic proof', GIT_AUTHOR_EMAIL: 'proof@example.invalid',
    GIT_COMMITTER_NAME: 'Synthetic proof', GIT_COMMITTER_EMAIL: 'proof@example.invalid' };
  const git = args => execFileSync('git', args, { cwd: repo, env, encoding: 'utf8' }).trim();
  git(['init', '-q']);
  const names = ['z.mjs', 'a.mjs']; // Deliberately differs from ls-tree ordering.
  [...names, 'base.mjs'].forEach(name => fs.writeFileSync(path.join(repo, name), '// synthetic ' + name + '\n'));
  git(['add', '.']); git(['commit', '-qm', 'synthetic source only']);
  const base = { head: git(['rev-parse', 'HEAD']), files: [{ path: 'base.mjs', gitBlob: git(['rev-parse', 'HEAD:base.mjs']), sha256: digest(fs.readFileSync(path.join(repo, 'base.mjs'))) }] };
  const calls = [];
  const bind = ({ files = names, afterTree, output, baseOnly = false } = {}) => {
    // Evaluate the exported function unchanged, with only its lexical inputs
    // bound to this fixture. Real Git and real filesystem checks still execute.
    const execute = (command, args, options) => {
      calls.push(args);
      const result = execFileSync(command, args, { ...options, env });
      if (args[0] === 'ls-tree') afterTree?.();
      return output ? output(args, result) : result;
    };
    const baseBind = new Function('execFileSync', 'repo', 'sourcePaths', 'assert', 'fs', 'path', 'createHash', 'digest',
      'return (' + sourceBinding.toString() + ');')(execute, repo, ['base.mjs'], assert, fs, path, createHash, digest);
    if (baseOnly) return baseBind();
    return new Function('sourceBinding', 'execFileSync', 'repo', 'READ_SOURCE_FILES', 'assert', 'fs', 'path', 'createHash', 'digest',
      'return (' + readSourceBinding.toString() + ')();')(baseBind, execute, repo, files, assert, fs, path, createHash, digest);
  };
  return { repo, names, git, base, calls, bind };
}

test('binding batches tree metadata once and preserves exact bytes, hashes and declared order', t => {
  const f = fixture(t), result = f.bind();
  const expected = f.names.map(name => {
    const bytes = fs.readFileSync(path.join(f.repo, name));
    return { path: name, gitBlob: f.git(['rev-parse', 'HEAD:' + name]), sha256: digest(bytes) };
  });
  assert.deepEqual(result, { head: f.base.head, files: [...f.base.files, ...expected] });
  assert.equal(f.calls.filter(args => args[0] === 'ls-tree').length, 1);
  assert.equal(f.calls.filter(args => args[0] === 'status').length, 1);
  assert.equal(f.calls.filter(args => args[0] === 'rev-parse').length, 2);
});
test('binding refuses dirty tracked bytes and untracked required files', t => {
  const f = fixture(t);
  fs.appendFileSync(path.join(f.repo, f.names[0]), '// changed\n');
  assert.throws(() => f.bind(), /committed and clean/);
  fs.writeFileSync(path.join(f.repo, 'extra.mjs'), '// untracked');
  assert.throws(() => f.bind({ files: ['extra.mjs'] }), /committed and clean/);
});
test('binding refuses missing required files and directory substitution', t => {
  const f = fixture(t);
  assert.throws(() => f.bind({ files: ['absent.mjs'] }), /exact committed file/);
  fs.mkdirSync(path.join(f.repo, 'directory.mjs'));
  fs.writeFileSync(path.join(f.repo, 'directory.mjs/nested'), '// nested');
  f.git(['add', '.']); f.git(['commit', '-qm', 'synthetic directory substitution']);
  f.base.head = f.git(['rev-parse', 'HEAD']);
  assert.throws(() => f.bind({ files: ['directory.mjs'] }), /exact committed file/);
});
test('binding refuses a committed symlink', t => {
  const f = fixture(t);
  fs.symlinkSync(f.names[0], path.join(f.repo, 'link.mjs'));
  f.git(['add', '.']); f.git(['commit', '-qm', 'synthetic symlink']);
  f.base.head = f.git(['rev-parse', 'HEAD']);
  assert.throws(() => f.bind({ files: ['link.mjs'] }), /exact committed file/);
});
test('binding still hashes bytes after status and tree lookup (no metadata cache)', t => {
  const f = fixture(t);
  assert.throws(() => f.bind({ afterTree() { fs.appendFileSync(path.join(f.repo, f.names[0]), '// race\n'); } }), /source changed|committed and clean/);
});
test('binding refuses filesystem symlink substitution after tree lookup', t => {
  const f = fixture(t);
  assert.throws(() => f.bind({ afterTree() {
    fs.unlinkSync(path.join(f.repo, f.names[0])); fs.symlinkSync(f.names[1], path.join(f.repo, f.names[0]));
  } }));
});
test('binding refuses HEAD replacement during binding', t => {
  const f = fixture(t);
  assert.throws(() => f.bind({ afterTree() { f.git(['commit', '--allow-empty', '-qm', 'synthetic concurrent HEAD']); } }), /Source commit changed/);
});
test('binding refuses duplicate, missing, foreign and malformed tree metadata', t => {
  const f = fixture(t);
  for (const mutate of [
    text => text + text.split('\n')[0] + '\n',
    () => '',
    text => text.replace('a.mjs', 'foreign.mjs'),
    text => text.replace('100644', '160000'),
  ]) assert.throws(() => f.bind({ output: (args, text) => args[0] === 'ls-tree' ? mutate(text) : text }), /exact committed file|Required launcher source is not committed|Only committed ordinary source files/);
});
test('base-only owner retains its scope, required files and byte checks', t => {
  const f = fixture(t);
  assert.deepEqual(f.bind({ baseOnly: true }), f.base);
  fs.appendFileSync(path.join(f.repo, f.names[0]), '// extension dirty');
  assert.deepEqual(f.bind({ baseOnly: true }), f.base);
  assert.throws(() => f.bind(), /committed and clean/);
  fs.appendFileSync(path.join(f.repo, 'base.mjs'), '// base dirty');
  assert.throws(() => f.bind({ baseOnly: true }), /committed and clean/);
});
