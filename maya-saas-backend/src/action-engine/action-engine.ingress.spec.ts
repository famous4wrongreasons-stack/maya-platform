import {
  ActionPolicyDecision,
  type ActionExecution,
  type PrismaClient,
} from '@prisma/client';

import {
  FEATURE_REQUIREMENT_DECISION_CONTRACT,
  type EntitlementsService,
} from '../entitlements/entitlements.service';
import type { MayaFeatureKey } from '../common/feature-catalog';
import {
  ACTION_EXECUTION_PREVIEW_CONTRACT,
  ACTION_EXECUTION_REQUEST_CONTRACT,
  type ActionExecutionPreviewV1,
  type TrustedActionExecutionRequestV1,
} from './action-engine.contract';
import { CanonicalActionIngressService } from './action-engine.ingress';
import type { ActionEngineKernel } from './action-engine.kernel';
import {
  canonicalProductionPolicyDefinitions,
  createCanonicalProductionPolicyRegistry,
} from './action-engine.policy-registry';
import {
  CanonicalActionPolicyResolver,
  type CanonicalActionPolicyResolutionV1,
} from './action-engine.policy-resolver';
import { ActionCapabilityRegistry } from './action-engine.registry';

const NOW = new Date('2026-08-29T14:00:00.000Z');
const HASH = 'a'.repeat(64);
const SECRET = 'canonical-ingress-targeted-test-secret-20260829';

const appointmentRequest = (): TrustedActionExecutionRequestV1 => ({
  contract: ACTION_EXECUTION_REQUEST_CONTRACT,
  tenantId: 'tenant-a',
  capability: 'crm.appointment.create.v1',
  source: {
    type: 'authenticated_request',
    occurrenceScope: 'request-a',
    sourceRef: 'request-a',
    actorUserId: 'user-a',
  },
  targetRef: 'appointment-a',
  input: { callerData: 'normalized only by the trusted kernel' },
  evidenceRefs: [],
});

function preview(
  overrides?: Partial<ActionExecutionPreviewV1>,
): ActionExecutionPreviewV1 {
  return {
    contract: ACTION_EXECUTION_PREVIEW_CONTRACT,
    tenantId: 'tenant-a',
    sourceType: 'authenticated_request',
    capability: 'crm.appointment.create.v1',
    capabilityVersion: 1,
    actionClass: 'create_appointment',
    targetKind: 'appointment',
    targetRef: 'appointment-a',
    normalizedInputHash: HASH,
    identityFingerprint: 'b'.repeat(64),
    policyKey: 'production.create_appointment.confirmed-request',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.ALLOW,
    autonomyLevel: 'L2_CONFIRMED_REQUEST',
    approvalRequirement: 'NONE',
    executorKey: 'crm.appointment.create',
    executorVersion: 1,
    externalSideEffects: 0,
    ...overrides,
  };
}

function buildHarness(options?: { role?: string }) {
  const capabilities = new ActionCapabilityRegistry();
  const tenantFindUnique = jest.fn((query: { where: { id: string } }) =>
    Promise.resolve({
      id: query.where.id,
      status: 'active',
      planId: 'plan-a',
      trialEndsAt: null,
      trialFullAccess: false,
      currentPeriodEnd: new Date('2026-09-29T14:00:00.000Z'),
      pastDueAt: null,
      graceEndsAt: null,
      updatedAt: new Date('2026-08-29T13:30:00.000Z'),
    }),
  );
  const membershipFindUnique = jest.fn(
    (query: {
      where: { userId_tenantId: { tenantId: string; userId: string } };
    }) =>
      Promise.resolve({
        id: `membership:${query.where.userId_tenantId.tenantId}:${query.where.userId_tenantId.userId}`,
        userId: query.where.userId_tenantId.userId,
        role: options?.role ?? 'tenant_owner',
        status: 'active',
        branchId: 'branch-a',
        updatedAt: new Date('2026-08-29T13:45:00.000Z'),
        user: { status: 'active' },
      }),
  );
  const prisma = {
    tenant: { findUnique: tenantFindUnique },
    membership: { findUnique: membershipFindUnique },
  } as unknown as Pick<PrismaClient, 'tenant' | 'membership'>;
  const resolveFeatureRequirements = jest.fn(
    (tenantId: string, requiredFeatures: readonly MayaFeatureKey[]) =>
      Promise.resolve({
        contract: FEATURE_REQUIREMENT_DECISION_CONTRACT,
        tenantId,
        planId: 'plan-a',
        requiredFeatures: requiredFeatures.map((featureKey) => ({
          featureKey,
          enabled: true,
        })),
        allowed: true,
        evaluatedAt: NOW,
        validUntil: new Date('2026-08-29T14:10:00.000Z'),
      }),
  );
  const entitlements = {
    resolveFeatureRequirements,
  } as unknown as Pick<EntitlementsService, 'resolveFeatureRequirements'>;
  const resolver = new CanonicalActionPolicyResolver(
    prisma,
    entitlements,
    { attestationSecret: SECRET, now: () => NOW },
    createCanonicalProductionPolicyRegistry(capabilities),
    capabilities,
  );
  const execution = { id: 'execution-a' } as ActionExecution;
  const previewExecution: jest.MockedFunction<
    ActionEngineKernel['previewExecution']
  > = jest.fn((kernelRequest: TrustedActionExecutionRequestV1) => {
    void kernelRequest;
    return preview();
  });
  const createCanonicalExecution: jest.MockedFunction<
    ActionEngineKernel['createCanonicalExecution']
  > = jest.fn(
    (
      kernelRequest: TrustedActionExecutionRequestV1,
      policy: CanonicalActionPolicyResolutionV1,
    ) => {
      void kernelRequest;
      void policy;
      return Promise.resolve(execution);
    },
  );
  const kernel = {
    previewExecution,
    createCanonicalExecution,
  } as unknown as ActionEngineKernel;
  const ingress = new CanonicalActionIngressService(kernel, resolver);
  return {
    ingress,
    kernel: { previewExecution, createCanonicalExecution },
    execution,
    tenantFindUnique,
    membershipFindUnique,
    resolveFeatureRequirements,
  };
}

describe('CanonicalActionIngressService', () => {
  it('registers every non-fixture capability and excludes kernel fixtures', () => {
    const capabilities = new ActionCapabilityRegistry();
    const definitions = canonicalProductionPolicyDefinitions(capabilities);
    const expected = capabilities
      .list()
      .map((capability) => capability.capability)
      .filter((capability) => !capability.startsWith('kernel.test.'))
      .sort();

    expect(
      definitions.map((definition) => definition.capability).sort(),
    ).toEqual(expected);
    expect(
      definitions.some((definition) =>
        definition.capability.startsWith('kernel.test.'),
      ),
    ).toBe(false);
  });

  it('derives policy and entitlement server-side before kernel creation', async () => {
    const harness = buildHarness();
    const request = appointmentRequest();

    await expect(harness.ingress.createExecution(request)).resolves.toBe(
      harness.execution,
    );

    expect(harness.kernel.createCanonicalExecution).toHaveBeenCalledTimes(1);
    const policy = harness.kernel.createCanonicalExecution.mock.calls[0]?.[1];
    expect(policy).toMatchObject({
      policyDecidedBy: 'canonical_action_policy_resolver',
      policyDecision: ActionPolicyDecision.ALLOW,
      autonomyLevel: 'L2_CONFIRMED_REQUEST',
      approvalRequirement: 'NONE',
    });
    expect(policy?.policyContextHash).toMatch(/^[a-f0-9]{64}$/);
    expect(policy?.approvalBindingHash).toMatch(/^[a-f0-9]{64}$/);
    expect(harness.tenantFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tenant-a' } }),
    );
    expect(harness.membershipFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_tenantId: { tenantId: 'tenant-a', userId: 'user-a' },
        },
      }),
    );
    expect(harness.resolveFeatureRequirements).toHaveBeenCalledWith(
      'tenant-a',
      ['crm.integration'],
      NOW,
    );
  });

  it('rejects initiator-supplied authority before normalization or state reads', async () => {
    const harness = buildHarness();
    for (const field of [
      'entitled',
      'approved',
      'autonomy',
      'policyDecision',
      'executor',
      'approvalBindingHash',
      'policyContextHash',
    ]) {
      await expect(
        harness.ingress.createExecution({
          ...appointmentRequest(),
          [field]: field === 'approved',
        }),
      ).rejects.toThrow(/authority or unknown fields/);
    }
    await expect(
      harness.ingress.createExecution({
        ...appointmentRequest(),
        source: { ...appointmentRequest().source, role: 'tenant_owner' },
      } as never),
    ).rejects.toThrow(/authority or unknown fields/);
    expect(harness.kernel.previewExecution).not.toHaveBeenCalled();
    expect(harness.tenantFindUnique).not.toHaveBeenCalled();
  });

  it('persists a server-derived denial instead of accepting the initiator role', async () => {
    const harness = buildHarness({ role: 'platform_admin' });
    const result = await harness.ingress.preview(appointmentRequest());

    expect(result.policyDecision).toBe(ActionPolicyDecision.DENY);
    expect(result.autonomyLevel).toBe('L2_CONFIRMED_REQUEST');
  });

  it('allows L2.5 Shadow policy calculation without upgrading it to ALLOW', async () => {
    const harness = buildHarness();
    const shadowRequest: TrustedActionExecutionRequestV1 = {
      ...appointmentRequest(),
      capability: 'client-lifecycle.reactivation-review.prepare',
      source: {
        type: 'agent_task',
        occurrenceScope: 'task-a',
        sourceRef: 'task-a',
        agentTaskId: 'task-a',
      },
      targetRef: 'client-a',
      input: { clientRef: 'client-a' },
    };
    harness.kernel.previewExecution.mockReturnValue(
      preview({
        sourceType: 'agent_task',
        capability: 'client-lifecycle.reactivation-review.prepare',
        actionClass: 'prepare_reactivation_review',
        targetKind: 'client',
        targetRef: 'client-a',
        policyKey: 'chapter5.l2_5-shadow',
        policyDecision: ActionPolicyDecision.SHADOW_ONLY,
        autonomyLevel: 'L2_5_SHADOW',
        executorKey: 'shadow.none',
      }),
    );

    const result = await harness.ingress.preview(shadowRequest);

    expect(result).toMatchObject({
      policyDecision: ActionPolicyDecision.SHADOW_ONLY,
      autonomyLevel: 'L2_5_SHADOW',
      executorKey: 'shadow.none',
      externalSideEffects: 0,
    });
    expect(harness.membershipFindUnique).not.toHaveBeenCalled();
  });

  it('fails closed when no durable server source reference exists', async () => {
    const harness = buildHarness();
    const request = appointmentRequest();
    delete request.source.sourceRef;

    await expect(harness.ingress.createExecution(request)).rejects.toThrow(
      /durable server-derived sourceRef/,
    );
    expect(harness.tenantFindUnique).not.toHaveBeenCalled();
    expect(harness.kernel.createCanonicalExecution).not.toHaveBeenCalled();
  });
});
