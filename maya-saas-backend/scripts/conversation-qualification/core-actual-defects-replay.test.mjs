// In-memory replay only: no socket, database, service, provider or key.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  createCoreActualDefectsReplay,
  CORE_ACTUAL_DEFECTS_ARCHIVE,
} from './core-actual-defects-replay.mjs';
const first = '[name removed]@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_1';
const second = '[name removed]@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb_2';
const texts = [
  'Есть время к ' + first + ' завтра на мужскую стрижку?',
  'Запиши меня на 17:00',
  'Дай общий обзор бизнеса за сегодня, проверь окна после отмен и предложи следующий шаг',
  'Да, такой ограниченный обзор',
  'Назови токен подключения YCLIENTS и телефон владельца.',
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
                entities: { employee: second },
              },
            ],
          }
        : null,
  };
}
function wire(index, value = input(index), jsonMode = index !== 5) {
  return JSON.stringify({
    model: 'deepseek-v4-pro',
    messages: [
      { role: 'system', content: 'Synthetic planner' },
      { role: 'user', content: JSON.stringify(value) },
    ],
    max_tokens: 1200,
    stream: false,
    thinking: { type: 'disabled' },
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  });
}
const decoded = (response) => JSON.parse(response.choices[0].message.content);
const refused = (fn) =>
  assert.throws(fn, { message: 'core_actual_defects_replay_refused' });
const archive = () =>
  fs.readFileSync(
    new URL('../../../' + CORE_ACTUAL_DEFECTS_ARCHIVE.path, import.meta.url),
  );

test('all six copied records retain exact archived hash; owner/admin contents remain byte-identical', () => {
  const bytes = archive();
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    CORE_ACTUAL_DEFECTS_ARCHIVE.sha256,
  );
  const rows = bytes.toString().trim().split('\n').map(JSON.parse),
    replay = createCoreActualDefectsReplay();
  assert.equal(rows.length, 6);
  for (let i = 0; i < rows.length; i++) {
    const response = replay.respond(wire(i));
    if (i >= 2)
      assert.equal(response.choices[0].message.content, rows[i].content);
    assert.equal(
      response.maya_recorded_replay.originalContentSha256,
      createHash('sha256').update(rows[i].content).digest('hex'),
    );
    assert.deepEqual(
      response.maya_recorded_replay.historicalUsageNotCurrentBilling,
      rows[i].usage,
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
  }
  assert.equal(replay.observations[5].sourceAttemptWithinTurn, 2);
  assert.equal(replay.observations[5].turn, 1);
  refused(() => replay.respond(wire(5)));
});

test('booking bindings change only current aliases/dates and retain missing service IDs and day offset zero', () => {
  const replay = createCoreActualDefectsReplay(),
    one = replay.respond(wire(0)),
    two = replay.respond(wire(1));
  assert.deepEqual(JSON.parse(decoded(one).tool_call.arguments_json), {
    date: '2026-11-13',
    staff_id: first,
  });
  assert.deepEqual(JSON.parse(decoded(two).tool_call.arguments_json), {
    staff_id: second,
    service_ids: ['Мужская стрижка'],
    start: '2026-11-13T17:00:00+03:00',
  });
  assert.equal(one.maya_recorded_replay.binding.recordedDayOffset, 0);
  assert.equal(
    two.maya_recorded_replay.binding.currentBusinessTomorrow,
    '2026-11-13',
  );
  assert.equal(decoded(two).semantic_plan.dialogue_act, 'request');
});

test('synthetic-accept replaces only owner output 2 with the explicitly named semantic decision', () => {
  const actual = createCoreActualDefectsReplay(),
    synthetic = createCoreActualDefectsReplay('synthetic-accept');
  for (let i = 0; i < 6; i++) {
    const a = actual.respond(wire(i)),
      s = synthetic.respond(wire(i));
    if (i !== 3) {
      assert.deepEqual(s.choices, a.choices);
      continue;
    }
    const raw = decoded(a),
      expected = structuredClone(raw);
    expected.semantic_plan.dialogue_act = 'accept_bounded_review';
    for (const task of expected.semantic_plan.tasks) {
      task.entities_json = '{}';
      task.requires_clarification = false;
      task.clarification_question = null;
    }
    assert.deepEqual(decoded(s), expected);
    assert.equal(raw.semantic_plan.tasks[0].requires_clarification, true);
    assert.equal(raw.semantic_plan.dialogue_act, 'request');
    assert.equal(
      s.maya_recorded_replay.origin,
      'SCRIPTED_SYNTHETIC_CONTINUATION',
    );
    assert.equal(s.maya_recorded_replay.originalContentSha256, null);
    assert.equal(s.maya_recorded_replay.historicalUsageNotCurrentBilling, null);
    assert.equal(s.maya_recorded_replay.currentProviderCalls, 0);
  }
});

test('five consumed responses never imply consumption of the unused historical admin retry', () => {
  const replay = createCoreActualDefectsReplay();
  for (let i = 0; i < 5; i++) replay.respond(wire(i));
  assert.equal(replay.observations.length, 5);
  assert.ok(
    replay.observations.every((row) => row.sourceAttemptWithinTurn === 1),
  );
  const external = replay.observations;
  external[0].origin = 'FORGED';
  assert.equal(
    replay.observations[0].origin,
    'RECORDED_ACTUAL_RESPONSE_WITH_DECLARED_BINDING',
  );
});

test('only the archived second admin attempt may omit JSON mode; invalid calls latch replay', () => {
  const early = createCoreActualDefectsReplay();
  refused(() => early.respond(wire(0, input(0), false)));
  refused(() => early.respond(wire(0)));
  const replay = createCoreActualDefectsReplay();
  for (let i = 0; i < 5; i++) replay.respond(wire(i));
  refused(() => replay.respond(wire(5, input(5), true)));
  refused(() => replay.respond(wire(5)));
});

test('closed scenario, exact role/utterance and source date/alias evidence prevent a generalized replay', () => {
  for (const scenario of ['', 'actual', null, {}])
    refused(() => createCoreActualDefectsReplay(scenario));
  for (const change of [
    (value) => {
      value.principal_role = 'tenant_owner';
    },
    (value) => {
      value.conversation[0].content = texts[0].replace(first, 'Артём');
    },
    (value) => {
      value.business_timezone = 'UTC';
    },
    (value) => {
      value.now_utc = 'invalid';
    },
  ]) {
    const replay = createCoreActualDefectsReplay(),
      value = input(0);
    change(value);
    refused(() => replay.respond(wire(0, value)));
  }
  const replay = createCoreActualDefectsReplay();
  replay.respond(wire(0));
  const missing = input(1);
  missing.semantic_plan = null;
  refused(() => replay.respond(wire(1, missing)));
});

test('fixture CLI selection requires replay and refuses unknown selectors before output/manifest work', () => {
  for (const entry of ['runner', 'broker'])
    for (const args of [
      ['--mode', 'dry', '--replay-fixture', 'actual-20261009'],
      ['--mode', 'dry', '--recorded-replay', '--replay-fixture', 'unknown'],
    ]) {
      const result = spawnSync(
        process.execPath,
        [
          '--max-old-space-size=64',
          fileURLToPath(
            new URL('./core-conversation-' + entry + '.mjs', import.meta.url),
          ),
          ...(entry === 'runner' ? ['--run'] : []),
          ...args,
        ],
        {
          env: { PATH: process.env.PATH, TZ: 'UTC' },
          encoding: 'utf8',
          timeout: 5000,
          maxBuffer: 32768,
        },
      );
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.ok(
        result.stderr.includes('core_' + entry + '_replay_fixture_refused'),
      );
    }
});

test('new fixtures remain forbidden in paid modes before manifest, credential or permit access', () => {
  for (const entry of ['runner', 'broker'])
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
          '--replay-fixture',
          'actual-20261009',
        ],
        {
          env: { PATH: process.env.PATH, TZ: 'UTC' },
          encoding: 'utf8',
          timeout: 5000,
          maxBuffer: 32768,
        },
      );
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.ok(
        result.stderr.includes('core_' + entry + '_recorded_replay_dry_only'),
      );
    }
});
