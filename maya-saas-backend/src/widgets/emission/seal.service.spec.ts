// P-SEAL — the mint half: SEAL-1 (keyed), SEAL-3 (the key version is sealed and closed).
//
// Class U (§0.5): a function-level test of the seal itself. It is not live proof of Gate 1, and it
// flips no clause. What it holds is a property no live test could observe — that the value is a KEYED
// hmac over H4's eight terms in H4's order, and not an unkeyed digest that would look identical in
// every database column and verify for anyone who can read the row.
//
// Expected values are derived independently, from `ActionIdentityService` and `stableActionJson`
// directly, so the test cannot pass by calling the code it is testing.

import { createHash } from 'node:crypto';

import {
  ActionIdentityService,
  stableActionJson,
} from '../../action-engine/action-engine.identity';
import {
  CURRENT_SEAL_KEY_VERSION,
  SEAL_KEY_ENV,
  SEAL_KEY_VERSIONS,
  SEAL_NAMESPACE,
  SealKeyUnavailableError,
  SealKeyVersionError,
  SealService,
  sealTermTuple,
  type SealTerms,
} from './seal.service';

const KEY_A = 'test-widget-seal-identity-secret-A-for-specs-only';
const KEY_B = 'test-widget-seal-identity-secret-B-for-specs-only';
const PAYLOAD = 'test-widget-seal-payload-secret-for-specs-only';

const TERMS: SealTerms = Object.freeze({
  bodyHash: 'b'.repeat(64),
  widgetId: '11111111-1111-4111-8111-111111111111',
  tenantId: 'tenant-1',
  principalProofHash: 'p'.repeat(64),
  issuedAt: new Date('2026-09-17T10:00:00.000Z'),
  expiresAt: new Date('2026-09-17T10:15:00.000Z'),
  profileId: 'pwa.v1',
});

/**
 * Runs `fn` over a `SealService` whose key comes from an environment this test owns: nothing from the
 * developer's shell reaches it, and the environment is restored whatever `fn` does.
 */
const withKey = <T>(
  identity: string | undefined,
  fn: (service: SealService) => T,
): T => {
  const before = { ...process.env };
  for (const name of [...SEAL_KEY_ENV.identity, ...SEAL_KEY_ENV.payload]) {
    delete process.env[name];
  }
  if (identity !== undefined) {
    process.env.ACTION_ENGINE_IDENTITY_SECRET = identity;
    process.env.ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET = PAYLOAD;
  }
  try {
    return fn(new SealService());
  } finally {
    for (const name of Object.keys(process.env)) {
      if (!(name in before)) delete process.env[name];
    }
    Object.assign(process.env, before);
  }
};

const sealedWith = (identity: string, terms: SealTerms = TERMS): string =>
  withKey(identity, (service) => service.seal(terms));

describe('P-SEAL — SealService (H4 at EP-MINT)', () => {
  it('SEAL-1 [U] the seal is the keyed hmac of H4: one key one value, another key another value', () => {
    const independent = new ActionIdentityService(KEY_A, PAYLOAD).hmac(
      SEAL_NAMESPACE,
      [
        TERMS.bodyHash,
        TERMS.widgetId,
        TERMS.tenantId,
        TERMS.principalProofHash,
        TERMS.issuedAt.toISOString(),
        TERMS.expiresAt.toISOString(),
        TERMS.profileId,
        CURRENT_SEAL_KEY_VERSION,
      ],
    );

    expect(sealedWith(KEY_A)).toBe(independent);
    expect(sealedWith(KEY_A)).toMatch(/^[0-9a-f]{64}$/);
    expect(sealedWith(KEY_B)).not.toBe(independent);
  });

  it('SEAL-1 [U] it is not an unkeyed digest of the same terms', () => {
    const unkeyed = createHash('sha256')
      .update(stableActionJson(sealTermTuple(TERMS)), 'utf8')
      .digest('hex');

    expect(sealedWith(KEY_A)).not.toBe(unkeyed);
    expect(sealedWith(KEY_B)).not.toBe(unkeyed);
  });

  it('SEAL-1 [U] every H4 term is covered, and the terms are positional', () => {
    const base = sealedWith(KEY_A);
    const changed: ReadonlyArray<readonly [string, SealTerms]> = [
      ['bodyHash', { ...TERMS, bodyHash: 'c'.repeat(64) }],
      [
        'widgetId',
        { ...TERMS, widgetId: '22222222-2222-4222-8222-222222222222' },
      ],
      ['tenantId', { ...TERMS, tenantId: 'tenant-2' }],
      ['principalProofHash', { ...TERMS, principalProofHash: 'q'.repeat(64) }],
      [
        'issuedAt',
        { ...TERMS, issuedAt: new Date('2026-09-17T10:00:00.001Z') },
      ],
      [
        'expiresAt',
        { ...TERMS, expiresAt: new Date('2026-09-17T10:15:00.001Z') },
      ],
      ['profileId', { ...TERMS, profileId: 'telegram.v1' }],
      ['profileId=null', { ...TERMS, profileId: null }],
    ];
    for (const [term, terms] of changed) {
      expect(`${term}:${sealedWith(KEY_A, terms)}`).not.toBe(`${term}:${base}`);
    }

    expect(sealTermTuple(TERMS)).toEqual([
      TERMS.bodyHash,
      TERMS.widgetId,
      TERMS.tenantId,
      TERMS.principalProofHash,
      '2026-09-17T10:00:00.000Z',
      '2026-09-17T10:15:00.000Z',
      TERMS.profileId,
      CURRENT_SEAL_KEY_VERSION,
    ]);
    // Positional: swapping two same-shaped terms changes the seal. An object pre-image, key-sorted,
    // would have hidden exactly this.
    expect(
      sealedWith(KEY_A, {
        ...TERMS,
        bodyHash: TERMS.principalProofHash,
        principalProofHash: TERMS.bodyHash,
      }),
    ).not.toBe(base);
  });

  it('SEAL-3 [U] the key version is sealed, and an unknown version is refused at mint', () => {
    expect(SEAL_KEY_VERSIONS).toEqual([CURRENT_SEAL_KEY_VERSION]);
    expect(sealedWith(KEY_A, { ...TERMS, sealKeyVersion: undefined })).toBe(
      sealedWith(KEY_A, { ...TERMS, sealKeyVersion: CURRENT_SEAL_KEY_VERSION }),
    );

    withKey(KEY_A, (service) => {
      expect(service.keyVersion).toBe(CURRENT_SEAL_KEY_VERSION);
      expect(() =>
        service.seal({ ...TERMS, sealKeyVersion: 'widget-seal-2' }),
      ).toThrow(SealKeyVersionError);
      expect(() => service.seal({ ...TERMS, sealKeyVersion: '' })).toThrow(
        SealKeyVersionError,
      );
    });
  });

  it('SEAL-3 [U] a missing key is a defect, not a quiet seal', () => {
    withKey(undefined, (service) => {
      expect(() => service.seal(TERMS)).toThrow(SealKeyUnavailableError);
    });
  });
});
