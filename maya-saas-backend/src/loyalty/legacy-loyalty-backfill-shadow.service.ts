import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  LEGACY_LOYALTY_BACKFILL_POLICY,
  LEGACY_LOYALTY_BACKFILL_PROGRAM,
  LEGACY_LOYALTY_BACKFILL_SHADOW_CAPABILITY,
  calculateLegacyLoyaltyBackfillPoints,
} from '../action-engine';
import { CrmService } from '../crm/crm.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { LegacyLoyaltyBackfillShadowDto } from './dto/legacy-loyalty-backfill-shadow.dto';

type NoPlanOutcome =
  | 'shadow_disabled'
  | 'identity_unresolved'
  | 'policy_unresolved'
  | 'evidence_unresolved';

type ExistingSourceDecision =
  'none' | 'backfill_already_exists' | 'provider_balance_already_imported';

export interface LegacyLoyaltyBackfillShadowResult {
  outcome: 'planned' | NoPlanOutcome;
  actionExecutionId: string | null;
  shadowDivergences: number;
  intendedMutation: {
    model: 'LoyaltyTransaction';
    kind: 'backfill';
    deltaPoints: number;
    programVersion: typeof LEGACY_LOYALTY_BACKFILL_PROGRAM;
    atomicBalanceUpdateRequired: true;
  } | null;
  newPathValueMutations: 0;
  newPathProviderWrites: 0;
}

@Injectable()
export class LegacyLoyaltyBackfillShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly crm: CrmService,
    private readonly bridgeSource: BridgeSourceService,
    private readonly tenantContext: TenantContextService,
  ) {}

  assertSecret(header: string | undefined): void {
    this.bridgeSource.assertBridgeSecret(header, 'MAYA_INBOX_BRIDGE_TOKEN', {
      disabled: 'legacy_loyalty_backfill_shadow_bridge_disabled',
      unauthorized: 'legacy_loyalty_backfill_shadow_bridge_unauthorized',
    });
  }

  async planBackfill(
    dto: LegacyLoyaltyBackfillShadowDto,
  ): Promise<LegacyLoyaltyBackfillShadowResult> {
    if (!this.enabled()) return this.noPlan('shadow_disabled', 0);
    const perClientCapPoints = this.positiveInteger(
      process.env.MAYA_LEGACY_LOYALTY_BACKFILL_PER_CLIENT_CAP_POINTS,
      5_000_000,
    );
    const perRunCapPoints = this.positiveInteger(
      process.env.MAYA_LEGACY_LOYALTY_BACKFILL_PER_RUN_CAP_POINTS,
      5_000_000,
    );
    if (perClientCapPoints === null || perRunCapPoints === null) {
      return this.noPlan('policy_unresolved', 1);
    }

    const boundSource = this.bridgeSource.assertBridgeIntegrationBinding(
      {
        provider: dto.provider,
        externalCompanyId: dto.external_company_id,
      },
      {
        provider: 'MAYA_LEGACY_LOYALTY_SHADOW_SOURCE_PROVIDER',
        externalCompanyId: 'MAYA_LEGACY_LOYALTY_SHADOW_SOURCE_COMPANY_ID',
      },
      {
        disabled: 'legacy_loyalty_backfill_shadow_source_binding_disabled',
        mismatch: 'legacy_loyalty_backfill_shadow_source_binding_mismatch',
      },
    );
    const tenant = await this.bridgeSource.resolveTenantByIntegration(
      boundSource,
      'legacy_loyalty_backfill_shadow_tenant_not_found',
    );

    const externalClientId = dto.external_client_id.trim();
    if (!externalClientId) return this.noPlan('identity_unresolved', 1);

    const clientLink = await this.prisma.crmClientLink.findUnique({
      where: {
        tenantId_provider_externalId: {
          tenantId: tenant.tenantId,
          provider: boundSource.provider,
          externalId: externalClientId,
        },
      },
      select: {
        unlinkedAt: true,
        client: {
          select: {
            id: true,
            userId: true,
            mergedIntoClientId: true,
            user: { select: { phone: true } },
          },
        },
      },
    });
    const phone = clientLink?.client.user?.phone?.trim() ?? '';
    if (
      !clientLink?.client.userId ||
      clientLink.client.mergedIntoClientId !== null ||
      clientLink.unlinkedAt !== null ||
      !phone
    ) {
      return this.noPlan('identity_unresolved', 1);
    }

    const account = await this.prisma.loyaltyAccount.findUnique({
      where: {
        userId_tenantId: {
          userId: clientLink.client.userId,
          tenantId: tenant.tenantId,
        },
      },
      select: { id: true },
    });
    if (!account) return this.noPlan('identity_unresolved', 1);

    let providerClients: Awaited<ReturnType<CrmService['searchClients']>>;
    try {
      providerClients = await this.tenantContext.runAsSystemTenant(
        tenant.tenantId,
        () => this.crm.searchClients(tenant.tenantId, phone),
      );
    } catch {
      return this.noPlan('evidence_unresolved', 1);
    }
    const exactProviderClients = providerClients.filter(
      (candidate) => candidate.id === externalClientId,
    );
    const providerClient = exactProviderClients[0];
    if (
      exactProviderClients.length !== 1 ||
      providerClient.sold_amount === null ||
      !Number.isFinite(providerClient.sold_amount) ||
      providerClient.sold_amount < 0 ||
      providerClient.sold_amount > 100_000_000
    ) {
      return this.noPlan('evidence_unresolved', 1);
    }
    const providerSoldAmountRubles = Math.floor(providerClient.sold_amount);

    const providerClientIdentityHash = this.hash([
      tenant.tenantId,
      boundSource.provider,
      externalClientId,
    ]);
    const backfillCorrelationHash = this.hash([
      tenant.tenantId,
      clientLink.client.id,
      LEGACY_LOYALTY_BACKFILL_PROGRAM,
      LEGACY_LOYALTY_BACKFILL_POLICY,
    ]);
    const priorSourceRows = await this.prisma.loyaltyTransaction.findMany({
      where: {
        tenantId: tenant.tenantId,
        accountId: account.id,
        kind: { in: ['backfill', 'yc_import'] },
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        kind: true,
        actionExecutionId: true,
        externalRef: true,
      },
    });
    const priorBackfills = priorSourceRows.filter(
      (row) => row.kind === 'backfill',
    );
    const priorImports = priorSourceRows.filter(
      (row) => row.kind === 'yc_import',
    );
    if (
      priorBackfills.length > 1 ||
      priorImports.length > 1 ||
      (priorBackfills.length > 0 && priorImports.length > 0) ||
      priorSourceRows.some(
        (row) =>
          row.actionExecutionId === null ||
          !row.externalRef ||
          (row.kind === 'backfill' &&
            row.externalRef !== backfillCorrelationHash),
      )
    ) {
      return this.noPlan('evidence_unresolved', 1);
    }

    const existingSourceDecision: ExistingSourceDecision = priorBackfills.length
      ? 'backfill_already_exists'
      : priorImports.length
        ? 'provider_balance_already_imported'
        : 'none';
    const calculatedUncappedPoints = calculateLegacyLoyaltyBackfillPoints(
      providerSoldAmountRubles,
    );
    const canonicalPoints = Math.min(
      calculatedUncappedPoints,
      perClientCapPoints,
    );
    const eligible =
      canonicalPoints > 0 &&
      canonicalPoints <= perRunCapPoints &&
      existingSourceDecision === 'none';
    const intendedDeltaPoints = eligible ? canonicalPoints : 0;
    const divergenceCodes = this.divergences({
      providerSoldAmountRubles,
      legacyClaimedSoldAmountRubles: dto.legacy_claimed_sold_amount_rubles,
      legacyClaimedPoints: dto.legacy_claimed_points,
      perClientCapPoints,
      perRunCapPoints,
      existingSourceDecision,
    });
    const logicalIdentityHash = this.hash([
      'p4-03.backfill-legacy-loyalty.v1',
      tenant.tenantId,
      clientLink.client.id,
      LEGACY_LOYALTY_BACKFILL_PROGRAM,
      LEGACY_LOYALTY_BACKFILL_POLICY,
    ]);
    const loyaltyAccountIdentityHash = this.hash([tenant.tenantId, account.id]);
    const input = {
      provider: boundSource.provider,
      canonicalClientId: clientLink.client.id,
      loyaltyAccountIdentityHash,
      providerClientIdentityHash,
      providerSoldAmountRubles,
      legacyClaimedSoldAmountRubles: dto.legacy_claimed_sold_amount_rubles,
      legacyClaimedPoints: dto.legacy_claimed_points,
      calculatedUncappedPoints,
      intendedDeltaPoints,
      backfillDecision: eligible ? 'grant' : 'do_not_grant',
      backfillPolicy: LEGACY_LOYALTY_BACKFILL_POLICY,
      programVersion: LEGACY_LOYALTY_BACKFILL_PROGRAM,
      perClientCapPoints,
      perRunCapPoints,
      clientCapDecision:
        calculatedUncappedPoints > perClientCapPoints ? 'capped' : 'within_cap',
      runCapDecision:
        canonicalPoints <= perRunCapPoints ? 'within_cap' : 'exceeds_cap',
      existingSourceDecision,
      providerEvidence: 'exact_client_ltv_snapshot',
      divergenceCodes,
    };

    const execution = await this.tenantContext.runAsSystemTenant(
      tenant.tenantId,
      () =>
        this.actionEngine.planShadow({
          contract: ACTION_EXECUTION_REQUEST_CONTRACT,
          tenantId: tenant.tenantId,
          capability: LEGACY_LOYALTY_BACKFILL_SHADOW_CAPABILITY,
          source: {
            type: 'legacy_bridge',
            occurrenceScope: `p4-03:backfill:${logicalIdentityHash}`,
            sourceRef: 'legacy-loyalty:welcome-backfill',
          },
          targetRef: `client:${clientLink.client.id}`,
          input,
          evidenceRefs: [
            `provider-client:${providerClientIdentityHash}`,
            `loyalty-account:${loyaltyAccountIdentityHash}`,
          ],
          callerIdempotency: {
            scope: 'p4-03.backfill-legacy-loyalty.shadow',
            key: logicalIdentityHash,
          },
        }),
    );

    return {
      outcome: 'planned',
      actionExecutionId: execution.id,
      shadowDivergences: divergenceCodes.length,
      intendedMutation: eligible
        ? {
            model: 'LoyaltyTransaction',
            kind: 'backfill',
            deltaPoints: intendedDeltaPoints,
            programVersion: LEGACY_LOYALTY_BACKFILL_PROGRAM,
            atomicBalanceUpdateRequired: true,
          }
        : null,
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    };
  }

  private enabled(): boolean {
    return new Set(['1', 'true', 'on', 'yes']).has(
      String(process.env.MAYA_LEGACY_LOYALTY_BACKFILL_SHADOW_ENABLED || '')
        .trim()
        .toLowerCase(),
    );
  }

  private positiveInteger(
    value: string | undefined,
    max: number,
  ): number | null {
    if (!value || !/^\d+$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= max
      ? parsed
      : null;
  }

  private divergences(input: {
    providerSoldAmountRubles: number;
    legacyClaimedSoldAmountRubles: number;
    legacyClaimedPoints: number;
    perClientCapPoints: number;
    perRunCapPoints: number;
    existingSourceDecision: ExistingSourceDecision;
  }): string[] {
    const canonicalPoints = Math.min(
      calculateLegacyLoyaltyBackfillPoints(input.providerSoldAmountRubles),
      input.perClientCapPoints,
    );
    const values: string[] = [];
    if (
      input.providerSoldAmountRubles !== input.legacyClaimedSoldAmountRubles
    ) {
      values.push('legacy_sold_amount_mismatch');
    }
    if (canonicalPoints !== input.legacyClaimedPoints) {
      values.push('legacy_points_mismatch');
    }
    if (canonicalPoints > input.perRunCapPoints) {
      values.push('per_run_cap_exceeded');
    }
    if (input.existingSourceDecision === 'backfill_already_exists') {
      values.push('canonical_backfill_already_exists');
    }
    if (input.existingSourceDecision === 'provider_balance_already_imported') {
      values.push('canonical_provider_import_already_exists');
    }
    return values.sort();
  }

  private hash(parts: readonly string[]): string {
    return createHash('sha256').update(parts.join('\u001f')).digest('hex');
  }

  private noPlan(
    outcome: NoPlanOutcome,
    shadowDivergences: number,
  ): LegacyLoyaltyBackfillShadowResult {
    return {
      outcome,
      actionExecutionId: null,
      shadowDivergences,
      intendedMutation: null,
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    };
  }
}
