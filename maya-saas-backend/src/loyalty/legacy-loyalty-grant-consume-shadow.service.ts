import { createHash, createHmac } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  LEGACY_LOYALTY_GRANT_CONSUME_POLICY,
  LEGACY_LOYALTY_GRANT_CONSUME_SHADOW_CAPABILITY,
  LOYALTY_REDEMPTION_CODE_HASH_CONTRACT,
} from '../action-engine';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { LegacyLoyaltyGrantConsumeShadowDto } from './dto/legacy-loyalty-grant-consume-shadow.dto';

type NoPlanOutcome =
  | 'shadow_disabled'
  | 'identity_unresolved'
  | 'policy_unresolved'
  | 'evidence_unresolved';

const ADMINISTRATIVE_ROLES = new Set([
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
]);
const CASHIER_ELIGIBLE_ROLES = new Set([
  'manager',
  'branch_manager',
  'provider',
  'employee',
  'staff',
]);
const OPAQUE_REF_PATTERN = /^[A-Za-z0-9._:/-]{1,240}$/;

export interface LegacyLoyaltyGrantConsumeShadowResult {
  outcome: 'planned' | NoPlanOutcome;
  actionExecutionId: string | null;
  shadowDivergences: number;
  intendedMutation: {
    redemptionModel: 'LoyaltyRedemption';
    ledgerModel: 'LoyaltyTransaction';
    grantId: string;
    serviceRef: string;
    points: number;
    balanceDeltaPoints: number;
    consumeExecutionBindingRequired: true;
    oneTimeClaimRequired: true;
    providerProjectionEvaluated: false;
    writesPerformed: false;
  } | null;
  newPathValueMutations: 0;
  newPathProviderWrites: 0;
}

@Injectable()
export class LegacyLoyaltyGrantConsumeShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly bridgeSource: BridgeSourceService,
    private readonly tenantContext: TenantContextService,
  ) {}

  assertSecret(header: string | undefined): void {
    this.bridgeSource.assertBridgeSecret(header, 'MAYA_INBOX_BRIDGE_TOKEN', {
      disabled: 'legacy_loyalty_grant_consume_shadow_bridge_disabled',
      unauthorized: 'legacy_loyalty_grant_consume_shadow_bridge_unauthorized',
    });
  }

  async planConsume(
    dto: LegacyLoyaltyGrantConsumeShadowDto,
  ): Promise<LegacyLoyaltyGrantConsumeShadowResult> {
    if (!this.enabled()) return this.noPlan('shadow_disabled', 0);
    const perRedemptionCapPoints = this.positiveInteger(
      process.env.MAYA_LEGACY_LOYALTY_GRANT_CONSUME_MAX_POINTS,
      5_000_000,
    );
    const cashierUserIds = this.cashierUserIds(
      process.env.MAYA_LEGACY_LOYALTY_GRANT_CONSUME_CASHIER_USER_IDS,
    );
    const codePepper = String(
      process.env.MAYA_LOYALTY_REDEMPTION_CODE_PEPPER || '',
    ).trim();
    if (
      perRedemptionCapPoints === null ||
      cashierUserIds === null ||
      codePepper.length < 32 ||
      codePepper.length > 256
    ) {
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
        disabled: 'legacy_loyalty_grant_consume_shadow_source_binding_disabled',
        mismatch: 'legacy_loyalty_grant_consume_shadow_source_binding_mismatch',
      },
    );
    const tenant = await this.bridgeSource.resolveTenantByIntegration(
      boundSource,
      'legacy_loyalty_grant_consume_shadow_tenant_not_found',
    );

    const requesterProvider = dto.requester_identity_provider
      .trim()
      .toLowerCase();
    const externalRequesterId = dto.external_requester_id.trim();
    const normalizedCode = dto.redemption_code.trim().toUpperCase();
    if (
      requesterProvider !== 'telegram' ||
      !externalRequesterId ||
      !normalizedCode
    ) {
      return this.noPlan('identity_unresolved', 1);
    }

    const requester = await this.prisma.authIdentity.findUnique({
      where: {
        tenantId_provider_providerUserId: {
          tenantId: tenant.tenantId,
          provider: requesterProvider,
          providerUserId: externalRequesterId,
        },
      },
      select: {
        user: { select: { id: true, status: true } },
        membership: {
          select: { id: true, role: true, status: true, branchId: true },
        },
      },
    });
    if (
      !requester ||
      requester.user.status !== 'active' ||
      requester.membership.status !== 'active'
    ) {
      return this.noPlan('identity_unresolved', 1);
    }
    const requesterRole = String(requester.membership.role);
    const requesterAuthority = ADMINISTRATIVE_ROLES.has(requesterRole)
      ? 'administrative_role'
      : CASHIER_ELIGIBLE_ROLES.has(requesterRole) &&
          cashierUserIds.has(requester.user.id)
        ? 'server_cashier_allowlist'
        : null;
    if (!requesterAuthority) {
      return this.noPlan('policy_unresolved', 1);
    }

    const codeHash = createHmac('sha256', codePepper)
      .update(
        `${LOYALTY_REDEMPTION_CODE_HASH_CONTRACT}\u001f${normalizedCode}`,
        'utf8',
      )
      .digest('hex');
    const grant = await this.prisma.loyaltyRedemptionGrant.findUnique({
      where: {
        tenantId_codeHash: {
          tenantId: tenant.tenantId,
          codeHash,
        },
      },
      select: {
        id: true,
        tenantId: true,
        clientId: true,
        codeHash: true,
        serviceRef: true,
        points: true,
        issuedAt: true,
        expiresAt: true,
        issueExecutionId: true,
        issueExecution: {
          select: {
            id: true,
            tenantId: true,
            actionClass: true,
            state: true,
          },
        },
        client: {
          select: {
            id: true,
            userId: true,
            mergedIntoClientId: true,
            user: { select: { status: true } },
          },
        },
        redemption: {
          select: {
            id: true,
            grantId: true,
            actionExecutionId: true,
            redeemedAt: true,
            legacySourceRef: true,
            actionExecution: {
              select: {
                id: true,
                tenantId: true,
                actionClass: true,
                state: true,
              },
            },
          },
        },
      },
    });
    if (
      !grant ||
      grant.tenantId !== tenant.tenantId ||
      grant.client.id !== grant.clientId ||
      !grant.client.userId ||
      grant.client.mergedIntoClientId !== null ||
      grant.client.user?.status !== 'active' ||
      !grant.issueExecutionId ||
      !grant.issueExecution ||
      grant.issueExecution.id !== grant.issueExecutionId ||
      grant.issueExecution.tenantId !== tenant.tenantId ||
      grant.issueExecution.actionClass !== 'issue_loyalty_redemption_grant' ||
      grant.issueExecution.state !== 'SUCCEEDED' ||
      !grant.serviceRef.trim() ||
      !Number.isInteger(grant.points) ||
      grant.points < 1 ||
      grant.points > 5_000_000 ||
      !Number.isFinite(grant.issuedAt.getTime()) ||
      !Number.isFinite(grant.expiresAt.getTime()) ||
      grant.expiresAt.getTime() <= grant.issuedAt.getTime()
    ) {
      return this.noPlan('evidence_unresolved', 1);
    }

    const account = await this.prisma.loyaltyAccount.findUnique({
      where: {
        userId_tenantId: {
          userId: grant.client.userId,
          tenantId: tenant.tenantId,
        },
      },
      select: {
        id: true,
        balance: true,
        membership: { select: { status: true } },
      },
    });
    if (
      !account ||
      account.membership.status !== 'active' ||
      !Number.isInteger(account.balance) ||
      account.balance < 0 ||
      account.balance > 5_000_000
    ) {
      return this.noPlan('identity_unresolved', 1);
    }

    const logicalIdentityHash = this.hash([
      'p4-03.consume-loyalty-redemption-grant.identity.v1',
      tenant.tenantId,
      grant.id,
      LEGACY_LOYALTY_GRANT_CONSUME_POLICY,
    ]);
    if (
      grant.redemption &&
      (grant.redemption.grantId !== grant.id ||
        !grant.redemption.actionExecutionId ||
        !grant.redemption.actionExecution ||
        grant.redemption.actionExecution.id !==
          grant.redemption.actionExecutionId ||
        grant.redemption.actionExecution.tenantId !== tenant.tenantId ||
        grant.redemption.actionExecution.actionClass !==
          'consume_loyalty_redemption_grant' ||
        grant.redemption.actionExecution.state !== 'SUCCEEDED' ||
        grant.redemption.legacySourceRef !== logicalIdentityHash ||
        !Number.isFinite(grant.redemption.redeemedAt.getTime()))
    ) {
      return this.noPlan('evidence_unresolved', 1);
    }

    const now = new Date();
    const expiryDecision =
      grant.expiresAt.getTime() > now.getTime() ? 'unexpired' : 'expired';
    const existingRedemptionDecision = grant.redemption
      ? 'already_redeemed'
      : 'none';
    const eligible =
      expiryDecision === 'unexpired' &&
      account.balance >= grant.points &&
      grant.points <= perRedemptionCapPoints &&
      existingRedemptionDecision === 'none';
    const divergenceCodes = this.divergences({
      grantPoints: grant.points,
      legacyClaimedPoints: dto.legacy_claimed_points,
      availableBalancePoints: account.balance,
      legacyClaimedBalancePoints: dto.legacy_claimed_balance_points,
      perRedemptionCapPoints,
      expiryDecision,
      legacyClaimedExpiredDecision: dto.legacy_claimed_expired
        ? 'expired'
        : 'unexpired',
      existingRedemptionDecision,
      legacyClaimedUsedDecision: dto.legacy_claimed_used
        ? 'already_redeemed'
        : 'none',
    });
    const grantIdentityHash = this.hash([
      tenant.tenantId,
      grant.id,
      grant.clientId,
      grant.serviceRef,
      String(grant.points),
      grant.issuedAt.toISOString(),
      grant.expiresAt.toISOString(),
      grant.codeHash,
    ]);
    const issueExecutionIdentityHash = this.hash([
      tenant.tenantId,
      grant.issueExecutionId,
    ]);
    const requesterIdentityHash = this.hash([
      tenant.tenantId,
      requester.user.id,
      requester.membership.id,
      requesterRole,
    ]);
    const loyaltyAccountIdentityHash = this.hash([tenant.tenantId, account.id]);
    const serviceIdentityHash = this.hash([tenant.tenantId, grant.serviceRef]);
    const input = {
      provider: boundSource.provider,
      canonicalGrantId: grant.id,
      grantIdentityHash,
      issueExecutionIdentityHash,
      canonicalClientId: grant.clientId,
      requesterIdentityHash,
      requesterRole,
      requesterAuthority,
      loyaltyAccountIdentityHash,
      serviceRef: grant.serviceRef,
      serviceIdentityHash,
      grantPoints: grant.points,
      availableBalancePoints: account.balance,
      consumeDecision: eligible ? 'consume' : 'do_not_consume',
      consumePolicy: LEGACY_LOYALTY_GRANT_CONSUME_POLICY,
      codeHashContract: LOYALTY_REDEMPTION_CODE_HASH_CONTRACT,
      perRedemptionCapPoints,
      expiryDecision,
      balanceDecision:
        account.balance >= grant.points ? 'sufficient' : 'insufficient',
      capDecision:
        grant.points <= perRedemptionCapPoints ? 'within_cap' : 'exceeds_cap',
      existingRedemptionDecision,
      providerProjectionDecision: 'not_evaluated_in_shadow',
      authorizationEvidence: 'server_resolved_cashier_or_admin',
      legacyClaimedPoints: dto.legacy_claimed_points,
      legacyClaimedBalancePoints: dto.legacy_claimed_balance_points,
      legacyClaimedUsedDecision: dto.legacy_claimed_used
        ? 'already_redeemed'
        : 'none',
      legacyClaimedExpiredDecision: dto.legacy_claimed_expired
        ? 'expired'
        : 'unexpired',
      divergenceCodes,
    };

    const execution = await this.tenantContext.runAsSystemTenant(
      tenant.tenantId,
      () =>
        this.actionEngine.planShadow({
          contract: ACTION_EXECUTION_REQUEST_CONTRACT,
          tenantId: tenant.tenantId,
          capability: LEGACY_LOYALTY_GRANT_CONSUME_SHADOW_CAPABILITY,
          source: {
            type: 'legacy_bridge',
            occurrenceScope: `p4-03:grant-consume:${logicalIdentityHash}`,
            sourceRef: 'legacy-loyalty:redemption-grant-consume',
            actorUserId: requester.user.id,
          },
          targetRef: `loyalty-redemption-grant:${grantIdentityHash}`,
          input,
          evidenceRefs: [
            `grant:${grantIdentityHash}`,
            `issue-execution:${issueExecutionIdentityHash}`,
            `loyalty-account:${loyaltyAccountIdentityHash}`,
            `requester:${requesterIdentityHash}`,
          ],
          callerIdempotency: {
            scope: 'p4-03.consume-loyalty-redemption-grant.shadow',
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
            redemptionModel: 'LoyaltyRedemption',
            ledgerModel: 'LoyaltyTransaction',
            grantId: grant.id,
            serviceRef: grant.serviceRef,
            points: grant.points,
            balanceDeltaPoints: -grant.points,
            consumeExecutionBindingRequired: true,
            oneTimeClaimRequired: true,
            providerProjectionEvaluated: false,
            writesPerformed: false,
          }
        : null,
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    };
  }

  private enabled(): boolean {
    return new Set(['1', 'true', 'on', 'yes']).has(
      String(process.env.MAYA_LEGACY_LOYALTY_GRANT_CONSUME_SHADOW_ENABLED || '')
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

  private cashierUserIds(value: string | undefined): Set<string> | null {
    const values = String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (
      values.length > 64 ||
      values.some((item) => !OPAQUE_REF_PATTERN.test(item))
    ) {
      return null;
    }
    return new Set(values);
  }

  private divergences(input: {
    grantPoints: number;
    legacyClaimedPoints: number;
    availableBalancePoints: number;
    legacyClaimedBalancePoints: number;
    perRedemptionCapPoints: number;
    expiryDecision: 'unexpired' | 'expired';
    legacyClaimedExpiredDecision: 'unexpired' | 'expired';
    existingRedemptionDecision: 'none' | 'already_redeemed';
    legacyClaimedUsedDecision: 'none' | 'already_redeemed';
  }): string[] {
    const values: string[] = [];
    if (input.grantPoints !== input.legacyClaimedPoints) {
      values.push('legacy_points_mismatch');
    }
    if (input.availableBalancePoints !== input.legacyClaimedBalancePoints) {
      values.push('legacy_balance_mismatch');
    }
    if (input.grantPoints > input.perRedemptionCapPoints) {
      values.push('per_redemption_cap_exceeded');
    }
    if (input.availableBalancePoints < input.grantPoints) {
      values.push('insufficient_canonical_balance');
    }
    if (input.expiryDecision === 'expired') {
      values.push('canonical_grant_expired');
    }
    if (input.expiryDecision !== input.legacyClaimedExpiredDecision) {
      values.push('legacy_expiry_mismatch');
    }
    if (input.existingRedemptionDecision === 'already_redeemed') {
      values.push('canonical_grant_already_redeemed');
    }
    if (input.existingRedemptionDecision !== input.legacyClaimedUsedDecision) {
      values.push('legacy_used_state_mismatch');
    }
    return values.sort();
  }

  private hash(parts: readonly string[]): string {
    return createHash('sha256').update(parts.join('\u001f')).digest('hex');
  }

  private noPlan(
    outcome: NoPlanOutcome,
    shadowDivergences: number,
  ): LegacyLoyaltyGrantConsumeShadowResult {
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
