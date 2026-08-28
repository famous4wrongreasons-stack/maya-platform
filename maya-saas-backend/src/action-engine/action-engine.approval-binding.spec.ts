import {
  ActionApprovalDecision,
  ActionExecutionState,
  ActionPolicyDecision,
  type PrismaClient,
} from '@prisma/client';

import { UserRole } from '../common/domain.enums';
import type { MayaFeatureKey } from '../common/feature-catalog';
import {
  FEATURE_REQUIREMENT_DECISION_CONTRACT,
  type EntitlementsService,
} from '../entitlements/entitlements.service';
import {
  ACTION_APPROVAL_AUTHORIZATION_REQUEST_CONTRACT,
  CanonicalApprovalBindingService,
  type CanonicalApprovalBindingRepository,
  type CanonicalApprovalExecutionRecordV1,
} from './action-engine.approval-binding';
import {
  ACTION_POLICY_RESOLUTION_REQUEST_CONTRACT,
  CanonicalActionPolicyRegistry,
  CanonicalActionPolicyResolver,
  type ActionPolicyResolutionRequestV1,
  type CanonicalActionPolicyDefinitionV1,
  type CanonicalActionPolicyResolutionV1,
} from './action-engine.policy-resolver';
import { ActionCapabilityRegistry } from './action-engine.registry';

const NOW = new Date('2026-08-29T13:00:00.000Z');
const NORMALIZED_INPUT_HASH = 'a'.repeat(64);
const CHANGED_INPUT_HASH = 'b'.repeat(64);
const ATTESTATION_SECRET = 'package-3-approval-binding-test-secret-20260829';

const approvalPolicy: CanonicalActionPolicyDefinitionV1 = {
  capability: 'kernel.test.approval',
  policyProfileKey: 'canonical.test.approval',
  policyProfileVersion: 1,
  actorPolicy: 'REQUIRED',
  allowedActorRoles: [UserRole.TENANT_OWNER],
  trustedServiceSourceTypes: [],
  requiredFeatures: [],
  permissionCodes: ['tenant.active', 'membership.active', 'test.approve'],
  approverPolicyKey: 'tenant-owner',
  validityMs: 5 * 60 * 1_000,
};

const safePolicy: CanonicalActionPolicyDefinitionV1 = {
  ...approvalPolicy,
  capability: 'kernel.test.safe-retry',
  policyProfileKey: 'canonical.test.safe',
  approverPolicyKey: 'none',
};

const shadowPolicy: CanonicalActionPolicyDefinitionV1 = {
  ...approvalPolicy,
  capability: 'client-lifecycle.reactivation-review.prepare',
  policyProfileKey: 'canonical.client-lifecycle.shadow',
  approverPolicyKey: 'none',
};

const variantPolicy: CanonicalActionPolicyDefinitionV1 = {
  ...approvalPolicy,
  capability: 'kernel.test.approval.variant',
  policyProfileKey: 'canonical.test.approval-variant',
};

const baseRequest = (): ActionPolicyResolutionRequestV1 => ({
  contract: ACTION_POLICY_RESOLUTION_REQUEST_CONTRACT,
  tenantId: 'tenant-a',
  capability: 'kernel.test.approval',
  sourceType: 'synthetic_shadow',
  sourceRef: 'source-a',
  actorUserId: 'user-a',
  targetRef: 'target-a',
  normalizedInputHash: NORMALIZED_INPUT_HASH,
});

class FakeApprovalRepository implements CanonicalApprovalBindingRepository {
  findCalls = 0;
  consumeCalls = 0;

  constructor(public record: CanonicalApprovalExecutionRecordV1 | null) {}

  findExecution(): Promise<CanonicalApprovalExecutionRecordV1 | null> {
    this.findCalls += 1;
    return Promise.resolve(this.record);
  }

  consumeApprovedExecution(input: {
    tenantId: string;
    executionId: string;
    expectedRevision: number;
    expectedPolicyContextHash: string;
    expectedApprovalBindingHash: string;
    consumedAt: Date;
  }): Promise<boolean> {
    this.consumeCalls += 1;
    if (
      !this.record ||
      this.record.tenantId !== input.tenantId ||
      this.record.id !== input.executionId ||
      this.record.revision !== input.expectedRevision ||
      this.record.state !== ActionExecutionState.READY ||
      this.record.approvalDecision !== ActionApprovalDecision.APPROVED ||
      this.record.policyContextHash !== input.expectedPolicyContextHash ||
      this.record.approvalBindingHash !== input.expectedApprovalBindingHash
    ) {
      return Promise.resolve(false);
    }
    this.record = {
      ...this.record,
      state: ActionExecutionState.EXECUTING,
      revision: this.record.revision + 1,
    };
    return Promise.resolve(true);
  }
}

function buildHarness() {
  const state = { planId: 'plan-a', now: NOW };
  const baseCapabilities = new ActionCapabilityRegistry();
  const variantCapability = {
    ...baseCapabilities.get('kernel.test.approval'),
    capability: 'kernel.test.approval.variant',
    actionClass: 'kernel_approval_variant',
  };
  const capabilityRegistry = {
    get(capability: string) {
      return capability === variantCapability.capability
        ? variantCapability
        : baseCapabilities.get(capability);
    },
  } as unknown as ActionCapabilityRegistry;
  const prisma = {
    tenant: {
      findUnique: jest.fn((query: { where: { id: string } }) =>
        Promise.resolve({
          id: query.where.id,
          status: 'active',
          planId: state.planId,
          trialEndsAt: null,
          trialFullAccess: false,
          currentPeriodEnd: new Date('2026-09-29T13:00:00.000Z'),
          pastDueAt: null,
          graceEndsAt: null,
          updatedAt: new Date('2026-08-29T12:30:00.000Z'),
        }),
      ),
    },
    membership: {
      findUnique: jest.fn(
        (query: {
          where: { userId_tenantId: { tenantId: string; userId: string } };
        }) =>
          Promise.resolve({
            id: `membership:${query.where.userId_tenantId.tenantId}:${query.where.userId_tenantId.userId}`,
            userId: query.where.userId_tenantId.userId,
            role: 'tenant_owner',
            status: 'active',
            branchId: 'branch-a',
            updatedAt: new Date('2026-08-29T12:45:00.000Z'),
            user: { status: 'active' },
          }),
      ),
    },
  } as unknown as Pick<PrismaClient, 'tenant' | 'membership'>;
  const entitlements = {
    resolveFeatureRequirements: jest.fn(
      (tenantId: string, requiredFeatures: readonly MayaFeatureKey[]) =>
        Promise.resolve({
          contract: FEATURE_REQUIREMENT_DECISION_CONTRACT,
          tenantId,
          planId: state.planId,
          requiredFeatures: requiredFeatures.map((featureKey) => ({
            featureKey,
            enabled: true,
          })),
          allowed: true,
          evaluatedAt: state.now,
          validUntil: new Date('2026-08-29T13:10:00.000Z'),
        }),
    ),
  } as unknown as Pick<EntitlementsService, 'resolveFeatureRequirements'>;
  const resolver = new CanonicalActionPolicyResolver(
    prisma,
    entitlements,
    { attestationSecret: ATTESTATION_SECRET, now: () => state.now },
    new CanonicalActionPolicyRegistry([
      approvalPolicy,
      safePolicy,
      shadowPolicy,
      variantPolicy,
    ]),
    capabilityRegistry,
  );

  return { resolver, state };
}

function approvalRecord(
  request: ActionPolicyResolutionRequestV1,
  policy: CanonicalActionPolicyResolutionV1,
  overrides?: Partial<CanonicalApprovalExecutionRecordV1>,
): CanonicalApprovalExecutionRecordV1 {
  const capability = policy.policyEvidenceJson.capability as {
    key: string;
    version: number;
    actionClass: string;
    targetKind: string;
  };
  return {
    id: 'execution-a',
    tenantId: request.tenantId,
    sourceType: request.sourceType,
    sourceRef: request.sourceRef,
    actorUserId: request.actorUserId ?? null,
    actionClass: capability.actionClass,
    capability: capability.key,
    capabilityVersion: capability.version,
    targetKind: capability.targetKind,
    targetRef: request.targetRef,
    normalizedInputHash: request.normalizedInputHash,
    policyKey: policy.policyKey,
    policyVersion: policy.policyVersion,
    policyDecision: policy.policyDecision,
    policyContextContract: policy.policyContextContract,
    policyContextHash: policy.policyContextHash,
    policyEvidenceJson: policy.policyEvidenceJson,
    policyEvaluatedAt: policy.policyEvaluatedAt,
    policyValidUntil: policy.policyValidUntil,
    approvalRequirement: policy.approvalRequirement,
    approvalDecision: ActionApprovalDecision.APPROVED,
    approvalBindingHash: policy.approvalBindingHash,
    approvalExpiresAt: policy.approvalBindingExpiresAt,
    approvalDecidedAt: new Date('2026-08-29T12:59:00.000Z'),
    approvalDecidedByUserId: 'approver-a',
    state: ActionExecutionState.READY,
    revision: 3,
    ...overrides,
  };
}

async function readyService() {
  const { resolver, state } = buildHarness();
  const request = baseRequest();
  const policy = await resolver.resolve(request);
  const repository = new FakeApprovalRepository(
    approvalRecord(request, policy),
  );
  const service = new CanonicalApprovalBindingService(resolver, repository, {
    now: () => state.now,
  });
  return { resolver, state, request, policy, repository, service };
}

function authorizationRequest(action = baseRequest()) {
  return {
    contract: ACTION_APPROVAL_AUTHORIZATION_REQUEST_CONTRACT,
    executionId: 'execution-a',
    action,
  };
}

describe('CanonicalApprovalBindingService', () => {
  it('valid approval matches the canonical binding and is consumed once', async () => {
    const { service, repository } = await readyService();

    await expect(
      service.authorizeForClaim(authorizationRequest()),
    ).resolves.toMatchObject({
      status: 'AUTHORIZED',
      reason: 'APPROVAL_BOUND_AND_CONSUMED',
      bindingMatches: true,
      approvalConsumed: true,
      externalExecutionAllowed: true,
    });
    expect(repository.consumeCalls).toBe(1);
  });

  it('keeps an unchanged approval valid across evaluation-time drift', async () => {
    const { service, repository, state } = await readyService();
    state.now = new Date('2026-08-29T13:01:00.000Z');

    const result = await service.authorizeForClaim(authorizationRequest());

    expect(result).toMatchObject({
      status: 'AUTHORIZED',
      bindingMatches: true,
      externalExecutionAllowed: true,
    });
    expect(repository.consumeCalls).toBe(1);
  });

  it('rejects a changed target', async () => {
    const { service, repository } = await readyService();
    const result = await service.authorizeForClaim(
      authorizationRequest({ ...baseRequest(), targetRef: 'target-b' }),
    );

    expect(result.reason).toBe('APPROVAL_SUBJECT_MISMATCH');
    expect(result.externalExecutionAllowed).toBe(false);
    expect(repository.consumeCalls).toBe(0);
  });

  it('rejects a changed normalized payload', async () => {
    const { service, repository } = await readyService();
    const result = await service.authorizeForClaim(
      authorizationRequest({
        ...baseRequest(),
        normalizedInputHash: CHANGED_INPUT_HASH,
      }),
    );

    expect(result.reason).toBe('APPROVAL_SUBJECT_MISMATCH');
    expect(repository.consumeCalls).toBe(0);
  });

  it('rejects a different tenant even if a repository leaks the old row', async () => {
    const { service, repository } = await readyService();
    const result = await service.authorizeForClaim(
      authorizationRequest({ ...baseRequest(), tenantId: 'tenant-b' }),
    );

    expect(result.reason).toBe('APPROVAL_SUBJECT_MISMATCH');
    expect(repository.consumeCalls).toBe(0);
  });

  it('rejects a different requester membership', async () => {
    const { service, repository } = await readyService();
    const result = await service.authorizeForClaim(
      authorizationRequest({ ...baseRequest(), actorUserId: 'user-b' }),
    );

    expect(result.reason).toBe('APPROVAL_SUBJECT_MISMATCH');
    expect(repository.consumeCalls).toBe(0);
  });

  it('rejects reuse for another capability and action class', async () => {
    const { service, repository } = await readyService();
    const result = await service.authorizeForClaim(
      authorizationRequest({
        ...baseRequest(),
        capability: 'kernel.test.approval.variant',
      }),
    );

    expect(result.reason).toBe('APPROVAL_SUBJECT_MISMATCH');
    expect(repository.consumeCalls).toBe(0);
  });

  it('rejects a changed server-derived policy context', async () => {
    const { service, repository, state } = await readyService();
    state.planId = 'plan-b';

    const result = await service.authorizeForClaim(authorizationRequest());

    expect(result.reason).toBe('APPROVAL_SUBJECT_MISMATCH');
    expect(repository.consumeCalls).toBe(0);
  });

  it('rejects expired and revoked approvals', async () => {
    for (const overrides of [
      {
        approvalExpiresAt: new Date('2026-08-29T12:59:59.000Z'),
      },
      {
        approvalDecision: ActionApprovalDecision.REJECTED,
      },
    ]) {
      const ready = await readyService();
      ready.repository.record = {
        ...ready.repository.record!,
        ...overrides,
      };
      const result = await ready.service.authorizeForClaim(
        authorizationRequest(),
      );
      expect(result.status).toBe('REJECTED');
      expect(result.externalExecutionAllowed).toBe(false);
      expect(ready.repository.consumeCalls).toBe(0);
    }
  });

  it('rejects caller-forged approval authority and binding values', async () => {
    const { service, repository } = await readyService();
    await expect(
      service.authorizeForClaim({
        ...authorizationRequest(),
        approved: true,
      } as never),
    ).rejects.toThrow(/authority or unknown fields/);
    await expect(
      service.authorizeForClaim({
        ...authorizationRequest(),
        action: {
          ...baseRequest(),
          approvalBindingHash: 'f'.repeat(64),
        },
      } as never),
    ).rejects.toThrow(/authority or unknown fields/);
    expect(repository.findCalls).toBe(0);
  });

  it('rejects a forged durable binding even when marked approved', async () => {
    const ready = await readyService();
    ready.repository.record = {
      ...ready.repository.record!,
      approvalBindingHash: 'f'.repeat(64),
    };

    const result = await ready.service.authorizeForClaim(
      authorizationRequest(),
    );

    expect(result.reason).toBe('APPROVAL_SUBJECT_MISMATCH');
    expect(ready.repository.consumeCalls).toBe(0);
  });

  it('does not create an approval dependency when approval is not required', async () => {
    const { resolver } = buildHarness();
    const repository = new FakeApprovalRepository(null);
    const service = new CanonicalApprovalBindingService(resolver, repository, {
      now: () => NOW,
    });
    const result = await service.authorizeForClaim(
      authorizationRequest({
        ...baseRequest(),
        capability: 'kernel.test.safe-retry',
      }),
    );

    expect(result).toMatchObject({
      status: 'NOT_REQUIRED',
      reason: 'APPROVAL_NOT_REQUIRED',
      approvalConsumed: false,
      externalExecutionAllowed: true,
    });
    expect(repository.findCalls).toBe(0);
    expect(repository.consumeCalls).toBe(0);
  });

  it('keeps L2.5 Shadow non-executable after policy evaluation', async () => {
    const { resolver } = buildHarness();
    const repository = new FakeApprovalRepository(null);
    const service = new CanonicalApprovalBindingService(resolver, repository, {
      now: () => NOW,
    });
    const result = await service.authorizeForClaim(
      authorizationRequest({
        ...baseRequest(),
        capability: 'client-lifecycle.reactivation-review.prepare',
        sourceType: 'agent_task',
      }),
    );

    expect(result).toMatchObject({
      status: 'REJECTED',
      reason: 'POLICY_NOT_EXTERNALLY_EXECUTABLE',
      policyDecision: ActionPolicyDecision.SHADOW_ONLY,
      externalExecutionAllowed: false,
    });
    expect(repository.findCalls).toBe(0);
    expect(repository.consumeCalls).toBe(0);
  });

  it('rejects repeat use after the atomic execution claim wins once', async () => {
    const { service, repository } = await readyService();

    const first = await service.authorizeForClaim(authorizationRequest());
    const second = await service.authorizeForClaim(authorizationRequest());

    expect(first.status).toBe('AUTHORIZED');
    expect(second).toMatchObject({
      status: 'REJECTED',
      reason: 'APPROVAL_ALREADY_CONSUMED_OR_STALE',
      bindingMatches: true,
      externalExecutionAllowed: false,
    });
    expect(repository.consumeCalls).toBe(1);
  });
});
