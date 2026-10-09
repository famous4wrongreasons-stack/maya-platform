import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { summarizeCoreFullOfflineReport } from './core-full-offline-report.mjs';
const { cases } = JSON.parse(
  fs.readFileSync(
    new URL(
      '../../datasets/conversation-intelligence/core-offline-48-20261009.json',
      import.meta.url,
    ),
  ),
);
const binding = {
  manifestSha256: 'a'.repeat(64),
  candidateCommit: 'b'.repeat(40),
  cases,
};
function report() {
  const turns = cases.flatMap((row) =>
    row.userTurns.map((_, i) => ({
      caseId: row.id,
      turn: i + 1,
      outcome:
        row.id === 'current-lifecycle-negative'
          ? 'expected_refusal'
          : 'response',
    })),
  );
  return {
    profile: 'core-offline-48-20261009/1',
    manifestSha256: binding.manifestSha256,
    sourceHead: binding.candidateCommit,
    stopped: null,
    forbidden: [],
    businessAcceptance: false,
    actualHttpTurns: 81,
    replayRecords: turns
      .filter((t) => t.outcome === 'response')
      .map((t) => ({
        caseId: t.caseId,
        turn: t.turn,
        outcome: 'semantic_assessment',
        status: 'ungraded',
        failedCheckIds: [],
      })),
    responses: turns.map((t) => ({
      ...t,
      httpStatus: t.outcome === 'response' ? 201 : 401,
      actualReply: t.outcome === 'response' ? 'Synthetic observed reply' : null,
      businessWrites: [],
      businessHashUnchanged: true,
      ...(t.outcome === 'expected_refusal'
        ? {
            historyUnchanged: true,
            expectedRefusal: { httpStatus: 401, code: 'membership_revoked' },
          }
        : {}),
      sourceReads: [],
      modelCalls: 0,
      serializerCalls: 0,
      brokerCalls: 0,
      modelOutputResponses: 0,
    })),
    result: {
      status: 'replayed_ungraded',
      executionStatus: 'completed',
      semanticStatus: 'ungraded',
      outcomes: cases.map((c) => ({
        caseId: c.id,
        outcome:
          c.id === 'current-lifecycle-negative'
            ? 'expected_refusal'
            : 'replayed_ungraded',
      })),
      turnOutcomes: turns,
      coverage: {
        plannedTurns: 81,
        attemptedTurns: 81,
        validResponses: 80,
        expectedRefusals: 1,
        unresolvedTurns: 0,
        skippedDependentTurns: 0,
        unexecutedTurns: 0,
        semanticPasses: 0,
        semanticFailures: 0,
        semanticUngraded: 80,
      },
    },
  };
}
test('all81 HTTP attempts account80 actual replies and one verified auth refusal without a quality claim', () => {
  const result = summarizeCoreFullOfflineReport(report(), binding);
  assert.equal(result.exitCode, 0);
  assert.equal(result.qualification, 'SCRIPTED_SYNTHETIC_NOT_MODEL_QUALITY');
  assert.equal(result.coverage.expectedRefusals, 1);
  assert.equal(result.semanticStatus, 'ungraded');
});
test('failed, missing, duplicate, wrongscope, injected businesswrite and fake-refusal summaries refuse', () => {
  const mutations = [
    (r) => {
      r.responses[0].businessHashUnchanged = false;
    },
    (r) => {
      r.responses.find((x) => x.httpStatus === 401).historyUnchanged = false;
    },
    (r) => {
      delete r.responses.find((x) => x.httpStatus === 401).expectedRefusal;
    },
    (r) => {
      r.result.coverage.validResponses = 81;
    },
    (r) => {
      r.result.coverage.expectedRefusals = 0;
    },
    (r) => {
      r.responses[0].httpStatus = 503;
    },
    (r) => {
      r.responses[0].businessWrites.push('write');
    },
    (r) => {
      r.result.turnOutcomes[1] = { ...r.result.turnOutcomes[0] };
    },
    (r) => {
      r.responses.find((x) => x.httpStatus === 401).actualReply = 'fake reply';
    },
    (r) => {
      r.responses.find((x) => x.httpStatus === 401).modelCalls = 1;
    },
    (r) => {
      r.responses.find((x) => x.httpStatus === 401).sourceReads.push('read');
    },
    (r) => {
      r.responses.pop();
    },
    (r) => {
      r.sourceHead = 'c'.repeat(40);
    },
    (r) => {
      r.forbidden.push('unsafe');
    },
    (r) => {
      r.result.coverage.unresolvedTurns = 1;
    },
    (r) => {
      r.businessAcceptance = true;
    },
  ];
  for (const change of mutations) {
    const r = report();
    change(r);
    assert.throws(
      () => summarizeCoreFullOfflineReport(r, binding),
      /core_offline_report_unconfirmed/,
    );
  }
});
test('semantic failure preserves its dependent skip and does not become execution failure or language acceptance', () => {
  const r = report(),
    caseId = cases[0].id;
  r.result.status = 'completed_with_semantic_failures';
  r.result.semanticStatus = 'fail';
  r.result.outcomes[0].outcome = 'semantic_fail';
  r.result.outcomes[0].failedCheckIds = ['synthetic_failure'];
  r.replayRecords[0].status = 'fail';
  r.replayRecords[0].failedCheckIds = ['synthetic_failure'];
  r.replayRecords.splice(1, 1);
  r.result.turnOutcomes[1].outcome = 'skipped_dependent_after_semantic_fail';
  r.responses.splice(1, 1);
  r.actualHttpTurns = 80;
  Object.assign(r.result.coverage, {
    attemptedTurns: 80,
    validResponses: 79,
    skippedDependentTurns: 1,
    semanticFailures: 1,
    semanticUngraded: 78,
  });
  const summary = summarizeCoreFullOfflineReport(r, binding);
  assert.equal(summary.exitCode, 2);
  assert.equal(summary.status, 'completed-with-semantic-failures');
  assert.equal(r.result.turnOutcomes[1].caseId, caseId);
});

// Regression: balanced counts alone cannot justify removing a dependent turn.
test('skip without same-case observed failure, first-turn skip and response after failure refuse', () => {
  const balanced = report();
  balanced.result.turnOutcomes[1].outcome =
    'skipped_dependent_after_semantic_fail';
  balanced.responses.splice(1, 1);
  balanced.replayRecords.splice(1, 1);
  balanced.actualHttpTurns = 80;
  Object.assign(balanced.result.coverage, {
    attemptedTurns: 80,
    validResponses: 79,
    skippedDependentTurns: 1,
    semanticUngraded: 79,
  });
  assert.throws(
    () => summarizeCoreFullOfflineReport(balanced, binding),
    /core_offline_report_unconfirmed/,
  );
  const first = report();
  first.result.turnOutcomes[0].outcome =
    'skipped_dependent_after_semantic_fail';
  first.responses.splice(0, 1);
  first.replayRecords.splice(0, 1);
  first.actualHttpTurns = 80;
  Object.assign(first.result.coverage, {
    attemptedTurns: 80,
    validResponses: 79,
    skippedDependentTurns: 1,
    semanticUngraded: 79,
  });
  assert.throws(
    () => summarizeCoreFullOfflineReport(first, binding),
    /core_offline_report_unconfirmed/,
  );
  const after = report();
  after.replayRecords[0].status = 'fail';
  after.replayRecords[0].failedCheckIds = ['synthetic_failure'];
  after.result.outcomes[0].outcome = 'semantic_fail';
  after.result.outcomes[0].failedCheckIds = ['synthetic_failure'];
  after.result.status = 'completed_with_semantic_failures';
  after.result.semanticStatus = 'fail';
  Object.assign(after.result.coverage, {
    semanticFailures: 1,
    semanticUngraded: 79,
  });
  assert.throws(
    () => summarizeCoreFullOfflineReport(after, binding),
    /core_offline_report_unconfirmed/,
  );
});
