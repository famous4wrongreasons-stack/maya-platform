import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  LEGACY_LOYALTY_EXPIRY_POLICY,
  LEGACY_LOYALTY_EXPIRY_WINDOW_DAYS,
  LEGACY_LOYALTY_EXPIRE_SHADOW_CAPABILITY,
} from '../action-engine';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { LegacyLoyaltyExpireShadowDto } from './dto/legacy-loyalty-expire-shadow.dto';

type NoPlanOutcome =
  | 'shadow_disabled'
  | 'identity_unresolved'
  | 'policy_unresolved'
  | 'evidence_unresolved';

export interface LegacyLoyaltyExpireShadowResult {
  outcome: 'planned' | NoPlanOutcome;
  actionExecutionId: string | null;
  shadowDivergences: number;
  intendedMutation: {
    model: 'LoyaltyTransaction';
    kind: 'expire';
    deltaPoints: number;
    balanceAfter: 0;
    evaluationWindowStart: string;
    evaluationWindowEnd: string;
  } | null;
  newPathValueMutations: 0;
  newPathProviderWrites: 0;
}

interface ExpiryPolicyConfig {
  effectiveOn: string;
  perClientCapPoints: number;
  perRunCapPoints: number;
}

@Injectable()
export class LegacyLoyaltyExpiryShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly bridgeSource: BridgeSourceService,
    private readonly tenantContext: TenantContextService,
  ) {}

  assertSecret(header: string | undefined): void {
    this.bridgeSource.assertBridgeSecret(header, 'MAYA_INBOX_BRIDGE_TOKEN', {
      disabled: 'legacy_loyalty_expiry_shadow_bridge_disabled',
      unauthorized: 'legacy_loyalty_expiry_shadow_bridge_unauthorized',
    });
  }

  async planExpiry(
    dto: LegacyLoyaltyExpireShadowDto,
  ): Promise<LegacyLoyaltyExpireShadowResult> {
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
        disabled: 'legacy_loyalty_expiry_shadow_source_binding_disabled',
        mismatch: 'legacy_loyalty_expiry_shadow_source_binding_mismatch',
      },
    );
    const tenant = await this.bridgeSource.resolveTenantByIntegration(
      boundSource,
      'legacy_loyalty_expiry_shadow_tenant_not_found',
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
    if (!account) return this.noPlan('identity_unresolved', 1);
    if (account.balance < 0 || account.balance > 5_000_000) {
      return this.noPlan('evidence_unresolved', 1);
    }

    const evaluatedAt = new Date();
    const evaluationWindowEnd = this.isoDate(evaluatedAt);
    const windowStartAt = new Date(evaluatedAt);
    windowStartAt.setUTCDate(
      windowStartAt.getUTCDate() - LEGACY_LOYALTY_EXPIRY_WINDOW_DAYS,
    );
    const evaluationWindowStart = this.isoDate(windowStartAt);
    const coverage = await this.prisma.reconciliationRun.findFirst({
      where: {
        tenantId: tenant.tenantId,
        completeness: 'complete',
        failureCode: null,
        finishedAt: { not: null },
        windowFrom: { lte: windowStartAt },
        windowTo: { gte: evaluatedAt },
      },
      orderBy: { finishedAt: 'desc' },
      select: { id: true, finishedAt: true },
    });
    if (!coverage?.finishedAt) {
      return this.noPlan('evidence_unresolved', 1);
    }

    const recentAttendance = await this.prisma.appointment.findFirst({
      where: {
        tenantId: tenant.tenantId,
        mayaClientId: clientLink.client.id,
        attendance: 'arrived',
        startAt: { gte: windowStartAt, lte: evaluatedAt },
      },
      orderBy: { startAt: 'desc' },
      select: { startAt: true },
    });
    const canonicalRecentAttendedOn = recentAttendance
      ? this.isoDate(recentAttendance.startAt)
      : null;
    const divergenceCodes = this.divergences({
      evaluationWindowStart,
      evaluationWindowEnd,
      policyEffectiveOn: policy.effectiveOn,
      canonicalBalancePoints: account.balance,
      legacyClaimedBalancePoints: dto.legacy_claimed_balance_points,
      canonicalRecentAttendedOn,
      perClientCapPoints: policy.perClientCapPoints,
    });
    const eligible =
      account.balance > 0 &&
      divergenceCodes.every((code) => code === 'legacy_balance_mismatch');
    const intendedDeltaPoints = eligible ? -account.balance : 0;
    const logicalIdentityHash = this.hash([
      'p4-03.expire-legacy-loyalty.v1',
      tenant.tenantId,
      clientLink.client.id,
      LEGACY_LOYALTY_EXPIRY_POLICY,
      evaluationWindowStart,
      evaluationWindowEnd,
    ]);
    const input = {
      provider: boundSource.provider,
      canonicalClientId: clientLink.client.id,
      evaluationWindowStart,
      evaluationWindowEnd,
      policyEffectiveOn: policy.effectiveOn,
      canonicalBalancePoints: account.balance,
      legacyClaimedBalancePoints: dto.legacy_claimed_balance_points,
      canonicalRecentAttendedOn,
      intendedDeltaPoints,
      eligibilityDecision: eligible ? 'expire' : 'do_not_expire',
      expiryPolicy: LEGACY_LOYALTY_EXPIRY_POLICY,
      perClientCapPoints: policy.perClientCapPoints,
      perRunCapPoints: policy.perRunCapPoints,
      capDecision:
        account.balance <= policy.perClientCapPoints
          ? 'within_cap'
          : 'exceeds_cap',
      evidenceCoverage: 'complete',
      divergenceCodes,
    };

    const execution = await this.tenantContext.runAsSystemTenant(
      tenant.tenantId,
      () =>
        this.actionEngine.planShadow({
          contract: ACTION_EXECUTION_REQUEST_CONTRACT,
          tenantId: tenant.tenantId,
          capability: LEGACY_LOYALTY_EXPIRE_SHADOW_CAPABILITY,
          source: {
            type: 'legacy_bridge',
            occurrenceScope: `p4-03:expire:${logicalIdentityHash}`,
            sourceRef: 'legacy-loyalty:daily-expiry-job',
          },
          targetRef: `client:${clientLink.client.id}`,
          input,
          evidenceRefs: [
            `mirror-coverage:${this.hash([tenant.tenantId, coverage.id])}`,
            `loyalty-account:${this.hash([tenant.tenantId, account.id])}`,
          ],
          callerIdempotency: {
            scope: 'p4-03.expire-legacy-loyalty.shadow',
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
            kind: 'expire',
            deltaPoints: intendedDeltaPoints,
            balanceAfter: 0,
            evaluationWindowStart,
            evaluationWindowEnd,
          }
        : null,
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    };
  }

  private enabled(): boolean {
    return this.enabledValue(
      process.env.MAYA_LEGACY_LOYALTY_EXPIRE_SHADOW_ENABLED,
    );
  }

  private policyConfig(): ExpiryPolicyConfig | null {
    const effectiveOn = String(
      process.env.MAYA_LEGACY_LOYALTY_EXPIRY_POLICY_EFFECTIVE_ON || '',
    ).trim();
    const perClientCapPoints = this.positiveInteger(
      process.env.MAYA_LEGACY_LOYALTY_EXPIRY_PER_CLIENT_CAP_POINTS,
      5_000_000,
    );
    const perRunCapPoints = this.positiveInteger(
      process.env.MAYA_LEGACY_LOYALTY_EXPIRY_PER_RUN_CAP_POINTS,
      100_000_000,
    );
    if (
      !this.validIsoDate(effectiveOn) ||
      perClientCapPoints === null ||
      perRunCapPoints === null
    ) {
      return null;
    }
    return { effectiveOn, perClientCapPoints, perRunCapPoints };
  }

  private positiveInteger(
    value: string | undefined,
    max: number,
  ): number | null {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 && parsed <= max
      ? parsed
      : null;
  }

  private divergences(input: {
    evaluationWindowStart: string;
    evaluationWindowEnd: string;
    policyEffectiveOn: string;
    canonicalBalancePoints: number;
    legacyClaimedBalancePoints: number;
    canonicalRecentAttendedOn: string | null;
    perClientCapPoints: number;
  }): string[] {
    const codes: string[] = [];
    if (input.canonicalBalancePoints !== input.legacyClaimedBalancePoints) {
      codes.push('legacy_balance_mismatch');
    }
    if (input.policyEffectiveOn > input.evaluationWindowStart) {
      codes.push('policy_grace_active');
    }
    if (
      input.canonicalRecentAttendedOn !== null &&
      input.canonicalRecentAttendedOn >= input.evaluationWindowStart &&
      input.canonicalRecentAttendedOn <= input.evaluationWindowEnd
    ) {
      codes.push('canonical_recent_attendance');
    }
    if (input.canonicalBalancePoints > input.perClientCapPoints) {
      codes.push('per_client_cap_exceeded');
    }
    return codes.sort();
  }

  private enabledValue(value: string | undefined): boolean {
    return ['1', 'true', 'on', 'yes'].includes(
      String(value || '')
        .trim()
        .toLowerCase(),
    );
  }

  private isoDate(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private validIsoDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }

  private hash(parts: readonly string[]): string {
    return createHash('sha256')
      .update(JSON.stringify(parts))
      .digest('base64url');
  }

  private noPlan(
    outcome: NoPlanOutcome,
    shadowDivergences: number,
  ): LegacyLoyaltyExpireShadowResult {
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
