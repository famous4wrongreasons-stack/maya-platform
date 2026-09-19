/* eslint-disable @typescript-eslint/require-await */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  ActionApprovalDecision,
  ActionExecutionState,
  MembershipStatus,
  PrismaClient,
  UserRole,
} from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionContractError,
  ActionEngineKernel,
  ActionEngineRuntimeService,
  ActionExecutionUncertainError,
  type ActionRuntimeHandlers,
  type TrustedActionExecutionRequestV1,
  createStandaloneCanonicalActionEngineRuntime,
} from '../src/action-engine';
import { EntitlementsService } from '../src/entitlements/entitlements.service';
import { FeatureRegistryService } from '../src/entitlements/feature-registry.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const IDENTITY_SECRET =
  'cycle-06-b2-proof-identity-secret-never-used-outside-proof-databases';
const PAYLOAD_SECRET =
  'cycle-06-b2-proof-payload-secret-never-used-outside-proof-databases';
let currentProofStage = 'bootstrap';

function stage(name: string): void {
  currentProofStage = name;
}

class SyntheticUnknownError extends Error {}

interface AppointmentState {
  externalId: string;
  start: string;
  staffId: string;
  serviceIds: string[];
  status: string;
  clientId?: string;
}

interface SafeAppointmentResult extends Record<string, unknown> {
  external_id: string;
  status: string;
  start?: string;
}

function requireProofDatabaseUrl(): {
  connectionString: string;
  database: string;
} {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  const parsed = new URL(connectionString);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (
    !database.startsWith('maya_c06_appointment_') &&
    process.env.ACTION_ENGINE_APPOINTMENT_PROOF_ALLOW_DATABASE !== '1'
  ) {
    throw new Error(
      'Appointment proof refuses non-proof databases. Use maya_c06_appointment_*.',
    );
  }
  return { connectionString, database };
}

function opaque(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`;
}

function appointmentRequest(input: {
  tenantId: string;
  capability:
    | 'crm.appointment.create.v1'
    | 'crm.appointment.reschedule.v1'
    | 'crm.appointment.cancel.v1';
  targetRef: string;
  payload: Record<string, unknown>;
  sourceRef: string;
  actorUserId?: string;
  callerScope?: string;
  callerKey?: string;
}): TrustedActionExecutionRequestV1 {
  return {
    contract: ACTION_EXECUTION_REQUEST_CONTRACT,
    tenantId: input.tenantId,
    capability: input.capability,
    source: {
      type: 'authenticated_request',
      occurrenceScope: `appointment-mutation:${input.capability}:v1`,
      sourceRef: input.sourceRef,
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    },
    targetRef: input.targetRef,
    input: input.payload,
    evidenceRefs: [],
    ...(input.callerScope && input.callerKey
      ? {
          callerIdempotency: {
            scope: input.callerScope,
            key: input.callerKey,
          },
        }
      : {}),
  };
}

function syntheticApprovalRequest(
  tenantId: string,
): TrustedActionExecutionRequestV1 {
  return {
    contract: ACTION_EXECUTION_REQUEST_CONTRACT,
    tenantId,
    capability: 'kernel.test.approval',
    source: {
      type: 'synthetic_shadow',
      occurrenceScope: 'appointment-proof/rejected-approval',
      sourceRef: 'appointment-proof/rejected-approval',
    },
    targetRef: 'appointment-proof/rejected-approval',
    input: { valueRef: 'appointment-proof/rejected-approval' },
    evidenceRefs: [],
  };
}

function runtime(prisma: PrismaClient): ActionEngineRuntimeService {
  const service = prisma as unknown as PrismaService;
  return createStandaloneCanonicalActionEngineRuntime(
    service,
    new EntitlementsService(service, new FeatureRegistryService()),
    {
      identitySecret: IDENTITY_SECRET,
      payloadEncryptionSecret: PAYLOAD_SECRET,
    },
  );
}

function kernel(prisma: PrismaClient): ActionEngineKernel {
  return new ActionEngineKernel(prisma, {
    identitySecret: IDENTITY_SECRET,
    payloadEncryptionSecret: PAYLOAD_SECRET,
    executionLeaseMs: 250,
    reconciliationLeaseMs: 250,
    controlledFixtureMode: true,
  });
}

function handlers(input: {
  prepare?: (
    normalized: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | undefined>;
  dispatch: (
    normalized: Record<string, unknown>,
    transportKey: string,
  ) => Promise<SafeAppointmentResult>;
  reconcile: (
    normalized: Record<string, unknown>,
    previous?: Record<string, unknown>,
  ) => Promise<{
    outcome:
      | 'PROVEN_SUCCEEDED'
      | 'PROVEN_FAILED'
      | 'PROVEN_NOT_EXECUTED'
      | 'STILL_UNKNOWN';
    safeResult?: SafeAppointmentResult;
  }>;
}): ActionRuntimeHandlers<SafeAppointmentResult> {
  return {
    prepare: input.prepare,
    dispatch: async (normalized, transportKey) => {
      const value = await input.dispatch(normalized, transportKey);
      return { value, safeResult: value };
    },
    reconcile: input.reconcile,
    restore: (safe) => safe as SafeAppointmentResult,
    classifyError: (error) =>
      error instanceof SyntheticUnknownError
        ? {
            kind: 'unknown',
            outcomeCode: 'synthetic_transport_timeout',
            errorClass: 'synthetic_transport_timeout',
          }
        : {
            kind: 'definitive',
            outcomeCode: 'synthetic_definitive_failure',
            errorClass: 'synthetic_definitive_failure',
          },
  };
}

function createPayload(input: {
  clientId: string;
  start: string;
  staffId?: string;
  serviceIds?: string[];
}): Record<string, unknown> {
  return {
    clientId: input.clientId,
    clientName: 'Proof Client',
    clientPhone: '+70000000000',
    branchId: 'proof-branch',
    staffId: input.staffId ?? 'proof-staff',
    serviceIds: input.serviceIds ?? ['proof-service'],
    start: input.start,
    allowBusy: false,
  };
}

function safeResult(state: AppointmentState): SafeAppointmentResult {
  return {
    external_id: state.externalId,
    status: state.status,
    start: state.start,
  };
}

function matchesCreate(
  state: AppointmentState | undefined,
  normalized: Record<string, unknown>,
): boolean {
  return Boolean(
    state &&
    state.status !== 'canceled' &&
    state.clientId === normalized.clientId &&
    state.start === normalized.start &&
    state.staffId === normalized.staffId &&
    JSON.stringify(state.serviceIds) === JSON.stringify(normalized.serviceIds),
  );
}

function matchesDesired(
  state: AppointmentState | undefined,
  normalized: Record<string, unknown>,
): boolean {
  if (!state || state.start !== normalized.start) return false;
  if (normalized.staffId && state.staffId !== normalized.staffId) return false;
  if (
    normalized.serviceIds &&
    JSON.stringify(state.serviceIds) !== JSON.stringify(normalized.serviceIds)
  ) {
    return false;
  }
  return true;
}

async function createTenantAndOwner(
  prisma: PrismaClient,
  cleanupTenantIds: string[],
  label: string,
): Promise<{ tenantId: string; ownerId: string }> {
  const tenantId = opaque(`tenant_${label}`);
  const ownerId = opaque(`owner_${label}`);
  await prisma.tenant.create({
    data: {
      id: tenantId,
      name: `Appointment proof ${label}`,
      // A26 full-access trial pre-state. Production policy/entitlements stay real;
      // an unactivated/default trial cannot authorize a CRM write.
      status: 'trial',
      trialFullAccess: true,
      trialEndsAt: new Date(Date.now() + 86_400_000),
      slug: `${label}-${randomUUID()}`.toLowerCase(),
      users: {
        create: {
          id: ownerId,
          email: `${ownerId}@proof.invalid`,
          passwordHash: 'not-a-real-password-hash',
          role: UserRole.tenant_owner,
          memberships: {
            create: {
              tenantId,
              role: UserRole.tenant_owner,
              status: MembershipStatus.active,
            },
          },
        },
      },
    },
  });
  cleanupTenantIds.push(tenantId);
  return { tenantId, ownerId };
}

async function expectReject(
  operation: () => Promise<unknown>,
  errorType: new (...args: never[]) => Error,
): Promise<void> {
  let rejected = false;
  try {
    await operation();
  } catch (error) {
    rejected = true;
    assert(
      error instanceof errorType,
      `Expected ${errorType.name}, received ${error instanceof Error ? error.constructor.name + ': ' + error.message : String(error)}`,
    );
  }
  assert.equal(rejected, true);
}

async function main(): Promise<void> {
  const { connectionString, database } = requireProofDatabaseUrl();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  const cleanupTenantIds: string[] = [];
  const matrix: Record<string, boolean> = {};
  const providerState = new Map<string, AppointmentState>();
  const dispatchCounts = new Map<string, number>();
  const countDispatch = (key: string): number => {
    const count = (dispatchCounts.get(key) ?? 0) + 1;
    dispatchCounts.set(key, count);
    return count;
  };

  try {
    stage('create proof tenants');
    const primary = await createTenantAndOwner(
      prisma,
      cleanupTenantIds,
      'primary',
    );
    const secondary = await createTenantAndOwner(
      prisma,
      cleanupTenantIds,
      'secondary',
    );
    const firstRuntime = runtime(prisma);
    const proofKernel = kernel(prisma);

    const createStart = '2031-01-10T10:00:00.000Z';
    const createInput = createPayload({
      clientId: 'proof-client-create',
      start: createStart,
    });
    const createRequest = appointmentRequest({
      tenantId: primary.tenantId,
      capability: 'crm.appointment.create.v1',
      targetRef: 'create/proof-create-success',
      payload: createInput,
      sourceRef: 'http/create-success',
      actorUserId: primary.ownerId,
      callerScope: 'http.create',
      callerKey: 'create-success-http-key',
    });
    const createHandlers = handlers({
      dispatch: async (normalized) => {
        countDispatch('create-success');
        const state: AppointmentState = {
          externalId: 'provider-create-success',
          start: String(normalized.start),
          staffId: String(normalized.staffId),
          serviceIds: normalized.serviceIds as string[],
          status: 'confirmed',
          clientId: String(normalized.clientId),
        };
        providerState.set('create-success', state);
        return safeResult(state);
      },
      reconcile: async (normalized) => {
        const state = providerState.get('create-success');
        return matchesCreate(state, normalized)
          ? { outcome: 'PROVEN_SUCCEEDED', safeResult: safeResult(state!) }
          : { outcome: 'PROVEN_NOT_EXECUTED' };
      },
    });
    stage('create appointment success');
    const firstCreate = await firstRuntime.execute(
      createRequest,
      createHandlers,
    );
    assert.equal(firstCreate.external_id, 'provider-create-success');
    matrix.createSuccess = true;

    stage('create appointment duplicate convergence');
    const duplicateCreate = await firstRuntime.execute(
      {
        ...createRequest,
        source: {
          ...createRequest.source,
          sourceRef: 'ai/create-success',
        },
        callerIdempotency: {
          scope: 'ai.create',
          key: 'different-ai-key-same-logical-create',
        },
      },
      createHandlers,
    );
    assert.equal(duplicateCreate.external_id, firstCreate.external_id);
    assert.equal(dispatchCounts.get('create-success'), 1);
    const convergedExecutions = await prisma.actionExecution.count({
      where: {
        tenantId: primary.tenantId,
        capability: 'crm.appointment.create.v1',
        targetRef: createRequest.targetRef,
      },
    });
    assert.equal(convergedExecutions, 1);
    matrix.duplicateCreate = true;
    matrix.httpAiIdentityConvergence = true;
    matrix.terminalReplayNoDispatch = true;

    const appliedRequest = appointmentRequest({
      tenantId: primary.tenantId,
      capability: 'crm.appointment.create.v1',
      targetRef: 'create/timeout-applied',
      payload: createPayload({
        clientId: 'proof-client-timeout-applied',
        start: '2031-01-10T11:00:00.000Z',
      }),
      sourceRef: 'http/timeout-applied',
      actorUserId: primary.ownerId,
    });
    const appliedHandlers = handlers({
      dispatch: async (normalized) => {
        countDispatch('create-timeout-applied');
        providerState.set('create-timeout-applied', {
          externalId: 'provider-timeout-applied',
          start: String(normalized.start),
          staffId: String(normalized.staffId),
          serviceIds: normalized.serviceIds as string[],
          status: 'confirmed',
          clientId: String(normalized.clientId),
        });
        throw new SyntheticUnknownError('provider accepted before timeout');
      },
      reconcile: async (normalized) => {
        const state = providerState.get('create-timeout-applied');
        return matchesCreate(state, normalized)
          ? { outcome: 'PROVEN_SUCCEEDED', safeResult: safeResult(state!) }
          : { outcome: 'PROVEN_NOT_EXECUTED' };
      },
    });
    stage('create timeout reconciled as applied');
    const applied = await firstRuntime.execute(appliedRequest, appliedHandlers);
    assert.equal(applied.external_id, 'provider-timeout-applied');
    assert.equal(dispatchCounts.get('create-timeout-applied'), 1);
    matrix.createTimeoutReconciledApplied = true;

    const notAppliedRequest = appointmentRequest({
      tenantId: primary.tenantId,
      capability: 'crm.appointment.create.v1',
      targetRef: 'create/timeout-not-applied',
      payload: createPayload({
        clientId: 'proof-client-timeout-not-applied',
        start: '2031-01-10T12:00:00.000Z',
      }),
      sourceRef: 'http/timeout-not-applied',
      actorUserId: primary.ownerId,
    });
    const notAppliedHandlers = handlers({
      dispatch: async (normalized) => {
        const attempt = countDispatch('create-timeout-not-applied');
        if (attempt === 1) {
          stage('create not-applied first dispatch becomes unknown');
          throw new SyntheticUnknownError('timed out before provider apply');
        }
        stage('create not-applied safe retry dispatch');
        const state: AppointmentState = {
          externalId: 'provider-timeout-not-applied',
          start: String(normalized.start),
          staffId: String(normalized.staffId),
          serviceIds: normalized.serviceIds as string[],
          status: 'confirmed',
          clientId: String(normalized.clientId),
        };
        providerState.set('create-timeout-not-applied', state);
        return safeResult(state);
      },
      reconcile: async (normalized) => {
        stage('create not-applied canonical reconciliation');
        const state = providerState.get('create-timeout-not-applied');
        return matchesCreate(state, normalized)
          ? { outcome: 'PROVEN_SUCCEEDED', safeResult: safeResult(state!) }
          : { outcome: 'PROVEN_NOT_EXECUTED' };
      },
    });
    stage('create timeout proven not applied then retried');
    const notApplied = await firstRuntime.execute(
      notAppliedRequest,
      notAppliedHandlers,
    );
    assert.equal(notApplied.external_id, 'provider-timeout-not-applied');
    assert.equal(dispatchCounts.get('create-timeout-not-applied'), 2);
    matrix.createReconciledNotAppliedBeforeRetry = true;

    const unknownRequest = appointmentRequest({
      tenantId: primary.tenantId,
      capability: 'crm.appointment.create.v1',
      targetRef: 'create/still-unknown',
      payload: createPayload({
        clientId: 'proof-client-still-unknown',
        start: '2031-01-10T13:00:00.000Z',
      }),
      sourceRef: 'http/still-unknown',
      actorUserId: primary.ownerId,
    });
    const unknownHandlers = handlers({
      dispatch: async () => {
        countDispatch('create-still-unknown');
        throw new SyntheticUnknownError('ambiguous provider timeout');
      },
      reconcile: async () => ({ outcome: 'STILL_UNKNOWN' }),
    });
    await expectReject(
      () => firstRuntime.execute(unknownRequest, unknownHandlers),
      ActionExecutionUncertainError,
    );
    assert.equal(dispatchCounts.get('create-still-unknown'), 1);
    matrix.stillUnknownNeverBlindRetries = true;

    const cancelState: AppointmentState = {
      externalId: 'provider-cancel-success',
      start: '2031-01-11T10:00:00.000Z',
      staffId: 'proof-staff',
      serviceIds: ['proof-service'],
      status: 'confirmed',
    };
    providerState.set('cancel-success', cancelState);
    const cancelRequest = appointmentRequest({
      tenantId: primary.tenantId,
      capability: 'crm.appointment.cancel.v1',
      targetRef: `appointment/${cancelState.externalId}`,
      payload: { externalId: cancelState.externalId },
      sourceRef: 'http/cancel-success',
      actorUserId: primary.ownerId,
    });
    const cancelHandlers = handlers({
      dispatch: async () => {
        countDispatch('cancel-success');
        const state = providerState.get('cancel-success');
        if (state) state.status = 'canceled';
        return {
          external_id: cancelState.externalId,
          status: 'canceled',
        };
      },
      reconcile: async () => {
        const state = providerState.get('cancel-success');
        return !state || state.status === 'canceled'
          ? {
              outcome: 'PROVEN_SUCCEEDED',
              safeResult: {
                external_id: cancelState.externalId,
                status: 'canceled',
              },
            }
          : { outcome: 'PROVEN_NOT_EXECUTED' };
      },
    });
    await firstRuntime.execute(cancelRequest, cancelHandlers);
    assert.equal(providerState.get('cancel-success')?.status, 'canceled');
    matrix.cancelSuccess = true;

    let mirrorWrites = 0;
    try {
      await firstRuntime.execute(cancelRequest, cancelHandlers);
      mirrorWrites += 1;
      throw new Error('synthetic local mirror failure');
    } catch (error) {
      assert.equal((error as Error).message, 'synthetic local mirror failure');
    }
    const replayedCancel = await firstRuntime.execute(
      cancelRequest,
      cancelHandlers,
    );
    mirrorWrites += 1;
    assert.equal(replayedCancel.status, 'canceled');
    assert.equal(mirrorWrites, 2);
    assert.equal(dispatchCounts.get('cancel-success'), 1);
    matrix.historicalCancelMirrorFailureRepair = true;
    matrix.localMirrorFailureNoProviderRetry = true;

    const absentRequest = appointmentRequest({
      tenantId: primary.tenantId,
      capability: 'crm.appointment.cancel.v1',
      targetRef: 'appointment/provider-already-absent',
      payload: { externalId: 'provider-already-absent' },
      sourceRef: 'http/cancel-absent',
      actorUserId: primary.ownerId,
    });
    const absentHandlers = handlers({
      dispatch: async () => {
        countDispatch('cancel-absent');
        return {
          external_id: 'provider-already-absent',
          status: 'canceled',
        };
      },
      reconcile: async () => ({
        outcome: 'PROVEN_SUCCEEDED',
        safeResult: {
          external_id: 'provider-already-absent',
          status: 'canceled',
        },
      }),
    });
    await firstRuntime.execute(absentRequest, absentHandlers);
    matrix.cancelProviderAlreadyAbsent = true;

    const rescheduleOriginal: AppointmentState = {
      externalId: 'provider-reschedule-success',
      start: '2031-01-12T10:00:00.000Z',
      staffId: 'proof-staff',
      serviceIds: ['proof-service'],
      status: 'confirmed',
    };
    providerState.set('reschedule-success', { ...rescheduleOriginal });
    const rescheduleRequest = appointmentRequest({
      tenantId: primary.tenantId,
      capability: 'crm.appointment.reschedule.v1',
      targetRef: `appointment/${rescheduleOriginal.externalId}`,
      payload: {
        externalId: rescheduleOriginal.externalId,
        start: '2031-01-12T12:00:00.000Z',
        staffId: 'proof-staff-2',
        serviceIds: ['proof-service-2'],
      },
      sourceRef: 'http/reschedule-success',
      actorUserId: primary.ownerId,
    });
    const rescheduleHandlers = handlers({
      prepare: async () => ({ ...providerState.get('reschedule-success')! }),
      dispatch: async (normalized) => {
        countDispatch('reschedule-success');
        const state = providerState.get('reschedule-success')!;
        state.start = String(normalized.start);
        state.staffId = String(normalized.staffId);
        state.serviceIds = normalized.serviceIds as string[];
        return safeResult(state);
      },
      reconcile: async (normalized, previous) => {
        const state = providerState.get('reschedule-success');
        if (matchesDesired(state, normalized)) {
          return {
            outcome: 'PROVEN_SUCCEEDED',
            safeResult: safeResult(state!),
          };
        }
        return JSON.stringify(state) === JSON.stringify(previous)
          ? { outcome: 'PROVEN_NOT_EXECUTED' }
          : { outcome: 'STILL_UNKNOWN' };
      },
    });
    const rescheduled = await firstRuntime.execute(
      rescheduleRequest,
      rescheduleHandlers,
    );
    assert.equal(rescheduled.start, '2031-01-12T12:00:00.000Z');
    matrix.rescheduleSuccess = true;

    const timeoutOriginal: AppointmentState = {
      externalId: 'provider-reschedule-timeout',
      start: '2031-01-13T10:00:00.000Z',
      staffId: 'proof-staff',
      serviceIds: ['proof-service'],
      status: 'confirmed',
    };
    providerState.set('reschedule-timeout', { ...timeoutOriginal });
    const timeoutRescheduleRequest = appointmentRequest({
      tenantId: primary.tenantId,
      capability: 'crm.appointment.reschedule.v1',
      targetRef: `appointment/${timeoutOriginal.externalId}`,
      payload: {
        externalId: timeoutOriginal.externalId,
        start: '2031-01-13T12:00:00.000Z',
      },
      sourceRef: 'http/reschedule-timeout',
      actorUserId: primary.ownerId,
    });
    const timeoutRescheduleHandlers = handlers({
      prepare: async () => ({ ...providerState.get('reschedule-timeout')! }),
      dispatch: async (normalized) => {
        countDispatch('reschedule-timeout');
        const state = providerState.get('reschedule-timeout')!;
        state.start = String(normalized.start);
        throw new SyntheticUnknownError('provider applied before timeout');
      },
      reconcile: async (normalized, previous) => {
        const state = providerState.get('reschedule-timeout');
        if (matchesDesired(state, normalized)) {
          return {
            outcome: 'PROVEN_SUCCEEDED',
            safeResult: safeResult(state!),
          };
        }
        return JSON.stringify(state) === JSON.stringify(previous)
          ? { outcome: 'PROVEN_NOT_EXECUTED' }
          : { outcome: 'STILL_UNKNOWN' };
      },
    });
    await firstRuntime.execute(
      timeoutRescheduleRequest,
      timeoutRescheduleHandlers,
    );
    assert.equal(dispatchCounts.get('reschedule-timeout'), 1);
    matrix.rescheduleTimeoutReconciled = true;

    const divergentOriginal: AppointmentState = {
      externalId: 'provider-reschedule-divergent',
      start: '2031-01-14T10:00:00.000Z',
      staffId: 'proof-staff',
      serviceIds: ['proof-service'],
      status: 'confirmed',
    };
    providerState.set('reschedule-divergent', { ...divergentOriginal });
    const divergentRequest = appointmentRequest({
      tenantId: primary.tenantId,
      capability: 'crm.appointment.reschedule.v1',
      targetRef: `appointment/${divergentOriginal.externalId}`,
      payload: {
        externalId: divergentOriginal.externalId,
        start: '2031-01-14T12:00:00.000Z',
      },
      sourceRef: 'http/reschedule-divergent',
      actorUserId: primary.ownerId,
    });
    const divergentHandlers = handlers({
      prepare: async () => ({ ...providerState.get('reschedule-divergent')! }),
      dispatch: async () => {
        countDispatch('reschedule-divergent');
        providerState.get('reschedule-divergent')!.start =
          '2031-01-14T11:00:00.000Z';
        throw new SyntheticUnknownError('provider state diverged');
      },
      reconcile: async (normalized, previous) => {
        const state = providerState.get('reschedule-divergent');
        if (matchesDesired(state, normalized)) {
          return {
            outcome: 'PROVEN_SUCCEEDED',
            safeResult: safeResult(state!),
          };
        }
        return JSON.stringify(state) === JSON.stringify(previous)
          ? { outcome: 'PROVEN_NOT_EXECUTED' }
          : { outcome: 'STILL_UNKNOWN' };
      },
    });
    await expectReject(
      () => firstRuntime.execute(divergentRequest, divergentHandlers),
      ActionExecutionUncertainError,
    );
    assert.equal(dispatchCounts.get('reschedule-divergent'), 1);
    matrix.rescheduleDivergentRemainsUnknown = true;

    const restartRequest = appointmentRequest({
      tenantId: primary.tenantId,
      capability: 'crm.appointment.create.v1',
      targetRef: 'create/restart-after-dispatch',
      payload: createPayload({
        clientId: 'proof-client-restart',
        start: '2031-01-15T10:00:00.000Z',
      }),
      sourceRef: 'http/restart-after-dispatch',
      actorUserId: primary.ownerId,
    });
    const restartExecution =
      await proofKernel.createExecutionForControlledFixture(restartRequest);
    const restartClaim = await proofKernel.claimExecution({
      tenantId: primary.tenantId,
      executionId: restartExecution.id,
      workerId: 'appointment-proof-crashed-worker',
    });
    await proofKernel.markDispatchMayHaveCrossed({
      tenantId: primary.tenantId,
      executionId: restartExecution.id,
      attemptId: restartClaim.attempt.id,
      leaseToken: restartClaim.leaseToken,
    });
    providerState.set('restart-after-dispatch', {
      externalId: 'provider-restart-after-dispatch',
      start: '2031-01-15T10:00:00.000Z',
      staffId: 'proof-staff',
      serviceIds: ['proof-service'],
      status: 'confirmed',
      clientId: 'proof-client-restart',
    });
    stage('restart after dispatch lease expiry');
    await prisma.actionExecution.update({
      where: {
        id_tenantId: {
          id: restartExecution.id,
          tenantId: primary.tenantId,
        },
      },
      data: {
        leaseExpiresAt: new Date(Date.now() - 1_000),
        revision: { increment: 1 },
      },
    });
    const restartHandlers = handlers({
      dispatch: async () => {
        countDispatch('restart-after-dispatch');
        throw new Error('restart proof must reconcile without redispatch');
      },
      reconcile: async (normalized) => {
        const state = providerState.get('restart-after-dispatch');
        return matchesCreate(state, normalized)
          ? { outcome: 'PROVEN_SUCCEEDED', safeResult: safeResult(state!) }
          : { outcome: 'STILL_UNKNOWN' };
      },
    });
    stage('restart after dispatch reconciliation');
    const restarted = await runtime(prisma).execute(
      restartRequest,
      restartHandlers,
    );
    assert.equal(restarted.external_id, 'provider-restart-after-dispatch');
    assert.equal(dispatchCounts.get('restart-after-dispatch') ?? 0, 0);
    matrix.restartAfterDispatchNoDuplicate = true;

    const concurrentRequest = appointmentRequest({
      tenantId: primary.tenantId,
      capability: 'crm.appointment.create.v1',
      targetRef: 'create/two-workers',
      payload: createPayload({
        clientId: 'proof-client-two-workers',
        start: '2031-01-16T10:00:00.000Z',
      }),
      sourceRef: 'http/two-workers',
      actorUserId: primary.ownerId,
    });
    const concurrentHandlers = handlers({
      dispatch: async (normalized) => {
        countDispatch('two-workers');
        await new Promise((resolve) => setTimeout(resolve, 100));
        const state: AppointmentState = {
          externalId: 'provider-two-workers',
          start: String(normalized.start),
          staffId: String(normalized.staffId),
          serviceIds: normalized.serviceIds as string[],
          status: 'confirmed',
          clientId: String(normalized.clientId),
        };
        providerState.set('two-workers', state);
        return safeResult(state);
      },
      reconcile: async (normalized) => {
        const state = providerState.get('two-workers');
        return matchesCreate(state, normalized)
          ? { outcome: 'PROVEN_SUCCEEDED', safeResult: safeResult(state!) }
          : { outcome: 'PROVEN_NOT_EXECUTED' };
      },
    });
    const concurrent = await Promise.all([
      runtime(prisma).execute(concurrentRequest, concurrentHandlers),
      runtime(prisma).execute(
        {
          ...concurrentRequest,
          source: {
            ...concurrentRequest.source,
            sourceRef: 'ai/two-workers',
          },
        },
        concurrentHandlers,
      ),
    ]);
    assert.equal(concurrent[0].external_id, concurrent[1].external_id);
    assert.equal(dispatchCounts.get('two-workers'), 1);
    matrix.twoWorkersOneProviderMutation = true;

    const crossTenantRequest = appointmentRequest({
      tenantId: secondary.tenantId,
      capability: 'crm.appointment.create.v1',
      targetRef: createRequest.targetRef,
      payload: createInput,
      sourceRef: 'http/cross-tenant',
      actorUserId: secondary.ownerId,
    });
    const crossTenantHandlers = handlers({
      dispatch: async (normalized) => {
        countDispatch('cross-tenant');
        const state: AppointmentState = {
          externalId: 'provider-cross-tenant',
          start: String(normalized.start),
          staffId: String(normalized.staffId),
          serviceIds: normalized.serviceIds as string[],
          status: 'confirmed',
          clientId: String(normalized.clientId),
        };
        return safeResult(state);
      },
      reconcile: async () => ({ outcome: 'PROVEN_NOT_EXECUTED' }),
    });
    await runtime(prisma).execute(crossTenantRequest, crossTenantHandlers);
    assert.equal(dispatchCounts.get('cross-tenant'), 1);
    matrix.sameLogicalIdentityDifferentTenantAllowed = true;

    let unauthorizedDispatches = 0;
    await expectReject(
      () =>
        runtime(prisma).execute(
          {
            ...createRequest,
            targetRef: 'create/unauthorized',
            source: {
              ...createRequest.source,
              sourceRef: 'http/unauthorized',
              actorUserId: opaque('missing-user'),
            },
          },
          handlers({
            dispatch: async () => {
              unauthorizedDispatches += 1;
              return { external_id: 'forbidden', status: 'confirmed' };
            },
            reconcile: async () => ({ outcome: 'STILL_UNKNOWN' }),
          }),
        ),
      ActionContractError,
    );
    assert.equal(unauthorizedDispatches, 0);
    matrix.unauthorizedRequesterRejectedBeforeDispatch = true;

    stage('rejected controlled approval and production namespace fence');
    const approvalRequest = syntheticApprovalRequest(primary.tenantId);
    const approvalExecution =
      await proofKernel.createExecutionForControlledFixture(approvalRequest);
    await proofKernel.decideApproval({
      tenantId: primary.tenantId,
      executionId: approvalExecution.id,
      approverUserId: primary.ownerId,
      decision: ActionApprovalDecision.REJECTED,
    });
    let rejectedApprovalDispatches = 0;
    await expectReject(
      () =>
        runtime(prisma).execute(
          approvalRequest,
          handlers({
            dispatch: async () => {
              rejectedApprovalDispatches += 1;
              return { external_id: 'forbidden', status: 'confirmed' };
            },
            reconcile: async () => ({ outcome: 'STILL_UNKNOWN' }),
          }),
        ),
      ActionContractError,
    );
    // Production ingress rejects kernel.test.* before dispatch. Prove the separate
    // terminal approval invariant at the real kernel claim boundary as well.
    await assert.rejects(
      () =>
        proofKernel.claimExecution({
          tenantId: primary.tenantId,
          executionId: approvalExecution.id,
          workerId: 'proof.rejected',
        }),
      (error: unknown) =>
        Boolean(
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'EXECUTION_TERMINAL',
        ),
    );
    assert.equal(
      (
        await proofKernel.getExecutionResult(
          primary.tenantId,
          approvalExecution.id,
        )
      ).state,
      ActionExecutionState.NOT_EXECUTED,
    );
    assert.equal(
      await prisma.actionAttempt.count({
        where: {
          tenantId: primary.tenantId,
          actionExecutionId: approvalExecution.id,
        },
      }),
      0,
    );
    matrix.syntheticCapabilityRejectedByProductionIngress = true;
    assert.equal(rejectedApprovalDispatches, 0);
    matrix.rejectedApprovalNeverDispatches = true;

    const tenantIds = [primary.tenantId, secondary.tenantId];
    const executions = await prisma.actionExecution.findMany({
      where: { tenantId: { in: tenantIds } },
      select: {
        state: true,
        executionAttemptCount: true,
        reconciliationState: true,
      },
    });
    const attempts = await prisma.actionAttempt.count({
      where: { tenantId: { in: tenantIds } },
    });
    const duplicateAttemptsCollapsed =
      3 + Number((dispatchCounts.get('two-workers') ?? 0) === 1);
    const report = {
      database,
      matrix,
      metrics: {
        total: executions.length,
        succeeded: executions.filter(
          (entry) => entry.state === ActionExecutionState.SUCCEEDED,
        ).length,
        unknown: executions.filter(
          (entry) => entry.state === ActionExecutionState.UNKNOWN,
        ).length,
        notExecuted: executions.filter(
          (entry) => entry.state === ActionExecutionState.NOT_EXECUTED,
        ).length,
        attempts,
      },
      duplicateAttemptsCollapsed,
      providerDispatches: Object.fromEntries(dispatchCounts),
      actionIntentsExecuted: 0,
      externalLiveCrmMutations: 0,
    };
    assert(Object.values(matrix).every(Boolean));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    if (cleanupTenantIds.length > 0) {
      await prisma.actionAttempt.deleteMany({
        where: { tenantId: { in: cleanupTenantIds } },
      });
      await prisma.actionExecution.deleteMany({
        where: { tenantId: { in: cleanupTenantIds } },
      });
      await prisma.membership.deleteMany({
        where: { tenantId: { in: cleanupTenantIds } },
      });
      await prisma.user.deleteMany({
        where: { tenantId: { in: cleanupTenantIds } },
      });
      await prisma.tenant.deleteMany({
        where: { id: { in: cleanupTenantIds } },
      });
    }
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(
    `Appointment Action Engine proof failed at ${currentProofStage}: ${message}\n`,
  );
  process.exitCode = 1;
});
