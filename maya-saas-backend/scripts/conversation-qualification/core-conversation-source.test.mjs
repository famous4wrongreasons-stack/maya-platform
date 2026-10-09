// Pure local source admission checks. No services, credentials, DB or model.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import {
  assertCoreInventory,
  assertCoreSources,
  captureCoreManifest,
} from './core-conversation-source.mjs';
import { coreConversationProfile } from './core-conversation-profile.mjs';
import { CORE_FOLLOWUP_PROFILE } from './current-candidate-budget.mjs';
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
test('source owner rejects cross-profile pins before any candidate or content read', () => {
  const a = coreConversationProfile(),
    b = coreConversationProfile(CORE_FOLLOWUP_PROFILE);
  const data = JSON.parse(
    fs.readFileSync(
      new URL('../../../' + b.datasetPath, import.meta.url),
      'utf8',
    ),
  );
  const valid = {
    profile: b.id,
    datasetSha256: b.datasetSha256,
    dialogs: b.dialogs,
    userTurns: b.userTurns,
    limits: b.limits,
    limitsSha256: b.limitsSha256,
    cases: data.cases,
  };
  // Deliberately no source fields: each refusal must precede inventory/Git reads.
  for (const [patch, error] of [
    [{ profile: undefined }, /core_profile_required/],
    [{ profile: 'unrecognized' }, /core_profile_refused/],
    [{ profile: a.id }, /core_dataset_pin/],
    [{ datasetSha256: a.datasetSha256 }, /core_dataset_pin/],
    [{ dialogs: 3 }, /core_dialog_scope/],
    [{ userTurns: 5 }, /core_turn_scope/],
    [{ limitsSha256: a.limitsSha256 }, /core_limits_pin/],
    [{ limits: a.limits }, /core_limits_changed/],
    [{ cases: data.cases.slice(1) }, /core_cases_pin/],
    [{ cases: [...data.cases].reverse() }, /core_cases_pin/],
  ])
    assert.throws(() => assertCoreSources({ ...valid, ...patch }), error);
  assert.throws(
    () => captureCoreManifest('DRY_HTTP', null, 'unrecognized'),
    /core_profile_refused/,
  );
});
