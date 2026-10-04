import { productionProof } from '../../test/widgets-live/support/widget-production-proof';
import { releaseProof } from '../../test/widgets-live/support/widget-release-proof';
import { profileCommand } from '../../test/widgets-live/support/widget-profile-proof';
import {
  NO_HANDOFF_PROFILE,
  PROFILE_DIGEST,
  profileCertificate,
} from './widget-release-profile.contract';
import {
  certificate,
  MAX_RELEASE_MS,
  RELEASE_STATE,
  releaseHash,
} from './widget-release.contract';
import { productionAuthorization } from './widget-release-production.contract';
import fs from 'node:fs';
import { releaseUnitDatabase } from '../../test/widgets-live/support/widget-release-unit-database';
const db = releaseUnitDatabase();
describe('AR1 production execution authorization (ephemeral test keys)', () => {
  const read = (p: ReturnType<typeof productionProof>, c: unknown) =>
    p.policy.read(c, 'tenant', 'grant', 'operator', new Date());
  it('PU-POSITIVE admits exact fixed profile and all subject/digest bindings', () => {
    const p = productionProof(db, 'tenant'),
      c = p.command();
    const r = read(p, c);
    expect(r.a).toEqual(c.authorization.payload);
    expect(r.c?.scope).toBe(NO_HANDOFF_PROFILE);
    expect(
      r.c?.matrix
        .filter((x) => x.state === 'STOP')
        .map((x) => x.id)
        .sort(),
    ).toEqual(['G13-R8', 'G6-6']);
    expect(r.c?.matrix).toHaveLength(165);
  });
  it('PU-MISSING caller JSON without production signature/trust is not authority', () => {
    const p = productionProof(db, 'tenant'),
      c = p.command();
    expect(() => read(p, { certificate: c.certificate })).toThrow();
    expect(() =>
      read(p, { ...c, authorization: c.authorization.payload }),
    ).toThrow();
    p.config.set('WIDGET_RELEASE_PRODUCTION_TRUST_JSON', '{}');
    expect(() => read(p, c)).toThrow();
  });
  it.each(['synthetic', 'staging'] as const)(
    'PU-DOMAIN refuses %s authorization even if its key is mistakenly trusted in production',
    (environment) => {
      const p = productionProof(db, 'tenant'),
        legacy = releaseProof(db),
        c = profileCommand(legacy, 'tenant');
      c.authorization = legacy.signOwner({
        ...c.authorization.payload,
        environment,
      });
      p.config.set(
        'WIDGET_RELEASE_PRODUCTION_TRUST_JSON',
        legacy.config.get('WIDGET_RELEASE_TRUST_JSON'),
      );
      expect(() => read(p, c)).toThrow();
    },
  );
  it('PU-TRUST production never falls back to staging keys', () => {
    const p = productionProof(db, 'tenant'),
      c = p.command();
    p.config.set(
      'WIDGET_RELEASE_TRUST_JSON',
      p.config.get('WIDGET_RELEASE_PRODUCTION_TRUST_JSON'),
    );
    p.config.set('WIDGET_RELEASE_PRODUCTION_TRUST_JSON', '{}');
    expect(() => read(p, c)).toThrow();
  });
  it.each([
    'releaseId',
    'profileId',
    'profileDigest',
    'evidenceDigest',
    'tenantId',
    'candidateSha',
    'certificateDigest',
    'operatorId',
    'approverId',
    'reviewerId',
    'expectedVersion',
    'expiresAt',
  ] as const)('PU-FORGED unsigned %s is refused', (field) => {
    const p = productionProof(db, 'tenant'),
      c = p.command();
    (c.authorization.payload as unknown as Record<string, string>)[field] =
      'forged';
    expect(() => read(p, c)).toThrow();
  });
  it.each([
    'wrong-profile',
    'wrong-profile-digest',
    'wrong-evidence',
    'wrong-certificate',
    'wrong-tenant',
    'wildcard',
    'wrong-operator',
    'reviewer',
    'expired',
    'future',
    'over24h',
    'grant-after-authorization',
  ] as const)('PU-BINDING valid signature still refuses %s', (which) => {
    const p = productionProof(db, 'tenant'),
      c = p.command(),
      a = c.authorization.payload;
    if (which === 'wrong-profile')
      a.profileId = 'full165.closed-input' as never;
    if (which === 'wrong-profile-digest') a.profileDigest = 'b'.repeat(64);
    if (which === 'wrong-evidence') a.evidenceDigest = 'b'.repeat(64);
    if (which === 'wrong-certificate') a.certificateDigest = 'b'.repeat(64);
    if (which === 'wrong-tenant') a.tenantId = 'other';
    if (which === 'wildcard') a.tenantId = '*';
    if (which === 'wrong-operator') a.operatorId = 'other';
    if (which === 'reviewer') a.reviewerId = a.approverId;
    if (which === 'expired') {
      a.expiresAt = new Date(Date.now() - 1).toISOString();
      a.grantExpiresAt = a.expiresAt;
    }
    if (which === 'future')
      a.notBefore = new Date(Date.now() + 30000).toISOString();
    if (which === 'over24h')
      a.expiresAt = new Date(Date.now() + MAX_RELEASE_MS).toISOString();
    if (which === 'grant-after-authorization')
      a.grantExpiresAt = c.certificate.payload.expiresAt;
    c.authorization = p.signOwner(a);
    expect(() => read(p, c)).toThrow();
  });
  it.each([
    '[]',
    '["other"]',
    '["*"]',
    '["tenant","*"]',
    '["tenant","tenant"]',
    '{}',
  ])('PU-ALLOWLIST strict current server tenant list %s', (list) => {
    const p = productionProof(db, 'tenant'),
      c = p.command();
    p.config.set('WIDGET_RELEASE_PRODUCTION_TENANTS_JSON', list);
    expect(() => read(p, c)).toThrow();
  });
  it('PU-READER removal of tenant allowlist revokes effective access immediately', () => {
    const p = productionProof(db, 'tenant'),
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
    expect(p.policy.view('tenant', row, now)?.scope).toBe(NO_HANDOFF_PROFILE);
    expect(p.policy.view('other', row, now)).toBeNull();
    expect(p.policy.view('tenant', row, row.expiresAt)).toBeNull();
    p.config.set('WIDGET_RELEASE_PRODUCTION_TENANTS_JSON', '[]');
    expect(p.policy.view('tenant', row, now)).toBeNull();
  });
  it.each(['candidateSha', 'buildDigest'] as const)(
    'PU-RUNNING jointly resigned %s must match running candidate',
    (field) => {
      const p = productionProof(db, 'tenant'),
        c = p.command();
      c.certificate.payload[field] = 'b'.repeat(
        field === 'candidateSha' ? 40 : 64,
      );
      c.certificate = p.signCertificate(c.certificate.payload);
      c.authorization = p.signOwner({
        ...c.authorization.payload,
        [field]: c.certificate.payload[field],
        certificateDigest: releaseHash(c.certificate),
      });
      expect(() => read(p, c)).toThrow('running_candidate');
    },
  );
  it('PU-BYTES production re-reads bytes after an earlier successful admission', () => {
    const p = productionProof(db, 'tenant'),
      c = p.command();
    expect(read(p, c).a).toMatchObject({ profileDigest: PROFILE_DIGEST });
    const original = fs.readFileSync;
    const spy = jest.spyOn(fs, 'readFileSync').mockImplementation(((
      path: fs.PathOrFileDescriptor,
      ...args: unknown[]
    ) => {
      const bytes = (original as (...a: unknown[]) => unknown)(path, ...args);
      return String(path).endsWith('widget-release-policy.service.ts') &&
        Buffer.isBuffer(bytes)
        ? Buffer.concat([
            bytes,
            Buffer.from('\n// changed after certification\n'),
          ])
        : bytes;
    }) as typeof fs.readFileSync);
    try {
      expect(() => read(p, c)).toThrow('running_candidate');
    } finally {
      spy.mockRestore();
    }
  });
  it('PU-LEGACY full contract certificate remains non-production; production is fixed-profile only', () => {
    const legacy = releaseProof(db).command('tenant').certificate.payload;
    expect(() =>
      certificate({ ...legacy, environment: 'production' }),
    ).toThrow();
    const p = productionProof(db, 'tenant'),
      c = p.command();
    expect(() =>
      profileCertificate({
        ...c.certificate.payload,
        scope: 'full165.closed-input',
      }),
    ).toThrow();
    expect(() =>
      productionAuthorization({
        ...c.authorization.payload,
        extraExclusions: ['G7-5'],
      }),
    ).toThrow();
    expect(() =>
      productionAuthorization({
        ...c.authorization.payload,
        environment: 'staging',
      }),
    ).toThrow();
  });
  it('PU-SCHEMA production fields are mandatory; exact profile cannot be extended by the caller', () => {
    const p = productionProof(db, 'tenant'),
      c = p.command();
    for (const key of [
      'releaseId',
      'profileId',
      'profileDigest',
      'evidenceDigest',
    ]) {
      const a = { ...c.authorization.payload } as Record<string, unknown>;
      delete a[key];
      expect(() => productionAuthorization(a)).toThrow();
    }
    expect(() =>
      productionAuthorization({
        ...c.authorization.payload,
        profileId: 'full165.closed-input',
      }),
    ).toThrow();
    expect(() =>
      productionAuthorization({
        ...c.authorization.payload,
        profileDigest: 'b'.repeat(64),
      }),
    ).toThrow();
  });
  it('PU-ENV non-production process cannot select production execution', () => {
    const p = productionProof(db, 'tenant'),
      c = p.command();
    p.config.set('NODE_ENV', 'test');
    expect(() => read(p, c)).toThrow('environment');
  });
});
