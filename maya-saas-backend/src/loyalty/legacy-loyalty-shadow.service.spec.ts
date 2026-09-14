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
  LEGACY_LOYALTY_EARN_SHADOW_BRIDGE_CONTRACT,
  LegacyLoyaltyEarnShadowDto,
} from './dto/legacy-loyalty-earn-shadow.dto';
import { LegacyLoyaltyShadowService } from './legacy-loyalty-shadow.service';

const validDto = (): LegacyLoyaltyEarnShadowDto => ({
  contract: LEGACY_LOYALTY_EARN_SHADOW_BRIDGE_CONTRACT,
  provider: 'yclients',
  external_company_id: 'company-42',
  external_client_id: 'external-client-7',
  visit_record_id: 'visit-9001',
  visit_occurred_on: '2026-08-29',
  visit_amount_rubles: 2_000,
  legacy_claimed_points: 100,
});

function buildHarness() {
  const planShadow: jest.MockedFunction<
    ActionEngineRuntimeService['planShadow']
  > = jest.fn((request: TrustedActionExecutionRequestV1) => {
    void request;
    return Promise.resolve({ id: 'execution-earn-1' } as ActionExecution);
  });
  const findUnique = jest.fn().mockResolvedValue({
    client: {
      id: 'client-canonical-7',
      mergedIntoClientId: null,
    },
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
  const service = new LegacyLoyaltyShadowService(
    { planShadow } as unknown as ActionEngineRuntimeService,
    {
      crmClientLink: { findUnique },
    } as unknown as PrismaService,
    bridgeSource as unknown as BridgeSourceService,
    { runAsSystemTenant } as unknown as TenantContextService,
  );

  return {
    service,
    planShadow,
    findUnique,
    bridgeSource,
    runAsSystemTenant,
  };
}

describe('LegacyLoyaltyShadowService', () => {
  const originalEnabled = process.env.MAYA_LEGACY_LOYALTY_EARN_SHADOW_ENABLED;

  beforeEach(() => {
    process.env.MAYA_LEGACY_LOYALTY_EARN_SHADOW_ENABLED = 'true';
  });

  afterAll(() => {
    if (originalEnabled === undefined) {
      delete process.env.MAYA_LEGACY_LOYALTY_EARN_SHADOW_ENABLED;
    } else {
      process.env.MAYA_LEGACY_LOYALTY_EARN_SHADOW_ENABLED = originalEnabled;
    }
  });

  it('uses one server-derived logical identity across repeats and records the exact intent', async () => {
    const setup = buildHarness();

    const first = await setup.service.planEarn(validDto());
    const second = await setup.service.planEarn(validDto());

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      outcome: 'planned',
      actionExecutionId: 'execution-earn-1',
      shadowDivergences: 0,
      intendedMutation: {
        model: 'LoyaltyTransaction',
        kind: 'earn',
        deltaPoints: 100,
      },
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    });
    const [firstRequest] = setup.planShadow.mock.calls[0];
    const [secondRequest] = setup.planShadow.mock.calls[1];
    expect(secondRequest).toEqual(firstRequest);
    expect(firstRequest).toMatchObject({
      tenantId: 'tenant-a',
      capability: 'loyalty.legacy-earn.shadow.v1',
      source: {
        type: 'legacy_bridge',
        sourceRef: 'legacy-loyalty:daily-earn-job',
      },
      targetRef: 'client:client-canonical-7',
      input: {
        provider: 'yclients',
        canonicalClientId: 'client-canonical-7',
        visitOccurredOn: '2026-08-29',
        visitAmountRubles: 2_000,
        intendedDeltaPoints: 100,
        legacyClaimedPoints: 100,
        calculationPolicy: 'legacy-cashback-5pct-half-even.v1',
        divergenceCode: 'none',
      },
      callerIdempotency: {
        scope: 'p4-03.earn-legacy-loyalty.shadow',
      },
    });
    expect(firstRequest.source.occurrenceScope).toContain(
      firstRequest.callerIdempotency.key,
    );
    expect(first.intendedMutation?.providerVisitIdentityHash).toBe(
      firstRequest.callerIdempotency.key,
    );
    expect(setup.runAsSystemTenant).toHaveBeenCalledWith(
      'tenant-a',
      expect.any(Function),
    );
  });

  it('resolves the client inside the server-derived tenant and fails closed when unmapped', async () => {
    const setup = buildHarness();
    setup.findUnique.mockResolvedValue(null);

    await expect(setup.service.planEarn(validDto())).resolves.toEqual({
      outcome: 'identity_unresolved',
      actionExecutionId: null,
      shadowDivergences: 1,
      intendedMutation: null,
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    });
    expect(setup.findUnique).toHaveBeenCalledWith(
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

  it('creates no execution for an empty visit identity or impossible evidence date', async () => {
    for (const invalid of [
      { visit_record_id: '   ' },
      { visit_occurred_on: '2026-02-30' },
    ]) {
      const setup = buildHarness();
      const result = await setup.service.planEarn({
        ...validDto(),
        ...invalid,
      });

      expect(result).toMatchObject({
        outcome: 'identity_unresolved',
        actionExecutionId: null,
        shadowDivergences: 1,
      });
      expect(setup.findUnique).not.toHaveBeenCalled();
      expect(setup.planShadow).not.toHaveBeenCalled();
    }
  });

  it('derives the calculation server-side and reports a legacy mismatch without executing', async () => {
    const setup = buildHarness();
    const dto = validDto();
    dto.visit_amount_rubles = 70;
    dto.legacy_claimed_points = 3;

    const result = await setup.service.planEarn(dto);

    expect(result).toMatchObject({
      shadowDivergences: 1,
      intendedMutation: { deltaPoints: 4 },
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    });
    expect(setup.planShadow.mock.calls[0]?.[0].input).toMatchObject({
      intendedDeltaPoints: 4,
      legacyClaimedPoints: 3,
      divergenceCode: 'legacy_points_mismatch',
    });
  });

  it('does not create an execution while the backend-owned Shadow switch is disabled', async () => {
    const setup = buildHarness();
    process.env.MAYA_LEGACY_LOYALTY_EARN_SHADOW_ENABLED = 'false';

    await expect(setup.service.planEarn(validDto())).resolves.toMatchObject({
      outcome: 'shadow_disabled',
      actionExecutionId: null,
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    });
    expect(
      setup.bridgeSource.resolveTenantByIntegration,
    ).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('rejects initiator-supplied tenant and authority fields at the HTTP boundary', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => new BadRequestException(errors),
    });

    for (const forged of [
      { tenantId: 'tenant-b' },
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { policyDecision: 'ALLOW' },
      { approvalBindingHash: 'forged' },
      { executor: 'legacy.direct' },
    ]) {
      await expect(
        pipe.transform(
          { ...validDto(), ...forged },
          { type: 'body', metatype: LegacyLoyaltyEarnShadowDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
