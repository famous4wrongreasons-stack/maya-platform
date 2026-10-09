// Pure replay accounting only. No HTTP, model, credentials or fixture database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { replayPilot, sha256 } from './replay.mjs';
const bytes = fs.readFileSync(
  new URL(
    '../../datasets/conversation-intelligence/core-offline-48-20261009.json',
    import.meta.url,
  ),
);
const dataset = JSON.parse(bytes);
const id = 'current-lifecycle-negative';
const control = [
  { caseId: id, turn: 1, httpStatus: 401, code: 'membership_revoked' },
];
const refusal = {
  expectedRefusal: { httpStatus: 401, code: 'membership_revoked' },
};
function manifest(change) {
  const value = {
    purpose: 'pilot_calibration_not_qualification',
    split: 'dev',
    dialogs: 48,
    userTurns: 81,
    sourceSha256: sha256(bytes),
    cases: dataset.cases.map((c) => ({
      id: c.id,
      role: c.role,
      userTurns: c.userTurns,
    })),
  };
  change?.(value);
  return { ...value, manifestSha256: sha256(JSON.stringify(value)) };
}
function harness(overrides = {}) {
  const sent = [],
    records = [],
    assessed = [],
    closed = [];
  let turns = 0,
    ends = 0;
  const options = {
    expectedRefusals: structuredClone(control),
    budget: {
      dialog() {},
      turn() {
        turns++;
      },
      endTurn() {
        ends++;
      },
    },
    semanticFailure: 'next_independent_dialog',
    assessTurn: ({ caseId }) => {
      assessed.push(caseId);
      return { status: 'ungraded', failedCheckIds: [] };
    },
    record: (row) => records.push(row),
    openDialog: async ({ caseId }) => ({
      chat: async (body) => {
        sent.push({ caseId, body });
        return caseId === id
          ? structuredClone(refusal)
          : {
              reply: 'Synthetic actual HTTP reply ' + body.requestId,
              userTurn: { conversationId: 'conversation-' + caseId },
            };
      },
      close: async () => {
        closed.push(caseId);
      },
    }),
    ...overrides,
  };
  return {
    options,
    sent,
    records,
    assessed,
    closed,
    counts: () => ({ turns, ends }),
  };
}
test('one predeclared 401 is separate from80 replies, has no fake history and continues next independent dialog', async () => {
  const h = harness(),
    result = await replayPilot(manifest(), h.options);
  assert.equal(result.executionStatus, 'completed');
  assert.equal(result.coverage.plannedTurns, 81);
  assert.equal(result.coverage.attemptedTurns, 81);
  assert.equal(result.coverage.validResponses, 80);
  assert.equal(result.coverage.expectedRefusals, 1);
  assert.equal(result.coverage.unresolvedTurns, 0);
  assert.equal(result.coverage.unexecutedTurns, 0);
  assert.equal(result.coverage.semanticUngraded, 80);
  assert.equal(h.assessed.includes(id), false);
  assert.deepEqual(h.counts(), { turns: 81, ends: 81 });
  assert.equal(h.closed.length, 48);
  const record = h.records.find((r) => r.caseId === id);
  assert.equal(record.outcome, 'expected_refusal');
  assert.equal(Object.hasOwn(record, 'reply'), false);
  const after = h.sent[h.sent.findIndex((r) => r.caseId === id) + 1];
  assert.equal(after.body.messages.length, 1);
  assert.equal(after.body.conversationId, undefined);
  const followup = h.sent.find((r) => r.body.messages.length > 1);
  assert.match(
    followup.body.messages[1].content,
    /^Synthetic actual HTTP reply /,
  );
});
test('declared auth control cannot be replaced by a success, arbitrary refusal or appended reply', async () => {
  for (const response of [
    { reply: 'invented', userTurn: { conversationId: 'invented' } },
    { expectedRefusal: { httpStatus: 503, code: 'membership_revoked' } },
    { expectedRefusal: { httpStatus: 401, code: 'unknown' } },
    { ...refusal, reply: 'invented' },
  ]) {
    const h = harness();
    const base = h.options.openDialog;
    h.options.openDialog = async (actor) => {
      const d = await base(actor);
      if (actor.caseId === id) d.chat = async () => response;
      return d;
    };
    const result = await replayPilot(manifest(), h.options);
    assert.equal(result.executionStatus, 'stopped');
    assert.equal(result.coverage.expectedRefusals, 0);
    assert.equal(result.coverage.unresolvedTurns, 1);
    assert.ok(result.coverage.unexecutedTurns > 0);
  }
});
test('no declaration, foreign case, wrong corpus or broadened map cannot admit401', async () => {
  for (const expectedRefusals of [
    undefined,
    [{ ...control[0], caseId: 'other' }],
    [...control, ...control],
  ]) {
    const h = harness({ expectedRefusals });
    if (expectedRefusals === undefined) {
      const result = await replayPilot(manifest(), h.options);
      assert.equal(result.executionStatus, 'stopped');
      assert.equal(result.coverage.expectedRefusals, undefined);
    } else {
      await assert.rejects(
        replayPilot(manifest(), h.options),
        /replay_expected_refusal_contract/,
      );
      assert.deepEqual(h.counts(), { turns: 0, ends: 0 });
    }
  }
  const h = harness();
  await assert.rejects(
    replayPilot(
      manifest((v) => {
        v.sourceSha256 = 'f'.repeat(64);
      }),
      h.options,
    ),
    /replay_expected_refusal_contract/,
  );
  await assert.rejects(
    replayPilot(
      manifest((v) => {
        v.cases.find((c) => c.id === id).role = 'admin';
      }),
      h.options,
    ),
    /replay_expected_refusal_contract/,
  );
  assert.deepEqual(h.counts(), { turns: 0, ends: 0 });
});
test('refusal object on any other turn hard stops despite declared control', async () => {
  const h = harness();
  const base = h.options.openDialog;
  h.options.openDialog = async (actor) => {
    const d = await base(actor);
    d.chat = async () => refusal;
    return d;
  };
  const result = await replayPilot(manifest(), h.options);
  assert.equal(result.executionStatus, 'stopped');
  assert.equal(result.coverage.attemptedTurns, 1);
  assert.equal(result.coverage.expectedRefusals, 0);
  assert.equal(result.coverage.validResponses, 0);
});
