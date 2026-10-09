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
  isSingleLifecycleTaskSet,
  singleLifecyclePlanState,
  SINGLE_LIFECYCLE_CLARIFICATION,
  ownerReviewClarification,
  ownerReviewContinuationState,
  ownerReviewContinuationProjection,
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
  it('requires a fresh semantic READ scope choice bound to the retained exact task set', () => {
    const pending = withOwnerReviewClarification(plan());
    pending.tasks[0].entities.period = 'today';
    const accepted = plan();
    accepted.dialogue_act = 'accept_bounded_review';
    const transition = (next = accepted, hasTool = false) =>
      ownerReviewContinuationState(
        pending,
        next,
        'web',
        UserRole.TENANT_OWNER,
        hasTool,
      );
    expect(transition()).toBe('accept');
    expect(ownerReviewContinuationProjection(pending)).toEqual({
      scope: OWNER_REVIEW_CLARIFICATION.scope,
      question: OWNER_REVIEW_QUESTION,
      task_intents: [
        'analytics.business_summary',
        'schedule.review_cancellation_windows',
      ],
    });
    expect(transition(pending)).toBe('unresolved');
    expect(transition(plan())).toBe('unresolved');
    expect(transition(accepted, true)).toBe('unresolved');
    expect(
      ownerReviewContinuationState(
        undefined,
        accepted,
        'web',
        UserRole.TENANT_OWNER,
        false,
      ),
    ).toBe('unresolved');
    expect(
      ownerReviewContinuationState(
        pending,
        accepted,
        'web',
        UserRole.ADMINISTRATOR,
        false,
      ),
    ).toBe('unresolved');
    expect(
      ownerReviewContinuationState(
        pending,
        accepted,
        'native',
        UserRole.TENANT_OWNER,
        false,
      ),
    ).toBe('unresolved');
    for (const mutate of [
      (p: typeof accepted) => {
        p.tasks[0].entities.period = 'today';
      },
      (p: typeof accepted) => {
        p.tasks[0].requires_clarification = true;
      },
      (p: typeof accepted) => {
        p.tasks[0].clarification_question = OWNER_REVIEW_QUESTION;
      },
      (p: typeof accepted) => {
        p.tasks[0].permission.status = 'denied';
      },
      (p: typeof accepted) => {
        p.tasks[0].tool.status = 'not_available';
      },
      (p: typeof accepted) => {
        p.tasks.pop();
      },
    ]) {
      const invalid = structuredClone(accepted);
      mutate(invalid);
      expect(transition(invalid)).toBe('unresolved');
    }
    expect(
      transition({
        ...accepted,
        context: {
          ...accepted.context,
          unresolved_references: ['that branch'],
        },
      }),
    ).toBeNull();
    expect(
      transition({ ...accepted, dialogue_act: 'decline_bounded_review' }),
    ).toBe('decline');
    expect(
      transition({
        ...accepted,
        dialogue_act: 'request',
        tasks: [accepted.tasks[0]],
      }),
    ).toBeNull();
    expect(pending.tasks[0].entities).toEqual({ period: 'today' });
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

  const single = () =>
    ci.validatePlan(
      {
        tasks: [
          {
            intent: 'clients.dormant_list',
            entities: {},
            confidence: 0.99,
          },
        ],
      },
      UserRole.TENANT_OWNER,
      ['clients.dormant.list'],
    )!;
  it('keeps a single Lifecycle request separate from compound review and current authority', () => {
    const value = single();
    expect(isSingleLifecycleTaskSet(value)).toBe(true);
    expect(isOwnerReviewTaskSet(value)).toBe(false);
    expect(
      ownerReviewPlanState(value, 'web', UserRole.TENANT_OWNER),
    ).toBeNull();
    for (const role of [UserRole.TENANT_OWNER, UserRole.BUSINESS_OWNER])
      expect(singleLifecyclePlanState(value, 'web', role)).toBe('ready');
    for (const role of [
      UserRole.CLIENT,
      UserRole.STAFF,
      UserRole.ADMINISTRATOR,
      undefined,
    ])
      expect(singleLifecyclePlanState(value, 'web', role)).toBeNull();
    expect(
      singleLifecyclePlanState(value, 'native', UserRole.TENANT_OWNER),
    ).toBeNull();
    expect(
      singleLifecyclePlanState(null, 'web', UserRole.TENANT_OWNER),
    ).toBeNull();
    value.tasks[0].permission.status = 'denied';
    expect(
      singleLifecyclePlanState(value, 'web', UserRole.TENANT_OWNER),
    ).toBeNull();
    value.tasks[0].permission.status = 'allowed';
    value.tasks[0].tool.status = 'not_available';
    expect(
      singleLifecyclePlanState(value, 'web', UserRole.TENANT_OWNER),
    ).toBeNull();
    expect(
      isSingleLifecycleTaskSet({
        ...value,
        tasks: [...value.tasks, ...value.tasks],
      }),
    ).toBe(false);
    expect(isSingleLifecycleTaskSet(plan())).toBe(false);
  });
  it('retains single-scope preferences without exchanging single and compound markers', () => {
    const value = single();
    value.tasks[0].entities.unknown_constraint = 'preserve this';
    expect(singleLifecyclePlanState(value, 'web', UserRole.TENANT_OWNER)).toBe(
      'clarify',
    );
    const clarified = withOwnerReviewClarification(value);
    expect(clarified.tasks[0].entities).toEqual(value.tasks[0].entities);
    expect(clarified.tasks[0].clarification_question).toBe(
      SINGLE_LIFECYCLE_CLARIFICATION.question,
    );
    expect(SINGLE_LIFECYCLE_CLARIFICATION.question.length).toBeLessThanOrEqual(
      300,
    );
    expect(ownerReviewClarification(value)).toBe(
      SINGLE_LIFECYCLE_CLARIFICATION,
    );
    expect(
      isOwnerReviewClarification(SINGLE_LIFECYCLE_CLARIFICATION, value),
    ).toBe(true);
    for (const wrong of [
      CLIENT_VALUE_CLARIFICATION,
      OWNER_REVIEW_CLARIFICATION,
      { ...SINGLE_LIFECYCLE_CLARIFICATION, scope: 'all_clients' },
      { ...SINGLE_LIFECYCLE_CLARIFICATION, question: 'contact guests' },
    ])
      expect(isOwnerReviewClarification(wrong, value)).toBe(false);
    expect(
      isOwnerReviewClarification(SINGLE_LIFECYCLE_CLARIFICATION, plan()),
    ).toBe(false);
    expect(isOwnerReviewClarification(SINGLE_LIFECYCLE_CLARIFICATION)).toBe(
      false,
    );
    const unresolved = single();
    unresolved.context.unresolved_references = ['that branch'];
    expect(
      singleLifecyclePlanState(unresolved, 'web', UserRole.TENANT_OWNER),
    ).toBe('clarify');
    const question = single();
    question.tasks[0].requires_clarification = true;
    expect(
      singleLifecyclePlanState(question, 'web', UserRole.TENANT_OWNER),
    ).toBe('clarify');
  });
});
