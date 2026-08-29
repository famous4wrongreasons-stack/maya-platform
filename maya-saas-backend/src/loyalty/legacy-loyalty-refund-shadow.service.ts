import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  LEGACY_LOYALTY_REFUND_POLICY,
  LEGACY_LOYALTY_REFUND_SHADOW_CAPABILITY,
} from '../action-engine';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { LegacyLoyaltyRefundShadowDto } from './dto/legacy-loyalty-refund-shadow.dto';

type NoPlanOutcome =
  | 'shadow_disabled'
  | 'identity_unresolved'
  | 'policy_unresolved'
  | 'evidence_unresolved';

export interface LegacyLoyaltyRefundShadowResult {
  outcome: 'planned' | NoPlanOutcome;
  actionExecutionId: string | null;
  shadowDivergences: number;
  intendedMutation: {
    model: 'LoyaltyTransaction';
    kind: 'refund';
    deltaPoints: number;
    originalRedemptionActionExecutionId: string;
    atomicBalanceUpdateRequired: true;
  } | null;
  newPathValueMutations: 0;
  newPathProviderWrites: 0;
}

@Injectable()
export class LegacyLoyaltyRefundShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly bridgeSource: BridgeSourceService,
    private readonly tenantContext: TenantContextService,
  ) {}

  assertSecret(header: string | undefined): void {
    this.bridgeSource.assertBridgeSecret(header, 'MAYA_INBOX_BRIDGE_TOKEN', {
      disabled: 'legacy_loyalty_refund_shadow_bridge_disabled',
      unauthorized: 'legacy_loyalty_refund_shadow_bridge_unauthorized',
    });
  }

  async planRefund(
    dto: LegacyLoyaltyRefundShadowDto,
  ): Promise<LegacyLoyaltyRefundShadowResult> {
    if (!this.enabled()) return this.noPlan('shadow_disabled', 0);
    const perActionCapPoints = this.positiveInteger(
      process.env.MAYA_LEGACY_LOYALTY_REFUND_PER_ACTION_CAP_POINTS,
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
        disabled: 'legacy_loyalty_refund_shadow_source_binding_disabled',
        mismatch: 'legacy_loyalty_refund_shadow_source_binding_mismatch',
      },
    );
    const tenant = await this.bridgeSource.resolveTenantByIntegration(
      boundSource,
      'legacy_loyalty_refund_shadow_tenant_not_found',
    );

    const externalClientId = dto.external_client_id.trim();
    const providerRecordId = dto.provider_record_id.trim();
    const originalRedemptionExecutionId =
      dto.original_redemption_execution_id.trim();
    const cancellationEvidenceId = dto.cancellation_evidence_id.trim();
    if (
      !externalClientId ||
      !providerRecordId ||
      !originalRedemptionExecutionId ||
      !cancellationEvidenceId
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

    const appointment = await this.prisma.appointment.findUnique({
      where: {
        tenantId_crmProvider_crmExternalId: {
          tenantId: tenant.tenantId,
          crmProvider: boundSource.provider,
          crmExternalId: providerRecordId,
        },
      },
      select: { id: true, mayaClientId: true },
    });
    if (!appointment || appointment.mayaClientId !== clientLink.client.id) {
      return this.noPlan('evidence_unresolved', 1);
    }

    const originalExecution = await this.prisma.actionExecution.findFirst({
      where: {
        id: originalRedemptionExecutionId,
        tenantId: tenant.tenantId,
        actionClass: 'redeem_legacy_loyalty',
        state: { in: ['SUCCEEDED', 'UNKNOWN'] },
      },
      select: { id: true },
    });
    if (!originalExecution) return this.noPlan('evidence_unresolved', 1);

    const providerRecordIdentityHash = this.hash([
      tenant.tenantId,
      boundSource.provider,
      providerRecordId,
    ]);
    const originalDebitRows = await this.prisma.loyaltyTransaction.findMany({
      where: {
        tenantId: tenant.tenantId,
        actionExecutionId: originalExecution.id,
        kind: 'redeem',
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        accountId: true,
        delta: true,
        externalRef: true,
      },
    });
    if (
      originalDebitRows.length === 0 ||
      originalDebitRows.length > 64 ||
      originalDebitRows.some(
        (row) =>
          row.accountId !== account.id ||
          row.delta >= 0 ||
          row.externalRef !== providerRecordIdentityHash,
      )
    ) {
      return this.noPlan('evidence_unresolved', 1);
    }
    const originalDebitPoints = originalDebitRows.reduce(
      (sum, row) => sum + Math.abs(row.delta),
      0,
    );
    if (originalDebitPoints < 1 || originalDebitPoints > 5_000_000) {
      return this.noPlan('evidence_unresolved', 1);
    }

    const cancellationProven = await this.cancellationProven({
      tenantId: tenant.tenantId,
      provider: boundSource.provider,
      appointmentId: appointment.id,
      providerRecordId,
      evidenceKind: dto.cancellation_evidence_kind,
      evidenceId: cancellationEvidenceId,
    });
    if (!cancellationProven) return this.noPlan('evidence_unresolved', 1);

    const cancellationFactHash = this.hash([
      tenant.tenantId,
      appointment.id,
      boundSource.provider,
      providerRecordId,
      'appointment.removed',
    ]);
    const refundCorrelationHash = this.hash([
      tenant.tenantId,
      originalExecution.id,
      cancellationFactHash,
      LEGACY_LOYALTY_REFUND_POLICY,
    ]);
    const existingRefund = await this.prisma.loyaltyTransaction.findFirst({
      where: {
        tenantId: tenant.tenantId,
        accountId: account.id,
        kind: 'refund',
        externalRef: refundCorrelationHash,
      },
      select: { id: true, actionExecutionId: true, delta: true },
    });
    if (
      existingRefund &&
      (existingRefund.actionExecutionId === null ||
        existingRefund.delta !== originalDebitPoints)
    ) {
      return this.noPlan('evidence_unresolved', 1);
    }
    const existingRefundDecision = existingRefund ? 'already_refunded' : 'none';
    const divergenceCodes = this.divergences({
      originalDebitPoints,
      legacyClaimedRefundPoints: dto.legacy_claimed_refund_points,
      perActionCapPoints,
      existingRefundDecision,
    });
    const eligible =
      originalDebitPoints <= perActionCapPoints && !existingRefund;
    const intendedDeltaPoints = eligible ? originalDebitPoints : 0;
    const logicalIdentityHash = this.hash([
      'p4-03.refund-legacy-loyalty.v1',
      tenant.tenantId,
      originalExecution.id,
      cancellationFactHash,
      LEGACY_LOYALTY_REFUND_POLICY,
    ]);
    const debitEvidenceHash = this.hash(
      originalDebitRows.map((row) => `${row.id}:${row.delta}`).sort(),
    );
    const input = {
      provider: boundSource.provider,
      canonicalClientId: clientLink.client.id,
      canonicalAppointmentId: appointment.id,
      originalRedemptionActionExecutionId: originalExecution.id,
      providerRecordIdentityHash,
      cancellationFactHash,
      originalDebitRowCount: originalDebitRows.length,
      originalDebitPoints,
      legacyClaimedRefundPoints: dto.legacy_claimed_refund_points,
      intendedDeltaPoints,
      refundDecision: eligible ? 'refund' : 'do_not_refund',
      refundPolicy: LEGACY_LOYALTY_REFUND_POLICY,
      perActionCapPoints,
      capDecision:
        originalDebitPoints <= perActionCapPoints
          ? 'within_cap'
          : 'exceeds_cap',
      existingRefundDecision,
      cancellationEvidence: 'proven_removed',
      divergenceCodes,
    };

    const execution = await this.tenantContext.runAsSystemTenant(
      tenant.tenantId,
      () =>
        this.actionEngine.planShadow({
          contract: ACTION_EXECUTION_REQUEST_CONTRACT,
          tenantId: tenant.tenantId,
          capability: LEGACY_LOYALTY_REFUND_SHADOW_CAPABILITY,
          source: {
            type: 'legacy_bridge',
            occurrenceScope: `p4-03:refund:${logicalIdentityHash}`,
            sourceRef: 'legacy-loyalty:booking-cancellation-refund',
          },
          targetRef: `redemption:${originalExecution.id}`,
          input,
          evidenceRefs: [
            `original-redemption-ledger:${debitEvidenceHash}`,
            `appointment-removal:${cancellationFactHash}`,
            `loyalty-account:${this.hash([tenant.tenantId, account.id])}`,
          ],
          callerIdempotency: {
            scope: 'p4-03.refund-legacy-loyalty.shadow',
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
            kind: 'refund',
            deltaPoints: intendedDeltaPoints,
            originalRedemptionActionExecutionId: originalExecution.id,
            atomicBalanceUpdateRequired: true,
          }
        : null,
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    };
  }

  private async cancellationProven(input: {
    tenantId: string;
    provider: string;
    appointmentId: string;
    providerRecordId: string;
    evidenceKind: 'action_execution' | 'domain_event';
    evidenceId: string;
  }): Promise<boolean> {
    if (input.evidenceKind === 'action_execution') {
      const cancellation = await this.prisma.actionExecution.findFirst({
        where: {
          id: input.evidenceId,
          tenantId: input.tenantId,
          actionClass: 'cancel_appointment',
          capability: 'crm.appointment.cancel.v1',
          state: 'SUCCEEDED',
        },
        select: { safeResultSummaryJson: true },
      });
      const safe = this.record(cancellation?.safeResultSummaryJson);
      return (
        this.string(safe?.externalId) === input.providerRecordId &&
        this.string(safe?.status)?.toLowerCase() === 'canceled'
      );
    }

    const event = await this.prisma.domainEvent.findFirst({
      where: {
        id: input.evidenceId,
        tenantId: input.tenantId,
        type: 'appointment.removed',
        entityType: 'appointment',
        entityId: input.appointmentId,
        source: input.provider,
        sourceRef: input.providerRecordId,
      },
      select: { id: true },
    });
    return Boolean(event);
  }

  private enabled(): boolean {
    return new Set(['1', 'true', 'on', 'yes']).has(
      String(process.env.MAYA_LEGACY_LOYALTY_REFUND_SHADOW_ENABLED || '')
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

  private record(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    return value as Record<string, unknown>;
  }

  private string(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private divergences(input: {
    originalDebitPoints: number;
    legacyClaimedRefundPoints: number;
    perActionCapPoints: number;
    existingRefundDecision: 'none' | 'already_refunded';
  }): string[] {
    const values: string[] = [];
    if (input.originalDebitPoints !== input.legacyClaimedRefundPoints) {
      values.push('legacy_refund_points_mismatch');
    }
    if (input.originalDebitPoints > input.perActionCapPoints) {
      values.push('per_action_cap_exceeded');
    }
    if (input.existingRefundDecision === 'already_refunded') {
      values.push('canonical_refund_already_exists');
    }
    return values.sort();
  }

  private hash(parts: readonly string[]): string {
    return createHash('sha256').update(parts.join('\u001f')).digest('hex');
  }

  private noPlan(
    outcome: NoPlanOutcome,
    shadowDivergences: number,
  ): LegacyLoyaltyRefundShadowResult {
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
