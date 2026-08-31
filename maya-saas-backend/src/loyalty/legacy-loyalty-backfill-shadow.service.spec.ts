import { createHash } from 'node:crypto';

import type { ActionExecution } from '@prisma/client';

import {
  ActionEngineRuntimeService,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import { CrmService } from '../crm/crm.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  LEGACY_LOYALTY_BACKFILL_SHADOW_BRIDGE_CONTRACT,
  LegacyLoyaltyBackfillShadowDto,
} from './dto/legacy-loyalty-backfill-shadow.dto';
import { LegacyLoyaltyBackfillShadowService } from './legacy-loyalty-backfill-shadow.service';

function hash(parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\u001f')).digest('hex');
}

const BACKFILL_CORRELATION = hash([
  'tenant-a',
  'client-canonical-7',
  'legacy-welcome-launch.v1',
  'legacy-welcome-ltv-5pct-cap.v1',
]);

const validDto = (): LegacyLoyaltyBackfillShadowDto => ({
  contract: LEGACY_LOYALTY_BACKFILL_SHADOW_BRIDGE_CONTRACT,
  provider: 'yclients',
  external_company_id: 'company-42',
  external_client_id: '7007',
  initiator_kind: 'lazy_access',
  legacy_claimed_sold_amount_rubles: 6000,
  legacy_claimed_points: 300,
});

function buildHarness() {
  const planShadow: jest.MockedFunction<
    ActionEngineRuntimeService['planShadow']
  > = jest.fn((request: TrustedActionExecutionRequestV1) => {
    void request;
    return Promise.resolve({ id: 'execution-backfill-1' } as ActionExecution);
  });
  const clientFindUnique = jest.fn().mockResolvedValue({
    unlinkedAt: null,
    client: {
      id: 'client-canonical-7',
      mergedIntoClientId: null,
    },
  });
  const accountFindUnique = jest.fn().mockResolvedValue({ id: 'account-7' });
  const sourceRowsFindMany = jest.fn().mockResolvedValue([]);
  const getClientRegistry = jest.fn().mockResolvedValue({
    provider: 'yclients',
    generated_at: '2026-08-30T12:00:00.000Z',
    complete: true,
    clients: [
      {
        external_id: '7007',
        name: 'Exact client',
        phone: '+79990000007',
        visits_count: 12,
        sold_amount: 6000,
        last_visit_date: '2026-08-01',
      },
    ],
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
  const service = new LegacyLoyaltyBackfillShadowService(
    { planShadow } as unknown as ActionEngineRuntimeService,
    {
      crmClientLink: { findUnique: clientFindUnique },
      loyaltyAccount: { findUnique: accountFindUnique },
      loyaltyTransaction: { findMany: sourceRowsFindMany },
    } as unknown as PrismaService,
    { getClientRegistry } as unknown as CrmService,
    bridgeSource as unknown as BridgeSourceService,
    { runAsSystemTenant } as unknown as TenantContextService,
  );

  return {
    service,
    planShadow,
    clientFindUnique,
    accountFindUnique,
    sourceRowsFindMany,
    getClientRegistry,
    bridgeSource,
    runAsSystemTenant,
  };
}

describe('LegacyLoyaltyBackfillShadowService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      MAYA_LEGACY_LOYALTY_BACKFILL_SHADOW_ENABLED: 'true',
      MAYA_LEGACY_LOYALTY_BACKFILL_PER_CLIENT_CAP_POINTS: '1000',
      MAYA_LEGACY_LOYALTY_BACKFILL_PER_RUN_CAP_POINTS: '10000',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('converges lazy and batch initiators onto one client/program identity', async () => {
    const lazy = buildHarness();
    const batch = buildHarness();
    const batchDto = validDto();
    batchDto.initiator_kind = 'admin_batch';

    const lazyResult = await lazy.service.planBackfill(validDto());
    const batchResult = await batch.service.planBackfill(batchDto);

    expect(lazyResult).toEqual(batchResult);
    expect(lazyResult).toMatchObject({
      outcome: 'planned',
      actionExecutionId: 'execution-backfill-1',
      shadowDivergences: 0,
      intendedMutation: {
        model: 'LoyaltyTransaction',
        kind: 'backfill',
        deltaPoints: 300,
        programVersion: 'legacy-welcome-launch.v1',
        atomicBalanceUpdateRequired: true,
      },
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    });
    const [lazyRequest] = lazy.planShadow.mock.calls[0];
    const [batchRequest] = batch.planShadow.mock.calls[0];
    expect(batchRequest).toEqual(lazyRequest);
    expect(lazyRequest).toMatchObject({
      tenantId: 'tenant-a',
      capability: 'loyalty.legacy-backfill.shadow.v1',
      source: {
        type: 'legacy_bridge',
        sourceRef: 'legacy-loyalty:welcome-backfill',
      },
      targetRef: 'client:client-canonical-7',
      input: {
        provider: 'yclients',
        canonicalClientId: 'client-canonical-7',
        providerSoldAmountRubles: 6000,
        legacyClaimedSoldAmountRubles: 6000,
        legacyClaimedPoints: 300,
        calculatedUncappedPoints: 300,
        intendedDeltaPoints: 300,
        backfillDecision: 'grant',
        backfillPolicy: 'legacy-welcome-ltv-5pct-cap.v1',
        programVersion: 'legacy-welcome-launch.v1',
        perClientCapPoints: 1000,
        perRunCapPoints: 10000,
        clientCapDecision: 'within_cap',
        runCapDecision: 'within_cap',
        existingSourceDecision: 'none',
        providerEvidence: 'exact_client_ltv_snapshot',
        divergenceCodes: [],
      },
      callerIdempotency: {
        scope: 'p4-03.backfill-legacy-loyalty.shadow',
      },
    });
    expect(lazyRequest.source.occurrenceScope).toContain(
      lazyRequest.callerIdempotency.key,
    );
    expect(lazy.getClientRegistry).toHaveBeenCalledWith('tenant-a');
  });

  it('fails closed for an unmapped, merged, or cross-tenant client', async () => {
    const setup = buildHarness();
    setup.clientFindUnique.mockResolvedValue(null);

    await expect(setup.service.planBackfill(validDto())).resolves.toMatchObject(
      {
        outcome: 'identity_unresolved',
        actionExecutionId: null,
        newPathValueMutations: 0,
        newPathProviderWrites: 0,
      },
    );
    expect(setup.getClientRegistry).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('requires exact provider client LTV evidence', async () => {
    const setup = buildHarness();
    setup.getClientRegistry.mockResolvedValue({
      provider: 'yclients',
      generated_at: '2026-08-30T12:00:00.000Z',
      complete: true,
      clients: [
        {
          external_id: 'other-client',
          name: 'Other',
          phone: '+79990000007',
          visits_count: 12,
          sold_amount: 6000,
          last_visit_date: null,
        },
      ],
    });

    await expect(setup.service.planBackfill(validDto())).resolves.toMatchObject(
      {
        outcome: 'evidence_unresolved',
        actionExecutionId: null,
      },
    );
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('treats provider failure as unresolved evidence without UNKNOWN or retry', async () => {
    const setup = buildHarness();
    setup.getClientRegistry.mockRejectedValue(new Error('provider timeout'));

    await expect(setup.service.planBackfill(validDto())).resolves.toMatchObject(
      {
        outcome: 'evidence_unresolved',
        actionExecutionId: null,
        newPathValueMutations: 0,
        newPathProviderWrites: 0,
      },
    );
    expect(setup.getClientRegistry).toHaveBeenCalledTimes(1);
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('uses server provider LTV and caps rather than legacy claims', async () => {
    const setup = buildHarness();
    const dto = validDto();
    dto.legacy_claimed_sold_amount_rubles = 5000;
    dto.legacy_claimed_points = 250;

    const result = await setup.service.planBackfill(dto);

    expect(result).toMatchObject({
      outcome: 'planned',
      shadowDivergences: 2,
      intendedMutation: { deltaPoints: 300 },
    });
    expect(setup.planShadow.mock.calls[0]?.[0].input).toMatchObject({
      providerSoldAmountRubles: 6000,
      calculatedUncappedPoints: 300,
      intendedDeltaPoints: 300,
      divergenceCodes: [
        'legacy_points_mismatch',
        'legacy_sold_amount_mismatch',
      ],
    });
  });

  it('applies the server client cap and refuses a candidate over the run cap', async () => {
    const setup = buildHarness();
    setup.getClientRegistry.mockResolvedValue({
      provider: 'yclients',
      generated_at: '2026-08-30T12:00:00.000Z',
      complete: true,
      clients: [
        {
          external_id: '7007',
          name: 'Exact client',
          phone: '+79990000007',
          visits_count: 12,
          sold_amount: 100_000,
          last_visit_date: null,
        },
      ],
    });
    process.env.MAYA_LEGACY_LOYALTY_BACKFILL_PER_RUN_CAP_POINTS = '900';
    const dto = validDto();
    dto.legacy_claimed_sold_amount_rubles = 100_000;
    dto.legacy_claimed_points = 1000;

    const result = await setup.service.planBackfill(dto);

    expect(result).toMatchObject({
      outcome: 'planned',
      shadowDivergences: 1,
      intendedMutation: null,
    });
    expect(setup.planShadow.mock.calls[0]?.[0].input).toMatchObject({
      calculatedUncappedPoints: 5000,
      intendedDeltaPoints: 0,
      clientCapDecision: 'capped',
      runCapDecision: 'exceeds_cap',
      backfillDecision: 'do_not_grant',
      divergenceCodes: ['per_run_cap_exceeded'],
    });
  });

  it('creates no second grant after exact backfill or provider import', async () => {
    const backfill = buildHarness();
    backfill.sourceRowsFindMany.mockResolvedValue([
      {
        id: 'backfill-row-7',
        kind: 'backfill',
        actionExecutionId: 'execution-backfill-old',
        externalRef: BACKFILL_CORRELATION,
      },
    ]);
    const providerImport = buildHarness();
    providerImport.sourceRowsFindMany.mockResolvedValue([
      {
        id: 'import-row-7',
        kind: 'yc_import',
        actionExecutionId: 'execution-import-old',
        externalRef: 'provider-card-correlation',
      },
    ]);

    const backfillResult = await backfill.service.planBackfill(validDto());
    const importResult = await providerImport.service.planBackfill(validDto());

    expect(backfillResult).toMatchObject({
      outcome: 'planned',
      shadowDivergences: 1,
      intendedMutation: null,
    });
    expect(importResult).toMatchObject({
      outcome: 'planned',
      shadowDivergences: 1,
      intendedMutation: null,
    });
    expect(backfill.planShadow.mock.calls[0]?.[0].input).toMatchObject({
      existingSourceDecision: 'backfill_already_exists',
      divergenceCodes: ['canonical_backfill_already_exists'],
    });
    expect(providerImport.planShadow.mock.calls[0]?.[0].input).toMatchObject({
      existingSourceDecision: 'provider_balance_already_imported',
      divergenceCodes: ['canonical_provider_import_already_exists'],
    });
  });

  it('fails closed for unbound, duplicate, or contradictory source rows', async () => {
    const setup = buildHarness();
    setup.sourceRowsFindMany.mockResolvedValue([
      {
        id: 'backfill-row-7',
        kind: 'backfill',
        actionExecutionId: null,
        externalRef: BACKFILL_CORRELATION,
      },
    ]);

    await expect(setup.service.planBackfill(validDto())).resolves.toMatchObject(
      {
        outcome: 'evidence_unresolved',
        actionExecutionId: null,
      },
    );
    expect(setup.planShadow).not.toHaveBeenCalled();
  });
});
