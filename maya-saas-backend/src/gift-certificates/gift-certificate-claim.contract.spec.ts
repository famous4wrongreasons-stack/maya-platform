import {
  giftCertificateClaimLookup,
  giftCertificatePresentation,
  giftCertificatePresentationConfig,
} from './gift-certificate-claim.contract';

describe('gift certificate claim contract', () => {
  it('re-derives one bearer across restart without persisting key material', () => {
    const facts = {
      tenantId: 'tenant-proof',
      certificateId: 'certificate-proof',
      issuanceIdentityHash: 'issuance-proof',
      activationExecutionId: 'execution-proof',
      nominalAmountKopecks: 200_000,
      currency: 'RUB',
      expiresAt: '2027-09-02T00:00:00.000Z',
    };
    const keys = {
      presentationKey: 'p'.repeat(48),
      presentationKeyVersion: 'proof-v1',
      lookupKey: 'l'.repeat(48),
    };
    const issued = giftCertificatePresentation(facts, keys);
    const restarted = giftCertificatePresentation({ ...facts }, { ...keys });
    expect(restarted).toEqual(issued);
    expect(issued.bearer).toMatch(/^MAYA-GC-/);
    expect(issued.codeHash).toBe(
      giftCertificateClaimLookup(keys.lookupKey, issued.bearer),
    );
    expect(JSON.stringify(issued)).not.toContain(keys.presentationKey);
    expect(JSON.stringify(issued)).not.toContain(keys.lookupKey);
  });

  it('normalizes the transient bearer into one deterministic keyed lookup', () => {
    const secret = 'lookup-secret-with-at-least-32-bytes';
    expect(giftCertificateClaimLookup(secret, '  maya-gc-abc_123  ')).toBe(
      giftCertificateClaimLookup(secret, 'MAYA-GC-ABC_123'),
    );
    expect(giftCertificateClaimLookup(secret, 'MAYA-GC-OTHER')).not.toBe(
      giftCertificateClaimLookup(secret, 'MAYA-GC-ABC_123'),
    );
  });

  it('retains old presentation key versions across restart and rotation', () => {
    const config = giftCertificatePresentationConfig({
      MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY: 'n'.repeat(32),
      MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY_VERSION: 'gift-cert-v2',
      MAYA_GIFT_CERTIFICATE_PRESENTATION_KEYS: JSON.stringify({
        'gift-cert-v1': 'o'.repeat(32),
      }),
      MAYA_GIFT_CERTIFICATE_CLAIM_SECRET: 'l'.repeat(32),
    });

    expect(config).not.toBeNull();
    expect(config?.presentationKeys.get('gift-cert-v1')).toBe('o'.repeat(32));
    expect(config?.presentationKeys.get('gift-cert-v2')).toBe('n'.repeat(32));
    expect(config?.lookupKey).toBe('l'.repeat(32));
  });

  it.each([
    {},
    {
      MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY: 'short',
      MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY_VERSION: 'gift-cert-v2',
      MAYA_GIFT_CERTIFICATE_CLAIM_SECRET: 'l'.repeat(32),
    },
    {
      MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY: 'n'.repeat(32),
      MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY_VERSION: 'bad version',
      MAYA_GIFT_CERTIFICATE_CLAIM_SECRET: 'l'.repeat(32),
    },
    {
      MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY: 'n'.repeat(32),
      MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY_VERSION: 'gift-cert-v2',
      MAYA_GIFT_CERTIFICATE_PRESENTATION_KEYS: '{bad-json',
      MAYA_GIFT_CERTIFICATE_CLAIM_SECRET: 'l'.repeat(32),
    },
  ])('fails closed for incomplete or invalid secret configuration', (env) => {
    expect(giftCertificatePresentationConfig(env)).toBeNull();
  });
});
