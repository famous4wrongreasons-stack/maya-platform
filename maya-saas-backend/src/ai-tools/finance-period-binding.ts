import type { ConversationSemanticPlan } from '../conversation-intelligence/conversation-intelligence.types';
import {
  ReportingPeriodResolver,
  type ReportingPeriodToolArgs,
} from './reporting-period.resolver';

/** Finite single/pair financial READ, not a planner. Source facts, period
 * conversion, tenant scope and permissions remain with the existing runtime/C7.
 * A pair is two separately authorized READs, never a previous-equal-period guess. */
export function financialPeriodRequests(
  plan: ConversationSemanticPlan | null,
  latestText: string,
  timezone: string,
  now = new Date(),
): Array<ReportingPeriodToolArgs & { comparison: 'none' }> | null {
  if (plan?.tasks.length !== 1 || plan.context.unresolved_references.length)
    return null;
  const task = plan.tasks[0];
  if (
    !['finance.revenue', 'finance.compare_periods'].includes(task.intent) ||
    task.permission.status !== 'allowed' ||
    task.tool.status !== 'ready' ||
    task.requires_clarification ||
    task.requires_confirmation ||
    !task.tool.alternatives.includes('analytics.business.query') ||
    Object.keys(task.entities).some(
      (key) => !['period', 'comparison_period', 'metric'].includes(key),
    ) ||
    (task.entities.metric !== undefined && task.entities.metric !== 'revenue')
  )
    return null;
  const semantic = ReportingPeriodResolver.semanticPeriod(
    task.entities.period,
    now,
    timezone,
  );
  if (!semantic) return null;
  const explicit = ReportingPeriodResolver.resolve(
    latestText,
    '',
    now,
    timezone,
  );
  if (task.intent === 'finance.compare_periods') {
    // A fresh explicit period cannot be replaced by an inherited pair. Ask for
    // the two windows if the finite parser and validated plan disagree.
    if (
      explicit.explicit &&
      JSON.stringify(explicit.args) !== JSON.stringify(semantic)
    )
      return null;
    const previous = ReportingPeriodResolver.semanticPeriod(
      task.entities.comparison_period,
      now,
      timezone,
    );
    if (!previous || JSON.stringify(semantic) === JSON.stringify(previous))
      return null;
    return [semantic, previous].map((args) => ({
      ...args,
      comparison: 'none' as const,
    }));
  }
  if (task.entities.comparison_period !== undefined) return null;
  // This finite retained preference supports a full previous year, not an
  // arbitrary range that cannot be represented by its semantic slot.
  if (
    explicit.explicit &&
    explicit.args.period === 'named_range' &&
    JSON.stringify(explicit.args) !== JSON.stringify(semantic)
  )
    return null;
  // An explicit fresh day/month still wins over a mistaken model preference.
  // A short follow-up with no stated period retains its validated semantic slot.
  return [
    { ...(explicit.explicit ? explicit.args : semantic), comparison: 'none' },
  ];
}
