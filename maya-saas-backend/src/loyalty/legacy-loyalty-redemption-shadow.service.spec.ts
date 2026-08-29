import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ActionExecution } from '@prisma/client';

import {
  ActionEngineRuntimeService,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  LEGACY_LOYALTY_REDEEM_SHADOW_BRIDGE_CONTRACT,
  LegacyLoyaltyRedeemShadowDto,
} from './dto/legacy-loyalty-redeem-shadow.dto';
import { LegacyLoyaltyRedemptionShadowService } from './legacy-loyalty-redemption-shadow.service';

const validDto = (): LegacyLoyaltyRedeemShadowDto => ({
  contract: LEGACY_LOYALTY_REDEEM_SHADOW_BRIDGE_CONTRACT,
  provider: 'yclients',
  external_company_id: 'company-42',
  external_client_id: 'external-client-7',
  appointment_execution_id: 'appointment-execution-7',
  provider_record_id: 'provider-record-7',
  provider_service_id: 'service-care-7',
  redemption_request_id: 'booking-redemption-7',
  legacy_claimed_points: 300,
});

function buildHarness() {
  const planShadow: jest.MockedFunction<
    ActionEngineRuntimeService['planShadow']
  > = jest.fn((request: TrustedActionExecutionRequestV1) => {
    void request;
    return Promise.resolve({ id: 'execution-redeem-1' } as ActionExecution);
  });
  const clientFindUnique = jest.fn().mockResolvedValue({
    client: {
      id: 'client-canonical-7',
      userId: 'user-7',
      mergedIntoClientId: null,
    },
  });
  const accountFindUnique = jest.fn().mockResolvedValue({
    id: 'account-7',
    balance: 500,
  });
  const actionExecutionFindFirst = jest.fn().mockResolvedValue({
    id: 'appointment-execution-7',
    safeResultSummaryJson: {
      externalId: 'provider-record-7',
      serviceIds: ['service-haircut-1', 'service-care-7'],
    },
  });
  const appointmentFindUnique = jest.fn().mockResolvedValue({
    id: 'appointment-7',
    mayaClientId: 'client-canonical-7',
    serviceIds: ['service-haircut-1', 'service-care-7'],
  });
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
  const service = new LegacyLoyaltyRedemptionShadowService(
    { planShadow } as unknown as ActionEngineRuntimeService,
    {
      crmClientLink: { findUnique: clientFindUnique },
      loyaltyAccount: { findUnique: accountFindUnique },
      actionExecution: { findFirst: actionExecutionFindFirst },
      appointment: { findUnique: appointmentFindUnique },
    } as unknown as PrismaService,
    bridgeSource as unknown as BridgeSourceService,
    { runAsSystemTenant } as unknown as TenantContextService,
  );

  return {
    service,
    planShadow,
    clientFindUnique,
    accountFindUnique,
    actionExecutionFindFirst,
    appointmentFindUnique,
    bridgeSource,
    runAsSystemTenant,
  };
}

describe('LegacyLoyaltyRedemptionShadowService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      MAYA_LEGACY_LOYALTY_REDEEM_SHADOW_ENABLED: 'true',
      MAYA_LEGACY_LOYALTY_REDEEM_PER_ACTION_CAP_POINTS: '1000',
      MAYA_LEGACY_LOYALTY_REDEEM_SERVICE_POINTS_JSON: JSON.stringify({
        'service-care-7': 300,
      }),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('converges repeats onto one identity bound to appointment and request evidence', async () => {
    const setup = buildHarness();

    const first = await setup.service.planRedemption(validDto());
    const second = await setup.service.planRedemption(validDto());

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      outcome: 'planned',
      actionExecutionId: 'execution-redeem-1',
      shadowDivergences: 0,
      intendedMutation: {
        model: 'LoyaltyTransaction',
        kind: 'redeem',
        deltaPoints: -300,
        balanceAfter: 200,
        ledgerSemantics: 'reservation_finalize_release_under_one_execution',
        providerProjection: 'deferred_attempt',
      },
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    });
    const [firstRequest] = setup.planShadow.mock.calls[0];
    const [secondRequest] = setup.planShadow.mock.calls[1];
    expect(secondRequest).toEqual(firstRequest);
    expect(firstRequest).toMatchObject({
      tenantId: 'tenant-a',
      capability: 'loyalty.legacy-redeem.shadow.v1',
      source: {
        type: 'legacy_bridge',
        sourceRef: 'legacy-loyalty:booking-redemption',
      },
      targetRef: 'appointment:appointment-7',
      input: {
        canonicalClientId: 'client-canonical-7',
        canonicalAppointmentId: 'appointment-7',
        appointmentActionExecutionId: 'appointment-execution-7',
        providerServiceId: 'service-care-7',
        canonicalBalancePoints: 500,
        serverDerivedPoints: 300,
        legacyClaimedPoints: 300,
        intendedDeltaPoints: -300,
        resultingBalancePoints: 200,
        eligibilityDecision: 'redeem',
        redemptionPolicy: 'legacy-booking-one-care-service.v1',
        perActionCapPoints: 1000,
        capDecision: 'within_cap',
        appointmentEvidence: 'canonical_create_succeeded',
        providerProjectionDecision: 'deferred_attempt',
        divergenceCodes: [],
      },
      callerIdempotency: {
        scope: 'p4-03.redeem-legacy-loyalty.shadow',
      },
    });
    expect(firstRequest.source.occurrenceScope).toContain(
      firstRequest.callerIdempotency.key,
    );
    expect(setup.runAsSystemTenant).toHaveBeenCalledWith(
      'tenant-a',
      expect.any(Function),
    );
  });

  it('uses tenant-qualified client identity and rejects an unmapped client', async () => {
    const setup = buildHarness();
    setup.clientFindUnique.mockResolvedValue(null);

    await expect(
      setup.service.planRedemption(validDto()),
    ).resolves.toMatchObject({
      outcome: 'identity_unresolved',
      actionExecutionId: null,
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    });
    expect(setup.clientFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_provider_externalId: {
            tenantId: 'tenant-a',
            provider: 'yclients',
            externalId: 'external-client-7',
          },
        },
      }),
    );
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('requires a successful canonical appointment execution with exact record and service', async () => {
    const setup = buildHarness();
    setup.actionExecutionFindFirst.mockResolvedValue(null);

    await expect(
      setup.service.planRedemption(validDto()),
    ).resolves.toMatchObject({
      outcome: 'evidence_unresolved',
      actionExecutionId: null,
    });
    expect(setup.actionExecutionFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'appointment-execution-7',
        tenantId: 'tenant-a',
        actionClass: 'create_appointment',
        capability: 'crm.appointment.create.v1',
        state: 'SUCCEEDED',
      },
      select: { id: true, safeResultSummaryJson: true },
    });
    expect(setup.appointmentFindUnique).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('rejects a mirror record belonging to another canonical client', async () => {
    const setup = buildHarness();
    setup.appointmentFindUnique.mockResolvedValue({
      id: 'appointment-7',
      mayaClientId: 'client-other',
      serviceIds: ['service-care-7'],
    });

    await expect(
      setup.service.planRedemption(validDto()),
    ).resolves.toMatchObject({
      outcome: 'evidence_unresolved',
      actionExecutionId: null,
    });
    expect(setup.appointmentFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_crmProvider_crmExternalId: {
            tenantId: 'tenant-a',
            crmProvider: 'yclients',
            crmExternalId: 'provider-record-7',
          },
        },
      }),
    );
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('derives a no-mutation plan from insufficient canonical balance', async () => {
    const setup = buildHarness();
    setup.accountFindUnique.mockResolvedValue({
      id: 'account-7',
      balance: 200,
    });

    const result = await setup.service.planRedemption(validDto());

    expect(result).toMatchObject({
      outcome: 'planned',
      shadowDivergences: 1,
      intendedMutation: null,
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    });
    expect(setup.planShadow.mock.calls[0]?.[0].input).toMatchObject({
      canonicalBalancePoints: 200,
      intendedDeltaPoints: 0,
      resultingBalancePoints: 200,
      eligibilityDecision: 'do_not_redeem',
      divergenceCodes: ['insufficient_canonical_balance'],
    });
  });

  it('uses server points and counts a legacy quote mismatch without trusting it', async () => {
    const setup = buildHarness();
    const dto = validDto();
    dto.legacy_claimed_points = 250;

    const result = await setup.service.planRedemption(dto);

    expect(result).toMatchObject({
      shadowDivergences: 1,
      intendedMutation: { deltaPoints: -300, balanceAfter: 200 },
    });
    expect(setup.planShadow.mock.calls[0]?.[0].input).toMatchObject({
      serverDerivedPoints: 300,
      legacyClaimedPoints: 250,
      divergenceCodes: ['legacy_points_mismatch'],
    });
  });

  it('fails closed before identity lookup when service policy is incomplete', async () => {
    const setup = buildHarness();
    process.env.MAYA_LEGACY_LOYALTY_REDEEM_SERVICE_POINTS_JSON = '{}';

    await expect(
      setup.service.planRedemption(validDto()),
    ).resolves.toMatchObject({
      outcome: 'policy_unresolved',
      actionExecutionId: null,
    });
    expect(
      setup.bridgeSource.resolveTenantByIntegration,
    ).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('rejects initiator-supplied authority, amount, and binding fields', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => new BadRequestException(errors),
    });

    for (const forged of [
      { tenantId: 'tenant-b' },
      { canonicalClientId: 'client-forged' },
      { points: 1 },
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { policyDecision: 'ALLOW' },
      { appointmentSucceeded: true },
      { approvalBindingHash: 'forged' },
      { executor: 'legacy.direct' },
    ]) {
      await expect(
        pipe.transform(
          { ...validDto(), ...forged },
          { type: 'body', metatype: LegacyLoyaltyRedeemShadowDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
