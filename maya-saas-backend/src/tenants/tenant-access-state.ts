import { TenantStatus } from '../common/domain.enums';

export const PAST_DUE_GRACE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const TENANT_STATUS_ACTIVE: string = TenantStatus.ACTIVE;
const TENANT_STATUS_PAST_DUE: string = TenantStatus.PAST_DUE;
const TENANT_STATUS_TRIAL: string = TenantStatus.TRIAL;

export type TenantAccessRecord = {
  currentPeriodEnd: Date | null;
  status: string;
  trialEndsAt: Date | null;
  trialFullAccess: boolean;
  pastDueAt?: Date | null;
  graceEndsAt?: Date | null;
  updatedAt?: Date | null;
};

export type TenantAccessState = {
  accessState:
    | 'active'
    | 'trial_active'
    | 'trial_setup'
    | 'past_due_grace'
    | 'subscription_required'
    | 'disabled';
  daysRemaining: number | null;
  graceDaysRemaining: number | null;
  graceEndsAt: Date | null;
  pastDueAt: Date | null;
  shouldMarkPastDue: boolean;
  subscriptionRequired: boolean;
  tenantStatus: string;
  trialEndsAt: Date | null;
  trialFullAccess: boolean;
};

export function evaluateTenantAccessState(
  tenant: TenantAccessRecord,
  now = new Date(),
): TenantAccessState {
  const accessWindowEndsAt = tenant.currentPeriodEnd ?? tenant.trialEndsAt;
  const accessWindowExpired = Boolean(
    accessWindowEndsAt && accessWindowEndsAt.getTime() <= now.getTime(),
  );
  const shouldMarkPastDue =
    accessWindowExpired &&
    new Set<string>([TENANT_STATUS_TRIAL, TENANT_STATUS_ACTIVE]).has(
      tenant.status,
    );
  const effectiveStatus = shouldMarkPastDue
    ? TENANT_STATUS_PAST_DUE
    : tenant.status;
  const isPastDue = effectiveStatus === TENANT_STATUS_PAST_DUE;
  const inferredPastDueAt = shouldMarkPastDue
    ? accessWindowEndsAt
    : earlierDate(accessWindowEndsAt, tenant.updatedAt ?? null);
  const pastDueAt = isPastDue
    ? (tenant.pastDueAt ?? inferredPastDueAt ?? null)
    : null;
  const graceEndsAt = isPastDue
    ? (tenant.graceEndsAt ?? addDays(pastDueAt, PAST_DUE_GRACE_DAYS))
    : null;
  const graceActive = Boolean(
    graceEndsAt && now.getTime() < graceEndsAt.getTime(),
  );
  const daysRemaining = tenant.trialEndsAt
    ? Math.max(
        0,
        Math.ceil((tenant.trialEndsAt.getTime() - now.getTime()) / DAY_MS),
      )
    : null;
  const graceDaysRemaining = graceEndsAt
    ? Math.max(0, Math.ceil((graceEndsAt.getTime() - now.getTime()) / DAY_MS))
    : null;

  if (isPastDue) {
    return {
      accessState: graceActive ? 'past_due_grace' : 'subscription_required',
      daysRemaining: 0,
      graceDaysRemaining,
      graceEndsAt,
      pastDueAt,
      shouldMarkPastDue,
      subscriptionRequired: !graceActive,
      tenantStatus: effectiveStatus,
      trialEndsAt: tenant.trialEndsAt,
      trialFullAccess: false,
    };
  }

  if (tenant.status === TENANT_STATUS_TRIAL) {
    const trialFullAccess = tenant.trialFullAccess === true;
    return {
      accessState: trialFullAccess ? 'trial_active' : 'trial_setup',
      daysRemaining,
      graceDaysRemaining: null,
      graceEndsAt: null,
      pastDueAt: null,
      shouldMarkPastDue: false,
      subscriptionRequired: false,
      tenantStatus: tenant.status,
      trialEndsAt: tenant.trialEndsAt,
      trialFullAccess,
    };
  }

  if (tenant.status === TENANT_STATUS_ACTIVE) {
    return {
      accessState: 'active',
      daysRemaining,
      graceDaysRemaining: null,
      graceEndsAt: null,
      pastDueAt: null,
      shouldMarkPastDue: false,
      subscriptionRequired: false,
      tenantStatus: tenant.status,
      trialEndsAt: tenant.trialEndsAt,
      trialFullAccess: false,
    };
  }

  return {
    accessState: 'disabled',
    daysRemaining,
    graceDaysRemaining: null,
    graceEndsAt: null,
    pastDueAt: null,
    shouldMarkPastDue: false,
    subscriptionRequired: false,
    tenantStatus: tenant.status,
    trialEndsAt: tenant.trialEndsAt,
    trialFullAccess: false,
  };
}

export function addDays(date: Date | null, days: number): Date | null {
  if (!date) {
    return null;
  }

  return new Date(date.getTime() + days * DAY_MS);
}

function earlierDate(left: Date | null, right: Date | null): Date | null {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }

  return left.getTime() <= right.getTime() ? left : right;
}
