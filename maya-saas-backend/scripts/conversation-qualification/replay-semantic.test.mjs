import assert from 'node:assert/strict';
import { test } from 'node:test';
import { replayPilot, sha256 } from './replay.mjs';
function manifest() {
  const value = {
    purpose: 'pilot_calibration_not_qualification',
    split: 'dev',
    dialogs: 3,
    userTurns: 5,
    cases: [
      {
        id: 'first',
        role: 'client',
        userTurns: ['one', 'dependent', 'also dependent'],
      },
      { id: 'second', role: 'owner', userTurns: ['independent'] },
      { id: 'third', role: 'admin', userTurns: ['independent too'] },
    ],
  };
  return { ...value, manifestSha256: sha256(JSON.stringify(value)) };
}
function harness(overrides = {}) {
  const calls = [],
    records = [],
    closes = [];
  return {
    calls,
    records,
    closes,
    options: {
      budget: { dialog() {}, turn() {}, endTurn() {} },
      record: (row) => records.push(row),
      semanticFailure: 'next_independent_dialog',
      assessTurn: ({ caseId }) => ({
        status: caseId === 'first' ? 'fail' : 'pass',
        failedCheckIds: caseId === 'first' ? ['repeated_clarification'] : [],
      }),
      openDialog: async ({ caseId }) => ({
        chat: async (body) => {
          calls.push({ caseId, body });
          return {
            reply: `actual ${caseId}`,
            userTurn: { conversationId: `conversation-${caseId}` },
          };
        },
        close: async () => {
          closes.push(caseId);
        },
      }),
      ...overrides,
    },
  };
}
test('semantic FAIL preserves actual reply, skips dependent turns and starts fresh independent conversations', async () => {
  const h = harness(),
    result = await replayPilot(manifest(), h.options);
  assert.equal(result.status, 'completed_with_semantic_failures');
  assert.equal(result.executionStatus, 'completed');
  assert.equal(result.semanticStatus, 'fail');
  assert.deepEqual(
    h.calls.map((c) => c.caseId),
    ['first', 'second', 'third'],
  );
  assert.deepEqual(h.closes, ['first', 'second', 'third']);
  for (const c of h.calls) {
    assert.equal(c.body.conversationId, undefined);
    assert.equal(c.body.messages.length, 1);
    assert.equal(c.body.messages[0].role, 'user');
  }
  assert.equal(h.records[0].reply, 'actual first');
  assert.deepEqual(result.coverage, {
    plannedTurns: 5,
    attemptedTurns: 3,
    validResponses: 3,
    unresolvedTurns: 0,
    skippedDependentTurns: 2,
    unexecutedTurns: 0,
    semanticPasses: 2,
    semanticFailures: 1,
    semanticUngraded: 0,
  });
  assert.equal(
    h.records.filter(
      (r) => r.outcome === 'skipped_dependent_after_semantic_fail',
    ).length,
    2,
  );
});
test('unknown transport stops globally without invoking the semantic assessor', async () => {
  let assessed = 0;
  const h = harness({
    assessTurn: () => {
      assessed++;
      throw Error('must not assess');
    },
    openDialog: async () => ({
      chat: async () => {
        throw Error('PRIVATE ERROR');
      },
      close: async () => {},
    }),
  });
  const result = await replayPilot(manifest(), h.options);
  assert.equal(result.status, 'stopped');
  assert.deepEqual(
    result.outcomes.map((row) => row.outcome),
    ['unresolved', 'not_started_after_stop', 'not_started_after_stop'],
  );
  assert.equal(assessed, 0);
  assert.equal(result.coverage.unresolvedTurns, 1);
  assert.equal(result.coverage.unexecutedTurns, 4);
  assert.doesNotMatch(
    JSON.stringify({ ...result, records: h.records }),
    /PRIVATE ERROR/,
  );
});
test('malformed or throwing assessment is UNKNOWN, never permission to continue', async () => {
  for (const assessTurn of [
    () => ({ status: 'fail', failedCheckIds: [] }),
    () => ({ status: 'pass', failedCheckIds: ['wrong'] }),
    () => ({ status: 'pass', failedCheckIds: [], extra: true }),
    () => {
      throw Error('PRIVATE');
    },
  ]) {
    const h = harness({ assessTurn }),
      result = await replayPilot(manifest(), h.options);
    assert.equal(result.status, 'stopped');
    assert.equal(h.calls.length, 1);
    assert.equal(result.coverage.unexecutedTurns, 4);
  }
});
test('cleanup, journal or budget failure never advances to another case after semantic FAIL', async () => {
  for (const failure of ['close', 'record', 'endTurn']) {
    const h = harness();
    if (failure === 'record')
      h.options.record = (row) => {
        h.records.push(row);
        if (row.outcome === 'semantic_assessment') throw Error('PRIVATE');
      };
    if (failure === 'endTurn')
      h.options.budget.endTurn = () => {
        throw Error('PRIVATE');
      };
    if (failure === 'close') {
      const open = h.options.openDialog;
      h.options.openDialog = async (actor) => ({
        ...(await open(actor)),
        close: async () => {
          throw Error('PRIVATE');
        },
      });
    }
    const result = await replayPilot(manifest(), h.options);
    assert.equal(result.status, 'stopped');
    assert.equal(h.calls.length, 1);
  }
});
test('assessment mode is explicit and closed before any budget or HTTP operation', async () => {
  for (const extra of [
    { semanticFailure: 'continue_anyway' },
    { semanticFailure: 'next_independent_dialog' },
    { assessTurn: () => ({ status: 'pass', failedCheckIds: [] }) },
  ]) {
    await assert.rejects(
      replayPilot(manifest(), {
        ...harness().options,
        semanticFailure: undefined,
        assessTurn: undefined,
        ...extra,
      }),
      /replay_assessment_contract/,
    );
  }
});
