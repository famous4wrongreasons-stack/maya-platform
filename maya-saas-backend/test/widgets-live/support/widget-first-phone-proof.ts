import {
  NO_PRICE_GOODS_PROFILE,
  NO_PRICE_GOODS_DIGEST,
  PRICE_GOODS_DUTIES,
  type ProfileCertificate,
} from '../../../src/entitlements/widget-release-profile.contract';
import { releaseHash } from '../../../src/entitlements/widget-release.contract';

/** Artificial certificate ONLY, for admission/refusal mechanism tests.
 * Never claims real source qualification or substitutes for strict collection. */
export function firstPhoneCertificate(
  base: ProfileCertificate,
): ProfileCertificate {
  const matrix = base.matrix.map((row) =>
    PRICE_GOODS_DUTIES.includes(row.id)
      ? { ...row, state: 'L-T' as const }
      : row,
  );
  const proof = (source: string) =>
    Object.fromEntries(
      ['decisionDigest', 'absence', 'refusal', 'mechanism'].map((key) => [
        key,
        releaseHash('synthetic first-phone ' + source + ' ' + key),
      ]),
    ) as NonNullable<
      ProfileCertificate['excludedSourceProofs']
    >['servicePrice'];
  return {
    ...base,
    scope: NO_PRICE_GOODS_PROFILE,
    profileDigest: NO_PRICE_GOODS_DIGEST,
    matrix,
    globalAuditDigest: releaseHash(matrix),
    excludedSourceProofs: {
      servicePrice: proof('servicePrice'),
      goodsReceipt: proof('goodsReceipt'),
    },
  };
}
