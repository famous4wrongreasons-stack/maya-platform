// Ephemeral test identities ONLY. No real tenant, signing authority or provider transport.
import { assertProofDatabase } from './proof-db-guard';
import { releaseProof } from './widget-release-proof';
import { profileCommand } from './widget-profile-proof';
import {
  PRODUCTION_RELEASE_AUTH,
  type ProductionReleaseAuthorization,
} from '../../../src/entitlements/widget-release-production.contract';
import {
  releaseHash,
  type Signed,
} from '../../../src/entitlements/widget-release.contract';
import {
  NO_HANDOFF_PROFILE,
  PROFILE_DIGEST,
  type ProfileCertificate,
} from '../../../src/entitlements/widget-release-profile.contract';

export function productionProof(
  databaseUrl: string,
  tenant: string,
  operator = 'operator',
) {
  assertProofDatabase({ ...process.env, DATABASE_URL: databaseUrl });
  const p = releaseProof(databaseUrl, operator);
  p.config.set('NODE_ENV', 'production');
  p.config.set('WIDGET_RELEASE_ENVIRONMENT', 'production');
  p.config.set(
    'WIDGET_RELEASE_PRODUCTION_TRUST_JSON',
    p.config.get('WIDGET_RELEASE_TRUST_JSON'),
  );
  p.config.set('WIDGET_RELEASE_TRUST_JSON', '{}');
  p.config.set(
    'WIDGET_RELEASE_PRODUCTION_TENANTS_JSON',
    JSON.stringify([tenant]),
  );
  const signOwner = (v: ProductionReleaseAuthorization) =>
    p.signOwner(
      v as never,
    ) as unknown as Signed<ProductionReleaseAuthorization>;
  const signCertificate = (v: ProfileCertificate) =>
    p.signCertificate(v as never) as unknown as Signed<ProfileCertificate>;
  const command = (expectedVersion = 'absent') => {
    const base = profileCommand(p, tenant, expectedVersion);
    const certificate = signCertificate({
      ...base.certificate.payload,
      environment: 'production',
    });
    const authorization = signOwner({
      ...base.authorization.payload,
      contract: PRODUCTION_RELEASE_AUTH,
      environment: 'production',
      releaseId: 'synthetic-release',
      profileId: NO_HANDOFF_PROFILE,
      profileDigest: PROFILE_DIGEST,
      evidenceDigest: certificate.payload.evidenceDigest,
      certificateDigest: releaseHash(certificate),
      grantExpiresAt: base.authorization.payload.expiresAt,
    });
    return { authorization, certificate };
  };
  return {
    config: p.config,
    policy: p.policy,
    command,
    signOwner,
    signCertificate,
  };
}
