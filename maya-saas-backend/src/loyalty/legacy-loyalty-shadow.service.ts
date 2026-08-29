import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  LEGACY_LOYALTY_EARN_CALCULATION_POLICY,
  LEGACY_LOYALTY_EARN_SHADOW_CAPABILITY,
  calculateLegacyLoyaltyEarnPoints,
} from '../action-engine';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { LegacyLoyaltyEarnShadowDto } from './dto/legacy-loyalty-earn-shadow.dto';

export interface LegacyLoyaltyEarnShadowResult {
  outcome: 'planned' | 'identity_unresolved' | 'shadow_disabled';
  actionExecutionId: string | null;
  shadowDivergences: number;
  intendedMutation: {
    model: 'LoyaltyTransaction';
    kind: 'earn';
    deltaPoints: number;
    providerVisitIdentityHash: string;
  } | null;
  newPathValueMutations: 0;
  newPathProviderWrites: 0;
}

@Injectable()
export class LegacyLoyaltyShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly bridgeSource: BridgeSourceService,
    private readonly tenantContext: TenantContextService,
  ) {}

  assertSecret(header: string | undefined): void {
    this.bridgeSource.assertBridgeSecret(header, 'MAYA_INBOX_BRIDGE_TOKEN', {
      disabled: 'legacy_loyalty_shadow_bridge_disabled',
      unauthorized: 'legacy_loyalty_shadow_bridge_unauthorized',
    });
  }

  async planEarn(
    dto: LegacyLoyaltyEarnShadowDto,
  ): Promise<LegacyLoyaltyEarnShadowResult> {
    if (!this.enabled()) return this.noPlan('shadow_disabled', 0);

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
        disabled: 'legacy_loyalty_shadow_source_binding_disabled',
        mismatch: 'legacy_loyalty_shadow_source_binding_mismatch',
      },
    );
    const tenant = await this.bridgeSource.resolveTenantByIntegration(
      boundSource,
      'legacy_loyalty_shadow_tenant_not_found',
    );

    const externalClientId = dto.external_client_id.trim();
    const providerVisitId = dto.visit_record_id.trim();
    if (
      !externalClientId ||
      !providerVisitId ||
      !this.validIsoDate(dto.visit_occurred_on)
    ) {
      return this.noPlan('identity_unresolved', 1);
    }
    const clientLink = await this.prisma.crmClientLink.findUnique({
      where: {
        tenantId_provider_externalId: {
          tenantId: tenant.tenantId,
          provider: boundSource.provider,
          externalId: externalClientId,
        },
      },
      select: {
        client: {
          select: {
            id: true,
            userId: true,
            mergedIntoClientId: true,
          },
        },
      },
    });
    if (
      !clientLink?.client.userId ||
      clientLink.client.mergedIntoClientId !== null
    ) {
      return this.noPlan('identity_unresolved', 1);
    }

    const intendedDeltaPoints = calculateLegacyLoyaltyEarnPoints(
      dto.visit_amount_rubles,
    );
    if (intendedDeltaPoints < 1) {
      return this.noPlan('identity_unresolved', 1);
    }
    const divergenceCode =
      intendedDeltaPoints === dto.legacy_claimed_points
        ? 'none'
        : 'legacy_points_mismatch';
    const logicalIdentityHash = this.hash([
      'p4-03.earn-legacy-loyalty.v1',
      tenant.tenantId,
      boundSource.provider,
      clientLink.client.id,
      providerVisitId,
    ]);
    const input = {
      provider: boundSource.provider,
      canonicalClientId: clientLink.client.id,
      providerVisitIdentityHash: logicalIdentityHash,
      visitOccurredOn: dto.visit_occurred_on,
      visitAmountRubles: dto.visit_amount_rubles,
      intendedDeltaPoints,
      legacyClaimedPoints: dto.legacy_claimed_points,
      calculationPolicy: LEGACY_LOYALTY_EARN_CALCULATION_POLICY,
      divergenceCode,
    };

    const execution = await this.tenantContext.runAsSystemTenant(
      tenant.tenantId,
      () =>
        this.actionEngine.planShadow({
          contract: ACTION_EXECUTION_REQUEST_CONTRACT,
          tenantId: tenant.tenantId,
          capability: LEGACY_LOYALTY_EARN_SHADOW_CAPABILITY,
          source: {
            type: 'legacy_bridge',
            occurrenceScope: `p4-03:earn:${logicalIdentityHash}`,
            sourceRef: 'legacy-loyalty:daily-earn-job',
          },
          targetRef: `client:${clientLink.client.id}`,
          input,
          evidenceRefs: [`provider-visit:${logicalIdentityHash}`],
          callerIdempotency: {
            scope: 'p4-03.earn-legacy-loyalty.shadow',
            key: logicalIdentityHash,
          },
        }),
    );

    return {
      outcome: 'planned',
      actionExecutionId: execution.id,
      shadowDivergences: divergenceCode === 'none' ? 0 : 1,
      intendedMutation: {
        model: 'LoyaltyTransaction',
        kind: 'earn',
        deltaPoints: intendedDeltaPoints,
        providerVisitIdentityHash: logicalIdentityHash,
      },
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    };
  }

  private enabled(): boolean {
    return ['1', 'true', 'on', 'yes'].includes(
      String(process.env.MAYA_LEGACY_LOYALTY_EARN_SHADOW_ENABLED || '')
        .trim()
        .toLowerCase(),
    );
  }

  private hash(parts: readonly string[]): string {
    return createHash('sha256')
      .update(JSON.stringify(parts))
      .digest('base64url');
  }

  private validIsoDate(value: string): boolean {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }

  private noPlan(
    outcome: 'identity_unresolved' | 'shadow_disabled',
    shadowDivergences: number,
  ): LegacyLoyaltyEarnShadowResult {
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
