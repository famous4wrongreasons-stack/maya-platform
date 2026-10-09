import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkAbUsage,
  checkAbStageCompletion,
} from './core-local-ab-checks.mjs';

// Pure synthetic report contracts: no sockets, children, permits, credentials,
// model requests or filesystem. These checks do not grade natural language.
const reservation = { input: 100, output: 20 };
const response = () => ({
  usage: { prompt_tokens: 80, completion_tokens: 10, total_tokens: 90 },
  choices: [
    { finish_reason: 'stop', message: { content: 'synthetic content' } },
  ],
});
const usage = (body, reserve = reservation, status = 200) =>
  checkAbUsage(status, JSON.stringify(body), reserve);

test('valid usage with and without complete cache accounting returns only numerical usage', () => {
  for (const cached of [false, true]) {
    const body = response();
    if (cached) {
      body.usage.prompt_cache_hit_tokens = 30;
      body.usage.prompt_cache_miss_tokens = 50;
    }
    const before = structuredClone(body);
    assert.deepEqual(usage(body), {
      promptTokens: 80,
      completionTokens: 10,
      totalTokens: 90,
    });
    assert.deepEqual(body, before);
  }
});

test('inclusive reservation boundaries are accepted without grading the reply', () => {
  const body = response();
  body.usage = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 };
  body.choices[0].message.content =
    'An irrelevant answer is still technically complete.';
  assert.deepEqual(usage(body), {
    promptTokens: 100,
    completionTokens: 20,
    totalTokens: 120,
  });
});

for (const [label, mutate, code] of [
  [
    'missing usage',
    (b) => {
      delete b.usage;
    },
    'unknown',
  ],
  [
    'missing prompt count',
    (b) => {
      delete b.usage.prompt_tokens;
    },
    'unknown',
  ],
  [
    'missing completion count',
    (b) => {
      delete b.usage.completion_tokens;
    },
    'unknown',
  ],
  [
    'missing total count',
    (b) => {
      delete b.usage.total_tokens;
    },
    'unknown',
  ],
  [
    'negative count',
    (b) => {
      b.usage.prompt_tokens = -1;
    },
    'unknown',
  ],
  [
    'fractional count',
    (b) => {
      b.usage.completion_tokens = 0.5;
    },
    'unknown',
  ],
  [
    'string count',
    (b) => {
      b.usage.total_tokens = '90';
    },
    'unknown',
  ],
  [
    'unsafe integer',
    (b) => {
      b.usage.prompt_tokens = Number.MAX_SAFE_INTEGER + 1;
    },
    'unknown',
  ],
  [
    'inconsistent total',
    (b) => {
      b.usage.total_tokens++;
    },
    'inconsistent',
  ],
  [
    'prompt exceeds reserve',
    (b) => {
      b.usage.prompt_tokens = 101;
      b.usage.total_tokens = 111;
    },
    'exceeds_reserve',
  ],
  [
    'completion exceeds reserve',
    (b) => {
      b.usage.completion_tokens = 21;
      b.usage.total_tokens = 101;
    },
    'exceeds_reserve',
  ],
  [
    'only cache hits',
    (b) => {
      b.usage.prompt_cache_hit_tokens = 30;
    },
    'unknown',
  ],
  [
    'only cache misses',
    (b) => {
      b.usage.prompt_cache_miss_tokens = 50;
    },
    'unknown',
  ],
  [
    'negative cache count',
    (b) => {
      b.usage.prompt_cache_hit_tokens = -1;
      b.usage.prompt_cache_miss_tokens = 81;
    },
    'unknown',
  ],
  [
    'fractional cache count',
    (b) => {
      b.usage.prompt_cache_hit_tokens = 0.5;
      b.usage.prompt_cache_miss_tokens = 79.5;
    },
    'unknown',
  ],
  [
    'inconsistent cache total',
    (b) => {
      b.usage.prompt_cache_hit_tokens = 30;
      b.usage.prompt_cache_miss_tokens = 49;
    },
    'inconsistent',
  ],
]) {
  test(`usage refuses ${label}`, () => {
    const body = response();
    mutate(body);
    assert.throws(() => usage(body), new RegExp(`core_ab_usage_${code}`));
  });
}

test('unknown JSON, null usage and absent reservation cannot receive usage credit', () => {
  assert.throws(
    () => checkAbUsage(200, '{', reservation),
    /core_ab_usage_unknown/,
  );
  assert.throws(() => usage(null), /core_ab_usage_unknown/);
  assert.throws(
    () => checkAbUsage(200, JSON.stringify(response()), null),
    /core_ab_usage_unknown/,
  );
});

test('non-200 responses are refused even when their usage and content are well formed', () => {
  for (const status of [201, 400, 401, 429, 500, 503])
    assert.throws(
      () => usage(response(), reservation, status),
      /core_ab_provider_refused/,
    );
});

for (const [label, mutate] of [
  [
    'missing choices',
    (b) => {
      delete b.choices;
    },
  ],
  [
    'empty choices',
    (b) => {
      b.choices = [];
    },
  ],
  [
    'multiple choices',
    (b) => {
      b.choices.push(structuredClone(b.choices[0]));
    },
  ],
  [
    'truncated response',
    (b) => {
      b.choices[0].finish_reason = 'length';
    },
  ],
  [
    'missing finish reason',
    (b) => {
      delete b.choices[0].finish_reason;
    },
  ],
  [
    'missing message',
    (b) => {
      delete b.choices[0].message;
    },
  ],
  [
    'empty content',
    (b) => {
      b.choices[0].message.content = '';
    },
  ],
  [
    'whitespace-only content',
    (b) => {
      b.choices[0].message.content = ' \n\t ';
    },
  ],
  [
    'nonstring content',
    (b) => {
      b.choices[0].message.content = ['synthetic'];
    },
  ],
]) {
  test(`response refuses ${label}`, () => {
    const body = response();
    mutate(body);
    assert.throws(() => usage(body), /core_ab_response_incomplete/);
  });
}

function completed() {
  const manifestSha256 = 'a'.repeat(64);
  return {
    manifest: {
      manifestSha256,
      cases: [
        { id: 'first', userTurns: ['one', 'two'] },
        { id: 'second', userTurns: ['three'] },
      ],
    },
    runner: {
      status: 'passed-ungraded',
      manifestSha256,
      sourcesUnchanged: true,
      clusterStopped: true,
      postmasterPidAbsent: true,
      groups: {
        conversation: { closed: true, groupAbsent: true, pgid: 12001 },
        'pg-stop': { closed: true, groupAbsent: true, pgid: 12002 },
      },
    },
    broker: {
      stopped: true,
      stopReason: 'explicit_finish',
      manifestSha256,
      rejections: [],
      stats: { halted: false },
      requests: [
        { caseId: 'first', turn: 1, status: 200 },
        { caseId: 'first', turn: 2, status: 200 },
        { caseId: 'second', turn: 1, status: 200 },
      ],
    },
    exitCode: 0,
    groupAlive: () => false,
  };
}

test('stage completion checks actual group absence and every turn but grants no language grade', () => {
  const input = completed(),
    observed = [];
  input.groupAlive = (pgid) => {
    observed.push(pgid);
    return false;
  };
  input.runner.languageGrade = 'NOT_EVALUATED';
  assert.equal(checkAbStageCompletion(input), true);
  assert.deepEqual(observed, [12001, 12002]);
  assert.equal(input.runner.status, 'passed-ungraded');
  assert.equal(input.runner.languageGrade, 'NOT_EVALUATED');
});

for (const [label, mutate, code] of [
  [
    'failed child exit',
    (x) => {
      x.exitCode = 1;
    },
    'runner_failed',
  ],
  [
    'signal exit',
    (x) => {
      x.exitCode = null;
    },
    'runner_failed',
  ],
  [
    'runner did not pass',
    (x) => {
      x.runner.status = 'failed';
    },
    'runner_incomplete',
  ],
  [
    'source drift',
    (x) => {
      x.runner.sourcesUnchanged = false;
    },
    'runner_incomplete',
  ],
  [
    'PG not stopped',
    (x) => {
      x.runner.clusterStopped = false;
    },
    'runner_incomplete',
  ],
  [
    'PG pidfile not absent',
    (x) => {
      delete x.runner.postmasterPidAbsent;
    },
    'runner_incomplete',
  ],
  [
    'foreign runner binding',
    (x) => {
      x.runner.manifestSha256 = 'b'.repeat(64);
    },
    'runner_binding',
  ],
  [
    'missing groups',
    (x) => {
      delete x.runner.groups;
    },
    'cleanup_unknown',
  ],
  [
    'unclosed group',
    (x) => {
      x.runner.groups.conversation.closed = false;
    },
    'cleanup_unknown',
  ],
  [
    'unconfirmed group absence',
    (x) => {
      x.runner.groups.conversation.groupAbsent = false;
    },
    'cleanup_unknown',
  ],
  [
    'invalid pgid',
    (x) => {
      x.runner.groups.conversation.pgid = 1;
    },
    'cleanup_unknown',
  ],
  [
    'group still alive',
    (x) => {
      x.groupAlive = () => true;
    },
    'cleanup_unknown',
  ],
  [
    'undefined OS observation',
    (x) => {
      x.groupAlive = () => undefined;
    },
    'cleanup_unknown',
  ],
  [
    'null OS observation',
    (x) => {
      x.groupAlive = () => null;
    },
    'cleanup_unknown',
  ],
  [
    'numeric OS observation',
    (x) => {
      x.groupAlive = () => 0;
    },
    'cleanup_unknown',
  ],
  [
    'broker only stopping',
    (x) => {
      x.broker.stopped = false;
    },
    'broker_incomplete',
  ],
  [
    'broker ended by TTL',
    (x) => {
      x.broker.stopReason = 'ttl';
    },
    'broker_incomplete',
  ],
  [
    'broker ended by runner exit',
    (x) => {
      x.broker.stopReason = 'runner_finished';
    },
    'broker_incomplete',
  ],
  [
    'broker rejected a request',
    (x) => {
      x.broker.rejections.push({ code: 'synthetic_refusal' });
    },
    'broker_incomplete',
  ],
  [
    'broker halted',
    (x) => {
      x.broker.stats.halted = true;
    },
    'broker_incomplete',
  ],
  [
    'broker missing budget stats',
    (x) => {
      delete x.broker.stats;
    },
    'broker_incomplete',
  ],
  [
    'foreign broker binding',
    (x) => {
      x.broker.manifestSha256 = 'b'.repeat(64);
    },
    'broker_binding',
  ],
  [
    'one missing turn',
    (x) => {
      x.broker.requests.splice(1, 1);
    },
    'turn_incomplete',
  ],
  [
    'another case cannot replace a missing turn',
    (x) => {
      x.broker.requests[1].caseId = 'foreign';
    },
    'turn_incomplete',
  ],
  [
    'duplicate first turn cannot replace second',
    (x) => {
      x.broker.requests[1].turn = 1;
    },
    'turn_incomplete',
  ],
]) {
  test(`stage completion refuses ${label}`, () => {
    const input = completed();
    mutate(input);
    assert.throws(
      () => checkAbStageCompletion(input),
      new RegExp(`core_ab_${code}`),
    );
  });
}

test('OS observation error cannot be treated as confirmed absence', () => {
  const input = completed();
  input.groupAlive = () => {
    throw new Error('synthetic_EPERM');
  };
  assert.throws(() => checkAbStageCompletion(input), /synthetic_EPERM/);
});
