import { verifiedClientChannelCapability } from './client-preferences.contract';
import { readClientActionPrincipal } from './client-action-principal.contract';
import type { ConsentChannelBinding } from '../crm/client-consent-authority';
import { Injectable } from '@nestjs/common';
import {
  ActionPolicyDecision,
  type ActionExecution,
  type Prisma,
} from '@prisma/client';

import type {
  ActionExecutionPreviewV1,
  TrustedActionExecutionRequestV1,
} from './action-engine.contract';
import { ActionContractError } from './action-engine.errors';
import { ActionEngineKernel } from './action-engine.kernel';
import { admitWithInvocationReceipt } from './action-invocation-receipt.context';
import {
  ACTION_POLICY_RESOLUTION_REQUEST_CONTRACT,
  CanonicalActionPolicyResolver,
  type ActionPolicyResolutionRequestV1,
  type CanonicalActionPolicyResolutionV1,
} from './action-engine.policy-resolver';

const ALLOWED_REQUEST_KEYS = new Set([
  'contract',
  'tenantId',
  'capability',
  'source',
  'targetRef',
  'input',
  'evidenceRefs',
  'intentExpiresAt',
  'callerIdempotency',
  'bookingIntent',
  'ownerReportSlot',
]);
const ALLOWED_SOURCE_KEYS = new Set([
  'type',
  'occurrenceScope',
  'sourceRef',
  'agentTaskId',
  'actorUserId',
]);
const ALLOWED_IDEMPOTENCY_KEYS = new Set(['scope', 'key']);

export interface CanonicalActionIngressPreparedV1 {
  preview: ActionExecutionPreviewV1;
  policyRequest: ActionPolicyResolutionRequestV1;
  policy: CanonicalActionPolicyResolutionV1;
}

/**
 * The sole production ingress allowed to turn an initiator request into a
 * durable ActionExecution. Initiators can propose action data, never policy.
 */
@Injectable()
export class CanonicalActionIngressService {
  constructor(
    private readonly kernel: ActionEngineKernel,
    private readonly policyResolver: CanonicalActionPolicyResolver,
  ) {}

  async prepare(
    request: TrustedActionExecutionRequestV1,
  ): Promise<CanonicalActionIngressPreparedV1> {
    this.assertNoCallerAuthority(request);
    const preview = this.kernel.previewExecution(request);
    const sourceRef = request.source.sourceRef;
    if (!sourceRef) {
      throw new ActionContractError(
        'Canonical ingress requires a durable server-derived sourceRef',
      );
    }
    const policyRequest: ActionPolicyResolutionRequestV1 = {
      contract: ACTION_POLICY_RESOLUTION_REQUEST_CONTRACT,
      tenantId: request.tenantId,
      capability: preview.capability,
      sourceType: request.source.type,
      sourceRef,
      ...(request.source.actorUserId
        ? { actorUserId: request.source.actorUserId }
        : {}),
      targetRef: preview.targetRef,
      normalizedInputHash: preview.normalizedInputHash,
      clientPrincipal: readClientActionPrincipal({
        capability: preview.capability,
        sourceType: request.source.type,
        targetRef: preview.targetRef,
        input: request.input,
        evidenceRefs: request.evidenceRefs,
        hasBookingIntent: Boolean(request.bookingIntent),
      }),
      ...(verifiedClientChannelCapability(preview.capability)
        ? {
            clientChannel: (
              request.input as { consentChannel: ConsentChannelBinding }
            ).consentChannel,
          }
        : {}),
    };
    const policy = await this.policyResolver.resolve(policyRequest);
    this.assertResolverOwnsDecision(preview, policy);
    return { preview, policyRequest, policy };
  }

  async preview(
    request: TrustedActionExecutionRequestV1,
  ): Promise<ActionExecutionPreviewV1> {
    const prepared = await this.prepare(request);
    return {
      ...prepared.preview,
      policyDecision: prepared.policy.policyDecision,
      autonomyLevel: prepared.policy.autonomyLevel,
      approvalRequirement: prepared.policy.approvalRequirement,
    };
  }

  async createExecution(
    request: TrustedActionExecutionRequestV1,
    transaction?: Prisma.TransactionClient,
  ): Promise<ActionExecution> {
    return admitWithInvocationReceipt(
      request,
      async (admittedRequest, tx) => {
        const prepared = await this.prepare(admittedRequest);
        return this.kernel.createCanonicalExecution(
          admittedRequest,
          prepared.policy,
          tx,
        );
      },
      transaction,
    );
  }

  private assertResolverOwnsDecision(
    preview: ActionExecutionPreviewV1,
    policy: CanonicalActionPolicyResolutionV1,
  ): void {
    const staticDecisionPreserved =
      preview.policyDecision === ActionPolicyDecision.ALLOW ||
      policy.policyDecision === preview.policyDecision;
    if (
      policy.policyKey !== preview.policyKey ||
      policy.policyVersion !== preview.policyVersion ||
      policy.autonomyLevel !== preview.autonomyLevel ||
      policy.approvalRequirement !== preview.approvalRequirement ||
      !staticDecisionPreserved
    ) {
      throw new ActionContractError(
        'Canonical policy decision does not match the capability contract',
      );
    }
  }

  private assertNoCallerAuthority(
    request: TrustedActionExecutionRequestV1,
  ): void {
    assertOnlyKeys(request, ALLOWED_REQUEST_KEYS, 'Canonical ingress request');
    assertOnlyKeys(request.source, ALLOWED_SOURCE_KEYS, 'Action source');
    if (request.callerIdempotency) {
      assertOnlyKeys(
        request.callerIdempotency,
        ALLOWED_IDEMPOTENCY_KEYS,
        'Caller idempotency',
      );
    }
  }
}

function assertOnlyKeys(
  value: object,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) {
    throw new ActionContractError(
      `${label} contains authority or unknown fields: ${unexpected.sort().join(', ')}`,
    );
  }
}
