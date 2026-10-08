// Pure local source admission checks. No services, credentials, DB or model.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { assertCoreInventory } from './core-conversation-source.mjs';
function fixture(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-core-source-unit-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH, HOME: repo, GIT_CONFIG_NOSYSTEM: '1' },
    }).trim();
  git('init');
  const file = 'maya-saas-backend/src/frozen.ts';
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), '// frozen\n');
  git('add', file);
  git(
    '-c',
    'user.name=Synthetic',
    '-c',
    'user.email=synthetic@invalid',
    'commit',
    '-m',
    'synthetic',
  );
  return { repo, file, head: git('rev-parse', 'HEAD'), git };
}
test('source inventory admits the exact committed candidate', (t) => {
  const f = fixture(t);
  assertCoreInventory(f.head, [f.file], f.repo);
});
test('an added untracked migration refuses while all previously frozen hashes remain unchanged', (t) => {
  const f = fixture(t),
    file = path.join(
      f.repo,
      'maya-saas-backend/prisma/migrations/new/migration.sql',
    );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '-- synthetic unapproved migration\n');
  assert.throws(
    () => assertCoreInventory(f.head, [f.file], f.repo),
    /core_sources_uncommitted/,
  );
});
test('a clean new commit or an omitted tracked runtime file cannot reuse the manifest', (t) => {
  const f = fixture(t);
  assert.throws(
    () => assertCoreInventory(f.head, [], f.repo),
    /core_source_inventory_changed/,
  );
  f.git(
    '-c',
    'user.name=Synthetic',
    '-c',
    'user.email=synthetic@invalid',
    'commit',
    '--allow-empty',
    '-m',
    'changed',
  );
  assert.throws(
    () => assertCoreInventory(f.head, [f.file], f.repo),
    /core_candidate_changed/,
  );
});
