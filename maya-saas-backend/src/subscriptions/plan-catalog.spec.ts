import { canonicalPlanName, PLAN_CATALOG } from './plan-catalog';

describe('plan catalog', () => {
  it('matches the canonical quota and white-label matrix', () => {
    expect(PLAN_CATALOG).toMatchObject({
      solo: {
        maxBranches: 1,
        maxStaff: 5,
        isWhiteLabelEnabled: false,
      },
      business: {
        maxBranches: 3,
        maxStaff: 25,
        isWhiteLabelEnabled: false,
      },
      business_plus: {
        maxBranches: 10,
        maxStaff: 100,
        isWhiteLabelEnabled: true,
      },
    });
  });

  it.each([
    ['start', 'solo'],
    ['pro', 'business'],
    ['max', 'business_plus'],
    ['business_plus', 'business_plus'],
  ])('maps legacy plan %s to %s', (input, expected) => {
    expect(canonicalPlanName(input)).toBe(expected);
  });
});
