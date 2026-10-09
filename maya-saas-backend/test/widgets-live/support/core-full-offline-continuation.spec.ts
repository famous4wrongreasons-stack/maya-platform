/** Source-owner diagnosis only: actual privacy projection and catalog binding,
 * finite scripted transport, no HTTP/DB/model/network and no substituted history. */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { AiCoreService } from '../../../src/ai-tools/ai-core.service';
import { bindBookingCatalog } from '../../../src/ai-tools/booking-catalog-binding';

const nativeRequire = createRequire(__filename);
const { createCoreFullOfflineModel } = nativeRequire(
  path.resolve(
    'scripts/conversation-qualification/core-full-offline-model.mjs',
  ),
) as typeof import('../../../scripts/conversation-qualification/core-full-offline-model.mjs');
const dataset = JSON.parse(
  readFileSync(
    path.resolve(
      'datasets/conversation-intelligence/core-offline-48-20261009.json',
    ),
    'utf8',
  ),
) as { cases: Array<{ id: string; userTurns: string[] }> };
type Message = { role: 'user'; content: string };
type PrivacyOwner = {
  sanitizeMessages(messages: Message[]): {
    messages: Message[];
    project<T>(value: T): T;
    nameReferences: ReadonlyMap<string, string>;
  };
};
const privacy = Object.create(AiCoreService.prototype) as PrivacyOwner;
const staffSource = { staff: [{ id: 'fixture-staff', name: 'Артём' }] };
const serviceSource = {
  services: [{ id: 'fixture-service', name: 'Мужская стрижка' }],
};
const plan = {
  tasks: [
    {
      intent: 'booking.find_availability',
      entities: {
        employee: 'Артём',
        services: ['Мужская стрижка'],
        date_or_period: '2026-10-10',
      },
    },
  ],
};

test('current staff correction overrides a conflicting saved employee through the actual privacy and catalog owners', () => {
  const item = dataset.cases.find(
    (row) => row.id === 'followup-client-entity-correction',
  )!;
  const state = privacy.sanitizeMessages(
    item.userTurns.map((content) => ({ role: 'user', content })),
  );
  const projectedPlan = state.project(plan);
  const conversation = state.project(state.messages);
  const currentAlias = conversation[1].content.match(
    /\[name removed\]@[a-f0-9]{32}_\d+/,
  )![0];
  expect(state.nameReferences.get(currentAlias)).toBe('Максиму');
  expect(projectedPlan.tasks[0].entities.employee).not.toBe(currentAlias);
  const result = createCoreFullOfflineModel({ cases: dataset.cases }).respond(
    JSON.stringify({
      model: 'deepseek-v4-pro',
      max_tokens: 1200,
      stream: false,
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'SCRIPTED_DIAGNOSIS_ONLY' },
        {
          role: 'user',
          content: JSON.stringify({
            phase: 'tool_planning',
            surface: 'web',
            principal_role: 'client',
            now_utc: '2026-10-09T10:00:00Z',
            business_timezone: 'Europe/Moscow',
            conversation,
            semantic_plan: projectedPlan,
            tool_results: [],
            available_tools: [{ name: 'booking.availability.read' }],
          }),
        },
      ],
    }),
    { caseId: item.id, turn: 2 },
  );
  const response = JSON.parse(result.choices[0].message.content) as {
    semantic_plan: { tasks: Array<{ entities_json: string }> };
    tool_call: { arguments_json: string };
  };
  const entities = JSON.parse(
    response.semantic_plan.tasks[0].entities_json,
  ) as { employee: string; time: string };
  const args = JSON.parse(response.tool_call.arguments_json) as {
    staff_id: string;
  };
  expect(entities.employee).toBe(currentAlias);
  expect(args.staff_id).toBe(currentAlias);
  expect(entities.time).toBe('19:30');
  expect(
    bindBookingCatalog({
      staffSource: {
        staff: [...staffSource.staff, { id: 'fixture-maxim', name: 'Максим' }],
      },
      serviceSource,
      employee: args.staff_id,
      services: ['Мужская стрижка'],
      nameReferences: state.nameReferences,
    }),
  ).toMatchObject({ kind: 'resolved', staff: { id: 'fixture-maxim' } });
});

test('historical message alias cannot bind; current server semantic alias resolves the same saved staff without changing owner behavior', () => {
  const item = dataset.cases.find(
    (row) => row.id === 'core-client-create-followup',
  )!;
  const state = privacy.sanitizeMessages(
    item.userTurns.map((content) => ({ role: 'user', content })),
  );
  // Same order as AiCore.decide: semantic context before user-only messages.
  const projectedPlan = state.project(plan);
  const conversation = state.project(state.messages);
  const historicalAlias = conversation[0].content.match(
    /\[name removed\]@[a-f0-9]{32}_\d+/,
  )![0];
  const currentAlias = projectedPlan.tasks[0].entities.employee;
  expect(historicalAlias).not.toBe(currentAlias);
  expect(state.nameReferences.has(historicalAlias)).toBe(false);
  expect(state.nameReferences.get(currentAlias)).toBe('Артём');
  const bind = (employee: string) =>
    bindBookingCatalog({
      staffSource,
      serviceSource,
      employee,
      services: ['Мужская стрижка'],
      nameReferences: state.nameReferences,
    });
  expect(bind(historicalAlias)).toEqual({
    kind: 'unresolved',
    reason: 'staff_ambiguous_or_missing',
  });
  expect(bind(currentAlias)).toMatchObject({
    kind: 'resolved',
    staff: { id: 'fixture-staff' },
  });
  const model = createCoreFullOfflineModel({ cases: dataset.cases });
  const result = model.respond(
    JSON.stringify({
      model: 'deepseek-v4-pro',
      max_tokens: 1200,
      stream: false,
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'SCRIPTED_DIAGNOSIS_ONLY' },
        {
          role: 'user',
          content: JSON.stringify({
            phase: 'tool_planning',
            surface: 'web',
            principal_role: 'client',
            now_utc: '2026-10-09T10:00:00Z',
            business_timezone: 'Europe/Moscow',
            conversation,
            semantic_plan: projectedPlan,
            tool_results: [],
            available_tools: [{ name: 'appointments.own.create' }],
          }),
        },
      ],
    }),
    { caseId: item.id, turn: 2 },
  );
  const response = JSON.parse(result.choices[0].message.content) as {
    semantic_plan: { tasks: Array<{ entities_json: string }> };
    tool_call: { arguments_json: string };
  };
  const entities = JSON.parse(
    response.semantic_plan.tasks[0].entities_json,
  ) as { employee: string; time: string };
  const args = JSON.parse(response.tool_call.arguments_json) as {
    staff_id: string;
    start: string;
  };
  expect(entities.employee).toBe(currentAlias);
  expect(args.staff_id).toBe(currentAlias);
  expect(bind(args.staff_id)).toMatchObject({
    kind: 'resolved',
    staff: { id: 'fixture-staff' },
  });
  expect(entities.time).toBe('17:00');
  expect(args.start).toBe('2026-10-10T17:00:00+03:00');
  expect(bind(historicalAlias).kind).toBe('unresolved');
});
