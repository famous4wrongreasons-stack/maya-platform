import { createHash, createHmac } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
} from '../action-engine';
import {
  COMMUNICATION_ENVELOPE_CONTRACT,
  CommunicationDeliveryKernel,
} from '../communication-delivery';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CommunicationShadowPlanInput,
  CommunicationShadowPlanResult,
  CommunicationShadowTaxonomy,
} from './communication-shadow.contract';

const CAPABILITY_BY_TAXONOMY: Record<CommunicationShadowTaxonomy, string> = {
  transactional_single: 'communication.transactional-single.shadow.v1',
  operational_single: 'communication.operational-single.shadow.v1',
  bulk_campaign: 'communication.bulk-campaign.shadow.v1',
};

const PROVIDER_CAPABILITY = {
  inbox: 'communication.shadow.inbox',
  apns: 'communication.shadow.apns',
  telegram: 'communication.shadow.telegram',
  sms: 'communication.shadow.smsru',
  email: 'communication.shadow.smtp',
} as const;

@Injectable()
export class CommunicationShadowService {
  private readonly logger = new Logger(CommunicationShadowService.name);
  private readonly deliveryKernel: CommunicationDeliveryKernel;
  private readonly identitySecret: string;

  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    prisma: PrismaService,
    config: ConfigService,
  ) {
    const compatibilitySecret = config.get<string>('CRM_ENCRYPTION_KEY');
    const identitySecret =
      config.get<string>('ACTION_ENGINE_IDENTITY_SECRET') ??
      compatibilitySecret;
    const payloadEncryptionSecret =
      config.get<string>('ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET') ??
      compatibilitySecret;
    if (!identitySecret || !payloadEncryptionSecret) {
      throw new Error('Communication shadow secrets are not configured');
    }
    this.identitySecret = identitySecret;
    this.deliveryKernel = new CommunicationDeliveryKernel(prisma, {
      identitySecret,
      payloadEncryptionSecret,
    });
  }

  async plan(
    input: CommunicationShadowPlanInput,
  ): Promise<CommunicationShadowPlanResult> {
    this.assertInput(input);
    const logicalHash = this.hash(input.logicalRef);
    const contentIdentityHash = this.hashParts(input.contentIdentityParts);
    const templateRef = `template:${this.hash(input.templateRef)}`;
    const recipientHashes = input.recipients.map((recipient) =>
      this.hmac(
        input.tenantId,
        recipient.recipientKind,
        recipient.recipientRef,
      ),
    );
    const single = input.taxonomy !== 'bulk_campaign';
    const targetIdentity = single
      ? recipientHashes[0]
      : input.audienceSnapshotHash!;
    const actionExecution = await this.actionEngine.planShadow({
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: input.tenantId,
      capability: CAPABILITY_BY_TAXONOMY[input.taxonomy],
      source: {
        type: input.sourceType,
        occurrenceScope: `communication:${logicalHash}`,
        sourceRef: `producer:${this.hash(input.producerRef)}`,
        actorUserId: input.actorUserId,
      },
      targetRef: `${single ? 'recipient' : 'audience'}:${targetIdentity}`,
      input: {
        logicalCommunicationRef: `logical:${logicalHash}`,
        channel: input.channel,
        contentIdentityHash,
        ...(single ? { recipientIdentityHash: recipientHashes[0] } : {}),
        ...(!single
          ? { audienceSnapshotHash: input.audienceSnapshotHash }
          : {}),
        eligibilityPolicyRef: `policy:${this.hash(input.eligibilityPolicyRef)}`,
        legacyApprovalRequirement: input.legacyApprovalRequirement,
        riskClass:
          input.taxonomy === 'transactional_single'
            ? 'transactional'
            : input.taxonomy === 'operational_single'
              ? 'operational'
              : 'bulk',
        templateRef,
        recipientCount: input.recipients.length,
      },
      evidenceRefs: [`communication:${logicalHash}`],
      intentExpiresAt: input.expiresAt,
      callerIdempotency: {
        scope: `communication-shadow:${input.channel}`,
        key: logicalHash,
      },
    });

    const before = await this.deliveryKernel.metrics(input.tenantId);
    const envelope = await this.deliveryKernel.createEnvelope({
      contract: COMMUNICATION_ENVELOPE_CONTRACT,
      tenantId: input.tenantId,
      actionExecutionId: actionExecution.id,
      scope: single ? 'SINGLE' : 'BULK',
      channel: input.channel,
      capabilityKey: PROVIDER_CAPABILITY[input.channel],
      campaignIdempotencyKey: `shadow:${logicalHash}`,
      contentRef: templateRef,
      contentIdentityHash,
      expiresAt: input.expiresAt,
      recipients: input.recipients.map((recipient) => ({
        recipientRef: recipient.recipientRef,
        recipientKind: recipient.recipientKind,
        internalUserId: recipient.internalUserId,
        consentEvidenceId: recipient.consentEvidenceId,
        eligibility: {
          basis: recipient.eligibility.basis,
          decision: recipient.eligibility.decision,
          policyVersion: recipient.eligibility.policyVersion,
          evidenceRef: recipient.eligibility.evidenceRef,
          evidenceHash: this.hashParts(
            recipient.eligibility.evidenceIdentityParts,
          ),
          checkedAt: new Date(),
          reasonCode: recipient.eligibility.reasonCode,
        },
      })),
      audienceId: input.audienceId,
      audienceSnapshotHash: input.audienceSnapshotHash,
      createdByUserId: input.actorUserId,
      confirmedByUserId: input.confirmedByUserId,
    });
    const after = await this.deliveryKernel.metrics(input.tenantId);
    this.logger.log(
      `communication shadow planned tenant=${input.tenantId} taxonomy=${input.taxonomy} channel=${input.channel} recipients=${envelope.recipients.length}`,
    );
    return {
      actionExecutionId: actionExecution.id,
      campaignId: envelope.id,
      recipientIds: envelope.recipients.map((recipient) => recipient.id),
      duplicateDeliveriesCollapsed: Math.max(
        0,
        after.duplicateDeliveriesCollapsed -
          before.duplicateDeliveriesCollapsed,
      ),
      externalMessagesSent: 0,
    };
  }

  private assertInput(input: CommunicationShadowPlanInput): void {
    if (!input.tenantId || !input.logicalRef || !input.producerRef) {
      throw new Error('Communication shadow identity is incomplete');
    }
    if (input.recipients.length < 1 || input.recipients.length > 100_000) {
      throw new Error('Communication shadow recipients are invalid');
    }
    const bulk = input.taxonomy === 'bulk_campaign';
    if (bulk !== Boolean(input.audienceId && input.audienceSnapshotHash)) {
      throw new Error(
        'Bulk communication requires a durable audience snapshot',
      );
    }
    if (!bulk && input.recipients.length !== 1) {
      throw new Error('Single communication requires exactly one recipient');
    }
    for (const recipient of input.recipients) {
      if (!recipient.recipientRef.trim() || !recipient.recipientKind.trim()) {
        throw new Error('Communication shadow recipient is incomplete');
      }
    }
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('base64url');
  }

  private hashParts(parts: readonly string[]): string {
    return this.hash(JSON.stringify(parts));
  }

  private hmac(tenantId: string, kind: string, value: string): string {
    return createHmac('sha256', this.identitySecret)
      .update(`${tenantId}\u0000${kind}\u0000${value}`)
      .digest('base64url');
  }
}
