import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  REFERRAL_CREATE_SHADOW_CAPABILITY,
  REFERRAL_CREATE_SHADOW_POLICY_PROFILE,
} from '../action-engine';
import {
  CLIENT_IDENTITY_GUARD_UNAVAILABLE,
  CLIENT_IDENTITY_UNRESOLVED,
  ClientIdentityService,
} from '../crm/client-identity.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { ReferralCreateShadowDto } from './dto/referral-create-shadow.dto';

export type ReferralCreateShadowOutcome =
  | 'planned'
  | 'shadow_disabled'
  | 'identity_unresolved'
  | 'identity_guard_unavailable'
  | 'self_referral'
  | 'not_eligible';

export interface ReferralCreateShadowResult {
  outcome: ReferralCreateShadowOutcome;
  actionExecutionId: string | null;
  shadowDivergences: number;
  intendedMutation: {
    model: 'CustomerReferral';
    status: 'pending';
    referrerClientId: string;
    referredClientId: string;
    relationshipIdentityHash: string;
    referredSubjectHash: string;
    referralCodeBindingHash: string;
    policyProfile: typeof REFERRAL_CREATE_SHADOW_POLICY_PROFILE;
    policySnapshotHash: string;
    eligibility: 'eligible';
    approvalRequirement: 'NONE';
  } | null;
  newPathReferralRelationships: 0;
  newPathRewardValueMutations: 0;
  newPathProviderWrites: 0;
  newPathMessages: 0;
}

type ExactClientLink = {
  externalId: string;
  client: { id: string; mergedIntoClientId: string | null };
};

@Injectable()
export class ReferralCreateShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly bridgeSource: BridgeSourceService,
    private readonly tenantContext: TenantContextService,
    private readonly clientIdentity: ClientIdentityService,
  ) {}

  assertSecret(header: string | undefined): void {
    this.bridgeSource.assertBridgeSecret(header, 'MAYA_INBOX_BRIDGE_TOKEN', {
      disabled: 'referral_create_shadow_bridge_disabled',
      unauthorized: 'referral_create_shadow_bridge_unauthorized',
    });
  }

  async planCreate(
    dto: ReferralCreateShadowDto,
  ): Promise<ReferralCreateShadowResult> {
    if (!this.enabled()) return this.noPlan('shadow_disabled', 0);

    const boundSource = this.bridgeSource.assertBridgeIntegrationBinding(
      {
        provider: dto.provider,
        externalCompanyId: dto.external_company_id,
      },
      {
        provider: 'MAYA_REFERRAL_CREATE_SHADOW_SOURCE_PROVIDER',
        externalCompanyId: 'MAYA_REFERRAL_CREATE_SHADOW_SOURCE_COMPANY_ID',
      },
      {
        disabled: 'referral_create_shadow_source_binding_disabled',
        mismatch: 'referral_create_shadow_source_binding_mismatch',
      },
    );
    const tenant = await this.bridgeSource.resolveTenantByIntegration(
      boundSource,
      'referral_create_shadow_tenant_not_found',
    );

    const referrerExternalId = dto.referrer_external_client_id.trim();
    const referredExternalId = dto.referred_external_client_id.trim();
    if (!referrerExternalId || !referredExternalId) {
      return this.noPlan('identity_unresolved', 1);
    }
    if (referrerExternalId === referredExternalId) {
      return this.noPlan('self_referral', 1);
    }

    return this.tenantContext.runAsSystemTenant(tenant.tenantId, () =>
      this.planInsideTenant({
        tenantId: tenant.tenantId,
        provider: boundSource.provider,
        referrerExternalId,
        referredExternalId,
      }),
    );
  }

  private async planInsideTenant(input: {
    tenantId: string;
    provider: string;
    referrerExternalId: string;
    referredExternalId: string;
  }): Promise<ReferralCreateShadowResult> {
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
            : CLIENT_IDENTITY_GUARD_UNAVAILABLE === guard.reasonCode
              ? 'identity_guard_unavailable'
              : 'identity_unresolved',
          1,
        );
      }
    }

    const links = await this.prisma.crmClientLink.findMany({
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
    });
    const exactLinks = links as ExactClientLink[];
    const referrer = exactLinks.find(
      (link) => link.externalId === input.referrerExternalId,
    );
    const referred = exactLinks.find(
      (link) => link.externalId === input.referredExternalId,
    );
    if (
      exactLinks.length !== 2 ||
      !referrer ||
      !referred ||
      referrer.client.mergedIntoClientId !== null ||
      referred.client.mergedIntoClientId !== null
    ) {
      return this.noPlan('identity_unresolved', 1);
    }
    if (referrer.client.id === referred.client.id) {
      return this.noPlan('self_referral', 1);
    }

    const program = await this.prisma.referralProgram.findUnique({
      where: { tenantId: input.tenantId },
      select: {
        id: true,
        enabled: true,
        inviterRewardKopecks: true,
        inviteeRewardKopecks: true,
        currency: true,
        codePrefix: true,
        updatedAt: true,
      },
    });
    if (!program?.enabled) return this.noPlan('not_eligible', 1);

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
    const referredSubjectHash = this.hash([
      'p4-04.referred-subject.v1',
      input.tenantId,
      referred.client.id,
    ]);
    const relationshipIdentityHash = this.hash([
      'p4-04.create-customer-referral.v1',
      input.tenantId,
      referrer.client.id,
      referredSubjectHash,
    ]);
    const referralCodeBindingHash = this.hash([
      'p4-04.referral-code-binding.v1',
      input.tenantId,
      referrer.client.id,
      referredSubjectHash,
      relationshipIdentityHash,
    ]);
    const policySnapshotHash = this.hash([
      REFERRAL_CREATE_SHADOW_POLICY_PROFILE,
      input.tenantId,
      program.id,
      String(program.enabled),
      String(program.inviterRewardKopecks ?? ''),
      String(program.inviteeRewardKopecks ?? ''),
      program.currency,
      program.codePrefix ?? '',
      program.updatedAt.toISOString(),
    ]);
    const canonicalInput = {
      provider: input.provider,
      canonicalReferrerClientId: referrer.client.id,
      canonicalReferredClientId: referred.client.id,
      referrerProviderIdentityHash,
      referredProviderIdentityHash,
      relationshipIdentityHash,
      referredSubjectHash,
      referralCodeBindingHash,
      policyProfile: REFERRAL_CREATE_SHADOW_POLICY_PROFILE,
      policySnapshotHash,
      eligibilityDecision: 'eligible',
      intendedStatus: 'pending',
    };

    const execution = await this.actionEngine.planShadow({
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: input.tenantId,
      capability: REFERRAL_CREATE_SHADOW_CAPABILITY,
      source: {
        type: 'legacy_bridge',
        occurrenceScope: `p4-04:create-referral:${relationshipIdentityHash}`,
        sourceRef: 'legacy-referral:create-customer-referral',
      },
      targetRef: `referral:${relationshipIdentityHash}`,
      input: canonicalInput,
      evidenceRefs: [
        `provider-client:${referrerProviderIdentityHash}`,
        `provider-client:${referredProviderIdentityHash}`,
      ],
      callerIdempotency: {
        scope: 'p4-04.create-customer-referral.shadow',
        key: relationshipIdentityHash,
      },
    });

    return {
      outcome: 'planned',
      actionExecutionId: execution.id,
      shadowDivergences: 0,
      intendedMutation: {
        model: 'CustomerReferral',
        status: 'pending',
        referrerClientId: referrer.client.id,
        referredClientId: referred.client.id,
        relationshipIdentityHash,
        referredSubjectHash,
        referralCodeBindingHash,
        policyProfile: REFERRAL_CREATE_SHADOW_POLICY_PROFILE,
        policySnapshotHash,
        eligibility: 'eligible',
        approvalRequirement: 'NONE',
      },
      newPathReferralRelationships: 0,
      newPathRewardValueMutations: 0,
      newPathProviderWrites: 0,
      newPathMessages: 0,
    };
  }

  private enabled(): boolean {
    return ['1', 'true', 'on', 'yes'].includes(
      String(process.env.MAYA_REFERRAL_CREATE_SHADOW_ENABLED || '')
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
    outcome: Exclude<ReferralCreateShadowOutcome, 'planned'>,
    shadowDivergences: number,
  ): ReferralCreateShadowResult {
    return {
      outcome,
      actionExecutionId: null,
      shadowDivergences,
      intendedMutation: null,
      newPathReferralRelationships: 0,
      newPathRewardValueMutations: 0,
      newPathProviderWrites: 0,
      newPathMessages: 0,
    };
  }
}
