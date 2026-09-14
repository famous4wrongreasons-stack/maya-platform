import { createHash } from 'node:crypto';

import {
  CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
  CUSTOMER_SUBSCRIPTION_PURCHASE_OFFERS,
  GIFT_CERTIFICATE_PURCHASE_CATALOG_VERSION,
  GIFT_CERTIFICATE_PURCHASE_OFFERS,
  P4_09_CERTIFICATE_TEMPLATES,
  P4_09_MEMBERSHIP_TEMPLATES,
  resolveCustomerSubscriptionPurchaseOffer,
  resolveGiftCertificatePurchaseOffer,
} from '../action-engine';

export const P4_09_CANONICAL_OFFER_MATERIALIZATION_CONTRACT =
  'maya.p4-09-canonical-offer-materialization/1' as const;

interface P409CanonicalOfferMaterializationBase {
  kind: 'membership' | 'certificate';
  templateKey: string;
  name: string;
  description: null;
  priceKopecks: number;
  currency: 'RUB';
  externalRef: null;
  sourceCatalogVersion: string;
}

export interface P409CanonicalMembershipMaterializationOffer extends P409CanonicalOfferMaterializationBase {
  kind: 'membership';
  planCode: 'haircut' | 'complex' | 'beard';
  tier: 'senior' | 'top';
  visitsIncluded: 2;
  termDays: 30;
  serviceScopeRefs: readonly string[];
}

export interface P409CanonicalCertificateMaterializationOffer extends P409CanonicalOfferMaterializationBase {
  kind: 'certificate';
  productCode: 'digital-gift-certificate';
  denominationType: 'fixed_money';
  nominalAmountKopecks: number;
  expiryDays: 365;
}

export type P409CanonicalOfferMaterializationOffer =
  | P409CanonicalMembershipMaterializationOffer
  | P409CanonicalCertificateMaterializationOffer;

const MEMBERSHIP_NAMES: Readonly<Record<string, string>> = Object.freeze({
  'haircut.senior': 'Стрижка — Старший мастер',
  'haircut.top': 'Стрижка — Топ-мастер',
  'complex.senior': 'Комплекс — Старший мастер',
  'complex.top': 'Комплекс — Топ-мастер',
  'beard.senior': 'Борода — Старший мастер',
  'beard.top': 'Борода — Топ-мастер',
});

const CERTIFICATE_NAMES: Readonly<Record<string, string>> = Object.freeze({
  'gift-certificate.2000': 'Подарочный сертификат 2 000 ₽',
  'gift-certificate.3000': 'Подарочный сертификат 3 000 ₽',
  'gift-certificate.5000': 'Подарочный сертификат 5 000 ₽',
});

export function p409CanonicalJson(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(p409CanonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, p409CanonicalJson(nested)]),
    );
  }
  return value;
}

export function p409CanonicalOfferMaterializationChecksum(
  value: unknown,
): string {
  return createHash('sha256')
    .update(JSON.stringify(p409CanonicalJson(value)))
    .digest('hex');
}

export function p409CanonicalOfferMaterializationManifest(): readonly P409CanonicalOfferMaterializationOffer[] {
  const membershipCatalogKeys = Object.keys(
    CUSTOMER_SUBSCRIPTION_PURCHASE_OFFERS,
  ).sort();
  const expectedMembershipKeys = [...P4_09_MEMBERSHIP_TEMPLATES].sort();
  if (
    JSON.stringify(membershipCatalogKeys) !==
    JSON.stringify(expectedMembershipKeys)
  ) {
    throw new Error(
      'P4-05 static catalog differs from the approved six-offer manifest',
    );
  }

  const certificateCatalogKeys = Object.keys(
    GIFT_CERTIFICATE_PURCHASE_OFFERS,
  ).sort();
  const expectedCertificateKeys = [...P4_09_CERTIFICATE_TEMPLATES].sort();
  if (
    JSON.stringify(certificateCatalogKeys) !==
    JSON.stringify(expectedCertificateKeys)
  ) {
    throw new Error(
      'P4-06 static catalog differs from the approved three-offer manifest',
    );
  }

  const memberships = P4_09_MEMBERSHIP_TEMPLATES.map((templateKey) => {
    const source = resolveCustomerSubscriptionPurchaseOffer(templateKey);
    const name = MEMBERSHIP_NAMES[templateKey];
    if (!source || !name) {
      throw new Error(
        `Approved membership offer is incomplete: ${templateKey}`,
      );
    }
    return Object.freeze({
      kind: 'membership' as const,
      templateKey,
      name,
      description: null,
      priceKopecks: source.priceKopecks,
      currency: source.currency,
      externalRef: null,
      sourceCatalogVersion: CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
      planCode: source.planCode,
      tier: source.tier,
      visitsIncluded: source.visitsIncluded,
      termDays: source.termDays,
      serviceScopeRefs: [...source.serviceScopeRefs],
    });
  });

  const certificates = P4_09_CERTIFICATE_TEMPLATES.map((templateKey) => {
    const source = resolveGiftCertificatePurchaseOffer(templateKey);
    const name = CERTIFICATE_NAMES[templateKey];
    if (!source || !name) {
      throw new Error(
        `Approved certificate offer is incomplete: ${templateKey}`,
      );
    }
    return Object.freeze({
      kind: 'certificate' as const,
      templateKey,
      name,
      description: null,
      priceKopecks: source.nominalAmountKopecks,
      currency: source.currency,
      externalRef: null,
      sourceCatalogVersion: GIFT_CERTIFICATE_PURCHASE_CATALOG_VERSION,
      productCode: source.productCode,
      denominationType: source.denominationType,
      nominalAmountKopecks: source.nominalAmountKopecks,
      expiryDays: source.expiryDays,
    });
  });

  const offers = [...memberships, ...certificates];
  if (offers.length !== 9) {
    throw new Error(
      'The approved P4-09 materialization scope must be 9 offers',
    );
  }
  if (
    new Set(offers.map((offer) => offer.templateKey)).size !== offers.length
  ) {
    throw new Error('The approved P4-09 materialization manifest is ambiguous');
  }
  return Object.freeze(offers);
}

export function p409CanonicalOfferSourceManifestChecksum(): string {
  return p409CanonicalOfferMaterializationChecksum({
    contract: P4_09_CANONICAL_OFFER_MATERIALIZATION_CONTRACT,
    offers: p409CanonicalOfferMaterializationManifest(),
  });
}
