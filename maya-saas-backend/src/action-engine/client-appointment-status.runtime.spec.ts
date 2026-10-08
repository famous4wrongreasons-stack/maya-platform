import {
  ActionExecutionState,
  ActionReconciliationState,
  type ActionExecution,
} from '@prisma/client';
import {
  ActionEngineRuntimeService,
  type ActionRuntimeHandlers,
  type ClientAppointmentStatusHandlers,
} from './action-engine.runtime';
import type {
  FinalizeReconciliationInputV1,
  TrustedActionExecutionRequestV1,
} from './action-engine.contract';
import { ActionClaimError } from './action-engine.errors';
import { CLIENT_BOOKING_INTENT_CONTRACT } from './client-booking-intent.contract';

function fixture(kind: 'create' | 'reschedule' = 'reschedule') {
  const input =
    kind === 'create'
      ? {
          clientId: 'client-a',
          clientName: 'Synthetic',
          clientPhone: '+79990001122',
          staffId: 'staff-a',
          serviceIds: ['service-a'],
          start: '2099-09-20T10:00:00Z',
          creationMode: 'client',
          allowBusy: false,
          notifyBySmsHours: 0,
        }
      : {
          externalId: 'provider-record-a',
          start: '2099-09-20T10:00:00Z',
          staffId: 'staff-a',
          serviceIds: ['service-a'],
        };
  const row = {
    id: 'execution-a',
    tenantId: 'tenant-a',
    capability: `crm.appointment.${kind}.v1`,
    sourceType: 'authenticated_request',
    sourceRef: 'client-channel-link:link-a',
    targetRef:
      kind === 'create' ? 'create/client-a' : 'appointment/provider-record-a',
    evidenceRefsJson: [
      'client-authority:v1:link-a',
      ...(kind === 'reschedule'
        ? ['client-target:appointment:v1:appointment-a']
        : []),
    ],
    bookingIntentContract:
      kind === 'create' ? CLIENT_BOOKING_INTENT_CONTRACT : null,
    bookingIntentEncrypted: kind === 'create' ? 'opaque' : null,
    state: ActionExecutionState.UNKNOWN,
    reconciliationState: ActionReconciliationState.REQUIRED,
  } as ActionExecution;
  const result = () => ({ executionId: row.id, state: row.state });
  let inconclusive = 0;
  const kernel = {
    getAudit: jest
      .fn()
      .mockImplementation(() => Promise.resolve({ execution: { ...row } })),
    getExecutionResult: jest
      .fn()
      .mockImplementation(() => Promise.resolve(result())),
    readTrustedNormalizedInput: jest.fn().mockResolvedValue(input),
    readLatestPreDispatchContext: jest
      .fn()
      .mockResolvedValue({ start: '2099-09-19T10:00:00Z' }),
    recoverExpiredClaim: jest.fn().mockImplementation(() => {
      row.reconciliationState = ActionReconciliationState.REQUIRED;
      row.leaseExpiresAt = null;
      return Promise.resolve({ ...row });
    }),
    claimReconciliation: jest.fn().mockImplementation(() => {
      if (row.state !== 'UNKNOWN' || row.reconciliationState !== 'REQUIRED')
        return Promise.reject(
          new ActionClaimError(
            'RECONCILIATION_NOT_REQUIRED',
            'Already claimed',
          ),
        );
      row.reconciliationState = ActionReconciliationState.IN_PROGRESS;
      return Promise.resolve({
        execution: { ...row },
        attempt: { id: 'read-attempt' },
        leaseToken: 'read-lease',
      });
    }),
    finalizeReconciliation: jest
      .fn()
      .mockImplementation((decision: FinalizeReconciliationInputV1) => {
        if (decision.outcome === 'STILL_UNKNOWN') {
          inconclusive++;
          row.reconciliationState =
            inconclusive >= 3
              ? ActionReconciliationState.MANUAL_REQUIRED
              : ActionReconciliationState.REQUIRED;
        } else {
          row.reconciliationState = ActionReconciliationState.RESOLVED;
          row.state =
            decision.outcome === 'PROVEN_SUCCEEDED'
              ? ActionExecutionState.SUCCEEDED
              : decision.outcome === 'PROVEN_NOT_EXECUTED'
                ? ActionExecutionState.READY
                : ActionExecutionState.FAILED;
        }
        return Promise.resolve(result());
      }),
    claimExecution: jest.fn().mockResolvedValue({
      execution: { ...row, transportIdempotencyKey: 'transport' },
      attempt: { id: 'dispatch-attempt' },
      leaseToken: 'dispatch-lease',
    }),
    markDispatchMayHaveCrossed: jest.fn().mockResolvedValue(undefined),
    finalizeUnknown: jest.fn().mockImplementation(() => {
      row.state = ActionExecutionState.UNKNOWN;
      row.reconciliationState = ActionReconciliationState.REQUIRED;
      return Promise.resolve(result());
    }),
  };
  const ingress = {
    createExecution: jest
      .fn()
      .mockImplementation(() => Promise.resolve({ ...row })),
  };
  const runtime = new ActionEngineRuntimeService(
    kernel as never,
    ingress as never,
  );
  const status = {
    authorize: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    reconcile: jest
      .fn<
        ReturnType<ClientAppointmentStatusHandlers['reconcile']>,
        Parameters<ClientAppointmentStatusHandlers['reconcile']>
      >()
      .mockResolvedValue({ outcome: 'STILL_UNKNOWN' }),
  } satisfies ClientAppointmentStatusHandlers;
  const handlers = {
    dispatch: jest.fn().mockRejectedValue(new Error('Lost provider response')),
    reconcile: (normalized, previous, context) =>
      status.reconcile(normalized, previous, context!),
    restore: jest.fn(),
    classifyError: () => ({
      kind: 'unknown',
      outcomeCode: 'transport_lost',
      errorClass: 'transport',
    }),
  } satisfies ActionRuntimeHandlers<unknown>;
  const check = () =>
    runtime.resolveClientAppointmentStatus('tenant-a', row.id, status);
  const assertNoDispatch = () => {
    expect(ingress.createExecution).not.toHaveBeenCalled();
    expect(kernel.claimExecution).not.toHaveBeenCalled();
    expect(handlers.dispatch).not.toHaveBeenCalled();
  };
  return {
    runtime,
    row,
    input,
    kernel,
    ingress,
    status,
    handlers,
    check,
    assertNoDispatch,
  };
}

describe('Finite verified Client appointment status', () => {
  it.each(['create', 'reschedule'] as const)(
    'yields %s after one inconclusive read following response loss',
    async (kind) => {
      const f = fixture(kind);
      f.row.state = ActionExecutionState.READY;
      await expect(
        f.runtime.executeWithReceipt(
          { tenantId: 'tenant-a' } as TrustedActionExecutionRequestV1,
          f.handlers,
        ),
      ).rejects.toMatchObject({
        code: 'ACTION_RECONCILIATION_REQUIRED',
        actionExecutionResult: { state: 'UNKNOWN' },
      });
      expect(f.handlers.dispatch).toHaveBeenCalledTimes(1);
      expect(f.status.reconcile).toHaveBeenCalledTimes(1);
      expect(f.kernel.finalizeReconciliation).toHaveBeenCalledTimes(1);
      expect(f.row.reconciliationState).toBe('REQUIRED');
    },
  );

  it('retains the existing loop and ceiling for a non-Client appointment', async () => {
    const f = fixture();
    f.row.sourceRef = 'staff-request-a';
    f.row.evidenceRefsJson = [];
    await expect(
      f.runtime.executeWithReceipt(
        { tenantId: 'tenant-a' } as TrustedActionExecutionRequestV1,
        f.handlers,
      ),
    ).rejects.toMatchObject({ code: 'ACTION_RECONCILIATION_MANUAL_REQUIRED' });
    expect(f.status.reconcile).toHaveBeenCalledTimes(3);
    expect(f.row.reconciliationState).toBe('MANUAL_REQUIRED');
  });

  it('reads the same trusted source and principal without provider calls', async () => {
    const f = fixture();
    await expect(
      f.runtime.readClientAppointmentStatusSource('tenant-a', f.row.id),
    ).resolves.toMatchObject({
      input: f.input,
      principal: {
        linkId: 'link-a',
        target: {
          kind: 'appointment',
          appointmentId: 'appointment-a',
          externalId: 'provider-record-a',
        },
      },
    });
    expect(f.status.reconcile).not.toHaveBeenCalled();
    f.assertNoDispatch();
  });

  it.each(['PROVEN_SUCCEEDED', 'PROVEN_NOT_EXECUTED'] as const)(
    'settles %s once without dispatching even if READY becomes possible',
    async (outcome) => {
      const f = fixture();
      jest.mocked(f.status.reconcile).mockResolvedValue({
        outcome,
        safeResult: { externalId: 'provider-record-a' },
      });
      await expect(f.check()).resolves.toMatchObject({
        state: outcome === 'PROVEN_SUCCEEDED' ? 'SUCCEEDED' : 'READY',
      });
      expect(f.status.reconcile).toHaveBeenCalledWith(
        f.input,
        { start: '2099-09-19T10:00:00Z' },
        { tenantId: 'tenant-a', executionId: 'execution-a' },
      );
      await f.check();
      expect(f.status.reconcile).toHaveBeenCalledTimes(1);
      expect(f.kernel.claimReconciliation).toHaveBeenCalledTimes(1);
      f.assertNoDispatch();
    },
  );

  it('preserves the global inconclusive ceiling across explicit status checks', async () => {
    const f = fixture();
    for (let i = 0; i < 4; i++)
      await expect(f.check()).resolves.toMatchObject({ state: 'UNKNOWN' });
    expect(f.status.reconcile).toHaveBeenCalledTimes(3);
    expect(f.kernel.claimReconciliation).toHaveBeenCalledTimes(3);
    expect(f.row.reconciliationState).toBe('MANUAL_REQUIRED');
    expect(f.kernel.claimReconciliation).toHaveBeenLastCalledWith({
      tenantId: 'tenant-a',
      executionId: 'execution-a',
      workerId: expect.any(String) as string,
    });
    f.assertNoDispatch();
  });

  it.each(['MANUAL_REQUIRED', 'IN_PROGRESS'] as const)(
    'observes %s without claim, polling or provider read',
    async (state) => {
      const f = fixture();
      f.row.reconciliationState = state;
      await expect(f.check()).resolves.toMatchObject({ state: 'UNKNOWN' });
      expect(f.kernel.claimReconciliation).not.toHaveBeenCalled();
      expect(f.kernel.recoverExpiredClaim).not.toHaveBeenCalled();
      expect(f.status.reconcile).not.toHaveBeenCalled();
      f.assertNoDispatch();
    },
  );

  it.each(['create', 'reschedule'] as const)(
    'recovers one expired %s reconciliation claim after restart, then reads at most once',
    async (kind) => {
      const f = fixture(kind);
      f.row.reconciliationState = ActionReconciliationState.IN_PROGRESS;
      f.row.leaseExpiresAt = new Date('2000-01-01T00:00:00Z');
      await expect(f.check()).resolves.toMatchObject({ state: 'UNKNOWN' });
      expect(f.kernel.recoverExpiredClaim).toHaveBeenCalledTimes(1);
      expect(f.kernel.recoverExpiredClaim).toHaveBeenCalledWith({
        tenantId: 'tenant-a',
        executionId: 'execution-a',
      });
      expect(f.kernel.claimReconciliation).toHaveBeenCalledTimes(1);
      expect(f.status.reconcile).toHaveBeenCalledTimes(1);
      f.assertNoDispatch();
    },
  );

  it('leaves a live reconciliation lease alone without polling', async () => {
    const f = fixture();
    f.row.reconciliationState = ActionReconciliationState.IN_PROGRESS;
    f.row.leaseExpiresAt = new Date('2099-01-01T00:00:00Z');
    await expect(f.check()).resolves.toMatchObject({ state: 'UNKNOWN' });
    expect(f.kernel.recoverExpiredClaim).not.toHaveBeenCalled();
    expect(f.kernel.claimReconciliation).not.toHaveBeenCalled();
    expect(f.status.reconcile).not.toHaveBeenCalled();
    f.assertNoDispatch();
  });

  it('preserves MANUAL_REQUIRED when expired claim recovery reaches the existing ceiling', async () => {
    const f = fixture();
    f.row.reconciliationState = ActionReconciliationState.IN_PROGRESS;
    f.row.leaseExpiresAt = new Date('2000-01-01T00:00:00Z');
    f.kernel.recoverExpiredClaim.mockImplementationOnce(() => {
      f.row.reconciliationState = ActionReconciliationState.MANUAL_REQUIRED;
      f.row.leaseExpiresAt = null;
      return Promise.resolve({ ...f.row });
    });
    await expect(f.check()).resolves.toMatchObject({ state: 'UNKNOWN' });
    expect(f.kernel.recoverExpiredClaim).toHaveBeenCalledTimes(1);
    expect(f.kernel.claimReconciliation).not.toHaveBeenCalled();
    expect(f.status.reconcile).not.toHaveBeenCalled();
    f.assertNoDispatch();
  });

  it('observes a concurrent recovery winner without another claim or provider read', async () => {
    const f = fixture();
    f.row.reconciliationState = ActionReconciliationState.IN_PROGRESS;
    f.row.leaseExpiresAt = new Date('2000-01-01T00:00:00Z');
    f.kernel.recoverExpiredClaim.mockRejectedValueOnce(
      new ActionClaimError('LEASE_NOT_EXPIRED', 'already recovered'),
    );
    await expect(f.check()).resolves.toMatchObject({ state: 'UNKNOWN' });
    expect(f.kernel.recoverExpiredClaim).toHaveBeenCalledTimes(1);
    expect(f.kernel.claimReconciliation).not.toHaveBeenCalled();
    expect(f.status.reconcile).not.toHaveBeenCalled();
    f.assertNoDispatch();
  });

  it('does not poll or read the provider when another status call wins the claim', async () => {
    const f = fixture();
    f.kernel.claimReconciliation.mockImplementationOnce(() => {
      f.row.reconciliationState = ActionReconciliationState.IN_PROGRESS;
      return Promise.reject(
        new ActionClaimError('RECONCILIATION_NOT_REQUIRED', 'race'),
      );
    });
    await expect(f.check()).resolves.toMatchObject({ state: 'UNKNOWN' });
    expect(f.kernel.claimReconciliation).toHaveBeenCalledTimes(1);
    expect(f.status.reconcile).not.toHaveBeenCalled();
    f.assertNoDispatch();
  });

  it('fails before any read when current Client authorization is denied', async () => {
    const f = fixture();
    jest.mocked(f.status.authorize).mockRejectedValue(new Error('revoked'));
    await expect(f.check()).rejects.toThrow('revoked');
    expect(f.kernel.getAudit).not.toHaveBeenCalled();
    expect(f.status.reconcile).not.toHaveBeenCalled();
    f.assertNoDispatch();
  });

  it('never publishes provider success after authorization is revoked during the read', async () => {
    const f = fixture();
    jest.mocked(f.status.reconcile).mockImplementation(() => {
      jest
        .mocked(f.status.authorize)
        .mockRejectedValue(new Error('revoked during read'));
      return Promise.resolve({
        outcome: 'PROVEN_SUCCEEDED',
        safeResult: { externalId: 'provider-record-a' },
      });
    });
    await expect(f.check()).rejects.toThrow('revoked during read');
    expect(f.kernel.finalizeReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'STILL_UNKNOWN',
        safeResult: undefined,
      }),
    );
    expect(f.row.state).toBe('UNKNOWN');
    f.assertNoDispatch();
  });

  it('records a provider read failure only as inconclusive and closes its claim', async () => {
    const f = fixture();
    jest.mocked(f.status.reconcile).mockRejectedValue(new Error('unavailable'));
    await expect(f.check()).resolves.toMatchObject({ state: 'UNKNOWN' });
    expect(f.row.reconciliationState).toBe('REQUIRED');
    expect(f.kernel.finalizeReconciliation).toHaveBeenCalledTimes(1);
    f.assertNoDispatch();
  });

  it.each([
    { sourceType: 'public_booking' },
    { capability: 'crm.appointment.cancel.v1' },
    { tenantId: 'tenant-b' },
    { evidenceRefsJson: [] },
    {
      evidenceRefsJson: [
        'client-authority:v1:link-b',
        'client-target:appointment:v1:appointment-a',
      ],
    },
    { targetRef: 'appointment/foreign-record' },
  ])(
    'refuses unsupported or mismatched durable attribution before provider read: %j',
    async (changes) => {
      const f = fixture();
      Object.assign(f.row, changes);
      await expect(f.check()).rejects.toThrow();
      expect(f.kernel.claimReconciliation).not.toHaveBeenCalled();
      expect(f.status.reconcile).not.toHaveBeenCalled();
      f.assertNoDispatch();
    },
  );

  it('fails closed when the original normalized payload has expired', async () => {
    const f = fixture();
    f.kernel.readTrustedNormalizedInput.mockRejectedValue(
      new Error('payload unavailable'),
    );
    await expect(f.check()).rejects.toThrow('payload unavailable');
    expect(f.kernel.claimReconciliation).not.toHaveBeenCalled();
    f.assertNoDispatch();
  });
});
