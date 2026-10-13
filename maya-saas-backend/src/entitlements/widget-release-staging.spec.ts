import { stagingOperatorProof } from '../../test/widgets-live/support/widget-staging-operator-proof';
import { productionProof } from '../../test/widgets-live/support/widget-production-proof';
import { productionAuthorization } from './widget-release-production.contract';
import {
  stagingSingleOperatorAuthorization,
  STAGING_SINGLE_OPERATOR_TRUST,
  STAGING_SINGLE_OPERATOR_TENANTS,
} from './widget-release-staging.contract';
import {
  releaseHash,
  RELEASE_STATE,
  MAX_RELEASE_MS,
} from './widget-release.contract';
import fs from 'node:fs';
import { releaseUnitDatabase } from '../../test/widgets-live/support/widget-release-unit-database';
const db =
  'postgresql://staging_proof@127.0.0.1:55729/maya_widget_release_staging_proof_123456abcdef';
const read = (p: ReturnType<typeof stagingOperatorProof>, c: unknown) =>
  p.policy.read(c, 'tenant', 'grant', 'operator', new Date());
describe('AR1 local staging single operator; separate trust and execution lineage', () => {
  it('LSO-POSITIVE single signature binds raw certificate and disclosure; no security identity exists', () => {
    const p = stagingOperatorProof(db, 'tenant'),
      c = p.command();
    expect(
      Object.keys(
        JSON.parse(
          p.config.getOrThrow<string>(STAGING_SINGLE_OPERATOR_TRUST),
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
  it('LSO-CONTRACT no reviewer identity, explicit absence of review and same actual approver/operator are mandatory before signing', () => {
    const a = stagingOperatorProof(db, 'tenant').command().authorization
      .payload;
    for (const over of [
      { reviewerId: 'operator' },
      { reviewerId: 'invented' },
      { approverId: 'other' },
      { independentHumanReview: true },
      { governance: 'independent-review' },
    ])
      expect(() =>
        stagingSingleOperatorAuthorization({ ...a, ...over }),
      ).toThrow();
  });
  it.each(['governance', 'independentHumanReview', 'reviewerId'])(
    'LSO-DISCLOSURE mandatory %s',
    (field) => {
      const a = {
        ...stagingOperatorProof(db, 'tenant').command().authorization.payload,
      } as Record<string, unknown>;
      delete a[field];
      expect(() => stagingSingleOperatorAuthorization(a)).toThrow();
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
    ['production', { environment: 'production' }],
    ['extra-exclusion', { extraExclusions: ['G7-5'] }],
  ])('LSO-BINDING signed %s is refused', (_name, over) => {
    const p = stagingOperatorProof(db, 'tenant'),
      c = p.command();
    c.authorization = p.signOwner({
      ...c.authorization.payload,
      ...(over as object),
    });
    expect(() => read(p, c)).toThrow();
  });
  it.each(['expired', 'future', 'over24h', 'grant-after-authorization'])(
    'LSO-WINDOW %s',
    (which) => {
      const p = stagingOperatorProof(db, 'tenant'),
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
  it('LSO-SIGNATURE missing signature, caller JSON, tampered certificate and staging fallback refuse', () => {
    const p = stagingOperatorProof(db, 'tenant'),
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
      p.config.get(STAGING_SINGLE_OPERATOR_TRUST),
    );
    p.config.set(STAGING_SINGLE_OPERATOR_TRUST, '{}');
    expect(() => read(p, c)).toThrow();
  });
  it('LSO-NO-SELF-SIGNATURE second certificate signature and V1 downgrade cannot substitute', () => {
    const p = stagingOperatorProof(db, 'tenant'),
      c = p.command(),
      old = productionProof(releaseUnitDatabase(), 'tenant').command();
    expect(() => read(p, { ...c, certificate: old.certificate })).toThrow();
    const a = {
      ...c.authorization.payload,
      contract: 'maya.widget-release-production-authorization/1',
    };
    expect(() => stagingSingleOperatorAuthorization(a)).toThrow();
  });
  it.each(['candidateSha', 'buildDigest'] as const)(
    'LSO-RUNNING correctly signed wrong %s refuses',
    (field) => {
      const p = stagingOperatorProof(db, 'tenant'),
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
  it('LSO-BYTES re-reads bytes and refuses a changed build after admission', () => {
    const p = stagingOperatorProof(db, 'tenant'),
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
  it('LSO-MULTITENANT same global principal supports distinct ordinary tenants with separately bound grants', () => {
    const p = stagingOperatorProof(db, 'tenant');
    p.config.set(
      STAGING_SINGLE_OPERATOR_TENANTS,
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
  it('LSO-READER disclosure survives persistence; expiry, foreign row and allowlist removal disable access', () => {
    const p = stagingOperatorProof(db, 'tenant'),
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
    p.config.set(STAGING_SINGLE_OPERATOR_TENANTS, '[]');
    expect(p.policy.view('tenant', row, now)).toBeNull();
  });
});

describe('Local staging environment isolation', () => {
  it.each(['production', 'synthetic'])(
    'LSO-ENV staging execution cannot run as %s',
    (environment) => {
      const p = stagingOperatorProof(db, 'tenant'),
        c = p.command();
      p.config.set(
        'NODE_ENV',
        environment === 'production' ? 'production' : 'test',
      );
      p.config.set('WIDGET_RELEASE_ENVIRONMENT', environment);
      expect(() => read(p, c)).toThrow();
      expect(() => productionAuthorization(c.authorization.payload)).toThrow();
    },
  );
  it.each([
    'WIDGET_RELEASE_TRUST_JSON',
    'WIDGET_RELEASE_PRODUCTION_TRUST_JSON',
  ])('LSO-TRUST no fallback to %s', (key) => {
    const p = stagingOperatorProof(db, 'tenant'),
      c = p.command();
    p.config.set(key, p.config.get(STAGING_SINGLE_OPERATOR_TRUST));
    p.config.set(STAGING_SINGLE_OPERATOR_TRUST, '{}');
    expect(() => read(p, c)).toThrow();
  });
  it.each([
    'postgresql://proof@remote.example:55729/maya_widget_release_staging_x',
    'postgresql://proof@127.0.0.1:5432/maya_widget_release_staging_x',
    'postgresql://proof@127.0.0.1/maya_widget_release_staging_x',
    'postgresql://proof@127.0.0.1:55729/maya_local_onboarding_x',
    'postgresql://proof@127.0.0.1:55729/maya_widget_gate_proof_x',
    'postgresql://proof@127.0.0.1:55729/maya_widget_release_staging_x?host=remote.example',
  ])('LSO-DATABASE refuses ineligible database %s', (url) => {
    const p = stagingOperatorProof(db, 'tenant'),
      c = p.command();
    p.config.set('DATABASE_URL', url);
    expect(() => read(p, c)).toThrow();
  });
  it('LSO-NO-FIXTURE local staging never accepts a widgets-live fixture entitlement', () => {
    const p = stagingOperatorProof(db, 'tenant');
    expect(
      p.policy.view(
        'tenant',
        {
          enabled: true,
          expiresAt: new Date(Date.now() + 10000),
          configJson: null,
          reason: 'widgets-live proof-database fixture',
        },
        new Date(),
      ),
    ).toBeNull();
  });
  it('LSO-TRUST-REVOCATION signed authorization loses access when its trusted key is removed', () => {
    const p = stagingOperatorProof(db, 'tenant'),
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
    expect(p.policy.view('tenant', row, now)).not.toBeNull();
    p.config.set(STAGING_SINGLE_OPERATOR_TRUST, '{}');
    expect(p.policy.view('tenant', row, now)).toBeNull();
    expect(() => read(p, c)).toThrow();
  });
});

it.each(['production', 'unknown', ''])(
  'LSO-RUNTIME nonlocal runtime %s refused',
  (runtime) => {
    const p = stagingOperatorProof(db, 'tenant'),
      c = p.command();
    p.config.set('NODE_ENV', runtime);
    expect(() => read(p, c)).toThrow();
  },
);

it('LSO-FORGED unsigned edits and invalid cryptographic signatures refuse', () => {
  const p = stagingOperatorProof(db, 'tenant'),
    c = p.command();
  c.authorization.signature = 'a'.repeat(86);
  expect(() => read(p, c)).toThrow('signature');
});
