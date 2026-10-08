import { UserRole } from '../common/domain.enums';
import type { ConversationSemanticPlan } from '../conversation-intelligence/conversation-intelligence.types';

const SUMMARY = 'analytics.business_summary';
const WINDOWS = 'schedule.review_cancellation_windows';
const LIFECYCLE = 'clients.dormant_list';
const RECOMMENDATION = 'analytics.recommendations';

export const OWNER_REVIEW_QUESTION =
  'Могу объединить последний опубликованный финансовый отчёт по всему бизнесу и проверку одной сохранённой возможности после отмены. Это не обзор за отдельно запрошенный период, филиал или специалиста. Подойдёт такой ограниченный обзор без дополнительных условий?';

/** Encrypted conversation preference only; never a run, fact, permission or approval. */
export const OWNER_REVIEW_CLARIFICATION = {
  contract: 'maya.owner-review-clarification/1',
  scope: 'last_published_tenant_finance_and_one_saved_cancellation',
  question: OWNER_REVIEW_QUESTION,
} as const;

export const CLIENT_VALUE_CLARIFICATION = {
  contract: 'maya.owner-review-clarification/1',
  scope: 'last_published_tenant_finance_and_three_c8_evaluations',
  question:
    'Могу объединить последний опубликованный финансовый отчёт по всему бизнесу и до трёх оценок давности визитов по правилам бизнеса. Это не список клиентов и не обзор за отдельный период или филиал. Подойдёт такой ограниченный обзор без дополнительных условий?',
} as const;

export const SINGLE_LIFECYCLE_CLARIFICATION = {
  contract: 'maya.owner-review-clarification/1',
  scope: 'up_to_three_published_c8_dormancy_evaluations',
  question:
    'Могу проверить до трёх опубликованных оценок давности визитов по правилам бизнеса. Это не список клиентов; отдельно запрошенные период, филиал и порог такая проверка не учитывает. Выполнить эту ограниченную проверку без дополнительных условий?',
} as const;

/** A single existing Lifecycle capability, never an implicit finance request. */
export function isSingleLifecycleTaskSet(
  plan: ConversationSemanticPlan | null | undefined,
): boolean {
  return plan?.tasks.length === 1 && plan.tasks[0].intent === LIFECYCLE;
}

export function singleLifecyclePlanState(
  plan: ConversationSemanticPlan | null | undefined,
  surface: string,
  role: UserRole | undefined,
): 'ready' | 'clarify' | null {
  if (
    !plan ||
    !isSingleLifecycleTaskSet(plan) ||
    surface !== 'web' ||
    (role !== UserRole.TENANT_OWNER && role !== UserRole.BUSINESS_OWNER) ||
    plan.tasks[0].permission.status !== 'allowed' ||
    plan.tasks[0].tool.status !== 'ready'
  )
    return null;
  return plan.tasks[0].requires_clarification ||
    Object.keys(plan.tasks[0].entities).length > 0 ||
    plan.context.unresolved_references.length > 0
    ? 'clarify'
    : 'ready';
}

export function ownerReviewKind(
  plan: ConversationSemanticPlan | null | undefined,
): 'occupancy' | 'lifecycle' | null {
  if (!plan || ![2, 3].includes(plan.tasks.length)) return null;
  const intents = new Set(plan.tasks.map((task) => task.intent));
  if (intents.size !== plan.tasks.length || !intents.has(SUMMARY)) return null;
  if (
    [...intents].every((intent) =>
      [SUMMARY, WINDOWS, RECOMMENDATION].includes(intent),
    ) &&
    intents.has(WINDOWS)
  )
    return 'occupancy';
  if (
    [...intents].every((intent) =>
      [SUMMARY, LIFECYCLE, RECOMMENDATION].includes(intent),
    ) &&
    intents.has(LIFECYCLE)
  )
    return 'lifecycle';
  return null;
}

export function ownerReviewClarification(plan: ConversationSemanticPlan) {
  if (isSingleLifecycleTaskSet(plan)) return SINGLE_LIFECYCLE_CLARIFICATION;
  return ownerReviewKind(plan) === 'lifecycle'
    ? CLIENT_VALUE_CLARIFICATION
    : OWNER_REVIEW_CLARIFICATION;
}

export function isOwnerReviewTaskSet(
  plan: ConversationSemanticPlan | null | undefined,
): boolean {
  return ownerReviewKind(plan) !== null;
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

export function isOwnerReviewClarification(
  value: unknown,
  plan?: ConversationSemanticPlan,
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (plan && !isOwnerReviewTaskSet(plan) && !isSingleLifecycleTaskSet(plan))
    return false;
  const expected = plan
    ? ownerReviewClarification(plan)
    : OWNER_REVIEW_CLARIFICATION;
  const record = value as Record<string, unknown>;
  return (
    record.contract === expected.contract &&
    record.scope === expected.scope &&
    record.question === expected.question
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
            clarification_question: ownerReviewClarification(plan).question,
          }
        : task,
    ),
  };
}
