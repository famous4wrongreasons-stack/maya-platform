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

export function productionAuthorization(
  value: unknown,
): ProductionReleaseAuthorization {
  const v = exact(value, [
    ...RELEASE_AUTHORIZATION_KEYS,
    'releaseId',
    'profileId',
    'profileDigest',
    'evidenceDigest',
  ]);
  if (
    v.contract !== PRODUCTION_RELEASE_AUTH ||
    v.environment !== 'production' ||
    !['grant', 'revoke'].includes(String(v.operation))
  )
    releaseDeny('production_authorization');
  validateAuthorizationFields(v);
  identifier(v.releaseId);
  digest(v.evidenceDigest);
  if (v.profileId !== NO_HANDOFF_PROFILE || v.profileDigest !== PROFILE_DIGEST)
    releaseDeny('production_profile');
  if (
    v.operation === 'grant' &&
    instant(v.grantExpiresAt) > instant(v.expiresAt)
  )
    releaseDeny('production_execution_window');
  return v as unknown as ProductionReleaseAuthorization;
}
