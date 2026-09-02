import { Injectable, NotFoundException } from '@nestjs/common';

import {
  resolveCustomerSubscriptionPurchaseOffer,
  resolveGiftCertificatePurchaseOffer,
} from '../action-engine';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

export class P409CanonicalOfferAuthorityError extends Error {}

export interface P409CanonicalOfferIdentity {
  offerId: string;
  offerValueVersionId: string;
  offerValueVersion: number;
  templateKey: string;
  valueSnapshotHash: string;
  priceKopecks: number;
  currency: 'RUB';
}

export interface P409CanonicalMembershipOffer extends P409CanonicalOfferIdentity {
  kind: 'membership';
  planCode: 'haircut' | 'complex' | 'beard';
  tier: 'senior' | 'top';
  visitsIncluded: 2;
  termDays: 30;
  serviceScopeRefs: readonly string[];
}

export interface P409CanonicalCertificateOffer extends P409CanonicalOfferIdentity {
  kind: 'certificate';
  productCode: 'digital-gift-certificate';
  denominationType: 'fixed_money';
  nominalAmountKopecks: number;
  expiryDays: 365;
}

@Injectable()
export class P409CanonicalOfferAuthorityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async resolveMembershipOffer(
    tenantId: string,
    offerId: string,
  ): Promise<P409CanonicalMembershipOffer> {
    const authority = await this.current(tenantId, offerId, 'membership');
    const template = resolveCustomerSubscriptionPurchaseOffer(
      authority.templateKey,
    );
    if (!template) {
      throw new P409CanonicalOfferAuthorityError(
        'Canonical membership template is unsupported',
      );
    }
    return {
      ...authority,
      kind: 'membership',
      planCode: template.planCode,
      tier: template.tier,
      visitsIncluded: template.visitsIncluded,
      termDays: template.termDays,
      serviceScopeRefs: template.serviceScopeRefs,
    };
  }

  async resolveCertificateOffer(
    tenantId: string,
    offerId: string,
  ): Promise<P409CanonicalCertificateOffer> {
    const authority = await this.current(tenantId, offerId, 'certificate');
    const template = resolveGiftCertificatePurchaseOffer(authority.templateKey);
    if (!template) {
      throw new P409CanonicalOfferAuthorityError(
        'Canonical certificate template is unsupported',
      );
    }
    return {
      ...authority,
      kind: 'certificate',
      productCode: template.productCode,
      denominationType: template.denominationType,
      nominalAmountKopecks: authority.priceKopecks,
      expiryDays: template.expiryDays,
    };
  }

  private async current(
    tenantId: string,
    offerId: string,
    kind: 'membership' | 'certificate',
  ): Promise<P409CanonicalOfferIdentity> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const offer = await this.prisma.tenantCatalogItem.findUnique({
      where: { id_tenantId: { id: offerId, tenantId: scopedTenantId } },
      include: { currentValueVersion: true },
    });
    if (!offer) {
      throw new NotFoundException('Canonical offer is absent');
    }
    const version = offer.currentValueVersion;
    if (
      offer.kind !== kind ||
      !offer.active ||
      !offer.canonicalTemplateKey ||
      !version ||
      version.offerKind !== kind ||
      version.templateKey !== offer.canonicalTemplateKey ||
      version.availabilityState !== 'ACTIVE' ||
      offer.priceKopecks !== version.priceKopecks ||
      offer.currency !== version.currency ||
      version.currency !== 'RUB'
    ) {
      throw new P409CanonicalOfferAuthorityError(
        'Canonical offer authority is incomplete or inactive',
      );
    }
    return {
      offerId: offer.id,
      offerValueVersionId: version.id,
      offerValueVersion: version.version,
      templateKey: version.templateKey,
      valueSnapshotHash: version.valueSnapshotHash,
      priceKopecks: version.priceKopecks,
      currency: 'RUB',
    };
  }
}
