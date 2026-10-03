import { singleOperatorProof } from '../../test/widgets-live/support/widget-single-operator-proof';
import { productionProof } from '../../test/widgets-live/support/widget-production-proof';
import { productionAuthorization } from './widget-release-production.contract';
import {
  releaseHash,
  RELEASE_STATE,
  MAX_RELEASE_MS,
} from './widget-release.contract';
import fs from 'node:fs';
const db =
  'postgresql://proof@127.0.0.1:55729/maya_widget_gate_proof_single_operator';
const read = (p: ReturnType<typeof singleOperatorProof>, c: unknown) =>
  p.policy.read(c, 'tenant', 'grant', 'operator', new Date());
describe('AR1 V2 one real platform signer; independent review explicitly absent', () => {
  it('SO-POSITIVE single signature binds raw certificate and disclosure; no security identity exists', () => {
    const p = singleOperatorProof(db, 'tenant'),
      c = p.command();
    expect(
      Object.keys(
        JSON.parse(
          p.config.getOrThrow<string>('WIDGET_RELEASE_PRODUCTION_TRUST_JSON'),
        ) as object,
      ),
    ).toEqual(['owner']);
    expect(read(p, c).a).toMatchObject({
      approverId: 'operator',
      operatorId: 'operator',
      reviewerId: null,
      governance: 'single-operator',
      independentHumanReview: false,
    });
    expect(
      c.certificate.matrix
        .filter((x) => x.state === 'STOP')
        .map((x) => x.id)
        .sort(),
    ).toEqual(['G13-R8', 'G6-6']);
  });
  it('SO-CONTRACT no reviewer identity, explicit absence of review and same actual approver/operator are mandatory before signing', () => {
    const a = singleOperatorProof(db, 'tenant').command().authorization.payload;
    for (const over of [
      { reviewerId: 'operator' },
      { reviewerId: 'invented' },
      { approverId: 'other' },
      { independentHumanReview: true },
      { governance: 'independent-review' },
    ])
      expect(() => productionAuthorization({ ...a, ...over })).toThrow();
  });
  it.each(['governance', 'independentHumanReview', 'reviewerId'])(
    'SO-DISCLOSURE mandatory %s',
    (field) => {
      const a = {
        ...singleOperatorProof(db, 'tenant').command().authorization.payload,
      } as Record<string, unknown>;
      delete a[field];
      expect(() => productionAuthorization(a)).toThrow();
    },
  );
  it.each([
    ['fabricated-reviewer', { reviewerId: 'invented-reviewer' }],
    ['self-reviewer', { reviewerId: 'operator' }],
    ['claimed-review', { independentHumanReview: true }],
    ['missing-mode', { governance: 'independent-review' }],
    ['different-approver', { approverId: 'other' }],
    ['different-operator', { operatorId: 'other' }],
    ['wrong-tenant', { tenantId: 'other' }],
    ['wildcard', { tenantId: '*' }],
    ['wrong-profile', { profileId: 'full165.closed-input' }],
    ['wrong-profile-digest', { profileDigest: 'b'.repeat(64) }],
    ['wrong-evidence', { evidenceDigest: 'b'.repeat(64) }],
    ['wrong-certificate', { certificateDigest: 'b'.repeat(64) }],
    ['staging', { environment: 'staging' }],
    ['extra-exclusion', { extraExclusions: ['G7-5'] }],
  ])('SO-BINDING signed %s is refused', (_name, over) => {
    const p = singleOperatorProof(db, 'tenant'),
      c = p.command();
    c.authorization = p.signOwner({
      ...c.authorization.payload,
      ...(over as object),
    });
    expect(() => read(p, c)).toThrow();
  });
  it.each(['expired', 'future', 'over24h', 'grant-after-authorization'])(
    'SO-WINDOW %s',
    (which) => {
      const p = singleOperatorProof(db, 'tenant'),
        c = p.command(),
        a = c.authorization.payload;
      if (which === 'expired')
        a.grantExpiresAt = a.expiresAt = new Date(Date.now() - 1).toISOString();
      if (which === 'future')
        a.notBefore = new Date(Date.now() + 30000).toISOString();
      if (which === 'over24h')
        a.grantExpiresAt = a.expiresAt = new Date(
          Date.now() + MAX_RELEASE_MS + 1000,
        ).toISOString();
      if (which === 'grant-after-authorization')
        a.grantExpiresAt = new Date(Date.parse(a.expiresAt) + 1).toISOString();
      c.authorization = p.signOwner(a);
      expect(() => read(p, c)).toThrow();
    },
  );
  it('SO-SIGNATURE missing signature, caller JSON, tampered certificate and staging fallback refuse', () => {
    const p = singleOperatorProof(db, 'tenant'),
      c = p.command();
    expect(() => read(p, { certificate: c.certificate })).toThrow();
    expect(() =>
      read(p, { ...c, authorization: c.authorization.payload }),
    ).toThrow();
    expect(() =>
      read(p, {
        ...c,
        certificate: { ...c.certificate, carrierDigest: 'b'.repeat(64) },
      }),
    ).toThrow();
    p.config.set(
      'WIDGET_RELEASE_TRUST_JSON',
      p.config.get('WIDGET_RELEASE_PRODUCTION_TRUST_JSON'),
    );
    p.config.set('WIDGET_RELEASE_PRODUCTION_TRUST_JSON', '{}');
    expect(() => read(p, c)).toThrow();
  });
  it('SO-NO-SELF-SIGNATURE second certificate signature and V1 downgrade cannot substitute', () => {
    const p = singleOperatorProof(db, 'tenant'),
      c = p.command(),
      old = productionProof(db, 'tenant').command();
    expect(() => read(p, { ...c, certificate: old.certificate })).toThrow();
    const a = {
      ...c.authorization.payload,
      contract: 'maya.widget-release-production-authorization/1',
    };
    expect(() => productionAuthorization(a)).toThrow();
  });
  it.each(['candidateSha', 'buildDigest'] as const)(
    'SO-RUNNING correctly signed wrong %s refuses',
    (field) => {
      const p = singleOperatorProof(db, 'tenant'),
        c = p.command();
      c.certificate[field] = 'b'.repeat(field === 'candidateSha' ? 40 : 64);
      c.authorization = p.signOwner({
        ...c.authorization.payload,
        [field]: c.certificate[field],
        certificateDigest: releaseHash(c.certificate),
      });
      expect(() => read(p, c)).toThrow('running_candidate');
    },
  );
  it('SO-BYTES re-reads bytes and refuses a changed build after admission', () => {
    const p = singleOperatorProof(db, 'tenant'),
      c = p.command();
    read(p, c);
    const original = fs.readFileSync;
    const spy = jest.spyOn(fs, 'readFileSync').mockImplementation(((
      path: fs.PathOrFileDescriptor,
      ...args: unknown[]
    ) => {
      const bytes = (original as (...a: unknown[]) => unknown)(path, ...args);
      return String(path).endsWith('widget-release-policy.service.ts') &&
        Buffer.isBuffer(bytes)
        ? Buffer.concat([bytes, Buffer.from('changed')])
        : bytes;
    }) as typeof fs.readFileSync);
    try {
      expect(() => read(p, c)).toThrow('running_candidate');
    } finally {
      spy.mockRestore();
    }
  });
  it('SO-MULTITENANT same global principal supports distinct ordinary tenants with separately bound grants', () => {
    const p = singleOperatorProof(db, 'tenant');
    p.config.set(
      'WIDGET_RELEASE_PRODUCTION_TENANTS_JSON',
      '["tenant","another-tenant"]',
    );
    for (const tenant of ['tenant', 'another-tenant']) {
      const c = p.command('absent', tenant);
      expect(
        p.policy.read(c, tenant, 'grant', 'operator', new Date()).a.tenantId,
      ).toBe(tenant);
      expect(() =>
        p.policy.read(
          c,
          tenant === 'tenant' ? 'another-tenant' : 'tenant',
          'grant',
          'operator',
          new Date(),
        ),
      ).toThrow();
    }
  });
  it('SO-READER disclosure survives persistence; expiry, foreign row and allowlist removal disable access', () => {
    const p = singleOperatorProof(db, 'tenant'),
      c = p.command(),
      now = new Date();
    const row = {
      enabled: true,
      expiresAt: new Date(c.authorization.payload.grantExpiresAt!),
      configJson: {
        contract: RELEASE_STATE,
        version: releaseHash('version'),
        appliedAt: now.toISOString(),
        command: c,
      },
    };
    expect(p.policy.view('tenant', row, now)).toMatchObject({
      governance: 'single-operator',
      independentHumanReview: false,
    });
    expect(p.policy.view('other', row, now)).toBeNull();
    expect(p.policy.view('tenant', row, row.expiresAt)).toBeNull();
    p.config.set('WIDGET_RELEASE_PRODUCTION_TENANTS_JSON', '[]');
    expect(p.policy.view('tenant', row, now)).toBeNull();
  });
});
