import type {
  ConversationSemanticPlan,
  ConversationSemanticTask,
} from '../conversation-intelligence/conversation-intelligence.types';
import type { ReviewCalendarReadScope } from './ai-tool-handler.service';

export const REVIEWS_CALENDAR_UNAVAILABLE = {
  reply:
    'Не удалось подтвердить отзывы за выбранный месяц по текущим данным. Повторите проверку позже.',
  status: 'blocked' as const,
};
export const isReviewMonth = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length === 7 &&
  /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
export function reviewRating(value: unknown): number | 'all' | null {
  return value === 'all'
    ? 'all'
    : typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= 1 &&
        value <= 5
      ? value
      : null;
}
function taskEligible(task: ConversationSemanticTask): boolean {
  return (
    task.intent === 'reviews.list_recent' &&
    task.domain === 'reviews' &&
    task.action === 'read' &&
    task.data_class === 'C' &&
    task.permission.required === 'reviews.read' &&
    task.permission.status === 'allowed' &&
    task.tool.status === 'ready' &&
    task.tool.name === 'reviews.list.read' &&
    !task.requires_confirmation &&
    task.depends_on.length === 0
  );
}
/** Carry one saved clarification preference only, never prior authority or a rating. */
export function carryReviewCalendarPreference(
  current: ConversationSemanticPlan | null,
  previous: ConversationSemanticPlan | null,
): void {
  if (
    !current ||
    !previous ||
    current.dialogue_act !== 'clarification_answer' ||
    current.tasks.length !== 1 ||
    previous.tasks.length !== 1
  )
    return;
  const task = current.tasks[0],
    old = previous.tasks[0];
  if (
    !taskEligible(task) ||
    !taskEligible(old) ||
    !old.requires_clarification ||
    !isReviewMonth(old.entities.period) ||
    old.clarification_question !== reviewRatingQuestion(old.entities.period) ||
    Object.hasOwn(old.entities, 'employee') ||
    previous.context.unresolved_references.some((key) => key !== 'rating') ||
    !Object.hasOwn(task.entities, 'rating')
  )
    return;
  if (
    !Object.hasOwn(task.entities, 'period') &&
    !current.context.unresolved_references.includes('period')
  ) {
    task.entities.period = old.entities.period;
    current.context.carried_slots = [
      ...new Set([...current.context.carried_slots, 'period']),
    ];
  }
  if (
    current.context.replaced_slots.includes('branch') &&
    !Object.hasOwn(task.entities, 'branch')
  ) {
    current.context.unresolved_references = [
      ...new Set([...current.context.unresolved_references, 'branch']),
    ];
  }
  if (
    !Object.hasOwn(task.entities, 'branch') &&
    !current.context.unresolved_references.includes('branch') &&
    typeof old.entities.branch === 'string'
  ) {
    task.entities.branch = old.entities.branch;
    current.context.carried_slots = [
      ...new Set([...current.context.carried_slots, 'branch']),
    ];
  }
}
/** Leaves the old rolling query path unchanged. Unsupported calendar preferences
 * stay in this finite path so they cannot silently become a 90-day query. */
export function requestsReviewCalendar(
  plan: ConversationSemanticPlan | null,
): boolean {
  return (
    plan?.tasks.some(
      (task) =>
        task.intent === 'reviews.list_recent' &&
        task.permission.status === 'allowed' &&
        (Object.hasOwn(task.entities, 'period') ||
          (plan.dialogue_act === 'clarification_answer' &&
            Object.hasOwn(task.entities, 'rating'))) &&
        !(
          typeof task.entities.period === 'string' &&
          ['last_7_days', 'last_30_days', 'recent'].includes(
            task.entities.period,
          )
        ),
    ) ?? false
  );
}
export function reviewCalendarTask(
  plan: ConversationSemanticPlan | null,
): ConversationSemanticTask | null {
  if (
    !plan ||
    plan.tasks.length !== 1 ||
    !['request', 'correction', 'clarification_answer'].includes(
      plan.dialogue_act,
    )
  )
    return null;
  const task = plan.tasks[0];
  return taskEligible(task) &&
    Object.keys(task.entities).every((key) =>
      ['period', 'rating', 'branch', 'employee'].includes(key),
    )
    ? task
    : null;
}
export function reviewCalendarArguments(
  scope: ReviewCalendarReadScope,
): Record<string, unknown> {
  return {
    period: 'named_month',
    month: scope.month,
    limit: scope.limit,
    ...(scope.branchId === null ? {} : { branch_id: scope.branchId }),
    ...(scope.rating === null
      ? { all_ratings: true }
      : { rating: scope.rating }),
  };
}
export function reviewRatingQuestion(month: string): string {
  return `За ${month} показать все оценки или отзывы с одной оценкой — 1, 2, 3, 4 или 5?`;
}
