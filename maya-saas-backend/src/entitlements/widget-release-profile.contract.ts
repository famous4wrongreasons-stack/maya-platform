import {
  PROFILE_REGISTRY,
  PROFILE_SNAPSHOT,
} from './widget-release-profile.registry';
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

/** Fixed server-owned releases; never caller-supplied exclusions. */
export const NO_HANDOFF_PROFILE = 'closed-input.no-handoff@1' as const;
export const PROFILE_CERT =
  'maya.widget-release-profile-certificate/2' as const;
// Explicit candidate re-pin; prior source is retained in integration evidence.
export const PROFILE_REGISTRY_DIGEST = PROFILE_SNAPSHOT.registryDigest;
export const PROFILE_MANIFEST = Object.freeze({
  id: NO_HANDOFF_PROFILE,
  registryDigest: PROFILE_REGISTRY_DIGEST,
  excludedDuties: Object.freeze(['G6-6', 'G13-R8']),
  combinations: PROFILE_REGISTRY,
  forbiddenEffect: 'HANDOFF',
  unavailableKinds: PROFILE_SNAPSHOT.unavailableKinds,
  templates: PROFILE_SNAPSHOT.templates,
});
export const PROFILE_DIGEST = releaseHash(PROFILE_MANIFEST);
/** Owner decision B, 2026-10-15. The existing profile/digest above is unchanged. */
export const NO_PRICE_GOODS_PROFILE =
  'closed-input.no-handoff.no-price-goods@1' as const;
export type FixedReleaseProfile =
  typeof NO_HANDOFF_PROFILE | typeof NO_PRICE_GOODS_PROFILE;
export const PRICE_GOODS_TEMPLATES: readonly string[] = Object.freeze([
  'commit.service-price.approve@1',
  'commit.service-price.reject@1',
  'navigate.service-price.detail@1',
  'commit.goods-receipt.approve@1',
  'commit.goods-receipt.reject@1',
  'navigate.goods-receipt.detail@1',
]);
export const PRICE_GOODS_OPERATIONS: readonly string[] = Object.freeze([
  'catalog.service.price.update',
  'inventory.goods.receipt.prepare',
  'crm.service.fixed-price.update.v1',
  'crm.goods.receipt.create.v1',
]);
export const PRICE_GOODS_DUTIES: readonly string[] = Object.freeze([
  'G7-FR6d',
  'G11-I4',
  'G11-I5',
  'G11-I6',
  'G11-I10',
  'G13-I1',
  'G13-I2',
  'G13-I9',
]);
export const NO_PRICE_GOODS_MANIFEST = Object.freeze({
  ...PROFILE_MANIFEST,
  id: NO_PRICE_GOODS_PROFILE,
  templates: Object.freeze(
    PROFILE_MANIFEST.templates.filter(
      (t) => !PRICE_GOODS_TEMPLATES.includes(t),
    ),
  ),
  combinations: Object.freeze({
    ...PROFILE_REGISTRY,
    tuples: Object.freeze(
      Object.fromEntries(
        Object.entries(PROFILE_REGISTRY.tuples).filter(
          ([t]) => !PRICE_GOODS_TEMPLATES.includes(t),
        ),
      ),
    ),
    successorCapabilities: Object.freeze(
      PROFILE_REGISTRY.successorCapabilities.filter(
        (k) => !PRICE_GOODS_OPERATIONS.includes(k),
      ),
    ),
  }),
  forbiddenOperations: PRICE_GOODS_OPERATIONS,
  sourceBranches: Object.freeze(['F32a/F74a', 'F32b/F74b']),
  sourceDuties: PRICE_GOODS_DUTIES,
});
export const NO_PRICE_GOODS_DIGEST = releaseHash(NO_PRICE_GOODS_MANIFEST);
/** Finite switch only. No registry registration/configuration API. */
export function fixedProfile(scope: unknown) {
  if (scope === NO_HANDOFF_PROFILE)
    return { manifest: PROFILE_MANIFEST, digest: PROFILE_DIGEST };
  if (scope === NO_PRICE_GOODS_PROFILE)
    return { manifest: NO_PRICE_GOODS_MANIFEST, digest: NO_PRICE_GOODS_DIGEST };
  return releaseDeny('profile_binding');
}
export type ExcludedSourceProof = {
  decisionDigest: string;
  absence: string;
  refusal: string;
  mechanism: string;
};
export interface HandoffStop {
  id: 'G6-6' | 'G13-R8';
  state: 'STOP';
  evidenceDigest: string;
}
export interface ProfileCertificate extends Omit<
  ReleaseCertificate,
  'contract' | 'scope' | 'matrix' | 'environment'
> {
  contract: typeof PROFILE_CERT;
  environment: ReleaseCertificate['environment'] | 'production';
  scope: FixedReleaseProfile;
  excludedSourceProofs?: {
    servicePrice: ExcludedSourceProof;
    goodsReceipt: ExcludedSourceProof;
  };
  certification: 'CERTIFIED_FOR_PROFILE';
  profileDigest: string;
  globalAuditDigest: string;
  isolationProofDigest: string;
  dependencyProofDigest: string;
  matrix: (ReleaseClause | HandoffStop)[];
}

/** Validate the unchanged V1 common contract and each applicable duty without relabelling STOP. */
export function profileCertificate(value: unknown): ProfileCertificate {
  const narrow = object(value).scope === NO_PRICE_GOODS_PROFILE;
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
    ...(narrow ? ['excludedSourceProofs'] : []),
  ]);
  const selected = fixedProfile(v.scope);
  if (
    v.contract !== PROFILE_CERT ||
    v.certification !== 'CERTIFIED_FOR_PROFILE' ||
    v.profileDigest !== selected.digest ||
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
  if (narrow) {
    const sources = exact(v.excludedSourceProofs, [
      'servicePrice',
      'goodsReceipt',
    ]);
    for (const name of ['servicePrice', 'goodsReceipt']) {
      const proof = exact(sources[name], [
        'decisionDigest',
        'absence',
        'refusal',
        'mechanism',
      ]);
      for (const value of Object.values(proof)) digest(value);
    }
  }
  for (const row of v.matrix) {
    const r = object(row);
    if (PROFILE_MANIFEST.excludedDuties.includes(String(r.id))) {
      exact(r, ['id', 'state', 'evidenceDigest']);
      if (r.state !== 'STOP') releaseDeny('handoff_stop');
      digest(r.evidenceDigest);
    } else {
      validateReleaseClause(r);
      // Shared duties are retained. Negative source proof cannot turn them into whole-clause U.
      if (
        narrow &&
        PRICE_GOODS_DUTIES.includes(String(r.id)) &&
        r.state !== 'L-T'
      )
        releaseDeny('source_threshold');
    }
  }
  // Common fields are checked by the V1 parser's extracted common validator. It sees no matrix.
  releaseCertificateHeader(v, true);
  return v as unknown as ProfileCertificate;
}

// Re-exporting the unchanged parser makes explicit that a profile certificate is never a V1 one.
export { certificate as fullContractCertificate };

import {
  releaseCertificateHeader,
  validateReleaseClause,
} from './widget-release.contract';
