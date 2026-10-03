import {
  digest,
  exact,
  identifier,
  instant,
  RELEASE_AUTHORIZATION_KEYS,
  releaseDeny,
  validateAuthorizationFields,
  type ReleaseAuthorization,
} from './widget-release.contract';
import {
  NO_HANDOFF_PROFILE,
  PROFILE_DIGEST,
} from './widget-release-profile.contract';

/** A separate owner execution decision. A certificate, legacy authorization or config flag is insufficient. */
export const PRODUCTION_RELEASE_AUTH =
  'maya.widget-release-production-authorization/1' as const;
export const SINGLE_OPERATOR_RELEASE_AUTH =
  'maya.widget-release-production-authorization/2' as const;
export const SINGLE_OPERATOR = 'single-operator' as const;
export interface ProductionReleaseAuthorization extends Omit<
  ReleaseAuthorization,
  'contract' | 'environment'
> {
  contract: typeof PRODUCTION_RELEASE_AUTH;
  environment: 'production';
  releaseId: string;
  profileId: typeof NO_HANDOFF_PROFILE;
  profileDigest: string;
  evidenceDigest: string;
}

/** One actual platform principal signs execution and binds the unsigned evidence certificate.
 * No reviewer identity or second self-signature is manufactured. V1 remains unchanged. */
export interface SingleOperatorReleaseAuthorization extends Omit<
  ProductionReleaseAuthorization,
  'contract' | 'reviewerId'
> {
  contract: typeof SINGLE_OPERATOR_RELEASE_AUTH;
  reviewerId: null;
  governance: typeof SINGLE_OPERATOR;
  independentHumanReview: false;
}
export type ProductionAuthorization =
  ProductionReleaseAuthorization | SingleOperatorReleaseAuthorization;
export type AnyReleaseAuthorization =
  ReleaseAuthorization | ProductionAuthorization;
export function isProductionAuthorization(
  a: AnyReleaseAuthorization,
): a is ProductionAuthorization {
  return (
    a.contract === PRODUCTION_RELEASE_AUTH ||
    a.contract === SINGLE_OPERATOR_RELEASE_AUTH
  );
}

export function productionAuthorization(
  value: unknown,
): ProductionAuthorization {
  const single =
    (value as { contract?: unknown } | null)?.contract ===
    SINGLE_OPERATOR_RELEASE_AUTH;
  const v = exact(value, [
    ...RELEASE_AUTHORIZATION_KEYS,
    'releaseId',
    'profileId',
    'profileDigest',
    'evidenceDigest',
    ...(single ? ['governance', 'independentHumanReview'] : []),
  ]);
  if (
    (!single && v.contract !== PRODUCTION_RELEASE_AUTH) ||
    v.environment !== 'production' ||
    !['grant', 'revoke'].includes(String(v.operation))
  )
    releaseDeny('production_authorization');
  if (
    single &&
    (v.governance !== SINGLE_OPERATOR || v.independentHumanReview !== false)
  )
    releaseDeny('single_operator_disclosure');
  validateAuthorizationFields(v, single ? 'single-operator' : 'independent');
  identifier(v.releaseId);
  digest(v.evidenceDigest);
  if (v.profileId !== NO_HANDOFF_PROFILE || v.profileDigest !== PROFILE_DIGEST)
    releaseDeny('production_profile');
  if (
    v.operation === 'grant' &&
    instant(v.grantExpiresAt) > instant(v.expiresAt)
  )
    releaseDeny('production_execution_window');
  return v as unknown as ProductionAuthorization;
}
