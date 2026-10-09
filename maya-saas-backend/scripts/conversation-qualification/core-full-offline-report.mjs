// Mechanical accounting for this one closed synthetic corpus. Never language
// acceptance, production readiness, source authority or an execution permission.
import { coreConversationProfile } from './core-conversation-profile.mjs';
import { CORE_OFFLINE_PROFILE } from './current-candidate-budget.mjs';
import { coreHash } from './core-conversation-source.mjs';
const profile = coreConversationProfile(CORE_OFFLINE_PROFILE);
const control = 'current-lifecycle-negative';
const refuse = () => {
  throw Error('core_offline_report_unconfirmed');
};
const requireThat = (value) => {
  if (!value) refuse();
};

export function summarizeCoreFullOfflineReport(report, binding) {
  const result = report?.result,
    coverage = result?.coverage;
  requireThat(
    report?.profile === profile.id &&
      report.manifestSha256 === binding.manifestSha256 &&
      report.sourceHead === binding.candidateCommit &&
      coreHash(JSON.stringify(binding.cases)) === profile.casesSha256 &&
      report.stopped === null &&
      Array.isArray(report.forbidden) &&
      report.forbidden.length === 0 &&
      report.businessAcceptance === false &&
      result?.executionStatus === 'completed' &&
      ['replayed_ungraded', 'completed_with_semantic_failures'].includes(
        result.status,
      ),
  );
  const counters = [
    'plannedTurns',
    'attemptedTurns',
    'validResponses',
    'expectedRefusals',
    'unresolvedTurns',
    'skippedDependentTurns',
    'unexecutedTurns',
    'semanticPasses',
    'semanticFailures',
    'semanticUngraded',
  ];
  requireThat(
    coverage &&
      counters.every(
        (k) =>
          Number.isSafeInteger(coverage[k]) &&
          coverage[k] >= 0 &&
          coverage[k] <= 81,
      ),
  );
  requireThat(
    coverage.plannedTurns === 81 &&
      coverage.expectedRefusals === 1 &&
      coverage.unresolvedTurns === 0 &&
      coverage.unexecutedTurns === 0 &&
      coverage.attemptedTurns ===
        coverage.validResponses + coverage.expectedRefusals &&
      coverage.attemptedTurns + coverage.skippedDependentTurns === 81 &&
      coverage.semanticPasses +
        coverage.semanticFailures +
        coverage.semanticUngraded ===
        coverage.validResponses &&
      report.actualHttpTurns === coverage.attemptedTurns,
  );
  requireThat(
    Array.isArray(result.outcomes) &&
      result.outcomes.length === 48 &&
      result.outcomes.every(
        (row, i) =>
          row.caseId === binding.cases[i].id &&
          (row.caseId === control
            ? row.outcome === 'expected_refusal'
            : ['semantic_fail', 'replayed_ungraded'].includes(row.outcome)),
      ) &&
      result.outcomes.filter((row) => row.outcome === 'semantic_fail')
        .length === coverage.semanticFailures,
  );
  const expectedTurns = binding.cases.flatMap((row) =>
    row.userTurns.map((_, i) => ({ caseId: row.id, turn: i + 1 })),
  );
  requireThat(
    Array.isArray(result.turnOutcomes) &&
      result.turnOutcomes.length === 81 &&
      result.turnOutcomes.every(
        (row, i) =>
          row.caseId === expectedTurns[i].caseId &&
          row.turn === expectedTurns[i].turn &&
          (row.caseId === control
            ? row.outcome === 'expected_refusal'
            : ['response', 'skipped_dependent_after_semantic_fail'].includes(
                row.outcome,
              )),
      ),
  );
  for (const [outcome, key] of [
    ['response', 'validResponses'],
    ['expected_refusal', 'expectedRefusals'],
    ['skipped_dependent_after_semantic_fail', 'skippedDependentTurns'],
  ])
    requireThat(
      result.turnOutcomes.filter((row) => row.outcome === outcome).length ===
        coverage[key],
    );
  requireThat(Array.isArray(report.replayRecords));
  const assessments = report.replayRecords.filter(
    (row) => row.outcome === 'semantic_assessment',
  );
  const replies = result.turnOutcomes.filter(
    (row) => row.outcome === 'response',
  );
  requireThat(
    assessments.length === replies.length &&
      assessments.every(
        (row, i) =>
          row.caseId === replies[i].caseId &&
          row.turn === replies[i].turn &&
          ['pass', 'fail', 'ungraded'].includes(row.status) &&
          Array.isArray(row.failedCheckIds) &&
          row.failedCheckIds.every(
            (id) => typeof id === 'string' && /^[a-z][a-z0-9_]{0,79}$/.test(id),
          ) &&
          new Set(row.failedCheckIds).size === row.failedCheckIds.length &&
          (row.status === 'fail') === row.failedCheckIds.length > 0,
      ),
  );
  for (const [status, key] of [
    ['pass', 'semanticPasses'],
    ['fail', 'semanticFailures'],
    ['ungraded', 'semanticUngraded'],
  ])
    requireThat(
      assessments.filter((row) => row.status === status).length ===
        coverage[key],
    );
  for (const outcome of result.outcomes) {
    if (outcome.caseId === control) continue;
    let failed = null;
    for (const turn of result.turnOutcomes.filter(
      (row) => row.caseId === outcome.caseId,
    )) {
      if (failed !== null) {
        requireThat(turn.outcome === 'skipped_dependent_after_semantic_fail');
        continue;
      }
      requireThat(turn.outcome === 'response');
      const observed = assessments.find(
        (row) => row.caseId === turn.caseId && row.turn === turn.turn,
      );
      if (observed.status === 'fail') failed = observed;
    }
    requireThat((outcome.outcome === 'semantic_fail') === (failed !== null));
    if (failed)
      requireThat(
        JSON.stringify(outcome.failedCheckIds) ===
          JSON.stringify(failed.failedCheckIds),
      );
  }
  requireThat(
    Array.isArray(report.responses) &&
      report.responses.length === coverage.attemptedTurns,
  );
  const attempted = result.turnOutcomes.filter((row) =>
    ['response', 'expected_refusal'].includes(row.outcome),
  );
  report.responses.forEach((row, i) => {
    requireThat(
      row.caseId === attempted[i].caseId &&
        row.turn === attempted[i].turn &&
        row.businessHashUnchanged === true &&
        Array.isArray(row.businessWrites) &&
        row.businessWrites.length === 0,
    );
    if (row.caseId === control)
      requireThat(
        row.httpStatus === 401 &&
          row.actualReply === null &&
          row.historyUnchanged === true &&
          JSON.stringify(row.expectedRefusal) ===
            JSON.stringify({ httpStatus: 401, code: 'membership_revoked' }) &&
          [
            'modelCalls',
            'serializerCalls',
            'brokerCalls',
            'modelOutputResponses',
          ].every((k) => row[k] === 0) &&
          Array.isArray(row.sourceReads) &&
          row.sourceReads.length === 0,
      );
    else
      requireThat(
        row.httpStatus === 201 &&
          typeof row.actualReply === 'string' &&
          row.actualReply.trim().length > 0,
      );
  });
  requireThat(
    coverage.semanticFailures > 0 ===
      (result.status === 'completed_with_semantic_failures') &&
      result.semanticStatus ===
        (coverage.semanticFailures > 0
          ? 'fail'
          : coverage.semanticPasses > 0
            ? 'pass'
            : 'ungraded'),
  );
  return {
    status:
      coverage.semanticFailures > 0
        ? 'completed-with-semantic-failures'
        : 'completed-diagnostic',
    executionStatus: 'completed',
    semanticStatus: result.semanticStatus,
    coverage: { ...coverage },
    exitCode: coverage.semanticFailures > 0 ? 2 : 0,
    qualification: 'SCRIPTED_SYNTHETIC_NOT_MODEL_QUALITY',
  };
}
