// Frozen development corpus/profile checks; no execution authority or transport.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { coreConversationProfile } from './core-conversation-profile.mjs';
import {
  CORE_DIAGNOSTIC_PROFILE,
  CORE_FOLLOWUP_PROFILE,
  CORE_UNION_PROFILE,
} from './current-candidate-budget.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (name) =>
  fs.readFileSync(new URL('../../../' + name, import.meta.url));

test('the default A and explicit B and union are immutable closed profiles', () => {
  const a = coreConversationProfile();
  const b = coreConversationProfile(CORE_FOLLOWUP_PROFILE);
  assert.equal(a, coreConversationProfile(CORE_DIAGNOSTIC_PROFILE));
  assert.deepEqual([a.dialogs, a.userTurns], [3, 5]);
  assert.deepEqual([b.dialogs, b.userTurns], [6, 13]);
  for (const p of [a, b, coreConversationProfile(CORE_UNION_PROFILE)]) {
    assert.ok(Object.isFrozen(p) && Object.isFrozen(p.limits));
    assert.equal(p.limitsSha256, sha(JSON.stringify(p.limits)));
    const raw = read(p.datasetPath);
    assert.equal(sha(raw), p.datasetSha256);
    const data = JSON.parse(raw);
    assert.equal(sha(JSON.stringify(data.cases)), p.casesSha256);
    assert.equal(data.cases.length, p.dialogs);
    assert.equal(
      data.cases.reduce((n, c) => n + c.userTurns.length, 0),
      p.userTurns,
    );
  }
  assert.equal(
    a.datasetSha256,
    'b793c5489dcd8838e4edc6bca6c00c53530b57892c29520876845608786e2dc6',
  );
  assert.equal(
    a.casesSha256,
    'a1f6d6a3716b302190061b6c21bab70232ce494f2b4edfae77f0f0ba32ddff40',
  );
  assert.deepEqual(b.limits, {
    ...a.limits,
    dialogs: 6,
    turns: 13,
    attempts: 24,
    inputTokens: 2_457_600,
    outputTokens: 49_152,
    spendNanoUsd: 4_000_000_000,
    durationMs: 1_200_000,
  });
  for (const id of [null, '', {}, [], 'core-followup-20261009/2', 'arbitrary'])
    assert.throws(
      () => coreConversationProfile(id),
      /^Error: core_profile_refused$/,
    );
});

test('B is exactly the first six frozen cases with group as the sole case addition', () => {
  const profile = coreConversationProfile(CORE_FOLLOWUP_PROFILE);
  const data = JSON.parse(read(profile.datasetPath));
  const source = read(data.sourceDataset.path);
  assert.equal(
    sha(source),
    '926578b841249c06d8e63ae117c6e651aefca7e39565b3e2fb73bf086cbb817c',
  );
  assert.equal(data.sourceDataset.sha256, sha(source));
  const frozen = JSON.parse(source);
  const originalCases = data.cases.map(({ group, ...original }) => original);
  assert.deepEqual(originalCases, frozen.cases.slice(0, 6));
  assert.deepEqual(
    data.cases.map((c) => c.group),
    ['booking', 'booking', 'admin', 'owner_review', 'owner_review', 'admin'],
  );
  for (const [key, value] of Object.entries(data.historicalMetadata))
    assert.deepEqual(value, frozen[key]);
  const { modelInput, ...currentHistory } = data.historyContract;
  const { modelInput: historicalModelInput, ...historicalHistory } =
    frozen.historyContract;
  assert.deepEqual(currentHistory, historicalHistory);
  assert.notEqual(modelInput, historicalModelInput);
  assert.match(modelInput, /HTTP replay retains actual/);
  assert.match(modelInput, /user-only dialogue messages/);
  assert.match(
    modelInput,
    /semantic continuation restored from encrypted storage/,
  );
  assert.match(modelInput, /does not mean forwarding raw assistant text/);
  assert.deepEqual(data.caseReviewPolicy, frozen.caseReviewPolicy);
  assert.deepEqual(data.separateControls, frozen.separateControls);
  assert.equal(data.paidAuthorized, false);
  assert.equal(data.executionAuthorized, false);
  assert.equal(data.candidateCommit, null);
  assert.equal(data.candidateManifestSha256, null);
  assert.equal(
    data.sourceDataset.fixtureRequirementsAreHistoricalPreparationMetadata,
    true,
  );
});

test('union is the exact ordered A+B cases with a pooled fixed cap and no execution authority', () => {
  const p = coreConversationProfile(CORE_UNION_PROFILE),
    data = JSON.parse(read(p.datasetPath));
  const a = coreConversationProfile(),
    b = coreConversationProfile(CORE_FOLLOWUP_PROFILE);
  assert.deepEqual(data.cases, [
    ...JSON.parse(read(a.datasetPath)).cases,
    ...JSON.parse(read(b.datasetPath)).cases,
  ]);
  assert.equal(new Set(data.cases.map((c) => c.id)).size, 9);
  assert.deepEqual(
    data.sourceDatasets,
    [a, b].map((x) => ({ path: x.datasetPath, sha256: x.datasetSha256 })),
  );
  assert.deepEqual(p.limits, {
    ...a.limits,
    dialogs: 9,
    turns: 18,
    attempts: 36,
    inputTokens: 3686400,
    outputTokens: 73728,
    spendNanoUsd: 6000000000,
    durationMs: 1800000,
  });
  assert.equal(data.paidAuthorized, false);
  assert.equal(data.executionAuthorized, false);
  assert.equal(data.candidateCommit, null);
  assert.equal(data.candidateManifestSha256, null);
});
