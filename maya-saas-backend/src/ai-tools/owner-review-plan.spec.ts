import { UserRole } from '../common/domain.enums';
import { ConversationIntelligenceService } from '../conversation-intelligence/conversation-intelligence.service';
import {
  isOwnerReviewClarification,
  isOwnerReviewTaskSet,
  CLIENT_VALUE_CLARIFICATION,
  OWNER_REVIEW_CLARIFICATION,
  OWNER_REVIEW_QUESTION,
  ownerReviewPlanState,
  withOwnerReviewClarification,
} from './owner-review-plan';

describe('finite owner review plan boundary', () => {
  const ci = new ConversationIntelligenceService();
  const plan = () =>
    ci.validatePlan(
      {
        tasks: [
          {
            id: 'summary',
            intent: 'analytics.business_summary',
            entities: {},
            confidence: 0.99,
          },
          {
            id: 'windows',
            intent: 'schedule.review_cancellation_windows',
            entities: {},
            confidence: 0.99,
          },
        ],
      },
      UserRole.TENANT_OWNER,
      ['analytics.business.query', 'booking.availability.read'],
    )!;
  it('admits only an exact task set with current ready owner capabilities', () => {
    const valid = plan();
    expect(ownerReviewPlanState(valid, 'web', UserRole.TENANT_OWNER)).toBe(
      'ready',
    );
    expect(ownerReviewPlanState(valid, 'web', UserRole.BUSINESS_OWNER)).toBe(
      'ready',
    );
    expect(
      ownerReviewPlanState(valid, 'native', UserRole.TENANT_OWNER),
    ).toBeNull();
    expect(
      ownerReviewPlanState(valid, 'web', UserRole.ADMINISTRATOR),
    ).toBeNull();
    expect(ownerReviewPlanState(valid, 'web', undefined)).toBeNull();
    valid.tasks[0].permission.status = 'denied';
    expect(
      ownerReviewPlanState(valid, 'web', UserRole.TENANT_OWNER),
    ).toBeNull();
    valid.tasks[0].permission.status = 'allowed';
    valid.tasks[0].tool.status = 'not_available';
    expect(
      ownerReviewPlanState(valid, 'web', UserRole.TENANT_OWNER),
    ).toBeNull();
    expect(isOwnerReviewTaskSet({ ...valid, tasks: [valid.tasks[0]] })).toBe(
      false,
    );
    expect(
      isOwnerReviewTaskSet({
        ...valid,
        tasks: [...valid.tasks, valid.tasks[0]],
      }),
    ).toBe(false);
  });
  it('never drops even unknown constraints and distinguishes a saved question from authority', () => {
    const valid = plan();
    valid.tasks[0].entities.custom_constraint = 'one_named_branch';
    expect(ownerReviewPlanState(valid, 'web', UserRole.TENANT_OWNER)).toBe(
      'clarify',
    );
    const clarified = withOwnerReviewClarification(valid);
    expect(clarified.tasks[0].entities).toEqual(valid.tasks[0].entities);
    expect(clarified.tasks[0].clarification_question).toBe(
      OWNER_REVIEW_QUESTION,
    );
    expect(OWNER_REVIEW_QUESTION.length).toBeLessThanOrEqual(300);
    expect(valid.tasks[0].requires_clarification).toBe(false);
    expect(isOwnerReviewClarification(OWNER_REVIEW_CLARIFICATION)).toBe(true);
    expect(
      isOwnerReviewClarification({
        ...OWNER_REVIEW_CLARIFICATION,
        question: 'do something else',
      }),
    ).toBe(false);
    expect(
      isOwnerReviewClarification({
        ...OWNER_REVIEW_CLARIFICATION,
        scope: 'all_data',
      }),
    ).toBe(false);
    expect(isOwnerReviewClarification(null)).toBe(false);
  });
  it('admits the existing BI + Lifecycle pair and preserves its own bounded question', () => {
    const lifecycle = ci.validatePlan(
      {
        tasks: [
          {
            id: 'finance',
            intent: 'analytics.business_summary',
            entities: {},
            confidence: 0.99,
          },
          {
            id: 'return',
            intent: 'clients.dormant_list',
            entities: {},
            confidence: 0.99,
          },
        ],
      },
      UserRole.TENANT_OWNER,
      ['analytics.business.query', 'clients.dormant.list'],
    )!;
    expect(ownerReviewPlanState(lifecycle, 'web', UserRole.TENANT_OWNER)).toBe(
      'ready',
    );
    lifecycle.tasks[1].entities.period = 'today';
    expect(ownerReviewPlanState(lifecycle, 'web', UserRole.TENANT_OWNER)).toBe(
      'clarify',
    );
    const clarified = withOwnerReviewClarification(lifecycle);
    expect(clarified.tasks[0].clarification_question).toContain('трёх оценок');
    expect(clarified.tasks[0].clarification_question).not.toContain('отмен');
    expect(clarified.tasks[1].entities).toEqual({ period: 'today' });
    expect(
      clarified.tasks[0].clarification_question!.length,
    ).toBeLessThanOrEqual(300);
    expect(
      isOwnerReviewClarification(CLIENT_VALUE_CLARIFICATION, lifecycle),
    ).toBe(true);
    expect(
      isOwnerReviewClarification(OWNER_REVIEW_CLARIFICATION, lifecycle),
    ).toBe(false);
    expect(isOwnerReviewClarification(CLIENT_VALUE_CLARIFICATION, plan())).toBe(
      false,
    );
    lifecycle.tasks.push(plan().tasks[1]);
    expect(isOwnerReviewTaskSet(lifecycle)).toBe(false);
    expect(
      isOwnerReviewClarification(CLIENT_VALUE_CLARIFICATION, lifecycle),
    ).toBe(false);
  });
});
