import { firstPhoneCertificate } from '../../test/widgets-live/support/widget-first-phone-proof';
import { singleOperatorProof } from '../../test/widgets-live/support/widget-single-operator-proof';
import { stagingOperatorProof } from '../../test/widgets-live/support/widget-staging-operator-proof';
import { releaseUnitDatabase } from '../../test/widgets-live/support/widget-release-unit-database';
import { profileCommand } from '../../test/widgets-live/support/widget-profile-proof';
import { releaseProof } from '../../test/widgets-live/support/widget-release-proof';
import { certificate, releaseHash } from './widget-release.contract';
import {
  NO_PRICE_GOODS_PROFILE,
  NO_PRICE_GOODS_DIGEST,
  NO_PRICE_GOODS_MANIFEST,
  NO_HANDOFF_PROFILE,
  PROFILE_DIGEST,
  PROFILE_MANIFEST,
  PRICE_GOODS_TEMPLATES,
  PRICE_GOODS_OPERATIONS,
  PRICE_GOODS_DUTIES,
  profileCertificate,
  fixedProfile,
} from './widget-release-profile.contract';

const fixture = () => {
  const p = singleOperatorProof(releaseUnitDatabase(), 'tenant');
  const c = p.command();
  c.certificate = firstPhoneCertificate(c.certificate);
  c.authorization = p.signOwner({
    ...c.authorization.payload,
    profileId: NO_PRICE_GOODS_PROFILE,
    profileDigest: NO_PRICE_GOODS_DIGEST,
    certificateDigest: releaseHash(c.certificate),
  });
  return { p, c };
};

describe('FIRST-PHONE fixed profile; artificial certificates only', () => {
  it('FP-PIN removes exactly six templates and four operation keys; preserves original profile', () => {
    expect(NO_PRICE_GOODS_DIGEST).not.toBe(PROFILE_DIGEST);
    expect(
      PROFILE_MANIFEST.templates
        .filter((t) => !NO_PRICE_GOODS_MANIFEST.templates.includes(t))
        .sort(),
    ).toEqual([...PRICE_GOODS_TEMPLATES].sort());
    for (const key of PRICE_GOODS_TEMPLATES) {
      expect(Object.keys(PROFILE_MANIFEST.combinations.tuples)).toContain(key);
      expect(
        Object.keys(NO_PRICE_GOODS_MANIFEST.combinations.tuples),
      ).not.toContain(key);
    }
    expect(NO_PRICE_GOODS_MANIFEST.forbiddenOperations).toEqual(
      PRICE_GOODS_OPERATIONS,
    );
    expect(NO_PRICE_GOODS_MANIFEST.excludedDuties).toEqual(['G6-6', 'G13-R8']);
    expect(NO_PRICE_GOODS_MANIFEST.templates).toEqual(
      expect.arrayContaining([
        'navigate.personal-booking@1',
        'navigate.personal-catalog@1',
        'navigate.journal.detail@1',
      ]),
    );
    expect(fixedProfile(NO_HANDOFF_PROFILE).digest).toBe(PROFILE_DIGEST);
    expect(() => fixedProfile('caller-profile')).toThrow();
  });
  it('FP-THRESHOLD retains all 165 IDs, two global STOP and eight mandatory shared L-T duties', () => {
    const { c } = fixture();
    const parsed = profileCertificate(c.certificate);
    expect(parsed.matrix).toHaveLength(165);
    expect(
      parsed.matrix
        .filter((r) => r.state === 'STOP')
        .map((r) => r.id)
        .sort(),
    ).toEqual(['G13-R8', 'G6-6']);
    expect(
      parsed.matrix
        .filter((r) => PRICE_GOODS_DUTIES.includes(r.id))
        .every((r) => r.state === 'L-T'),
    ).toBe(true);
    expect(() => certificate(parsed)).toThrow();
  });
  it.each(PRICE_GOODS_DUTIES)(
    'FP-SHARED %s cannot become whole-clause U/STOP/L',
    (id) => {
      const { c } = fixture();
      for (const state of ['U', 'STOP', 'L']) {
        const matrix = c.certificate.matrix.map((r) =>
          r.id === id
            ? {
                id,
                state,
                evidenceDigest: r.evidenceDigest,
                ...(state === 'U'
                  ? { u: c.certificate.excludedSourceProofs!.servicePrice }
                  : {}),
              }
            : r,
        );
        expect(() =>
          profileCertificate({
            ...c.certificate,
            matrix,
            globalAuditDigest: releaseHash(matrix),
          }),
        ).toThrow();
      }
    },
  );
  it.each(['servicePrice', 'goodsReceipt'] as const)(
    'FP-OD3 %s requires every excluded source duty',
    (source) => {
      const { c } = fixture();
      for (const key of ['decisionDigest', 'absence', 'refusal', 'mechanism']) {
        const next = structuredClone(c.certificate) as unknown as {
          excludedSourceProofs: Record<string, Record<string, unknown>>;
        };
        delete next.excludedSourceProofs[source][key];
        expect(() => profileCertificate(next)).toThrow();
        next.excludedSourceProofs[source][key] = 'not-a-digest';
        expect(() => profileCertificate(next)).toThrow();
      }
      const missing = structuredClone(c.certificate) as unknown as {
        excludedSourceProofs: Record<string, Record<string, unknown>>;
      };
      delete missing.excludedSourceProofs[source];
      expect(() => profileCertificate(missing)).toThrow();
    },
  );
  it.each([
    '9.6',
    'G7-5',
    'G7-BOOK1',
    'G11-I9',
    'G13-I3',
    'G12-R1b',
    'G12-I11',
    'G13-R2',
  ])('FP-REMAINDER %s still mandatory', (id) => {
    const { c } = fixture();
    const matrix = c.certificate.matrix.map((r) =>
      r.id === id ? { ...r, state: 'STOP' } : r,
    );
    expect(() =>
      profileCertificate({
        ...c.certificate,
        matrix,
        globalAuditDigest: releaseHash(matrix),
      }),
    ).toThrow();
  });
  it('FP-ISSUER exact single-operator signature admits new scope without fabricating review', () => {
    const { p, c } = fixture();
    const parsed = p.policy.read(c, 'tenant', 'grant', 'operator', new Date());
    expect(parsed.c).toMatchObject({ scope: NO_PRICE_GOODS_PROFILE });
    expect(parsed.a).toMatchObject({
      independentHumanReview: false,
      reviewerId: null,
    });
  });
  it('FP-STAGING same fixed scope uses existing staging execution authorization', () => {
    const p = stagingOperatorProof(
      'postgresql://proof@127.0.0.1:55729/maya_widget_release_staging_proof_abcdef123456',
      'tenant',
    );
    const c = p.command();
    c.certificate = firstPhoneCertificate(c.certificate);
    c.authorization = p.signOwner({
      ...c.authorization.payload,
      profileId: NO_PRICE_GOODS_PROFILE,
      profileDigest: NO_PRICE_GOODS_DIGEST,
      certificateDigest: releaseHash(c.certificate),
    });
    expect(
      p.policy.read(c, 'tenant', 'grant', 'operator', new Date()).c,
    ).toMatchObject({ scope: NO_PRICE_GOODS_PROFILE });
  });
  it('FP-NO-LEGACY new scope cannot use a legacy authorization without exact profile binding', () => {
    const p = releaseProof(releaseUnitDatabase(), 'operator');
    const old = profileCommand(p, 'tenant');
    const signed = p.signCertificate(
      firstPhoneCertificate(old.certificate.payload),
    );
    const c = {
      certificate: signed,
      authorization: p.signOwner({
        ...old.authorization.payload,
        certificateDigest: releaseHash(signed),
      }),
    };
    expect(() =>
      p.policy.read(c, 'tenant', 'grant', 'operator', new Date()),
    ).toThrow();
  });
  it.each([
    { profileId: NO_HANDOFF_PROFILE, profileDigest: PROFILE_DIGEST },
    { profileDigest: PROFILE_DIGEST },
    { tenantId: 'foreign' },
    { tenantId: '*' },
    { certificateDigest: 'b'.repeat(64) },
    { candidateSha: 'b'.repeat(40) },
    { independentHumanReview: true },
    { reviewerId: 'invented' },
    { expiresAt: new Date(0).toISOString() },
    { notBefore: '2099-01-01T00:00:00.000Z' },
  ])('FP-SUBSTITUTION signed override refused %j', (over) => {
    const { p, c } = fixture();
    c.authorization = p.signOwner({
      ...c.authorization.payload,
      ...over,
    } as typeof c.authorization.payload);
    expect(() =>
      p.policy.read(c, 'tenant', 'grant', 'operator', new Date()),
    ).toThrow();
  });
  it('FP-NO-CALLER-EXCLUSIONS refuses a caller list and old certificate with new authorization', () => {
    const { p, c } = fixture();
    expect(() =>
      profileCertificate({ ...c.certificate, exclusions: ['9.6'] }),
    ).toThrow();
    c.certificate = p.command().certificate;
    c.authorization = p.signOwner({
      ...c.authorization.payload,
      certificateDigest: releaseHash(c.certificate),
    });
    expect(() =>
      p.policy.read(c, 'tenant', 'grant', 'operator', new Date()),
    ).toThrow();
  });
});
