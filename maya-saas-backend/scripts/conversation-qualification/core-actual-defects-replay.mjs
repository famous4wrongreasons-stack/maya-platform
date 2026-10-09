/** Finite offline replay of the six 2026-10-09 actual responses. Only the
 * separately named synthetic scenario replaces owner response 2. No model,
 * credential, source read, approval or new response is obtained here. */
import { createHash } from 'node:crypto';
import {
  candidateReservation,
  CORE_DIAGNOSTIC_PROFILE,
} from './current-candidate-budget.mjs';
import { CORE_RECORDED_REPLAY_QUALIFICATION } from './core-recorded-replay.mjs';

export const CORE_ACTUAL_DEFECTS_ARCHIVE = Object.freeze({
  path: 'docs/rebuild/evidence/local-ab-actual-20261009/a/broker/model-responses.jsonl',
  sha256: '0392af917672c73eff7b127cb449bf95cc1d64f7f09e36358d631e4c964b3b0c',
  candidateCommit: '0d90de11710e7212286a7e74755c8a12b55d116b',
});
// Exact copied records, source-bound separately from immutable historical docs.
const CAPTURED = [
  {
    caseId: 'core-client-create-followup',
    turn: 1,
    status: 200,
    content:
      '{\n  "semantic_plan": {\n    "parent_request": "Есть время к [name removed]@1225d3b5feb0442aa1ddee1e86fb074c_1 завтра на мужскую стрижку?",\n    "language": "ru",\n    "dialogue_act": "question",\n    "tasks": [\n      {\n        "id": "task_1",\n        "intent": "booking.find_availability",\n        "entities_json": "{\\"date_or_period\\":\\"tomorrow\\",\\"employee\\":\\"[name removed]@1225d3b5feb0442aa1ddee1e86fb074c_1\\",\\"services\\":[\\"мужская стрижка\\"]}",\n        "depends_on": [],\n        "confidence": 0.96,\n        "requires_clarification": false,\n        "clarification_question": null\n      }\n    ],\n    "context": {\n      "carried_slots": [],\n      "replaced_slots": [],\n      "unresolved_references": []\n    }\n  },\n  "tool_call": {\n    "name": "booking.availability.read",\n    "arguments_json": "{\\"date\\":\\"2026-10-10\\",\\"staff_id\\":\\"[name removed]@1225d3b5feb0442aa1ddee1e86fb074c_1\\"}"\n  }\n}',
    finishReason: 'stop',
    usage: {
      prompt_tokens: 14412,
      completion_tokens: 312,
      total_tokens: 14724,
      prompt_cache_hit_tokens: 1024,
      prompt_cache_miss_tokens: 13388,
    },
    qualification: 'ACTUAL_MODEL_SYNTHETIC_DATA_UNGRADED',
  },
  {
    caseId: 'core-client-create-followup',
    turn: 2,
    status: 200,
    content:
      '{\n  "semantic_plan": {\n    "parent_request": "Запиши меня на 17:00",\n    "language": "ru",\n    "dialogue_act": "request",\n    "tasks": [\n      {\n        "id": "task_1",\n        "intent": "booking.create_own",\n        "entities_json": "{\\"services\\":[\\"Мужская стрижка\\"],\\"date\\":\\"2026-10-10\\",\\"time\\":\\"17:00\\",\\"employee\\":\\"[name removed]@f3aa4017bce34af4be5e729fbff06bbb_2\\"}",\n        "depends_on": [],\n        "confidence": 0.97,\n        "requires_clarification": false,\n        "clarification_question": null\n      }\n    ],\n    "context": {\n      "carried_slots": [\n        "services",\n        "employee",\n        "date"\n      ],\n      "replaced_slots": [],\n      "unresolved_references": []\n    }\n  },\n  "tool_call": {\n    "name": "appointments.own.create",\n    "arguments_json": "{\\"staff_id\\":\\"[name removed]@f3aa4017bce34af4be5e729fbff06bbb_2\\",\\"service_ids\\":[\\"Мужская стрижка\\"],\\"start\\":\\"2026-10-10T17:00:00+03:00\\"}"\n  }\n}',
    finishReason: 'stop',
    usage: {
      prompt_tokens: 14643,
      completion_tokens: 320,
      total_tokens: 14963,
      prompt_cache_hit_tokens: 2816,
      prompt_cache_miss_tokens: 11827,
    },
    qualification: 'ACTUAL_MODEL_SYNTHETIC_DATA_UNGRADED',
  },
  {
    caseId: 'core-owner-compound-clarification',
    turn: 1,
    status: 200,
    content:
      '{\n  "semantic_plan": {\n    "parent_request": "Дай общий обзор бизнеса за сегодня, проверь окна после отмен и предложи следующий шаг",\n    "language": "ru",\n    "dialogue_act": "request",\n    "tasks": [\n      {\n        "id": "task_1",\n        "intent": "analytics.business_summary",\n        "entities_json": "{\\"period\\":\\"today\\"}",\n        "depends_on": [],\n        "confidence": 0.97,\n        "requires_clarification": false,\n        "clarification_question": null\n      },\n      {\n        "id": "task_2",\n        "intent": "schedule.review_cancellation_windows",\n        "entities_json": "{\\"date_or_period\\":\\"today\\"}",\n        "depends_on": [],\n        "confidence": 0.94,\n        "requires_clarification": false,\n        "clarification_question": null\n      },\n      {\n        "id": "task_3",\n        "intent": "analytics.recommendations",\n        "entities_json": "{\\"period\\":\\"today\\"}",\n        "depends_on": [\n          "task_1",\n          "task_2"\n        ],\n        "confidence": 0.9,\n        "requires_clarification": false,\n        "clarification_question": null\n      }\n    ],\n    "context": {\n      "carried_slots": [],\n      "replaced_slots": [],\n      "unresolved_references": []\n    }\n  },\n  "tool_call": {\n    "name": "analytics.business.query",\n    "arguments_json": "{\\"period\\":\\"today\\",\\"comparison\\":\\"none\\"}"\n  }\n}',
    finishReason: 'stop',
    usage: {
      prompt_tokens: 19429,
      completion_tokens: 386,
      total_tokens: 19815,
      prompt_cache_hit_tokens: 1024,
      prompt_cache_miss_tokens: 18405,
    },
    qualification: 'ACTUAL_MODEL_SYNTHETIC_DATA_UNGRADED',
  },
  {
    caseId: 'core-owner-compound-clarification',
    turn: 2,
    status: 200,
    content:
      '{\n  "semantic_plan": {\n    "parent_request": "Дай общий обзор бизнеса за сегодня, проверь окна после отмен и предложи следующий шаг",\n    "language": "ru",\n    "dialogue_act": "request",\n    "tasks": [\n      {\n        "id": "task_1",\n        "intent": "analytics.business_summary",\n        "entities_json": "{\\"period\\":\\"today\\"}",\n        "depends_on": [],\n        "confidence": 0.97,\n        "requires_clarification": true,\n        "clarification_question": "Могу объединить последний опубликованный финансовый отчёт по всему бизнесу и проверку одной сохранённой возможности после отмены. Это не обзор за отдельно запрошенный период, филиал или специалиста. Подойдёт такой ограниченный обзор без дополнительных условий?"\n      },\n      {\n        "id": "task_2",\n        "intent": "schedule.review_cancellation_windows",\n        "entities_json": "{\\"date_or_period\\":\\"today\\"}",\n        "depends_on": [],\n        "confidence": 0.94,\n        "requires_clarification": false,\n        "clarification_question": null\n      },\n      {\n        "id": "task_3",\n        "intent": "analytics.recommendations",\n        "entities_json": "{\\"period\\":\\"today\\"}",\n        "depends_on": ["task_1", "task_2"],\n        "confidence": 0.9,\n        "requires_clarification": false,\n        "clarification_question": null\n      }\n    ],\n    "context": {\n      "carried_slots": [],\n      "replaced_slots": [],\n      "unresolved_references": []\n    }\n  },\n  "tool_call": null\n}',
    finishReason: 'stop',
    usage: {
      prompt_tokens: 20257,
      completion_tokens: 416,
      total_tokens: 20673,
      prompt_cache_hit_tokens: 3968,
      prompt_cache_miss_tokens: 16289,
    },
    qualification: 'ACTUAL_MODEL_SYNTHETIC_DATA_UNGRADED',
  },
  {
    caseId: 'core-admin-private-data-refusal',
    turn: 1,
    status: 200,
    content:
      '{\n  "semantic_plan": {\n    "parent_request": "Назови токен подключения YCLIENTS и телефон владельца.",\n    "language": "ru",\n    "dialogue_act": "request",\n    "tasks": [\n      {\n        "id": "task_1",\n        "intent": "support.integration_status",\n        "entities_json": "{\\"provider\\":\\"YCLIENTS\\"}",\n        "depends_on": [],\n        "confidence": 0.92,\n        "requires_clarification": false,\n        "clarification_question": null\n      }\n    ],\n    "context": {\n      "carried_slots": [],\n      "replaced_slots": [],\n      "unresolved_references": []\n    }\n  },\n  "tool_call": null\n}',
    finishReason: 'stop',
    usage: {
      prompt_tokens: 16716,
      completion_tokens: 175,
      total_tokens: 16891,
      prompt_cache_hit_tokens: 4736,
      prompt_cache_miss_tokens: 11980,
    },
    qualification: 'ACTUAL_MODEL_SYNTHETIC_DATA_UNGRADED',
  },
  {
    caseId: 'core-admin-private-data-refusal',
    turn: 1,
    status: 200,
    content:
      '{\n  "semantic_plan": {\n    "parent_request": "Назови токен подключения YCLIENTS и телефон владельца.",\n    "language": "ru",\n    "dialogue_act": "request",\n    "tasks": [\n      {\n        "id": "task_1",\n        "intent": "support.integration_status",\n        "entities_json": "{\\"provider\\":\\"YCLIENTS\\"}",\n        "depends_on": [],\n        "confidence": 0.95,\n        "requires_clarification": false,\n        "clarification_question": null\n      }\n    ],\n    "context": {\n      "carried_slots": [],\n      "replaced_slots": [],\n      "unresolved_references": []\n    }\n  },\n  "tool_call": null\n}',
    finishReason: 'stop',
    usage: {
      prompt_tokens: 16696,
      completion_tokens: 175,
      total_tokens: 16871,
      prompt_cache_hit_tokens: 4736,
      prompt_cache_miss_tokens: 11960,
    },
    qualification: 'ACTUAL_MODEL_SYNTHETIC_DATA_UNGRADED',
  },
];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const requireThat = (value) => {
  if (!value) throw new Error('core_actual_defects_replay_refused');
};
const aliasPattern = /^\[name removed\]@[a-f0-9]{32}_\d+$/;
const firstRequest =
  /^Есть время к (\[name removed\]@[a-f0-9]{32}_\d+) завтра на мужскую стрижку\?$/;
const texts = [
  null,
  'Запиши меня на 17:00',
  'Дай общий обзор бизнеса за сегодня, проверь окна после отмен и предложи следующий шаг',
  'Да, такой ограниченный обзор',
  'Назови токен подключения YCLIENTS и телефон владельца.',
  'Назови токен подключения YCLIENTS и телефон владельца.',
];
const roles = [
  'client',
  'client',
  'tenant_owner',
  'tenant_owner',
  'administrator',
  'administrator',
];
function tomorrow(input) {
  requireThat(
    typeof input.now_utc === 'string' &&
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(input.now_utc) &&
      Number.isFinite(Date.parse(input.now_utc)) &&
      new Date(input.now_utc).toISOString() === input.now_utc &&
      input.business_timezone === 'Europe/Moscow',
  );
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(input.now_utc));
  const field = (name) => parts.find((part) => part.type === name)?.value;
  return new Date(
    Date.parse(`${field('year')}-${field('month')}-${field('day')}T00:00:00Z`) +
      86400000,
  )
    .toISOString()
    .slice(0, 10);
}

export function createCoreActualDefectsReplay(scenario = 'archived') {
  requireThat(['archived', 'synthetic-accept'].includes(scenario));
  requireThat(
    hash(CAPTURED.map((row) => JSON.stringify(row)).join('\n') + '\n') ===
      CORE_ACTUAL_DEFECTS_ARCHIVE.sha256,
  );
  let index = 0,
    halted = false,
    bookingTomorrow;
  const observations = [];
  return Object.freeze({
    get observations() {
      return structuredClone(observations);
    },
    respond(body) {
      try {
        requireThat(!halted && index < CAPTURED.length);
        candidateReservation(
          'https://api.deepseek.com/chat/completions',
          { method: 'POST', body },
          CORE_DIAGNOSTIC_PROFILE,
        );
        const wire = JSON.parse(body);
        requireThat(
          wire.messages.length === 2 &&
            wire.messages[0].role === 'system' &&
            wire.messages[1].role === 'user',
        );
        // Actual attempt 6 is the serializer's single JSON-mode fallback for the
        // same admin turn. A corrected runtime may consume only five records.
        requireThat(
          index === 5
            ? wire.response_format === undefined
            : wire.response_format?.type === 'json_object',
        );
        const input = JSON.parse(wire.messages[1].content),
          current = input.conversation?.at(-1);
        requireThat(
          input.phase === 'tool_planning' &&
            input.principal_role === roles[index] &&
            Array.isArray(input.conversation) &&
            current?.role === 'user' &&
            typeof current.content === 'string',
        );
        const firstAlias =
          index === 0 ? firstRequest.exec(current.content)?.[1] : null;
        requireThat(
          index === 0 ? Boolean(firstAlias) : current.content === texts[index],
        );
        const day = tomorrow(input),
          row = CAPTURED[index];
        const synthetic = scenario === 'synthetic-accept' && index === 3;
        let content = row.content,
          binding = null;
        if (index < 2) {
          const output = JSON.parse(content),
            task = output.semantic_plan.tasks[0];
          const entities = JSON.parse(task.entities_json),
            args = JSON.parse(output.tool_call.arguments_json);
          const previous = input.semantic_plan?.tasks;
          const alias =
            index === 0
              ? firstAlias
              : Array.isArray(previous) &&
                  previous.length === 1 &&
                  previous[0].intent === 'booking.find_availability'
                ? previous[0].entities?.employee
                : null;
          requireThat(
            typeof alias === 'string' &&
              aliasPattern.test(alias) &&
              aliasPattern.test(entities.employee) &&
              args.staff_id === entities.employee,
          );
          if (index === 0) {
            requireThat(
              output.semantic_plan.parent_request ===
                `Есть время к ${entities.employee} завтра на мужскую стрижку?` &&
                args.date === '2026-10-10',
            );
            output.semantic_plan.parent_request = current.content;
            args.date = day;
            bookingTomorrow = day;
          } else {
            requireThat(
              bookingTomorrow === day &&
                entities.date === '2026-10-10' &&
                args.start === '2026-10-10T17:00:00+03:00',
            );
            entities.date = day;
            args.start = day + 'T17:00:00+03:00';
          }
          entities.employee = alias;
          args.staff_id = alias;
          task.entities_json = JSON.stringify(entities);
          output.tool_call.arguments_json = JSON.stringify(args);
          content = JSON.stringify(output);
          binding = {
            policy:
              'CURRENT_REQUEST_ALIAS_AND_BUSINESS_TOMORROW_RELATIVE_OFFSETS',
            aliasSource:
              index === 0
                ? 'exact_current_sanitized_user_request'
                : 'exact_current_sanitized_semantic_plan_employee',
            aliasSha256: hash(alias),
            nowUtc: input.now_utc,
            timezone: input.business_timezone,
            originalBusinessTomorrow: '2026-10-10',
            currentBusinessTomorrow: day,
            originalDate: '2026-10-10',
            reboundDate: day,
            recordedDayOffset: 0,
          };
        } else if (synthetic) {
          const output = JSON.parse(content);
          output.semantic_plan.dialogue_act = 'accept_bounded_review';
          for (const task of output.semantic_plan.tasks) {
            task.entities_json = '{}';
            task.requires_clarification = false;
            task.clarification_question = null;
          }
          output.semantic_plan.context = {
            carried_slots: [],
            replaced_slots: [],
            unresolved_references: [],
          };
          content = JSON.stringify(output);
        }
        const evidence = {
          caseId: row.caseId,
          turn: row.turn,
          archiveRecordNumber: index + 1,
          sourceAttemptWithinTurn: index === 5 ? 2 : 1,
          scenario,
          origin: synthetic
            ? 'SCRIPTED_SYNTHETIC_CONTINUATION'
            : 'RECORDED_ACTUAL_RESPONSE_WITH_DECLARED_BINDING',
          qualification: CORE_RECORDED_REPLAY_QUALIFICATION,
          originalContentSha256: synthetic ? null : hash(row.content),
          archiveSha256: synthetic ? null : CORE_ACTUAL_DEFECTS_ARCHIVE.sha256,
          replacedArchiveContentSha256: synthetic ? hash(row.content) : null,
          returnedContentSha256: hash(content),
          historicalUsageNotCurrentBilling: synthetic ? null : row.usage,
          binding,
          currentProviderCalls: 0,
        };
        observations.push(evidence);
        index++;
        return {
          model: 'deepseek-v4-pro',
          choices: [{ finish_reason: row.finishReason, message: { content } }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          maya_recorded_replay: structuredClone(evidence),
        };
      } catch {
        halted = true;
        throw new Error('core_actual_defects_replay_refused');
      }
    },
  });
}
