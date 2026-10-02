// Ephemeral synthetic attestation. This helper never claims the current Maya candidate is certified.
import {
  releaseHash,
  type ReleaseCommand,
  type Signed,
  type ReleaseAuthorization,
} from '../../../src/entitlements/widget-release.contract';
import {
  NO_HANDOFF_PROFILE,
  PROFILE_CERT,
  PROFILE_DIGEST,
  PROFILE_REGISTRY_DIGEST,
  type ProfileCertificate,
} from '../../../src/entitlements/widget-release-profile.contract';
import type { releaseProof } from './widget-release-proof';

export function profileCommand(
  p: ReturnType<typeof releaseProof>,
  tenant: string,
  version = 'absent',
): ReleaseCommand & {
  authorization: Signed<ReleaseAuthorization>;
  certificate: Signed<ProfileCertificate>;
} {
  const base = p.command(tenant, version);
  const matrix: ProfileCertificate['matrix'] =
    base.certificate.payload.matrix.map((row) =>
      row.id === 'G6-6' || row.id === 'G13-R8'
        ? { id: row.id, state: 'STOP', evidenceDigest: row.evidenceDigest }
        : row,
    );
  const payload: ProfileCertificate = {
    ...base.certificate.payload,
    contract: PROFILE_CERT,
    scope: NO_HANDOFF_PROFILE,
    certification: 'CERTIFIED_FOR_PROFILE',
    matrix,
    profileDigest: PROFILE_DIGEST,
    registryDigest: PROFILE_REGISTRY_DIGEST,
    globalAuditDigest: releaseHash(matrix),
    isolationProofDigest: releaseHash('synthetic isolation'),
    dependencyProofDigest: releaseHash('synthetic dependency proof'),
  };
  const cert = p.signCertificate(
    payload as never,
  ) as unknown as Signed<ProfileCertificate>;
  return {
    certificate: cert,
    authorization: p.signOwner({
      ...base.authorization.payload,
      certificateDigest: releaseHash(cert),
    }),
  };
}
