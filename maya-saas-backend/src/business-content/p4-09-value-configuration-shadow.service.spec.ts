import type {
  ActionEngineRuntimeService,
  TrustedActionExecutionRequestV1,
} from '../action-engine';
import { ActionCapabilityRegistry } from '../action-engine';
import type { PrismaService } from '../prisma/prisma.service';
import type { TenantContextService } from '../tenancy/tenant-context.service';
import { P409ValueConfigurationShadowService } from './p4-09-value-configuration-shadow.service';

function offer(kind: 'certificate' | 'membership', id: string) {
  return {
    id,
    tenantId: 'tenant_1',
    kind,
    name: `${kind} offer`,
    description: null,
    priceKopecks: kind === 'certificate' ? 200_000 : 330_000,
    currency: 'RUB',
    quantity: null,
    lowStockThreshold: null,
    active: true,
    source: 'canonical_action_engine',
    externalRef: `${kind}.alias`,
    metadataJson: null,
    canonicalTemplateKey:
      kind === 'certificate' ? 'gift-certificate.2000' : 'haircut.senior',
    supersedesOfferId: null,
    currentValueVersionId: `${id}_v1`,
    createdAt: new Date('2026-09-03T00:00:00.000Z'),
    updatedAt: new Date('2026-09-03T00:00:00.000Z'),
    currentValueVersion: {
      id: `${id}_v1`,
      tenantId: 'tenant_1',
      offerId: id,
      actionExecutionId: `${id}_exec1`,
      previousVersionId: null,
      version: 1,
      templateKey:
        kind === 'certificate' ? 'gift-certificate.2000' : 'haircut.senior',
      offerKind: kind,
      priceKopecks: kind === 'certificate' ? 200_000 : 330_000,
      currency: 'RUB',
      availabilityState: 'ACTIVE',
      valueSnapshotHash: 'old_snapshot',
      createdAt: new Date('2026-09-03T00:00:00.000Z'),
    },
  };
}

function setup(activeActor = true) {
  const planShadow = jest
    .fn()
    .mockImplementation(() =>
      Promise.resolve({ id: `execution_${planShadow.mock.calls.length}` }),
    );
  const membershipFindUnique = jest
    .fn()
    .mockResolvedValue(
      activeActor
        ? { id: 'membership_1', role: 'tenant_admin', status: 'active' }
        : null,
    );
  const findFirst = jest
    .fn()
    .mockImplementation(({ where }: { where: { kind: string; id: string } }) =>
      Promise.resolve(
        where.kind === 'certificate'
          ? offer('certificate', String(where.id))
          : offer('membership', String(where.id)),
      ),
    );
  const prisma = {
    membership: { findUnique: membershipFindUnique },
    tenantCatalogItem: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst,
    },
    referralProgram: { findUnique: jest.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;
  const service = new P409ValueConfigurationShadowService(
    { planShadow } as unknown as ActionEngineRuntimeService,
    prisma,
    {
      assertTenantId: (tenantId: string) => tenantId,
    } as TenantContextService,
  );
  return { service, planShadow };
}

describe('P4-09 value configuration Shadow', () => {
  it('plans all seven action classes without configuration/value/provider writes', async () => {
    const { service, planShadow } = setup();
    const results = [
      await service.planOffer('tenant_1', 'admin_1', {
        sourceIntentRef: 'cert-create',
        kind: 'certificate',
        operation: 'create',
        templateKey: 'gift-certificate.2000',
        name: 'Gift 2000',
        priceKopecks: 200_000,
      }),
      await service.planOffer('tenant_1', 'admin_1', {
        sourceIntentRef: 'cert-update',
        kind: 'certificate',
        operation: 'update',
        offerId: 'cert_1',
        priceKopecks: 220_000,
      }),
      await service.planOffer('tenant_1', 'admin_1', {
        sourceIntentRef: 'cert-delete',
        kind: 'certificate',
        operation: 'delete',
        offerId: 'cert_1',
      }),
      await service.planOffer('tenant_1', 'admin_1', {
        sourceIntentRef: 'member-create',
        kind: 'membership',
        operation: 'create',
        templateKey: 'haircut.senior',
        name: 'Haircut senior',
        priceKopecks: 330_000,
      }),
      await service.planOffer('tenant_1', 'admin_1', {
        sourceIntentRef: 'member-update',
        kind: 'membership',
        operation: 'update',
        offerId: 'member_1',
        priceKopecks: 340_000,
      }),
      await service.planOffer('tenant_1', 'admin_1', {
        sourceIntentRef: 'member-delete',
        kind: 'membership',
        operation: 'delete',
        offerId: 'member_1',
      }),
      await service.planReferralPolicy('tenant_1', 'admin_1', {
        sourceIntentRef: 'referral-update',
        enabled: true,
        inviterRewardKopecks: 40_000,
        inviteeRewardKopecks: 50_000,
      }),
    ];

    expect(results.map((result) => result.actionClass)).toEqual([
      'create_gift_certificate_offer',
      'update_gift_certificate_offer',
      'delete_gift_certificate_offer',
      'create_customer_membership_offer',
      'update_customer_membership_offer',
      'delete_customer_membership_offer',
      'update_referral_reward_policy',
    ]);
    expect(
      results.every(
        (result) =>
          result.shadowDivergences === 0 &&
          result.configurationMutations === 0 &&
          result.valueMutations === 0 &&
          result.providerWrites === 0,
      ),
    ).toBe(true);
    expect(planShadow).toHaveBeenCalledTimes(7);
    const registry = new ActionCapabilityRegistry();
    for (const call of planShadow.mock.calls) {
      const request = (call as unknown as [TrustedActionExecutionRequestV1])[0];
      expect(() =>
        registry.get(request.capability).normalizeInput(request.input),
      ).not.toThrow();
    }
  });

  it('derives stable internal identity across retry/restart and keeps externalRef an alias', async () => {
    const fresh = async (externalRef: string) => {
      const { service } = setup();
      return service.buildOfferRequest(
        'tenant_1',
        'admin_1',
        {
          sourceIntentRef: 'create-retry',
          kind: 'certificate',
          operation: 'create',
          templateKey: 'gift-certificate.3000',
          name: 'Gift 3000',
          priceKopecks: 300_000,
          externalRef,
        },
        'shadow',
      );
    };
    const first = await fresh('alias.one');
    const retry = await fresh('alias.one');
    const aliasChanged = await fresh('alias.two');
    expect(retry).toEqual(first);
    expect(aliasChanged.targetRef).toBe(first.targetRef);
    expect(aliasChanged.input).not.toEqual(first.input);
  });

  it('fails closed when same-tenant requester authority cannot be derived', async () => {
    const { service, planShadow } = setup(false);
    await expect(
      service.planOffer('tenant_1', 'forged_actor', {
        sourceIntentRef: 'forged',
        kind: 'certificate',
        operation: 'create',
        templateKey: 'gift-certificate.2000',
        name: 'Gift 2000',
        priceKopecks: 200_000,
      }),
    ).rejects.toThrow('not authorized');
    expect(planShadow).not.toHaveBeenCalled();
  });
});
