import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { ClientAppointmentStatusHandlers } from '../action-engine/action-engine.runtime';
import { CalendarSource } from '../common/domain.enums';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CrmService } from './crm.service';

// Synthetic CRM-owner proof: real status/plan/reconcile code, counting source
// readers and mirror sink. The small driver is NOT AE, persistence or provider
// acceptance; the real kernel/HTTP/restart suites qualify those boundaries.
type OwnerSeams = {
  assertExternalSource(tenantId: string): Promise<void>;
  getAdapterForTenant(tenantId: string): Promise<unknown>;
  getExternalProviderKey(tenantId: string): Promise<string>;
  confirmedBookingServices(...args: unknown[]): Promise<unknown[]>;
  confirmedCreateBranchRevision(...args: unknown[]): Promise<string>;
  assertBookingBranchTimezone(...args: unknown[]): Promise<void>;
  persistCanonicalClientCreate(...args: unknown[]): Promise<unknown>;
};

function fixture() {
  const context = new TenantContextService();
  let active = true;
  let revision = 'original-revision';
  let companyId = '123';
  const durable = {
    clientId: 'client-a',
    clientName: 'Synthetic fixture',
    clientPhone: '+79990000001',
    branchId: 'branch-a',
    staffId: '71',
    serviceIds: ['81'],
    start: '2026-12-20T12:00:00.000Z',
    creationMode: 'client',
    allowBusy: false,
    notifyBySmsHours: 0,
  };
  const calendarTarget = {
    source: 'external',
    provider: 'yclients',
    companyId: '123',
  };
  const source = {
    execution: {
      id: 'execution-a',
      capability: 'crm.appointment.create.v1',
      state: 'UNKNOWN',
      evidenceRefsJson: ['crm-branch-source/1:original-revision'],
    },
    principal: {
      linkId: 'link-a',
      target: { kind: 'create_appointment', clientId: 'client-a' },
    },
    input: durable,
  };
  const providerRows = [
    {
      external_id: '501',
      status: 'confirmed',
      start: durable.start,
      staff_id: '71',
      service_ids: ['81'],
    },
  ];
  const adapter = {
    getClientAppointments: jest.fn().mockResolvedValue(providerRows),
    createAppointment: jest.fn(),
    rescheduleAppointment: jest.fn(),
  };
  const runtime = {
    resolveClientBookingRetry: jest.fn().mockResolvedValue({
      executionId: 'execution-a',
      descriptor: { calendarTarget, branchId: 'branch-a' },
      resolutionContext: { timezone: 'Europe/Moscow' },
    }),
    resolveClientRescheduleCallerAlias: jest
      .fn()
      .mockResolvedValue({ id: 'execution-a', state: 'SUCCEEDED' }),
    readClientAppointmentStatusSource: jest
      .fn()
      .mockImplementation(() => Promise.resolve(source)),
    getExecutionResult: jest.fn().mockImplementation(() =>
      Promise.resolve({
        executionId: 'execution-a',
        state: source.execution.state,
      }),
    ),
    executeWithReceipt: jest.fn(),
    preview: jest.fn(),
    resolveClientAppointmentStatus: jest
      .fn()
      .mockImplementation(
        async (
          tenantId: string,
          executionId: string,
          handlers: ClientAppointmentStatusHandlers,
        ) => {
          await handlers.authorize();
          const decision = await handlers.reconcile(source.input, undefined, {
            tenantId,
            executionId,
          });
          await handlers.authorize();
          source.execution.state =
            decision.outcome === 'PROVEN_SUCCEEDED' ? 'SUCCEEDED' : 'UNKNOWN';
          return { executionId, state: source.execution.state };
        },
      ),
  };
  const service = new CrmService(
    {} as never,
    {} as never,
    {} as never,
    context,
    {} as never,
    {} as never,
    runtime as never,
  );
  const owner = service as unknown as OwnerSeams;
  jest
    .spyOn(service, 'getCalendarSource')
    .mockResolvedValue(CalendarSource.EXTERNAL);
  const target = jest
    .spyOn(service, 'canonicalClientBookingTarget')
    .mockImplementation(() =>
      Promise.resolve({
        source: 'external',
        provider: 'yclients',
        companyId,
      }),
    );
  jest.spyOn(owner, 'assertExternalSource').mockResolvedValue(undefined);
  const adapterRead = jest
    .spyOn(owner, 'getAdapterForTenant')
    .mockResolvedValue(adapter);
  jest.spyOn(owner, 'getExternalProviderKey').mockResolvedValue('yclients');
  jest
    .spyOn(service, 'readBranchAvailabilityRevision')
    .mockImplementation(() => Promise.resolve(revision));
  const witness = jest
    .spyOn(owner, 'confirmedCreateBranchRevision')
    .mockImplementation(() => {
      if (revision !== 'original-revision')
        throw new ConflictException('Original branch changed');
      return Promise.resolve(revision);
    });
  jest.spyOn(owner, 'assertBookingBranchTimezone').mockResolvedValue(undefined);
  const services = jest
    .spyOn(owner, 'confirmedBookingServices')
    .mockResolvedValue([]);
  const mirror = jest
    .spyOn(owner, 'persistCanonicalClientCreate')
    .mockResolvedValue({ id: 'appointment-a' });
  const availability = jest
    .spyOn(service, 'getAvailableSlots')
    .mockImplementation(() => {
      throw new Error('Status READ must not quote new availability');
    });
  const authorize = jest.fn().mockImplementation(() => {
    if (!active)
      throw new ForbiddenException('Current Client or widget access revoked');
    return Promise.resolve();
  });
  const createInput = {
    tenantId: 'tenant-a',
    clientId: 'client-a',
    linkId: 'link-a',
    key: 'original-stored-confirmation-key',
    authorize,
  };
  const run = <T>(fn: () => Promise<T>) =>
    context.runAsSystemTenant('tenant-a', fn);
  const read = () => run(() => service.readClientCreateStatus(createInput));
  const noMutation = () => {
    expect(adapter.createAppointment).not.toHaveBeenCalled();
    expect(adapter.rescheduleAppointment).not.toHaveBeenCalled();
    expect(runtime.executeWithReceipt).not.toHaveBeenCalled();
    expect(runtime.preview).not.toHaveBeenCalled();
    expect(availability).not.toHaveBeenCalled();
  };
  return {
    service,
    run,
    read,
    createInput,
    source,
    runtime,
    adapter,
    providerRows,
    adapterRead,
    target,
    witness,
    services,
    mirror,
    noMutation,
    revoke: () => {
      active = false;
    },
    changeRevision: () => {
      revision = 'changed-revision';
    },
    changeCompany: () => {
      companyId = '456';
    },
  };
}

afterEach(() => jest.restoreAllMocks());

describe('explicit original Client appointment status', () => {
  it('reads completed create by its original tenant/Client/alias without source or provider calls', async () => {
    const f = fixture();
    f.source.execution.state = 'SUCCEEDED';
    f.changeCompany(); // Historical success needs no fresh booking source.
    await expect(f.read()).resolves.toMatchObject({
      executionId: 'execution-a',
      state: 'SUCCEEDED',
    });
    expect(f.runtime.resolveClientBookingRetry).toHaveBeenCalledWith(
      'tenant-a',
      'client-a',
      'original-stored-confirmation-key',
    );
    expect(f.runtime.readClientAppointmentStatusSource).toHaveBeenCalledWith(
      'tenant-a',
      'execution-a',
    );
    expect(f.target).not.toHaveBeenCalled();
    expect(f.adapterRead).not.toHaveBeenCalled();
    expect(f.services).not.toHaveBeenCalled();
    expect(f.runtime.resolveClientAppointmentStatus).not.toHaveBeenCalled();
    f.noMutation();
  });

  it('reads completed reschedule by the same stored alias and original appointment only', async () => {
    const f = fixture();
    f.source.execution.state = 'SUCCEEDED';
    f.runtime.readClientAppointmentStatusSource.mockResolvedValue({
      execution: {
        id: 'execution-a',
        capability: 'crm.appointment.reschedule.v1',
        state: 'SUCCEEDED',
      },
      principal: {
        linkId: 'link-a',
        target: {
          kind: 'appointment',
          appointmentId: 'appointment-a',
          externalId: '501',
        },
      },
      input: { externalId: '501', start: f.source.input.start, staffId: '71' },
    });
    await expect(
      f.run(() =>
        f.service.readClientRescheduleStatus({
          tenantId: 'tenant-a',
          linkId: 'link-a',
          appointmentId: 'appointment-a',
          externalId: '501',
          key: 'original-stored-confirmation-key',
          timezone: 'Europe/Moscow',
          authorize: f.createInput.authorize,
        }),
      ),
    ).resolves.toMatchObject({
      executionId: 'execution-a',
      state: 'SUCCEEDED',
    });
    expect(f.runtime.resolveClientRescheduleCallerAlias).toHaveBeenCalledWith(
      'tenant-a',
      'original-stored-confirmation-key',
    );
    expect(f.adapterRead).not.toHaveBeenCalled();
    expect(f.services).not.toHaveBeenCalled();
    expect(f.runtime.resolveClientAppointmentStatus).not.toHaveBeenCalled();
    f.noMutation();
  });

  it('rejects foreign tenant context and a changed Client link before provider or mirror', async () => {
    const f = fixture();
    await expect(
      f.run(() =>
        f.service.readClientCreateStatus({
          ...f.createInput,
          tenantId: 'tenant-b',
        }),
      ),
    ).rejects.toThrow();
    expect(f.runtime.resolveClientBookingRetry).not.toHaveBeenCalled();
    f.source.principal.linkId = 'foreign-link';
    await expect(f.read()).rejects.toThrow('Original Client action required');
    expect(f.adapterRead).not.toHaveBeenCalled();
    expect(f.mirror).not.toHaveBeenCalled();
    f.noMutation();
  });

  it('reconciles the original durable create once and reuses completed status without new availability or dispatch', async () => {
    const f = fixture();
    await expect(f.read()).resolves.toMatchObject({
      executionId: 'execution-a',
      state: 'SUCCEEDED',
    });
    expect(f.adapter.getClientAppointments).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      phone: f.source.input.clientPhone,
      timezone: 'Europe/Moscow',
    });
    expect(f.mirror).toHaveBeenCalledWith(
      'tenant-a',
      expect.objectContaining({
        clientId: 'client-a',
        start: f.source.input.start,
        branchId: 'branch-a',
      }),
      expect.objectContaining({ external_id: '501' }),
      'yclients',
      [],
    );
    await expect(f.read()).resolves.toMatchObject({
      executionId: 'execution-a',
      state: 'SUCCEEDED',
    });
    expect(f.adapter.getClientAppointments).toHaveBeenCalledTimes(1);
    expect(f.mirror).toHaveBeenCalledTimes(1);
    expect(f.runtime.resolveClientAppointmentStatus).toHaveBeenCalledTimes(1);
    f.noMutation();
  });

  it('revocation during the initial catalogue read prevents the later provider ledger read', async () => {
    const f = fixture();
    f.services.mockImplementationOnce(() => {
      f.revoke();
      return Promise.resolve([]);
    });
    await expect(f.read()).rejects.toThrow(
      'Current Client or widget access revoked',
    );
    expect(f.adapter.getClientAppointments).not.toHaveBeenCalled();
    expect(f.mirror).not.toHaveBeenCalled();
    f.noMutation();
  });

  it('revocation during the final catalogue read prevents mirror persistence after positive readback', async () => {
    const f = fixture();
    f.services.mockResolvedValueOnce([]).mockImplementationOnce(() => {
      f.revoke();
      return Promise.resolve([]);
    });
    await expect(f.read()).rejects.toThrow(
      'Current Client or widget access revoked',
    );
    expect(f.adapter.getClientAppointments).toHaveBeenCalledTimes(1);
    expect(f.mirror).not.toHaveBeenCalled();
    expect(f.source.execution.state).toBe('UNKNOWN');
    f.noMutation();
  });

  it('source revision changed during provider read cannot produce a mirror or confirmed status', async () => {
    const f = fixture();
    f.adapter.getClientAppointments.mockImplementationOnce(() => {
      f.changeRevision();
      return Promise.resolve(f.providerRows);
    });
    await expect(f.read()).rejects.toThrow('Original branch changed');
    expect(f.source.execution.state).toBe('UNKNOWN');
    expect(f.adapter.getClientAppointments).toHaveBeenCalledTimes(1);
    expect(f.mirror).not.toHaveBeenCalled();
    f.noMutation();
  });

  it('source changed after readback/mirror is revalidated before returning confirmation', async () => {
    const f = fixture();
    f.mirror.mockImplementationOnce(() => {
      f.changeCompany();
      return Promise.resolve({ id: 'appointment-a' });
    });
    await expect(f.read()).rejects.toThrow('Original calendar source changed');
    expect(f.adapter.getClientAppointments).toHaveBeenCalledTimes(1);
    expect(f.mirror).toHaveBeenCalledTimes(1);
    expect(f.source.execution.state).toBe('UNKNOWN');
    f.noMutation();
  });
});

describe('native reschedule readback identity', () => {
  it.each([
    ['crm-501', 'confirmed', 'SUCCEEDED'],
    ['crm-other', 'confirmed', 'UNKNOWN'],
    ['crm-501', 'canceled', 'UNKNOWN'],
  ])(
    'uses provider identity %s and current status %s before mirror/confirmation',
    async (id, status, expected) => {
      const f = fixture();
      Object.assign(f.source.execution, {
        capability: 'crm.appointment.reschedule.v1',
      });
      Object.assign(f.source.principal.target, {
        kind: 'appointment',
        appointmentId: 'appointment-a',
        externalId: '501',
      });
      Object.assign(f.source.input, { externalId: '501' });
      f.runtime.resolveClientRescheduleCallerAlias.mockResolvedValue({
        id: 'execution-a',
        state: 'UNKNOWN',
      });
      const owner = f.service as unknown as {
        providerOfTenant(tenantId: string): Promise<string>;
        assertRescheduleBranchWitness(...args: unknown[]): Promise<void>;
        loadAppointmentDetail(...args: unknown[]): Promise<unknown>;
        persistRescheduledAppointmentMirror(...args: unknown[]): Promise<void>;
      };
      jest.spyOn(owner, 'providerOfTenant').mockResolvedValue('yclients');
      jest
        .spyOn(owner, 'assertRescheduleBranchWitness')
        .mockResolvedValue(undefined);
      jest.spyOn(owner, 'loadAppointmentDetail').mockResolvedValue({
        id,
        status,
        start_at: f.source.input.start,
        provider: { id: '71' },
        service_ids: ['81'],
      });
      const mirror = jest
        .spyOn(owner, 'persistRescheduledAppointmentMirror')
        .mockResolvedValue(undefined);
      const result = await f.run(() =>
        f.service.readClientRescheduleStatus({
          tenantId: 'tenant-a',
          linkId: 'link-a',
          appointmentId: 'appointment-a',
          externalId: '501',
          key: 'original-stored-confirmation-key',
          timezone: 'Europe/Moscow',
          authorize: f.createInput.authorize,
        }),
      );
      expect(result?.state).toBe(expected);
      if (expected === 'SUCCEEDED')
        expect(mirror).toHaveBeenCalledWith(
          'tenant-a',
          'yclients',
          expect.objectContaining({
            external_id: '501',
            start: f.source.input.start,
          }),
          expect.anything(),
          'Europe/Moscow',
        );
      else expect(mirror).not.toHaveBeenCalled();
      f.noMutation();
    },
  );
});
