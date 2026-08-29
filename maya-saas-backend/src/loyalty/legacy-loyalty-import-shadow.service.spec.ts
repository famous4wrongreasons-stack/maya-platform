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
  LEGACY_LOYALTY_IMPORT_SHADOW_BRIDGE_CONTRACT,
  LegacyLoyaltyImportShadowDto,
} from './dto/legacy-loyalty-import-shadow.dto';
import { LegacyLoyaltyImportShadowService } from './legacy-loyalty-import-shadow.service';

function hash(parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\u001f')).digest('hex');
}

const CARD_HASH = hash(['tenant-a', 'yclients', '7007', 'card-77']);

const validDto = (): LegacyLoyaltyImportShadowDto => ({
  contract: LEGACY_LOYALTY_IMPORT_SHADOW_BRIDGE_CONTRACT,
  provider: 'yclients',
  external_company_id: 'company-42',
  external_client_id: '7007',
  legacy_claimed_provider_balance_points: 900,
  legacy_claimed_current_balance_points: 600,
  legacy_claimed_delta_points: 300,
});

function buildHarness() {
  const planShadow: jest.MockedFunction<
    ActionEngineRuntimeService['planShadow']
  > = jest.fn((request: TrustedActionExecutionRequestV1) => {
    void request;
    return Promise.resolve({ id: 'execution-import-1' } as ActionExecution);
  });
  const clientFindUnique = jest.fn().mockResolvedValue({
    unlinkedAt: null,
    client: {
      id: 'client-canonical-7',
      userId: 'user-7',
      mergedIntoClientId: null,
      user: { phone: '+79990000007' },
    },
  });
  const accountFindUnique = jest.fn().mockResolvedValue({
    id: 'account-7',
    balance: 600,
  });
  const importFindMany = jest.fn().mockResolvedValue([]);
  const getClientLoyaltyEvidenceReadOnly = jest.fn().mockResolvedValue({
    provider: 'yclients',
    external_client_id: '7007',
    external_card_id: 'card-77',
    balance: 900,
    sold_amount: 3000,
    currency: 'RUB',
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
  const service = new LegacyLoyaltyImportShadowService(
    { planShadow } as unknown as ActionEngineRuntimeService,
    {
      crmClientLink: { findUnique: clientFindUnique },
      loyaltyAccount: { findUnique: accountFindUnique },
      loyaltyTransaction: { findMany: importFindMany },
    } as unknown as PrismaService,
    { getClientLoyaltyEvidenceReadOnly } as unknown as CrmService,
    bridgeSource as unknown as BridgeSourceService,
    { runAsSystemTenant } as unknown as TenantContextService,
  );

  return {
    service,
    planShadow,
    clientFindUnique,
    accountFindUnique,
    importFindMany,
    getClientLoyaltyEvidenceReadOnly,
    bridgeSource,
    runAsSystemTenant,
  };
}

describe('LegacyLoyaltyImportShadowService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      MAYA_LEGACY_LOYALTY_IMPORT_SHADOW_ENABLED: 'true',
      MAYA_LEGACY_LOYALTY_IMPORT_PER_ACTION_CAP_POINTS: '1000',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('converges repeats onto one client/card/import-contract identity', async () => {
    const setup = buildHarness();

    const first = await setup.service.planImport(validDto());
    const second = await setup.service.planImport(validDto());

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      outcome: 'planned',
      actionExecutionId: 'execution-import-1',
      shadowDivergences: 0,
      intendedMutation: {
        model: 'LoyaltyTransaction',
        kind: 'yc_import',
        deltaPoints: 300,
        providerCardIdentityHash: CARD_HASH,
        atomicBalanceUpdateRequired: true,
      },
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    });
    const [firstRequest] = setup.planShadow.mock.calls[0];
    const [secondRequest] = setup.planShadow.mock.calls[1];
    expect(secondRequest).toEqual(firstRequest);
    expect(firstRequest).toMatchObject({
      tenantId: 'tenant-a',
      capability: 'loyalty.legacy-import.shadow.v1',
      source: {
        type: 'legacy_bridge',
        sourceRef: 'legacy-loyalty:lazy-provider-card-import',
      },
      input: {
        provider: 'yclients',
        canonicalClientId: 'client-canonical-7',
        providerCardIdentityHash: CARD_HASH,
        providerBalancePoints: 900,
        canonicalCurrentBalancePoints: 600,
        intendedDeltaPoints: 300,
        importDecision: 'import',
        importPolicy: 'legacy-one-time-provider-card-alignment.v1',
        perActionCapPoints: 1000,
        capDecision: 'within_cap',
        existingImportDecision: 'none',
        providerEvidence: 'exact_card_snapshot',
        divergenceCodes: [],
      },
      callerIdempotency: {
        scope: 'p4-03.import-legacy-loyalty-balance.shadow',
      },
    });
    expect(firstRequest.source.occurrenceScope).toContain(
      firstRequest.callerIdempotency.key,
    );
    expect(setup.getClientLoyaltyEvidenceReadOnly).toHaveBeenCalledWith(
      'tenant-a',
      '+79990000007',
    );
  });

  it('fails closed for an unmapped, merged, or cross-tenant client', async () => {
    const setup = buildHarness();
    setup.clientFindUnique.mockResolvedValue(null);

    await expect(setup.service.planImport(validDto())).resolves.toMatchObject({
      outcome: 'identity_unresolved',
      actionExecutionId: null,
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    });
    expect(setup.getClientLoyaltyEvidenceReadOnly).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('requires the server provider snapshot to match the exact client/card', async () => {
    const setup = buildHarness();
    setup.getClientLoyaltyEvidenceReadOnly.mockResolvedValue({
      provider: 'yclients',
      external_client_id: 'other-client',
      external_card_id: 'card-77',
      balance: 900,
      sold_amount: 3000,
      currency: 'RUB',
    });

    await expect(setup.service.planImport(validDto())).resolves.toMatchObject({
      outcome: 'evidence_unresolved',
      actionExecutionId: null,
    });
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('treats provider timeout as unresolved evidence without UNKNOWN or retry', async () => {
    const setup = buildHarness();
    setup.getClientLoyaltyEvidenceReadOnly.mockRejectedValue(
      new Error('provider timeout'),
    );

    await expect(setup.service.planImport(validDto())).resolves.toMatchObject({
      outcome: 'evidence_unresolved',
      actionExecutionId: null,
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    });
    expect(setup.getClientLoyaltyEvidenceReadOnly).toHaveBeenCalledTimes(1);
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('uses server provider/account values rather than legacy claims', async () => {
    const setup = buildHarness();
    const dto = validDto();
    dto.legacy_claimed_provider_balance_points = 850;
    dto.legacy_claimed_current_balance_points = 550;
    dto.legacy_claimed_delta_points = 250;

    const result = await setup.service.planImport(dto);

    expect(result).toMatchObject({
      outcome: 'planned',
      shadowDivergences: 3,
      intendedMutation: { deltaPoints: 300 },
    });
    expect(setup.planShadow.mock.calls[0]?.[0].input).toMatchObject({
      providerBalancePoints: 900,
      canonicalCurrentBalancePoints: 600,
      intendedDeltaPoints: 300,
      divergenceCodes: [
        'legacy_current_balance_mismatch',
        'legacy_delta_mismatch',
        'legacy_provider_balance_mismatch',
      ],
    });
  });

  it('plans no mutation when the server-owned cap is exceeded', async () => {
    const setup = buildHarness();
    process.env.MAYA_LEGACY_LOYALTY_IMPORT_PER_ACTION_CAP_POINTS = '250';

    const result = await setup.service.planImport(validDto());

    expect(result).toMatchObject({
      outcome: 'planned',
      shadowDivergences: 1,
      intendedMutation: null,
    });
    expect(setup.planShadow.mock.calls[0]?.[0].input).toMatchObject({
      intendedDeltaPoints: 0,
      importDecision: 'do_not_import',
      capDecision: 'exceeds_cap',
      divergenceCodes: ['per_action_cap_exceeded'],
    });
  });

  it('creates no second import intent for an exact bound canonical import', async () => {
    const setup = buildHarness();
    setup.importFindMany.mockResolvedValue([
      {
        id: 'import-row-7',
        actionExecutionId: 'execution-import-old',
        externalRef: CARD_HASH,
      },
    ]);

    const result = await setup.service.planImport(validDto());

    expect(result).toMatchObject({
      outcome: 'planned',
      shadowDivergences: 1,
      intendedMutation: null,
    });
    expect(setup.planShadow.mock.calls[0]?.[0].input).toMatchObject({
      existingImportDecision: 'already_imported',
      importDecision: 'do_not_import',
      divergenceCodes: ['canonical_import_already_exists'],
    });
  });

  it('fails closed for contradictory, unbound, or duplicate import evidence', async () => {
    const setup = buildHarness();
    setup.importFindMany.mockResolvedValue([
      {
        id: 'import-row-7',
        actionExecutionId: null,
        externalRef: CARD_HASH,
      },
    ]);

    await expect(setup.service.planImport(validDto())).resolves.toMatchObject({
      outcome: 'evidence_unresolved',
      actionExecutionId: null,
    });
    expect(setup.planShadow).not.toHaveBeenCalled();
  });
});
