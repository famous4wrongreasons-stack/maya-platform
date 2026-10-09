import type { ConversationSemanticPlan } from '../conversation-intelligence/conversation-intelligence.types';
import { MAYA_CONVERSATION_INTENTS } from '../conversation-intelligence/conversation-taxonomy';
import {
  isExactBookingTime,
  isSingleDaySemanticValue,
} from '../conversation-intelligence/semantic-slot-normalization';

// Display vocabulary only. Weekdays stay preferences; no calendar date,
// availability, appointment identity or mutation authority is derived here.
const RESCHEDULE_WEEKDAYS = new Map<string, string>([
  ['monday', 'понедельник'],
  ['tuesday', 'вторник'],
  ['wednesday', 'среда'],
  ['thursday', 'четверг'],
  ['friday', 'пятница'],
  ['saturday', 'суббота'],
  ['sunday', 'воскресенье'],
  ['понедельник', 'понедельник'],
  ['вторник', 'вторник'],
  ['среда', 'среда'],
  ['среду', 'среда'],
  ['четверг', 'четверг'],
  ['пятница', 'пятница'],
  ['пятницу', 'пятница'],
  ['суббота', 'суббота'],
  ['субботу', 'суббота'],
  ['воскресенье', 'воскресенье'],
]);

function rescheduleDayPreference(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const weekday = RESCHEDULE_WEEKDAYS.get(value);
  if (weekday) return weekday;
  if (!isSingleDaySemanticValue(value)) return null;
  if (value === 'today' || value === 'сегодня') return 'сегодня';
  if (value === 'tomorrow' || value === 'завтра') return 'завтра';
  // The semantic guard permits only an ISO day here. Reject normalization such
  // as 30 February; never parse arbitrary prose or resolve relative dates.
  const instant = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(instant.getTime()) &&
    instant.toISOString().slice(0, 10) === value
    ? value
    : null;
}

const SLOT_LABELS: Record<string, string> = {
  services: 'услугу',
  date: 'дату',
  time: 'время',
  employee: 'мастера',
  branch: 'филиал',
  appointment: 'запись',
  new_date: 'новую дату',
  new_time: 'новое время',
  new_employee: 'нового мастера',
};

/** Presentation only: model-authored questions are not mutation receipts. */
export function mutationClarification(
  plan: ConversationSemanticPlan | null,
): string | null {
  const task = plan?.tasks.find(
    (t) =>
      (t.requires_clarification ||
        t.permission.status === 'denied' ||
        t.tool.status === 'not_available') &&
      (t.action === 'write' || t.action === 'execute'),
  );
  if (!task) return null;
  if (task.permission.status === 'denied')
    return task.domain === 'booking'
      ? 'Для этого действия нужен подтверждённый клиентский доступ.'
      : 'У вас нет разрешения на это действие.';
  if (task.tool.status === 'not_available')
    return 'Это действие сейчас недоступно. Подтверждённого результата выполнения нет.';
  const definition = MAYA_CONVERSATION_INTENTS.get(task.intent)!;
  const missing = definition.requiredSlots.filter((k) => !(k in task.entities));
  const unresolved = plan!.context.unresolved_references;
  let preference = '';
  if (
    plan?.tasks.length === 1 &&
    task.intent === 'booking.reschedule_own' &&
    task.permission.status === 'allowed' &&
    task.tool.status === 'ready'
  ) {
    const day = unresolved.includes('new_date')
      ? null
      : rescheduleDayPreference(task.entities.new_date);
    const time =
      !unresolved.includes('new_time') &&
      isExactBookingTime(task.entities.new_time)
        ? task.entities.new_time
        : null;
    if (!day) missing.push('new_date');
    if (!time) missing.push('new_time');
    const requested = [day, time].filter((value) => value !== null);
    if (requested.length)
      preference = `Пожелание для переноса: ${requested.join(', ')}. Возможность переноса ещё не проверена. `;
  }
  const labels = [
    ...new Set(
      [...missing, ...unresolved].map((k) => SLOT_LABELS[k]).filter(Boolean),
    ),
  ];
  const clarification = labels.length
    ? `Для подготовки действия уточните ${labels.join(', ')}. Подтверждённого результата выполнения пока нет.`
    : 'Параметры действия требуют уточнения. Какой вариант вы выбираете? Подтверждённого результата выполнения пока нет.';
  return preference + clarification;
}

/** Accept only the existing runtime's authoritative AE projection, never model text. */
export function mutationReceiptStatus(
  execution: Record<string, unknown>,
): string {
  const receipts = Array.isArray(execution.canonical_actions)
    ? execution.canonical_actions
    : [];
  const states: string[] = [];
  for (const raw of receipts) {
    if (!raw || typeof raw !== 'object') return 'unknown';
    const item = raw as Record<string, unknown>;
    if (
      item.contract !== 'maya.action-execution-result/1' ||
      typeof item.executionId !== 'string' ||
      !item.executionId ||
      typeof item.state !== 'string'
    )
      return 'unknown';
    states.push(item.state);
  }
  if (!states.length)
    return execution.status === 'not_executed' ? 'not_executed' : 'unknown';
  if (
    execution.status === 'completed' &&
    states.every((state) => state === 'SUCCEEDED')
  )
    return 'completed';
  if (
    states.every((state) =>
      ['SUCCEEDED', 'FAILED', 'NOT_EXECUTED'].includes(state),
    ) &&
    states.some((state) => ['FAILED', 'NOT_EXECUTED'].includes(state))
  )
    return 'failed';
  return 'unknown';
}
export function mutationReceiptReply(
  execution: Record<string, unknown>,
): string {
  const status = mutationReceiptStatus(execution);
  if (status === 'completed')
    return 'Действие выполнено. Результат подтверждён системой.';
  if (status === 'failed' || status === 'not_executed')
    return 'Действие не выполнено полностью. Проверьте результат в карточке действия.';
  return 'Результат действия пока не подтверждён. Не повторяйте его до завершения проверки.';
}
