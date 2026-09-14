import {
  P4_09_CANONICAL_OFFER_MATERIALIZATION_CONTRACT,
  p409CanonicalOfferMaterializationChecksum,
  p409CanonicalOfferMaterializationManifest,
  p409CanonicalOfferSourceManifestChecksum,
} from './p4-09-canonical-offer-materialization.contract';

describe('P4-09 canonical offer materialization contract', () => {
  it('maps exactly six P4-05 and three P4-06 static offers', () => {
    const offers = p409CanonicalOfferMaterializationManifest();
    expect(offers).toHaveLength(9);
    expect(offers.filter((offer) => offer.kind === 'membership')).toHaveLength(
      6,
    );
    expect(offers.filter((offer) => offer.kind === 'certificate')).toHaveLength(
      3,
    );
    expect(new Set(offers.map((offer) => offer.templateKey)).size).toBe(9);
    expect(offers.every((offer) => offer.currency === 'RUB')).toBe(true);
    expect(offers.every((offer) => offer.externalRef === null)).toBe(true);
  });

  it('preserves every approved denomination and future-checkout fact', () => {
    const offers = p409CanonicalOfferMaterializationManifest();
    expect(
      offers.map(({ templateKey, priceKopecks }) => [
        templateKey,
        priceKopecks,
      ]),
    ).toEqual([
      ['haircut.senior', 330_000],
      ['haircut.top', 370_000],
      ['complex.senior', 520_000],
      ['complex.top', 600_000],
      ['beard.senior', 170_000],
      ['beard.top', 210_000],
      ['gift-certificate.2000', 200_000],
      ['gift-certificate.3000', 300_000],
      ['gift-certificate.5000', 500_000],
    ]);

    for (const offer of offers) {
      if (offer.kind === 'membership') {
        expect(offer.visitsIncluded).toBe(2);
        expect(offer.termDays).toBe(30);
        expect(offer.serviceScopeRefs.length).toBeGreaterThan(0);
      } else {
        expect(offer.denominationType).toBe('fixed_money');
        expect(offer.nominalAmountKopecks).toBe(offer.priceKopecks);
        expect(offer.expiryDays).toBe(365);
      }
    }
  });

  it('produces an order-independent deterministic source checksum', () => {
    const first = p409CanonicalOfferSourceManifestChecksum();
    const second = p409CanonicalOfferMaterializationChecksum({
      offers: p409CanonicalOfferMaterializationManifest(),
      contract: P4_09_CANONICAL_OFFER_MATERIALIZATION_CONTRACT,
    });
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
  });
});
