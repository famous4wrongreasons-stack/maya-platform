import {
  NO_PRICE_GOODS_PROFILE,
  NO_PRICE_GOODS_DIGEST,
  PRICE_GOODS_DUTIES,
  type ProfileCertificate,
  type ScopedSourceClause,
} from '../../../src/entitlements/widget-release-profile.contract';
import { releaseHash } from '../../../src/entitlements/widget-release.contract';

/** Artificial certificate ONLY, for admission/refusal mechanism tests.
 * Never claims real source qualification or substitutes for strict collection. */
export function firstPhoneCertificate(
  base: ProfileCertificate,
): ProfileCertificate {
  const proof = (source: string) =>
    Object.fromEntries(
      ['decisionDigest', 'absence', 'refusal', 'mechanism'].map((key) => [
        key,
        releaseHash('synthetic first-phone ' + source + ' ' + key),
      ]),
    ) as NonNullable<
      ProfileCertificate['excludedSourceProofs']
    >['servicePrice'];
  const excludedSourceProofs = {
    servicePrice: proof('servicePrice'),
    goodsReceipt: proof('goodsReceipt'),
  };
  const matrix = base.matrix.map((row) => {
    if (!PRICE_GOODS_DUTIES.includes(row.id)) return row;
    const remainder = {
      id: `FP-${row.id}`,
      state: row.id === 'G7-FR6d' ? ('L' as const) : ('U' as const),
      evidenceDigest: releaseHash('synthetic remainder ' + row.id),
      ...(row.id === 'G7-FR6d'
        ? {}
        : { u: proof('existing AE-approval absence ' + row.id) }),
    };
    const evidence = {
      remainder,
      refusalProofDigest: releaseHash('synthetic refusal ' + row.id),
      mechanismProofDigest: releaseHash('synthetic mechanism ' + row.id),
      excludedSourceProofs,
    };
    const scoped: ScopedSourceClause = {
      id: row.id,
      state: 'SCOPED',
      remainder,
      refusalProofDigest: evidence.refusalProofDigest,
      mechanismProofDigest: evidence.mechanismProofDigest,
      evidenceDigest: releaseHash(evidence),
    };
    return scoped;
  });
  return {
    ...base,
    scope: NO_PRICE_GOODS_PROFILE,
    profileDigest: NO_PRICE_GOODS_DIGEST,
    matrix,
    globalAuditDigest: releaseHash(matrix),
    excludedSourceProofs,
  };
}
