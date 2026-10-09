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
  'analytics.business.profit',
  'company.business-hours.read',
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
  assert.equal(schedule.tool_call.name, 'catalog.staff.read');
  assert.equal(
    JSON.parse(schedule.semantic_plan.tasks[1].entities_json).employee,
    name,
  );
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
  const retention = output(call(model(), 'mt-retention_drill_down-0', 1));
  assert.equal(retention.tool_call, null);
  assert.equal(retention.semantic_plan.tasks[0].requires_clarification, true);
  for (const [id, tool, period] of [
    ['mt-finance_follow_up-7', 'analytics.business.query', 'year_to_date'],
    ['mt-finance_follow_up-10', 'analytics.business.query', 'week_to_date'],
    ['utt-finance.profit-055', 'analytics.business.profit', 'month_to_date'],
  ]) {
    const plan = output(call(model(), id, 1));
    assert.equal(plan.tool_call.name, tool);
    assert.equal(plan.semantic_plan.tasks[0].requires_clarification, false);
    assert.equal(JSON.parse(plan.tool_call.arguments_json).period, period);
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

test('schedule resolves current catalog name to reference, never a name token or first unrelated staff', () => {
  for (const id of [
    'followup-owner-topic-switch',
    'mt-topic_switch_and_return-17',
  ]) {
    const name = '[name removed]@' + 'c'.repeat(32) + '_1';
    const reference = '[reference removed]@' + 'c'.repeat(32) + '_2';
    const conversation = item(id)
      .userTurns.slice(0, 2)
      .map((content) => ({
        role: 'user',
        content: content.replace(/Артём|Елена/g, name),
      }));
    const m = model();
    const first = output(call(m, id, 2, { conversation }));
    assert.equal(first.tool_call.name, 'catalog.staff.read');
    assert.deepEqual(
      first.semantic_plan.tasks.map((t) => t.intent),
      ['employees.list_public', 'schedule.get_team'],
    );
    const staff = [
      { name: 'unrelated', id: '71' },
      { name, id: reference },
    ];
    const next = output(
      call(m, id, 2, {
        conversation,
        tool_results: [{ name: 'catalog.staff.read', result: { staff } }],
      }),
    );
    assert.equal(next.tool_call.name, 'staff.schedule.read');
    assert.deepEqual(JSON.parse(next.tool_call.arguments_json), {
      date: '2026-10-11',
      staff_id: reference,
    });
    for (const rejected of [
      [],
      [...staff, { name, id: '72' }],
      [{ name, id: name }],
      [{ name, id: '71\n' }],
    ]) {
      const refusal = output(
        call(model(), id, 2, {
          conversation,
          tool_results: [
            { name: 'catalog.staff.read', result: { staff: rejected } },
          ],
        }),
      );
      assert.equal(refusal.tool_call, null);
      assert.ok(
        refusal.semantic_plan.tasks.find(
          (t) => t.intent === 'schedule.get_team',
        ).requires_clarification,
      );
    }
  }
});

test('finance preserves requested comparison but finishes honestly after one owner read, as current CI does', () => {
  for (const [id, current, previous, requested] of [
    [
      'mt-finance_follow_up-7',
      'year_to_date',
      'previous_year',
      /весь предыдущий год/,
    ],
    [
      'mt-finance_follow_up-10',
      'week_to_date',
      'last_week',
      /вся предыдущая неделя/,
    ],
  ]) {
    const m = model();
    const first = output(call(m, id, 3));
    assert.equal(
      first.semantic_plan.tasks[0].intent,
      'finance.compare_periods',
    );
    assert.deepEqual(JSON.parse(first.semantic_plan.tasks[0].entities_json), {
      period: current,
      comparison_period: previous,
      metric: 'revenue',
    });
    assert.deepEqual(JSON.parse(first.tool_call.arguments_json), {
      period: current,
      comparison: 'none',
    });
    const one = [
      {
        name: 'analytics.business.query',
        result: { resolved_period: { kind: current } },
      },
    ];
    // CI's existing completion-by-tool-name goes straight to final_response.
    // Do not fabricate a second planning phase or claim a second owner read.
    const final = call(m, id, 3, { tool_results: one }, true).choices[0].message
      .content;
    assert.match(final, /сравнение.*не подтверждено/i);
    assert.match(final, requested);
    assert.doesNotMatch(final, /выручка выросла|выручка снизилась|на 0/);
    assert.equal(m.observations.length, 2);
    assert.equal(
      m.observations.filter(
        (row) => row.emittedTool === 'analytics.business.query',
      ).length,
      1,
    );
    assert.equal(
      m.observations.at(-1).limitation,
      'REQUESTED_FINANCIAL_PAIR_NOT_AVAILABLE',
    );
  }
});

test('address and closing time retain both tasks and read actual company hours after catalog', () => {
  const id = 'current-admin-ordinary',
    m = model();
  const first = output(call(m, id, 1));
  assert.deepEqual(
    first.semantic_plan.tasks.map((t) => t.intent),
    ['company.public_info', 'company.business_hours'],
  );
  const next = output(
    call(m, id, 1, {
      tool_results: [
        {
          name: 'catalog.staff.read',
          result: { salon: { address: 'source-address' } },
        },
      ],
    }),
  );
  assert.equal(next.tool_call.name, 'company.business-hours.read');
  assert.deepEqual(JSON.parse(next.tool_call.arguments_json), {});
});

test('service finals use actual catalog values and qualify absent employee mapping; no exact price from ranges/null', () => {
  for (const id of [
    'current-admin-correction',
    'utt-services.price-062',
    'utt-services.price-067',
  ]) {
    const turn = id === 'current-admin-correction' ? 2 : 1;
    const result = {
      contract: 'maya.service-catalog.read/1',
      source: 'test',
      scope: 'active_services',
      catalog_exhaustive: false,
      services: [
        {
          name: 'Мужская стрижка',
          price: 1734,
          price_min: 1734,
          price_max: 1734,
          currency: 'RUB',
        },
      ],
      private: 'SECRET_SENTINEL',
    };
    const reply = call(
      model(),
      id,
      turn,
      { tool_results: [{ name: 'catalog.services.read', result }] },
      true,
    ).choices[0].message.content;
    assert.match(reply, /Мужская стрижка/);
    assert.match(reply, /1734 RUB/);
    assert.match(reply, /общ.*каталог/i);
    assert.match(reply, /сотрудник.*не подтвержден/i);
    assert.doesNotMatch(reply, /SECRET_SENTINEL|2000|1500/);
    result.services[0] = {
      name: 'Мужская стрижка',
      price: null,
      price_min: 900,
      price_max: 1700,
      currency: 'RUB',
    };
    const range = call(
      model(),
      id,
      turn,
      { tool_results: [{ name: 'catalog.services.read', result }] },
      true,
    ).choices[0].message.content;
    assert.match(range, /900.*1700 RUB/);
    assert.match(range, /точная цена.*не подтверждена/i);
  }
});

const measurement = () => ({
  contract: 'c7.measurement.read/1',
  qualification: 'VERIFIED',
  completeness: 'PARTIAL',
  period: {
    from: '2026-09-30T21:00:00.000Z',
    toExclusive: '2026-10-09T11:28:41.356Z',
    timezone: 'Europe/Moscow',
  },
  metrics: [
    {
      key: 'observed_booked_value',
      unit: 'money_minor',
      basis: 'booked_prices',
      state: 'PARTIAL',
      value: '23456',
      currency: 'RUB',
    },
    {
      key: 'confirmed_cash',
      unit: 'money_minor',
      basis: 'confirmed_cash',
      state: 'NOT_MEASURED',
      value: null,
      currency: 'RUB',
    },
  ],
  private: 'SECRET_SENTINEL',
});

test('BI final keeps exact half-open source period, timezone, partial basis and units without calling booked value revenue', () => {
  const result = {
    measurement: measurement(),
    current: { revenue: [{ amount_major_units: 999999 }] },
  };
  const reply = call(
    model(),
    'current-bi-ordinary',
    1,
    { tool_results: [{ name: 'analytics.business.query', result }] },
    true,
  ).choices[0].message.content;
  for (const value of [
    '2026-09-30T21:00:00.000Z',
    '2026-10-09T11:28:41.356Z',
    'Europe/Moscow',
    'PARTIAL',
    '23456',
    'RUB',
    'booked_prices',
    'money_minor',
  ])
    assert.ok(reply.includes(value), value);
  assert.match(reply, /касс.*не измерен/i);
  assert.match(reply, /23456 минимальных денежных единиц валюты RUB/);
  assert.doesNotMatch(reply, /23456 RUB|234\.56/);
  assert.doesNotMatch(
    reply,
    /SECRET_SENTINEL|999999|выручка: 23456|за весь октябрь/i,
  );
});

test('profit reads current owner before explaining returned missing basis; no canned source outage or invented zero', () => {
  const id = 'utt-finance.profit-055',
    m = model();
  const first = output(call(m, id, 1));
  assert.equal(first.tool_call.name, 'analytics.business.profit');
  assert.deepEqual(JSON.parse(first.tool_call.arguments_json), {
    period: 'month_to_date',
  });
  const result = {
    measurement: measurement(),
    net_profit: {
      status: 'unavailable',
      amount: null,
      unavailable_reason:
        'confirmed_cash_refunds_and_complete_cost_basis_required',
    },
  };
  const reply = call(
    m,
    id,
    1,
    { tool_results: [{ name: 'analytics.business.profit', result }] },
    true,
  ).choices[0].message.content;
  assert.match(reply, /прибыль.*не подтверждена/i);
  assert.match(reply, /касс.*возврат.*расход/i);
  assert.match(reply, /23456/);
  assert.doesNotMatch(reply, /прибыль: 0|SECRET_SENTINEL/);
  const missing = call(
    model(),
    id,
    1,
    { tool_results: [{ name: 'analytics.business.profit', result: {} }] },
    true,
  ).choices[0].message.content;
  assert.doesNotMatch(missing, /касс.*возврат.*расход/i);
});

test('source projections refuse stale or malformed facts and never expose arbitrary extra payloads', () => {
  for (const [id, name, result] of [
    [
      'current-bi-ordinary',
      'analytics.business.query',
      { measurement: measurement() },
    ],
    [
      'utt-finance.profit-055',
      'analytics.business.profit',
      {
        measurement: measurement(),
        net_profit: {
          status: 'unavailable',
          amount: null,
          unavailable_reason:
            'confirmed_cash_refunds_and_complete_cost_basis_required',
        },
      },
    ],
    [
      'utt-services.price-062',
      'catalog.services.read',
      {
        contract: 'maya.service-catalog.read/1',
        services: [{ name: 'Мужская стрижка', price: 1734, currency: 'RUB' }],
      },
    ],
  ]) {
    const reply = call(
      model(),
      id,
      1,
      { tool_results: [{ name, stale: true, result }] },
      true,
    ).choices[0].message.content;
    assert.match(reply, /Подтверждённого результата чтения пока нет/);
    assert.doesNotMatch(reply, /23456|1734|касс.*возврат.*расход/i);
  }
  const broken = measurement();
  broken.period.toExclusive = broken.period.from;
  const missing = call(
    model(),
    'current-bi-ordinary',
    1,
    {
      tool_results: [
        { name: 'analytics.business.query', result: { measurement: broken } },
      ],
    },
    true,
  ).choices[0].message.content;
  assert.match(missing, /не подтверждено/);
  assert.doesNotMatch(missing, /23456/);
  const currency = call(
    model(),
    'utt-services.price-062',
    1,
    {
      tool_results: [
        {
          name: 'catalog.services.read',
          result: {
            contract: 'maya.service-catalog.read/1',
            services: [
              { name: 'Мужская стрижка', price: 1734, currency: null },
            ],
          },
        },
      ],
    },
    true,
  ).choices[0].message.content;
  assert.match(currency, /валюта не подтверждена/);
  assert.doesNotMatch(currency, /1734|RUB/);
});

test('comparison reports the actual hardened window without relabelling it as the requested pair', () => {
  const id = 'mt-finance_follow_up-7';
  const current = measurement();
  current.period.from = '2025-12-31T21:00:00.000Z';
  const rows = [
    {
      name: 'analytics.business.query',
      result: {
        resolved_period: { kind: 'year_to_date' },
        measurement: current,
      },
    },
  ];
  const reply = call(model(), id, 3, { tool_results: rows }, true).choices[0]
    .message.content;
  assert.match(reply, /23456/);
  assert.match(reply, /2025-12-31T21:00:00.000Z/);
  assert.match(reply, /сравнение именно запрошенных периодов не подтверждено/);
  assert.doesNotMatch(reply, /98765|75309|выросла|снизилась|два.*измерения/);
  rows[0].result.resolved_period.kind = 'named_month';
  rows[0].result.measurement = measurement();
  const qualified = call(model(), id, 3, { tool_results: rows }, true)
    .choices[0].message.content;
  assert.match(qualified, /2026-09-30T21:00:00.000Z/);
  assert.match(qualified, /23456/);
  assert.match(
    qualified,
    /сравнение именно запрошенных периодов не подтверждено/,
  );
  assert.doesNotMatch(qualified, /2025-12-31T21:00:00.000Z|за весь год/);
  const single = call(model(), id, 1, { tool_results: rows }, true).choices[0]
    .message.content;
  assert.match(single, /именно запрошенного периода не подтверждено/);
  assert.doesNotMatch(single, /23456/);
});

test('canonical money_minor rejects decimal and noncanonical integer strings without rounding', () => {
  for (const value of ['1.5', '001']) {
    const malformed = measurement();
    malformed.metrics[0].value = value;
    const reply = call(
      model(),
      'current-bi-ordinary',
      1,
      {
        tool_results: [
          {
            name: 'analytics.business.query',
            result: { measurement: malformed },
          },
        ],
      },
      true,
    ).choices[0].message.content;
    assert.doesNotMatch(reply, /Стоимость записанного:/);
    assert.doesNotMatch(reply, /минимальных денежных единиц валюты RUB/);
    assert.match(reply, /касс.*не измерен/i);
  }
});

test('invalid IANA timezone refuses the whole measurement without echoing the invalid value or amounts', () => {
  for (const timezone of ['Mars/Olympus', 'invalid-zone-SECRET_SENTINEL']) {
    const malformed = measurement();
    malformed.period.timezone = timezone;
    const reply = call(
      model(),
      'current-bi-ordinary',
      1,
      {
        tool_results: [
          {
            name: 'analytics.business.query',
            result: { measurement: malformed },
          },
        ],
      },
      true,
    ).choices[0].message.content;
    assert.equal(
      reply,
      'Измерение нужного периода не подтверждено источником.',
    );
    assert.doesNotMatch(reply, /23456|Mars|SECRET_SENTINEL/);
  }
});
