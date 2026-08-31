import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  REFERRAL_RESOLVE_SHADOW_CAPABILITY,
  REFERRAL_RESOLVE_SHADOW_POLICY_PROFILE,
} from '../action-engine';
import {
  CLIENT_IDENTITY_GUARD_UNAVAILABLE,
  CLIENT_IDENTITY_UNRESOLVED,
  ClientIdentityService,
} from '../crm/client-identity.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { ReferralResolveShadowDto } from './dto/referral-resolve-shadow.dto';

const PENDING_TTL_DAYS = 60;

export type ReferralResolutionTerminalOutcome =
  'qualified' | 'expired' | 'self_blocked';

export type ReferralResolveShadowOutcome =
  | 'planned'
  | 'shadow_disabled'
  | 'identity_unresolved'
  | 'identity_guard_unavailable'
  | 'referral_not_resolvable'
  | 'provider_evidence_unavailable'
  | 'not_eligible';

export interface ReferralResolveShadowResult {
  outcome: ReferralResolveShadowOutcome;
  actionExecutionId: string | null;
  shadowDivergences: number;
  intendedMutation: {
    model: 'CustomerReferral';
    referralId: string;
    status: ReferralResolutionTerminalOutcome;
    referredClientId: string;
    resolutionIdentityHash: string;
    relationshipIdentityHash: string;
    providerVisitIdentityHash: string | null;
    policyProfile: typeof REFERRAL_RESOLVE_SHADOW_POLICY_PROFILE;
    policySnapshotHash: string;
    evidenceDecision:
      | 'exact_attended_visit'
      | 'pending_ttl_elapsed'
      | 'canonical_self_referral';
    approvalRequirement: 'NONE';
  } | null;
  newPathReferralMutations: 0;
  newPathRewardValueMutations: 0;
  newPathProviderWrites: 0;
  newPathMessages: 0;
}

type ExactClientLink = {
  externalId: string;
  client: { id: string; mergedIntoClientId: string | null };
};

@Injectable()
export class ReferralResolveShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly bridgeSource: BridgeSourceService,
    private readonly tenantContext: TenantContextService,
    private readonly clientIdentity: ClientIdentityService,
  ) {}

  assertSecret(header: string | undefined): void {
    this.bridgeSource.assertBridgeSecret(header, 'MAYA_INBOX_BRIDGE_TOKEN', {
      disabled: 'referral_resolve_shadow_bridge_disabled',
      unauthorized: 'referral_resolve_shadow_bridge_unauthorized',
    });
  }

  async planResolution(
    dto: ReferralResolveShadowDto,
  ): Promise<ReferralResolveShadowResult> {
    if (!this.enabled()) return this.noPlan('shadow_disabled', 0);

    const boundSource = this.bridgeSource.assertBridgeIntegrationBinding(
      {
        provider: dto.provider,
        externalCompanyId: dto.external_company_id,
      },
      {
        provider: 'MAYA_REFERRAL_RESOLVE_SHADOW_SOURCE_PROVIDER',
        externalCompanyId: 'MAYA_REFERRAL_RESOLVE_SHADOW_SOURCE_COMPANY_ID',
      },
      {
        disabled: 'referral_resolve_shadow_source_binding_disabled',
        mismatch: 'referral_resolve_shadow_source_binding_mismatch',
      },
    );
    const tenant = await this.bridgeSource.resolveTenantByIntegration(
      boundSource,
      'referral_resolve_shadow_tenant_not_found',
    );
    const referrerExternalId = dto.referrer_external_client_id.trim();
    const referredExternalId = dto.referred_external_client_id.trim();
    if (!referrerExternalId || !referredExternalId) {
      return this.noPlan('identity_unresolved', 1);
    }

    return this.tenantContext.runAsSystemTenant(tenant.tenantId, () =>
      this.planInsideTenant({
        tenantId: tenant.tenantId,
        provider: boundSource.provider,
        referrerExternalId,
        referredExternalId,
        dto,
      }),
    );
  }

  private async planInsideTenant(input: {
    tenantId: string;
    provider: string;
    referrerExternalId: string;
    referredExternalId: string;
    dto: ReferralResolveShadowDto;
  }): Promise<ReferralResolveShadowResult> {
    for (const externalId of [
      input.referrerExternalId,
      input.referredExternalId,
    ]) {
      const guard = await this.clientIdentity.checkCrmClientRegistrationGuard({
        tenantId: input.tenantId,
        provider: input.provider,
        externalId,
      });
      if (!guard.allowed) {
        return this.noPlan(
          guard.reasonCode === CLIENT_IDENTITY_UNRESOLVED
            ? 'identity_unresolved'
            : guard.reasonCode === CLIENT_IDENTITY_GUARD_UNAVAILABLE
              ? 'identity_guard_unavailable'
              : 'identity_unresolved',
          1,
        );
      }
    }

    const links = (await this.prisma.crmClientLink.findMany({
      where: {
        tenantId: input.tenantId,
        provider: input.provider,
        externalId: {
          in: [input.referrerExternalId, input.referredExternalId],
        },
        unlinkedAt: null,
      },
      select: {
        externalId: true,
        client: { select: { id: true, mergedIntoClientId: true } },
      },
    })) as ExactClientLink[];
    const referrer = links.find(
      (link) => link.externalId === input.referrerExternalId,
    );
    const referred = links.find(
      (link) => link.externalId === input.referredExternalId,
    );
    if (
      links.length !== 2 ||
      !referrer ||
      !referred ||
      referrer.client.mergedIntoClientId !== null ||
      referred.client.mergedIntoClientId !== null
    ) {
      return this.noPlan('identity_unresolved', 1);
    }

    const relationshipIdentityHash = this.hash([
      'p4-04.create-customer-referral.v1',
      input.tenantId,
      referrer.client.id,
      this.hash([
        'p4-04.referred-subject.v1',
        input.tenantId,
        referred.client.id,
      ]),
    ]);
    const referral = await this.prisma.customerReferral.findUnique({
      where: {
        tenantId_identityHash: {
          tenantId: input.tenantId,
          identityHash: relationshipIdentityHash,
        },
      },
      select: {
        id: true,
        status: true,
        referrerClientId: true,
        referredClientId: true,
        identityHash: true,
        joinedAt: true,
      },
    });
    if (
      !referral ||
      referral.status !== 'pending' ||
      referral.referrerClientId !== referrer.client.id ||
      (referral.referredClientId !== null &&
        referral.referredClientId !== referred.client.id) ||
      referral.identityHash !== relationshipIdentityHash
    ) {
      return this.noPlan('referral_not_resolvable', 1);
    }

    const program = await this.prisma.referralProgram.findUnique({
      where: { tenantId: input.tenantId },
      select: { id: true, enabled: true, updatedAt: true },
    });
    if (!program?.enabled) return this.noPlan('not_eligible', 1);

    const evaluationWindow = input.dto.evaluation_date;
    const currentWindow = new Date().toISOString().slice(0, 10);
    if (evaluationWindow !== currentWindow) {
      return this.noPlan('provider_evidence_unavailable', 1);
    }
    if (input.dto.provider_read_status === 'failed') {
      return this.noPlan('provider_evidence_unavailable', 1);
    }

    const evaluationStart = new Date(`${evaluationWindow}T00:00:00.000Z`);
    const ageMs = evaluationStart.getTime() - referral.joinedAt.getTime();
    const ttlElapsed = ageMs > PENDING_TTL_DAYS * 24 * 60 * 60 * 1000;
    const isSelfReferral = referrer.client.id === referred.client.id;
    const exactVisit = this.exactVisitEvidence(input.dto, referral.joinedAt);

    let terminalOutcome: ReferralResolutionTerminalOutcome;
    let evidenceDecision:
      | 'exact_attended_visit'
      | 'pending_ttl_elapsed'
      | 'canonical_self_referral';
    let providerVisitIdentityHash: string | null = null;
    if (isSelfReferral) {
      terminalOutcome = 'self_blocked';
      evidenceDecision = 'canonical_self_referral';
    } else if (ttlElapsed) {
      terminalOutcome = 'expired';
      evidenceDecision = 'pending_ttl_elapsed';
    } else if (exactVisit) {
      terminalOutcome = 'qualified';
      evidenceDecision = 'exact_attended_visit';
      providerVisitIdentityHash = this.hash([
        'p4-04.provider-visit.v1',
        input.tenantId,
        input.provider,
        input.referredExternalId,
        input.dto.visit_record_id!,
        input.dto.visit_occurred_on!,
      ]);
    } else {
      return this.noPlan('provider_evidence_unavailable', 0);
    }

    const policySnapshotHash = this.hash([
      REFERRAL_RESOLVE_SHADOW_POLICY_PROFILE,
      input.tenantId,
      program.id,
      String(program.enabled),
      String(PENDING_TTL_DAYS),
      program.updatedAt.toISOString(),
    ]);
    const resolutionIdentityHash = this.hash([
      'p4-04.resolve-customer-referral.v1',
      input.tenantId,
      referral.id,
      REFERRAL_RESOLVE_SHADOW_POLICY_PROFILE,
      evaluationWindow,
    ]);
    const referrerProviderIdentityHash = this.hash([
      'p4-04.provider-client.v1',
      input.tenantId,
      input.provider,
      input.referrerExternalId,
      referrer.client.id,
    ]);
    const referredProviderIdentityHash = this.hash([
      'p4-04.provider-client.v1',
      input.tenantId,
      input.provider,
      input.referredExternalId,
      referred.client.id,
    ]);
    const legacyClaimedOutcome = input.dto.legacy_claimed_outcome ?? 'pending';
    const shadowDivergence = legacyClaimedOutcome !== terminalOutcome;
    const canonicalInput = {
      provider: input.provider,
      customerReferralId: referral.id,
      canonicalReferrerClientId: referrer.client.id,
      canonicalReferredClientId: referred.client.id,
      referrerProviderIdentityHash,
      referredProviderIdentityHash,
      relationshipIdentityHash,
      resolutionIdentityHash,
      terminalOutcome,
      joinedAt: referral.joinedAt.toISOString(),
      evaluationWindow,
      providerVisitIdentityHash,
      evidenceDecision,
      policyProfile: REFERRAL_RESOLVE_SHADOW_POLICY_PROFILE,
      policySnapshotHash,
      eligibilityDecision: isSelfReferral
        ? 'ineligible_self_referral'
        : 'eligible_for_resolution',
      legacyClaimedOutcome,
      shadowDivergence,
    };

    const evidenceRefs = [
      `provider-client:${referrerProviderIdentityHash}`,
      `provider-client:${referredProviderIdentityHash}`,
      `referral:${referral.id}`,
    ];
    if (providerVisitIdentityHash) {
      evidenceRefs.push(`provider-visit:${providerVisitIdentityHash}`);
    }
    const execution = await this.actionEngine.planShadow({
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: input.tenantId,
      capability: REFERRAL_RESOLVE_SHADOW_CAPABILITY,
      source: {
        type: 'legacy_bridge',
        occurrenceScope: `p4-04:resolve-referral:${resolutionIdentityHash}`,
        sourceRef: 'legacy-referral:resolve-customer-referral',
      },
      targetRef: `referral:${referral.id}`,
      input: canonicalInput,
      evidenceRefs,
      callerIdempotency: {
        scope: 'p4-04.resolve-customer-referral.shadow',
        key: resolutionIdentityHash,
      },
    });

    return {
      outcome: 'planned',
      actionExecutionId: execution.id,
      shadowDivergences: shadowDivergence ? 1 : 0,
      intendedMutation: {
        model: 'CustomerReferral',
        referralId: referral.id,
        status: terminalOutcome,
        referredClientId: referred.client.id,
        resolutionIdentityHash,
        relationshipIdentityHash,
        providerVisitIdentityHash,
        policyProfile: REFERRAL_RESOLVE_SHADOW_POLICY_PROFILE,
        policySnapshotHash,
        evidenceDecision,
        approvalRequirement: 'NONE',
      },
      newPathReferralMutations: 0,
      newPathRewardValueMutations: 0,
      newPathProviderWrites: 0,
      newPathMessages: 0,
    };
  }

  private exactVisitEvidence(
    dto: ReferralResolveShadowDto,
    joinedAt: Date,
  ): boolean {
    if (
      dto.provider_read_status !== 'succeeded' ||
      !dto.visit_record_id?.trim() ||
      !dto.visit_occurred_on ||
      dto.visit_attendance !== 1
    ) {
      return false;
    }
    const visitDate = new Date(`${dto.visit_occurred_on}T00:00:00.000Z`);
    if (Number.isNaN(visitDate.getTime())) return false;
    const joinedDate = new Date(
      Date.UTC(
        joinedAt.getUTCFullYear(),
        joinedAt.getUTCMonth(),
        joinedAt.getUTCDate(),
      ),
    );
    return visitDate.getTime() >= joinedDate.getTime();
  }

  private enabled(): boolean {
    return ['1', 'true', 'on', 'yes'].includes(
      String(process.env.MAYA_REFERRAL_RESOLVE_SHADOW_ENABLED || '')
        .trim()
        .toLowerCase(),
    );
  }

  private hash(parts: readonly string[]): string {
    return createHash('sha256')
      .update(JSON.stringify(parts))
      .digest('base64url');
  }

  private noPlan(
    outcome: Exclude<ReferralResolveShadowOutcome, 'planned'>,
    shadowDivergences: number,
  ): ReferralResolveShadowResult {
    return {
      outcome,
      actionExecutionId: null,
      shadowDivergences,
      intendedMutation: null,
      newPathReferralMutations: 0,
      newPathRewardValueMutations: 0,
      newPathProviderWrites: 0,
      newPathMessages: 0,
    };
  }
}
