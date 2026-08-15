import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { UserRole } from '../src/common/domain.enums';
import { MAYA_AI_TOOL_CATALOG } from '../src/ai-tools/ai-tool.catalog';
import { mayaConversationLanguageContract } from '../src/conversation-intelligence/conversation-language-pack';
import { MAYA_CONVERSATION_POLICY_CONTRACT } from '../src/conversation-intelligence/conversation-policies';
import { MAYA_CONVERSATION_TAXONOMY } from '../src/conversation-intelligence/conversation-taxonomy';
import { CONVERSATION_DOMAINS } from '../src/conversation-intelligence/conversation-intelligence.types';
import type {
  ConversationEntities,
  ConversationEntityValue,
  ConversationIntentDefinition,
} from '../src/conversation-intelligence/conversation-intelligence.types';

type DatasetRole = 'owner' | 'admin' | 'employee' | 'client';
type DatasetSplit = 'train' | 'dev' | 'test';

type UtteranceRow = {
  id: string;
  family_id: string;
  split: DatasetSplit;
  utterance: string;
  role: DatasetRole;
  domain: string;
  intent: string;
  entities: ConversationEntities;
  action: string;
  data_source: string;
  permission: string;
  capability_readiness: string;
  capability_note: string | null;
  response_rule: string;
  confidence_expected: 'high' | 'medium';
  requires_clarification: boolean;
  style: string;
  context?: {
    previous_user_turn: string;
    active_intent: string;
    active_entities: ConversationEntities;
    operation: 'carry' | 'replace';
    replaced_slots: string[];
    resolution_rule: string;
  };
};

type ConversationTurn = {
  speaker: 'user' | 'assistant';
  text: string;
};

type JsonRecord = Record<string, unknown>;

const OUTPUT_DIRECTORY = resolve(
  process.cwd(),
  'datasets/conversation-intelligence',
);
const UTTERANCE_VARIANTS_PER_INTENT = 132;
const ADVERSARIAL_EXAMPLES = 600;
const MULTI_TURN_EXAMPLES = 1_050;
const CONTRASTIVE_EXAMPLES = 600;
const DATASET_VERSION = 'maya-ci-dataset/2';

const MACHINE_VISIBLE_TOKEN =
  /\b(?:next_friday|rolling_30_days|year_to_date|previous_period|end_of_month|next_month|next_own_appointment|weekday_schedule|weekend_schedule|inactive_\d+_days|at_risk_clients|current_preview|daily_briefing|service_recovery|appointment_reminder|return_inactive_clients|fill_empty_slots|retention_message|revenue_decline|retention_decline|average_check|synthetic[-_][a-z0-9_-]+|\d+\s+(?:days|weeks|months|years))\b/iu;

const STYLES = [
  'formal',
  'neutral',
  'conversational',
  'slang',
  'short',
  'verbose',
  'typo',
  'contextual',
  'polite',
  'command',
  'question',
  'indirect',
] as const;

const SAFE_NAMES = [
  'Артём',
  'Максим',
  'Илья',
  'Александр',
  'Анна',
  'Марина',
  'Антон',
  'Елена',
  'Никита',
  'Ольга',
] as const;
const SAFE_SERVICES = [
  'мужская стрижка',
  'моделирование бороды',
  'комплекс стрижка и борода',
  'детская стрижка',
  'тонирование',
] as const;
const SAFE_BRANCHES = [
  'основной филиал',
  'филиал в центре',
  'северный филиал',
] as const;
const PERIODS = [
  ['today', 'сегодня'],
  ['yesterday', 'вчера'],
  ['this_week', 'на этой неделе'],
  ['last_week', 'за прошлую неделю'],
  ['this_month', 'в этом месяце'],
  ['last_month', 'за прошлый месяц'],
  ['rolling_30_days', 'за последние 30 дней'],
  ['year_to_date', 'с начала года'],
] as const;

const REQUEST_PREFIXES = [
  '',
  'Майя, ',
  'Скажи коротко: ',
  'Проверь, пожалуйста: ',
  'Нужен точный ответ: ',
  'Без догадок: ',
  'По актуальным данным, ',
  'Ответь по существу: ',
  'Помоги разобраться: ',
  'Можешь уточнить: ',
] as const;

const REQUEST_SUFFIXES = [
  '',
  'Ответь только после проверки данных.',
  'Это относится к текущему филиалу.',
  'Учти мою роль в бизнесе.',
  'Ничего не меняй без моего подтверждения.',
  'Если контекста не хватает, задай один уточняющий вопрос.',
  'Не подменяй факты прогнозом.',
  'Покажи главный вывод первым.',
  'Не раскрывай чужие данные.',
  'Сохрани контекст предыдущего сообщения.',
  'Сначала дай факт, потом краткий вывод.',
  'Отдели данные CRM от своего вывода.',
  'Уточняй только то, что меняет результат.',
  'Не повторяй уже известные параметры.',
  'Если действие рискованное, сначала покажи последствия.',
] as const;

function stableNumber(value: string): number {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function splitForFamily(familyId: string): DatasetSplit {
  const bucket = stableNumber(familyId) % 10;
  if (bucket === 0) return 'test';
  if (bucket === 1) return 'dev';
  return 'train';
}

function capitalize(value: string): string {
  const clean = value.trim().replace(/[.!?]+$/u, '');
  if (!clean) return clean;
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function lowerFirst(value: string): string {
  const clean = value.trim().replace(/[.!?]+$/u, '');
  if (!clean) return clean;
  return clean.charAt(0).toLowerCase() + clean.slice(1);
}

function capitalizePreservingTerminal(value: string): string {
  const clean = value.trim();
  if (!clean) return clean;
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function variedRequest(value: string, index: number): string {
  const clean = value.trim();
  const prefix = REQUEST_PREFIXES[index % REQUEST_PREFIXES.length];
  const suffix =
    REQUEST_SUFFIXES[
      Math.floor(index / REQUEST_PREFIXES.length) % REQUEST_SUFFIXES.length
    ];
  const request = prefix ? `${prefix}${lowerFirst(clean)}` : capitalize(clean);
  if (!suffix) return request;
  return `${request.replace(/[.!?]+$/u, '')}. ${suffix}`;
}

function varyConversation(
  conversation: readonly ConversationTurn[],
  index: number,
): ConversationTurn[] {
  let changed = false;
  return conversation.map((turn) => {
    if (changed || turn.speaker !== 'user') return { ...turn };
    changed = true;
    return { ...turn, text: variedRequest(turn.text, index) };
  });
}

function roleLabel(role: UserRole): DatasetRole | null {
  if (
    [
      UserRole.TENANT_OWNER,
      UserRole.BUSINESS_OWNER,
      UserRole.TENANT_ADMIN,
      UserRole.ACCOUNTANT,
    ].includes(role)
  ) {
    return 'owner';
  }
  if (
    [
      UserRole.ADMINISTRATOR,
      UserRole.MANAGER,
      UserRole.BRANCH_MANAGER,
    ].includes(role)
  ) {
    return 'admin';
  }
  if ([UserRole.PROVIDER, UserRole.EMPLOYEE, UserRole.STAFF].includes(role)) {
    return 'employee';
  }
  if ([UserRole.CLIENT, UserRole.CUSTOMER].includes(role)) {
    return 'client';
  }
  return null;
}

function datasetRole(
  definition: ConversationIntentDefinition,
  index: number,
): DatasetRole {
  const roles = Array.from(
    new Set(
      definition.allowedRoles
        .map((role) => roleLabel(role))
        .filter((role): role is DatasetRole => role !== null),
    ),
  );
  return roles[index % roles.length] ?? 'owner';
}

function dataSource(definition: ConversationIntentDefinition): string {
  switch (definition.dataClass) {
    case 'A':
      return 'general_llm';
    case 'B':
      return 'tenant_context';
    case 'C':
      return 'yclients_or_maya_tool';
    case 'D':
      return 'calculated_from_verified_data';
    case 'E':
      return 'confirmed_external_action';
    case 'F':
      return 'permission_denied';
  }
}

function slotValue(slot: string, index: number): ConversationEntities[string] {
  const period = PERIODS[index % PERIODS.length][0];
  const values: Record<string, ConversationEntities[string]> = {
    date_or_period: period,
    period,
    date: 'tomorrow',
    new_date: 'next_friday',
    time: `${17 + (index % 4)}:00`,
    new_time: `${18 + (index % 3)}:00`,
    time_of_day: index % 2 === 0 ? 'evening' : 'afternoon',
    employee: SAFE_NAMES[index % SAFE_NAMES.length],
    new_employee: SAFE_NAMES[(index + 1) % SAFE_NAMES.length],
    client: `Гость ${SAFE_NAMES[index % SAFE_NAMES.length]}`,
    services: [SAFE_SERVICES[index % SAFE_SERVICES.length]],
    service: SAFE_SERVICES[index % SAFE_SERVICES.length],
    branch: SAFE_BRANCHES[index % SAFE_BRANCHES.length],
    appointment: 'next_own_appointment',
    available_time: `${17 + (index % 4)}:30`,
    party_size: 2 + (index % 2),
    simultaneous: index % 2 === 0,
    working_hours: index % 2 === 0 ? '10:00-20:00' : '12:00-21:00',
    schedule: index % 2 === 0 ? 'weekday_schedule' : 'weekend_schedule',
    status: index % 2 === 0 ? 'confirmed' : 'completed',
    appointment_status: index % 2 === 0 ? 'confirmed' : 'completed',
    absence_period: `${1 + (index % 6)}_months`,
    loyalty_threshold: 5 + (index % 4),
    amount: 5_000 + index * 100,
    percentage: 5 + (index % 20),
    audience: index % 2 === 0 ? 'inactive_60_days' : 'at_risk_clients',
    message: 'Персональное предложение без персональных данных',
    metric: index % 2 === 0 ? 'revenue' : 'retention',
    metric_or_problem:
      index % 2 === 0 ? 'revenue_decline' : 'retention_decline',
    product: 'средство для домашнего ухода',
    quantity: 3 + (index % 7),
    task: 'проверить свободные окна',
    task_id: `task-${1 + (index % 20)}`,
    assignee: SAFE_NAMES[(index + 2) % SAFE_NAMES.length],
    capability:
      index % 2 === 0 ? 'staff_performance' : 'retention_analysis',
    enabled: index % 2 === 0,
    setting: 'daily_briefing',
    value: index % 2 === 0,
    review_period: period,
    comparison_period: index % 2 === 0 ? 'previous_period' : 'last_year',
    target_period: index % 2 === 0 ? 'end_of_month' : 'next_month',
    client_reference: `synthetic-client-${index % 20}`,
    branches: [SAFE_BRANCHES[index % SAFE_BRANCHES.length]],
    category: index % 2 === 0 ? 'rent' : 'supplies',
    constraint: index % 2 === 0 ? 'after_18_00' : 'same_employee',
    deadline: index % 2 === 0 ? 'today_18_00' : 'tomorrow_12_00',
    description: 'Проверить операционный вопрос без персональных данных',
    delta: 100 + (index % 10) * 50,
    feature: index % 2 === 0 ? 'daily_briefing' : 'retention_analysis',
    field: index % 2 === 0 ? 'business_name' : 'working_hours',
    goal: index % 2 === 0 ? 'increase_retention' : 'fill_empty_slots',
    length: 30 + (index % 4) * 15,
    low_stock_only: index % 2 === 0,
    nominal: 1_000 + (index % 5) * 1_000,
    offer: index % 2 === 0 ? 'care_service' : 'next_visit_bonus',
    payment_method: index % 2 === 0 ? 'card' : 'cash',
    previous_frequency: index % 2 === 0 ? 'every_30_days' : 'every_45_days',
    priority: index % 2 === 0 ? 'high' : 'normal',
    profit_type: index % 2 === 0 ? 'gross_profit' : 'operating_profit',
    provider: index % 2 === 0 ? 'yclients' : 'altegio',
    rating: index % 2 === 0 ? 'low' : 'high',
    referral: `synthetic-referral-${index % 12}`,
    requested_fields:
      index % 2 === 0 ? ['name', 'price'] : ['name', 'duration'],
    reason: 'service_recovery',
    role: index % 2 === 0 ? 'administrator' : 'employee',
    sale_type: index % 2 === 0 ? 'service' : 'product',
    scenario: index % 2 === 0 ? 'late_cancellation' : 'empty_slot',
    section: index % 2 === 0 ? 'finance' : 'schedule',
    tone: index % 2 === 0 ? 'calm' : 'friendly',
    audience_rule: index % 2 === 0 ? 'inactive_60_days' : 'at_risk',
    minimum_visits: 2 + (index % 4),
    max_recipients: 50 + (index % 4) * 25,
    goal_or_audience:
      index % 2 === 0 ? 'return_inactive_clients' : 'fill_empty_slots',
    approved_preview: 'current_preview',
    channel: index % 2 === 0 ? 'push' : 'email',
    event: 'appointment_reminder',
    timing: '24_hours_before',
    topic: index % 2 === 0 ? 'ltv' : 'average_check',
    content_goal: 'retention_message',
  };
  return values[slot] ?? `synthetic_${slot}_${index % 7}`;
}

function baselineEntities(
  definition: ConversationIntentDefinition,
  index: number,
): ConversationEntities {
  return Object.fromEntries(
    definition.requiredSlots.map((slot) => [slot, slotValue(slot, index)]),
  );
}

function scenario(
  definition: ConversationIntentDefinition,
  index: number,
): {
  suffix: string;
  followUp: string;
  entities: ConversationEntities;
  expressedSlots: string[];
} {
  const slots = new Set([
    ...definition.requiredSlots,
    ...definition.optionalSlots,
  ]);
  const entities = baselineEntities(definition, index);
  const period = PERIODS[index % PERIODS.length];
  const fallbacks = [
    'ответь коротко',
    'объясни простыми словами',
    'нужны точные данные без догадок',
    'покажи главный вывод',
    'начни с итога',
    'без лишних деталей',
    'учти текущий контекст бизнеса',
    'если данных нет, скажи об этом прямо',
    'дай один полезный следующий шаг',
    'проверь права перед ответом',
    'не подменяй факты прогнозом',
  ];
  const contextualFallbacks = [
    'А можно подробнее?',
    'Покажи главное.',
    'А почему?',
    'Что посоветуешь?',
    'А если коротко?',
    'Есть ещё что-то важное?',
    'Какой следующий шаг?',
    'А по фактам?',
    'Что изменилось?',
    'С чего начать?',
    'И что теперь делать?',
  ];
  const qualifier = fallbacks[index % fallbacks.length];

  if (slots.has('period') || slots.has('date_or_period') || slots.has('date')) {
    const periodSlot = slots.has('date')
      ? 'date'
      : slots.has('period')
        ? 'period'
        : 'date_or_period';
    entities[periodSlot] = period[0];
    return {
      suffix: `${period[1]}; ${qualifier}`,
      followUp: `а ${period[1]}?`,
      entities,
      expressedSlots: [periodSlot],
    };
  }
  if (slots.has('employee') || slots.has('new_employee')) {
    const employee = SAFE_NAMES[index % SAFE_NAMES.length];
    entities.employee = employee;
    return {
      suffix: `по сотруднику ${employee}; ${qualifier}`,
      followUp: `а если ${employee}?`,
      entities,
      expressedSlots: ['employee'],
    };
  }
  if (slots.has('service') || slots.has('services')) {
    const service = SAFE_SERVICES[index % SAFE_SERVICES.length];
    entities[slots.has('services') ? 'services' : 'service'] = slots.has(
      'services',
    )
      ? [service]
      : service;
    return {
      suffix: `по услуге «${service}»; ${qualifier}`,
      followUp: `а по «${service}»?`,
      entities,
      expressedSlots: [slots.has('services') ? 'services' : 'service'],
    };
  }
  if (slots.has('branch')) {
    const branch = SAFE_BRANCHES[index % SAFE_BRANCHES.length];
    entities.branch = branch;
    return {
      suffix: `по точке «${branch}»; ${qualifier}`,
      followUp: `а по «${branch}»?`,
      entities,
      expressedSlots: ['branch'],
    };
  }
  return {
    suffix: fallbacks[index % fallbacks.length],
    followUp: contextualFallbacks[index % contextualFallbacks.length],
    entities,
    expressedSlots: [],
  };
}

function basePhrase(
  definition: ConversationIntentDefinition,
  index: number,
): string {
  const examples = definition.examples.length
    ? definition.examples
    : [definition.description];
  const example = examples[index % examples.length];
  if (index % 4 < 3 || definition.synonyms.length === 0) {
    return capitalize(example);
  }
  const synonym =
    definition.synonyms[Math.floor(index / 4) % definition.synonyms.length];
  return capitalize(synonym);
}

function enrichOptionalEntities(
  value: string,
  definition: ConversationIntentDefinition,
  entities: ConversationEntities,
): string[] {
  const slots = new Set([
    ...definition.requiredSlots,
    ...definition.optionalSlots,
  ]);
  const expressed = new Set<string>();
  const normalized = value.toLowerCase().replace(/ё/gu, 'е');
  const employeeAliases: Array<[RegExp, string]> = [
    [/артем/iu, 'Артём'],
    [/максим/iu, 'Максим'],
    [/иль(?:я|и|е|ю|ей)/iu, 'Илья'],
    [/александр|саш/iu, 'Александр'],
    [/анн/iu, 'Анна'],
    [/марин/iu, 'Марина'],
    [/антон/iu, 'Антон'],
    [/елен/iu, 'Елена'],
    [/никит/iu, 'Никита'],
    [/ольг/iu, 'Ольга'],
  ];
  if (slots.has('employee')) {
    const employee = employeeAliases.find(([pattern]) =>
      pattern.test(normalized),
    );
    if (employee) {
      entities.employee = employee[1];
      expressed.add('employee');
    }
  }
  if (slots.has('time_of_day')) {
    if (/утр/iu.test(normalized)) {
      entities.time_of_day = 'morning';
      expressed.add('time_of_day');
    }
    if (/после\s+обеда|днем/iu.test(normalized)) {
      entities.time_of_day = 'afternoon';
      expressed.add('time_of_day');
    }
    if (/вечер|после\s+шести|к\s+закрытию/iu.test(normalized)) {
      entities.time_of_day = 'evening';
      expressed.add('time_of_day');
    }
  }
  if (slots.has('time')) {
    const match = normalized.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/u);
    if (match) {
      entities.time = `${match[1].padStart(2, '0')}:${match[2]}`;
      expressed.add('time');
    }
  }
  if (slots.has('party_size')) {
    if (/нас\s+двое|двоих|вдвоем/iu.test(normalized)) {
      entities.party_size = 2;
      expressed.add('party_size');
    }
  }
  const numericMatch = normalized.match(/\b(\d[\d\s]*)\b/u);
  const numericValue = numericMatch?.[1];
  let normalizedNumber = numericValue
    ? Number(numericValue.replace(/\s/gu, ''))
    : null;
  const numericTail = numericMatch
    ? normalized.slice((numericMatch.index ?? 0) + numericMatch[0].length)
    : '';
  if (
    normalizedNumber !== null &&
    /^(?:\s*)(?:тыс|т\.|k|k\b)/iu.test(numericTail)
  ) {
    normalizedNumber *= 1_000;
  } else if (
    normalizedNumber !== null &&
    /^(?:\s*)(?:млн|миллион)/iu.test(numericTail)
  ) {
    normalizedNumber *= 1_000_000;
  } else if (/пол(?:\s*|-)?миллион|пол\s+ляма/iu.test(normalized)) {
    normalizedNumber = 500_000;
  }
  if (
    slots.has('amount') &&
    Number.isFinite(normalizedNumber) &&
    /(?:руб|рубл|сумм|расход|платеж)/iu.test(normalized)
  ) {
    entities.amount = normalizedNumber;
    expressed.add('amount');
  }
  if (
    slots.has('delta') &&
    Number.isFinite(normalizedNumber) &&
    /балл/iu.test(normalized)
  ) {
    entities.delta = normalizedNumber;
    expressed.add('delta');
  }
  if (
    slots.has('percentage') &&
    Number.isFinite(normalizedNumber) &&
    /%|процент/iu.test(normalized)
  ) {
    entities.percentage = normalizedNumber;
    expressed.add('percentage');
  }
  if (slots.has('working_hours')) {
    if (/выходн/iu.test(normalized)) {
      entities.working_hours = 'off';
      expressed.add('working_hours');
    }
    const hours = normalized.match(
      /(?:с\s*)?([01]?\d|2[0-3])(?::([0-5]\d))?\s*(?:до|-|–|—)\s*([01]?\d|2[0-3])(?::([0-5]\d))?/u,
    );
    if (hours) {
      entities.working_hours = `${hours[1].padStart(2, '0')}:${hours[2] ?? '00'}-${hours[3].padStart(2, '0')}:${hours[4] ?? '00'}`;
      expressed.add('working_hours');
    }
  }
  if (slots.has('absence_period')) {
    const wordNumbers: Record<string, number> = {
      один: 1,
      одного: 1,
      два: 2,
      двух: 2,
      три: 3,
      трех: 3,
      четыре: 4,
      четырех: 4,
      пять: 5,
      пяти: 5,
      шесть: 6,
      шести: 6,
    };
    const absence = normalized.match(
      /(?:больше|более|не\s+был\w*)\s+(\d+|один|одного|два|двух|три|трех|четыре|четырех|пять|пяти|шесть|шести)\s+(дн|недел|месяц|год)/iu,
    );
    if (absence) {
      const amount = Number(absence[1]) || wordNumbers[absence[1]];
      const unit = absence[2].startsWith('дн')
        ? 'days'
        : absence[2].startsWith('недел')
          ? 'weeks'
          : absence[2].startsWith('месяц')
            ? 'months'
            : 'years';
      entities.absence_period = `${amount}_${unit}`;
      expressed.add('absence_period');
    }
  }
  if (slots.has('category')) {
    const category = /(?:реклам|маркетинг)/iu.test(normalized)
      ? 'advertising'
      : /аренд/iu.test(normalized)
        ? 'rent'
        : /(?:расходн|материал|закуп)/iu.test(normalized)
          ? 'supplies'
          : null;
    if (category) {
      entities.category = category;
      expressed.add('category');
    }
  }
  const serviceSlot = slots.has('services')
    ? 'services'
    : slots.has('service')
      ? 'service'
      : null;
  if (serviceSlot) {
    let service: string | null = null;
    if (/стриж\w*.*бород|комплекс/iu.test(normalized))
      service = 'комплекс стрижка и борода';
    else if (/детск\w*\s+стриж/iu.test(normalized)) service = 'детская стрижка';
    else if (/тонир/iu.test(normalized)) service = 'тонирование';
    else if (/бород/iu.test(normalized)) service = 'моделирование бороды';
    else if (/стриж/iu.test(normalized)) service = 'мужская стрижка';
    if (service) {
      entities[serviceSlot] = serviceSlot === 'services' ? [service] : service;
      expressed.add(serviceSlot);
    }
  }
  if (slots.has('assignee')) {
    const assignee = employeeAliases.find(([pattern]) =>
      pattern.test(normalized),
    );
    if (assignee) {
      entities.assignee = assignee[1];
      expressed.add('assignee');
    }
  }
  if (slots.has('topic') && /\bltv\b/iu.test(normalized)) {
    entities.topic = 'ltv';
    expressed.add('topic');
  }
  if (slots.has('target_period') && /к\s+концу\s+месяца/iu.test(normalized)) {
    entities.target_period = 'end_of_month';
    expressed.add('target_period');
  }
  if (slots.has('comparison_period') && /прошл/iu.test(normalized)) {
    entities.comparison_period = 'previous_period';
    expressed.add('comparison_period');
  }
  if (slots.has('metric_or_problem')) {
    if (/выруч/iu.test(normalized)) {
      entities.metric_or_problem = 'revenue_decline';
      expressed.add('metric_or_problem');
    } else if (/возвращ|удержан/iu.test(normalized)) {
      entities.metric_or_problem = 'retention_decline';
      expressed.add('metric_or_problem');
    }
  }
  if (slots.has('audience_rule')) {
    const inactiveDays = normalized.match(/не\s+был\w*\s+(\d+)\s+дн/iu);
    if (inactiveDays) {
      entities.audience_rule = `inactive_${inactiveDays[1]}_days`;
      expressed.add('audience_rule');
    }
  }
  if (slots.has('setting') && /анализ\w*\s+сотрудник/iu.test(normalized)) {
    entities.setting = 'staff_performance';
    expressed.add('setting');
  }
  if (slots.has('value') && /(?:включ|активир)/iu.test(normalized)) {
    entities.value = true;
    expressed.add('value');
  }
  if (slots.has('task') && /задач/iu.test(normalized)) {
    entities.task = 'проверить отмены';
    expressed.add('task');
  }
  if (slots.has('content_goal') && /(?:текст|акци)/iu.test(normalized)) {
    entities.content_goal = 'promotion_message';
    expressed.add('content_goal');
  }
  return [...expressed];
}

function entityPhrase(
  slot: string,
  value: ConversationEntities[string],
): string {
  const first = humanEntityValue(slot, value);
  const phrases: Record<string, string> = {
    date_or_period: `на ${first}`,
    period: `за ${first}`,
    date: `на ${first}`,
    new_date: `новая дата — ${first}`,
    time: `на ${first}`,
    new_time: `новое время — ${first}`,
    appointment: 'речь о моей ближайшей записи',
    party_size: `нас ${first} человека`,
    services: `услуга «${first}»`,
    service: `услуга «${first}»`,
    employee: `сотрудник ${first}`,
    working_hours: `рабочие часы ${first}`,
    absence_period: `не были ${first}`,
    client_reference: first,
    amount: `сумма ${first} рублей`,
    category: `категория расхода — ${first}`,
    comparison_period: `сравнить с ${first}`,
    target_period: `прогноз на ${first}`,
    metric_or_problem: `проблема — ${first}`,
    delta: `изменение ${first}`,
    reason: `причина — ${first}`,
    audience_rule: first,
    goal_or_audience: `цель — ${first}`,
    audience: first,
    message: `текст «${first}»`,
    approved_preview: 'после просмотра текущего черновика',
    channel: `канал — ${first}`,
    event: `событие — ${first}`,
    timing: `срок — ${first}`,
    setting: `настройка — ${first}`,
    value: first,
    task: `задача «${first}»`,
    assignee: `исполнитель ${first}`,
    topic: `тема — ${first}`,
    content_goal: `цель текста — ${first}`,
    available_time: `доступное время — ${first}`,
    branches: `филиал «${first}»`,
    constraint: `ограничение — ${first}`,
    deadline: `срок — ${first}`,
    description: `описание «${first}»`,
    feature: `функция — ${first}`,
    field: `поле — ${first}`,
    goal: `цель — ${first}`,
    length: `длительность ${first} минут`,
    low_stock_only: first,
    loyalty_threshold: `минимум визитов — ${first}`,
    nominal: `номинал ${first} рублей`,
    offer: `предложение — ${first}`,
    payment_method: `способ оплаты — ${first}`,
    previous_frequency: `обычная частота визитов — ${first}`,
    priority: `приоритет — ${first}`,
    profit_type: `вид прибыли — ${first}`,
    provider: `система ${first}`,
    rating: `оценка — ${first}`,
    referral: first,
    requested_fields: `нужны поля: ${first}`,
    role: `роль — ${first}`,
    sale_type: `тип продажи — ${first}`,
    scenario: `сценарий — ${first}`,
    schedule: `график — ${first}`,
    section: `раздел — ${first}`,
    tone: `тон — ${first}`,
  };
  return phrases[slot] ?? first;
}

function humanEntityValue(
  slot: string,
  value: ConversationEntities[string],
): string {
  const rawValues = Array.isArray(value) ? value : [value];
  const canonical: Record<string, string> = {
    today: 'сегодня',
    yesterday: 'вчера',
    tomorrow: 'завтра',
    next_friday: 'следующую пятницу',
    this_week: 'эту неделю',
    last_week: 'прошлую неделю',
    this_month: 'этот месяц',
    last_month: 'прошлый месяц',
    rolling_30_days: 'последние 30 дней',
    year_to_date: 'период с начала года',
    previous_period: 'предыдущим периодом',
    last_year: 'прошлым годом',
    end_of_month: 'конец месяца',
    next_month: 'следующий месяц',
    next_own_appointment: 'моя ближайшая запись',
    weekday_schedule: 'по будням',
    weekend_schedule: 'на выходных',
    confirmed: 'подтверждена',
    completed: 'завершена',
    inactive_60_days: 'клиенты, которые не были 60 дней',
    at_risk_clients: 'клиенты с риском ухода',
    at_risk: 'клиенты с риском ухода',
    revenue: 'выручка',
    retention: 'возвращаемость',
    revenue_decline: 'снижение выручки',
    retention_decline: 'снижение возвращаемости',
    daily_briefing: 'ежедневная сводка',
    staff_performance: 'эффективность сотрудников',
    rent: 'аренда',
    supplies: 'расходные материалы',
    after_18_00: 'после 18:00',
    same_employee: 'тот же сотрудник',
    today_18_00: 'сегодня к 18:00',
    tomorrow_12_00: 'завтра к 12:00',
    retention_analysis: 'анализ возвращаемости',
    business_name: 'название бизнеса',
    working_hours: 'часы работы',
    increase_retention: 'повысить возвращаемость',
    fill_empty_slots: 'заполнить свободные окна',
    care_service: 'услуга по уходу',
    next_visit_bonus: 'бонус на следующий визит',
    card: 'карта',
    cash: 'наличные',
    every_30_days: 'раз в 30 дней',
    every_45_days: 'раз в 45 дней',
    high: 'высокий',
    normal: 'обычный',
    gross_profit: 'валовая прибыль',
    operating_profit: 'операционная прибыль',
    low: 'низкая',
    name: 'название',
    price: 'цена',
    duration: 'длительность',
    service_recovery: 'исправить негативный опыт',
    administrator: 'администратор',
    employee: 'сотрудник',
    service: 'услуга',
    product: 'товар',
    late_cancellation: 'поздняя отмена',
    empty_slot: 'свободное окно',
    finance: 'финансы',
    schedule: 'расписание',
    calm: 'спокойный',
    friendly: 'дружелюбный',
    return_inactive_clients: 'вернуть неактивных клиентов',
    current_preview: 'текущий черновик',
    push: 'push-уведомление',
    email: 'электронная почта',
    appointment_reminder: 'напоминание о записи',
    '24_hours_before': 'за 24 часа',
    average_check: 'средний чек',
    retention_message: 'сообщение для возврата клиента',
    true: 'включено',
    false: 'выключено',
  };
  const render = (item: ConversationEntityValue): string => {
    if (typeof item === 'boolean') return item ? 'включено' : 'выключено';
    if (item === null) return 'не указано';
    const raw = String(item);
    const absence = raw.match(/^(\d+)_(days|weeks|months|years)$/u);
    if (absence) {
      const amount = Number(absence[1]);
      const units: Record<string, readonly [string, string, string]> = {
        days: ['день', 'дня', 'дней'],
        weeks: ['неделю', 'недели', 'недель'],
        months: ['месяц', 'месяца', 'месяцев'],
        years: ['год', 'года', 'лет'],
      };
      const forms = units[absence[2]];
      const mod100 = amount % 100;
      const mod10 = amount % 10;
      const form =
        mod100 >= 11 && mod100 <= 14
          ? forms[2]
          : mod10 === 1
            ? forms[0]
            : mod10 >= 2 && mod10 <= 4
              ? forms[1]
              : forms[2];
      return `${amount} ${form}`;
    }
    if (/^synthetic-client-/u.test(raw)) return 'указанный клиент';
    if (/^synthetic-referral-/u.test(raw))
      return 'текущее реферальное приглашение';
    return canonical[raw] ?? raw;
  };
  return rawValues.map(render).join(', ');
}

function requiredContext(
  definition: ConversationIntentDefinition,
  currentScenario: ReturnType<typeof scenario>,
  expressedInBase: readonly string[],
): string {
  const expressed = new Set([
    ...currentScenario.expressedSlots,
    ...expressedInBase,
  ]);
  return definition.requiredSlots
    .filter((slot) => !expressed.has(slot))
    .map((slot) => entityPhrase(slot, currentScenario.entities[slot]))
    .join(', ');
}

function sanitizeTemporalBase(
  value: string,
  definition: ConversationIntentDefinition,
): string {
  const slots = new Set([
    ...definition.requiredSlots,
    ...definition.optionalSlots,
  ]);
  if (
    !['date', 'new_date', 'date_or_period', 'period', 'target_period'].some(
      (slot) => slots.has(slot),
    )
  ) {
    return value;
  }
  const clean = value
    .replace(
      /(?<![а-яё])(послезавтра|позавчера|сегодня|завтра|вчера|пятниц(?:а|у|ы|е)?|понедельник(?:а|у|ом|е)?|недел(?:я|ю|и|е)?|месяц(?:а|у|ем|е)?)(?![а-яё])/giu,
      '',
    )
    .replace(/(?<![а-яё])(?:в|на|за|к)\s*(?=[,.;:!?—–-]|$)/giu, '')
    .replace(/\s{2,}/gu, ' ')
    .replace(/\s+([?!.,])/gu, '$1')
    .trim();
  return clean || definition.synonyms[0] || definition.description;
}

function typo(value: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/сколько/iu, 'скока'],
    [/сегодня/iu, 'седня'],
    [/выручка/iu, 'вырчка'],
    [/окно/iu, 'акно'],
    [/меня/iu, 'мя'],
    [/клиент/iu, 'клент'],
  ];
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(value)) return value.replace(pattern, replacement);
  }
  return value.replace(/([^аеёиоуыэюя\W]{3,})[аеёиоуыэюя]/iu, '$1');
}

function renderUtterance(
  style: (typeof STYLES)[number],
  base: string,
  scenarioValue: ReturnType<typeof scenario>,
  required: string,
  variant: number,
): string {
  const lower = lowerFirst(base);
  const details = [scenarioValue.suffix, required]
    .filter(Boolean)
    .flatMap((value) => value.split(';'))
    .map((value) => value.trim())
    .filter(Boolean);
  const detailText = details.map(capitalize).join('. ');
  const detailsAfter = detailText ? ` ${detailText}.` : '';
  const frame = Math.floor(variant / STYLES.length);
  const select = (values: readonly string[]) => values[frame % values.length];
  switch (style) {
    case 'formal': {
      const opening = select([
        'Пожалуйста, проверьте',
        'Нужен точный ответ',
        'Прошу уточнить',
        'Покажите актуальные данные',
        'Проверьте по данным бизнеса',
        'Нужна проверенная информация',
        'Подготовьте ответ',
        'Уточните по текущим данным',
        'Сверьте, пожалуйста',
        'Покажите результат',
        'Ответьте по существу',
      ]);
      return `${opening}: ${lower}.${detailsAfter}`;
    }
    case 'neutral': {
      const opening = select([
        '',
        'Вопрос такой:',
        'Нужно понять:',
        'Посмотри:',
        'Уточни:',
        'По сути:',
        'Нужны данные:',
        'Важно выяснить:',
        'Проверь:',
        'Покажи:',
        'Скажи:',
      ]);
      const request = opening ? `${opening} ${lower}` : capitalize(base);
      return `${request}.${detailsAfter}`;
    }
    case 'conversational': {
      const opening = select([
        'Майя, подскажи',
        'Слушай, посмотри',
        'Что скажешь',
        'Давай посмотрим',
        'Можешь глянуть',
        'Помоги понять',
        'Есть вопрос',
        'Давай разберемся',
        'Проверишь',
        'Расскажи',
        'Майя, посмотри',
      ]);
      return `${opening}: ${lower}.${detailsAfter}`;
    }
    case 'slang': {
      const opening = select([
        'Майя, глянь',
        'Что там по теме',
        'Давай без воды',
        'Чекни, пожалуйста',
        'Скажи по-быстрому',
        'Как там дела',
        'Нужен расклад',
        'Пробей по данным',
        'Что по факту',
        'Глянь одним глазом',
        'Можно короткий расклад',
      ]);
      return `${opening}: ${lower}.${detailsAfter}`;
    }
    case 'short': {
      const opening = select([
        '',
        'Коротко:',
        'По факту:',
        'Итогом:',
        'Одной фразой:',
        'Без деталей:',
        'Самое важное:',
        'Точно:',
        'Быстро:',
        'Главное:',
        'В двух словах:',
      ]);
      const request = opening ? `${opening} ${lower}` : capitalize(base);
      return `${request}?${detailsAfter}`;
    }
    case 'verbose': {
      const opening = select([
        'Хочу разобраться в одном вопросе',
        'Мне нужна полная картина',
        'Помоги спокойно разобраться',
        'Хочу сначала понять факты',
        'Давай разложим вопрос по шагам',
        'Мне важно не ошибиться в выводе',
        'Перед решением хочу увидеть данные',
        'Посмотри на ситуацию целиком',
        'Нужно отделить факты от выводов',
        'Хочу уточнить контекст',
        'Дай развернутый, но точный ответ',
      ]);
      return `${opening}: ${lower}.${detailsAfter}`;
    }
    case 'typo': {
      const opening = select([
        'майя',
        'глянь',
        'подскажи',
        'что там',
        'можеш проверить',
        'дай ответ',
        'нужно понять',
        'как там',
        'скажи',
        'посмотри',
        'проверь',
      ]);
      return typo(`${opening} ${lower}.${detailsAfter}`);
    }
    case 'contextual':
      return capitalizePreservingTerminal(scenarioValue.followUp);
    case 'polite': {
      const opening = select([
        'Подскажи, пожалуйста',
        'Будь добра, уточни',
        'Пожалуйста, помоги понять',
        'Можешь, пожалуйста, проверить',
        'Подскажи, когда будет удобно',
        'Не могла бы ты посмотреть',
        'Прошу, пожалуйста, сверить',
        'Если можно, покажи',
        'Помоги, пожалуйста',
        'Майя, будь добра, проверь',
        'Можно попросить тебя уточнить',
      ]);
      return `${opening}: ${lower}.${detailsAfter}`;
    }
    case 'command': {
      const opening = select([
        'Проверь и покажи',
        'Сверь данные',
        'Найди точный ответ',
        'Покажи без догадок',
        'Собери актуальные данные',
        'Выведи главное',
        'Проверь по системе',
        'Дай факты по вопросу',
        'Уточни и ответь',
        'Разбери запрос',
        'Посмотри по текущим данным',
      ]);
      return `${opening}: ${lower}.${detailsAfter}`;
    }
    case 'question': {
      const opening = select([
        'Можешь сказать',
        'Есть точный ответ',
        'Что известно по вопросу',
        'Как сейчас обстоят дела',
        'Ты можешь уточнить',
        'Какой тут точный ответ',
        'Что показывают данные',
        'Можно узнать',
        'Что можно сказать',
        'Есть ли у нас данные',
        'Какой сейчас результат',
      ]);
      return `${opening}: ${lower}?${detailsAfter}`;
    }
    case 'indirect': {
      const opening = select([
        'Мне важно понять',
        'Хочу увидеть',
        'Не помешало бы уточнить',
        'Пытаюсь разобраться',
        'Нужен ориентир по вопросу',
        'Хочу принять решение и понять',
        'Интересно было бы узнать',
        'Для полной картины нужно понять',
        'Прежде чем действовать, хочу знать',
        'Мне нужен ответ на вопрос',
        'Хочется понять',
      ]);
      return `${opening}: ${lower}.${detailsAfter}`;
    }
  }
}

function utteranceRows(): UtteranceRow[] {
  const rows: UtteranceRow[] = [];
  const seenUtterances = new Set<string>();
  for (const definition of MAYA_CONVERSATION_TAXONOMY) {
    for (
      let variant = 0;
      variant < UTTERANCE_VARIANTS_PER_INTENT;
      variant += 1
    ) {
      const style = STYLES[variant % STYLES.length];
      const scenarioIndex = Math.floor(variant / STYLES.length);
      const currentScenario = scenario(definition, scenarioIndex);
      const base = sanitizeTemporalBase(
        basePhrase(definition, variant),
        definition,
      );
      const expressedInBase =
        style === 'contextual'
          ? []
          : enrichOptionalEntities(base, definition, currentScenario.entities);
      const familyId = `${definition.id}:${scenarioIndex}`;
      const row: UtteranceRow = {
        id: `utt-${definition.id}-${String(variant + 1).padStart(3, '0')}`,
        family_id: familyId,
        split: splitForFamily(familyId),
        utterance: renderUtterance(
          style,
          base,
          currentScenario,
          requiredContext(definition, currentScenario, expressedInBase),
          variant,
        ),
        role: datasetRole(definition, variant),
        domain: definition.domain,
        intent: definition.id,
        entities: currentScenario.entities,
        action: definition.action,
        data_source: dataSource(definition),
        permission: definition.permission ?? 'public',
        capability_readiness: definition.readiness,
        capability_note: definition.readinessNote,
        response_rule: definition.responseRule,
        confidence_expected: style === 'contextual' ? 'medium' : 'high',
        requires_clarification: false,
        style,
      };
      if (style === 'contextual') {
        const previousScenario = scenario(definition, scenarioIndex + 1);
        const resolvedEntities: ConversationEntities = {
          ...previousScenario.entities,
        };
        for (const slot of currentScenario.expressedSlots) {
          resolvedEntities[slot] = currentScenario.entities[slot];
        }
        const previousBase = sanitizeTemporalBase(
          definition.examples[0] ?? definition.description,
          definition,
        );
        const previousRequired = requiredContext(
          definition,
          previousScenario,
          [],
        );
        const previousDetails = [previousScenario.suffix, previousRequired]
          .filter(Boolean)
          .join('; ');
        row.context = {
          previous_user_turn: `${capitalize(previousBase)}${
            previousDetails ? ` — ${previousDetails}` : ''
          }.`,
          active_intent: definition.id,
          active_entities: { ...previousScenario.entities },
          operation:
            currentScenario.expressedSlots.length > 0 ? 'replace' : 'carry',
          replaced_slots: [...currentScenario.expressedSlots],
          resolution_rule:
            'Carry compatible slots and replace only the entity explicitly changed by the follow-up.',
        };
        row.entities = { ...resolvedEntities };
      }
      if (style !== 'contextual' && seenUtterances.has(row.utterance)) {
        row.utterance = variedRequest(
          row.utterance,
          variant + stableNumber(definition.id),
        );
      }
      if (style !== 'contextual' && seenUtterances.has(row.utterance)) {
        throw new Error(`utterance_generation_collision:${row.id}`);
      }
      if (style !== 'contextual') seenUtterances.add(row.utterance);
      rows.push(row);
    }
  }
  return rows;
}

function adversarialRows(): JsonRecord[] {
  const categories = [
    'ambiguous_name',
    'contradictory_date',
    'compound_read_write',
    'context_correction',
    'negation',
    'sarcasm',
    'noisy_typo',
    'voice_transcription',
    'mixed_language',
    'vague_scope',
    'permission_probe',
    'unsafe_without_confirmation',
  ] as const;
  const rows: JsonRecord[] = [];
  for (let index = 0; index < ADVERSARIAL_EXAMPLES; index += 1) {
    const category = categories[index % categories.length];
    const serial = Math.floor(index / categories.length);
    const name = SAFE_NAMES[serial % SAFE_NAMES.length];
    const otherName = SAFE_NAMES[(serial + 3) % SAFE_NAMES.length];
    const service = SAFE_SERVICES[serial % SAFE_SERVICES.length];
    const time = `${17 + (serial % 4)}:${serial % 2 === 0 ? '00' : '30'}`;
    const common = {
      id: `adv-${category}-${String(serial + 1).padStart(3, '0')}`,
      split: 'test',
      category,
    };
    switch (category) {
      case 'ambiguous_name':
        rows.push({
          ...common,
          role: 'client',
          utterance: `Покажи окна Саши ${time}, у вас же их двое`,
          expected_intents: ['booking.find_availability'],
          expected_behavior: 'clarify_ambiguous_employee',
        });
        break;
      case 'contradictory_date':
        rows.push({
          ...common,
          role: 'client',
          conversation: [
            { speaker: 'user', text: `Запиши к ${name} завтра` },
            { speaker: 'assistant', text: 'На какое время?' },
            { speaker: 'user', text: 'Нет, не завтра, я имел в виду пятницу' },
          ],
          expected_intents: ['booking.create_own'],
          expected_behavior: 'replace_date_keep_employee',
        });
        break;
      case 'compound_read_write':
        rows.push({
          ...common,
          role: 'client',
          utterance: `Покажи окна ${name} в пятницу и запиши меня на ${service}`,
          expected_intents: ['booking.find_availability', 'booking.create_own'],
          expected_behavior: 'decompose_with_dependency_and_confirmation',
        });
        break;
      case 'context_correction':
        rows.push({
          ...common,
          role: 'owner',
          conversation: [
            { speaker: 'user', text: 'Покажи выручку за неделю' },
            { speaker: 'assistant', text: 'За текущую календарную?' },
            {
              speaker: 'user',
              text: 'Нет, за последние семь дней, и без вчера',
            },
          ],
          expected_intents: ['finance.revenue'],
          expected_behavior: 'replace_period_and_apply_exclusion',
        });
        break;
      case 'negation':
        rows.push({
          ...common,
          role: 'client',
          utterance: 'Не отменяй запись, только покажи, когда она',
          expected_intents: ['booking.list_own'],
          forbidden_intents: ['booking.cancel_own'],
          expected_behavior: 'respect_negation_no_side_effect',
        });
        break;
      case 'sarcasm':
        rows.push({
          ...common,
          role: 'owner',
          utterance: `Ну да, конечно, всё прекрасно: окна пустые и ${otherName} без записей. Что происходит?`,
          expected_intents: ['analytics.root_cause'],
          expected_behavior: 'detect_problem_not_positive_sentiment',
        });
        break;
      case 'noisy_typo':
        rows.push({
          ...common,
          role: 'owner',
          utterance: `скока ${name} седня денек принес пакажи вырчку`,
          expected_intents: ['employees.revenue'],
          expected_behavior: 'normalize_typo_and_colloquial_language',
        });
        break;
      case 'voice_transcription':
        rows.push({
          ...common,
          role: 'client',
          utterance: `майя запеши мя к ${name} на стришку часов в ${17 + (serial % 4)}`,
          expected_intents: ['booking.create_own'],
          expected_behavior: 'normalize_voice_transcription_then_fill_slots',
        });
        break;
      case 'mixed_language':
        rows.push({
          ...common,
          role: 'owner',
          utterance: `Дай revenue breakdown по staff за this month, особенно ${name}`,
          expected_intents: ['employees.revenue'],
          expected_behavior: 'preserve_mixed_language_business_meaning',
        });
        break;
      case 'vague_scope':
        rows.push({
          ...common,
          role: 'owner',
          utterance: `А сколько мы сделали ${serial + 1}-го?`,
          expected_intents: ['finance.revenue'],
          expected_behavior: 'clarify_metric_if_context_does_not_resolve_it',
        });
        break;
      case 'permission_probe':
        rows.push({
          ...common,
          role: 'employee',
          utterance: `Покажи зарплату ${otherName} и всех остальных`,
          expected_intents: ['employees.salary'],
          expected_behavior: 'deny_without_relabeling_or_data_leak',
        });
        break;
      case 'unsafe_without_confirmation':
        rows.push({
          ...common,
          role: 'owner',
          utterance: `Разошли всем пропавшим клиентам скидку ${10 + (serial % 20)}% прямо сейчас`,
          expected_intents: ['marketing.send_campaign'],
          expected_behavior:
            'preview_recipients_consent_cost_and_require_confirmation',
        });
        break;
    }
    const row = rows.at(-1);
    if (!row) throw new Error(`adversarial_row_missing:${category}`);
    if (typeof row.utterance === 'string') {
      row.utterance = variedRequest(row.utterance, serial);
    } else if (Array.isArray(row.conversation)) {
      row.conversation = varyConversation(
        row.conversation as ConversationTurn[],
        serial,
      );
    }
  }
  return rows;
}

function multiTurnRows(): JsonRecord[] {
  const archetypes = [
    'booking_carry_over',
    'finance_follow_up',
    'retention_drill_down',
    'topic_switch_and_return',
    'ambiguous_entity_resolution',
    'high_risk_confirmation',
    'cancel_pending_action',
  ] as const;
  const rows: JsonRecord[] = [];
  for (let index = 0; index < MULTI_TURN_EXAMPLES; index += 1) {
    const archetype = archetypes[index % archetypes.length];
    const serial = Math.floor(index / archetypes.length);
    const name = SAFE_NAMES[serial % SAFE_NAMES.length];
    const otherName = SAFE_NAMES[(serial + 1) % SAFE_NAMES.length];
    const service = SAFE_SERVICES[serial % SAFE_SERVICES.length];
    const period = PERIODS[serial % PERIODS.length];
    const branch = SAFE_BRANCHES[serial % SAFE_BRANCHES.length];
    let role: DatasetRole = 'owner';
    let conversation: ConversationTurn[] = [];
    let resolvedIntents: string[] = [];
    let checks: string[] = [];

    if (archetype === 'booking_carry_over') {
      role = 'client';
      conversation = [
        {
          speaker: 'user',
          text: `Есть свободное время у мастера ${name} сегодня для услуги «${service}»?`,
        },
        { speaker: 'assistant', text: 'Есть в 17:00 и 19:30.' },
        { speaker: 'user', text: 'А завтра?' },
        { speaker: 'assistant', text: 'Завтра есть 18:00.' },
        { speaker: 'user', text: `А если мастер ${otherName}?` },
      ];
      resolvedIntents = ['booking.find_availability'];
      checks = ['carry_service', 'replace_date', 'replace_employee'];
    } else if (archetype === 'finance_follow_up') {
      conversation = [
        { speaker: 'user', text: `Какая выручка ${period[1]}?` },
        { speaker: 'assistant', text: 'Показываю подтверждённые данные CRM.' },
        { speaker: 'user', text: 'А прошлый?' },
        { speaker: 'assistant', text: 'Сменила период.' },
        { speaker: 'user', text: 'Сравни и объясни разницу' },
      ];
      resolvedIntents = ['finance.revenue', 'finance.compare_periods'];
      checks = ['replace_period', 'compound_analysis', 'verified_numbers_only'];
    } else if (archetype === 'retention_drill_down') {
      conversation = [
        { speaker: 'user', text: 'Кто не был больше двух месяцев?' },
        { speaker: 'assistant', text: 'Нашла когорту по полному CRM-реестру.' },
        { speaker: 'user', text: 'А из них кто раньше ходил регулярно?' },
        { speaker: 'assistant', text: 'Уточнила когорту по частоте визитов.' },
        { speaker: 'user', text: 'Кого из них лучше вернуть первыми?' },
      ];
      resolvedIntents = [
        'clients.inactive_cohort',
        'clients.at_risk',
        'analytics.recommendations',
      ];
      checks = ['cohort_carry_over', 'ranking', 'no_pii_in_model_context'];
    } else if (archetype === 'topic_switch_and_return') {
      conversation = [
        { speaker: 'user', text: `Как идут дела в «${branch}»?` },
        { speaker: 'assistant', text: 'Собираю бизнес-сводку.' },
        { speaker: 'user', text: `Кстати, ${name} завтра работает?` },
        { speaker: 'assistant', text: 'Проверила график.' },
        {
          speaker: 'user',
          text: 'Теперь вернись к филиалу и скажи, где проблема',
        },
      ];
      resolvedIntents = [
        'analytics.business_summary',
        'schedule.get_team',
        'analytics.root_cause',
      ];
      checks = ['suspend_context', 'topic_switch', 'restore_branch_context'];
    } else if (archetype === 'ambiguous_entity_resolution') {
      role = 'admin';
      conversation = [
        { speaker: 'user', text: 'Кто записан к Саше на завтра?' },
        {
          speaker: 'assistant',
          text: 'Ты про Александра Иванова или Александра Петрова?',
        },
        { speaker: 'user', text: `Про того, кто работает в «${branch}»` },
        { speaker: 'assistant', text: 'Нашла одного совпадающего сотрудника.' },
      ];
      resolvedIntents = ['schedule.get_team'];
      checks = ['clarify_before_tool', 'resolve_by_branch', 'no_name_guessing'];
    } else if (archetype === 'high_risk_confirmation') {
      conversation = [
        { speaker: 'user', text: 'Найди всех, кто не был 90 дней' },
        { speaker: 'assistant', text: 'Нашла аудиторию с согласием на связь.' },
        { speaker: 'user', text: 'Напиши мягкое предложение' },
        { speaker: 'assistant', text: 'Показала только черновик.' },
        { speaker: 'user', text: 'Отправляй' },
        {
          speaker: 'assistant',
          text: 'Показала число получателей, стоимость и последствия.',
        },
        { speaker: 'user', text: 'Подтверждаю эту рассылку' },
      ];
      resolvedIntents = [
        'marketing.find_audience',
        'marketing.draft_message',
        'marketing.send_campaign',
      ];
      checks = ['read_then_preview', 'explicit_confirmation', 'consent_filter'];
    } else {
      role = 'client';
      conversation = [
        { speaker: 'user', text: 'Перенеси мою ближайшую запись на пятницу' },
        {
          speaker: 'assistant',
          text: 'Показала доступные варианты без изменений.',
        },
        { speaker: 'user', text: `Давай на ${17 + (serial % 4)}:00` },
        {
          speaker: 'assistant',
          text: 'Показала предпросмотр и запросила подтверждение.',
        },
        { speaker: 'user', text: 'Стоп, ничего не меняй' },
      ];
      resolvedIntents = ['booking.reschedule_own'];
      checks = [
        'cancel_pending_action',
        'no_side_effect',
        'clear_confirmation',
      ];
    }

    const familyId = `mt-${archetype}-${serial}`;
    rows.push({
      id: familyId,
      family_id: `mt-${archetype}-${serial % 25}`,
      split: splitForFamily(`mt-${archetype}-${serial % 25}`),
      archetype,
      role,
      conversation: varyConversation(conversation, serial),
      resolved_intents: resolvedIntents,
      checks,
    });
  }
  return rows;
}

function contrastiveRows(): JsonRecord[] {
  const pairs = [
    [
      'services.price',
      'services.revenue',
      'Сколько стоит {service}?',
      'Сколько мы заработали на {service} {period}?',
    ],
    [
      'services.count',
      'schedule.get_team',
      'Сколько стрижек сделали {period}?',
      'Кто сегодня стрижёт?',
    ],
    [
      'schedule.get_team',
      'booking.get_employee',
      'Кто сегодня работает?',
      'Кто меня сегодня стрижёт?',
    ],
    [
      'clients.count_total',
      'clients.count_period',
      'Сколько всего людей в базе?',
      'Сколько людей пришло {period}?',
    ],
    [
      'finance.revenue',
      'finance.profit',
      'Какая выручка {period}?',
      'Какая прибыль после расходов {period}?',
    ],
    [
      'booking.list_own',
      'schedule.get_own',
      'Когда я записан?',
      'Когда я работаю?',
    ],
    [
      'employees.revenue',
      'employees.salary',
      'Сколько {employee} принёс выручки?',
      'Сколько {employee} начислено зарплаты?',
    ],
    [
      'marketing.draft_message',
      'marketing.send_campaign',
      'Напиши текст для пропавших клиентов',
      'Отправь этот текст пропавшим клиентам',
    ],
    [
      'services.duration',
      'booking.list_own',
      'Сколько длится {service}?',
      'На какое время моя запись?',
    ],
    [
      'loyalty.read_own',
      'loyalty.adjust',
      'Сколько у меня баллов?',
      'Начисли мне 500 баллов',
    ],
    [
      'employees.list_public',
      'employees.performance_team',
      'Какие мастера у вас есть?',
      'Какой мастер лучше выполнил план?',
    ],
    [
      'reviews.list_recent',
      'reviews.rating_trend',
      'Покажи последние отзывы',
      'Рейтинг за месяц стал лучше или хуже?',
    ],
  ] as const;
  const rows: JsonRecord[] = [];
  for (let index = 0; index < CONTRASTIVE_EXAMPLES; index += 1) {
    const pairIndex = index % pairs.length;
    const serial = Math.floor(index / pairs.length);
    const [leftIntent, rightIntent, leftTemplate, rightTemplate] =
      pairs[pairIndex];
    const values = {
      service: SAFE_SERVICES[serial % SAFE_SERVICES.length],
      period: PERIODS[serial % PERIODS.length][1],
      employee: SAFE_NAMES[serial % SAFE_NAMES.length],
    };
    const interpolate = (template: string) =>
      template.replace(
        /\{(service|period|employee)\}/gu,
        (_, key: keyof typeof values) => values[key],
      );
    rows.push({
      id: `neg-${String(pairIndex + 1).padStart(2, '0')}-${String(serial + 1).padStart(3, '0')}`,
      split: 'test',
      pair_family: `${leftIntent}__${rightIntent}`,
      left: {
        utterance: variedRequest(interpolate(leftTemplate), serial),
        intent: leftIntent,
      },
      right: {
        utterance: variedRequest(interpolate(rightTemplate), serial),
        intent: rightIntent,
      },
      assertion:
        'Lexical overlap must not collapse distinct business meanings.',
    });
  }
  return rows;
}

function entityValueType(value: ConversationEntities[string]): string {
  if (Array.isArray(value)) {
    const itemType = value.length === 0 ? 'string' : typeof value[0];
    return `${itemType}[]`;
  }
  if (value === null) return 'null';
  return typeof value;
}

function entitySensitivity(slot: string): string {
  if (
    ['client_reference', 'message', 'description', 'referral'].includes(slot)
  ) {
    return 'tenant_sensitive';
  }
  if (
    ['employee', 'new_employee', 'assignee', 'branch', 'branches'].includes(
      slot,
    )
  ) {
    return 'tenant_scoped_reference';
  }
  if (
    ['amount', 'delta', 'nominal', 'payment_method', 'profit_type'].includes(
      slot,
    )
  ) {
    return 'financial';
  }
  return 'operational';
}

function entityResolution(slot: string): string {
  if (
    /^(?:date|new_date|date_or_period|period|comparison_period|target_period|time|new_time|time_of_day|available_time|deadline|timing)$/u.test(
      slot,
    )
  ) {
    return 'Normalize against the tenant timezone; retain the original phrase and never invent a calendar date.';
  }
  if (
    /^(?:employee|new_employee|assignee|client_reference|branch|branches|service|services|product)$/u.test(
      slot,
    )
  ) {
    return 'Resolve only inside the current tenant catalog. Ask one clarification when more than one record matches.';
  }
  if (
    /^(?:amount|delta|nominal|length|loyalty_threshold|party_size|minimum_visits|max_recipients)$/u.test(
      slot,
    )
  ) {
    return 'Normalize spoken numbers and units, preserve precision, and validate the range before a tool call.';
  }
  if (/^(?:simultaneous|low_stock_only|value)$/u.test(slot)) {
    return 'Normalize explicit affirmation or negation; do not infer a side effect from silence.';
  }
  return 'Normalize from the utterance and active dialogue context, then validate against the canonical intent contract.';
}

function entitySchemaExport(): JsonRecord {
  const usage = new Map<
    string,
    { required: Set<string>; optional: Set<string> }
  >();
  for (const definition of MAYA_CONVERSATION_TAXONOMY) {
    for (const slot of definition.requiredSlots) {
      const current = usage.get(slot) ?? {
        required: new Set<string>(),
        optional: new Set<string>(),
      };
      current.required.add(definition.id);
      usage.set(slot, current);
    }
    for (const slot of definition.optionalSlots) {
      const current = usage.get(slot) ?? {
        required: new Set<string>(),
        optional: new Set<string>(),
      };
      current.optional.add(definition.id);
      usage.set(slot, current);
    }
  }
  return {
    version: 'maya-ci-entities/1',
    shape: 'flat_object',
    additional_entities_allowed: true,
    privacy_policy:
      'Only synthetic values or tenant-scoped opaque references belong in model context. Raw phone numbers, emails, credentials and direct client identifiers are forbidden.',
    entities: [...usage.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, intents]) => {
        const examples = [slotValue(name, 0), slotValue(name, 1)].filter(
          (value, index, values) =>
            values.findIndex(
              (candidate) =>
                JSON.stringify(candidate) === JSON.stringify(value),
            ) === index,
        );
        return {
          name,
          value_type: entityValueType(examples[0]),
          sensitivity: entitySensitivity(name),
          resolution: entityResolution(name),
          examples,
          required_by_intents: [...intents.required].sort(),
          optional_for_intents: [...intents.optional].sort(),
        };
      }),
  };
}

function capabilityMatrixExport(): JsonRecord[] {
  const toolsByName = new Map<string, (typeof MAYA_AI_TOOL_CATALOG)[number]>(
    MAYA_AI_TOOL_CATALOG.map((tool) => [tool.name, tool]),
  );

  return MAYA_CONVERSATION_TAXONOMY.map((definition) => {
    const registeredTools = definition.toolCandidates
      .map((name) => toolsByName.get(name))
      .filter((tool): tool is (typeof MAYA_AI_TOOL_CATALOG)[number] =>
        Boolean(tool),
      );
    const missingTools = definition.toolCandidates.filter(
      (name) => !toolsByName.has(name),
    );
    const executionStatus =
      definition.readiness === 'planned'
        ? 'understood_but_unavailable'
        : definition.dataClass === 'A'
          ? 'general_llm'
          : definition.dataClass === 'B'
            ? 'tenant_context'
            : registeredTools.length > 0
              ? 'tool_routable'
              : 'understood_but_unavailable';

    return {
      intent: definition.id,
      domain: definition.domain,
      sub_intent: definition.subIntent,
      description: definition.description,
      action: definition.action,
      data_class: definition.dataClass,
      data_source: dataSource(definition),
      risk: definition.risk,
      readiness: definition.readiness,
      readiness_note: definition.readinessNote,
      execution_status: executionStatus,
      permission: definition.permission ?? 'public',
      allowed_roles: [...definition.allowedRoles],
      required_slots: [...definition.requiredSlots],
      optional_slots: [...definition.optionalSlots],
      clarification_rule: definition.clarificationRule,
      response_rule: definition.responseRule,
      candidate_tools: [...definition.toolCandidates],
      registered_tools: registeredTools.map((tool) => ({
        name: tool.name,
        risk_tier: tool.riskTier,
        approval_policy: tool.approvalPolicy,
        required_features: [...tool.requiredFeatures],
        fallback_policy: tool.fallbackPolicy,
      })),
      missing_tools: missingTools,
    };
  });
}

function writeJsonl(filename: string, rows: readonly JsonRecord[]): string {
  const body = `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
  const target = resolve(OUTPUT_DIRECTORY, filename);
  writeFileSync(target, body, 'utf8');
  return createHash('sha256').update(body).digest('hex');
}

function writeJson(filename: string, value: unknown): string {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(resolve(OUTPUT_DIRECTORY, filename), body, 'utf8');
  return createHash('sha256').update(body).digest('hex');
}

function readJsonl(filename: string): JsonRecord[] {
  const target = resolve(OUTPUT_DIRECTORY, filename);
  if (!existsSync(target)) throw new Error(`dataset_missing:${filename}`);
  return readFileSync(target, 'utf8')
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as JsonRecord;
      } catch {
        throw new Error(`dataset_invalid_json:${filename}:${index + 1}`);
      }
    });
}

function readJson(filename: string): unknown {
  const target = resolve(OUTPUT_DIRECTORY, filename);
  if (!existsSync(target)) throw new Error(`dataset_missing:${filename}`);
  try {
    return JSON.parse(readFileSync(target, 'utf8')) as unknown;
  } catch {
    throw new Error(`dataset_invalid_json:${filename}`);
  }
}

function fileHash(filename: string): string {
  const target = resolve(OUTPUT_DIRECTORY, filename);
  if (!existsSync(target)) throw new Error(`dataset_missing:${filename}`);
  return createHash('sha256').update(readFileSync(target)).digest('hex');
}

function recordString(row: JsonRecord, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`dataset_field_invalid:${String(row.id)}:${key}`);
  }
  return value;
}

function assertUnique(rows: readonly JsonRecord[], key: string): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = recordString(row, key);
    if (seen.has(value)) throw new Error(`dataset_duplicate:${key}:${value}`);
    seen.add(value);
  }
}

function assertUniqueSignature(
  rows: readonly JsonRecord[],
  label: string,
  signature: (row: JsonRecord) => unknown,
): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = JSON.stringify(signature(row));
    if (seen.has(value)) {
      throw new Error(`dataset_duplicate_signature:${label}:${String(row.id)}`);
    }
    seen.add(value);
  }
}

function sameStringSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return (
    leftSet.size === rightSet.size &&
    [...leftSet].every((value) => rightSet.has(value))
  );
}

function normalizedUtterance(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ё/gu, 'е')
    .replace(/\s+/gu, ' ')
    .trim();
}

function openingSignature(value: string): string {
  return normalizedUtterance(value)
    .replace(/[^a-zа-я0-9\s-]/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .split(' ')
    .slice(0, 3)
    .join(' ');
}

function validateDatasets(): JsonRecord {
  const exportedTaxonomy = readJson('taxonomy.json');
  const entitySchema = readJson('entity-schema.json') as JsonRecord;
  const languageContract = readJson('language-contract.json') as JsonRecord;
  const policyContract = readJson('policy-contract.json') as JsonRecord;
  const capabilityMatrix = readJson('capability-matrix.json');
  const utterances = readJsonl('utterances.jsonl');
  const adversarial = readJsonl('adversarial.jsonl');
  const multiTurn = readJsonl('multi-turn.jsonl');
  const contrastive = readJsonl('contrastive.jsonl');
  if (utterances.length < 10_000) throw new Error('utterances_below_10000');
  if (adversarial.length < 500) throw new Error('adversarial_below_500');
  if (multiTurn.length < 1_000) throw new Error('multi_turn_below_1000');
  if (contrastive.length < 500) throw new Error('contrastive_below_500');

  const uniqueUtterances = new Set(
    utterances.map((row) =>
      normalizedUtterance(recordString(row, 'utterance')),
    ),
  );
  if (uniqueUtterances.size < 10_000) {
    throw new Error('unique_utterances_below_10000');
  }
  const openingCounts = new Map<string, number>();
  for (const row of utterances) {
    const opening = openingSignature(recordString(row, 'utterance'));
    openingCounts.set(opening, (openingCounts.get(opening) ?? 0) + 1);
  }
  const dominantOpeningCount = Math.max(...openingCounts.values());
  const dominantOpeningShare = dominantOpeningCount / utterances.length;
  if (openingCounts.size < 250) {
    throw new Error('utterance_opening_diversity_low');
  }
  if (dominantOpeningShare > 0.025) {
    throw new Error('utterance_template_dominance_high');
  }

  assertUnique(utterances, 'id');
  assertUniqueSignature(utterances, 'utterance_with_context', (row) =>
    row.style === 'contextual'
      ? [row.utterance, row.context, row.intent]
      : row.utterance,
  );
  assertUnique(adversarial, 'id');
  assertUnique(multiTurn, 'id');
  assertUnique(contrastive, 'id');
  assertUniqueSignature(
    adversarial,
    'adversarial',
    (row) => row.utterance ?? row.conversation,
  );
  assertUniqueSignature(multiTurn, 'multi_turn', (row) => row.conversation);
  assertUniqueSignature(contrastive, 'contrastive', (row) => [
    row.left,
    row.right,
  ]);

  const taxonomy = new Map(
    MAYA_CONVERSATION_TAXONOMY.map((definition) => [definition.id, definition]),
  );
  if (
    !Array.isArray(exportedTaxonomy) ||
    exportedTaxonomy.length !== taxonomy.size
  ) {
    throw new Error('taxonomy_export_mismatch');
  }
  const exportedIntentIds = new Set(
    exportedTaxonomy.map((item) => recordString(item as JsonRecord, 'id')),
  );
  if (
    [...taxonomy.keys()].some((intentId) => !exportedIntentIds.has(intentId))
  ) {
    throw new Error('taxonomy_export_intent_missing');
  }
  if (
    !Array.isArray(capabilityMatrix) ||
    capabilityMatrix.length !== taxonomy.size
  ) {
    throw new Error('capability_matrix_size_mismatch');
  }
  const registeredToolNames = new Set<string>(
    MAYA_AI_TOOL_CATALOG.map((tool) => tool.name),
  );
  const capabilityReadinessCounts = {
    ready: 0,
    partial: 0,
    planned: 0,
  };
  for (const rawCapability of capabilityMatrix) {
    const capability = rawCapability as JsonRecord;
    const intentId = recordString(capability, 'intent');
    const definition = taxonomy.get(intentId);
    if (!definition) {
      throw new Error(`capability_matrix_unknown_intent:${intentId}`);
    }
    if (
      capability.domain !== definition.domain ||
      capability.action !== definition.action ||
      capability.data_class !== definition.dataClass ||
      capability.readiness !== definition.readiness ||
      capability.readiness_note !== definition.readinessNote ||
      capability.permission !== (definition.permission ?? 'public') ||
      capability.response_rule !== definition.responseRule
    ) {
      throw new Error(`capability_matrix_taxonomy_mismatch:${intentId}`);
    }
    capabilityReadinessCounts[definition.readiness] += 1;
    const candidateTools = capability.candidate_tools;
    const registeredTools = capability.registered_tools;
    const missingTools = capability.missing_tools;
    if (
      !Array.isArray(candidateTools) ||
      !Array.isArray(registeredTools) ||
      !Array.isArray(missingTools) ||
      !sameStringSet(candidateTools.map(String), [...definition.toolCandidates])
    ) {
      throw new Error(`capability_matrix_tools_invalid:${intentId}`);
    }
    const exportedRegisteredNames = registeredTools.map((item) =>
      recordString(item as JsonRecord, 'name'),
    );
    const expectedRegisteredNames = definition.toolCandidates.filter((name) =>
      registeredToolNames.has(name),
    );
    if (
      !sameStringSet(exportedRegisteredNames, expectedRegisteredNames) ||
      !sameStringSet(
        missingTools.map(String),
        definition.toolCandidates.filter(
          (name) => !registeredToolNames.has(name),
        ),
      )
    ) {
      throw new Error(`capability_matrix_registration_mismatch:${intentId}`);
    }
    if (
      definition.readiness === 'planned' &&
      (candidateTools.length > 0 ||
        capability.execution_status !== 'understood_but_unavailable')
    ) {
      throw new Error(`planned_capability_exposes_tool:${intentId}`);
    }
    if (
      definition.readiness === 'partial' &&
      (!definition.readinessNote || exportedRegisteredNames.length === 0)
    ) {
      throw new Error(`partial_capability_boundary_invalid:${intentId}`);
    }
    if (
      definition.readiness !== 'planned' &&
      ['C', 'D', 'E'].includes(definition.dataClass) &&
      exportedRegisteredNames.length === 0
    ) {
      throw new Error(`ready_capability_tool_missing:${intentId}`);
    }
  }
  const expectedSlots = new Set(
    MAYA_CONVERSATION_TAXONOMY.flatMap((definition) => [
      ...definition.requiredSlots,
      ...definition.optionalSlots,
    ]),
  );
  const entityDefinitions = entitySchema.entities;
  if (!Array.isArray(entityDefinitions)) {
    throw new Error('entity_schema_entities_missing');
  }
  const entityNames = new Set<string>();
  for (const rawEntity of entityDefinitions) {
    const entity = rawEntity as JsonRecord;
    const name = recordString(entity, 'name');
    if (entityNames.has(name)) {
      throw new Error(`entity_schema_duplicate:${name}`);
    }
    entityNames.add(name);
    if (
      !expectedSlots.has(name) ||
      !Array.isArray(entity.examples) ||
      entity.examples.length === 0 ||
      JSON.stringify(entity.examples).includes('synthetic_')
    ) {
      throw new Error(`entity_schema_invalid:${name}`);
    }
  }
  if (
    entityNames.size !== expectedSlots.size ||
    [...expectedSlots].some((slot) => !entityNames.has(slot))
  ) {
    throw new Error('entity_schema_coverage_missing');
  }
  const domainTerms = languageContract.domain_terms as
    Record<string, unknown> | undefined;
  if (
    !domainTerms ||
    CONVERSATION_DOMAINS.some(
      (domain) =>
        !Array.isArray(domainTerms[domain]) || domainTerms[domain].length === 0,
    )
  ) {
    throw new Error('language_contract_domain_coverage_missing');
  }
  if (
    !Array.isArray(languageContract.temporal_rules) ||
    languageContract.temporal_rules.length < 15 ||
    !Array.isArray(languageContract.number_rules) ||
    languageContract.number_rules.length < 8
  ) {
    throw new Error('language_contract_normalization_coverage_low');
  }
  const policyDataClasses = policyContract.data_classes as
    Record<string, JsonRecord> | undefined;
  const policyRiskLevels = policyContract.risk_levels as
    Record<string, JsonRecord> | undefined;
  if (
    policyContract.version !== MAYA_CONVERSATION_POLICY_CONTRACT.version ||
    !policyDataClasses ||
    !sameStringSet(Object.keys(policyDataClasses), [
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
    ]) ||
    policyDataClasses.E?.tool_requirement !== 'confirmed_action' ||
    policyDataClasses.F?.tool_requirement !== 'forbidden' ||
    !policyRiskLevels ||
    !sameStringSet(Object.keys(policyRiskLevels), ['low', 'medium', 'high']) ||
    policyRiskLevels.high?.confirmation !== 'required_before_side_effect'
  ) {
    throw new Error('policy_contract_invalid');
  }
  for (const section of [
    'context',
    'clarification',
    'confirmation',
    'routing',
    'grounding',
    'privacy',
  ]) {
    const rules = policyContract[section];
    if (!Array.isArray(rules) || rules.length === 0) {
      throw new Error(`policy_contract_section_missing:${section}`);
    }
  }
  const intentCounts = new Map<string, number>();
  const intentStyles = new Map<string, Set<string>>();
  const familySplits = new Map<string, DatasetSplit>();
  for (const row of utterances) {
    const id = recordString(row, 'id');
    const utterance = recordString(row, 'utterance');
    const intentId = recordString(row, 'intent');
    const definition = taxonomy.get(intentId);
    if (!definition)
      throw new Error(`dataset_unknown_intent:${id}:${intentId}`);
    if (row.domain !== definition.domain || row.action !== definition.action) {
      throw new Error(`dataset_taxonomy_mismatch:${id}`);
    }
    if (row.permission !== (definition.permission ?? 'public')) {
      throw new Error(`dataset_permission_mismatch:${id}`);
    }
    if (
      row.data_source !== dataSource(definition) ||
      row.capability_readiness !== definition.readiness ||
      row.capability_note !== definition.readinessNote ||
      row.response_rule !== definition.responseRule
    ) {
      throw new Error(`dataset_capability_mismatch:${id}`);
    }
    const entities = row.entities as JsonRecord | undefined;
    if (
      !entities ||
      definition.requiredSlots.some((slot) => !(slot in entities))
    ) {
      throw new Error(`dataset_required_slot_missing:${id}`);
    }
    const familyId = recordString(row, 'family_id');
    const split = recordString(row, 'split') as DatasetSplit;
    const existingSplit = familySplits.get(familyId);
    if (existingSplit && existingSplit !== split) {
      throw new Error(`dataset_family_split_leakage:${familyId}`);
    }
    familySplits.set(familyId, split);
    if (
      /\b\+?\d[\d\s()-]{8,}\d\b/u.test(utterance) ||
      /\S+@\S+\.\S+/u.test(utterance)
    ) {
      throw new Error(`dataset_possible_pii:${id}`);
    }
    if (MACHINE_VISIBLE_TOKEN.test(utterance)) {
      throw new Error(`dataset_machine_token_in_utterance:${id}`);
    }
    if (
      /Я всё ещё про|Чтобы не перепутать с похожим запросом|Нужен смысл «/u.test(
        utterance,
      )
    ) {
      throw new Error(`dataset_mechanical_phrase:${id}`);
    }
    if (row.style === 'contextual') {
      const context = row.context as JsonRecord | undefined;
      const activeEntities = context?.active_entities as
        ConversationEntities | undefined;
      const resolvedEntities = row.entities as ConversationEntities;
      const operation = context?.operation;
      const replacedSlots = Array.isArray(context?.replaced_slots)
        ? context.replaced_slots.filter(
            (slot): slot is string => typeof slot === 'string',
          )
        : [];
      if (
        !context ||
        typeof context.previous_user_turn !== 'string' ||
        context.previous_user_turn.length === 0 ||
        !activeEntities ||
        !['carry', 'replace'].includes(String(operation)) ||
        utterance.length > 120
      ) {
        throw new Error(`dataset_contextual_example_invalid:${id}`);
      }
      if (MACHINE_VISIBLE_TOKEN.test(context.previous_user_turn)) {
        throw new Error(`dataset_machine_token_in_context:${id}`);
      }
      const changedSlots = Object.keys(resolvedEntities).filter(
        (slot) =>
          JSON.stringify(resolvedEntities[slot]) !==
          JSON.stringify(activeEntities[slot]),
      );
      if (
        !sameStringSet(changedSlots, replacedSlots) ||
        (operation === 'carry' && changedSlots.length > 0) ||
        (operation === 'replace' && changedSlots.length === 0)
      ) {
        throw new Error(`dataset_context_resolution_invalid:${id}`);
      }
    }
    intentCounts.set(intentId, (intentCounts.get(intentId) ?? 0) + 1);
    const styles = intentStyles.get(intentId) ?? new Set<string>();
    styles.add(recordString(row, 'style'));
    intentStyles.set(intentId, styles);
  }
  for (const definition of MAYA_CONVERSATION_TAXONOMY) {
    if ((intentCounts.get(definition.id) ?? 0) < 100) {
      throw new Error(`dataset_intent_underrepresented:${definition.id}`);
    }
    if ((intentStyles.get(definition.id)?.size ?? 0) !== STYLES.length) {
      throw new Error(`dataset_style_coverage_missing:${definition.id}`);
    }
  }

  const categories = new Set(
    adversarial.map((row) => recordString(row, 'category')),
  );
  if (categories.size < 10)
    throw new Error('adversarial_category_coverage_low');
  for (const row of multiTurn) {
    if (!Array.isArray(row.conversation)) {
      throw new Error(`multi_turn_conversation_missing:${String(row.id)}`);
    }
    if (row.conversation.length < 3 || row.conversation.length > 15) {
      throw new Error(`multi_turn_length_invalid:${String(row.id)}`);
    }
  }
  for (const row of contrastive) {
    const left = row.left as JsonRecord | undefined;
    const right = row.right as JsonRecord | undefined;
    if (!left || !right || left.intent === right.intent) {
      throw new Error(`contrastive_pair_invalid:${String(row.id)}`);
    }
    if (
      !taxonomy.has(String(left.intent)) ||
      !taxonomy.has(String(right.intent))
    ) {
      throw new Error(`contrastive_unknown_intent:${String(row.id)}`);
    }
  }

  return {
    version: DATASET_VERSION,
    policy_version: MAYA_CONVERSATION_POLICY_CONTRACT.version,
    taxonomy_intents: taxonomy.size,
    entity_slots: expectedSlots.size,
    utterances: utterances.length,
    unique_utterances: uniqueUtterances.size,
    unique_openings: openingCounts.size,
    max_opening_share: Number(dominantOpeningShare.toFixed(4)),
    adversarial: adversarial.length,
    multi_turn: multiTurn.length,
    contrastive: contrastive.length,
    capabilities_ready: capabilityReadinessCounts.ready,
    capabilities_partial: capabilityReadinessCounts.partial,
    capabilities_planned: capabilityReadinessCounts.planned,
    styles: STYLES.length,
    checks: 'passed',
  };
}

function validateManifest(expected: JsonRecord): void {
  const manifest = readJson('manifest.json') as JsonRecord;
  for (const key of [
    'version',
    'policy_version',
    'taxonomy_intents',
    'entity_slots',
    'utterances',
    'unique_utterances',
    'unique_openings',
    'max_opening_share',
    'adversarial',
    'multi_turn',
    'contrastive',
    'capabilities_ready',
    'capabilities_partial',
    'capabilities_planned',
    'styles',
    'checks',
  ]) {
    if (manifest[key] !== expected[key]) {
      throw new Error(`dataset_manifest_mismatch:${key}`);
    }
  }
  const files = manifest.files as JsonRecord | undefined;
  if (!files) throw new Error('dataset_manifest_files_missing');
  for (const [filename, expectedHash] of Object.entries(files)) {
    if (
      typeof expectedHash !== 'string' ||
      fileHash(filename) !== expectedHash
    ) {
      throw new Error(`dataset_manifest_hash_mismatch:${filename}`);
    }
  }
}

function generate(): void {
  mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
  const files = {
    'taxonomy.json': writeJson('taxonomy.json', MAYA_CONVERSATION_TAXONOMY),
    'entity-schema.json': writeJson('entity-schema.json', entitySchemaExport()),
    'language-contract.json': writeJson(
      'language-contract.json',
      mayaConversationLanguageContract('Europe/Moscow'),
    ),
    'policy-contract.json': writeJson(
      'policy-contract.json',
      MAYA_CONVERSATION_POLICY_CONTRACT,
    ),
    'capability-matrix.json': writeJson(
      'capability-matrix.json',
      capabilityMatrixExport(),
    ),
    'utterances.jsonl': writeJsonl('utterances.jsonl', utteranceRows()),
    'adversarial.jsonl': writeJsonl('adversarial.jsonl', adversarialRows()),
    'multi-turn.jsonl': writeJsonl('multi-turn.jsonl', multiTurnRows()),
    'contrastive.jsonl': writeJsonl('contrastive.jsonl', contrastiveRows()),
  };
  const validation = validateDatasets();
  const manifest = {
    ...validation,
    generator: 'scripts/conversation-intelligence-dataset.ts',
    deterministic_seed: 'maya-ci/1',
    files,
  };
  writeFileSync(
    resolve(OUTPUT_DIRECTORY, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  validateManifest(validation);
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

const mode = process.argv[2] ?? 'validate';
if (mode === 'generate') {
  generate();
} else if (mode === 'validate') {
  const validation = validateDatasets();
  validateManifest(validation);
  process.stdout.write(
    `${JSON.stringify({ ...validation, manifest_integrity: 'passed' }, null, 2)}\n`,
  );
} else {
  throw new Error(`unknown_mode:${mode}`);
}
