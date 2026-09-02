import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ActionExecutionState, ActionPolicyDecision } from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION,
  GIFT_CERTIFICATE_REDEMPTION_CONTRACT_VERSION,
  GIFT_CERTIFICATE_REDEMPTION_RECONCILIATION_CONTRACT,
  GIFT_CERTIFICATE_REDEMPTION_SHADOW_CAPABILITY,
  GIFT_CERTIFICATE_REDEMPTION_SHADOW_POLICY_PROFILE,
  GIFT_CERTIFICATE_REDEMPTION_TARGET_CONTRACT,
} from '../action-engine';
import {
  CLIENT_IDENTITY_GUARD_UNAVAILABLE,
  CLIENT_IDENTITY_UNRESOLVED,
  ClientIdentityService,
} from '../crm/client-identity.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { GiftCertificateRedemptionShadowDto } from './dto/gift-certificate-redemption-shadow.dto';
import {
  giftCertificateClaimLookup,
  giftCertificatePresentationConfig,
} from './gift-certificate-claim.contract';

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

type RequesterAuthority = 'administrative_role' | 'server_cashier_allowlist';

export type GiftCertificateRedemptionShadowOutcome =
  | 'planned'
  | 'shadow_disabled'
  | 'policy_unresolved'
  | 'identity_unresolved'
  | 'identity_guard_unavailable'
  | 'certificate_unresolved'
  | 'certificate_inactive'
  | 'certificate_expired'
  | 'presentation_key_unavailable'
  | 'already_redeemed'
  | 'redemption_target_unresolved';

export interface GiftCertificateRedemptionShadowResult {
  outcome: GiftCertificateRedemptionShadowOutcome;
  actionExecutionId: string | null;
  shadowDivergences: number;
  intendedRedemption: {
    model: 'GiftCertificateRedemption';
    certificateId: string;
    certificateIdentityHash: string;
    targetClientId: string;
    targetAppointmentId: string;
    targetRefHash: string;
    nominalAmountKopecks: number;
    currency: string;
    certificateOwnershipSemantics: 'tenant_transferable_bearer_liability';
    purchaserIsRedemptionOwner: false;
    recipientSubjectIsClientIdentity: false;
    redemptionMode: 'full_only';
    intendedValueApplication: 'consume_entire_certificate_nominal';
    redemptionIdentityHash: string;
    claimLookupContractVersion: typeof GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION;
    presentationKeyVersion: string;
    requesterAuthority: RequesterAuthority;
    approvalRequirement: 'NONE_ACTOR_AUTHORIZED';
    providerBoundary: 'LOCAL_ONLY';
    unknownApplicable: false;
    reconciliationContract: typeof GIFT_CERTIFICATE_REDEMPTION_RECONCILIATION_CONTRACT;
    oneTimeClaimRequired: true;
    writesPerformed: false;
    rawBearerPersisted: false;
  } | null;
  redemptionsCreatedByNewPath: 0;
  certificateValueMutationsByNewPath: 0;
  rawBearerOrCodePersistedByNewPath: 0;
  loyaltyTransactionsCreatedByNewPath: 0;
  paymentProviderWritesByNewPath: 0;
  messagesSentByNewPath: 0;
}

@Injectable()
export class GiftCertificateRedemptionShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly bridgeSource: BridgeSourceService,
    private readonly tenantContext: TenantContextService,
    private readonly clientIdentity: ClientIdentityService,
  ) {}

  assertSecret(header: string | undefined): void {
    this.bridgeSource.assertBridgeSecret(header, 'MAYA_INBOX_BRIDGE_TOKEN', {
      disabled: 'gift_certificate_redemption_shadow_bridge_disabled',
      unauthorized: 'gift_certificate_redemption_shadow_unauthorized',
    });
  }

  async planRedemption(
    dto: GiftCertificateRedemptionShadowDto,
  ): Promise<GiftCertificateRedemptionShadowResult> {
    if (!this.enabled()) return this.noPlan('shadow_disabled', 0);

    const presentation = giftCertificatePresentationConfig();
    const cashierUserIds = this.cashierUserIds(
      process.env.MAYA_GIFT_CERTIFICATE_REDEMPTION_CASHIER_USER_IDS,
    );
    if (!presentation || cashierUserIds === null) {
      return this.noPlan('policy_unresolved', 1);
    }

    const boundSource = this.bridgeSource.assertBridgeIntegrationBinding(
      {
        provider: dto.provider,
        externalCompanyId: dto.external_company_id,
      },
      {
        provider: 'MAYA_GIFT_CERTIFICATE_REDEMPTION_SHADOW_SOURCE_PROVIDER',
        externalCompanyId:
          'MAYA_GIFT_CERTIFICATE_REDEMPTION_SHADOW_SOURCE_COMPANY_ID',
      },
      {
        disabled: 'gift_certificate_redemption_shadow_source_disabled',
        mismatch: 'gift_certificate_redemption_shadow_source_mismatch',
      },
    );
    const tenant = await this.bridgeSource.resolveTenantByIntegration(
      boundSource,
      'gift_certificate_redemption_shadow_tenant_not_found',
    );

    const requesterProvider = dto.requester_identity_provider
      .trim()
      .toLowerCase();
    const externalRequesterId = dto.external_requester_id.trim();
    const targetExternalClientId = dto.target_external_client_id.trim();
    const targetExternalRecordId = dto.target_external_record_id.trim();
    const transientBearer = dto.certificate_claim.trim();
    if (
      !requesterProvider ||
      !externalRequesterId ||
      !targetExternalClientId ||
      !targetExternalRecordId ||
      !transientBearer ||
      dto.redemption_mode !== 'full'
    ) {
      return this.noPlan('identity_unresolved', 1);
    }

    return this.tenantContext.runAsSystemTenant(tenant.tenantId, () =>
      this.planInsideTenant({
        tenantId: tenant.tenantId,
        provider: boundSource.provider,
        requesterProvider,
        externalRequesterId,
        targetExternalClientId,
        targetExternalRecordId,
        transientBearer,
        lookupKey: presentation.lookupKey,
        presentationKeys: presentation.presentationKeys,
        cashierUserIds,
        dto,
      }),
    );
  }

  private async planInsideTenant(input: {
    tenantId: string;
    provider: string;
    requesterProvider: string;
    externalRequesterId: string;
    targetExternalClientId: string;
    targetExternalRecordId: string;
    transientBearer: string;
    lookupKey: string;
    presentationKeys: ReadonlyMap<string, string>;
    cashierUserIds: Set<string>;
    dto: GiftCertificateRedemptionShadowDto;
  }): Promise<GiftCertificateRedemptionShadowResult> {
    const requester = await this.prisma.authIdentity.findUnique({
      where: {
        tenantId_provider_providerUserId: {
          tenantId: input.tenantId,
          provider: input.requesterProvider,
          providerUserId: input.externalRequesterId,
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

    const codeHash = giftCertificateClaimLookup(
      input.lookupKey,
      input.transientBearer,
    );
    const certificate = await this.prisma.giftCertificate.findUnique({
      where: {
        tenantId_codeHash: {
          tenantId: input.tenantId,
          codeHash,
        },
      },
      select: {
        id: true,
        tenantId: true,
        issueExecutionId: true,
        issuanceIdentityHash: true,
        codeHash: true,
        presentationKeyVersion: true,
        recipientSubjectHash: true,
        offerSnapshotHash: true,
        nominalAmountKopecks: true,
        currency: true,
        paymentStatus: true,
        provider: true,
        providerPaymentRefHash: true,
        issuedAt: true,
        expiresAt: true,
        paidAt: true,
        canceledAt: true,
        redemption: { select: { id: true, actionExecutionId: true } },
        issueExecution: {
          select: {
            id: true,
            tenantId: true,
            actionClass: true,
            state: true,
            dryRun: true,
            policyDecision: true,
          },
        },
      },
    });
    if (!certificate) return this.noPlan('certificate_unresolved', 1);
    if (certificate.redemption) return this.noPlan('already_redeemed', 0);
    if (
      certificate.tenantId !== input.tenantId ||
      certificate.codeHash !== codeHash ||
      !certificate.issueExecutionId ||
      !certificate.issueExecution ||
      certificate.issueExecution.id !== certificate.issueExecutionId ||
      certificate.issueExecution.tenantId !== input.tenantId ||
      certificate.issueExecution.actionClass !== 'activate_gift_certificate' ||
      certificate.issueExecution.state !== ActionExecutionState.SUCCEEDED ||
      certificate.issueExecution.dryRun ||
      certificate.issueExecution.policyDecision !==
        ActionPolicyDecision.ALLOW ||
      certificate.paymentStatus !== 'paid' ||
      !certificate.paidAt ||
      certificate.canceledAt !== null ||
      certificate.issuedAt.getTime() !== certificate.paidAt.getTime() ||
      !Number.isSafeInteger(certificate.nominalAmountKopecks) ||
      certificate.nominalAmountKopecks < 1 ||
      !/^[A-Z]{3}$/.test(certificate.currency) ||
      !OPAQUE_REF_PATTERN.test(certificate.issuanceIdentityHash) ||
      !OPAQUE_REF_PATTERN.test(certificate.recipientSubjectHash) ||
      !OPAQUE_REF_PATTERN.test(certificate.offerSnapshotHash) ||
      !certificate.provider ||
      !certificate.providerPaymentRefHash ||
      !Number.isFinite(certificate.issuedAt.getTime()) ||
      !Number.isFinite(certificate.expiresAt.getTime()) ||
      certificate.expiresAt.getTime() <= certificate.issuedAt.getTime()
    ) {
      return this.noPlan('certificate_inactive', 1);
    }
    if (!certificate.presentationKeyVersion) {
      return this.noPlan('presentation_key_unavailable', 1);
    }
    if (!input.presentationKeys.has(certificate.presentationKeyVersion)) {
      return this.noPlan('presentation_key_unavailable', 1);
    }
    if (certificate.expiresAt.getTime() <= Date.now()) {
      return this.noPlan('certificate_expired', 0);
    }

    const guard = await this.clientIdentity.checkCrmClientRegistrationGuard({
      tenantId: input.tenantId,
      provider: input.provider,
      externalId: input.targetExternalClientId,
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

    const targetLink = await this.prisma.crmClientLink.findUnique({
      where: {
        tenantId_provider_externalId: {
          tenantId: input.tenantId,
          provider: input.provider,
          externalId: input.targetExternalClientId,
        },
      },
      select: {
        unlinkedAt: true,
        client: { select: { id: true, mergedIntoClientId: true } },
      },
    });
    if (
      !targetLink ||
      targetLink.unlinkedAt !== null ||
      targetLink.client.mergedIntoClientId !== null
    ) {
      return this.noPlan('identity_unresolved', 1);
    }

    const appointment = await this.prisma.appointment.findUnique({
      where: {
        tenantId_crmProvider_crmExternalId: {
          tenantId: input.tenantId,
          crmProvider: input.provider,
          crmExternalId: input.targetExternalRecordId,
        },
      },
      select: {
        id: true,
        tenantId: true,
        mayaClientId: true,
        branchId: true,
        crmProvider: true,
        crmExternalId: true,
        serviceIds: true,
        totalPriceKopecks: true,
        currency: true,
        providerPayload: true,
      },
    });
    const serviceIds = this.serviceIds(appointment?.serviceIds);
    if (
      !appointment ||
      appointment.tenantId !== input.tenantId ||
      appointment.mayaClientId !== targetLink.client.id ||
      appointment.crmProvider !== input.provider ||
      appointment.crmExternalId !== input.targetExternalRecordId ||
      !serviceIds ||
      !Number.isSafeInteger(appointment.totalPriceKopecks) ||
      appointment.totalPriceKopecks === null ||
      appointment.totalPriceKopecks < 1 ||
      appointment.currency !== certificate.currency
    ) {
      return this.noPlan('redemption_target_unresolved', 1);
    }

    const requesterRole = String(requester.membership.role);
    const requesterAuthority = this.requesterAuthority({
      initiator: input.dto.initiator,
      requesterRole,
      requesterUserId: requester.user.id,
      requesterBranchId: requester.membership.branchId,
      targetBranchId: appointment.branchId,
      cashierUserIds: input.cashierUserIds,
    });
    if (!requesterAuthority) return this.noPlan('policy_unresolved', 1);

    const providerVisitIdentity = this.providerVisitIdentity(
      appointment.providerPayload,
    );
    const targetClientIdentityHash = this.hash([
      'p4-06.gift-certificate-target-client.v1',
      input.tenantId,
      targetLink.client.id,
      input.provider,
      input.targetExternalClientId,
    ]);
    const targetRefHash = this.hash([
      GIFT_CERTIFICATE_REDEMPTION_TARGET_CONTRACT,
      input.tenantId,
      targetLink.client.id,
      appointment.id,
      input.provider,
      appointment.crmExternalId,
      providerVisitIdentity ?? '',
      ...serviceIds,
      String(appointment.totalPriceKopecks),
      appointment.currency,
    ]);
    const certificateIdentityHash = this.hash([
      'p4-06.gift-certificate-identity.v1',
      input.tenantId,
      certificate.issuanceIdentityHash,
    ]);
    const claimBindingHash = this.hash([
      'p4-06.gift-certificate-claim-binding.v1',
      input.tenantId,
      certificate.id,
      certificate.codeHash,
      certificate.presentationKeyVersion,
      GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION,
    ]);
    const requesterIdentityHash = this.hash([
      input.tenantId,
      requester.user.id,
      requester.membership.id,
      requesterRole,
      requesterAuthority,
    ]);
    const redemptionIdentityHash = this.hash([
      GIFT_CERTIFICATE_REDEMPTION_CONTRACT_VERSION,
      input.tenantId,
      certificate.id,
      targetRefHash,
      targetLink.client.id,
      requesterIdentityHash,
    ]);
    const policySnapshotHash = this.hash([
      GIFT_CERTIFICATE_REDEMPTION_SHADOW_POLICY_PROFILE,
      input.tenantId,
      certificate.id,
      certificate.issuanceIdentityHash,
      certificate.offerSnapshotHash,
      targetRefHash,
      requesterIdentityHash,
      'eligible_for_full_redemption',
      'NONE_ACTOR_AUTHORIZED',
    ]);

    const canonicalInput = {
      provider: input.provider,
      canonicalCertificateId: certificate.id,
      issuanceIdentityHash: certificate.issuanceIdentityHash,
      issueExecutionId: certificate.issueExecutionId,
      recipientSubjectHash: certificate.recipientSubjectHash,
      offerSnapshotHash: certificate.offerSnapshotHash,
      certificateOwnershipSemantics: 'tenant_transferable_bearer_liability',
      purchaserIsRedemptionOwner: false,
      recipientSubjectIsClientIdentity: false,
      certificateIdentityHash,
      claimBindingHash,
      claimLookupContractVersion:
        GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION,
      presentationKeyVersion: certificate.presentationKeyVersion,
      nominalAmountKopecks: certificate.nominalAmountKopecks,
      currency: certificate.currency,
      issuedAt: certificate.issuedAt.toISOString(),
      paidAt: certificate.paidAt.toISOString(),
      expiresAt: certificate.expiresAt.toISOString(),
      targetContractVersion: GIFT_CERTIFICATE_REDEMPTION_TARGET_CONTRACT,
      targetKind: 'appointment_service_bundle',
      targetAppointmentId: appointment.id,
      targetClientId: targetLink.client.id,
      targetClientIdentityHash,
      targetRefHash,
      providerRecordIdentity: appointment.crmExternalId,
      providerVisitIdentity,
      serviceIds,
      targetAmountKopecks: appointment.totalPriceKopecks,
      targetCurrency: appointment.currency,
      requesterIdentityHash,
      requesterRole,
      requesterAuthority,
      redemptionIdentityHash,
      redemptionContractVersion: GIFT_CERTIFICATE_REDEMPTION_CONTRACT_VERSION,
      policyProfile: GIFT_CERTIFICATE_REDEMPTION_SHADOW_POLICY_PROFILE,
      policySnapshotHash,
      eligibilityDecision: 'eligible_for_full_redemption',
      redemptionMode: 'full_only',
      intendedValueApplication: 'consume_entire_certificate_nominal',
      approvalRequirement: 'NONE_ACTOR_AUTHORIZED',
      providerBoundary: 'LOCAL_ONLY',
      unknownApplicable: false,
      reconciliationContract:
        GIFT_CERTIFICATE_REDEMPTION_RECONCILIATION_CONTRACT,
      existingRedemptionDecision: 'none',
      intendedRedemptionMutation: 'insert_full_redemption_claim',
      redemptionWritePerformed: false,
      certificateValueMutationPerformed: false,
      loyaltyTransactionCreated: false,
      paymentMutationPerformed: false,
      providerWritesRequired: false,
      rawBearerPersisted: false,
    } as const;
    const execution = await this.actionEngine.planShadow({
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: input.tenantId,
      capability: GIFT_CERTIFICATE_REDEMPTION_SHADOW_CAPABILITY,
      source: {
        type: 'legacy_bridge',
        occurrenceScope: `p4-06:redeem-certificate:${redemptionIdentityHash}`,
        sourceRef: 'legacy-gift-certificate:redeem-certificate',
        actorUserId: requester.user.id,
      },
      targetRef: `gift-certificate:${certificateIdentityHash}`,
      input: canonicalInput,
      evidenceRefs: [
        `gift-certificate:${certificateIdentityHash}`,
        `issue-execution:${certificate.issueExecutionId}`,
        `claim-binding:${claimBindingHash}`,
        `target-client:${targetClientIdentityHash}`,
        `redemption-target:${targetRefHash}`,
        `requester:${requesterIdentityHash}`,
      ],
      callerIdempotency: {
        scope: 'p4-06.redeem-gift-certificate.shadow',
        key: redemptionIdentityHash,
      },
    });

    return {
      outcome: 'planned',
      actionExecutionId: execution.id,
      shadowDivergences: 0,
      intendedRedemption: {
        model: 'GiftCertificateRedemption',
        certificateId: certificate.id,
        certificateIdentityHash,
        targetClientId: targetLink.client.id,
        targetAppointmentId: appointment.id,
        targetRefHash,
        nominalAmountKopecks: certificate.nominalAmountKopecks,
        currency: certificate.currency,
        certificateOwnershipSemantics: 'tenant_transferable_bearer_liability',
        purchaserIsRedemptionOwner: false,
        recipientSubjectIsClientIdentity: false,
        redemptionMode: 'full_only',
        intendedValueApplication: 'consume_entire_certificate_nominal',
        redemptionIdentityHash,
        claimLookupContractVersion:
          GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION,
        presentationKeyVersion: certificate.presentationKeyVersion,
        requesterAuthority,
        approvalRequirement: 'NONE_ACTOR_AUTHORIZED',
        providerBoundary: 'LOCAL_ONLY',
        unknownApplicable: false,
        reconciliationContract:
          GIFT_CERTIFICATE_REDEMPTION_RECONCILIATION_CONTRACT,
        oneTimeClaimRequired: true,
        writesPerformed: false,
        rawBearerPersisted: false,
      },
      redemptionsCreatedByNewPath: 0,
      certificateValueMutationsByNewPath: 0,
      rawBearerOrCodePersistedByNewPath: 0,
      loyaltyTransactionsCreatedByNewPath: 0,
      paymentProviderWritesByNewPath: 0,
      messagesSentByNewPath: 0,
    };
  }

  private requesterAuthority(input: {
    initiator: GiftCertificateRedemptionShadowDto['initiator'];
    requesterRole: string;
    requesterUserId: string;
    requesterBranchId: string | null;
    targetBranchId: string | null;
    cashierUserIds: Set<string>;
  }): RequesterAuthority | null {
    if (
      input.initiator === 'admin_redeem' &&
      ADMINISTRATIVE_ROLES.has(input.requesterRole)
    ) {
      return 'administrative_role';
    }
    if (
      input.initiator === 'cashier_redeem' &&
      CASHIER_ELIGIBLE_ROLES.has(input.requesterRole) &&
      input.cashierUserIds.has(input.requesterUserId) &&
      (!input.requesterBranchId ||
        input.requesterBranchId === input.targetBranchId)
    ) {
      return 'server_cashier_allowlist';
    }
    return null;
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

  private serviceIds(value: unknown): string[] | null {
    if (!Array.isArray(value)) return null;
    const ids = value.map((item) => String(item).trim()).filter(Boolean);
    if (
      ids.length < 1 ||
      ids.length !== value.length ||
      ids.length > 100 ||
      new Set(ids).size !== ids.length ||
      ids.some((item) => !OPAQUE_REF_PATTERN.test(item))
    ) {
      return null;
    }
    return [...ids].sort();
  }

  private providerVisitIdentity(value: unknown): string | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const payload = value as Record<string, unknown>;
    for (const key of [
      'visit_id',
      'visitId',
      'attendance_id',
      'attendanceId',
    ]) {
      const candidate = payload[key];
      if (
        (typeof candidate === 'string' || typeof candidate === 'number') &&
        OPAQUE_REF_PATTERN.test(String(candidate))
      ) {
        return String(candidate);
      }
    }
    return null;
  }

  private enabled(): boolean {
    return ['1', 'true', 'on', 'yes'].includes(
      String(process.env.MAYA_GIFT_CERTIFICATE_REDEMPTION_SHADOW_ENABLED || '')
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
    outcome: Exclude<GiftCertificateRedemptionShadowOutcome, 'planned'>,
    shadowDivergences: number,
  ): GiftCertificateRedemptionShadowResult {
    return {
      outcome,
      actionExecutionId: null,
      shadowDivergences,
      intendedRedemption: null,
      redemptionsCreatedByNewPath: 0,
      certificateValueMutationsByNewPath: 0,
      rawBearerOrCodePersistedByNewPath: 0,
      loyaltyTransactionsCreatedByNewPath: 0,
      paymentProviderWritesByNewPath: 0,
      messagesSentByNewPath: 0,
    };
  }
}
