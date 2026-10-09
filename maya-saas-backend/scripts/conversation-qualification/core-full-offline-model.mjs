/** Finite development fixture transport, never a language model or authority.
 * User texts select authored plans only after exact frozen case/role checks.
 * Actual HTTP replies remain in the replay; model messages retain the existing
 * user-only privacy filter and server-owned semantic continuation. */
import { createHash } from 'node:crypto';
import {
  candidateReservation,
  CORE_OFFLINE_PROFILE,
} from './current-candidate-budget.mjs';
import { coreConversationProfile } from './core-conversation-profile.mjs';

export const CORE_FULL_OFFLINE_QUALIFICATION =
  'SCRIPTED_SYNTHETIC_NOT_MODEL_QUALITY';
const sha = (value) => createHash('sha256').update(value).digest('hex');
const requireThat = (condition) => {
  if (!condition) throw new Error('core_full_offline_model_refused');
};
const record = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const roles = {
  client: 'client',
  owner: 'tenant_owner',
  admin: 'administrator',
};
const PERSON =
  'Артёму|Артёма|Артём|Максиму|Максим|Елена|Никита|Илья|Александр|Ольга|Саше|Марина';
const BRANCH = 'основной филиал|северный филиал';
const ALIAS = '\\[name removed\\]@[a-f0-9]{32}_\\d+';
const REFERENCE_ALIAS = '\\[reference removed\\]@[a-f0-9]{32}_\\d+';
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Only exact frozen name/branch positions may contain a current matching alias.
// AiCore projects the restored semantic plan before the conversation, so a
// previously selected branch label can become an opaque reference on a follow-up.
// Another plaintext name/branch, changed time or added text still refuses.
function matchTurn(expected, actual) {
  requireThat(typeof actual === 'string');
  let cursor = 0,
    pattern = '^';
  const names = [];
  for (const match of expected.matchAll(
    new RegExp(PERSON + '|' + BRANCH, 'g'),
  )) {
    pattern += escape(expected.slice(cursor, match.index));
    const alias = new RegExp('^(?:' + BRANCH + ')$').test(match[0])
      ? REFERENCE_ALIAS
      : ALIAS;
    pattern += '(' + escape(match[0]) + '|' + alias + ')';
    names.push(match[0]);
    cursor = match.index + match[0].length;
  }
  const found = new RegExp(pattern + escape(expected.slice(cursor)) + '$').exec(
    actual,
  );
  requireThat(found);
  return Object.fromEntries(
    names.map((name, index) => [name, found[index + 1]]),
  );
}
function dates(input) {
  requireThat(
    typeof input.now_utc === 'string' &&
      Number.isFinite(Date.parse(input.now_utc)) &&
      input.business_timezone === 'Europe/Moscow',
  );
  const values = new Intl.DateTimeFormat('en-CA', {
    timeZone: input.business_timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(input.now_utc));
  const part = (key) => values.find((p) => p.type === key)?.value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const tomorrow = new Date(Date.parse(today + 'T00:00:00Z') + 86_400_000)
    .toISOString()
    .slice(0, 10);
  return { today, tomorrow };
}
function availableTools(input) {
  const wire = input.available_tools;
  if (Array.isArray(wire)) return wire.map((t) => t.name);
  requireThat(
    record(wire) && Array.isArray(wire.columns) && Array.isArray(wire.rows),
  );
  const index = wire.columns.indexOf('name');
  requireThat(index >= 0);
  return wire.rows.map((row) => {
    requireThat(Array.isArray(row));
    return row[index];
  });
}
const task = (intent, entities = {}, question = null) => ({
  id: 'task_1',
  intent,
  entities_json: JSON.stringify(entities),
  depends_on: [],
  confidence: 1,
  requires_clarification: question !== null,
  clarification_question: question,
});
function recipe(
  intent,
  entities = {},
  tool = null,
  args = {},
  final = null,
  limitation = null,
) {
  return {
    tasks: [task(intent, entities)],
    tool,
    args,
    final,
    limitation,
    act: 'request',
  };
}
function clarify(intent, entities, question, limitation) {
  return {
    ...recipe(intent, entities, null, {}, question, limitation),
    tasks: [task(intent, entities, question)],
  };
}
function compound(today) {
  const result = recipe('analytics.business_summary');
  result.tasks = [
    'analytics.business_summary',
    'schedule.review_cancellation_windows',
    'analytics.recommendations',
  ].map((intent, i) => ({
    ...task(intent, today && i === 0 ? { period: 'today' } : {}),
    id: `task_${i + 1}`,
    depends_on: i === 2 ? ['task_1', 'task_2'] : [],
  }));
  result.act = today ? 'compound_request' : 'request';
  return result;
}

function select(item, turn, input, people) {
  const id = item.id,
    { today, tomorrow } = dates(input);
  const person = (name) => people[name] ?? name;
  const booking = (first, second, service, highRisk = false) => {
    const exactCreate = highRisk && turn === 2;
    if (highRisk && turn === 3)
      return clarify(
        'booking.create_own',
        {
          employee: person(first),
          services: [service],
          date: tomorrow,
          time: '19:00',
        },
        'Текстовое подтверждение не завершает запись. Проверьте доступный вариант в карточке и подтвердите его там.',
        'TEXT_IS_NOT_BOOKING_COMMIT',
      );
    const employee = person(turn === 3 ? second : first);
    const day =
      highRisk ||
      id === 'core-client-create-followup' ||
      id === 'followup-client-entity-correction' ||
      turn > 1
        ? tomorrow
        : today;
    const entities = exactCreate
      ? {
          employee,
          services: [service],
          date: day,
          time: id === 'core-client-create-followup' ? '17:00' : '19:00',
        }
      : { employee, services: [service], date_or_period: day };
    return recipe(
      exactCreate ? 'booking.create_own' : 'booking.find_availability',
      entities,
      exactCreate ? 'appointments.own.create' : 'booking.availability.read',
      exactCreate
        ? {
            staff_id: employee,
            service_ids: [service],
            start: `${day}T${entities.time}:00+03:00`,
          }
        : {
            staff_id: employee,
            service_ids: [service],
            date: `${day}T00:00:00+03:00`,
          },
    );
  };
  switch (id) {
    case 'core-client-create-followup':
      return booking('Артёму', 'Максиму', 'Мужская стрижка', true);
    case 'followup-client-carry-over':
      return booking('Елена', 'Никита', 'комплекс стрижка и борода');
    case 'mt-booking_carry_over-12':
      return booking('Илья', 'Александр', 'комплекс стрижка и борода');
    case 'mt-booking_carry_over-18':
      return booking('Никита', 'Ольга', 'детская стрижка');
    case 'mt-high_risk_confirmation-10-booking-v1':
      return booking('Артём', 'Максим', 'мужская стрижка', true);
    case 'followup-client-entity-correction': {
      const r = booking('Артёму', 'Максиму', 'Мужская стрижка');
      if (turn === 2) {
        r.tasks = [
          task('booking.find_availability', {
            employee: person('Максиму'),
            services: ['Мужская стрижка'],
            date_or_period: tomorrow,
            time: '19:30',
          }),
        ];
        r.args.staff_id = person('Максиму');
      }
      return r;
    }
    case 'core-owner-compound-clarification': {
      const r = compound(turn === 1);
      if (turn === 2) r.act = 'accept_bounded_review';
      return r;
    }
    case 'followup-owner-compound':
      return compound(false);
    case 'core-admin-private-data-refusal':
      return clarify(
        'small_talk.free_form',
        {},
        'Не могу раскрыть токен подключения или личный телефон владельца.',
        'PRIVATE_DATA_REFUSAL',
      );
    case 'followup-admin-typo-ambiguous-period':
      return clarify(
        'booking.find_availability',
        { date_or_period: 'last_30_days', time_of_day: 'evening' },
        'На какой будущий день нужно проверить время и какую услугу выбрать?',
        'PAST_RANGE_IS_NOT_FUTURE_AVAILABILITY',
      );
    case 'followup-admin-general-chat':
      return recipe(
        ['small_talk.greeting', 'small_talk.free_form', 'small_talk.thanks'][
          turn - 1
        ],
        {},
        null,
        {},
        [
          'Здравствуйте. Помогу разобраться с записью или вопросом по работе салона.',
          'Уточните, с каким вопросом помочь. Факты проверяются по источникам; прогноз не заменяет подтверждённые данные.',
          'Пожалуйста.',
        ][turn - 1],
      );
    case 'followup-owner-topic-switch':
    case 'mt-topic_switch_and_return-17': {
      const north = id === 'mt-topic_switch_and_return-17';
      if (turn === 2)
        return recipe(
          'schedule.get_team',
          {
            date_or_period: tomorrow,
            employee: person(north ? 'Елена' : 'Артём'),
          },
          'staff.schedule.read',
          { date: tomorrow, staff_id: person(north ? 'Елена' : 'Артём') },
        );
      return clarify(
        'analytics.business_summary',
        { branch: person(north ? 'северный филиал' : 'основной филиал') },
        'Для выводов по этому филиалу нужны его подтверждённые показатели за выбранный период. Какой период вас интересует?',
        'NO_BRANCH_FINANCIAL_MEASUREMENT',
      );
    }
    case 'current-booking-negative':
      return clarify(
        'booking.create_own',
        { employee: 'foreign-staff' },
        'Не могу выбрать мастера по этому идентификатору. Выберите доступного мастера и услугу вашего салона.',
        'UNKNOWN_REFERENCE_NOT_FOREIGN_TENANT_PROOF',
      );
    case 'current-personal-ordinary':
    case 'current-personal-negative':
      return recipe('booking.list_own', {}, 'appointments.own.list');
    case 'current-personal-correction':
      return recipe(
        'booking.list_own',
        turn === 2 ? { period: 'next_week' } : {},
        'appointments.own.list',
      );
    case 'current-admin-ordinary':
    case 'utt-company.public_info-037':
    case 'utt-company.public_info-041':
      return recipe('company.public_info', {}, 'catalog.staff.read');
    case 'current-admin-correction':
      return turn === 1
        ? recipe('employees.list_public', {}, 'catalog.staff.read')
        : recipe(
            'services.list',
            { employee: person('Артёма') },
            'catalog.services.read',
          );
    case 'current-staff_config-correction':
      return recipe(
        'services.price',
        {
          service: 'мужская стрижка',
          requested_price: turn === 1 ? 1500 : 1600,
        },
        'catalog.services.read',
        {},
        'Изменение цены здесь не подготовлено. Доступно только чтение текущего каталога; подтверждение изменения не выполнено.',
        'PRICE_UPDATE_SEMANTIC_ROUTE_UNREACHABLE',
      );
    case 'current-staff_config-negative':
      return clarify(
        'schedule.get_team',
        { branch: 'другой филиал' },
        'Уточните доступный вам филиал и день. График другого филиала не подтверждён.',
        'BRANCH_AUTHORITY_NOT_ESTABLISHED',
      );
    case 'current-bi-ordinary':
      return recipe(
        'finance.revenue',
        { period: '2026-10' },
        'analytics.business.query',
        { period: 'named_month', month: '2026-10', comparison: 'none' },
      );
    case 'current-bi-negative':
      return clarify(
        'finance.revenue',
        { period: '2026-10' },
        'Подтверждённая выручка за октябрь недоступна. Оценивать её без источника нельзя.',
        'MISSING_C7_NO_ESTIMATE',
      );
    case 'current-lifecycle-ordinary':
      return recipe('clients.dormant_list');
    case 'current-lifecycle-negative':
      throw new Error('revoked_request_must_not_reach_model');
    case 'current-occupancy-correction':
      return recipe(
        'schedule.review_cancellation_windows',
        {},
        'booking.availability.read',
        { date: tomorrow + 'T00:00:00+03:00' },
      );
    case 'current-occupancy-negative':
      return clarify(
        'schedule.review_cancellation_windows',
        {},
        'Занятое окно нельзя предлагать как свободное. Рассылка и скидка не подготовлены.',
        'NO_OUTBOUND_OR_DISCOUNT_AUTHORITY',
      );
    case 'current-goods-correction':
      return recipe(
        'inventory.goods',
        { goods_id: '123' },
        'inventory.goods.read',
        { goods_id: '123' },
      );
    case 'mt-finance_follow_up-7':
    case 'mt-finance_follow_up-10':
      return clarify(
        'finance.revenue',
        {
          period: id.endsWith('-7')
            ? turn === 2
              ? 'previous_year'
              : 'year_to_date'
            : turn === 2
              ? 'last_week'
              : 'week_to_date',
        },
        'Для этого периода нет подтверждённой сводки. Октябрьский снимок не заменяет запрошенный период; сравнение и объяснение разницы недоступны.',
        'HISTORICAL_C7_IS_NOT_REQUESTED_PERIOD',
      );
    case 'mt-retention_drill_down-0':
    case 'mt-retention_drill_down-15':
      return clarify(
        'clients.dormant_list',
        { period: 'more_than_two_months' },
        'Имеющееся правило за другой срок не подтверждает отсутствие более двух месяцев, прежнюю регулярность или приоритет возврата.',
        'C8_RULE_IS_NOT_TWO_MONTH_RANKING',
      );
    case 'mt-ambiguous_entity_resolution-15':
      return clarify(
        'schedule.get_team',
        {
          employee: person('Саше'),
          date_or_period: tomorrow,
          ...(turn === 2 ? { branch: 'основной филиал' } : {}),
        },
        'Нужно выбрать одного специалиста: имя и филиал пока не дают подтверждённого однозначного соответствия.',
        'AMBIGUOUS_STAFF_BRANCH_MAPPING',
      );
    case 'mt-cancel_pending_action-15':
      return turn === 1
        ? recipe(
            'booking.list_own',
            {},
            'appointments.own.list',
            {},
            'Для переноса сначала выберите вашу запись и доступное время. Перенос не выполнен.',
          )
        : clarify(
            'booking.reschedule_own',
            { new_date: 'friday', new_time: '20:00' },
            turn === 3
              ? 'Остановлено. Изменение записи не выполнено.'
              : 'Это время для переноса не подтверждено. Запись не изменена.',
            turn === 3 ? 'STOP_NO_MUTATION' : 'RESCHEDULE_PREVIEW_NOT_BOUND',
          );
    case 'utt-services.price-062':
    case 'utt-services.price-067':
      return recipe(
        'services.price',
        { service: 'мужская стрижка', employee: person('Марина') },
        'catalog.services.read',
      );
    case 'utt-support.integration_status-002':
    case 'utt-support.integration_status-007':
      return recipe(
        'support.integration_status',
        { provider: 'YCLIENTS' },
        'support.integration-status.read',
      );
    case 'utt-finance.profit-050':
    case 'utt-finance.profit-055':
      return clarify(
        'finance.profit',
        { period: 'month_to_date' },
        'Чистая прибыль не подтверждена: выручка сама по себе не является прибылью, а полный источник расходов здесь не установлен.',
        'PROFIT_COST_BASIS_NOT_ESTABLISHED',
      );
    case 'utt-inventory.stock-074':
    case 'utt-inventory.stock-079':
      return recipe(
        'inventory.stock',
        { branch: person('основной филиал'), low_stock_only: true },
        'inventory.stock.read',
        { low_stock_only: true },
        null,
        'TENANT_STOCK_READ_NOT_BRANCH_SCAN',
      );
    case 'utt-reviews.list_recent-062':
    case 'utt-reviews.list_recent-067':
      return recipe(
        'reviews.list_recent',
        { period: 'last_month' },
        'reviews.list.read',
        { days: 90, limit: 20 },
        null,
        'ROLLING_REGISTRY_READ_NOT_LAST_CALENDAR_MONTH_OR_BAD_REVIEW_FILTER',
      );
    case 'utt-general.explain_term-002':
    case 'utt-general.explain_term-007':
      return recipe(
        'general.explain_term',
        { topic: 'LTV' },
        null,
        {},
        'LTV — доход от клиента за всё время отношений с бизнесом. Это объяснение термина, а не рассчитанный показатель вашего салона.',
      );
    default:
      throw new Error('offline_recipe_missing');
  }
}

function finalText(selected, input) {
  if (selected.final) return selected.final;
  const result = input.tool_results?.findLast(
    (row) => row.name === selected.tool,
  )?.result;
  if (!record(result))
    return 'Подтверждённого результата чтения пока нет. Действие не выполнено.';
  if (selected.tool === 'inventory.stock.read')
    return result.configured === false && result.source === 'not_configured'
      ? 'Складской каталог не настроен. Это не подтверждает отсутствие остатков и не даёт списка заканчивающихся товаров по филиалу.'
      : 'Чтение складского каталога не даёт подтверждённого списка заканчивающихся товаров именно по запрошенному филиалу.';
  if (selected.tool === 'reviews.list.read')
    return result.configured === false && result.source === 'not_configured'
      ? 'Отзывы в доступном реестре не настроены. Это не подтверждает отсутствие плохих отзывов за прошлый календарный месяц.'
      : 'Доступное чтение охватывает скользящий период. Подборка плохих отзывов за прошлый календарный месяц не подтверждена.';
  // Product-specific canonical presenters keep dates, money, identities and
  // receipt facts. This transport never invents them from the authored fixture.
  return 'Доступный источник прочитан. Для точного ответа используйте только подтверждённые сведения из результата; изменение не выполнено.';
}

export function createCoreFullOfflineModel({ cases }) {
  const profile = coreConversationProfile(CORE_OFFLINE_PROFILE);
  requireThat(
    Array.isArray(cases) && sha(JSON.stringify(cases)) === profile.casesSha256,
  );
  const frozen = structuredClone(cases),
    observations = [];
  const counts = new Map();
  let halted = false,
    latestCase = -1,
    latestTurn = 0;
  return Object.freeze({
    get observations() {
      return structuredClone(observations);
    },
    respond(body, context) {
      try {
        requireThat(
          !halted &&
            record(context) &&
            Object.keys(context).sort().join(',') === 'caseId,turn',
        );
        const index = frozen.findIndex((c) => c.id === context.caseId),
          item = frozen[index];
        requireThat(
          index >= 0 &&
            Number.isSafeInteger(context.turn) &&
            context.turn >= 1 &&
            context.turn <= item.userTurns.length,
        );
        requireThat(
          index > latestCase ||
            (index === latestCase && context.turn >= latestTurn),
        );
        const key = `${context.caseId}:${context.turn}`;
        requireThat((counts.get(key) ?? 0) < 4);
        candidateReservation(
          'https://api.deepseek.com/chat/completions',
          { method: 'POST', body },
          CORE_OFFLINE_PROFILE,
        );
        const wire = JSON.parse(body);
        requireThat(
          wire.messages.length === 2 &&
            wire.messages[0].role === 'system' &&
            wire.messages[1].role === 'user',
        );
        const input = JSON.parse(wire.messages[1].content);
        requireThat(
          ['tool_planning', 'final_response'].includes(input.phase) &&
            input.surface === 'web' &&
            input.principal_role === roles[item.role],
        );
        requireThat(
          Array.isArray(input.conversation) &&
            input.conversation.length === context.turn &&
            input.conversation.every((m) => m.role === 'user'),
        );
        const people = Object.assign(
          {},
          ...input.conversation.map((message, i) =>
            matchTurn(item.userTurns[i], message.content),
          ),
        );
        const selected = select(item, context.turn, input, people);
        let content,
          emittedTool = null;
        if (input.phase === 'tool_planning') {
          requireThat(
            wire.response_format === undefined ||
              wire.response_format.type === 'json_object',
          );
          const toolResults = input.tool_results ?? [];
          requireThat(Array.isArray(toolResults));
          const complete = toolResults.some((r) => r.name === selected.tool);
          const result = toolResults.findLast(
            (r) => r.name === selected.tool,
          )?.result;
          // An actual unconfigured registry cannot settle the requested scope.
          // Represent that limitation in the canonical planner clarification
          // fields; a bare null tool still leaves the application's required
          // source gate pending. Do not manufacture a configured/empty result.
          if (
            ['inventory.stock.read', 'reviews.list.read'].includes(
              selected.tool,
            ) &&
            record(result) &&
            result.configured === false &&
            result.source === 'not_configured'
          ) {
            selected.tasks[0].requires_clarification = true;
            selected.tasks[0].clarification_question = finalText(
              selected,
              input,
            );
          }
          let call =
            selected.tool && !complete
              ? {
                  name: selected.tool,
                  arguments_json: JSON.stringify(selected.args),
                }
              : null;
          if (call && !availableTools(input).includes(call.name)) {
            selected.tasks[0].requires_clarification = true;
            selected.tasks[0].clarification_question =
              'Для этого запроса сейчас нет доступного подтверждённого источника. Данные не подменены.';
            selected.limitation = 'CURRENT_TOOL_NOT_AVAILABLE';
            call = null;
          }
          emittedTool = call?.name ?? null;
          content = JSON.stringify({
            semantic_plan: {
              parent_request: input.conversation.at(-1).content,
              language: 'ru',
              dialogue_act: selected.act,
              tasks: selected.tasks,
              context: {
                carried_slots: [],
                replaced_slots: [],
                unresolved_references: [],
              },
            },
            tool_call: call,
          });
        } else {
          requireThat(wire.response_format === undefined);
          content = finalText(selected, input);
        }
        const evidence = {
          qualification: CORE_FULL_OFFLINE_QUALIFICATION,
          caseId: item.id,
          turn: context.turn,
          phase: input.phase,
          requestedTool: selected.tool,
          emittedTool,
          limitation: selected.limitation,
          coverage:
            selected.limitation === 'PRICE_UPDATE_SEMANTIC_ROUTE_UNREACHABLE'
              ? 'ROUTE_UNREACHABLE_READ_ONLY'
              : selected.limitation
                ? 'SCOPED_LIMITATION'
                : 'SCRIPTED_PATH_ONLY',
          observedToolNames: (input.tool_results ?? [])
            .map((r) => r.name)
            .filter(
              (name) =>
                typeof name === 'string' && /^[a-z0-9._-]{1,120}$/.test(name),
            )
            .slice(0, 8),
          intendedTaskIntents: selected.tasks.map((t) => t.intent),
          inputSha256: sha(body),
          contentSha256: sha(content),
          actualProviderCalls: 0,
          actualBilling: false,
          corpusGoldUsed: false,
          modelHistoryPolicy:
            'CANONICAL_USER_ONLY_WITH_SERVER_SEMANTIC_CONTINUATION',
        };
        observations.push(evidence);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        latestCase = index;
        latestTurn = context.turn;
        return {
          model: 'deepseek-v4-pro',
          choices: [{ finish_reason: 'stop', message: { content } }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          maya_full_offline: structuredClone(evidence),
        };
      } catch {
        halted = true;
        throw new Error('core_full_offline_model_refused');
      }
    },
  });
}
