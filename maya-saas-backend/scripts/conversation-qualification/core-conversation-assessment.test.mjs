import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assessCoreTurn,
  CORE_CASE_TURNS,
  CORE_FOLLOWUP_CASE_IDS,
} from './core-conversation-assessment.mjs';
const facts = (patch = {}) => ({
  caseId: 'core-owner-compound-clarification',
  turn: 2,
  reply: 'Observed bounded review',
  previousReply: 'Observed question?',
  modelResponses: 1,
  currentSelection: false,
  ownerEvidenceBounded: true,
  ownerContextRestored: true,
  groundingStatus: null,
  readCount: 2,
  toolCount: 0,
  ...patch,
});
test('owner repeated clarification is semantic FAIL despite complete safe response', () => {
  assert.deepEqual(
    assessCoreTurn(
      facts({ reply: 'Observed question?', ownerEvidenceBounded: false }),
    ),
    {
      status: 'fail',
      failedCheckIds: [
        'followup_does_not_repeat_previous_reply',
        'owner_acceptance_reaches_saved_evidence',
      ],
    },
  );
  assert.deepEqual(assessCoreTurn(facts()), {
    status: 'pass',
    failedCheckIds: [],
  });
});
test('safe unresolved archival answer stays a failed progression, without inventing acceptance', () => {
  assert.deepEqual(
    assessCoreTurn(
      facts({
        reply: 'A different actual clarification?',
        ownerEvidenceBounded: false,
      }),
    ),
    {
      status: 'fail',
      failedCheckIds: ['owner_acceptance_reaches_saved_evidence'],
    },
  );
});
test('actual time prose alone does not establish canonical selected preview', () => {
  const f = facts({
    caseId: 'core-client-create-followup',
    reply: 'Проверьте время 17:00',
    ownerEvidenceBounded: false,
  });
  assert.equal(assessCoreTurn(f).status, 'fail');
  assert.equal(assessCoreTurn({ ...f, currentSelection: true }).status, 'pass');
});
test('general role refusal and no provider output remain semantic diagnostics, not fake model coverage', () => {
  const f = facts({
    caseId: 'followup-admin-general-chat',
    turn: 1,
    reply: 'недоступен для вашей текущей роли',
    modelResponses: 0,
    groundingStatus: 'blocked',
  });
  assert.equal(assessCoreTurn(f).failedCheckIds.length, 3);
});
test('ungraded cases remain explicit; finite B fixture partition and invalid observation fail closed', () => {
  assert.equal(Object.keys(CORE_CASE_TURNS).length, 9);
  assert.equal(
    Object.values(CORE_CASE_TURNS).reduce((n, v) => n + v, 0),
    18,
  );
  assert.equal(CORE_FOLLOWUP_CASE_IDS.length, 6);
  assert.ok(!CORE_FOLLOWUP_CASE_IDS.includes('core-client-create-followup'));
  assert.equal(
    assessCoreTurn(facts({ caseId: 'followup-client-carry-over', turn: 1 }))
      .status,
    'ungraded',
  );
  for (const patch of [
    { caseId: 'unknown' },
    { turn: 4 },
    { modelResponses: NaN },
    { ownerEvidenceBounded: null },
    { reply: '' },
  ])
    assert.throws(
      () => assessCoreTurn(facts(patch)),
      /core_semantic_observation_invalid/,
    );
});

test('runner summary preserves semantic FAIL and rejects incomplete/foreign coverage', async () => {
  const { summarizeCoreUnionReport } =
    await import('./core-conversation-assessment.mjs');
  const binding = {
    manifestSha256: 'a'.repeat(64),
    candidateCommit: 'b'.repeat(40),
  };
  const report = {
    profile: 'core-union-20261009/1',
    ...binding,
    sourceHead: binding.candidateCommit,
    stopped: null,
    forbidden: [],
    actualHttpTurns: 17,
    result: {
      status: 'completed_with_semantic_failures',
      executionStatus: 'completed',
      semanticStatus: 'fail',
      outcomes: Object.keys(CORE_CASE_TURNS).map((caseId) => ({
        caseId,
        outcome:
          caseId === 'core-client-create-followup'
            ? 'semantic_fail'
            : 'replayed_ungraded',
      })),
      turnOutcomes: Object.entries(CORE_CASE_TURNS).flatMap(([caseId, n]) =>
        Array.from({ length: n }, (_, i) => ({
          caseId,
          turn: i + 1,
          outcome:
            caseId === 'core-client-create-followup' && i === 1
              ? 'skipped_dependent_after_semantic_fail'
              : 'response',
        })),
      ),
      coverage: {
        plannedTurns: 18,
        attemptedTurns: 17,
        validResponses: 17,
        unresolvedTurns: 0,
        skippedDependentTurns: 1,
        unexecutedTurns: 0,
        semanticPasses: 0,
        semanticFailures: 1,
        semanticUngraded: 16,
      },
    },
  };
  assert.equal(summarizeCoreUnionReport(report, binding).exitCode, 2);
  assert.equal(
    summarizeCoreUnionReport(report, binding).status,
    'completed-with-semantic-failures',
  );
  for (const mutate of [
    (r) => {
      r.manifestSha256 = 'c'.repeat(64);
    },
    (r) => {
      r.result.coverage.unresolvedTurns = 1;
    },
    (r) => {
      r.result.turnOutcomes[0].caseId = 'foreign';
    },
    (r) => {
      r.result.status = 'replayed_ungraded';
    },
    (r) => {
      r.stopped = 'usage_unknown';
    },
  ]) {
    const r = structuredClone(report);
    mutate(r);
    assert.throws(
      () => summarizeCoreUnionReport(r, binding),
      /core_union_report_unconfirmed/,
    );
  }
});

test('selected-time proof requires exact returned review slot, source capability and owned tenant', async () => {
  const { hasExactReviewedSlot } =
    await import('./core-conversation-assessment.mjs');
  const expected = {
    start: '2035-01-01T14:00:00.000Z',
    timezone: 'Europe/Moscow',
    tenantId: 'synthetic-own-tenant',
  };
  const resolution = {
    matched: true,
    receipt: {
      widget_id: 'synthetic-widget',
      envelope: {
        contract: 'maya.widget.envelope/1',
        widget_id: 'synthetic-widget',
        kind: 'TIME_SLOT_SELECTOR',
        tenant_id: expected.tenantId,
        provenance: { source_capability: 'booking.availability.read' },
        body: {
          prompt: { rendered: 'Проверьте выбранное время' },
          timezone: 'Europe/Moscow',
          grouping: 'flat',
          shown_count: 1,
          window: { from: expected.start, to: expected.start },
          groups: [
            {
              label: { rendered: 'Выбранное время' },
              slots: [
                {
                  slot_ref: 'synthetic-slot',
                  staff_ref: 'synthetic-staff',
                  start: { unit: 'datetime', value: expected.start },
                },
              ],
            },
          ],
        },
      },
    },
  };
  assert.equal(hasExactReviewedSlot(resolution, expected), true);
  for (const mutate of [
    (r) => {
      r.receipt.envelope.kind = 'SERVICE_SELECTOR';
    },
    (r) => {
      r.receipt.envelope.body.groups[0].slots[0].start.value =
        '2035-01-01T15:00:00.000Z';
    },
    (r) => {
      r.receipt.envelope.body.groups[0].slots[0].start.value =
        '2035-01-02T14:00:00.000Z';
    },
    (r) => {
      r.receipt.envelope.tenant_id = 'foreign-tenant';
    },
    (r) => {
      r.receipt.envelope.provenance.source_capability = 'booking.services.read';
    },
    (r) => {
      r.receipt.envelope.body.timezone = 'UTC';
    },
    (r) => {
      r.receipt.envelope.body.prompt.rendered = 'Выберите время';
    },
    (r) => {
      r.receipt.envelope.body.groups[0].slots.push(
        r.receipt.envelope.body.groups[0].slots[0],
      );
    },
    (r) => {
      r.receipt.envelope.widget_id = 'other-widget';
    },
  ]) {
    const r = structuredClone(resolution);
    mutate(r);
    assert.equal(hasExactReviewedSlot(r, expected), false);
  }
  assert.equal(hasExactReviewedSlot(null, expected), false);
});
