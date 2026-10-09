import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import {
  scoreCoreFullOfflineReport,
  incompleteCoreFullOfflineScore,
  coreFullOfflineUnclosedCounts,
  CORE_FULL_OFFLINE_SCORE_CONTRACT,
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
const pendingReviewRow = (caseId) => {
  const item = cases.find((c) => c.id === caseId);
  const reply =
    'За 2026-09 показать все оценки или отзывы с одной оценкой — 1, 2, 3, 4 или 5?';
  return {
    caseId,
    turn: 1,
    userText: item.userTurns[0],
    httpStatus: 201,
    actualReply: reply,
    priorActualAssistantReplies: [],
    responseHash: 'c'.repeat(64),
    modelCalls: 1,
    sourceReads: [],
    toolsUsed: [],
    actionStatus: null,
    pendingApprovals: [],
    readReceiptPresent: false,
    recommendation: null,
    audit: {
      qualification: 'SCRIPTED_SYNTHETIC_NOT_MODEL_QUALITY',
      completeness: { status: 'complete' },
      actor: {
        role: item.role === 'owner' ? 'tenant_owner' : 'administrator',
        sameTenant: true,
        sameActor: true,
        membershipActive: true,
      },
      sourceFacts: {
        qualification: 'CURRENT_SYNTHETIC_SOURCE_SNAPSHOT_NOT_MODEL_INPUT',
        timezone: 'Europe/Moscow',
        today: '2026-10-09',
      },
      semanticPlans: [
        {
          dialogue_act: 'request',
          tasks: [
            {
              intent: 'reviews.list_recent',
              domain: 'reviews',
              action: 'read',
              data_class: 'C',
              permission: { required: 'reviews.read', status: 'allowed' },
              tool: { name: 'reviews.list.read', status: 'ready' },
              entities: { period: '2026-09' },
              depends_on: [],
              requires_confirmation: false,
              requires_clarification: true,
              clarification_question: reply,
            },
          ],
          context: { unresolved_references: [] },
        },
      ],
      toolResults: [],
      persistedCoordination: [],
      coordination: null,
      response: { reply, action: null, grounding: { status: 'blocked' } },
      effects: {
        businessHashUnchanged: true,
        businessWrites: [],
        forbidden: [],
        outboundCalls: 0,
      },
      reviewClarification: {
        contract: 'maya.review-clarification-observation/1',
        sameTenant: true,
        sameActor: true,
        parentTurnMatches: true,
        replyMatches: true,
        immutableIdMatches: true,
        month: '2026-09',
        timezone: 'Europe/Moscow',
        branchId: null,
        requiresClarification: true,
        question: reply,
        contextHash: 'd'.repeat(64),
        replyHash: createHash('sha256')
          .update(JSON.stringify(reply))
          .digest('hex'),
        goalCompleted: false,
        phase: 'AWAITING_RATING_CHOICE',
        rating: null,
      },
    },
  };
};

test('v2 counts unanswered clarifications separately without increasing PASS or returning green', () => {
  const input = report();
  input.responses = [
    'utt-reviews.list_recent-062',
    'utt-reviews.list_recent-067',
  ].map(pendingReviewRow);
  input.actualHttpTurns = 2;
  const before = structuredClone(input),
    scored = scoreCoreFullOfflineReport(input, binding);
  assert.equal(scored.contract, CORE_FULL_OFFLINE_SCORE_CONTRACT);
  assert.equal(scored.assessmentContract, 'maya.offline48.turn-assessment/2');
  assert.equal(scored.assessmentMode, 'ACTUAL_HTTP_REPORT_ASSESSMENT');
  assert.deepEqual(scored.counts, {
    pass: 0,
    semantic_fail: 0,
    unsupported: 0,
    insufficient_evidence: 79,
    clarification_pending: 2,
  });
  assert.equal(scored.pendingClarificationTurns, 2);
  assert.equal(scored.remainingNonPendingTurns, 79);
  assert.equal(scored.unclosedTurns, 81);
  assert.equal(scored.semanticStatus, 'incomplete');
  assert.equal(scored.exitCode, 2);
  const pending = scored.rows.filter(
    (r) => r.status === 'clarification_pending',
  );
  assert.equal(pending.length, 2);
  assert.ok(
    pending.every(
      (r) => r.goalCompleted === false && r.phase === 'AWAITING_RATING_CHOICE',
    ),
  );
  assert.deepEqual(input, before);
});
test('finite 81-turn accounting keeps 22 other unresolved turns plus 2 pending questions equal to 24 unclosed', () => {
  assert.deepEqual(
    coreFullOfflineUnclosedCounts({
      pass: 57,
      semantic_fail: 0,
      unsupported: 12,
      insufficient_evidence: 10,
      clarification_pending: 2,
    }),
    {
      remainingNonPendingTurns: 22,
      pendingClarificationTurns: 2,
      unclosedTurns: 24,
    },
  );
  assert.deepEqual(
    coreFullOfflineUnclosedCounts({
      pass: 57,
      semantic_fail: 2,
      unsupported: 12,
      insufficient_evidence: 10,
      clarification_pending: 0,
    }),
    {
      remainingNonPendingTurns: 24,
      pendingClarificationTurns: 0,
      unclosedTurns: 24,
    },
  );
  for (const bad of [
    null,
    {},
    {
      pass: 57,
      semantic_fail: 0,
      unsupported: 12,
      insufficient_evidence: 10,
      clarification_pending: 0,
    },
    {
      pass: 57,
      semantic_fail: -1,
      unsupported: 12,
      insufficient_evidence: 10,
      clarification_pending: 3,
    },
  ])
    assert.throws(
      () => coreFullOfflineUnclosedCounts(bad),
      /core_offline_score_unconfirmed/,
    );
});
test('archived reassessment is labelled and missing new persisted evidence stays insufficient', () => {
  const input = report();
  const pending = pendingReviewRow('utt-reviews.list_recent-062');
  delete pending.audit.reviewClarification;
  input.responses = [pending];
  input.actualHttpTurns = 1;
  const before = structuredClone(input);
  const scored = scoreCoreFullOfflineReport(input, binding, {
    assessmentMode: 'ARCHIVED_REPORT_REASSESSMENT',
    evaluatorSourceHead: 'd'.repeat(40),
    originalScoreSha256: 'e'.repeat(64),
  });
  assert.equal(scored.assessmentMode, 'ARCHIVED_REPORT_REASSESSMENT');
  assert.equal(scored.originalScoreSha256, 'e'.repeat(64));
  assert.equal(scored.evaluatorSourceHead, 'd'.repeat(40));
  assert.equal(scored.sourceHead, binding.candidateCommit);
  assert.equal(scored.counts.clarification_pending, 0);
  assert.equal(
    scored.rows.find((r) => r.caseId === pending.caseId).status,
    'insufficient_evidence',
  );
  assert.deepEqual(input, before);
  for (const bad of [
    null,
    [],
    { assessmentMode: 'ARCHIVED_REPORT_REASSESSMENT' },
    { assessmentMode: 'silent-rescore' },
    {
      assessmentMode: 'ARCHIVED_REPORT_REASSESSMENT',
      evaluatorSourceHead: 'd'.repeat(40),
      originalScoreSha256: ['e'.repeat(64)],
    },
  ])
    assert.throws(
      () => scoreCoreFullOfflineReport(input, binding, bad),
      /core_offline_score_unconfirmed/,
    );
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
