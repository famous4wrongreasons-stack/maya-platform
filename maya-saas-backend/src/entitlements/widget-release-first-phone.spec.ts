import { firstPhoneCertificate } from '../../test/widgets-live/support/widget-first-phone-proof';
import { singleOperatorProof } from '../../test/widgets-live/support/widget-single-operator-proof';
import { stagingOperatorProof } from '../../test/widgets-live/support/widget-staging-operator-proof';
import { releaseUnitDatabase } from '../../test/widgets-live/support/widget-release-unit-database';
import { profileCommand } from '../../test/widgets-live/support/widget-profile-proof';
import { releaseProof } from '../../test/widgets-live/support/widget-release-proof';
import { firstPhoneSourceCensus } from '../../test/widgets-live/support/first-phone-source-census';
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
  type ProfileCertificate,
} from './widget-release-profile.contract';

const rebind = (c: ProfileCertificate) => {
  for (const row of c.matrix)
    if (row.state === 'SCOPED')
      row.evidenceDigest = releaseHash({
        remainder: row.remainder,
        refusalProofDigest: row.refusalProofDigest,
        mechanismProofDigest: row.mechanismProofDigest,
        excludedSourceProofs: c.excludedSourceProofs,
      });
  c.globalAuditDigest = releaseHash(c.matrix);
  return c;
};

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
  it('FP-CENSUS actual source registry has only excluded approval carriers and preserves the existing B35 owner', () => {
    expect(firstPhoneSourceCensus().b35OwnerPreserved).toBe(true);
  });
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
  it('FP-THRESHOLD retains all 165 IDs, two STOP and eight separately proven shared branches', () => {
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
        .every((r) => r.state === 'SCOPED'),
    ).toBe(true);
    expect(() => certificate(parsed)).toThrow();
    expect(() =>
      profileCertificate({
        ...parsed,
        scope: NO_HANDOFF_PROFILE,
        profileDigest: PROFILE_DIGEST,
      }),
    ).toThrow();
  });
  it.each(PRICE_GOODS_DUTIES)(
    'FP-SHARED %s cannot become whole-clause U/STOP/L/L-T',
    (id) => {
      const { c } = fixture();
      for (const state of ['U', 'STOP', 'L', 'L-T']) {
        const withBranches = structuredClone(c.certificate);
        Object.assign(
          withBranches.matrix.find((r) => r.id === id)!,
          { state },
        );
        withBranches.globalAuditDigest = releaseHash(withBranches.matrix);
        expect(() => profileCertificate(withBranches)).toThrow();
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
  it.each(PRICE_GOODS_DUTIES)(
    'FP-BRANCH %s requires exact remainder, refusal, mechanism and proof binding',
    (id) => {
      const { c } = fixture();
      for (const alteration of [
        'missing',
        'wrong-id',
        'wrong-state',
        'missing-u-duty',
        'refusal',
        'mechanism',
        'digest',
      ]) {
        const next = structuredClone(c.certificate);
        const row = next.matrix.find((r) => r.id === id)!;
        if (row.state !== 'SCOPED') throw new Error('fixture');
        if (alteration === 'missing') Reflect.deleteProperty(row, 'remainder');
        if (alteration === 'wrong-id') row.remainder.id = '9.6';
        if (alteration === 'wrong-state')
          row.remainder.state = id === 'G7-FR6d' ? 'L-T' : 'L';
        if (alteration === 'missing-u-duty') {
          if (!row.remainder.u) continue;
          Reflect.deleteProperty(row.remainder.u, 'absence');
        }
        if (alteration === 'refusal') row.refusalProofDigest = 'invalid';
        if (alteration === 'mechanism') row.mechanismProofDigest = 'invalid';
        if (alteration !== 'missing') rebind(next);
        else next.globalAuditDigest = releaseHash(next.matrix);
        if (alteration === 'digest') {
          row.evidenceDigest = 'e'.repeat(64);
          next.globalAuditDigest = releaseHash(next.matrix);
        }
        expect(() => profileCertificate(next)).toThrow();
      }
    },
  );
  it.each(['servicePrice', 'goodsReceipt'] as const)(
    'FP-OD3 %s requires every excluded source duty',
    (source) => {
      const { c } = fixture();
      for (const key of ['decisionDigest', 'absence', 'refusal', 'mechanism']) {
        const next = structuredClone(c.certificate);
        Reflect.deleteProperty(next.excludedSourceProofs![source], key);
        rebind(next);
        expect(() => profileCertificate(next)).toThrow();
        Object.assign(next.excludedSourceProofs![source], {
          [key]: 'not-a-digest',
        });
        rebind(next);
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
