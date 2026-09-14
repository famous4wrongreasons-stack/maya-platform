import {
  ActionApprovalDecision,
  ActionExecutionState,
  ActionPolicyDecision,
  type ActionExecution,
  type Prisma,
  type PrismaClient,
} from '@prisma/client';

import {
  FEATURE_REQUIREMENT_DECISION_CONTRACT,
  type EntitlementsService,
} from '../entitlements/entitlements.service';
import { ACTION_EXECUTION_REQUEST_CONTRACT } from './action-engine.contract';
import { ActionEngineKernel } from './action-engine.kernel';
import {
  CanonicalActionPolicyRegistry,
  CanonicalActionPolicyResolver,
  type CanonicalActionPolicyDefinitionV1,
} from './action-engine.policy-resolver';
import { ActionCapabilityRegistry } from './action-engine.registry';

const NOW = new Date('2026-08-29T15:00:00.000Z');
const SECRET = 'canonical-kernel-targeted-test-secret-20260829';

const policyDefinition: CanonicalActionPolicyDefinitionV1 = {
  capability: 'kernel.test.safe-retry',
  policyProfileKey: 'canonical.kernel.safe-retry',
  policyProfileVersion: 1,
  actorPolicy: 'OPTIONAL_TRUSTED_SERVICE',
  allowedActorRoles: [],
  trustedServiceSourceTypes: ['synthetic_shadow'],
  requiredFeatures: [],
  permissionCodes: ['tenant.active', 'fixture.bound'],
  approverPolicyKey: 'none',
  validityMs: 60_000,
};

const request = () => ({
  contract: ACTION_EXECUTION_REQUEST_CONTRACT,
  tenantId: 'tenant-a',
  capability: 'kernel.test.safe-retry',
  source: {
    type: 'synthetic_shadow' as const,
    occurrenceScope: 'fixture-a',
    sourceRef: 'fixture-a',
  },
  targetRef: 'target-a',
  input: { valueRef: 'value-a' },
  evidenceRefs: [],
});

function buildHarness(options?: { controlledFixtureMode?: boolean }) {
  let createdData: Prisma.ActionExecutionUncheckedCreateInput | undefined;
  let lockedExecution: ActionExecution | null = null;
  const actionExecution = {
    findUnique: jest.fn(() => Promise.resolve(null)),
    findUniqueOrThrow: jest.fn(() => Promise.resolve(lockedExecution!)),
    create: jest.fn(
      ({ data }: { data: Prisma.ActionExecutionUncheckedCreateInput }) => {
        createdData = data;
        return Promise.resolve({
          ...data,
          createdAt: NOW,
          updatedAt: NOW,
        } as unknown as ActionExecution);
      },
    ),
  };
  const transactionClient = {
    actionExecution,
    membership: { findUnique: jest.fn(() => Promise.resolve(null)) },
    $queryRaw: jest.fn(() =>
      Promise.resolve(lockedExecution ? [{ id: lockedExecution.id }] : []),
    ),
  };
  const tenantFindUnique = jest.fn((query: { where: { id: string } }) =>
    Promise.resolve({
      id: query.where.id,
      status: 'active',
      planId: null,
      trialEndsAt: null,
      trialFullAccess: false,
      currentPeriodEnd: new Date('2026-09-29T15:00:00.000Z'),
      pastDueAt: null,
      graceEndsAt: null,
      updatedAt: new Date('2026-08-29T14:30:00.000Z'),
    }),
  );
  const transaction = jest.fn(
    (callback: (tx: typeof transactionClient) => Promise<ActionExecution>) =>
      callback(transactionClient),
  );
  const prisma = {
    tenant: { findUnique: tenantFindUnique },
    membership: transactionClient.membership,
    actionExecution,
    $transaction: transaction,
  } as unknown as PrismaClient;
  const entitlements = {
    resolveFeatureRequirements: jest.fn((tenantId: string) =>
      Promise.resolve({
        contract: FEATURE_REQUIREMENT_DECISION_CONTRACT,
        tenantId,
        planId: null,
        requiredFeatures: [],
        allowed: true,
        evaluatedAt: NOW,
        validUntil: new Date('2026-08-29T15:10:00.000Z'),
      }),
    ),
  } as unknown as Pick<EntitlementsService, 'resolveFeatureRequirements'>;
  const capabilities = new ActionCapabilityRegistry();
  const resolver = new CanonicalActionPolicyResolver(
    prisma,
    entitlements,
    { attestationSecret: SECRET, now: () => NOW },
    new CanonicalActionPolicyRegistry([policyDefinition]),
    capabilities,
  );
  const kernel = new ActionEngineKernel(
    prisma,
    {
      identitySecret: SECRET,
      payloadEncryptionSecret: `${SECRET}:payload`,
      now: () => NOW,
      controlledFixtureMode: options?.controlledFixtureMode,
    },
    capabilities,
    resolver,
  );
  return {
    kernel,
    resolver,
    transaction,
    created: () => createdData,
    lockExecution: (execution: ActionExecution) => {
      lockedExecution = execution;
    },
  };
}

describe('ActionEngineKernel canonical creation gate', () => {
  it('persists complete canonical attestation before a READY execution exists', async () => {
    const harness = buildHarness();
    const policyRequest = {
      contract: 'maya.action-policy-resolution-request/1' as const,
      tenantId: 'tenant-a',
      capability: 'kernel.test.safe-retry',
      sourceType: 'synthetic_shadow' as const,
      sourceRef: 'fixture-a',
      targetRef: 'target-a',
      normalizedInputHash:
        harness.kernel.previewExecution(request()).normalizedInputHash,
    };
    const policy = await harness.resolver.resolve(policyRequest);

    await harness.kernel.createCanonicalExecution(request(), policy);

    expect(harness.created()).toMatchObject({
      state: ActionExecutionState.READY,
      approvalDecision: ActionApprovalDecision.NOT_REQUIRED,
      policyDecidedBy: 'canonical_action_policy_resolver',
      policyContextContract: 'maya.action-policy-context/1',
      policyContextHash: policy.policyContextHash,
      policyEvaluatedAt: NOW,
      policyValidUntil: policy.policyValidUntil,
      approvalBindingHash: policy.approvalBindingHash,
    });
    expect(harness.created()?.policyEvidenceJson).toBeDefined();
  });

  it('rejects a forged policy binding before opening a create transaction', async () => {
    const harness = buildHarness();
    const normalizedInputHash =
      harness.kernel.previewExecution(request()).normalizedInputHash;
    const policy = await harness.resolver.resolve({
      contract: 'maya.action-policy-resolution-request/1',
      tenantId: 'tenant-a',
      capability: 'kernel.test.safe-retry',
      sourceType: 'synthetic_shadow',
      sourceRef: 'fixture-a',
      targetRef: 'target-a',
      normalizedInputHash,
    });

    await expect(
      harness.kernel.createCanonicalExecution(request(), {
        ...policy,
        approvalBindingHash: 'f'.repeat(64),
      }),
    ).rejects.toThrow(/attestation is missing or invalid/);
    await expect(
      harness.kernel.createCanonicalExecution(request(), {
        ...policy,
        policyDecision: ActionPolicyDecision.DENY,
      }),
    ).rejects.toThrow(/does not match capability invariants/);
    expect(harness.transaction).not.toHaveBeenCalled();
  });

  it('keeps the direct fixture creator disabled unless explicitly enabled', async () => {
    expect(() =>
      buildHarness().kernel.createExecutionForControlledFixture(request()),
    ).toThrow(/disabled outside proof\/test harnesses/);

    const controlled = buildHarness({ controlledFixtureMode: true });
    await expect(
      controlled.kernel.createExecutionForControlledFixture(request()),
    ).resolves.toBeDefined();
    expect(controlled.created()?.policyContextHash).toBeUndefined();
  });

  it('fails closed before approving an execution without canonical binding', async () => {
    const harness = buildHarness();
    harness.lockExecution({
      id: 'execution-without-binding',
      tenantId: 'tenant-a',
      state: ActionExecutionState.PENDING_APPROVAL,
      approvalDecision: ActionApprovalDecision.PENDING,
      approvalRequirement: 'REQUIRED',
      approvalExpiresAt: new Date('2026-08-29T15:01:00.000Z'),
      policyContextHash: null,
      policyEvidenceJson: null,
      policyEvaluatedAt: null,
      policyValidUntil: null,
      approvalBindingHash: null,
    } as ActionExecution);

    await expect(
      harness.kernel.decideApproval({
        tenantId: 'tenant-a',
        executionId: 'execution-without-binding',
        approverUserId: 'approver-a',
        decision: ActionApprovalDecision.APPROVED,
      }),
    ).rejects.toMatchObject({
      code: 'CANONICAL_APPROVAL_BINDING_REQUIRED',
    });
  });
});
