import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ActionExecution } from '@prisma/client';

import {
  ActionCapabilityRegistry,
  ActionEngineRuntimeService,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  LEGACY_LOYALTY_EXPIRE_SHADOW_BRIDGE_CONTRACT,
  LegacyLoyaltyExpireShadowDto,
} from './dto/legacy-loyalty-expire-shadow.dto';
import { LegacyLoyaltyExpiryShadowService } from './legacy-loyalty-expiry-shadow.service';

const NOW = new Date('2026-08-30T12:00:00.000Z');

const validDto = (): LegacyLoyaltyExpireShadowDto => ({
  contract: LEGACY_LOYALTY_EXPIRE_SHADOW_BRIDGE_CONTRACT,
  provider: 'yclients',
  external_company_id: 'company-42',
  external_client_id: 'external-client-7',
  legacy_claimed_balance_points: 100,
});

function buildHarness() {
  const planShadow: jest.MockedFunction<
    ActionEngineRuntimeService['planShadow']
  > = jest.fn((request: TrustedActionExecutionRequestV1) => {
    void request;
    return Promise.resolve({ id: 'execution-expire-1' } as ActionExecution);
  });
  const clientFindUnique = jest.fn().mockResolvedValue({
    client: {
      id: 'client-canonical-7',
      mergedIntoClientId: null,
    },
  });
  const accountFindUnique = jest.fn().mockResolvedValue({
    id: 'account-7',
    balance: 100,
  });
  const coverageFindFirst = jest.fn().mockResolvedValue({
    id: 'coverage-7',
    finishedAt: NOW,
  });
  const appointmentFindFirst = jest.fn().mockResolvedValue(null);
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
  const service = new LegacyLoyaltyExpiryShadowService(
    { planShadow } as unknown as ActionEngineRuntimeService,
    {
      crmClientLink: { findUnique: clientFindUnique },
      loyaltyAccount: { findUnique: accountFindUnique },
      reconciliationRun: { findFirst: coverageFindFirst },
      appointment: { findFirst: appointmentFindFirst },
    } as unknown as PrismaService,
    bridgeSource as unknown as BridgeSourceService,
    { runAsSystemTenant } as unknown as TenantContextService,
  );

  return {
    service,
    planShadow,
    clientFindUnique,
    accountFindUnique,
    coverageFindFirst,
    appointmentFindFirst,
    bridgeSource,
    runAsSystemTenant,
  };
}

describe('LegacyLoyaltyExpiryShadowService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    process.env = {
      ...originalEnv,
      MAYA_LEGACY_LOYALTY_EXPIRE_SHADOW_ENABLED: 'true',
      MAYA_LEGACY_LOYALTY_EXPIRY_POLICY_EFFECTIVE_ON: '2025-01-01',
      MAYA_LEGACY_LOYALTY_EXPIRY_PER_CLIENT_CAP_POINTS: '1000',
      MAYA_LEGACY_LOYALTY_EXPIRY_PER_RUN_CAP_POINTS: '10000',
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = originalEnv;
  });

  it('converges repeats onto one server-derived policy-window identity', async () => {
    const setup = buildHarness();

    const first = await setup.service.planExpiry(validDto());
    const second = await setup.service.planExpiry(validDto());

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      outcome: 'planned',
      actionExecutionId: 'execution-expire-1',
      shadowDivergences: 0,
      intendedMutation: {
        model: 'LoyaltyTransaction',
        kind: 'expire',
        deltaPoints: -100,
        balanceAfter: 0,
      },
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    });
    const [firstRequest] = setup.planShadow.mock.calls[0];
    const [secondRequest] = setup.planShadow.mock.calls[1];
    expect(secondRequest).toEqual(firstRequest);
    expect(firstRequest).toMatchObject({
      tenantId: 'tenant-a',
      capability: 'loyalty.legacy-expire.shadow.v1',
      source: {
        type: 'legacy_bridge',
        sourceRef: 'legacy-loyalty:daily-expiry-job',
      },
      targetRef: 'client:client-canonical-7',
      input: {
        provider: 'yclients',
        canonicalClientId: 'client-canonical-7',
        evaluationWindowEnd: '2026-08-30',
        policyEffectiveOn: '2025-01-01',
        canonicalBalancePoints: 100,
        legacyClaimedBalancePoints: 100,
        canonicalRecentAttendedOn: null,
        intendedDeltaPoints: -100,
        eligibilityDecision: 'expire',
        expiryPolicy: 'legacy-inactivity-360d-full-balance.v1',
        perClientCapPoints: 1000,
        perRunCapPoints: 10000,
        capDecision: 'within_cap',
        evidenceCoverage: 'complete',
        divergenceCodes: [],
      },
      callerIdempotency: {
        scope: 'p4-03.expire-legacy-loyalty.shadow',
      },
    });
    expect(firstRequest.source.occurrenceScope).toContain(
      firstRequest.callerIdempotency.key,
    );
    expect(
      new ActionCapabilityRegistry()
        .get('loyalty.legacy-expire.shadow.v1')
        .normalizeInput(firstRequest.input),
    ).toEqual(firstRequest.input);
    expect(setup.runAsSystemTenant).toHaveBeenCalledWith(
      'tenant-a',
      expect.any(Function),
    );
  });

  it('uses tenant-qualified identity and creates no plan for an unmapped client', async () => {
    const setup = buildHarness();
    setup.clientFindUnique.mockResolvedValue(null);

    await expect(setup.service.planExpiry(validDto())).resolves.toMatchObject({
      outcome: 'identity_unresolved',
      actionExecutionId: null,
      shadowDivergences: 1,
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

  it('requires complete canonical mirror coverage before asserting no attendance', async () => {
    const setup = buildHarness();
    setup.coverageFindFirst.mockResolvedValue(null);

    await expect(setup.service.planExpiry(validDto())).resolves.toMatchObject({
      outcome: 'evidence_unresolved',
      actionExecutionId: null,
      shadowDivergences: 1,
      intendedMutation: null,
    });
    expect(setup.appointmentFindFirst).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('plans no debit when canonical attendance is recent', async () => {
    const setup = buildHarness();
    setup.appointmentFindFirst.mockResolvedValue({
      startAt: new Date('2026-08-01T09:00:00.000Z'),
    });

    const result = await setup.service.planExpiry(validDto());

    expect(result).toMatchObject({
      outcome: 'planned',
      shadowDivergences: 1,
      intendedMutation: null,
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    });
    expect(setup.planShadow.mock.calls[0]?.[0].input).toMatchObject({
      canonicalRecentAttendedOn: '2026-08-01',
      intendedDeltaPoints: 0,
      eligibilityDecision: 'do_not_expire',
      divergenceCodes: ['canonical_recent_attendance'],
    });
  });

  it('uses the canonical balance as intent and counts a legacy mismatch', async () => {
    const setup = buildHarness();
    const dto = validDto();
    dto.legacy_claimed_balance_points = 90;

    const result = await setup.service.planExpiry(dto);

    expect(result).toMatchObject({
      shadowDivergences: 1,
      intendedMutation: { deltaPoints: -100, balanceAfter: 0 },
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    });
    expect(setup.planShadow.mock.calls[0]?.[0].input).toMatchObject({
      canonicalBalancePoints: 100,
      legacyClaimedBalancePoints: 90,
      intendedDeltaPoints: -100,
      divergenceCodes: ['legacy_balance_mismatch'],
    });
  });

  it('fails closed before identity lookup when server policy is incomplete', async () => {
    const setup = buildHarness();
    delete process.env.MAYA_LEGACY_LOYALTY_EXPIRY_PER_RUN_CAP_POINTS;

    await expect(setup.service.planExpiry(validDto())).resolves.toMatchObject({
      outcome: 'policy_unresolved',
      actionExecutionId: null,
      shadowDivergences: 1,
    });
    expect(
      setup.bridgeSource.resolveTenantByIntegration,
    ).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('rejects initiator-supplied tenant, policy, caps, and authority fields', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => new BadRequestException(errors),
    });

    for (const forged of [
      { tenantId: 'tenant-b' },
      { canonicalClientId: 'client-forged' },
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { policyDecision: 'ALLOW' },
      { expiryPolicy: 'forged' },
      { perClientCapPoints: 9_999_999 },
      { approvalBindingHash: 'forged' },
      { executor: 'legacy.direct' },
    ]) {
      await expect(
        pipe.transform(
          { ...validDto(), ...forged },
          { type: 'body', metatype: LegacyLoyaltyExpireShadowDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
