import type { ConversationSemanticPlan } from '../conversation-intelligence/conversation-intelligence.types';
import { MAYA_CONVERSATION_INTENTS } from '../conversation-intelligence/conversation-taxonomy';

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
  const labels = [
    ...new Set(
      [...missing, ...unresolved].map((k) => SLOT_LABELS[k]).filter(Boolean),
    ),
  ];
  return labels.length
    ? `Для подготовки действия уточните ${labels.join(', ')}. Подтверждённого результата выполнения пока нет.`
    : 'Параметры действия требуют уточнения. Какой вариант вы выбираете? Подтверждённого результата выполнения пока нет.';
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
