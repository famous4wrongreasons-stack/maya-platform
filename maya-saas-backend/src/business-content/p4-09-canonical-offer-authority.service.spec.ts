import type { PrismaService } from '../prisma/prisma.service';
import type { TenantContextService } from '../tenancy/tenant-context.service';
import { P409CanonicalOfferAuthorityService } from './p4-09-canonical-offer-authority.service';

function canonicalOffer(
  kind: 'membership' | 'certificate',
  availabilityState = 'ACTIVE',
) {
  const templateKey =
    kind === 'membership' ? 'haircut.senior' : 'gift-certificate.2000';
  return {
    id: `${kind}_offer`,
    tenantId: 'tenant_1',
    kind,
    active: availabilityState === 'ACTIVE',
    canonicalTemplateKey: templateKey,
    priceKopecks: kind === 'membership' ? 340_000 : 220_000,
    currency: 'RUB',
    externalRef: 'mutable.integration.alias',
    currentValueVersion: {
      id: `${kind}_v2`,
      version: 2,
      offerKind: kind,
      templateKey,
      priceKopecks: kind === 'membership' ? 340_000 : 220_000,
      currency: 'RUB',
      availabilityState,
      valueSnapshotHash: `${kind}_snapshot_v2`,
    },
  };
}

function service(row: ReturnType<typeof canonicalOffer> | null) {
  const findUnique = jest.fn().mockResolvedValue(row);
  return {
    authority: new P409CanonicalOfferAuthorityService(
      {
        tenantCatalogItem: { findUnique },
      } as unknown as PrismaService,
      {
        assertTenantId: (tenantId: string) => tenantId,
      } as TenantContextService,
    ),
    findUnique,
  };
}

describe('P4-09 canonical offer authority', () => {
  it('combines immutable membership version value with server template facts', async () => {
    const { authority, findUnique } = service(canonicalOffer('membership'));
    const result = await authority.resolveMembershipOffer(
      'tenant_1',
      'membership_offer',
    );

    expect(findUnique).toHaveBeenCalledWith({
      where: {
        id_tenantId: { id: 'membership_offer', tenantId: 'tenant_1' },
      },
      include: { currentValueVersion: true },
    });
    expect(result).toMatchObject({
      offerId: 'membership_offer',
      offerValueVersionId: 'membership_v2',
      templateKey: 'haircut.senior',
      priceKopecks: 340_000,
      planCode: 'haircut',
      visitsIncluded: 2,
      termDays: 30,
    });
    expect(result).not.toHaveProperty('externalRef');
  });

  it('uses the current certificate version as future nominal value', async () => {
    const { authority } = service(canonicalOffer('certificate'));
    await expect(
      authority.resolveCertificateOffer('tenant_1', 'certificate_offer'),
    ).resolves.toMatchObject({
      offerValueVersionId: 'certificate_v2',
      denominationType: 'fixed_money',
      nominalAmountKopecks: 220_000,
      currency: 'RUB',
      expiryDays: 365,
    });
  });

  it('fails closed for absent, retired, mismatched, or cross-tenant authority', async () => {
    const absent = service(null);
    await expect(
      absent.authority.resolveCertificateOffer('tenant_1', 'missing'),
    ).rejects.toThrow('absent');

    const retired = service(canonicalOffer('certificate', 'RETIRED'));
    await expect(
      retired.authority.resolveCertificateOffer(
        'tenant_1',
        'certificate_offer',
      ),
    ).rejects.toThrow('incomplete or inactive');

    const mismatched = canonicalOffer('certificate');
    mismatched.currentValueVersion.templateKey = 'gift-certificate.3000';
    await expect(
      service(mismatched).authority.resolveCertificateOffer(
        'tenant_1',
        'certificate_offer',
      ),
    ).rejects.toThrow('incomplete or inactive');

    expect(retired.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_tenantId: { id: 'certificate_offer', tenantId: 'tenant_1' },
        },
      }),
    );
  });
});
