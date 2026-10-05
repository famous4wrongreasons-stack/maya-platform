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
export async function replayPilot(manifest, { openDialog, budget, record }) {
  const { manifestSha256, ...unsigned } = manifest;
  if (sha256(canonical(unsigned)) !== manifestSha256)
    throw new Error('manifest_hash_mismatch');
  if (
    manifest.purpose !== 'pilot_calibration_not_qualification' ||
    manifest.split !== 'dev' ||
    manifest.dialogs !== manifest.cases.length ||
    manifest.dialogs > 50 ||
    manifest.userTurns > 200
  )
    throw new Error('manifest_limits_invalid');
  const outcomes = [];
  for (const item of manifest.cases) {
    budget.dialog();
    const dialog = await openDialog({ caseId: item.id, role: item.role });
    const messages = [];
    let conversationId;
    try {
      for (const [index, text] of item.userTurns.entries()) {
        budget.turn();
        messages.push({ role: 'user', content: text });
        const requestId = sha256(`${manifestSha256}/${item.id}/${index}`).slice(
          0,
          32,
        );
        try {
          const result = await dialog.chat({
            surface: 'web',
            requestId,
            messages: structuredClone(messages),
            ...(conversationId ? { conversationId } : {}),
          });
          if (
            typeof result?.reply !== 'string' ||
            !result.reply.trim() ||
            result.reply.length > 2000
          )
            throw new Error('chat_response_invalid');
          const nextId = result.userTurn?.conversationId;
          if (
            nextId !== undefined &&
            (typeof nextId !== 'string' ||
              !nextId ||
              (conversationId && conversationId !== nextId))
          )
            throw new Error('conversation_scope_changed');
          conversationId = nextId ?? conversationId;
          messages.push({ role: 'assistant', content: result.reply });
          await record({
            caseId: item.id,
            turn: index + 1,
            requestId,
            outcome: 'response',
            reply: result.reply,
            evidence: result.evidence ?? null,
          });
        } catch {
          // Adapter/provider exceptions can contain credentials. Never serialize them.
          await record({
            caseId: item.id,
            turn: index + 1,
            requestId,
            outcome: 'unresolved',
          });
          outcomes.push({ caseId: item.id, outcome: 'unresolved' });
          // Stop the batch on any unknown result; remaining turns/cases are unexecuted.
          return {
            status: 'stopped',
            outcomes,
            qualification: 'not_evaluated',
          };
        } finally {
          budget.endTurn();
        }
      }
      outcomes.push({ caseId: item.id, outcome: 'replayed_ungraded' });
    } finally {
      await dialog.close();
    }
  }
  return {
    status: 'replayed_ungraded',
    outcomes,
    qualification: 'not_evaluated',
  };
}
