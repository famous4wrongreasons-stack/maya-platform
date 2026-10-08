import { UserRole } from '../common/domain.enums';
import type { ConversationSemanticPlan } from '../conversation-intelligence/conversation-intelligence.types';

const SUMMARY = 'analytics.business_summary';
const WINDOWS = 'schedule.review_cancellation_windows';
const RECOMMENDATION = 'analytics.recommendations';

export const OWNER_REVIEW_QUESTION =
  'Могу объединить последний опубликованный финансовый отчёт по всему бизнесу и проверку одной сохранённой возможности после отмены. Это не обзор за отдельно запрошенный период, филиал или специалиста. Подойдёт такой ограниченный обзор без дополнительных условий?';

/** Encrypted conversation preference only; never a run, fact, permission or approval. */
export const OWNER_REVIEW_CLARIFICATION = {
  contract: 'maya.owner-review-clarification/1',
  scope: 'last_published_tenant_finance_and_one_saved_cancellation',
  question: OWNER_REVIEW_QUESTION,
} as const;

export function isOwnerReviewTaskSet(
  plan: ConversationSemanticPlan | null | undefined,
): boolean {
  if (!plan || ![2, 3].includes(plan.tasks.length)) return false;
  const intents = new Set(plan.tasks.map((task) => task.intent));
  return (
    intents.size === plan.tasks.length &&
    intents.has(SUMMARY) &&
    intents.has(WINDOWS) &&
    [...intents].every((intent) =>
      [SUMMARY, WINDOWS, RECOMMENDATION].includes(intent),
    )
  );
}

/** Closed routing hint after semantic validation. Current authority remains in C9. */
export function ownerReviewPlanState(
  plan: ConversationSemanticPlan | null | undefined,
  surface: string,
  role: UserRole | undefined,
): 'ready' | 'clarify' | null {
  if (
    !plan ||
    surface !== 'web' ||
    (role !== UserRole.TENANT_OWNER && role !== UserRole.BUSINESS_OWNER) ||
    !isOwnerReviewTaskSet(plan) ||
    plan.tasks.some(
      (task) =>
        task.permission.status !== 'allowed' || task.tool.status !== 'ready',
    )
  )
    return null;
  return plan.tasks.some(
    (task) =>
      task.requires_clarification || Object.keys(task.entities).length > 0,
  ) || plan.context.unresolved_references.length > 0
    ? 'clarify'
    : 'ready';
}

export function isOwnerReviewClarification(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.contract === OWNER_REVIEW_CLARIFICATION.contract &&
    record.scope === OWNER_REVIEW_CLARIFICATION.scope &&
    record.question === OWNER_REVIEW_QUESTION
  );
}

export function withOwnerReviewClarification(
  plan: ConversationSemanticPlan,
): ConversationSemanticPlan {
  return {
    ...plan,
    tasks: plan.tasks.map((task, index) =>
      index === 0
        ? {
            ...task,
            requires_clarification: true,
            clarification_question: OWNER_REVIEW_QUESTION,
          }
        : task,
    ),
  };
}
