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

  it('starts a fixed three-day grace window at trial expiry', () => {
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
      accessState: 'past_due_grace',
      daysRemaining: 0,
      graceDaysRemaining: 3,
      pastDueAt: new Date('2026-07-13T11:59:59.000Z'),
      graceEndsAt: new Date('2026-07-16T11:59:59.000Z'),
      shouldMarkPastDue: true,
      subscriptionRequired: false,
      tenantStatus: TenantStatus.PAST_DUE,
      trialFullAccess: false,
    });
  });

  it('keeps access through the last millisecond of the persisted grace window', () => {
    const state = evaluateTenantAccessState(
      {
        status: TenantStatus.PAST_DUE,
        trialEndsAt: new Date('2026-07-10T12:00:00.000Z'),
        trialFullAccess: false,
        currentPeriodEnd: null,
        pastDueAt: new Date('2026-07-10T12:00:00.000Z'),
        graceEndsAt: new Date('2026-07-13T12:00:00.000Z'),
      },
      new Date('2026-07-13T11:59:59.999Z'),
    );

    expect(state).toMatchObject({
      accessState: 'past_due_grace',
      graceDaysRemaining: 1,
      shouldMarkPastDue: false,
      subscriptionRequired: false,
    });
  });

  it('requires a subscription exactly when the persisted grace window ends', () => {
    const state = evaluateTenantAccessState(
      {
        status: TenantStatus.PAST_DUE,
        trialEndsAt: new Date('2026-07-10T12:00:00.000Z'),
        trialFullAccess: false,
        currentPeriodEnd: null,
        pastDueAt: new Date('2026-07-10T12:00:00.000Z'),
        graceEndsAt: new Date('2026-07-13T12:00:00.000Z'),
      },
      now,
    );

    expect(state).toMatchObject({
      accessState: 'subscription_required',
      graceDaysRemaining: 0,
      shouldMarkPastDue: false,
      subscriptionRequired: true,
      tenantStatus: TenantStatus.PAST_DUE,
    });
  });

  it('does not infer a legacy grace start in the future', () => {
    const state = evaluateTenantAccessState(
      {
        status: TenantStatus.PAST_DUE,
        trialEndsAt: null,
        trialFullAccess: false,
        currentPeriodEnd: new Date('2026-08-01T12:00:00.000Z'),
        pastDueAt: null,
        graceEndsAt: null,
        updatedAt: new Date('2026-07-10T12:00:00.000Z'),
      },
      now,
    );

    expect(state).toMatchObject({
      accessState: 'subscription_required',
      pastDueAt: new Date('2026-07-10T12:00:00.000Z'),
      graceEndsAt: new Date('2026-07-13T12:00:00.000Z'),
      subscriptionRequired: true,
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

  it('starts grace when a paid subscription period expires', () => {
    const state = evaluateTenantAccessState(
      {
        status: TenantStatus.ACTIVE,
        trialEndsAt: new Date('2026-07-01T12:00:00.000Z'),
        trialFullAccess: false,
        currentPeriodEnd: new Date('2026-07-13T12:00:00.000Z'),
      },
      now,
    );

    expect(state).toMatchObject({
      accessState: 'past_due_grace',
      pastDueAt: now,
      graceEndsAt: new Date('2026-07-16T12:00:00.000Z'),
      shouldMarkPastDue: true,
      subscriptionRequired: false,
      tenantStatus: TenantStatus.PAST_DUE,
    });
  });
});
