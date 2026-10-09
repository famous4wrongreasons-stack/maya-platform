import { createHash } from 'node:crypto';

export const sha256 = (value) =>
  createHash('sha256').update(value).digest('hex');
const canonical = (value) => JSON.stringify(value);

/** Calibration only: dev cases, never the held-out test families. Labels stay outside the turn. */
export function freezePilot(
  source,
  limit = 50,
  roles = ['owner', 'admin', 'client'],
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new Error('pilot_size_invalid');
  if (
    !Array.isArray(roles) ||
    !roles.length ||
    new Set(roles).size !== roles.length ||
    roles.some((r) => !['owner', 'admin', 'client'].includes(r))
  )
    throw new Error('pilot_roles_invalid');
  const rows = source.trim().split('\n').map(JSON.parse);
  const ids = new Set(),
    families = new Map(),
    buckets = new Map();
  for (const row of rows) {
    if (typeof row.id !== 'string' || ids.has(row.id))
      throw new Error('case_id_invalid');
    ids.add(row.id);
    if (
      !['train', 'dev', 'test'].includes(row.split) ||
      typeof row.family_id !== 'string'
    )
      throw new Error('case_split_invalid');
    const prior = families.get(row.family_id);
    if (prior && prior !== row.split) throw new Error('family_split_leakage');
    families.set(row.family_id, row.split);
    if (row.split !== 'dev' || !roles.includes(row.role)) continue;
    if (
      !['owner', 'admin', 'client'].includes(row.role) ||
      typeof row.archetype !== 'string' ||
      !Array.isArray(row.conversation) ||
      !row.conversation.length ||
      row.conversation.some(
        (t) =>
          !['user', 'assistant'].includes(t.speaker) ||
          typeof t.text !== 'string' ||
          !t.text.trim() ||
          t.text.length > 2000,
      )
    )
      throw new Error('case_contract_invalid');
    const userTurns = row.conversation
      .filter((t) => t.speaker === 'user')
      .map((t) => t.text);
    if (!userTurns.length || userTurns.length > 4)
      throw new Error('case_turn_limit');
    const entry = {
      id: row.id,
      familyId: row.family_id,
      role: row.role,
      group: row.archetype,
      sourceCaseSha256: sha256(canonical(row)),
      userTurns,
      // These are evaluation hints, not a grading oracle and never model input.
      reviewChecks: row.checks,
      expectedIntents: row.resolved_intents,
    };
    const key = `${row.archetype}/${row.role}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(entry);
  }
  const queues = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, entries]) =>
      entries
        .sort((a, b) => a.sourceCaseSha256.localeCompare(b.sourceCaseSha256))
        .map((entry, index, sorted) => ({
          entry,
          repeated: sorted
            .slice(0, index)
            .some((prior) => prior.familyId === entry.familyId),
        }))
        .sort((a, b) => Number(a.repeated) - Number(b.repeated))
        .map(({ entry }) => entry),
    );
  const cases = [];
  while (cases.length < limit && queues.some((q) => q.length)) {
    for (const queue of queues) {
      if (queue.length && cases.length < limit) cases.push(queue.shift());
    }
  }
  if (cases.length !== limit) throw new Error('insufficient_dev_cases');
  const manifest = {
    version: 1,
    purpose: 'pilot_calibration_not_qualification',
    sourceSha256: sha256(source),
    split: 'dev',
    roles,
    dialogs: cases.length,
    independentFamilies: new Set(cases.map((c) => c.familyId)).size,
    userTurns: cases.reduce((n, c) => n + c.userTurns.length, 0),
    cases,
  };
  return { ...manifest, manifestSha256: sha256(canonical(manifest)) };
}

/** The injected adapter must call the canonical authenticated HTTP route in an isolated fixture.
 * It receives no gold assistant text, expected intents, or review checks. Every next history item
 * comes from the actual response. No automatic retry of a failed/unknown chat mutation.
 * This module opens no network and reads no credential. It does not grade language correctness.
 */
export async function replayPilot(
  manifest,
  { openDialog, budget, record, semanticFailure, assessTurn, expectedRefusals },
) {
  const { manifestSha256, ...unsigned } = manifest;
  if (sha256(canonical(unsigned)) !== manifestSha256)
    throw new Error('manifest_hash_mismatch');
  if (
    manifest.purpose !== 'pilot_calibration_not_qualification' ||
    manifest.split !== 'dev' ||
    manifest.dialogs !== manifest.cases.length ||
    manifest.dialogs > 50 ||
    manifest.userTurns > 200 ||
    manifest.userTurns !==
      manifest.cases.reduce((n, c) => n + c.userTurns.length, 0)
  )
    throw new Error('manifest_limits_invalid');
  const assessed = semanticFailure !== undefined || assessTurn !== undefined;
  if (
    assessed &&
    (semanticFailure !== 'next_independent_dialog' ||
      typeof assessTurn !== 'function')
  )
    throw new Error('replay_assessment_contract');
  // One predeclared negative control in the separately pinned offline corpus.
  // No arbitrary error becomes a valid reply or permits history advancement.
  const revokedControl = {
    caseId: 'current-lifecycle-negative',
    turn: 1,
    httpStatus: 401,
    code: 'membership_revoked',
  };
  if (expectedRefusals !== undefined) {
    const row = manifest.cases.find(
      (item) => item.id === revokedControl.caseId,
    );
    if (
      manifest.sourceSha256 !==
        '9c8db1420c489169a474b04dd43933110461fe3630e3ada2fb0e8dc40e7eb15b' ||
      manifest.dialogs !== 48 ||
      manifest.userTurns !== 81 ||
      canonical(expectedRefusals) !== canonical([revokedControl]) ||
      row?.role !== 'owner' ||
      canonical(row.userTurns) !==
        canonical(['После отзыва доступа всё равно покажи прежний результат.'])
    )
      throw new Error('replay_expected_refusal_contract');
  }
  const outcomes = [];
  const turns = manifest.cases.flatMap((c) =>
    c.userTurns.map((_, i) => ({
      caseId: c.id,
      turn: i + 1,
      outcome: 'unexecuted',
    })),
  );
  let stopped = false,
    attempted = 0,
    assessedPasses = 0,
    assessedFailures = 0,
    assessedUngraded = 0;
  for (const item of manifest.cases) {
    let dialog,
      caseOutcome = 'replayed_ungraded';
    const failedCheckIds = [];
    const messages = [];
    let conversationId;
    try {
      budget.dialog();
      dialog = await openDialog({ caseId: item.id, role: item.role });
      for (const [index, text] of item.userTurns.entries()) {
        const ledger = turns.find(
          (t) => t.caseId === item.id && t.turn === index + 1,
        );
        const requestId = sha256(`${manifestSha256}/${item.id}/${index}`).slice(
          0,
          32,
        );
        let activeTurn = false;
        try {
          budget.turn();
          activeTurn = true;
          messages.push({ role: 'user', content: text });
          attempted++;
          ledger.outcome = 'unresolved';
          const result = await dialog.chat({
            surface: 'web',
            requestId,
            messages: structuredClone(messages),
            ...(conversationId ? { conversationId } : {}),
          });
          if (
            expectedRefusals !== undefined &&
            item.id === revokedControl.caseId
          ) {
            if (
              index !== 0 ||
              !result ||
              canonical(result) !==
                canonical({
                  expectedRefusal: {
                    httpStatus: revokedControl.httpStatus,
                    code: revokedControl.code,
                  },
                })
            )
              throw new Error('replay_expected_refusal_mismatch');
            ledger.outcome = 'expected_refusal';
            caseOutcome = 'expected_refusal';
            // The attempted user turn is recorded; there is no assistant reply,
            // conversation id, semantic assessment or later history to fabricate.
            await record({
              caseId: item.id,
              turn: index + 1,
              requestId,
              outcome: 'expected_refusal',
              ...result.expectedRefusal,
            });
            break;
          }
          if (
            typeof result?.reply !== 'string' ||
            !result.reply.trim() ||
            result.reply.length > 3500
          )
            throw new Error('chat_response_invalid');
          const nextId = result.userTurn?.conversationId;
          if (
            typeof nextId !== 'string' ||
            !nextId.trim() ||
            (conversationId && conversationId !== nextId)
          )
            throw new Error('conversation_scope_changed');
          conversationId = nextId;
          messages.push({ role: 'assistant', content: result.reply });
          ledger.outcome = 'response';
          await record({
            caseId: item.id,
            turn: index + 1,
            requestId,
            outcome: 'response',
            reply: result.reply,
            evidence: result.evidence ?? null,
          });
          if (assessed) {
            const assessment = await assessTurn({
              caseId: item.id,
              turn: index + 1,
              result,
            });
            if (
              !assessment ||
              typeof assessment !== 'object' ||
              Array.isArray(assessment) ||
              Object.keys(assessment).sort().join(',') !==
                'failedCheckIds,status' ||
              !['pass', 'fail', 'ungraded'].includes(assessment.status) ||
              !Array.isArray(assessment.failedCheckIds) ||
              assessment.failedCheckIds.length > 32 ||
              assessment.failedCheckIds.some(
                (id) =>
                  typeof id !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/.test(id),
              ) ||
              new Set(assessment.failedCheckIds).size !==
                assessment.failedCheckIds.length ||
              (assessment.status === 'fail') !==
                assessment.failedCheckIds.length > 0
            )
              throw new Error('replay_assessment_invalid');
            await record({
              caseId: item.id,
              turn: index + 1,
              outcome: 'semantic_assessment',
              ...assessment,
            });
            if (assessment.status === 'pass') assessedPasses++;
            if (assessment.status === 'ungraded') assessedUngraded++;
            if (assessment.status === 'fail') {
              assessedFailures++;
              caseOutcome = 'semantic_fail';
              failedCheckIds.push(...assessment.failedCheckIds);
              for (let next = index + 1; next < item.userTurns.length; next++) {
                turns.find(
                  (t) => t.caseId === item.id && t.turn === next + 1,
                ).outcome = 'skipped_dependent_after_semantic_fail';
                await record({
                  caseId: item.id,
                  turn: next + 1,
                  outcome: 'skipped_dependent_after_semantic_fail',
                });
              }
              break;
            }
          }
        } catch {
          // No exception text: providers, fixtures and assessors may hold private data.
          stopped = true;
          caseOutcome = 'unresolved';
          await record({
            caseId: item.id,
            turn: index + 1,
            requestId,
            outcome: 'unresolved',
          });
          break;
        } finally {
          if (activeTurn) budget.endTurn();
        }
      }
    } catch {
      stopped = true;
      caseOutcome = 'unresolved';
    } finally {
      try {
        await dialog?.close();
      } catch {
        stopped = true;
        caseOutcome = 'unresolved';
      }
    }
    outcomes.push({
      caseId: item.id,
      outcome: caseOutcome,
      ...(failedCheckIds.length ? { failedCheckIds } : {}),
    });
    if (stopped) break;
  }
  if (stopped)
    for (const item of manifest.cases.slice(outcomes.length))
      outcomes.push({ caseId: item.id, outcome: 'not_started_after_stop' });
  const count = (outcome) => turns.filter((t) => t.outcome === outcome).length;
  return {
    status: stopped
      ? 'stopped'
      : assessedFailures
        ? 'completed_with_semantic_failures'
        : 'replayed_ungraded',
    executionStatus: stopped ? 'stopped' : 'completed',
    semanticStatus: assessedFailures
      ? 'fail'
      : assessedPasses
        ? 'pass'
        : 'ungraded',
    outcomes,
    qualification: 'not_evaluated',
    coverage: {
      plannedTurns: manifest.userTurns,
      attemptedTurns: attempted,
      validResponses: count('response'),
      ...(expectedRefusals !== undefined
        ? { expectedRefusals: count('expected_refusal') }
        : {}),
      unresolvedTurns: count('unresolved'),
      skippedDependentTurns: count('skipped_dependent_after_semantic_fail'),
      unexecutedTurns: count('unexecuted'),
      semanticPasses: assessedPasses,
      semanticFailures: assessedFailures,
      semanticUngraded: assessedUngraded,
    },
    turnOutcomes: turns,
  };
}
