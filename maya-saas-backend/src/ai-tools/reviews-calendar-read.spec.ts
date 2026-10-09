import { ConversationIntelligenceService } from '../conversation-intelligence/conversation-intelligence.service';
import { UserRole } from '../common/domain.enums';
import {
  carryReviewCalendarPreference,
  requestsReviewCalendar,
  reviewCalendarTask,
  reviewRating,
  reviewRatingQuestion,
} from './reviews-calendar-read';
const ci = new ConversationIntelligenceService();
function plan(
  entities: Record<string, unknown>,
  dialogue_act = 'request',
  clarification = false,
) {
  return ci.validatePlan(
    {
      dialogue_act,
      tasks: [
        {
          id: 'reviews',
          intent: 'reviews.list_recent',
          entities,
          confidence: 1,
          requires_clarification: clarification,
          clarification_question:
            clarification && typeof entities.period === 'string'
              ? reviewRatingQuestion(entities.period)
              : null,
        },
      ],
      context: {
        carried_slots: [],
        replaced_slots: [],
        unresolved_references: [],
      },
    },
    UserRole.TENANT_OWNER,
    ['reviews.list.read'],
  )!;
}
describe('finite reviews calendar semantic preferences', () => {
  it.each(['low', 'bad', '2', [], [1, 2], 0, 6, null, undefined])(
    'does not infer a rating from %p',
    (value) => expect(reviewRating(value)).toBeNull(),
  );
  it('accepts only all or one exact score', () => {
    expect([1, 2, 3, 4, 5, 'all'].map(reviewRating)).toEqual([
      1,
      2,
      3,
      4,
      5,
      'all',
    ]);
  });
  it('carries canonical period and branch only into one explicit rating clarification', () => {
    const old = plan(
        { period: '2026-09', branch: 'current', rating: 'low' },
        'request',
        true,
      ),
      next = plan({ rating: 2 }, 'clarification_answer');
    carryReviewCalendarPreference(next, old);
    expect(next.tasks[0].entities).toEqual({
      rating: 2,
      period: '2026-09',
      branch: 'current',
    });
    expect(old.tasks[0].entities.rating).toBe('low');
    expect(requestsReviewCalendar(next)).toBe(true);
  });
  it.each(['request', 'correction'])(
    'does not resurrect period from unrelated %s',
    (act) => {
      const next = plan({ rating: 2 }, act);
      carryReviewCalendarPreference(
        next,
        plan({ period: '2026-09' }, 'request', true),
      );
      expect(next.tasks[0].entities).toEqual({ rating: 2 });
    },
  );
  it('retains exact branch when a rating answer repeats the saved month', () => {
    const next = plan({ rating: 2, period: '2026-09' }, 'clarification_answer');
    carryReviewCalendarPreference(
      next,
      plan(
        { period: '2026-09', branch: 'current', rating: 'low' },
        'request',
        true,
      ),
    );
    expect(next.tasks[0].entities.branch).toBe('current');
  });
  it('does not carry arbitrary clarification or silently erase employee constraints', () => {
    for (const extra of [{ employee: 'private' }, {}]) {
      const old = plan({ period: '2026-09', ...extra }, 'request', true);
      if (!('employee' in extra))
        old.tasks[0].clarification_question = 'arbitrary';
      const next = plan({ rating: 2 }, 'clarification_answer');
      carryReviewCalendarPreference(next, old);
      expect(next.tasks[0].entities).toEqual({ rating: 2 });
    }
  });
  it('preserves the selected branch when only the month changes', () => {
    const next = plan(
      { rating: 'all', period: '2026-08' },
      'clarification_answer',
    );
    carryReviewCalendarPreference(
      next,
      plan({ period: '2026-09', branch: 'old' }, 'request', true),
    );
    expect(next.tasks[0].entities).toEqual({
      rating: 'all',
      period: '2026-08',
      branch: 'old',
    });
  });
  it('does not carry an unresolved source or retain old rating', () => {
    const old = plan(
        { period: '2026-09', branch: 'old', rating: 1 },
        'request',
        true,
      ),
      next = plan({ rating: 5 }, 'clarification_answer');
    next.context.unresolved_references = ['branch'];
    carryReviewCalendarPreference(next, old);
    expect(next.tasks[0].entities).toEqual({ rating: 5, period: '2026-09' });
  });
  it('does not coerce malformed rolling period arrays into legacy reads', () => {
    expect(
      requestsReviewCalendar(plan({ period: ['recent'], rating: 2 })),
    ).toBe(true);
    expect(
      requestsReviewCalendar(plan({ period: ['last_30_days'], rating: 2 })),
    ).toBe(true);
  });
  it('requires scope clarification when branch is explicitly replaced without a value', () => {
    const next = plan({ period: '2026-08', rating: 2 }, 'clarification_answer');
    next.context.replaced_slots = ['branch'];
    carryReviewCalendarPreference(
      next,
      plan({ period: '2026-09', branch: 'old' }, 'request', true),
    );
    expect(next.context.unresolved_references).toContain('branch');
    expect(next.tasks[0].entities).not.toHaveProperty('branch');
  });
  it('keeps rolling legacy requests outside exact mode and rejects compound readiness', () => {
    expect(requestsReviewCalendar(plan({ period: 'last_30_days' }))).toBe(
      false,
    );
    expect(
      reviewCalendarTask(plan({ period: 'last_month' }, 'compound_request')),
    ).toBeNull();
  });
});
