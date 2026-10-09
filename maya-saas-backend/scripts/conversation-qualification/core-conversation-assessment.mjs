// Finite diagnostic checks over observed HTTP facts only. Never model input,
// authority, substitute replies, a language-quality score or a continuation store.
export const CORE_CASE_TURNS = Object.freeze({
  'core-client-create-followup': 2,
  'core-owner-compound-clarification': 2,
  'core-admin-private-data-refusal': 1,
  'followup-client-carry-over': 3,
  'followup-client-entity-correction': 2,
  'followup-admin-typo-ambiguous-period': 1,
  'followup-owner-topic-switch': 3,
  'followup-owner-compound': 1,
  'followup-admin-general-chat': 3,
});
export const CORE_FOLLOWUP_CASE_IDS = Object.freeze(
  Object.keys(CORE_CASE_TURNS).slice(3),
);
export function assessCoreTurn(facts) {
  const {
    caseId,
    turn,
    reply,
    previousReply,
    modelResponses,
    currentSelection,
    ownerEvidenceBounded,
    ownerContextRestored,
    groundingStatus,
    readCount,
    toolCount,
  } = facts;
  if (
    !Object.hasOwn(CORE_CASE_TURNS, caseId) ||
    !Number.isSafeInteger(turn) ||
    turn < 1 ||
    turn > CORE_CASE_TURNS[caseId] ||
    typeof reply !== 'string' ||
    !reply.trim() ||
    reply.length > 3500 ||
    !(previousReply === null || typeof previousReply === 'string') ||
    [modelResponses, readCount, toolCount].some(
      (n) => !Number.isSafeInteger(n) || n < 0,
    ) ||
    [currentSelection, ownerEvidenceBounded, ownerContextRestored].some(
      (b) => typeof b !== 'boolean',
    ) ||
    !(groundingStatus === null || typeof groundingStatus === 'string')
  )
    throw Error('core_semantic_observation_invalid');
  const checks = [];
  const check = (id, passed) => checks.push({ id, passed });
  if (turn > 1)
    check('followup_does_not_repeat_previous_reply', reply !== previousReply);
  if (caseId === 'core-client-create-followup' && turn === 2)
    check(
      'explicit_time_has_current_selection',
      currentSelection && reply.includes('17:00'),
    );
  if (caseId === 'core-owner-compound-clarification' && turn === 2) {
    check('owner_scope_context_restored', ownerContextRestored);
    check('owner_acceptance_reaches_saved_evidence', ownerEvidenceBounded);
  }
  if (caseId === 'followup-owner-compound')
    check('compound_reaches_saved_evidence', ownerEvidenceBounded);
  if (caseId === 'followup-admin-general-chat') {
    check('general_chat_model_response_observed', modelResponses > 0);
    check(
      'general_chat_requires_no_business_grounding',
      groundingStatus === 'not_required',
    );
    check(
      'general_chat_not_role_blocked',
      !reply.includes('недоступен для вашей текущей роли'),
    );
  }
  if (caseId === 'core-admin-private-data-refusal')
    check(
      'private_request_has_explicit_refusal',
      /не раскрываю|не могу (?:раскрыть|предоставить|сообщить)|не предоставляю/i.test(
        reply,
      ),
    );
  if (caseId === 'followup-admin-typo-ambiguous-period')
    check(
      'ambiguous_request_is_clarified',
      reply.includes('?') && readCount === 0 && toolCount === 0,
    );
  const failedCheckIds = checks.filter((c) => !c.passed).map((c) => c.id);
  return {
    status: failedCheckIds.length
      ? 'fail'
      : checks.length
        ? 'pass'
        : 'ungraded',
    failedCheckIds,
  };
}

// The runner consumes only this finite, bound mechanical summary after Jest has
// closed the HTTP fixture. A semantic failure is never relabelled as a pass.
export function summarizeCoreUnionReport(report, binding) {
  const result = report?.result,
    coverage = result?.coverage;
  const counts = [
    'plannedTurns',
    'attemptedTurns',
    'validResponses',
    'unresolvedTurns',
    'skippedDependentTurns',
    'unexecutedTurns',
    'semanticPasses',
    'semanticFailures',
    'semanticUngraded',
  ];
  if (
    report?.profile !== 'core-union-20261009/1' ||
    report.manifestSha256 !== binding.manifestSha256 ||
    report.sourceHead !== binding.candidateCommit ||
    report.stopped !== null ||
    report.forbidden?.length !== 0 ||
    result?.executionStatus !== 'completed' ||
    !['replayed_ungraded', 'completed_with_semantic_failures'].includes(
      result.status,
    ) ||
    !coverage ||
    counts.some(
      (k) =>
        !Number.isSafeInteger(coverage[k]) ||
        coverage[k] < 0 ||
        coverage[k] > 18,
    ) ||
    coverage.plannedTurns !== 18 ||
    coverage.unresolvedTurns !== 0 ||
    coverage.unexecutedTurns !== 0 ||
    coverage.attemptedTurns !== coverage.validResponses ||
    coverage.validResponses + coverage.skippedDependentTurns !== 18 ||
    coverage.semanticPasses +
      coverage.semanticFailures +
      coverage.semanticUngraded !==
      coverage.validResponses ||
    report.actualHttpTurns !== coverage.attemptedTurns ||
    !Array.isArray(result.outcomes) ||
    result.outcomes.length !== 9 ||
    JSON.stringify(result.outcomes.map((r) => r.caseId)) !==
      JSON.stringify(Object.keys(CORE_CASE_TURNS)) ||
    result.outcomes.some(
      (row) => !['semantic_fail', 'replayed_ungraded'].includes(row.outcome),
    ) ||
    result.outcomes.filter((row) => row.outcome === 'semantic_fail').length !==
      coverage.semanticFailures ||
    !Array.isArray(result.turnOutcomes) ||
    result.turnOutcomes.length !== 18
  )
    throw Error('core_union_report_unconfirmed');
  const expected = Object.entries(CORE_CASE_TURNS).flatMap(([caseId, n]) =>
    Array.from({ length: n }, (_, i) => `${caseId}:${i + 1}`),
  );
  if (
    result.turnOutcomes.some(
      (row, i) =>
        `${row.caseId}:${row.turn}` !== expected[i] ||
        !['response', 'skipped_dependent_after_semantic_fail'].includes(
          row.outcome,
        ),
    ) ||
    result.turnOutcomes.filter((r) => r.outcome === 'response').length !==
      coverage.validResponses ||
    coverage.semanticFailures > 0 !==
      (result.status === 'completed_with_semantic_failures') ||
    result.semanticStatus !==
      (coverage.semanticFailures > 0
        ? 'fail'
        : coverage.semanticPasses > 0
          ? 'pass'
          : 'ungraded')
  )
    throw Error('core_union_report_unconfirmed');
  return {
    status:
      coverage.semanticFailures > 0
        ? 'completed-with-semantic-failures'
        : 'completed-diagnostic',
    executionStatus: 'completed',
    semanticStatus: result.semanticStatus,
    coverage: { ...coverage },
    exitCode: coverage.semanticFailures > 0 ? 2 : 0,
  };
}

// Inspect the returned read projection only. This is a diagnostic fact check,
// not seal verification or authority to submit the opaque slot/staff handles.
export function hasExactReviewedSlot(resolution, expected) {
  const receipt = resolution?.receipt,
    envelope = receipt?.envelope,
    body = envelope?.body;
  const at = Date.parse(expected.start);
  if (
    !Number.isFinite(at) ||
    typeof expected.tenantId !== 'string' ||
    !expected.tenantId ||
    resolution?.matched !== true ||
    typeof receipt?.widget_id !== 'string' ||
    !receipt.widget_id ||
    envelope?.contract !== 'maya.widget.envelope/1' ||
    envelope.widget_id !== receipt.widget_id ||
    envelope.kind !== 'TIME_SLOT_SELECTOR' ||
    envelope.tenant_id !== expected.tenantId ||
    envelope.provenance?.source_capability !== 'booking.availability.read' ||
    body?.prompt?.rendered !== 'Проверьте выбранное время' ||
    body.timezone !== expected.timezone ||
    body.grouping !== 'flat' ||
    body.shown_count !== 1 ||
    !Array.isArray(body.groups) ||
    body.groups.length !== 1 ||
    body.groups[0]?.label?.rendered !== 'Выбранное время' ||
    !Array.isArray(body.groups[0].slots) ||
    body.groups[0].slots.length !== 1
  )
    return false;
  const slot = body.groups[0].slots[0];
  return (
    slot?.start?.unit === 'datetime' &&
    typeof slot.start.value === 'string' &&
    Date.parse(slot.start.value) === at &&
    Date.parse(body.window?.from) === at &&
    Date.parse(body.window?.to) === at &&
    typeof slot.slot_ref === 'string' &&
    slot.slot_ref.length > 0 &&
    typeof slot.staff_ref === 'string' &&
    slot.staff_ref.length > 0
  );
}
