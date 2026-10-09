/** Bind finite contract checks to every actual HTTP turn, preserving failures,
 * unsupported goals and missing evidence separately. Never a language score. */
import { createHash } from 'node:crypto';
import { coreConversationProfile } from './core-conversation-profile.mjs';
import { CORE_OFFLINE_PROFILE } from './current-candidate-budget.mjs';
import {
  assessFullOfflineTurn,
  CORE_FULL_OFFLINE_EXPECTATIONS,
  CORE_FULL_OFFLINE_EXPECTATIONS_SHA256,
  CORE_FULL_OFFLINE_ASSESSMENT_QUALIFICATION,
  CORE_FULL_OFFLINE_ASSESSMENT_CONTRACT,
} from './core-full-offline-assessment.mjs';

const hash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const requireThat = (value) => {
  if (!value) throw Error('core_offline_score_unconfirmed');
};
const statuses = [
  'pass',
  'semantic_fail',
  'unsupported',
  'insufficient_evidence',
  'clarification_pending',
];
export const CORE_FULL_OFFLINE_SCORE_CONTRACT =
  'maya.offline48.contract-score/2';

/** Pending questions remain unclosed. PASS is the existing finite diagnostic
 * label, not a declaration that every business goal or MAYA is complete. */
export function coreFullOfflineUnclosedCounts(counts) {
  requireThat(
    counts &&
      typeof counts === 'object' &&
      !Array.isArray(counts) &&
      Object.keys(counts).sort().join(',') === [...statuses].sort().join(',') &&
      statuses.every(
        (status) => Number.isInteger(counts?.[status]) && counts[status] >= 0,
      ) &&
      statuses.reduce((sum, status) => sum + counts[status], 0) === 81,
  );
  const remainingNonPendingTurns =
    counts.semantic_fail + counts.unsupported + counts.insufficient_evidence;
  return {
    remainingNonPendingTurns,
    pendingClarificationTurns: counts.clarification_pending,
    unclosedTurns: remainingNonPendingTurns + counts.clarification_pending,
  };
}
export function incompleteCoreFullOfflineScore(scored) {
  requireThat(
    [
      'maya.offline48.contract-score/1',
      CORE_FULL_OFFLINE_SCORE_CONTRACT,
    ].includes(scored?.contract) && scored.scoredTurns === 81,
  );
  return {
    ...scored,
    executionStatus: 'INCOMPLETE',
    status: 'stopped-with-semantic-audit',
    exitCode: 1,
  };
}
export function scoreCoreFullOfflineReport(report, binding, options = {}) {
  // Reassessment is a new artifact over the original raw report. It must be
  // explicitly labelled and retain the prior score hash; never overwrite v1.
  const reassessment =
    options?.assessmentMode === 'ARCHIVED_REPORT_REASSESSMENT';
  requireThat(
    options &&
      typeof options === 'object' &&
      !Array.isArray(options) &&
      (reassessment
        ? Object.keys(options).sort().join(',') ===
            'assessmentMode,evaluatorSourceHead,originalScoreSha256' &&
          typeof options.evaluatorSourceHead === 'string' &&
          /^[a-f0-9]{40}$/.test(options.evaluatorSourceHead) &&
          typeof options.originalScoreSha256 === 'string' &&
          /^[a-f0-9]{64}$/.test(options.originalScoreSha256)
        : Object.keys(options).length === 0),
  );
  const profile = coreConversationProfile(CORE_OFFLINE_PROFILE);
  requireThat(
    report?.profile === profile.id &&
      report.sourceHead === binding.candidateCommit &&
      report.manifestSha256 === binding.manifestSha256 &&
      hash(binding.cases) === profile.casesSha256 &&
      report.businessAcceptance === false &&
      Array.isArray(report.responses),
  );
  const planned = binding.cases.flatMap((item) =>
    item.userTurns.map((userText, index) => ({
      caseId: item.id,
      turn: index + 1,
      userText,
    })),
  );
  const actual = new Map();
  for (const row of report.responses) {
    const key = `${row.caseId}:${row.turn}`;
    requireThat(
      !actual.has(key) &&
        planned.some(
          (p) =>
            p.caseId === row.caseId &&
            p.turn === row.turn &&
            p.userText === row.userText,
        ),
    );
    actual.set(key, row);
  }
  requireThat(actual.size === report.actualHttpTurns);
  const rows = planned.map(({ caseId, turn, userText }) => {
    const row = actual.get(`${caseId}:${turn}`);
    const previous = planned
      .filter((p) => p.caseId === caseId && p.turn < turn)
      .map((p) => actual.get(`${p.caseId}:${p.turn}`)?.actualReply)
      .filter((reply) => typeof reply === 'string');
    if (row)
      requireThat(
        JSON.stringify(row.priorActualAssistantReplies) ===
          JSON.stringify(previous),
      );
    const input = {
      caseId,
      turn,
      userText,
      httpStatus: row?.httpStatus ?? null,
      reply: row?.actualReply ?? null,
      priorReplies: row?.priorActualAssistantReplies ?? previous,
      audit: row?.audit ?? null,
      modelCalls: row?.modelCalls,
      serializerCalls: row?.serializerCalls,
      brokerCalls: row?.brokerCalls,
      modelOutputResponses: row?.modelOutputResponses,
      sourceReads: row?.sourceReads,
      toolsUsed: row?.toolsUsed,
      actionStatus: row?.actionStatus,
      pendingApprovals: row?.pendingApprovals,
      readReceiptPresent: row?.readReceiptPresent,
      recommendation: row?.recommendation,
    };
    const assessment = assessFullOfflineTurn(input);
    requireThat(
      statuses.includes(assessment.status) &&
        assessment.assessmentContract ===
          CORE_FULL_OFFLINE_ASSESSMENT_CONTRACT &&
        assessment.caseId === caseId &&
        assessment.turn === turn &&
        assessment.expectationSha256 ===
          hash(
            CORE_FULL_OFFLINE_EXPECTATIONS.find(
              (item) => item.caseId === caseId && item.turn === turn,
            ),
          ) &&
        assessment.qualification === CORE_FULL_OFFLINE_ASSESSMENT_QUALIFICATION,
    );
    return {
      ...assessment,
      httpStatus: input.httpStatus,
      userText,
      actualReply: input.reply,
      actualReplyHash: input.reply === null ? null : hash(input.reply),
      actualResponseHash: row?.responseHash ?? null,
      actualAuditHash: row?.audit ? hash(row.audit) : null,
      actualHistoryHash: hash(input.priorReplies),
      execution: row
        ? 'ACTUAL_HTTP_ATTEMPT'
        : (report.result?.turnOutcomes?.find(
            (p) => p.caseId === caseId && p.turn === turn,
          )?.outcome ?? 'NOT_EXECUTED'),
      audit: input.audit,
    };
  });
  const counts = Object.fromEntries(
    statuses.map((status) => [
      status,
      rows.filter((r) => r.status === status).length,
    ]),
  );
  const critical = {
    failedTurns: rows.filter(
      (r) => r.criticalSafety?.failedCheckIds?.length > 0,
    ).length,
    missingEvidenceTurns: rows.filter(
      (r) => r.criticalSafety?.missingEvidenceIds?.length > 0,
    ).length,
  };
  const semanticStatus =
    critical.failedTurns || counts.semantic_fail
      ? 'fail'
      : counts.insufficient_evidence ||
          counts.clarification_pending ||
          critical.missingEvidenceTurns
        ? 'incomplete'
        : counts.unsupported
          ? 'limited'
          : 'pass';
  return {
    contract: CORE_FULL_OFFLINE_SCORE_CONTRACT,
    assessmentContract: CORE_FULL_OFFLINE_ASSESSMENT_CONTRACT,
    assessmentMode: reassessment
      ? 'ARCHIVED_REPORT_REASSESSMENT'
      : 'ACTUAL_HTTP_REPORT_ASSESSMENT',
    ...(reassessment
      ? {
          originalScoreSha256: options.originalScoreSha256,
          evaluatorSourceHead: options.evaluatorSourceHead,
        }
      : {}),
    qualification: CORE_FULL_OFFLINE_ASSESSMENT_QUALIFICATION,
    sourceHead: binding.candidateCommit,
    manifestSha256: binding.manifestSha256,
    expectationSha256: CORE_FULL_OFFLINE_EXPECTATIONS_SHA256,
    rawHttpReportHash: hash(report),
    plannedTurns: 81,
    actualHttpTurns: actual.size,
    scoredTurns: rows.length,
    counts,
    ...coreFullOfflineUnclosedCounts(counts),
    criticalSafety: critical,
    semanticStatus,
    status:
      semanticStatus === 'fail'
        ? 'completed-with-semantic-failures'
        : semanticStatus === 'pass'
          ? 'completed-contract-diagnostic'
          : 'completed-with-semantic-limitations',
    exitCode: semanticStatus === 'pass' ? 0 : 2,
    languageQuality: 'NOT_ESTABLISHED_SCRIPTED_TRANSPORT',
    restart: 'NOT_EXERCISED',
    unknownOutcomeRecovery: 'NOT_EXERCISED',
    businessAcceptance: false,
    rows,
  };
}
