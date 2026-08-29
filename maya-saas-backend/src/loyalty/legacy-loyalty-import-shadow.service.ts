import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  LEGACY_LOYALTY_IMPORT_POLICY,
  LEGACY_LOYALTY_IMPORT_SHADOW_CAPABILITY,
} from '../action-engine';
import { CrmService } from '../crm/crm.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { LegacyLoyaltyImportShadowDto } from './dto/legacy-loyalty-import-shadow.dto';

type NoPlanOutcome =
  | 'shadow_disabled'
  | 'identity_unresolved'
  | 'policy_unresolved'
  | 'evidence_unresolved';

export interface LegacyLoyaltyImportShadowResult {
  outcome: 'planned' | NoPlanOutcome;
  actionExecutionId: string | null;
  shadowDivergences: number;
  intendedMutation: {
    model: 'LoyaltyTransaction';
    kind: 'yc_import';
    deltaPoints: number;
    providerCardIdentityHash: string;
    atomicBalanceUpdateRequired: true;
  } | null;
  newPathValueMutations: 0;
  newPathProviderWrites: 0;
}

@Injectable()
export class LegacyLoyaltyImportShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly crm: CrmService,
    private readonly bridgeSource: BridgeSourceService,
    private readonly tenantContext: TenantContextService,
  ) {}

  assertSecret(header: string | undefined): void {
    this.bridgeSource.assertBridgeSecret(header, 'MAYA_INBOX_BRIDGE_TOKEN', {
      disabled: 'legacy_loyalty_import_shadow_bridge_disabled',
      unauthorized: 'legacy_loyalty_import_shadow_bridge_unauthorized',
    });
  }

  async planImport(
    dto: LegacyLoyaltyImportShadowDto,
  ): Promise<LegacyLoyaltyImportShadowResult> {
    if (!this.enabled()) return this.noPlan('shadow_disabled', 0);
    const perActionCapPoints = this.positiveInteger(
      process.env.MAYA_LEGACY_LOYALTY_IMPORT_PER_ACTION_CAP_POINTS,
      5_000_000,
    );
    if (perActionCapPoints === null) {
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
        disabled: 'legacy_loyalty_import_shadow_source_binding_disabled',
        mismatch: 'legacy_loyalty_import_shadow_source_binding_mismatch',
      },
    );
    const tenant = await this.bridgeSource.resolveTenantByIntegration(
      boundSource,
      'legacy_loyalty_import_shadow_tenant_not_found',
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
      select: { id: true, balance: true },
    });
    if (
      !account ||
      !Number.isInteger(account.balance) ||
      account.balance < 0 ||
      account.balance > 5_000_000
    ) {
      return this.noPlan('identity_unresolved', 1);
    }

    let providerSnapshot: Awaited<
      ReturnType<CrmService['getClientLoyaltyEvidenceReadOnly']>
    >;
    try {
      providerSnapshot = await this.tenantContext.runAsSystemTenant(
        tenant.tenantId,
        () => this.crm.getClientLoyaltyEvidenceReadOnly(tenant.tenantId, phone),
      );
    } catch {
      return this.noPlan('evidence_unresolved', 1);
    }
    if (
      !providerSnapshot ||
      providerSnapshot.provider !== boundSource.provider ||
      providerSnapshot.external_client_id !== externalClientId ||
      !providerSnapshot.external_card_id ||
      !Number.isInteger(providerSnapshot.balance) ||
      providerSnapshot.balance < 0 ||
      providerSnapshot.balance > 5_000_000
    ) {
      return this.noPlan('evidence_unresolved', 1);
    }

    const providerCardIdentityHash = this.hash([
      tenant.tenantId,
      boundSource.provider,
      externalClientId,
      providerSnapshot.external_card_id,
    ]);
    const priorImports = await this.prisma.loyaltyTransaction.findMany({
      where: {
        tenantId: tenant.tenantId,
        accountId: account.id,
        kind: 'yc_import',
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        actionExecutionId: true,
        externalRef: true,
      },
    });
    if (
      priorImports.length > 1 ||
      priorImports.some(
        (row) =>
          row.actionExecutionId === null ||
          row.externalRef !== providerCardIdentityHash,
      )
    ) {
      return this.noPlan('evidence_unresolved', 1);
    }

    const existingImportDecision =
      priorImports.length === 1 ? 'already_imported' : 'none';
    const canonicalDelta = providerSnapshot.balance - account.balance;
    const divergenceCodes = this.divergences({
      providerBalancePoints: providerSnapshot.balance,
      canonicalCurrentBalancePoints: account.balance,
      legacyClaimedProviderBalancePoints:
        dto.legacy_claimed_provider_balance_points,
      legacyClaimedCurrentBalancePoints:
        dto.legacy_claimed_current_balance_points,
      legacyClaimedDeltaPoints: dto.legacy_claimed_delta_points,
      perActionCapPoints,
      existingImportDecision,
    });
    const eligible =
      Math.abs(canonicalDelta) <= perActionCapPoints &&
      existingImportDecision === 'none';
    const intendedDeltaPoints = eligible ? canonicalDelta : 0;
    const logicalIdentityHash = this.hash([
      'p4-03.import-legacy-loyalty-balance.v1',
      tenant.tenantId,
      clientLink.client.id,
      boundSource.provider,
      providerSnapshot.external_card_id,
      LEGACY_LOYALTY_IMPORT_POLICY,
    ]);
    const loyaltyAccountIdentityHash = this.hash([tenant.tenantId, account.id]);
    const input = {
      provider: boundSource.provider,
      canonicalClientId: clientLink.client.id,
      loyaltyAccountIdentityHash,
      providerCardIdentityHash,
      providerBalancePoints: providerSnapshot.balance,
      canonicalCurrentBalancePoints: account.balance,
      legacyClaimedProviderBalancePoints:
        dto.legacy_claimed_provider_balance_points,
      legacyClaimedCurrentBalancePoints:
        dto.legacy_claimed_current_balance_points,
      legacyClaimedDeltaPoints: dto.legacy_claimed_delta_points,
      intendedDeltaPoints,
      importDecision: eligible ? 'import' : 'do_not_import',
      importPolicy: LEGACY_LOYALTY_IMPORT_POLICY,
      perActionCapPoints,
      capDecision:
        Math.abs(canonicalDelta) <= perActionCapPoints
          ? 'within_cap'
          : 'exceeds_cap',
      existingImportDecision,
      providerEvidence: 'exact_card_snapshot',
      divergenceCodes,
    };

    const execution = await this.tenantContext.runAsSystemTenant(
      tenant.tenantId,
      () =>
        this.actionEngine.planShadow({
          contract: ACTION_EXECUTION_REQUEST_CONTRACT,
          tenantId: tenant.tenantId,
          capability: LEGACY_LOYALTY_IMPORT_SHADOW_CAPABILITY,
          source: {
            type: 'legacy_bridge',
            occurrenceScope: `p4-03:import:${logicalIdentityHash}`,
            sourceRef: 'legacy-loyalty:lazy-provider-card-import',
          },
          targetRef: `loyalty-account:${loyaltyAccountIdentityHash}`,
          input,
          evidenceRefs: [
            `provider-card:${providerCardIdentityHash}`,
            `loyalty-account:${loyaltyAccountIdentityHash}`,
          ],
          callerIdempotency: {
            scope: 'p4-03.import-legacy-loyalty-balance.shadow',
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
            kind: 'yc_import',
            deltaPoints: intendedDeltaPoints,
            providerCardIdentityHash,
            atomicBalanceUpdateRequired: true,
          }
        : null,
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    };
  }

  private enabled(): boolean {
    return new Set(['1', 'true', 'on', 'yes']).has(
      String(process.env.MAYA_LEGACY_LOYALTY_IMPORT_SHADOW_ENABLED || '')
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
    providerBalancePoints: number;
    canonicalCurrentBalancePoints: number;
    legacyClaimedProviderBalancePoints: number;
    legacyClaimedCurrentBalancePoints: number;
    legacyClaimedDeltaPoints: number;
    perActionCapPoints: number;
    existingImportDecision: 'none' | 'already_imported';
  }): string[] {
    const canonicalDelta =
      input.providerBalancePoints - input.canonicalCurrentBalancePoints;
    const values: string[] = [];
    if (
      input.providerBalancePoints !== input.legacyClaimedProviderBalancePoints
    ) {
      values.push('legacy_provider_balance_mismatch');
    }
    if (
      input.canonicalCurrentBalancePoints !==
      input.legacyClaimedCurrentBalancePoints
    ) {
      values.push('legacy_current_balance_mismatch');
    }
    if (canonicalDelta !== input.legacyClaimedDeltaPoints) {
      values.push('legacy_delta_mismatch');
    }
    if (Math.abs(canonicalDelta) > input.perActionCapPoints) {
      values.push('per_action_cap_exceeded');
    }
    if (input.existingImportDecision === 'already_imported') {
      values.push('canonical_import_already_exists');
    }
    return values.sort();
  }

  private hash(parts: readonly string[]): string {
    return createHash('sha256').update(parts.join('\u001f')).digest('hex');
  }

  private noPlan(
    outcome: NoPlanOutcome,
    shadowDivergences: number,
  ): LegacyLoyaltyImportShadowResult {
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
