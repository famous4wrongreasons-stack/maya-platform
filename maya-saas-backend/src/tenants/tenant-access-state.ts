import { TenantStatus } from '../common/domain.enums';

export type TenantAccessRecord = {
  currentPeriodEnd: Date | null;
  status: string;
  trialEndsAt: Date | null;
  trialFullAccess: boolean;
};

export type TenantAccessState = {
  accessState:
    | 'active'
    | 'trial_active'
    | 'trial_setup'
    | 'subscription_required'
    | 'disabled';
  daysRemaining: number | null;
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
  const trialExpired =
    Boolean(tenant.trialEndsAt) &&
    tenant.trialEndsAt!.getTime() <= now.getTime();
  const unpaidExpiredTrial =
    trialExpired &&
    tenant.currentPeriodEnd === null &&
    new Set<string>([TenantStatus.TRIAL, TenantStatus.PAST_DUE]).has(
      tenant.status,
    );
  const shouldMarkPastDue = unpaidExpiredTrial && tenant.status === 'trial';
  const effectiveStatus = shouldMarkPastDue
    ? TenantStatus.PAST_DUE
    : tenant.status;
  const daysRemaining = tenant.trialEndsAt
    ? Math.max(
        0,
        Math.ceil(
          (tenant.trialEndsAt.getTime() - now.getTime()) /
            (24 * 60 * 60 * 1000),
        ),
      )
    : null;

  if (unpaidExpiredTrial) {
    return {
      accessState: 'subscription_required',
      daysRemaining: 0,
      shouldMarkPastDue,
      subscriptionRequired: true,
      tenantStatus: effectiveStatus,
      trialEndsAt: tenant.trialEndsAt,
      trialFullAccess: false,
    };
  }

  if (tenant.status === 'trial') {
    const trialFullAccess = tenant.trialFullAccess === true;
    return {
      accessState: trialFullAccess ? 'trial_active' : 'trial_setup',
      daysRemaining,
      shouldMarkPastDue: false,
      subscriptionRequired: false,
      tenantStatus: tenant.status,
      trialEndsAt: tenant.trialEndsAt,
      trialFullAccess,
    };
  }

  if (
    new Set<string>([TenantStatus.ACTIVE, TenantStatus.PAST_DUE]).has(
      tenant.status,
    )
  ) {
    return {
      accessState: 'active',
      daysRemaining,
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
    shouldMarkPastDue: false,
    subscriptionRequired: false,
    tenantStatus: tenant.status,
    trialEndsAt: tenant.trialEndsAt,
    trialFullAccess: false,
  };
}
