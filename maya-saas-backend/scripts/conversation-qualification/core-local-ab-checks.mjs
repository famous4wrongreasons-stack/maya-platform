// Technical completion only; no language grading and no credit for missing usage.
import assert from 'node:assert/strict';

export function checkAbUsage(status, text, reservation) {
  assert.equal(status, 200, 'core_ab_provider_refused');
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error('core_ab_usage_unknown');
  }
  const usage = body?.usage;
  assert.ok(usage && reservation, 'core_ab_usage_unknown');
  for (const key of ['prompt_tokens', 'completion_tokens', 'total_tokens'])
    assert.ok(
      Number.isSafeInteger(usage[key]) && usage[key] >= 0,
      'core_ab_usage_unknown',
    );
  assert.equal(
    usage.total_tokens,
    usage.prompt_tokens + usage.completion_tokens,
    'core_ab_usage_inconsistent',
  );
  assert.ok(
    usage.prompt_tokens <= reservation.input &&
      usage.completion_tokens <= reservation.output,
    'core_ab_usage_exceeds_reserve',
  );
  const cache = ['prompt_cache_hit_tokens', 'prompt_cache_miss_tokens'];
  if (cache.some((key) => Object.hasOwn(usage, key))) {
    for (const key of cache)
      assert.ok(
        Number.isSafeInteger(usage[key]) && usage[key] >= 0,
        'core_ab_usage_unknown',
      );
    assert.equal(
      usage.prompt_cache_hit_tokens + usage.prompt_cache_miss_tokens,
      usage.prompt_tokens,
      'core_ab_usage_inconsistent',
    );
  }
  assert.ok(
    body.choices?.length === 1 &&
      body.choices[0].finish_reason === 'stop' &&
      typeof body.choices[0].message?.content === 'string' &&
      body.choices[0].message.content.trim().length > 0,
    'core_ab_response_incomplete',
  );
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}

export function checkAbStageCompletion({
  runner,
  broker,
  manifest,
  exitCode,
  groupAlive,
}) {
  assert.equal(exitCode, 0, 'core_ab_runner_failed');
  assert.ok(
    runner?.status === 'passed-ungraded' &&
      runner.sourcesUnchanged === true &&
      runner.clusterStopped === true &&
      runner.postmasterPidAbsent === true,
    'core_ab_runner_incomplete',
  );
  assert.equal(
    runner.manifestSha256,
    manifest.manifestSha256,
    'core_ab_runner_binding',
  );
  const groups = Object.values(runner.groups ?? {});
  assert.ok(
    groups.length > 0 &&
      groups.every(
        (g) =>
          g.closed === true &&
          g.groupAbsent === true &&
          Number.isSafeInteger(g.pgid) &&
          g.pgid > 1 &&
          groupAlive(g.pgid) === false,
      ),
    'core_ab_cleanup_unknown',
  );
  assert.ok(
    broker?.stopped === true &&
      broker.stopReason === 'explicit_finish' &&
      broker.rejections.length === 0 &&
      broker.stats?.halted === false,
    'core_ab_broker_incomplete',
  );
  assert.equal(
    broker.manifestSha256,
    manifest.manifestSha256,
    'core_ab_broker_binding',
  );
  for (const c of manifest.cases)
    for (let turn = 1; turn <= c.userTurns.length; turn++)
      assert.ok(
        broker.requests.some((r) => r.caseId === c.id && r.turn === turn),
        'core_ab_turn_incomplete',
      );
  return true;
}
