import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ActionEngineRuntimeService } from '../action-engine';
import type { P409CanonicalMembershipOffer } from '../business-content/p4-09-canonical-offer-authority.service';
import { P409CanonicalOfferAuthorityService } from '../business-content/p4-09-canonical-offer-authority.service';
import { ClientChannelRuntimeService } from '../crm/client-channel-runtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CustomerSubscriptionPurchaseCutoverService } from './customer-subscription-purchase-cutover.service';
import {
  CUSTOMER_SUBSCRIPTION_PURCHASE_CUTOVER_BRIDGE_CONTRACT,
  type CustomerSubscriptionPurchaseCutoverDto,
} from './dto/customer-subscription-purchase-cutover.dto';
import { P405CustomerSubscriptionExecutableService } from './p4-05-customer-subscription-executable.service';

const offer: P409CanonicalMembershipOffer = {
  offerId: 'membership-offer-id',
  offerValueVersionId: 'membership-version-id',
  offerValueVersion: 1,
  templateKey: 'haircut.senior',
  valueSnapshotHash: 'membership-value-snapshot-hash',
  priceKopecks: 330_000,
  currency: 'RUB',
  kind: 'membership',
  planCode: 'haircut',
  tier: 'senior',
  visitsIncluded: 2,
  termDays: 30,
  serviceScopeRefs: ['yclients.service.mens-haircut'],
};

const dto = (): CustomerSubscriptionPurchaseCutoverDto => ({
  contract: CUSTOMER_SUBSCRIPTION_PURCHASE_CUTOVER_BRIDGE_CONTRACT,
  initiator: 'pwa_subscription_purchase',
  provider: 'yclients',
  external_company_id: 'company-42',
  channel_proof: '{"type":"telegram_init_data","credential":"signed"}',
  purchase_intent_ref: 'pwa-sub:stable-intent-1',
  offer_code: 'haircut.senior',
});

function build() {
  const preview: jest.MockedFunction<ActionEngineRuntimeService['preview']> =
    jest.fn();
  preview.mockResolvedValue({
    identityFingerprint: 'checkout-fingerprint',
  } as Awaited<ReturnType<ActionEngineRuntimeService['preview']>>);
  const findConflict = jest.fn().mockResolvedValue(null);
  const tx = {};
  const transaction = jest.fn((callback: (value: unknown) => unknown) =>
    callback(tx),
  );
  const resolve = jest.fn().mockResolvedValue({
    tenantId: 'tenant-a',
    clientId: 'client-7',
    resolver: 'a18.active-verified-client-channel.v1',
    resolutionEvidenceRef: 'client-channel-link:link-7',
    resolutionEvidenceHash: 'verified-link-evidence-hash',
    issuerAuthorityHash: 'channel-control-proof-hash',
    validUntil: new Date('2030-01-01T00:00:00.000Z'),
  });
  const resolveMembershipOfferByTemplate = jest.fn().mockResolvedValue(offer);
  const execute: jest.MockedFunction<
    P405CustomerSubscriptionExecutableService['execute']
  > = jest.fn();
  execute.mockResolvedValue({
    value: {
      actionClass: 'initiate_customer_subscription_purchase',
      actionExecutionId: 'execution-1',
      checkoutConfirmationUrl: 'https://provider.invalid/confirm',
      canonicalClientId: 'client-7',
      canonicalOfferId: offer.offerId,
      offerCode: offer.templateKey,
      planCode: offer.planCode,
      tier: offer.tier,
      priceKopecks: offer.priceKopecks,
      currency: offer.currency,
      providerState: 'pending',
      providerDispatches: 1,
      subscriptionMutations: 0,
      usageClaims: 0,
    },
    execution: { state: 'SUCCEEDED' },
  } as Awaited<
    ReturnType<P405CustomerSubscriptionExecutableService['execute']>
  >);
  const bridge = {
    assertBridgeSecret: jest.fn(),
    assertBridgeIntegrationBinding: jest.fn().mockReturnValue({
      provider: 'yclients',
      externalCompanyId: 'company-42',
    }),
    resolveTenantByIntegration: jest.fn().mockResolvedValue({
      tenantId: 'tenant-a',
      slug: 'tenant-a',
      resolvedBy: 'integration',
    }),
  };
  const runAsPublicTenant = jest.fn(
    (_tenantId: string, callback: () => unknown) => callback(),
  );
  const service = new CustomerSubscriptionPurchaseCutoverService(
    { preview } as unknown as ActionEngineRuntimeService,
    {
      $transaction: transaction,
      actionExecution: { findFirst: findConflict },
    } as unknown as PrismaService,
    bridge as unknown as BridgeSourceService,
    { runAsPublicTenant } as unknown as TenantContextService,
    { resolve } as unknown as ClientChannelRuntimeService,
    {
      resolveMembershipOfferByTemplate,
    } as unknown as P409CanonicalOfferAuthorityService,
    { execute } as unknown as P405CustomerSubscriptionExecutableService,
  );
  return {
    service,
    preview,
    findConflict,
    transaction,
    tx,
    resolve,
    resolveMembershipOfferByTemplate,
    execute,
    bridge,
    runAsPublicTenant,
  };
}

describe('CustomerSubscriptionPurchaseCutoverService', () => {
  it('uses verified Client authority and P4-05 for a server-derived checkout', async () => {
    const setup = build();

    await expect(setup.service.initiatePurchase(dto())).resolves.toEqual({
      outcome: 'checkout_ready',
      actionExecutionId: 'execution-1',
      actionState: 'SUCCEEDED',
      confirmation_url: 'https://provider.invalid/confirm',
      canonicalClientId: 'client-7',
      canonicalOfferId: 'membership-offer-id',
      offerCode: 'haircut.senior',
      plan: 'haircut',
      tier: 'senior',
      amount: 330_000,
      currency: 'RUB',
      providerState: 'pending',
    });
    expect(setup.resolve).toHaveBeenCalledWith(dto().channel_proof, setup.tx);
    expect(setup.resolveMembershipOfferByTemplate).toHaveBeenCalledWith(
      'tenant-a',
      'haircut.senior',
    );
    const request = setup.execute.mock.calls[0][0];
    expect(request).toMatchObject({
      tenantId: 'tenant-a',
      capability: 'customer-subscriptions.purchase-checkout.execute.v1',
      source: { type: 'legacy_bridge' },
      targetRef: 'customer-subscription-purchase:client-7',
      input: {
        canonicalClientId: 'client-7',
        offerCode: 'haircut.senior',
        priceKopecks: 330_000,
        currency: 'RUB',
      },
    });
    expect(request.evidenceRefs).toContain('client-channel-link:link-7');
    expect(setup.preview).toHaveBeenCalledWith(request);
  });

  it('converges retry/restart to the same execution request', async () => {
    const first = build();
    const restarted = build();

    await first.service.initiatePurchase(dto());
    await first.service.initiatePurchase(dto());
    await restarted.service.initiatePurchase(dto());

    expect(first.execute.mock.calls[1][0]).toEqual(
      first.execute.mock.calls[0][0],
    );
    expect(restarted.execute.mock.calls[0][0]).toEqual(
      first.execute.mock.calls[0][0],
    );
  });

  it('fails closed when verified Client resolution is missing or ambiguous', async () => {
    const setup = build();
    setup.resolve.mockRejectedValue(
      new ForbiddenException('client_link_required'),
    );

    await expect(setup.service.initiatePurchase(dto())).rejects.toThrow(
      'client_link_required',
    );
    expect(setup.resolveMembershipOfferByTemplate).not.toHaveBeenCalled();
    expect(setup.execute).not.toHaveBeenCalled();
  });

  it('rejects cross-tenant binding before offer/provider execution', async () => {
    const setup = build();
    setup.resolve.mockResolvedValue({
      ...(await setup.resolve()),
      tenantId: 'tenant-b',
    });
    setup.resolve.mockClear();

    await expect(setup.service.initiatePurchase(dto())).rejects.toThrow(
      'Cross-tenant Client binding is forbidden',
    );
    expect(setup.execute).not.toHaveBeenCalled();
  });

  it('blocks a second active logical checkout and never creates a Client', async () => {
    const setup = build();
    setup.findConflict.mockResolvedValue({ id: 'another-execution' });

    await expect(setup.service.initiatePurchase(dto())).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(setup.execute).not.toHaveBeenCalled();
    expect(setup.transaction).toHaveBeenCalledTimes(1);
  });
});
