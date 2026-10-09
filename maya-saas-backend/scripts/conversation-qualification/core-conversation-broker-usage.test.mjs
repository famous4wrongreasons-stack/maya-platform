// Synthetic transport mechanics only. No sockets, provider, credential,
// permit, subprocess or PostgreSQL; this is not model-quality acceptance.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCoreUsageFence } from './core-conversation-broker.mjs';
import {
  candidateReservation,
  CORE_DIAGNOSTIC_PROFILE,
  CORE_FOLLOWUP_PROFILE,
  CORE_UNION_PROFILE,
} from './current-candidate-budget.mjs';

const endpoint = 'https://api.deepseek.com/chat/completions';
const request = (max = 16) => ({
  method: 'POST',
  body: JSON.stringify({
    model: 'deepseek-v4-pro',
    messages: [{ role: 'user', content: 'synthetic payload' }],
    max_tokens: max,
    stream: false,
    thinking: { type: 'disabled' },
  }),
});
const envelope = () => ({
  usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
  choices: [{ finish_reason: 'stop', message: { content: 'synthetic reply' } }],
});
const profiles = [
  CORE_DIAGNOSTIC_PROFILE,
  CORE_FOLLOWUP_PROFILE,
  CORE_UNION_PROFILE,
];

function fixture(profile, onUnknown = () => {}) {
  const observations = { fetches: 0, delivered: [], stopped: 0 };
  const fence = createCoreUsageFence({
    profile,
    onUnknown() {
      observations.stopped++;
      onUnknown();
    },
  });
  return {
    fence,
    observations,
    // Matches the live order: full serialized request -> bounded response ->
    // usage validation -> optional consumer. There is no network implementation.
    async exchange(body, { status = 200, init = request(), consume } = {}) {
      fence.reserve(endpoint, init);
      const fakeFetch = async () => {
        observations.fetches++;
        return new Response(
          typeof body === 'string' ? body : JSON.stringify(body),
          { status },
        );
      };
      const result = await fakeFetch();
      const text = await result.text();
      const usage = fence.response(result.status, text);
      consume?.(usage);
      observations.delivered.push(text);
      return usage;
    },
  };
}

for (const profile of profiles) {
  test(`${profile}: actual usage is validated without optional batch callbacks`, async () => {
    const f = fixture(profile);
    assert.deepEqual(await f.exchange(envelope()), {
      promptTokens: 10,
      completionTokens: 4,
      totalTokens: 14,
    });
    assert.equal(f.observations.fetches, 1);
    assert.equal(f.observations.delivered.length, 1);
    assert.equal(f.observations.stopped, 0);
    const second = envelope();
    second.usage.prompt_cache_hit_tokens = 3;
    second.usage.prompt_cache_miss_tokens = 7;
    await f.exchange(second);
    assert.equal(f.observations.fetches, 2);
    assert.equal(f.observations.delivered.length, 2);
  });

  test(`${profile}: exact inclusive reservation is accepted; semantics are ungraded`, async () => {
    const f = fixture(profile),
      init = request();
    const reserved = candidateReservation(endpoint, init, profile);
    const body = envelope();
    body.choices[0].message.content = 'This reply is intentionally irrelevant.';
    body.usage = {
      prompt_tokens: reserved.input,
      completion_tokens: reserved.output,
      total_tokens: reserved.input + reserved.output,
    };
    const usage = await f.exchange(body, { init });
    assert.equal(usage.promptTokens, reserved.input);
    assert.equal(usage.completionTokens, reserved.output);
    assert.equal(f.observations.stopped, 0);
  });

  for (const [label, mutate, status] of [
    [
      'missing usage',
      (b) => {
        delete b.usage;
      },
    ],
    [
      'negative usage',
      (b) => {
        b.usage.prompt_tokens = -1;
      },
    ],
    [
      'non-integral usage',
      (b) => {
        b.usage.completion_tokens = 0.5;
      },
    ],
    [
      'inconsistent total',
      (b) => {
        b.usage.total_tokens++;
      },
    ],
    [
      'missing cache counterpart',
      (b) => {
        b.usage.prompt_cache_hit_tokens = 3;
      },
    ],
    [
      'inconsistent cache total',
      (b) => {
        b.usage.prompt_cache_hit_tokens = 3;
        b.usage.prompt_cache_miss_tokens = 8;
      },
    ],
    [
      'output exceeds reserve',
      (b) => {
        b.usage.completion_tokens = 17;
        b.usage.total_tokens = 27;
      },
    ],
    [
      'input exceeds reserve',
      (b) => {
        b.usage.prompt_tokens =
          candidateReservation(endpoint, request(), profile).input + 1;
        b.usage.total_tokens =
          b.usage.prompt_tokens + b.usage.completion_tokens;
      },
    ],
    [
      'unfinished response',
      (b) => {
        b.choices[0].finish_reason = 'length';
      },
    ],
    [
      'missing response',
      (b) => {
        b.choices = [];
      },
    ],
    [
      'blank response',
      (b) => {
        b.choices[0].message.content = '  ';
      },
    ],
    ['provider refusal', () => {}, 429],
  ]) {
    test(`${profile}: ${label} stops before any consumer and refuses all later dispatch`, async () => {
      const f = fixture(profile);
      const body = envelope();
      mutate(body);
      let consumed = false;
      await assert.rejects(
        f.exchange(body, {
          status,
          consume() {
            consumed = true;
          },
        }),
        /core_broker_usage_unknown/,
      );
      assert.equal(consumed, false);
      assert.equal(f.observations.delivered.length, 0);
      assert.equal(f.observations.stopped, 1);
      await assert.rejects(f.exchange(envelope()), /core_broker_usage_unknown/);
      assert.equal(f.observations.fetches, 1);
      assert.equal(f.observations.stopped, 1);
    });
  }
}

test('malformed JSON and a throwing stop callback retain the latch without disclosing the error', async () => {
  const f = fixture(CORE_DIAGNOSTIC_PROFILE, () => {
    throw new Error('synthetic-private-path-not-for-reporting');
  });
  await assert.rejects(f.exchange('not JSON'), {
    message: 'core_broker_usage_unknown',
  });
  await assert.rejects(f.exchange(envelope()), {
    message: 'core_broker_usage_unknown',
  });
  assert.deepEqual(f.observations, { fetches: 1, delivered: [], stopped: 1 });
});

test('missing or consumed reservation refuses; no response can reuse old accounting', async () => {
  const unbound = fixture(CORE_DIAGNOSTIC_PROFILE);
  assert.throws(
    () => unbound.fence.response(200, JSON.stringify(envelope())),
    /core_broker_usage_unknown/,
  );
  assert.equal(unbound.observations.stopped, 1);
  const used = fixture(CORE_DIAGNOSTIC_PROFILE);
  await used.exchange(envelope());
  assert.throws(
    () => used.fence.response(200, JSON.stringify(envelope())),
    /core_broker_usage_unknown/,
  );
  await assert.rejects(used.exchange(envelope()), /core_broker_usage_unknown/);
  assert.equal(used.observations.fetches, 1);
});

test('a second pending reservation cannot overwrite the first attempt witness', () => {
  const f = fixture(CORE_DIAGNOSTIC_PROFILE);
  f.fence.reserve(endpoint, request());
  assert.throws(
    () => f.fence.reserve(endpoint, request(8)),
    /core_broker_usage_unknown/,
  );
  assert.throws(
    () => f.fence.response(200, JSON.stringify(envelope())),
    /core_broker_usage_unknown/,
  );
  assert.equal(f.observations.stopped, 1);
});

test('reservation witnesses immutable bytes, not a later changed RequestInit object', () => {
  const f = fixture(CORE_DIAGNOSTIC_PROFILE),
    init = request(1);
  f.fence.reserve(endpoint, init);
  init.body = request(16).body;
  assert.throws(
    () => f.fence.response(200, JSON.stringify(envelope())),
    /core_broker_usage_unknown/,
  );
  assert.equal(f.observations.stopped, 1);
});
