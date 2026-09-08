import {
  ActionApprovalDecision,
  ActionExecutionState,
  ActionPolicyDecision,
} from '@prisma/client';

import type { ActionSourceType } from './action-engine.contract';
import { ActionContractError } from './action-engine.errors';
import { stableActionJson } from './action-engine.identity';
import {
  ACTION_POLICY_RESOLUTION_REQUEST_CONTRACT,
  type ActionPolicyResolutionRequestV1,
  type CanonicalActionPolicyResolutionV1,
  type CanonicalActionPolicyResolver,
} from './action-engine.policy-resolver';

export const ACTION_APPROVAL_AUTHORIZATION_REQUEST_CONTRACT =
  'maya.action-approval-authorization-request/1' as const;
export const ACTION_APPROVAL_AUTHORIZATION_RESULT_CONTRACT =
  'maya.action-approval-authorization-result/1' as const;

const ALLOWED_REQUEST_KEYS = new Set(['contract', 'executionId', 'action']);

export interface CanonicalApprovalAuthorizationRequestV1 {
  contract: typeof ACTION_APPROVAL_AUTHORIZATION_REQUEST_CONTRACT;
  /** The durable ActionExecution selected by canonical server ingress. */
  executionId: string;
  /** Server-derived action subject. Authority fields are rejected by resolver. */
  action: ActionPolicyResolutionRequestV1;
}

/**
 * Server-loaded projection of one durable ActionExecution. This is not a
 * caller-supplied approval token. Revocation is represented by REJECTED.
 */
export interface CanonicalApprovalExecutionRecordV1 {
  id: string;
  tenantId: string;
  sourceType: ActionSourceType;
  sourceRef: string | null;
  actorUserId: string | null;
  actionClass: string;
  capability: string;
  capabilityVersion: number;
  targetKind: string;
  targetRef: string;
  normalizedInputHash: string;
  policyKey: string;
  policyVersion: number;
  policyDecision: ActionPolicyDecision;
  policyContextContract: string | null;
  policyContextHash: string | null;
  policyEvidenceJson: Record<string, unknown> | null;
  policyEvaluatedAt: Date | null;
  policyValidUntil: Date | null;
  approvalRequirement: string;
  approvalDecision: ActionApprovalDecision;
  approvalBindingHash: string | null;
  approvalExpiresAt: Date | null;
  approvalDecidedAt: Date | null;
  approvalDecidedByUserId: string | null;
  state: ActionExecutionState;
  revision: number;
}

export interface CanonicalApprovalBindingRepository {
  /** Must be tenant-qualified and read only trusted durable state. */
  findExecution(
    tenantId: string,
    executionId: string,
  ): Promise<CanonicalApprovalExecutionRecordV1 | null>;

  /** Kernel-only, verified immutable R-C owner binding; never caller input. */
  permitsDurablePolicyResume?(): Promise<boolean>;

  /**
   * Must atomically consume the READY+APPROVED execution at the claim
   * boundary using every expected field below as compare-and-swap guards.
   * A false result means that another claimant won or durable state changed.
   */
  consumeApprovedExecution(input: {
    tenantId: string;
    executionId: string;
    expectedRevision: number;
    expectedPolicyContextHash: string;
    expectedApprovalBindingHash: string;
    consumedAt: Date;
  }): Promise<boolean>;
}

export type CanonicalApprovalAuthorizationReason =
  | 'APPROVAL_BOUND_AND_CONSUMED'
  | 'APPROVAL_NOT_REQUIRED'
  | 'POLICY_NOT_EXTERNALLY_EXECUTABLE'
  | 'APPROVAL_MISSING'
  | 'APPROVAL_NOT_APPROVED'
  | 'APPROVAL_EXPIRED'
  | 'APPROVAL_SUBJECT_MISMATCH'
  | 'APPROVAL_ALREADY_CONSUMED_OR_STALE';

export interface CanonicalApprovalAuthorizationResultV1 {
  contract: typeof ACTION_APPROVAL_AUTHORIZATION_RESULT_CONTRACT;
  executionId: string;
  status: 'AUTHORIZED' | 'NOT_REQUIRED' | 'REJECTED';
  reason: CanonicalApprovalAuthorizationReason;
  policyDecision: ActionPolicyDecision;
  approvalRequirement: 'NONE' | 'REQUIRED';
  bindingMatches: boolean;
  approvalConsumed: boolean;
  externalExecutionAllowed: boolean;
  /** Fresh evidence for the locked attempt; original admission stays immutable. */
  claimPolicy?: CanonicalActionPolicyResolutionV1;
}

type PolicyResolver = Pick<
  CanonicalActionPolicyResolver,
  'resolve' | 'verifyApprovalBinding'
>;

/**
 * Isolated Package 3 approval authority. It deliberately has no Action Engine
 * runtime dependency and cannot dispatch an external side effect.
 */
export class CanonicalApprovalBindingService {
  private readonly now: () => Date;

  constructor(
    private readonly policyResolver: PolicyResolver,
    private readonly repository: CanonicalApprovalBindingRepository,
    private readonly options?: {
      now?: () => Date;
      durableExecutionState?: 'READY' | 'EXECUTING';
    },
  ) {
    this.now = options?.now ?? (() => new Date());
  }

  async authorizeForClaim(
    request: CanonicalApprovalAuthorizationRequestV1,
  ): Promise<CanonicalApprovalAuthorizationResultV1> {
    this.assertRequest(request);
    const policy = await this.policyResolver.resolve(request.action);

    if (policy.policyDecision !== ActionPolicyDecision.ALLOW) {
      return this.result(request, policy, {
        status: 'REJECTED',
        reason: 'POLICY_NOT_EXTERNALLY_EXECUTABLE',
      });
    }

    const execution = await this.repository.findExecution(
      request.action.tenantId,
      request.executionId,
    );
    if (!execution) {
      return this.result(request, policy, {
        status: 'REJECTED',
        reason: 'APPROVAL_MISSING',
      });
    }

    const now = this.now();
    const durableResume =
      execution.state ===
        (this.options?.durableExecutionState ?? ActionExecutionState.READY) &&
      execution.approvalRequirement === 'NONE' &&
      execution.approvalDecision === ActionApprovalDecision.NOT_REQUIRED &&
      policy.approvalRequirement === 'NONE' &&
      (await this.repository.permitsDurablePolicyResume?.()) === true;
    const bindingExpiresAt =
      policy.approvalRequirement === 'REQUIRED'
        ? execution.approvalExpiresAt
        : execution.policyValidUntil;
    if (
      !bindingExpiresAt ||
      (!durableResume && bindingExpiresAt <= now) ||
      !execution.policyValidUntil ||
      (!durableResume && execution.policyValidUntil <= now) ||
      policy.policyValidUntil <= now
    ) {
      return this.result(request, policy, {
        status: 'REJECTED',
        reason: 'APPROVAL_EXPIRED',
      });
    }

    const policyContextHash = execution.policyContextHash;
    const policyEvidenceJson = execution.policyEvidenceJson;
    const approvalBindingHash = execution.approvalBindingHash;
    if (
      !policyContextHash ||
      !policyEvidenceJson ||
      !approvalBindingHash ||
      !this.policyResolver.verifyApprovalBinding(request.action, {
        policyContextHash,
        policyEvidenceJson,
        approvalBindingHash,
        approvalBindingExpiresAt: bindingExpiresAt,
      }) ||
      !this.subjectMatches(request, policy, execution, durableResume)
    ) {
      return this.result(request, policy, {
        status: 'REJECTED',
        reason: 'APPROVAL_SUBJECT_MISMATCH',
      });
    }

    if (policy.approvalRequirement === 'NONE') {
      if (
        execution.approvalRequirement !== 'NONE' ||
        execution.approvalDecision !== ActionApprovalDecision.NOT_REQUIRED
      ) {
        return this.result(request, policy, {
          status: 'REJECTED',
          reason: 'APPROVAL_SUBJECT_MISMATCH',
        });
      }
      return this.result(request, policy, {
        status: 'NOT_REQUIRED',
        reason: 'APPROVAL_NOT_REQUIRED',
        ...(durableResume ? { claimPolicy: policy } : {}),
        bindingMatches: true,
        externalExecutionAllowed: true,
      });
    }

    if (
      execution.approvalDecision !== ActionApprovalDecision.APPROVED ||
      execution.approvalRequirement !== 'REQUIRED' ||
      !execution.approvalDecidedAt ||
      !execution.approvalDecidedByUserId
    ) {
      return this.result(request, policy, {
        status: 'REJECTED',
        reason: 'APPROVAL_NOT_APPROVED',
      });
    }

    if (execution.state !== ActionExecutionState.READY) {
      return this.result(request, policy, {
        status: 'REJECTED',
        reason: 'APPROVAL_ALREADY_CONSUMED_OR_STALE',
        bindingMatches: true,
      });
    }

    const consumed = await this.repository.consumeApprovedExecution({
      tenantId: execution.tenantId,
      executionId: execution.id,
      expectedRevision: execution.revision,
      expectedPolicyContextHash: policyContextHash,
      expectedApprovalBindingHash: approvalBindingHash,
      consumedAt: now,
    });
    if (!consumed) {
      return this.result(request, policy, {
        status: 'REJECTED',
        reason: 'APPROVAL_ALREADY_CONSUMED_OR_STALE',
        bindingMatches: true,
      });
    }

    return this.result(request, policy, {
      status: 'AUTHORIZED',
      reason: 'APPROVAL_BOUND_AND_CONSUMED',
      bindingMatches: true,
      approvalConsumed: true,
      externalExecutionAllowed: true,
    });
  }

  private subjectMatches(
    request: CanonicalApprovalAuthorizationRequestV1,
    policy: CanonicalActionPolicyResolutionV1,
    execution: CanonicalApprovalExecutionRecordV1,
    durableResume: boolean,
  ): boolean {
    const evidenceCapability = readRecord(policy.policyEvidenceJson.capability);
    return (
      execution.id === request.executionId &&
      execution.tenantId === request.action.tenantId &&
      execution.sourceType === request.action.sourceType &&
      execution.sourceRef === request.action.sourceRef &&
      execution.actorUserId === (request.action.actorUserId ?? null) &&
      execution.capability === request.action.capability &&
      execution.capability === evidenceCapability?.key &&
      execution.capabilityVersion === evidenceCapability.version &&
      execution.actionClass === evidenceCapability.actionClass &&
      execution.targetKind === evidenceCapability.targetKind &&
      execution.targetRef === request.action.targetRef &&
      execution.normalizedInputHash === request.action.normalizedInputHash &&
      execution.policyKey === policy.policyKey &&
      execution.policyVersion === policy.policyVersion &&
      execution.policyDecision === policy.policyDecision &&
      execution.policyContextContract === policy.policyContextContract &&
      !!execution.policyContextHash &&
      !!execution.policyEvaluatedAt &&
      !!execution.policyEvidenceJson &&
      materialPolicyEvidence(execution.policyEvidenceJson, durableResume) ===
        materialPolicyEvidence(policy.policyEvidenceJson, durableResume)
    );
  }

  private result(
    request: CanonicalApprovalAuthorizationRequestV1,
    policy: CanonicalActionPolicyResolutionV1,
    overrides: Partial<CanonicalApprovalAuthorizationResultV1> &
      Pick<CanonicalApprovalAuthorizationResultV1, 'status' | 'reason'>,
  ): CanonicalApprovalAuthorizationResultV1 {
    return {
      contract: ACTION_APPROVAL_AUTHORIZATION_RESULT_CONTRACT,
      executionId: request.executionId,
      status: overrides.status,
      reason: overrides.reason,
      policyDecision: policy.policyDecision,
      approvalRequirement: policy.approvalRequirement,
      bindingMatches: overrides.bindingMatches ?? false,
      approvalConsumed: overrides.approvalConsumed ?? false,
      externalExecutionAllowed: overrides.externalExecutionAllowed ?? false,
      ...(overrides.claimPolicy ? { claimPolicy: overrides.claimPolicy } : {}),
    };
  }

  private assertRequest(
    request: CanonicalApprovalAuthorizationRequestV1,
  ): void {
    if (!request || Array.isArray(request) || typeof request !== 'object') {
      throw new ActionContractError(
        'Approval authorization request is invalid',
      );
    }
    const unexpected = Object.keys(request).filter(
      (key) => !ALLOWED_REQUEST_KEYS.has(key),
    );
    if (unexpected.length > 0) {
      throw new ActionContractError(
        `Approval authorization request contains authority or unknown fields: ${unexpected.sort().join(', ')}`,
      );
    }
    if (request.contract !== ACTION_APPROVAL_AUTHORIZATION_REQUEST_CONTRACT) {
      throw new ActionContractError(
        'Approval authorization request contract is invalid',
      );
    }
    assertOpaque(request.executionId, 'executionId');
    if (
      !request.action ||
      request.action.contract !== ACTION_POLICY_RESOLUTION_REQUEST_CONTRACT
    ) {
      throw new ActionContractError(
        'Approval authorization action contract is invalid',
      );
    }
  }
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && !Array.isArray(value) && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

export function materialPolicyEvidence(
  evidence: Record<string, unknown>,
  durableResume = false,
): string {
  const entitlement = readRecord(evidence.entitlement);
  const approval = readRecord(evidence.approval);
  return stableActionJson({
    ...evidence,
    ...(durableResume && entitlement
      ? { entitlement: { ...entitlement, validUntil: undefined } }
      : {}),
    evaluatedAt: undefined,
    validUntil: undefined,
    ...(approval
      ? {
          approval: {
            ...approval,
            bindingExpiresAt: undefined,
          },
        }
      : {}),
  });
}

function assertOpaque(value: string, label: string): void {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > 240
  ) {
    throw new ActionContractError(`${label} must be an opaque reference`);
  }
}
