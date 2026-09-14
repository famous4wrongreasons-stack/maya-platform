import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  LEGACY_LOYALTY_REDEMPTION_POLICY,
  LEGACY_LOYALTY_REDEEM_SHADOW_CAPABILITY,
} from '../action-engine';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { LegacyLoyaltyRedeemShadowDto } from './dto/legacy-loyalty-redeem-shadow.dto';

type NoPlanOutcome =
  | 'shadow_disabled'
  | 'identity_unresolved'
  | 'policy_unresolved'
  | 'evidence_unresolved';

export interface LegacyLoyaltyRedeemShadowResult {
  outcome: 'planned' | NoPlanOutcome;
  actionExecutionId: string | null;
  shadowDivergences: number;
  intendedMutation: {
    model: 'LoyaltyTransaction';
    kind: 'redeem';
    deltaPoints: number;
    balanceAfter: number;
    ledgerSemantics: 'reservation_finalize_release_under_one_execution';
    providerProjection: 'deferred_attempt';
  } | null;
  newPathValueMutations: 0;
  newPathProviderWrites: 0;
}

interface RedemptionPolicyConfig {
  perActionCapPoints: number;
  servicePoints: ReadonlyMap<string, number>;
}

@Injectable()
export class LegacyLoyaltyRedemptionShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly bridgeSource: BridgeSourceService,
    private readonly tenantContext: TenantContextService,
  ) {}

  assertSecret(header: string | undefined): void {
    this.bridgeSource.assertBridgeSecret(header, 'MAYA_INBOX_BRIDGE_TOKEN', {
      disabled: 'legacy_loyalty_redeem_shadow_bridge_disabled',
      unauthorized: 'legacy_loyalty_redeem_shadow_bridge_unauthorized',
    });
  }

  async planRedemption(
    dto: LegacyLoyaltyRedeemShadowDto,
  ): Promise<LegacyLoyaltyRedeemShadowResult> {
    if (!this.enabled()) return this.noPlan('shadow_disabled', 0);
    const policy = this.policyConfig();
    if (!policy) return this.noPlan('policy_unresolved', 1);

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
        disabled: 'legacy_loyalty_redeem_shadow_source_binding_disabled',
        mismatch: 'legacy_loyalty_redeem_shadow_source_binding_mismatch',
      },
    );
    const tenant = await this.bridgeSource.resolveTenantByIntegration(
      boundSource,
      'legacy_loyalty_redeem_shadow_tenant_not_found',
    );

    const externalClientId = dto.external_client_id.trim();
    const providerRecordId = dto.provider_record_id.trim();
    const providerServiceId = dto.provider_service_id.trim();
    const redemptionRequestId = dto.redemption_request_id.trim();
    const appointmentExecutionId = dto.appointment_execution_id.trim();
    if (
      !externalClientId ||
      !providerRecordId ||
      !providerServiceId ||
      !redemptionRequestId ||
      !appointmentExecutionId
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
            mergedIntoClientId: true,
          },
        },
      },
    });
    if (!clientLink || clientLink.client.mergedIntoClientId !== null) {
      return this.noPlan('identity_unresolved', 1);
    }

    const account = await this.prisma.loyaltyAccount.findUnique({
      where: {
        tenantId_clientId: {
          tenantId: tenant.tenantId,
          clientId: clientLink.client.id,
        },
      },
      select: { id: true, balance: true },
    });
    if (!account || account.balance < 0 || account.balance > 5_000_000) {
      return this.noPlan('identity_unresolved', 1);
    }

    const appointmentExecution = await this.prisma.actionExecution.findFirst({
      where: {
        id: appointmentExecutionId,
        tenantId: tenant.tenantId,
        actionClass: 'create_appointment',
        capability: 'crm.appointment.create.v1',
        state: 'SUCCEEDED',
      },
      select: { id: true, safeResultSummaryJson: true },
    });
    const safeResult = this.record(appointmentExecution?.safeResultSummaryJson);
    const safeExternalId = this.string(safeResult?.externalId);
    const safeServiceIds = this.stringArray(safeResult?.serviceIds);
    if (
      !appointmentExecution ||
      safeExternalId !== providerRecordId ||
      !safeServiceIds?.includes(providerServiceId)
    ) {
      return this.noPlan('evidence_unresolved', 1);
    }

    const appointment = await this.prisma.appointment.findUnique({
      where: {
        tenantId_crmProvider_crmExternalId: {
          tenantId: tenant.tenantId,
          crmProvider: boundSource.provider,
          crmExternalId: providerRecordId,
        },
      },
      select: { id: true, mayaClientId: true, serviceIds: true },
    });
    const appointmentServiceIds = this.stringArray(appointment?.serviceIds);
    if (
      !appointment ||
      appointment.mayaClientId !== clientLink.client.id ||
      !appointmentServiceIds?.includes(providerServiceId)
    ) {
      return this.noPlan('evidence_unresolved', 1);
    }

    const serverDerivedPoints = policy.servicePoints.get(providerServiceId);
    if (!serverDerivedPoints) return this.noPlan('policy_unresolved', 1);

    const divergenceCodes = this.divergences({
      canonicalBalancePoints: account.balance,
      serverDerivedPoints,
      legacyClaimedPoints: dto.legacy_claimed_points,
      perActionCapPoints: policy.perActionCapPoints,
    });
    const eligible =
      account.balance >= serverDerivedPoints &&
      serverDerivedPoints <= policy.perActionCapPoints;
    const intendedDeltaPoints = eligible ? -serverDerivedPoints : 0;
    const resultingBalancePoints = account.balance + intendedDeltaPoints;
    const providerRecordIdentityHash = this.hash([
      tenant.tenantId,
      boundSource.provider,
      providerRecordId,
    ]);
    const redemptionRequestIdentityHash = this.hash([
      tenant.tenantId,
      boundSource.provider,
      redemptionRequestId,
    ]);
    const logicalIdentityHash = this.hash([
      'p4-03.redeem-legacy-loyalty.v1',
      tenant.tenantId,
      clientLink.client.id,
      appointmentExecution.id,
      providerRecordIdentityHash,
      providerServiceId,
      redemptionRequestIdentityHash,
      LEGACY_LOYALTY_REDEMPTION_POLICY,
    ]);
    const input = {
      provider: boundSource.provider,
      canonicalClientId: clientLink.client.id,
      canonicalAppointmentId: appointment.id,
      appointmentActionExecutionId: appointmentExecution.id,
      providerRecordIdentityHash,
      providerServiceId,
      redemptionRequestIdentityHash,
      canonicalBalancePoints: account.balance,
      serverDerivedPoints,
      legacyClaimedPoints: dto.legacy_claimed_points,
      intendedDeltaPoints,
      resultingBalancePoints,
      eligibilityDecision: eligible ? 'redeem' : 'do_not_redeem',
      redemptionPolicy: LEGACY_LOYALTY_REDEMPTION_POLICY,
      perActionCapPoints: policy.perActionCapPoints,
      capDecision:
        serverDerivedPoints <= policy.perActionCapPoints
          ? 'within_cap'
          : 'exceeds_cap',
      appointmentEvidence: 'canonical_create_succeeded',
      providerProjectionDecision: 'deferred_attempt',
      divergenceCodes,
    };

    const execution = await this.tenantContext.runAsSystemTenant(
      tenant.tenantId,
      () =>
        this.actionEngine.planShadow({
          contract: ACTION_EXECUTION_REQUEST_CONTRACT,
          tenantId: tenant.tenantId,
          capability: LEGACY_LOYALTY_REDEEM_SHADOW_CAPABILITY,
          source: {
            type: 'legacy_bridge',
            occurrenceScope: `p4-03:redeem:${logicalIdentityHash}`,
            sourceRef: 'legacy-loyalty:booking-redemption',
          },
          targetRef: `appointment:${appointment.id}`,
          input,
          evidenceRefs: [
            `appointment-execution:${this.hash([
              tenant.tenantId,
              appointmentExecution.id,
            ])}`,
            `appointment:${this.hash([tenant.tenantId, appointment.id])}`,
            `loyalty-account:${this.hash([tenant.tenantId, account.id])}`,
          ],
          callerIdempotency: {
            scope: 'p4-03.redeem-legacy-loyalty.shadow',
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
            kind: 'redeem',
            deltaPoints: intendedDeltaPoints,
            balanceAfter: resultingBalancePoints,
            ledgerSemantics: 'reservation_finalize_release_under_one_execution',
            providerProjection: 'deferred_attempt',
          }
        : null,
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    };
  }

  private enabled(): boolean {
    return this.enabledValue(
      process.env.MAYA_LEGACY_LOYALTY_REDEEM_SHADOW_ENABLED,
    );
  }

  private policyConfig(): RedemptionPolicyConfig | null {
    const perActionCapPoints = this.positiveInteger(
      process.env.MAYA_LEGACY_LOYALTY_REDEEM_PER_ACTION_CAP_POINTS,
      5_000_000,
    );
    const raw = String(
      process.env.MAYA_LEGACY_LOYALTY_REDEEM_SERVICE_POINTS_JSON || '',
    ).trim();
    if (perActionCapPoints === null || !raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }
      const entries = Object.entries(parsed as Record<string, unknown>);
      if (entries.length === 0 || entries.length > 500) return null;
      const servicePoints = new Map<string, number>();
      for (const [serviceId, value] of entries) {
        if (
          !/^[A-Za-z0-9._:-]{1,128}$/.test(serviceId) ||
          !Number.isInteger(value) ||
          Number(value) < 1 ||
          Number(value) > 5_000_000
        ) {
          return null;
        }
        servicePoints.set(serviceId, Number(value));
      }
      return { perActionCapPoints, servicePoints };
    } catch {
      return null;
    }
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

  private enabledValue(value: string | undefined): boolean {
    return new Set(['1', 'true', 'on', 'yes']).has(
      String(value || '')
        .trim()
        .toLowerCase(),
    );
  }

  private record(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    return value as Record<string, unknown>;
  }

  private string(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private stringArray(value: unknown): string[] | null {
    if (
      !Array.isArray(value) ||
      value.some((item) => typeof item !== 'string' || !item.trim())
    ) {
      return null;
    }
    return [...new Set(value.map((item) => String(item).trim()))].sort();
  }

  private divergences(input: {
    canonicalBalancePoints: number;
    serverDerivedPoints: number;
    legacyClaimedPoints: number;
    perActionCapPoints: number;
  }): string[] {
    const values: string[] = [];
    if (input.serverDerivedPoints !== input.legacyClaimedPoints) {
      values.push('legacy_points_mismatch');
    }
    if (input.canonicalBalancePoints < input.serverDerivedPoints) {
      values.push('insufficient_canonical_balance');
    }
    if (input.serverDerivedPoints > input.perActionCapPoints) {
      values.push('per_action_cap_exceeded');
    }
    return values.sort();
  }

  private hash(parts: readonly string[]): string {
    return createHash('sha256').update(parts.join('\u001f')).digest('hex');
  }

  private noPlan(
    outcome: NoPlanOutcome,
    shadowDivergences: number,
  ): LegacyLoyaltyRedeemShadowResult {
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
