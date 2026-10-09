import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import {
  scoreCoreFullOfflineReport,
  incompleteCoreFullOfflineScore,
} from './core-full-offline-score.mjs';
const { cases } = JSON.parse(
  fs.readFileSync(
    new URL(
      '../../datasets/conversation-intelligence/core-offline-48-20261009.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const binding = {
  cases,
  candidateCommit: 'a'.repeat(40),
  manifestSha256: 'b'.repeat(64),
};
const report = () => ({
  profile: 'core-offline-48-20261009/1',
  sourceHead: binding.candidateCommit,
  manifestSha256: binding.manifestSha256,
  businessAcceptance: false,
  responses: [],
  actualHttpTurns: 0,
});

test('failed execution after all scored turns cannot retain a green artifact exit code', () => {
  // This finite control represents the caller learning that its execution gate
  // failed after a successful per-turn assessment, not a real corpus result.
  const scored = {
    contract: 'maya.offline48.contract-score/1',
    scoredTurns: 81,
    actualHttpTurns: 81,
    semanticStatus: 'pass',
    status: 'completed-contract-diagnostic',
    exitCode: 0,
  };
  const partial = incompleteCoreFullOfflineScore(scored);
  assert.equal(partial.exitCode, 1);
  assert.equal(partial.executionStatus, 'INCOMPLETE');
  assert.equal(partial.status, 'stopped-with-semantic-audit');
  assert.equal(partial.semanticStatus, 'pass');
  assert.equal(scored.exitCode, 0);
});
const row = (item, index) => ({
  caseId: item.id,
  turn: index + 1,
  userText: item.userTurns[index],
  priorActualAssistantReplies: Array.from(
    { length: index },
    () => 'Unqualified actual reply',
  ),
  actualReply: 'Unqualified actual reply',
  httpStatus: 201,
  responseHash: 'c'.repeat(64),
});

test('all 81 missing attempts are explicit and cannot be fabricated as semantic success', () => {
  const scored = scoreCoreFullOfflineReport(report(), binding);
  assert.equal(scored.scoredTurns, 81);
  assert.equal(scored.actualHttpTurns, 0);
  assert.equal(scored.counts.pass, 0);
  assert.notEqual(scored.exitCode, 0);
  assert.ok(
    scored.rows.every(
      (r) =>
        r.actualReply === null &&
        r.actualAuditHash === null &&
        r.execution === 'NOT_EXECUTED',
    ),
  );
  assert.equal(scored.businessAcceptance, false);
  assert.equal(scored.unknownOutcomeRecovery, 'NOT_EXERCISED');
});
test('HTTP 201 on every planned turn without source audit does not become a passing score', () => {
  const input = report();
  input.responses = cases.flatMap((item) =>
    item.userTurns.map((_, i) => row(item, i)),
  );
  input.actualHttpTurns = 81;
  const scored = scoreCoreFullOfflineReport(input, binding);
  assert.equal(scored.rows.length, 81);
  assert.equal(scored.counts.pass, 0);
  assert.notEqual(scored.exitCode, 0);
  assert.ok(
    scored.rows.every(
      (r) =>
        r.actualReply === 'Unqualified actual reply' &&
        r.actualResponseHash === 'c'.repeat(64),
    ),
  );
  assert.ok(scored.criticalSafety.missingEvidenceTurns > 0);
});
test('changed source, corpus, unknown or duplicate rows and unobserved assistant history are rejected', () => {
  for (const mutate of [
    (input) => {
      input.sourceHead = 'd'.repeat(40);
    },
    (input) => {
      input.manifestSha256 = 'e'.repeat(64);
    },
    (input) => {
      input.businessAcceptance = true;
    },
    (input) => {
      input.responses = [row(cases[0], 0), row(cases[0], 0)];
      input.actualHttpTurns = 2;
    },
    (input) => {
      input.responses = [{ ...row(cases[0], 0), caseId: 'foreign' }];
      input.actualHttpTurns = 1;
    },
    (input) => {
      input.responses = [{ ...row(cases[0], 0), userText: 'changed' }];
      input.actualHttpTurns = 1;
    },
    (input) => {
      input.responses = [
        { ...row(cases[0], 0), priorActualAssistantReplies: ['GOLD'] },
      ];
      input.actualHttpTurns = 1;
    },
  ]) {
    const input = report();
    mutate(input);
    assert.throws(
      () => scoreCoreFullOfflineReport(input, binding),
      /core_offline_score_unconfirmed/,
    );
  }
  assert.throws(
    () =>
      scoreCoreFullOfflineReport(report(), {
        ...binding,
        cases: cases.slice(1),
      }),
    /core_offline_score_unconfirmed/,
  );
});
test('a stopped actual HTTP failure retains raw reply/status and gives remaining turns explicit missing evidence', () => {
  const input = report();
  input.responses = [
    { ...row(cases[0], 0), httpStatus: 503, actualReply: null },
  ];
  input.actualHttpTurns = 1;
  const scored = scoreCoreFullOfflineReport(input, binding);
  assert.equal(scored.rows[0].httpStatus, 503);
  assert.equal(scored.rows[0].actualReply, null);
  assert.equal(scored.rows[0].execution, 'ACTUAL_HTTP_ATTEMPT');
  assert.equal(
    scored.rows.filter((r) => r.execution === 'NOT_EXECUTED').length,
    80,
  );
  assert.notEqual(scored.exitCode, 0);
});
