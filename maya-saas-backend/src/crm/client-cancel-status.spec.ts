import {
  ActionExecutionState,
  ActionReconciliationState,
  type ActionExecution,
} from '@prisma/client';
import { ActionEngineRuntimeService } from '../action-engine/action-engine.runtime';
import type { FinalizeReconciliationInputV1 } from '../action-engine/action-engine.contract';
import { ActionClaimError } from '../action-engine/action-engine.errors';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CrmService } from './crm.service';

// Real CRM cancel plan + AE status runtime. Persistence/source boundaries are
// synthetic, with counters; these are not provider or database acceptance tests.
type Seams = {
  assertExternalSource(tenant: string): Promise<void>;
  getAdapterForTenant(tenant: string): Promise<unknown>;
  providerOfTenant(tenant: string): Promise<string>;
  tenantTimezone(tenant: string): Promise<string>;
  assertAppointmentBranchWitness(...args: unknown[]): Promise<void>;
  persistCancelledAppointmentMirror(...args: unknown[]): Promise<void>;
};
function fixture() {
  const context = new TenantContextService();
  const row = {
    id: 'execution-a',
    tenantId: 'tenant-a',
    capability: 'crm.appointment.cancel.v1',
    sourceType: 'authenticated_request',
    sourceRef: 'client-channel-link:link-a',
    targetRef: 'appointment/501',
    evidenceRefsJson: [
      'client-authority:v1:link-a',
      'client-target:appointment:v1:appointment-a',
      'crm-branch-source/1:original',
    ],
    state: ActionExecutionState.UNKNOWN,
    reconciliationState: ActionReconciliationState.REQUIRED,
  } as ActionExecution;
  let active = true;
  let originalSource = true;
  const result = () => ({ executionId: row.id, state: row.state });
  const kernel = {
    resolveClientCancelCallerAlias: jest.fn().mockResolvedValue(row),
    getAudit: jest.fn(() => Promise.resolve({ execution: { ...row } })),
    readTrustedNormalizedInput: jest
      .fn()
      .mockResolvedValue({ externalId: '501' }),
    readLatestPreDispatchContext: jest.fn().mockResolvedValue(undefined),
    getExecutionResult: jest.fn(() => Promise.resolve(result())),
    claimReconciliation: jest.fn(() => {
      if (row.reconciliationState !== 'REQUIRED')
        throw new ActionClaimError(
          'RECONCILIATION_NOT_REQUIRED',
          'concurrent claim',
        );
      row.reconciliationState = ActionReconciliationState.IN_PROGRESS;
      return Promise.resolve({
        execution: { ...row },
        attempt: { id: 'read-1' },
        leaseToken: 'lease',
      });
    }),
    finalizeReconciliation: jest.fn(
      (decision: FinalizeReconciliationInputV1) => {
        if (decision.outcome === 'PROVEN_SUCCEEDED')
          row.state = ActionExecutionState.SUCCEEDED;
        if (decision.outcome === 'PROVEN_NOT_EXECUTED')
          row.state = ActionExecutionState.READY;
        row.reconciliationState =
          decision.outcome === 'STILL_UNKNOWN'
            ? ActionReconciliationState.REQUIRED
            : ActionReconciliationState.RESOLVED;
        return Promise.resolve(result());
      },
    ),
    claimExecution: jest.fn(),
  };
  const ingress = { createExecution: jest.fn() };
  const runtime = new ActionEngineRuntimeService(
    kernel as never,
    ingress as never,
  );
  const service = new CrmService(
    {} as never,
    {} as never,
    {} as never,
    context,
    {} as never,
    {} as never,
    runtime,
  );
  const owner = service as unknown as Seams;
  const adapter = {
    getAppointmentDetail: jest
      .fn()
      .mockResolvedValue({ id: 'crm-501', status: 'canceled' }),
    cancelAppointment: jest.fn(),
    createAppointment: jest.fn(),
    rescheduleAppointment: jest.fn(),
  };
  jest.spyOn(owner, 'assertExternalSource').mockResolvedValue(undefined);
  const adapterRead = jest
    .spyOn(owner, 'getAdapterForTenant')
    .mockResolvedValue(adapter);
  jest.spyOn(owner, 'providerOfTenant').mockResolvedValue('yclients');
  jest.spyOn(owner, 'tenantTimezone').mockResolvedValue('Europe/Moscow');
  const witness = jest
    .spyOn(owner, 'assertAppointmentBranchWitness')
    .mockImplementation(() => {
      if (!originalSource) throw new Error('Original source changed');
      return Promise.resolve();
    });
  const mirror = jest
    .spyOn(owner, 'persistCancelledAppointmentMirror')
    .mockResolvedValue(undefined);
  const authorize = jest.fn(() => {
    if (!active) throw new Error('Client revoked');
    return Promise.resolve();
  });
  const input = {
    tenantId: 'tenant-a',
    linkId: 'link-a',
    appointmentId: 'appointment-a',
    externalId: '501',
    key: 'stored-key',
    authorize,
  };
  const read = () =>
    context.runAsSystemTenant('tenant-a', () =>
      service.readClientCancelStatus(input),
    );
  const noDispatch = () => {
    expect(adapter.cancelAppointment).not.toHaveBeenCalled();
    expect(adapter.createAppointment).not.toHaveBeenCalled();
    expect(adapter.rescheduleAppointment).not.toHaveBeenCalled();
    expect(kernel.claimExecution).not.toHaveBeenCalled();
    expect(ingress.createExecution).not.toHaveBeenCalled();
  };
  return {
    service,
    context,
    runtime,
    row,
    kernel,
    adapter,
    adapterRead,
    witness,
    mirror,
    input,
    read,
    noDispatch,
    revoke: () => {
      active = false;
    },
    changeSource: () => {
      originalSource = false;
    },
  };
}
afterEach(() => jest.restoreAllMocks());

describe('explicit original cancellation readback', () => {
  it('reconciles original canceled source once, updates existing mirror and returns same action', async () => {
    const f = fixture();
    await expect(f.read()).resolves.toEqual({
      executionId: 'execution-a',
      state: 'SUCCEEDED',
    });
    expect(f.adapter.getAppointmentDetail).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      externalId: '501',
      timezone: 'Europe/Moscow',
    });
    expect(f.mirror).toHaveBeenCalledWith('tenant-a', 'yclients', '501');
    expect(f.witness).toHaveBeenCalledWith(
      'tenant-a',
      expect.anything(),
      'execution-a',
      'crm.appointment.cancel.v1',
    );
    await f.read();
    expect(f.adapter.getAppointmentDetail).toHaveBeenCalledTimes(1);
    expect(f.mirror).toHaveBeenCalledTimes(1);
    f.noDispatch();
  });
  it('completed action remains provider-free but requires current source and authority', async () => {
    const f = fixture();
    f.row.state = ActionExecutionState.SUCCEEDED;
    await expect(f.read()).resolves.toMatchObject({ state: 'SUCCEEDED' });
    expect(f.adapterRead).not.toHaveBeenCalled();
    f.changeSource();
    await expect(f.read()).rejects.toThrow('Original source changed');
    expect(f.adapter.getAppointmentDetail).not.toHaveBeenCalled();
    f.noDispatch();
  });
  it('does not return a completed receipt if authority disappears during result retrieval', async () => {
    const f = fixture();
    f.row.state = ActionExecutionState.SUCCEEDED;
    f.kernel.getExecutionResult.mockImplementationOnce(() => {
      f.revoke();
      return Promise.resolve({
        executionId: 'execution-a',
        state: ActionExecutionState.SUCCEEDED,
      });
    });
    await expect(f.read()).rejects.toThrow('Client revoked');
    f.noDispatch();
  });
  it.each([
    ['crm-other', 'canceled', 'UNKNOWN'],
    ['crm-501', 'confirmed', 'READY'],
    ['crm-501', 'cancelled', 'SUCCEEDED'],
  ])(
    'source %s / %s gives %s without mutation',
    async (id, status, expected) => {
      const f = fixture();
      f.adapter.getAppointmentDetail.mockResolvedValue({ id, status });
      await expect(f.read()).resolves.toMatchObject({ state: expected });
      if (expected !== 'SUCCEEDED') expect(f.mirror).not.toHaveBeenCalled();
      f.noDispatch();
    },
  );
  it('response loss during readback remains UNKNOWN', async () => {
    const f = fixture();
    f.adapter.getAppointmentDetail.mockRejectedValue(new Error('socket lost'));
    await expect(f.read()).resolves.toMatchObject({ state: 'UNKNOWN' });
    expect(f.mirror).not.toHaveBeenCalled();
    f.noDispatch();
  });
  it.each(['linkId', 'appointmentId', 'externalId', 'tenantId'] as const)(
    'refuses substituted %s before provider read',
    async (key) => {
      const f = fixture();
      f.input[key] = 'foreign';
      await expect(f.read()).rejects.toThrow();
      expect(f.adapter.getAppointmentDetail).not.toHaveBeenCalled();
      f.noDispatch();
    },
  );
  it('refuses another capability even if presented through the cancel alias', async () => {
    const f = fixture();
    f.row.capability = 'crm.appointment.reschedule.v1';
    f.kernel.readTrustedNormalizedInput.mockResolvedValue({
      externalId: '501',
      start: '2099-01-01T10:00:00Z',
    });
    await expect(f.read()).rejects.toThrow();
    expect(f.adapter.getAppointmentDetail).not.toHaveBeenCalled();
    f.noDispatch();
  });
  it.each(['authority', 'source'] as const)(
    'rechecks %s after provider read and refuses confirmation/mirror',
    async (change) => {
      const f = fixture();
      f.adapter.getAppointmentDetail.mockImplementationOnce(() => {
        if (change === 'authority') f.revoke();
        else f.changeSource();
        return Promise.resolve({ id: 'crm-501', status: 'canceled' });
      });
      await expect(f.read()).rejects.toThrow();
      expect(f.row.state).toBe('UNKNOWN');
      expect(f.mirror).not.toHaveBeenCalled();
      f.noDispatch();
    },
  );
  it('does not settle success if source changes while mirror persistence awaits', async () => {
    const f = fixture();
    f.mirror.mockImplementationOnce(() => {
      f.changeSource();
      return Promise.resolve();
    });
    await expect(f.read()).rejects.toThrow('Original source changed');
    expect(f.row.state).toBe('UNKNOWN');
    f.noDispatch();
  });
  it('concurrent checks share one reconciliation claim and never dispatch', async () => {
    const f = fixture();
    const results = await Promise.all([f.read(), f.read()]);
    expect(results.some((r) => r?.state === 'SUCCEEDED')).toBe(true);
    expect(f.adapter.getAppointmentDetail).toHaveBeenCalledTimes(1);
    expect(f.mirror).toHaveBeenCalledTimes(1);
    f.noDispatch();
  });
  it('refuses a substituted adapter without reading it', async () => {
    const f = fixture();
    const other = { ...f.adapter, getAppointmentDetail: jest.fn() };
    f.adapterRead.mockResolvedValueOnce(f.adapter).mockResolvedValue(other);
    await expect(f.read()).resolves.toMatchObject({ state: 'UNKNOWN' });
    expect(f.adapter.getAppointmentDetail).not.toHaveBeenCalled();
    expect(other.getAppointmentDetail).not.toHaveBeenCalled();
    f.noDispatch();
  });
});
