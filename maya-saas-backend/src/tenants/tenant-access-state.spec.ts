import { TenantStatus } from '../common/domain.enums';
import { evaluateTenantAccessState } from './tenant-access-state';

describe('evaluateTenantAccessState', () => {
  const now = new Date('2026-07-13T12:00:00.000Z');

  it('keeps a verified trial fully active before its deadline', () => {
    const state = evaluateTenantAccessState(
      {
        status: TenantStatus.TRIAL,
        trialEndsAt: new Date('2026-07-23T12:00:00.000Z'),
        trialFullAccess: true,
        currentPeriodEnd: null,
      },
      now,
    );

    expect(state).toMatchObject({
      accessState: 'trial_active',
      daysRemaining: 10,
      subscriptionRequired: false,
      trialFullAccess: true,
    });
  });

  it('requires a subscription and requests a past-due transition at expiry', () => {
    const state = evaluateTenantAccessState(
      {
        status: TenantStatus.TRIAL,
        trialEndsAt: new Date('2026-07-13T11:59:59.000Z'),
        trialFullAccess: true,
        currentPeriodEnd: null,
      },
      now,
    );

    expect(state).toMatchObject({
      accessState: 'subscription_required',
      daysRemaining: 0,
      shouldMarkPastDue: true,
      subscriptionRequired: true,
      tenantStatus: TenantStatus.PAST_DUE,
      trialFullAccess: false,
    });
  });

  it('does not mistake a paid active tenant for an expired trial', () => {
    const state = evaluateTenantAccessState(
      {
        status: TenantStatus.ACTIVE,
        trialEndsAt: new Date('2026-07-01T12:00:00.000Z'),
        trialFullAccess: false,
        currentPeriodEnd: new Date('2026-08-13T12:00:00.000Z'),
      },
      now,
    );

    expect(state.accessState).toBe('active');
    expect(state.subscriptionRequired).toBe(false);
  });
});
