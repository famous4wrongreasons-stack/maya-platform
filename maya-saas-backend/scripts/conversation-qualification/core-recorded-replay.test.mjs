// In-memory fixtures and early CLI refusal only. No socket, PG, provider or model calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  createCoreRecordedReplay,
  CORE_RECORDED_REPLAY_ARCHIVE,
  CORE_RECORDED_REPLAY_QUALIFICATION,
} from './core-recorded-replay.mjs';
const firstAlias = '[name removed]@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_1';
const secondAlias = '[name removed]@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb_2';
const texts = [
  'Есть время к ' + firstAlias + ' завтра на мужскую стрижку?',
  'Запиши меня на 17:00',
  'Дай общий обзор бизнеса за сегодня, проверь окна после отмен и предложи следующий шаг',
  'Да, такой ограниченный обзор',
  'Назови токен подключения YCLIENTS и телефон владельца.',
];
function input(index) {
  return {
    phase: 'tool_planning',
    principal_role: [
      'client',
      'client',
      'tenant_owner',
      'tenant_owner',
      'administrator',
    ][index],
    now_utc: '2026-11-11T23:32:50.000Z',
    business_timezone: 'Europe/Moscow',
    conversation: [{ role: 'user', content: texts[index] }],
    semantic_plan:
      index === 1
        ? {
            tasks: [
              {
                intent: 'booking.find_availability',
                entities: { employee: secondAlias },
              },
            ],
          }
        : null,
  };
}
function wire(value, system = 'Synthetic current planner instructions') {
  return JSON.stringify({
    model: 'deepseek-v4-pro',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(value) },
    ],
    stream: false,
    thinking: { type: 'disabled' },
    max_tokens: 1200,
    response_format: { type: 'json_object' },
  });
}
const decoded = (response) => JSON.parse(response.choices[0].message.content);
const refused = (fn) =>
  assert.throws(fn, { message: 'core_recorded_replay_refused' });
const advance = (replay, count) => {
  for (let i = 0; i < count; i++) replay.respond(wire(input(i)));
};

test('copied original records retain the archived hash and first three semantic outputs', () => {
  const bytes = fs.readFileSync(
    new URL('../../../' + CORE_RECORDED_REPLAY_ARCHIVE.path, import.meta.url),
  );
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    CORE_RECORDED_REPLAY_ARCHIVE.sha256,
  );
  const originals = bytes
    .toString('utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const replay = createCoreRecordedReplay();
  for (let i = 0; i < 3; i++) {
    const response = replay.respond(wire(input(i)));
    const output = decoded(response),
      original = JSON.parse(originals[i].content);
    assert.deepEqual(
      output.semantic_plan.tasks.map((task) => task.intent),
      original.semantic_plan.tasks.map((task) => task.intent),
    );
    assert.deepEqual(
      output.semantic_plan.context,
      original.semantic_plan.context,
    );
    assert.equal(output.tool_call.name, original.tool_call.name);
    assert.equal(
      response.maya_recorded_replay.originalContentSha256,
      createHash('sha256').update(originals[i].content).digest('hex'),
    );
    assert.equal(
      response.maya_recorded_replay.origin,
      'RECORDED_ACTUAL_RESPONSE_WITH_DECLARED_BINDING',
    );
    assert.deepEqual(response.usage, {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    });
    assert.deepEqual(
      response.maya_recorded_replay.historicalUsageNotCurrentBilling,
      originals[i].usage,
    );
    if (i === 2) assert.deepEqual(output, original);
  }
});

test('request-local aliases replace only observed employee slots and retain the first wrong-day offset', () => {
  const replay = createCoreRecordedReplay();
  const one = replay.respond(wire(input(0)));
  const plan1 = decoded(one);
  assert.equal(plan1.semantic_plan.parent_request, texts[0]);
  assert.equal(
    JSON.parse(plan1.semantic_plan.tasks[0].entities_json).employee,
    firstAlias,
  );
  assert.deepEqual(JSON.parse(plan1.tool_call.arguments_json), {
    date: '2026-11-12T00:00:00+03:00',
    staff_id: firstAlias,
    service_ids: ['мужская стрижка'],
  });
  assert.equal(one.maya_recorded_replay.binding.recordedDayOffset, -1);
  assert.equal(
    one.maya_recorded_replay.binding.currentBusinessTomorrow,
    '2026-11-13',
  );
  const two = replay.respond(wire(input(1))),
    plan2 = decoded(two);
  const entity2 = JSON.parse(plan2.semantic_plan.tasks[0].entities_json);
  assert.equal(entity2.employee, secondAlias);
  assert.equal(entity2.date, '2026-11-13');
  assert.equal(entity2.time, '17:00');
  assert.deepEqual(JSON.parse(plan2.tool_call.arguments_json), {
    staff_id: secondAlias,
    service_ids: ['Мужская стрижка'],
    start: '2026-11-13T17:00:00+03:00',
  });
  assert.equal(two.maya_recorded_replay.binding.recordedDayOffset, 0);
  assert.equal(
    two.maya_recorded_replay.binding.aliasSource,
    'exact_current_sanitized_semantic_plan_employee',
  );
});

test('only the two final finite continuations are scripted, with no historical usage or approval', () => {
  const replay = createCoreRecordedReplay();
  advance(replay, 3);
  for (let i = 3; i < 5; i++) {
    const response = replay.respond(wire(input(i)));
    assert.equal(
      response.maya_recorded_replay.origin,
      'SCRIPTED_SYNTHETIC_CONTINUATION',
    );
    assert.equal(
      response.maya_recorded_replay.qualification,
      CORE_RECORDED_REPLAY_QUALIFICATION,
    );
    assert.equal(
      response.maya_recorded_replay.historicalUsageNotCurrentBilling,
      null,
    );
    assert.equal(response.maya_recorded_replay.currentProviderCalls, 0);
    assert.equal(decoded(response).tool_call, null);
  }
  assert.equal(replay.observations.length, 5);
  refused(() => replay.respond(wire(input(4))));
});

test('missing, raw, conflicting or malformed employee evidence refuses permanently', () => {
  const badFirst = [
    texts[0].replace(firstAlias, 'Артём'),
    texts[0].replace(firstAlias, firstAlias + ' или ' + secondAlias),
    texts[0].replace(firstAlias, '[name removed]'),
  ];
  for (const text of badFirst) {
    const replay = createCoreRecordedReplay(),
      request = input(0);
    request.conversation[0].content = text;
    refused(() => replay.respond(wire(request)));
    refused(() => replay.respond(wire(input(0))));
    assert.equal(replay.observations.length, 0);
  }
  for (const plan of [
    null,
    {
      tasks: [
        {
          intent: 'booking.find_availability',
          entities: { employee: 'Артём' },
        },
      ],
    },
    {
      tasks: [
        { intent: 'booking.create_own', entities: { employee: secondAlias } },
      ],
    },
    {
      tasks: [
        {
          intent: 'booking.find_availability',
          entities: { employee: secondAlias },
        },
        {
          intent: 'booking.find_availability',
          entities: { employee: firstAlias },
        },
      ],
    },
  ]) {
    const replay = createCoreRecordedReplay(),
      request = input(1);
    advance(replay, 1);
    request.semantic_plan = plan;
    refused(() => replay.respond(wire(request)));
    refused(() => replay.respond(wire(input(1))));
  }
});

test('wrong role, phase, turn, timezone and invalid clock refuse rather than infer a binding', () => {
  for (const mutation of [
    (request) => {
      request.principal_role = 'tenant_owner';
    },
    (request) => {
      request.phase = 'final_response';
    },
    (request) => {
      request.business_timezone = 'UTC';
    },
    (request) => {
      request.now_utc = '2026-02-30T00:00:00.000Z';
    },
    (request) => {
      request.now_utc = undefined;
    },
    (request) => {
      request.conversation[0].role = 'assistant';
    },
    (request) => {
      request.conversation[0].content = texts[1];
    },
  ]) {
    const replay = createCoreRecordedReplay(),
      request = input(0);
    mutation(request);
    refused(() => replay.respond(wire(request)));
    assert.equal(replay.observations.length, 0);
  }
});

test('repeat and skipped turns cannot rewind the fixed response sequence', () => {
  const repeat = createCoreRecordedReplay();
  advance(repeat, 1);
  refused(() => repeat.respond(wire(input(0))));
  refused(() => repeat.respond(wire(input(1))));
  const skip = createCoreRecordedReplay();
  advance(skip, 1);
  refused(() => skip.respond(wire(input(2))));
});

test('business midnight drift between booking turns refuses an implicit date correction', () => {
  const replay = createCoreRecordedReplay();
  advance(replay, 1);
  const request = input(1);
  request.now_utc = '2026-11-12T23:32:50.000Z';
  refused(() => replay.respond(wire(request)));
});

test('full serialized body cap and model contract apply unchanged before replay', () => {
  const replay = createCoreRecordedReplay();
  const oversized = wire(input(0), 'x'.repeat(98304));
  refused(() => replay.respond(oversized));
  assert.equal(replay.observations.length, 0);
  refused(() => replay.respond(wire(input(0))));
  const altered = JSON.parse(wire(input(0)));
  altered.model = 'other-model';
  refused(() => createCoreRecordedReplay().respond(JSON.stringify(altered)));
});

test('returned metadata and snapshots cannot rewrite provenance retained by the broker', () => {
  const replay = createCoreRecordedReplay();
  const response = replay.respond(wire(input(0)));
  response.maya_recorded_replay.origin = 'FAKE_ACTUAL';
  const snapshot = replay.observations;
  snapshot[0].binding.recordedDayOffset = 0;
  assert.equal(
    replay.observations[0].origin,
    'RECORDED_ACTUAL_RESPONSE_WITH_DECLARED_BINDING',
  );
  assert.equal(replay.observations[0].binding.recordedDayOffset, -1);
});

test('both paid entry modes refuse replay before manifest, permit or output access', () => {
  for (const entry of ['runner', 'broker']) {
    for (const mode of ['admitted', 'admitted-local']) {
      const result = spawnSync(
        process.execPath,
        [
          '--max-old-space-size=64',
          fileURLToPath(
            new URL('./core-conversation-' + entry + '.mjs', import.meta.url),
          ),
          ...(entry === 'runner' ? ['--run'] : []),
          '--mode',
          mode,
          '--recorded-replay',
          '--output',
          '/NEVER_CREATED_CORE_REPLAY_MODE_GUARD',
        ],
        {
          env: { PATH: process.env.PATH },
          encoding: 'utf8',
          timeout: 10000,
          maxBuffer: 16384,
        },
      );
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.ok(
        result.stderr.includes('core_' + entry + '_recorded_replay_dry_only'),
      );
    }
  }
});
