import {
  digest,
  exact,
  identifier,
  instant,
  RELEASE_AUTHORIZATION_KEYS,
  releaseDeny,
  validateAuthorizationFields,
} from './widget-release.contract';
import {
  isProductionAuthorization,
  SINGLE_OPERATOR,
  SINGLE_OPERATOR_RELEASE_AUTH,
  type AnyReleaseAuthorization,
  type ProductionAuthorization,
  type SingleOperatorReleaseAuthorization,
} from './widget-release-production.contract';
import {
  NO_HANDOFF_PROFILE,
  PROFILE_DIGEST,
} from './widget-release-profile.contract';

/** Separate local staging execution; never parsed as a production V2 authorization. */
export const STAGING_SINGLE_OPERATOR_AUTH =
  'maya.widget-release-staging-authorization/1' as const;
export const STAGING_SINGLE_OPERATOR_TRUST =
  'WIDGET_RELEASE_STAGING_SINGLE_OPERATOR_TRUST_JSON' as const;
export const STAGING_SINGLE_OPERATOR_TENANTS =
  'WIDGET_RELEASE_STAGING_SINGLE_OPERATOR_TENANTS_JSON' as const;
export interface StagingSingleOperatorAuthorization extends Omit<
  SingleOperatorReleaseAuthorization,
  'contract' | 'environment'
> {
  contract: typeof STAGING_SINGLE_OPERATOR_AUTH;
  environment: 'staging';
}

export function stagingSingleOperatorAuthorization(
  value: unknown,
): StagingSingleOperatorAuthorization {
  const v = exact(value, [
    ...RELEASE_AUTHORIZATION_KEYS,
    'releaseId',
    'profileId',
    'profileDigest',
    'evidenceDigest',
    'governance',
    'independentHumanReview',
  ]);
  if (
    v.contract !== STAGING_SINGLE_OPERATOR_AUTH ||
    v.environment !== 'staging' ||
    !['grant', 'revoke'].includes(String(v.operation))
  )
    releaseDeny('staging_authorization');
  if (v.governance !== SINGLE_OPERATOR || v.independentHumanReview !== false)
    releaseDeny('single_operator_disclosure');
  validateAuthorizationFields(v, 'single-operator');
  identifier(v.releaseId);
  digest(v.evidenceDigest);
  if (v.profileId !== NO_HANDOFF_PROFILE || v.profileDigest !== PROFILE_DIGEST)
    releaseDeny('staging_profile');
  if (
    v.operation === 'grant' &&
    instant(v.grantExpiresAt) > instant(v.expiresAt)
  )
    releaseDeny('staging_execution_window');
  return v as unknown as StagingSingleOperatorAuthorization;
}

export function isSingleOperatorAuthorization(
  a: AnyReleaseAuthorization,
): a is
  SingleOperatorReleaseAuthorization | StagingSingleOperatorAuthorization {
  return (
    a.contract === SINGLE_OPERATOR_RELEASE_AUTH ||
    a.contract === STAGING_SINGLE_OPERATOR_AUTH
  );
}
export function isProfileExecutionAuthorization(
  a: AnyReleaseAuthorization,
): a is ProductionAuthorization | StagingSingleOperatorAuthorization {
  return (
    isProductionAuthorization(a) || a.contract === STAGING_SINGLE_OPERATOR_AUTH
  );
}
