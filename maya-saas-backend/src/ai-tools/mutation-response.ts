import type { ConversationSemanticPlan } from '../conversation-intelligence/conversation-intelligence.types';
import { MAYA_CONVERSATION_INTENTS } from '../conversation-intelligence/conversation-taxonomy';
import { isExactBookingTime } from '../conversation-intelligence/semantic-slot-normalization';
import { rescheduleDayPreference } from '../conversation-intelligence/reschedule-day-preference';

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
  if (task.permission.status === 'denied') {
    // This is a role/permission refusal, not a Client-link lookup. Never tell
    // an already verified owner to repeat identity verification on that basis.
    // The suggested new READ request grants no authority and dispatches nothing.
    if (task.intent === 'booking.create_own')
      return 'Прямо этой командой оформить запись в текущем режиме нельзя. Для записи себя напишите «Открой форму личной записи». В форме я отдельно проверю клиентский доступ и попрошу подтвердить запись.';
    return task.domain === 'booking'
      ? 'В текущем режиме у вас нет разрешения на это действие с записью. Изменение не выполнено.'
      : 'У вас нет разрешения на это действие.';
  }
  if (task.tool.status === 'not_available')
    return 'Это действие сейчас недоступно. Подтверждённого результата выполнения нет.';
  const definition = MAYA_CONVERSATION_INTENTS.get(task.intent)!;
  const missing = definition.requiredSlots.filter((k) => !(k in task.entities));
  const unresolved = plan!.context.unresolved_references;
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
    const needed = new Set([...missing, ...unresolved]);
    const question = needed.has('appointment')
      ? 'Какую запись хотите перенести?'
      : needed.has('new_date')
        ? 'На какой день хотите перенести запись?'
        : needed.has('new_time')
          ? 'Во сколько вам удобно?'
          : needed.has('new_employee')
            ? 'К какому мастеру хотите перенести запись?'
            : 'Что хотите уточнить в переносе?';
    return `${requested.length ? `Поняла: ${requested.join(', ')}. ` : ''}${question} Доступность ещё нужно проверить; перенос пока не выполнен.`;
  }
  const labels = [
    ...new Set(
      [...missing, ...unresolved].map((k) => SLOT_LABELS[k]).filter(Boolean),
    ),
  ];
  const clarification = labels.length
    ? `Для подготовки действия уточните ${labels.join(', ')}. Подтверждённого результата выполнения пока нет.`
    : 'Параметры действия требуют уточнения. Какой вариант вы выбираете? Подтверждённого результата выполнения пока нет.';
  return clarification;
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
