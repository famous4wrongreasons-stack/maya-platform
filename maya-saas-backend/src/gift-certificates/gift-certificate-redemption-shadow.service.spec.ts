import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  ActionExecutionState,
  ActionPolicyDecision,
  type ActionExecution,
} from '@prisma/client';

import {
  ActionEngineRuntimeService,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import {
  CLIENT_IDENTITY_GUARD_UNAVAILABLE,
  CLIENT_IDENTITY_UNRESOLVED,
  ClientIdentityService,
} from '../crm/client-identity.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  GIFT_CERTIFICATE_REDEMPTION_SHADOW_BRIDGE_CONTRACT,
  GiftCertificateRedemptionShadowDto,
} from './dto/gift-certificate-redemption-shadow.dto';
import { giftCertificateClaimLookup } from './gift-certificate-claim.contract';
import { GiftCertificateRedemptionShadowService } from './gift-certificate-redemption-shadow.service';

const BEARER = 'MAYA-GC-SECRET_123';
const LOOKUP_KEY = 'l'.repeat(32);
const CODE_HASH = giftCertificateClaimLookup(LOOKUP_KEY, BEARER);

const validDto = (): GiftCertificateRedemptionShadowDto => ({
  contract: GIFT_CERTIFICATE_REDEMPTION_SHADOW_BRIDGE_CONTRACT,
  initiator: 'cashier_redeem',
  provider: 'yclients',
  external_company_id: 'company-42',
  requester_identity_provider: 'telegram',
  external_requester_id: 'staff-external-9',
  target_external_client_id: 'provider-client-7',
  target_external_record_id: 'record-11',
  certificate_claim: BEARER,
  redemption_mode: 'full',
});

const certificate = () => ({
  id: 'certificate-1',
  tenantId: 'tenant-a',
  issueExecutionId: 'activation-execution-1',
  issuanceIdentityHash: 'issuance-identity-hash',
  codeHash: CODE_HASH,
  presentationKeyVersion: 'gift-cert-v1',
  recipientSubjectHash: 'recipient-subject-hash',
  offerSnapshotHash: 'offer-snapshot-hash',
  nominalAmountKopecks: 300_000,
  currency: 'RUB',
  paymentStatus: 'paid',
  provider: 'yookassa',
  providerPaymentRefHash: 'provider-payment-hash',
  issuedAt: new Date('2026-09-02T10:15:30.000Z'),
  expiresAt: new Date('2030-09-02T10:15:30.000Z'),
  paidAt: new Date('2026-09-02T10:15:30.000Z'),
  canceledAt: null,
  redemption: null,
  issueExecution: {
    id: 'activation-execution-1',
    tenantId: 'tenant-a',
    actionClass: 'activate_gift_certificate',
    state: ActionExecutionState.SUCCEEDED,
    dryRun: false,
    policyDecision: ActionPolicyDecision.ALLOW,
  },
});

const appointment = () => ({
  id: 'appointment-1',
  tenantId: 'tenant-a',
  mayaClientId: 'client-7',
  branchId: 'branch-a',
  crmProvider: 'yclients',
  crmExternalId: 'record-11',
  serviceIds: ['service-2', 'service-1'],
  totalPriceKopecks: 350_000,
  currency: 'RUB',
  providerPayload: { visit_id: 'visit-12' },
});

function buildHarness() {
  const planShadow: jest.MockedFunction<
    ActionEngineRuntimeService['planShadow']
  > = jest.fn((request: TrustedActionExecutionRequestV1) => {
    void request;
    return Promise.resolve({
      id: 'certificate-redemption-shadow-1',
    } as ActionExecution);
  });
  const findRequester = jest.fn().mockResolvedValue({
    user: { id: 'user-9', status: 'active' },
    membership: {
      id: 'membership-9',
      role: 'manager',
      status: 'active',
      branchId: 'branch-a',
    },
  });
  const findCertificate = jest
    .fn()
    .mockImplementation(
      (args: {
        where: { tenantId_codeHash: { tenantId: string; codeHash: string } };
      }) =>
        Promise.resolve(
          args.where.tenantId_codeHash.tenantId === 'tenant-a' &&
            args.where.tenantId_codeHash.codeHash === CODE_HASH
            ? certificate()
            : null,
        ),
    );
  const findTargetLink = jest.fn().mockResolvedValue({
    unlinkedAt: null,
    client: { id: 'client-7', mergedIntoClientId: null },
  });
  const findAppointment = jest.fn().mockResolvedValue(appointment());
  const checkCrmClientRegistrationGuard = jest
    .fn()
    .mockResolvedValue({ allowed: true, reasonCode: null });
  const bridgeSource = {
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
  const runAsSystemTenant = jest.fn(
    (_tenantId: string, callback: () => unknown) => callback(),
  );
  const service = new GiftCertificateRedemptionShadowService(
    { planShadow } as unknown as ActionEngineRuntimeService,
    {
      authIdentity: { findUnique: findRequester },
      giftCertificate: { findUnique: findCertificate },
      crmClientLink: { findUnique: findTargetLink },
      appointment: { findUnique: findAppointment },
    } as unknown as PrismaService,
    bridgeSource as unknown as BridgeSourceService,
    { runAsSystemTenant } as unknown as TenantContextService,
    { checkCrmClientRegistrationGuard } as unknown as ClientIdentityService,
  );

  return {
    service,
    planShadow,
    findRequester,
    findCertificate,
    findTargetLink,
    findAppointment,
    checkCrmClientRegistrationGuard,
    bridgeSource,
    runAsSystemTenant,
  };
}

describe('GiftCertificateRedemptionShadowService', () => {
  const originalEnvironment = {
    enabled: process.env.MAYA_GIFT_CERTIFICATE_REDEMPTION_SHADOW_ENABLED,
    presentationKey: process.env.MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY,
    presentationKeyVersion:
      process.env.MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY_VERSION,
    presentationKeys: process.env.MAYA_GIFT_CERTIFICATE_PRESENTATION_KEYS,
    claimSecret: process.env.MAYA_GIFT_CERTIFICATE_CLAIM_SECRET,
    cashierIds: process.env.MAYA_GIFT_CERTIFICATE_REDEMPTION_CASHIER_USER_IDS,
  };

  beforeEach(() => {
    process.env.MAYA_GIFT_CERTIFICATE_REDEMPTION_SHADOW_ENABLED = 'true';
    process.env.MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY = 'n'.repeat(32);
    process.env.MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY_VERSION = 'gift-cert-v2';
    process.env.MAYA_GIFT_CERTIFICATE_PRESENTATION_KEYS = JSON.stringify({
      'gift-cert-v1': 'o'.repeat(32),
    });
    process.env.MAYA_GIFT_CERTIFICATE_CLAIM_SECRET = LOOKUP_KEY;
    process.env.MAYA_GIFT_CERTIFICATE_REDEMPTION_CASHIER_USER_IDS = 'user-9';
  });

  afterAll(() => {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore(
      'MAYA_GIFT_CERTIFICATE_REDEMPTION_SHADOW_ENABLED',
      originalEnvironment.enabled,
    );
    restore(
      'MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY',
      originalEnvironment.presentationKey,
    );
    restore(
      'MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY_VERSION',
      originalEnvironment.presentationKeyVersion,
    );
    restore(
      'MAYA_GIFT_CERTIFICATE_PRESENTATION_KEYS',
      originalEnvironment.presentationKeys,
    );
    restore(
      'MAYA_GIFT_CERTIFICATE_CLAIM_SECRET',
      originalEnvironment.claimSecret,
    );
    restore(
      'MAYA_GIFT_CERTIFICATE_REDEMPTION_CASHIER_USER_IDS',
      originalEnvironment.cashierIds,
    );
  });

  it('plans one exact full redemption without persisting bearer or mutating value', async () => {
    const setup = buildHarness();

    const result = await setup.service.planRedemption(validDto());

    expect(result).toMatchObject({
      outcome: 'planned',
      actionExecutionId: 'certificate-redemption-shadow-1',
      shadowDivergences: 0,
      intendedRedemption: {
        model: 'GiftCertificateRedemption',
        certificateId: 'certificate-1',
        targetClientId: 'client-7',
        targetAppointmentId: 'appointment-1',
        nominalAmountKopecks: 300_000,
        currency: 'RUB',
        certificateOwnershipSemantics: 'tenant_transferable_bearer_liability',
        purchaserIsRedemptionOwner: false,
        recipientSubjectIsClientIdentity: false,
        redemptionMode: 'full_only',
        intendedValueApplication: 'consume_entire_certificate_nominal',
        claimLookupContractVersion: 'giftCertificateClaimLookup.v1',
        presentationKeyVersion: 'gift-cert-v1',
        requesterAuthority: 'server_cashier_allowlist',
        providerBoundary: 'LOCAL_ONLY',
        unknownApplicable: false,
        oneTimeClaimRequired: true,
        writesPerformed: false,
        rawBearerPersisted: false,
      },
      redemptionsCreatedByNewPath: 0,
      certificateValueMutationsByNewPath: 0,
      rawBearerOrCodePersistedByNewPath: 0,
      loyaltyTransactionsCreatedByNewPath: 0,
      paymentProviderWritesByNewPath: 0,
      messagesSentByNewPath: 0,
    });
    const [request] = setup.planShadow.mock.calls[0];
    expect(request).toMatchObject({
      tenantId: 'tenant-a',
      capability: 'gift-certificates.redemption.shadow.v1',
      source: {
        type: 'legacy_bridge',
        sourceRef: 'legacy-gift-certificate:redeem-certificate',
        actorUserId: 'user-9',
      },
      input: {
        canonicalCertificateId: 'certificate-1',
        targetClientId: 'client-7',
        targetAppointmentId: 'appointment-1',
        serviceIds: ['service-1', 'service-2'],
        redemptionMode: 'full_only',
        providerBoundary: 'LOCAL_ONLY',
        unknownApplicable: false,
        redemptionWritePerformed: false,
        certificateValueMutationPerformed: false,
        loyaltyTransactionCreated: false,
        providerWritesRequired: false,
        rawBearerPersisted: false,
      },
      callerIdempotency: {
        scope: 'p4-06.redeem-gift-certificate.shadow',
      },
    });
    const retained = JSON.stringify(request);
    expect(retained).not.toContain(BEARER);
    expect(retained).not.toContain(CODE_HASH);
    expect(setup.runAsSystemTenant).toHaveBeenCalledWith(
      'tenant-a',
      expect.any(Function),
    );
  });

  it('converges retry, restart, duplicate initiators, and concurrent calls', async () => {
    const first = buildHarness();
    const restarted = buildHarness();

    await Promise.all([
      first.service.planRedemption(validDto()),
      first.service.planRedemption(validDto()),
    ]);
    await restarted.service.planRedemption(validDto());

    expect(first.planShadow.mock.calls[1]?.[0]).toEqual(
      first.planShadow.mock.calls[0]?.[0],
    );
    expect(restarted.planShadow.mock.calls[0]?.[0]).toEqual(
      first.planShadow.mock.calls[0]?.[0],
    );
  });

  it('rejects an invalid bearer before planning', async () => {
    const setup = buildHarness();

    await expect(
      setup.service.planRedemption({
        ...validDto(),
        certificate_claim: 'MAYA-GC-WRONG',
      }),
    ).resolves.toMatchObject({ outcome: 'certificate_unresolved' });
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('fails closed for already redeemed, inactive, cancelled, and expired certificates', async () => {
    const cases = [
      {
        row: { ...certificate(), redemption: { id: 'redemption-1' } },
        outcome: 'already_redeemed',
      },
      {
        row: { ...certificate(), paymentStatus: 'pending_payment' },
        outcome: 'certificate_inactive',
      },
      {
        row: { ...certificate(), paymentStatus: 'revoked' },
        outcome: 'certificate_inactive',
      },
      {
        row: {
          ...certificate(),
          canceledAt: new Date('2026-09-03T10:15:30.000Z'),
        },
        outcome: 'certificate_inactive',
      },
      {
        row: {
          ...certificate(),
          issuedAt: new Date('2020-09-02T10:15:30.000Z'),
          paidAt: new Date('2020-09-02T10:15:30.000Z'),
          expiresAt: new Date('2021-09-02T10:15:30.000Z'),
        },
        outcome: 'certificate_expired',
      },
    ];
    for (const testCase of cases) {
      const setup = buildHarness();
      setup.findCertificate.mockResolvedValue(testCase.row);
      await expect(
        setup.service.planRedemption(validDto()),
      ).resolves.toMatchObject({ outcome: testCase.outcome });
      expect(setup.planShadow).not.toHaveBeenCalled();
    }
  });

  it('keeps a rotated certificate resolvable across restart and fails closed when its key version is unavailable', async () => {
    const retained = buildHarness();
    await expect(
      retained.service.planRedemption(validDto()),
    ).resolves.toMatchObject({ outcome: 'planned' });

    process.env.MAYA_GIFT_CERTIFICATE_PRESENTATION_KEYS = '{}';
    const missing = buildHarness();
    await expect(
      missing.service.planRedemption(validDto()),
    ).resolves.toMatchObject({ outcome: 'presentation_key_unavailable' });
    expect(missing.planShadow).not.toHaveBeenCalled();
  });

  it('rejects wrong tenant certificate and wrong exact target Client', async () => {
    const wrongTenant = buildHarness();
    wrongTenant.findCertificate.mockResolvedValue({
      ...certificate(),
      tenantId: 'tenant-b',
    });
    await expect(
      wrongTenant.service.planRedemption(validDto()),
    ).resolves.toMatchObject({ outcome: 'certificate_inactive' });

    const wrongClient = buildHarness();
    wrongClient.findAppointment.mockResolvedValue({
      ...appointment(),
      mayaClientId: 'other-client',
    });
    await expect(
      wrongClient.service.planRedemption(validDto()),
    ).resolves.toMatchObject({ outcome: 'redemption_target_unresolved' });
    expect(wrongClient.planShadow).not.toHaveBeenCalled();
  });

  it('fails closed for P02/P03 unresolved hold and hold lookup failure', async () => {
    for (const decision of [
      { allowed: false, reasonCode: CLIENT_IDENTITY_UNRESOLVED },
      { allowed: false, reasonCode: CLIENT_IDENTITY_GUARD_UNAVAILABLE },
    ]) {
      const setup = buildHarness();
      setup.checkCrmClientRegistrationGuard.mockResolvedValue(decision);

      const result = await setup.service.planRedemption(validDto());

      expect(result.outcome).toBe(
        decision.reasonCode === CLIENT_IDENTITY_UNRESOLVED
          ? 'identity_unresolved'
          : 'identity_guard_unavailable',
      );
      expect(setup.findTargetLink).not.toHaveBeenCalled();
      expect(setup.planShadow).not.toHaveBeenCalled();
    }
  });

  it('rejects missing or mismatched exact business target evidence', async () => {
    for (const target of [
      null,
      { ...appointment(), crmExternalId: 'other-record' },
      { ...appointment(), serviceIds: [] },
      { ...appointment(), totalPriceKopecks: 0 },
      { ...appointment(), currency: 'USD' },
    ]) {
      const setup = buildHarness();
      setup.findAppointment.mockResolvedValue(target);
      await expect(
        setup.service.planRedemption(validDto()),
      ).resolves.toMatchObject({ outcome: 'redemption_target_unresolved' });
      expect(setup.planShadow).not.toHaveBeenCalled();
    }
  });

  it('derives actor authority server-side and rejects forged or out-of-scope cashier authority', async () => {
    const notAllowlisted = buildHarness();
    process.env.MAYA_GIFT_CERTIFICATE_REDEMPTION_CASHIER_USER_IDS = 'user-10';
    await expect(
      notAllowlisted.service.planRedemption(validDto()),
    ).resolves.toMatchObject({ outcome: 'policy_unresolved' });

    process.env.MAYA_GIFT_CERTIFICATE_REDEMPTION_CASHIER_USER_IDS = 'user-9';
    const wrongBranch = buildHarness();
    wrongBranch.findRequester.mockResolvedValue({
      user: { id: 'user-9', status: 'active' },
      membership: {
        id: 'membership-9',
        role: 'manager',
        status: 'active',
        branchId: 'branch-b',
      },
    });
    await expect(
      wrongBranch.service.planRedemption(validDto()),
    ).resolves.toMatchObject({ outcome: 'policy_unresolved' });
    expect(wrongBranch.planShadow).not.toHaveBeenCalled();
  });

  it('supports owner/admin authority without trusting caller-provided approval', async () => {
    const setup = buildHarness();
    setup.findRequester.mockResolvedValue({
      user: { id: 'user-owner', status: 'active' },
      membership: {
        id: 'membership-owner',
        role: 'tenant_owner',
        status: 'active',
        branchId: null,
      },
    });

    const result = await setup.service.planRedemption({
      ...validDto(),
      initiator: 'admin_redeem',
    });

    expect(result.intendedRedemption?.requesterAuthority).toBe(
      'administrative_role',
    );
  });

  it('rejects partial redemption and forged value/certificate/authority at DTO boundary', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    });

    for (const forged of [
      { redemption_mode: 'partial' },
      { partial_amount_kopecks: 1 },
      { value: 1 },
      { nominal_amount_kopecks: 1 },
      { currency: 'USD' },
      { certificate_id: 'attacker-certificate' },
      { code_hash: 'attacker-hash' },
      { presentation_key_version: 'attacker-key' },
      { entitled: true },
      { approved: true },
      { authority: 'owner' },
      { policyDecision: 'ALLOW' },
    ]) {
      await expect(
        pipe.transform(
          { ...validDto(), ...forged },
          {
            type: 'body',
            metatype: GiftCertificateRedemptionShadowDto,
          },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('fails closed for missing key/lookup policy configuration', async () => {
    delete process.env.MAYA_GIFT_CERTIFICATE_CLAIM_SECRET;
    const setup = buildHarness();

    await expect(
      setup.service.planRedemption(validDto()),
    ).resolves.toMatchObject({ outcome: 'policy_unresolved' });
    expect(setup.findRequester).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('is inert while disabled and reports zero certificate, redemption, loyalty, payment, provider, and message writes', async () => {
    process.env.MAYA_GIFT_CERTIFICATE_REDEMPTION_SHADOW_ENABLED = 'false';
    const setup = buildHarness();

    const result = await setup.service.planRedemption(validDto());

    expect(result).toMatchObject({
      outcome: 'shadow_disabled',
      actionExecutionId: null,
      redemptionsCreatedByNewPath: 0,
      certificateValueMutationsByNewPath: 0,
      rawBearerOrCodePersistedByNewPath: 0,
      loyaltyTransactionsCreatedByNewPath: 0,
      paymentProviderWritesByNewPath: 0,
      messagesSentByNewPath: 0,
    });
    expect(setup.findRequester).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });
});
