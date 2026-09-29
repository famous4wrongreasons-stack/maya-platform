import { PROFILE_REGISTRY } from './widget-release-profile.registry';
import {
  certificate,
  digest,
  exact,
  object,
  releaseDeny,
  releaseHash,
  type ReleaseCertificate,
  type ReleaseClause,
} from './widget-release.contract';
import { WIDGET_RELEASE_CLAUSES } from './widget-release-clauses';

/** The only restricted release. This is server code, not a caller-supplied exclusion list. */
export const NO_HANDOFF_PROFILE = 'closed-input.no-handoff@1' as const;
export const PROFILE_CERT =
  'maya.widget-release-profile-certificate/2' as const;
export const PROFILE_REGISTRY_DIGEST =
  'afd195773728fc99ce6a985adb3cc5a5c6ac9c646720ce73f957c9f0331b1716';
export const PROFILE_MANIFEST = Object.freeze({
  id: NO_HANDOFF_PROFILE,
  registryDigest: PROFILE_REGISTRY_DIGEST,
  excludedDuties: Object.freeze(['G6-6', 'G13-R8']),
  combinations: PROFILE_REGISTRY,
  forbiddenEffect: 'HANDOFF',
  templates: Object.freeze([
    'none.passive@1',
    'navigate.account@1',
    'navigate.schedule@1',
    'refine.measurement@1',
    'refine.measurement.period@1',
    'refine.journal.date@1',
    'refine.successor@1',
    'control.dismiss@1',
    'control.run.cancel@1',
    'refine.booking.service@1',
    'refine.booking.staff@1',
    'draft.booking.selection@1',
    'draft.booking.create@1',
    'refine.booking.reschedule@1',
    'refine.booking.cancel@1',
    'commit.booking.create@1',
    'commit.booking.reschedule@1',
    'commit.booking.cancel@1',
  ]),
});
export const PROFILE_DIGEST = releaseHash(PROFILE_MANIFEST);
export interface HandoffStop {
  id: 'G6-6' | 'G13-R8';
  state: 'STOP';
  evidenceDigest: string;
}
export interface ProfileCertificate extends Omit<
  ReleaseCertificate,
  'contract' | 'scope' | 'matrix'
> {
  contract: typeof PROFILE_CERT;
  scope: typeof NO_HANDOFF_PROFILE;
  certification: 'CERTIFIED_FOR_PROFILE';
  profileDigest: string;
  globalAuditDigest: string;
  isolationProofDigest: string;
  dependencyProofDigest: string;
  matrix: (ReleaseClause | HandoffStop)[];
}

/** Validate the unchanged V1 common contract and each applicable duty without relabelling STOP. */
export function profileCertificate(value: unknown): ProfileCertificate {
  const v = exact(value, [
    'contract',
    'environment',
    'scope',
    'candidateSha',
    'buildDigest',
    'carrierDigest',
    'registryDigest',
    'evidenceDigest',
    'integrationDigest',
    'fbe2eDigest',
    'revocationProofDigest',
    'issuedAt',
    'expiresAt',
    'matrix',
    'certification',
    'profileDigest',
    'globalAuditDigest',
    'isolationProofDigest',
    'dependencyProofDigest',
  ]);
  if (
    v.contract !== PROFILE_CERT ||
    v.scope !== NO_HANDOFF_PROFILE ||
    v.certification !== 'CERTIFIED_FOR_PROFILE' ||
    v.profileDigest !== PROFILE_DIGEST ||
    v.registryDigest !== PROFILE_REGISTRY_DIGEST
  )
    releaseDeny('profile_binding');
  for (const field of [
    'globalAuditDigest',
    'isolationProofDigest',
    'dependencyProofDigest',
  ])
    digest(v[field]);
  if (
    !Array.isArray(v.matrix) ||
    v.matrix.length !== WIDGET_RELEASE_CLAUSES.length ||
    v.matrix
      .map((row) => object(row).id)
      .sort()
      .join('|') !== [...WIDGET_RELEASE_CLAUSES].sort().join('|')
  )
    releaseDeny('profile_threshold');
  if (v.globalAuditDigest !== releaseHash(v.matrix))
    releaseDeny('global_audit_binding');
  for (const row of v.matrix) {
    const r = object(row);
    if (PROFILE_MANIFEST.excludedDuties.includes(String(r.id))) {
      exact(r, ['id', 'state', 'evidenceDigest']);
      if (r.state !== 'STOP') releaseDeny('handoff_stop');
      digest(r.evidenceDigest);
    } else {
      validateReleaseClause(r);
    }
  }
  // Common fields are checked by the V1 parser's extracted common validator. It sees no matrix.
  releaseCertificateHeader(v);
  return v as unknown as ProfileCertificate;
}

// Re-exporting the unchanged parser makes explicit that a profile certificate is never a V1 one.
export { certificate as fullContractCertificate };

import {
  releaseCertificateHeader,
  validateReleaseClause,
} from './widget-release.contract';
