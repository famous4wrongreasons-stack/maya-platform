import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  LEGACY_LOYALTY_GRANT_CATALOG_POLICY,
  LEGACY_LOYALTY_GRANT_ISSUE_POLICY,
  LEGACY_LOYALTY_GRANT_ISSUE_SHADOW_CAPABILITY,
} from '../action-engine';
import { CrmService } from '../crm/crm.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { LegacyLoyaltyGrantIssueShadowDto } from './dto/legacy-loyalty-grant-issue-shadow.dto';

type NoPlanOutcome =
  | 'shadow_disabled'
  | 'identity_unresolved'
  | 'policy_unresolved'
  | 'evidence_unresolved';

export interface LegacyLoyaltyGrantIssueShadowResult {
  outcome: 'planned' | NoPlanOutcome;
  actionExecutionId: string | null;
  shadowDivergences: number;
  intendedMutation: {
    model: 'LoyaltyRedemptionGrant';
    serviceRef: string;
    points: number;
    ttlDays: number;
    issueExecutionBindingRequired: true;
    codeMaterialGenerated: false;
    balanceMutation: false;
  } | null;
  newPathValueMutations: 0;
  newPathProviderWrites: 0;
}

@Injectable()
export class LegacyLoyaltyGrantIssueShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly crm: CrmService,
    private readonly bridgeSource: BridgeSourceService,
    private readonly tenantContext: TenantContextService,
  ) {}

  assertSecret(header: string | undefined): void {
    this.bridgeSource.assertBridgeSecret(header, 'MAYA_INBOX_BRIDGE_TOKEN', {
      disabled: 'legacy_loyalty_grant_issue_shadow_bridge_disabled',
      unauthorized: 'legacy_loyalty_grant_issue_shadow_bridge_unauthorized',
    });
  }

  async planIssue(
    dto: LegacyLoyaltyGrantIssueShadowDto,
  ): Promise<LegacyLoyaltyGrantIssueShadowResult> {
    if (!this.enabled()) return this.noPlan('shadow_disabled', 0);
    const perGrantCapPoints = this.positiveInteger(
      process.env.MAYA_LEGACY_LOYALTY_GRANT_PER_GRANT_CAP_POINTS,
      5_000_000,
    );
    const ttlDays = this.positiveInteger(
      process.env.MAYA_LEGACY_LOYALTY_GRANT_TTL_DAYS,
      365,
    );
    const allowedServiceIds = this.allowedServiceIds(
      process.env.MAYA_LEGACY_LOYALTY_GRANT_ALLOWED_SERVICE_IDS,
    );
    if (
      perGrantCapPoints === null ||
      ttlDays === null ||
      allowedServiceIds === null
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
        disabled: 'legacy_loyalty_grant_issue_shadow_source_binding_disabled',
        mismatch: 'legacy_loyalty_grant_issue_shadow_source_binding_mismatch',
      },
    );
    const tenant = await this.bridgeSource.resolveTenantByIntegration(
      boundSource,
      'legacy_loyalty_grant_issue_shadow_tenant_not_found',
    );

    const externalClientId = dto.external_client_id.trim();
    const callerRequestId = dto.caller_request_id.trim();
    const requestedServiceId = dto.service_id.trim();
    if (!externalClientId || !callerRequestId || !requestedServiceId) {
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
        unlinkedAt: true,
        client: {
          select: {
            id: true,
            mergedIntoClientId: true,
          },
        },
      },
    });
    if (
      !clientLink ||
      clientLink.client.mergedIntoClientId !== null ||
      clientLink.unlinkedAt !== null
    ) {
      return this.noPlan('identity_unresolved', 1);
    }

    const account = await this.prisma.loyaltyAccount.findUnique({
      where: {
        tenantId_clientId: {
          tenantId: tenant.tenantId,
          clientId: clientLink.client.id,
        },
      },
      select: {
        id: true,
        balance: true,
      },
    });
    if (
      !account ||
      !Number.isInteger(account.balance) ||
      account.balance < 0 ||
      account.balance > 5_000_000
    ) {
      return this.noPlan('identity_unresolved', 1);
    }

    let catalog: Awaited<ReturnType<CrmService['getServices']>>;
    try {
      const result = await this.tenantContext.runAsSystemTenant(
        tenant.tenantId,
        async () => {
          const provider = await this.crm.getExternalProviderKey(
            tenant.tenantId,
          );
          if (provider !== boundSource.provider) return null;
          return this.crm.getServices(tenant.tenantId);
        },
      );
      if (!result) return this.noPlan('evidence_unresolved', 1);
      catalog = result;
    } catch {
      return this.noPlan('evidence_unresolved', 1);
    }
    const exactServices = catalog.filter(
      (service) => service.id === requestedServiceId,
    );
    const service = exactServices[0];
    if (
      exactServices.length !== 1 ||
      typeof service.name !== 'string' ||
      !service.name.trim() ||
      !Number.isFinite(service.price) ||
      service.price <= 0 ||
      service.price > 5_000_000 ||
      String(service.currency).toUpperCase() !== 'RUB'
    ) {
      return this.noPlan('evidence_unresolved', 1);
    }

    const servicePoints = Math.ceil(service.price);
    const serviceRef = `${boundSource.provider}:${service.id}`;
    const serviceIdentityHash = this.hash([
      tenant.tenantId,
      serviceRef,
      LEGACY_LOYALTY_GRANT_CATALOG_POLICY,
    ]);
    const serviceTitleIdentityHash = this.hash([
      this.normalizedTitle(service.name),
    ]);
    const legacyClaimedServiceTitleIdentityHash = this.hash([
      this.normalizedTitle(dto.legacy_claimed_service_title),
    ]);
    const requestIdentityHash = this.hash([
      'p4-03.issue-loyalty-redemption-grant.request.v1',
      tenant.tenantId,
      clientLink.client.id,
      callerRequestId,
    ]);
    const existingGrants = await this.prisma.loyaltyRedemptionGrant.findMany({
      where: {
        tenantId: tenant.tenantId,
        legacySourceRef: requestIdentityHash,
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        clientId: true,
        serviceRef: true,
        points: true,
        issueExecutionId: true,
        codeHash: true,
        expiresAt: true,
      },
    });
    if (
      existingGrants.length > 1 ||
      existingGrants.some(
        (grant) =>
          grant.clientId !== clientLink.client.id ||
          grant.serviceRef !== serviceRef ||
          grant.points !== servicePoints ||
          grant.issueExecutionId === null ||
          !grant.codeHash ||
          !Number.isFinite(grant.expiresAt.getTime()),
      )
    ) {
      return this.noPlan('evidence_unresolved', 1);
    }

    const existingGrantDecision =
      existingGrants.length === 1 ? 'already_issued' : 'none';
    const serviceEligibility = allowedServiceIds.has(service.id)
      ? 'allowed'
      : 'not_allowed';
    const eligible =
      serviceEligibility === 'allowed' &&
      account.balance >= servicePoints &&
      servicePoints <= perGrantCapPoints &&
      existingGrantDecision === 'none';
    const divergenceCodes = this.divergences({
      serviceTitleIdentityHash,
      legacyClaimedServiceTitleIdentityHash,
      servicePoints,
      legacyClaimedPoints: dto.legacy_claimed_points,
      availableBalancePoints: account.balance,
      perGrantCapPoints,
      serviceEligibility,
      existingGrantDecision,
    });
    const loyaltyAccountIdentityHash = this.hash([tenant.tenantId, account.id]);
    const input = {
      provider: boundSource.provider,
      canonicalClientId: clientLink.client.id,
      requestIdentityHash,
      loyaltyAccountIdentityHash,
      serviceRef,
      serviceIdentityHash,
      serviceTitleIdentityHash,
      legacyClaimedServiceTitleIdentityHash,
      servicePoints,
      legacyClaimedPoints: dto.legacy_claimed_points,
      availableBalancePoints: account.balance,
      grantDecision: eligible ? 'issue' : 'do_not_issue',
      grantPolicy: LEGACY_LOYALTY_GRANT_ISSUE_POLICY,
      catalogPolicyVersion: LEGACY_LOYALTY_GRANT_CATALOG_POLICY,
      ttlDays,
      perGrantCapPoints,
      serviceEligibility,
      balanceDecision:
        account.balance >= servicePoints ? 'sufficient' : 'insufficient',
      capDecision:
        servicePoints <= perGrantCapPoints ? 'within_cap' : 'exceeds_cap',
      existingGrantDecision,
      authorizationEvidence: 'trusted_shadow_candidate_only',
      divergenceCodes,
    };

    const execution = await this.tenantContext.runAsSystemTenant(
      tenant.tenantId,
      () =>
        this.actionEngine.planShadow({
          contract: ACTION_EXECUTION_REQUEST_CONTRACT,
          tenantId: tenant.tenantId,
          capability: LEGACY_LOYALTY_GRANT_ISSUE_SHADOW_CAPABILITY,
          source: {
            type: 'legacy_bridge',
            occurrenceScope: `p4-03:grant-issue:${requestIdentityHash}`,
            sourceRef: 'legacy-loyalty:redemption-grant-issue',
          },
          targetRef: `grant-request:${requestIdentityHash}`,
          input,
          evidenceRefs: [
            `service:${serviceIdentityHash}`,
            `loyalty-account:${loyaltyAccountIdentityHash}`,
            `client:${this.hash([tenant.tenantId, clientLink.client.id])}`,
          ],
          callerIdempotency: {
            scope: 'p4-03.issue-loyalty-redemption-grant.shadow',
            key: requestIdentityHash,
          },
        }),
    );

    return {
      outcome: 'planned',
      actionExecutionId: execution.id,
      shadowDivergences: divergenceCodes.length,
      intendedMutation: eligible
        ? {
            model: 'LoyaltyRedemptionGrant',
            serviceRef,
            points: servicePoints,
            ttlDays,
            issueExecutionBindingRequired: true,
            codeMaterialGenerated: false,
            balanceMutation: false,
          }
        : null,
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    };
  }

  private enabled(): boolean {
    return new Set(['1', 'true', 'on', 'yes']).has(
      String(process.env.MAYA_LEGACY_LOYALTY_GRANT_ISSUE_SHADOW_ENABLED || '')
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

  private allowedServiceIds(value: string | undefined): Set<string> | null {
    const values = String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (values.length === 0 || values.length > 64) return null;
    return new Set(values);
  }

  private normalizedTitle(value: string): string {
    return value.trim().toLowerCase().replaceAll('ё', 'е').replace(/\s+/g, ' ');
  }

  private divergences(input: {
    serviceTitleIdentityHash: string;
    legacyClaimedServiceTitleIdentityHash: string;
    servicePoints: number;
    legacyClaimedPoints: number;
    availableBalancePoints: number;
    perGrantCapPoints: number;
    serviceEligibility: 'allowed' | 'not_allowed';
    existingGrantDecision: 'none' | 'already_issued';
  }): string[] {
    const values: string[] = [];
    if (
      input.serviceTitleIdentityHash !==
      input.legacyClaimedServiceTitleIdentityHash
    ) {
      values.push('legacy_service_title_mismatch');
    }
    if (input.servicePoints !== input.legacyClaimedPoints) {
      values.push('legacy_points_mismatch');
    }
    if (input.availableBalancePoints < input.servicePoints) {
      values.push('insufficient_canonical_balance');
    }
    if (input.servicePoints > input.perGrantCapPoints) {
      values.push('per_grant_cap_exceeded');
    }
    if (input.serviceEligibility === 'not_allowed') {
      values.push('service_not_allowed');
    }
    if (input.existingGrantDecision === 'already_issued') {
      values.push('canonical_grant_already_exists');
    }
    return values.sort();
  }

  private hash(parts: readonly string[]): string {
    return createHash('sha256').update(parts.join('\u001f')).digest('hex');
  }

  private noPlan(
    outcome: NoPlanOutcome,
    shadowDivergences: number,
  ): LegacyLoyaltyGrantIssueShadowResult {
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
