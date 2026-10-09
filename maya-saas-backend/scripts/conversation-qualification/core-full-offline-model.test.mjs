// Mechanical scripted transport checks only; no app, DB, model or network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import {
  createCoreFullOfflineModel,
  CORE_FULL_OFFLINE_QUALIFICATION,
} from './core-full-offline-model.mjs';

const { cases } = JSON.parse(
  fs.readFileSync(
    new URL(
      '../../datasets/conversation-intelligence/core-offline-48-20261009.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const tools = [
  'booking.availability.read',
  'appointments.own.create',
  'appointments.own.list',
  'catalog.staff.read',
  'catalog.services.read',
  'analytics.business.query',
  'staff.schedule.read',
  'inventory.goods.read',
  'inventory.stock.read',
  'reviews.list.read',
  'support.integration-status.read',
];
const role = {
  client: 'client',
  owner: 'tenant_owner',
  admin: 'administrator',
};
const item = (id) => {
  const row = cases.find((c) => c.id === id);
  assert.ok(row);
  return row;
};
function body(id, turn, patch = {}, final = false) {
  const c = item(id);
  return JSON.stringify({
    model: 'deepseek-v4-pro',
    max_tokens: 2048,
    stream: false,
    thinking: { type: 'disabled' },
    ...(final ? {} : { response_format: { type: 'json_object' } }),
    messages: [
      { role: 'system', content: 'SYNTHETIC_MECHANICAL_CONTRACT_ONLY' },
      {
        role: 'user',
        content: JSON.stringify({
          phase: final ? 'final_response' : 'tool_planning',
          surface: 'web',
          principal_role: role[c.role],
          now_utc: '2026-10-09T21:30:00.000Z',
          business_timezone: 'Europe/Moscow',
          conversation: c.userTurns
            .slice(0, turn)
            .map((content) => ({ role: 'user', content })),
          semantic_plan: null,
          tool_results: [],
          available_tools: {
            columns: ['name'],
            rows: tools.map((name) => [name]),
          },
          ...patch,
        }),
      },
    ],
  });
}
const model = () => createCoreFullOfflineModel({ cases });
const output = (response) => JSON.parse(response.choices[0].message.content);
const call = (m, id, turn, patch = {}, final = false) =>
  m.respond(body(id, turn, patch, final), { caseId: id, turn });
const denied = (fn) =>
  assert.throws(fn, /^Error: core_full_offline_model_refused$/);

test('exact 48/81 corpus pin is mandatory; no mutated text, subset, ordering or gold additions', () => {
  assert.equal(cases.length, 48);
  assert.equal(
    cases.reduce((n, c) => n + c.userTurns.length, 0),
    81,
  );
  for (const changed of [
    cases.slice(0, 47),
    [...cases].reverse(),
    cases.map((c, i) => (i ? c : { ...c, userTurns: ['OTHER'] })),
    cases.map((c, i) => (i ? c : { ...c, assistantReply: 'GOLD' })),
  ])
    denied(() => createCoreFullOfflineModel({ cases: changed }));
});

test('47 model-eligible cases/80 turns each have a finite authored plan; revoked case has zero model eligibility', () => {
  const m = model();
  let turns = 0,
    reads = 0,
    clarifications = 0;
  for (const c of cases) {
    if (c.id === 'current-lifecycle-negative') continue;
    for (let turn = 1; turn <= c.userTurns.length; turn++) {
      const response = call(m, c.id, turn),
        plan = output(response);
      assert.ok(
        plan.semantic_plan.tasks.length >= 1 &&
          plan.semantic_plan.tasks.length <= 3,
      );
      assert.equal(plan.semantic_plan.parent_request, c.userTurns[turn - 1]);
      assert.ok(
        plan.semantic_plan.tasks.every(
          (t) => typeof t.entities_json === 'string',
        ),
      );
      assert.equal(
        response.maya_full_offline.qualification,
        CORE_FULL_OFFLINE_QUALIFICATION,
      );
      assert.equal(response.maya_full_offline.corpusGoldUsed, false);
      assert.equal(response.maya_full_offline.actualProviderCalls, 0);
      assert.deepEqual(response.usage, {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      });
      if (plan.tool_call) reads++;
      if (plan.semantic_plan.tasks.some((t) => t.requires_clarification))
        clarifications++;
      turns++;
    }
  }
  assert.equal(turns, 80);
  assert.ok(
    reads >= 30,
    'supported cases must nominate real tools, not blanket clarify',
  );
  assert.ok(clarifications > 0 && clarifications < turns);
  assert.equal(m.observations.length, 80);
  denied(() => call(model(), 'current-lifecycle-negative', 1));
});

test('exact role/text/surface/date/turn guards refuse, latch, and never echo payloads', () => {
  const id = 'core-client-create-followup';
  for (const patch of [
    { principal_role: 'tenant_owner' },
    { surface: 'native' },
    { business_timezone: 'UTC' },
    { now_utc: 'invalid' },
    {
      conversation: [
        {
          role: 'user',
          content: 'Есть время к Максиму завтра на мужскую стрижку?',
        },
      ],
    },
    { conversation: [{ role: 'assistant', content: item(id).userTurns[0] }] },
    {
      conversation: [
        { role: 'user', content: item(id).userTurns[0] + ' PRIVATE_PAYLOAD' },
      ],
    },
  ]) {
    const m = model();
    denied(() => call(m, id, 1, patch));
    denied(() => call(m, id, 1));
    assert.deepEqual(m.observations, []);
  }
  denied(() => model().respond(body(id, 1), { caseId: 'unknown', turn: 1 }));
  denied(() =>
    model().respond(body(id, 1), { caseId: id, turn: 1, role: 'client' }),
  );
});

test('aliases bind only exact frozen name slots and relative date uses current Moscow clock', () => {
  const m = model(),
    id = 'core-client-create-followup';
  const alias = '[name removed]@' + 'a'.repeat(32) + '_1';
  const conversation = item(id).userTurns.map((content) => ({
    role: 'user',
    content: content.replace('Артёму', alias),
  }));
  const first = output(
    call(m, id, 1, { conversation: conversation.slice(0, 1) }),
  );
  const a = JSON.parse(first.tool_call.arguments_json);
  assert.equal(a.staff_id, alias);
  assert.equal(a.date, '2026-10-11T00:00:00+03:00');
  const second = output(call(m, id, 2, { conversation }));
  assert.equal(second.tool_call.name, 'appointments.own.create');
  assert.equal(
    JSON.parse(second.tool_call.arguments_json).start,
    '2026-10-11T17:00:00+03:00',
  );
  assert.equal(
    JSON.parse(second.semantic_plan.tasks[0].entities_json).employee,
    alias,
  );
  assert.doesNotMatch(JSON.stringify(m.observations), /name removed|Артём/);
  const changed = output(call(model(), 'followup-client-entity-correction', 2));
  assert.equal(
    JSON.parse(changed.semantic_plan.tasks[0].entities_json).employee,
    'Максиму',
  );
  assert.equal(
    JSON.parse(changed.semantic_plan.tasks[0].entities_json).time,
    '19:30',
  );
});

test('restored branch references stay opaque at exact frozen positions on topic switches', () => {
  const id = 'followup-owner-topic-switch';
  const reference = '[reference removed]@' + 'b'.repeat(32) + '_2';
  const name = '[name removed]@' + 'b'.repeat(32) + '_1';
  const conversation = item(id).userTurns.map((content) => ({
    role: 'user',
    content: content
      .replace('основной филиал', reference)
      .replace('Артём', name),
  }));
  const m = model();
  const schedule = output(
    call(m, id, 2, { conversation: conversation.slice(0, 2) }),
  );
  assert.equal(schedule.tool_call.name, 'staff.schedule.read');
  assert.equal(JSON.parse(schedule.tool_call.arguments_json).staff_id, name);
  const returned = output(call(m, id, 3, { conversation }));
  assert.equal(
    JSON.parse(returned.semantic_plan.tasks[0].entities_json).branch,
    reference,
  );
  for (const substitute of [name, 'другой филиал', reference + ' extra']) {
    const changed = structuredClone(conversation);
    changed[0].content = changed[0].content.replace(reference, substitute);
    denied(() => call(model(), id, 2, { conversation: changed.slice(0, 2) }));
  }
  const changed = structuredClone(conversation);
  changed[1].content = changed[1].content.replace(name, reference);
  denied(() => call(model(), id, 2, { conversation: changed.slice(0, 2) }));
});

test('a completed tool is not dispatched again and missing current tool is an explicit limitation', () => {
  const id = 'current-personal-ordinary',
    m = model();
  assert.equal(output(call(m, id, 1)).tool_call.name, 'appointments.own.list');
  assert.equal(
    output(
      call(m, id, 1, {
        tool_results: [
          { name: 'appointments.own.list', result: { appointments: [] } },
        ],
      }),
    ).tool_call,
    null,
  );
  const unavailable = call(model(), id, 1, { available_tools: [] });
  assert.equal(output(unavailable).tool_call, null);
  assert.equal(
    output(unavailable).semantic_plan.tasks[0].requires_clarification,
    true,
  );
  assert.equal(
    unavailable.maya_full_offline.limitation,
    'CURRENT_TOOL_NOT_AVAILABLE',
  );
});

test('compound carries requested today and only explicit acceptance selects empty bounded entities', () => {
  const id = 'core-owner-compound-clarification',
    m = model();
  const first = output(call(m, id, 1)),
    second = output(call(m, id, 2));
  assert.equal(
    JSON.parse(first.semantic_plan.tasks[0].entities_json).period,
    'today',
  );
  assert.equal(second.semantic_plan.dialogue_act, 'accept_bounded_review');
  assert.ok(second.semantic_plan.tasks.every((t) => t.entities_json === '{}'));
  assert.equal(second.tool_call, null);
});

test('price READ preserves unreachable-preview finding; year/retention/profit requests never become October facts', () => {
  const price = call(model(), 'current-staff_config-correction', 2);
  assert.equal(output(price).tool_call.name, 'catalog.services.read');
  assert.equal(price.maya_full_offline.coverage, 'ROUTE_UNREACHABLE_READ_ONLY');
  assert.equal(
    price.maya_full_offline.limitation,
    'PRICE_UPDATE_SEMANTIC_ROUTE_UNREACHABLE',
  );
  const response = call(
    model(),
    'current-staff_config-correction',
    2,
    {
      tool_results: [
        { name: 'catalog.services.read', result: { services: [] } },
      ],
    },
    true,
  );
  assert.match(
    response.choices[0].message.content,
    /Изменение цены здесь не подготовлено/,
  );
  for (const id of [
    'mt-finance_follow_up-7',
    'mt-finance_follow_up-10',
    'mt-retention_drill_down-0',
    'utt-finance.profit-055',
  ]) {
    const r = call(model(), id, 1),
      plan = output(r);
    assert.equal(plan.tool_call, null);
    assert.equal(plan.semantic_plan.tasks[0].requires_clarification, true);
    assert.doesNotMatch(plan.semantic_plan.tasks[0].entities_json, /2026-10/);
  }
});

test('inventory/reviews read existing owners and distinguish NOT_CONFIGURED from empty verified requested scope', () => {
  for (const [id, tool, limit] of [
    ['utt-inventory.stock-074', 'inventory.stock.read', /не даёт списка/],
    [
      'utt-reviews.list_recent-062',
      'reviews.list.read',
      /не подтверждает отсутствие/,
    ],
  ]) {
    const m = model(),
      initial = call(m, id, 1);
    assert.equal(output(initial).tool_call.name, tool);
    const unavailable = output(
      call(m, id, 1, {
        tool_results: [
          {
            name: tool,
            result: { configured: false, source: 'not_configured' },
          },
        ],
      }),
    );
    assert.equal(unavailable.tool_call, null);
    assert.equal(
      unavailable.semantic_plan.tasks[0].requires_clarification,
      true,
    );
    assert.match(
      unavailable.semantic_plan.tasks[0].clarification_question,
      limit,
    );
    for (const fixture of [
      { configured: true, source: 'not_configured' },
      { configured: false, source: 'unknown' },
      {},
    ]) {
      const other = output(
        call(model(), id, 1, {
          tool_results: [{ name: tool, result: fixture }],
        }),
      );
      assert.equal(other.semantic_plan.tasks[0].requires_clarification, false);
    }
    const result = call(
      m,
      id,
      1,
      {
        tool_results: [
          {
            name: tool,
            result: {
              configured: false,
              source: 'not_configured',
              items: [],
              reviews: [],
              private: 'SECRET_SENTINEL',
            },
          },
        ],
      },
      true,
    );
    assert.match(result.choices[0].message.content, limit);
    assert.doesNotMatch(JSON.stringify(result), /SECRET_SENTINEL/);
    assert.equal(result.maya_full_offline.emittedTool, null);
    assert.deepEqual(result.maya_full_offline.observedToolNames, [tool]);
  }
});

test('bounded repeated phases, backward context, oversize request and attempted mutation of evidence refuse safely', () => {
  const id = 'current-personal-ordinary',
    m = model();
  for (let n = 0; n < 4; n++) call(m, id, 1);
  denied(() => call(m, id, 1));
  const obs = m.observations;
  obs[0].caseId = 'OTHER';
  assert.equal(m.observations[0].caseId, id);
  const backwards = model();
  call(backwards, 'current-personal-correction', 2);
  denied(() => call(backwards, 'current-personal-correction', 1));
  denied(() => call(model(), id, 1, { oversized: 'x'.repeat(98_304) }));
});
