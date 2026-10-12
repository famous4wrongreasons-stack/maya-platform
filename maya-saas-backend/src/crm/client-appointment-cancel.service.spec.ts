import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { ActionExecutionUncertainError } from '../action-engine';
import { ClientAppointmentCancelService } from './client-appointment-cancel.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

type Options = {
  links?: Array<Record<string, unknown>>;
  client?: Record<string, unknown> | null;
  appointment?: Record<string, unknown> | null;
  membership?: Record<string, unknown> | null;
  principalUserId?: string;
};

type CancelInvocation = {
  sourceType: string;
  sourceRef: string;
  authorizationCheck: () => Promise<void>;
  callerIdempotency: { scope: string; key: string };
};

type CancelExecutor = (
  tenantId: string,
  target: string,
  invocation: CancelInvocation,
) => Promise<{
  value: { external_id: string; status: string };
  execution: { state: string; executionId: string };
}>;

function setup(options: Options = {}) {
  const links =
    options.links === undefined
      ? [
          {
            id: 'link-1',
            tenantId: 'tenant-1',
            clientId: 'client-1',
            provider: 'maya_user',
            providerSubjectHash: 'subject-hmac',
            verificationVersion: 1,
            subjectHashVersion: 1,
          },
        ]
      : options.links;
  const appointment =
    options.appointment === undefined
      ? {
          id: 'appt-1',
          tenantId: 'tenant-1',
          clientId: null,
          mayaClientId: 'client-1',
          branchId: 'branch-1',
          crmExternalId: null,
          source: 'internal',
          staffExternalId: 'staff-1',
          serviceIds: [],
          startAt: new Date(Date.now() + 86_400_000),
          endAt: new Date(Date.now() + 90_000_000),
          blockedStartAt: new Date(Date.now() + 86_400_000),
          blockedEndAt: new Date(Date.now() + 90_000_000),
          status: 'confirmed',
          notes: null,
          totalPriceKopecks: 1000,
          currency: 'RUB',
          providerPayload: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          branch: null,
        }
      : options.appointment;
  const tx = {
    membership: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.membership === undefined
            ? { id: 'mem-1' }
            : options.membership,
        ),
    },
    clientChannelLink: { findMany: jest.fn().mockResolvedValue(links) },
    client: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.client === undefined
            ? { id: 'client-1', mergedIntoClientId: null, userId: null }
            : options.client,
        ),
    },
    appointment: {
      findFirst: jest.fn().mockResolvedValue(appointment),
    },
  };
  const prisma = {
    $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    appointment: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          appointment ? { ...appointment, status: 'canceled' } : null,
        ),
    },
  };
  const context = {
    assertTenantId: jest.fn((tenantId: string) => tenantId),
    get: jest.fn().mockReturnValue({
      userId: options.principalUserId ?? 'user-1',
      tenantId: 'tenant-1',
    }),
  };
  const encryption = {
    opaqueReference: jest.fn().mockReturnValue('subject-hmac'),
  };
  const executeInternal = jest.fn<CancelExecutor>().mockResolvedValue({
    value: { external_id: 'appt-1', status: 'canceled' },
    execution: { state: 'SUCCEEDED', executionId: 'exec-1' },
  });
  const executeCrm = jest.fn<CancelExecutor>().mockResolvedValue({
    value: { external_id: 'crm-1', status: 'canceled' },
    execution: { state: 'SUCCEEDED', executionId: 'exec-crm' },
  });
  const crm = {
    readBranchAvailabilityRevision: jest
      .fn()
      .mockResolvedValue('source-revision'),
    assertClientAppointmentBranchOrigin: jest.fn().mockResolvedValue(undefined),
    executeInternalAppointmentCancelWithReceipt: executeInternal,
    executeCancelAppointmentWithReceipt: executeCrm,
  };
  const service = new ClientAppointmentCancelService(
    prisma as never,
    context as unknown as TenantContextService,
    encryption as never,
    crm as never,
  );
  return { service, tx, prisma, crm, executeInternal, executeCrm, context };
}

describe('B29 verified Client appointment cancel authority', () => {
  it('cancels an owned internal Appointment through the existing Action Engine action', async () => {
    const { service, tx, executeInternal, executeCrm } = setup();

    await expect(
      service.forAccount('tenant-1', 'user-1', 'appt-1'),
    ).resolves.toMatchObject({ id: 'appt-1', status: 'canceled' });

    expect(tx.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'appt-1',
          tenantId: 'tenant-1',
          mayaClientId: 'client-1',
        },
      }),
    );
    expect(executeInternal).toHaveBeenCalledTimes(1);
    const calls = executeInternal.mock.calls as Array<
      [string, string, CancelInvocation]
    >;
    const invocation = calls[0][2];
    expect(invocation.sourceType).toBe('authenticated_request');
    expect(invocation.callerIdempotency.scope).toBe(
      'appointments.http.cancel.v1',
    );
    await invocation.authorizationCheck();
    expect(executeCrm).not.toHaveBeenCalled();
  });

  it('allows a Client without Maya User through a verified maya_user binding', async () => {
    const { service, executeInternal } = setup({
      client: { id: 'client-1', mergedIntoClientId: null, userId: null },
    });

    await expect(
      service.forAccount('tenant-1', 'user-1', 'appt-1'),
    ).resolves.toMatchObject({ id: 'appt-1' });
    expect(executeInternal).toHaveBeenCalledTimes(1);
  });

  it('denies missing binding without ActionExecution or Appointment mutation', async () => {
    const { service, executeInternal, executeCrm, prisma } = setup({
      links: [],
    });

    await expect(
      service.forAccount('tenant-1', 'user-1', 'appt-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(executeInternal).not.toHaveBeenCalled();
    expect(executeCrm).not.toHaveBeenCalled();
    expect(prisma.appointment.findFirst).not.toHaveBeenCalled();
  });

  it('denies revoked binding without ActionExecution', async () => {
    const { service, executeInternal } = setup({ links: [] });

    await expect(
      service.forAccount('tenant-1', 'user-1', 'appt-1'),
    ).rejects.toThrow('client_link_required');
    expect(executeInternal).not.toHaveBeenCalled();
  });

  it('denies Client A from cancelling Client B Appointment', async () => {
    const { service, executeInternal, executeCrm } = setup({
      appointment: null,
    });

    await expect(
      service.forAccount('tenant-1', 'user-1', 'appt-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(executeInternal).not.toHaveBeenCalled();
    expect(executeCrm).not.toHaveBeenCalled();
  });

  it('denies the wrong tenant without calling the executor', async () => {
    const { service, executeInternal, context } = setup();
    context.assertTenantId.mockImplementation((tenantId: string) => {
      if (tenantId !== 'tenant-1') throw new ForbiddenException('wrong tenant');
      return tenantId;
    });

    await expect(
      service.forAccount('tenant-2', 'user-1', 'appt-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(executeInternal).not.toHaveBeenCalled();
  });

  it('creates or reuses a canonical Action Engine execution for accepted cancel', async () => {
    const { service, executeInternal } = setup();
    await service.forAccount('tenant-1', 'user-1', 'appt-1');
    await service.forAccount('tenant-1', 'user-1', 'appt-1');
    const calls = executeInternal.mock.calls as Array<
      [string, string, CancelInvocation]
    >;
    const first = calls[0][2];
    const second = calls[1][2];
    expect(first.callerIdempotency.key).toBe(second.callerIdempotency.key);
  });

  it('creates no ActionExecution when cancellation is rejected', async () => {
    const { service, executeInternal, executeCrm } = setup({ links: [] });
    await expect(
      service.forAccount('tenant-1', 'user-1', 'appt-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(executeInternal).not.toHaveBeenCalled();
    expect(executeCrm).not.toHaveBeenCalled();
  });

  it('converges concurrent cancellation onto one Action Engine identity', async () => {
    const { service, executeInternal } = setup();
    await Promise.all([
      service.forAccount('tenant-1', 'user-1', 'appt-1'),
      service.forAccount('tenant-1', 'user-1', 'appt-1'),
    ]);
    const calls = executeInternal.mock.calls as Array<
      [string, string, CancelInvocation]
    >;
    const keys = calls.map((call) => call[2].callerIdempotency.key);
    expect(new Set(keys).size).toBe(1);
  });

  it('preserves CRM UNKNOWN without a local Appointment write', async () => {
    const { service, executeCrm, prisma } = setup({
      appointment: {
        id: 'appt-1',
        tenantId: 'tenant-1',
        clientId: null,
        mayaClientId: 'client-1',
        branchId: 'branch-1',
        crmExternalId: 'crm-1',
        crmProvider: 'yclients',
        source: 'external',
        staffExternalId: 'staff-1',
        serviceIds: [],
        startAt: new Date(Date.now() + 86_400_000),
        endAt: new Date(Date.now() + 90_000_000),
        blockedStartAt: new Date(Date.now() + 86_400_000),
        blockedEndAt: new Date(Date.now() + 90_000_000),
        status: 'confirmed',
        notes: null,
        totalPriceKopecks: 1000,
        currency: 'RUB',
        providerPayload: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        branch: null,
      },
    });
    executeCrm.mockRejectedValue(
      new ActionExecutionUncertainError(
        'crm_provider_outcome_unknown',
        'CRM did not answer',
      ),
    );

    await expect(
      service.forAccount('tenant-1', 'user-1', 'appt-1'),
    ).rejects.toMatchObject({
      response: {
        message:
          'Результат отмены пока неизвестен. Проверьте актуальное состояние записи перед новым действием.',
        error: { code: 'crm_outcome_unknown' },
      },
    });
    expect(prisma.appointment.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a started appointment before Action Engine ingress', async () => {
    const { service, executeInternal } = setup({
      appointment: {
        id: 'appt-1',
        tenantId: 'tenant-1',
        clientId: null,
        mayaClientId: 'client-1',
        branchId: null,
        crmExternalId: null,
        source: 'internal',
        staffExternalId: 'staff-1',
        serviceIds: [],
        startAt: new Date(Date.now() - 60_000),
        endAt: new Date(),
        blockedStartAt: new Date(Date.now() - 60_000),
        blockedEndAt: new Date(),
        status: 'confirmed',
        notes: null,
        totalPriceKopecks: 1000,
        currency: 'RUB',
        providerPayload: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        branch: null,
      },
    });

    await expect(
      service.forAccount('tenant-1', 'user-1', 'appt-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(executeInternal).not.toHaveBeenCalled();
  });
});

/** U-OWN·V11: the read-only half of the cancel owner. `forAccount` must be that
 * read plus the existing execution, with the same codes and the same order. */
const CANCELLED_APPOINTMENT = {
  id: 'appt-1',
  tenantId: 'tenant-1',
  clientId: null,
  mayaClientId: 'client-1',
  branchId: null,
  crmExternalId: null,
  source: 'internal',
  staffExternalId: 'staff-1',
  serviceIds: [],
  startAt: new Date(Date.now() + 86_400_000),
  endAt: new Date(Date.now() + 90_000_000),
  blockedStartAt: new Date(Date.now() + 86_400_000),
  blockedEndAt: new Date(Date.now() + 90_000_000),
  status: 'cancelled',
  notes: null,
  totalPriceKopecks: 1000,
  currency: 'RUB',
  providerPayload: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  branch: null,
};

describe('U-OWN read-only cancel target', () => {
  it('reads the owned target without an execution or a post-execution read', async () => {
    const { service, tx, prisma, executeInternal, executeCrm } = setup();

    await expect(
      service.readOwnedCancelTarget('tenant-1', 'user-1', 'appt-1'),
    ).resolves.toMatchObject({
      target: {
        tenantId: 'tenant-1',
        clientId: 'client-1',
        linkId: 'link-1',
        appointment: { id: 'appt-1' },
      },
      storedStatus: 'confirmed',
      canonicalStatus: 'scheduled',
      alreadyCancelled: false,
    });

    expect(tx.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'appt-1', tenantId: 'tenant-1', mayaClientId: 'client-1' },
      }),
    );
    expect(executeInternal).not.toHaveBeenCalled();
    expect(executeCrm).not.toHaveBeenCalled();
    expect(prisma.appointment.findFirst).not.toHaveBeenCalled();
  });

  it('surfaces an already cancelled target while the owner cancel is unchanged', async () => {
    const { service, executeInternal } = setup({
      appointment: CANCELLED_APPOINTMENT,
    });

    await expect(
      service.readOwnedCancelTarget('tenant-1', 'user-1', 'appt-1'),
    ).resolves.toMatchObject({
      storedStatus: 'cancelled',
      canonicalStatus: 'canceled',
      alreadyCancelled: true,
    });
    // B-18 maps `already_cancelled` in the caller, never in the owner: the
    // owner still admits the same appointment it admitted before U-OWN.
    await expect(
      service.forAccount('tenant-1', 'user-1', 'appt-1'),
    ).resolves.toMatchObject({ id: 'appt-1' });
    expect(executeInternal).toHaveBeenCalledTimes(1);
  });

  it('runs forAccount as that extraction plus the existing execution', async () => {
    const { service, executeInternal } = setup();
    const extraction = jest.spyOn(service, 'readOwnedCancelTarget');

    await service.forAccount('tenant-1', 'user-1', 'appt-1');

    expect(extraction).toHaveBeenCalledTimes(1);
    expect(extraction).toHaveBeenCalledWith('tenant-1', 'user-1', 'appt-1');
    const quote = (await extraction.mock.results[0].value) as {
      target: { appointment: { id: string } };
    };
    const calls = executeInternal.mock.calls as Array<
      [string, string, CancelInvocation]
    >;
    expect(calls[0][1]).toBe(quote.target.appointment.id);
  });

  it.each([
    ['missing binding', { links: [] }, ForbiddenException],
    ['a foreign appointment', { appointment: null }, NotFoundException],
    ['a principal mismatch', { principalUserId: 'user-2' }, ForbiddenException],
  ])(
    'refuses %s with the owner code and no execution',
    async (_case, options, expected) => {
      const { service, executeInternal, executeCrm } = setup(options);

      await expect(
        service.readOwnedCancelTarget('tenant-1', 'user-1', 'appt-1'),
      ).rejects.toBeInstanceOf(expected);
      await expect(
        service.forAccount('tenant-1', 'user-1', 'appt-1'),
      ).rejects.toBeInstanceOf(expected);
      expect(executeInternal).not.toHaveBeenCalled();
      expect(executeCrm).not.toHaveBeenCalled();
    },
  );

  it('refuses the wrong tenant before the ownership transaction', async () => {
    const { service, tx, context, executeInternal } = setup();
    context.assertTenantId.mockImplementation((tenantId: string) => {
      if (tenantId !== 'tenant-1') throw new ForbiddenException('wrong tenant');
      return tenantId;
    });

    await expect(
      service.readOwnedCancelTarget('tenant-2', 'user-1', 'appt-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.appointment.findFirst).not.toHaveBeenCalled();
    expect(executeInternal).not.toHaveBeenCalled();
  });
});

// Status reads use a server-resolved original target; no caller Appointment id.
describe('existing Client cancellation status authority', () => {
  function fixture() {
    const appointment = {
      ...CANCELLED_APPOINTMENT,
      status: 'confirmed',
      source: 'external',
      crmProvider: 'yclients',
      crmExternalId: '501',
      branchId: 'branch-1',
    };
    const f = setup({ appointment });
    const target = jest.fn().mockResolvedValue({ appointmentId: 'appt-1' });
    const status = jest.fn(
      async (input: { authorize: () => Promise<void> }) => {
        await input.authorize();
        return { executionId: 'cancel-original', state: 'SUCCEEDED' };
      },
    );
    Object.assign(f.crm, {
      readClientCancelStatusTarget: target,
      readClientCancelStatus: status,
    });
    const revalidate = jest
      .fn<Promise<void>, []>()
      .mockResolvedValue(undefined);
    const read = (tenant = 'tenant-1', user = 'user-1') =>
      f.service.readStatusForAccount(tenant, user, 'stored-key', revalidate);
    const noCancel = () => {
      expect(f.executeCrm).not.toHaveBeenCalled();
      expect(f.executeInternal).not.toHaveBeenCalled();
    };
    return { ...f, appointment, target, status, revalidate, read, noCancel };
  }

  it('uses only original server alias and exact verified Client ownership', async () => {
    const f = fixture();
    await expect(f.read()).resolves.toMatchObject({
      executionId: 'cancel-original',
    });
    expect(f.target).toHaveBeenCalledWith('tenant-1', 'stored-key');
    expect(f.tx.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'appt-1', tenantId: 'tenant-1', mayaClientId: 'client-1' },
      }),
    );
    expect(f.status).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        linkId: 'link-1',
        appointmentId: 'appt-1',
        externalId: '501',
        key: 'stored-key',
      }),
    );
    expect(f.crm.assertClientAppointmentBranchOrigin).toHaveBeenCalled();
    f.noCancel();
  });

  it('can inspect an old uncertain cancellation, but cannot start cancellation after appointment start', async () => {
    const f = fixture();
    f.appointment.startAt = new Date('2000-01-01T00:00:00Z');
    await expect(f.read()).resolves.toMatchObject({ state: 'SUCCEEDED' });
    await expect(
      f.service.forAccount('tenant-1', 'user-1', 'appt-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    f.noCancel();
  });

  it('returns missing original operation without constructing an action', async () => {
    const f = fixture();
    f.target.mockResolvedValue(null);
    await expect(f.read()).resolves.toBeNull();
    expect(f.status).not.toHaveBeenCalled();
    expect(f.tx.appointment.findFirst).not.toHaveBeenCalled();
    f.noCancel();
  });

  it.each([
    'actor',
    'tenant',
    'membership',
    'link',
    'merged-client',
    'foreign-appointment',
    'widget',
  ])('refuses absent current authority: %s', async (reason) => {
    const f = fixture();
    if (reason === 'membership')
      f.tx.membership.findFirst.mockResolvedValue(null);
    if (reason === 'link')
      f.tx.clientChannelLink.findMany.mockResolvedValue([]);
    if (reason === 'merged-client')
      f.tx.client.findUnique.mockResolvedValue({
        id: 'client-1',
        mergedIntoClientId: 'other',
      });
    if (reason === 'foreign-appointment')
      f.tx.appointment.findFirst.mockResolvedValue(null);
    if (reason === 'widget')
      f.revalidate.mockRejectedValue(new Error('widget revoked'));
    if (reason === 'tenant')
      f.context.assertTenantId.mockImplementation(() => {
        throw new ForbiddenException();
      });
    await expect(
      f.read(
        reason === 'tenant' ? 'tenant-2' : 'tenant-1',
        reason === 'actor' ? 'user-2' : 'user-1',
      ),
    ).rejects.toThrow();
    expect(f.status).not.toHaveBeenCalled();
    f.noCancel();
  });

  it.each([
    'link',
    'client',
    'source',
    'crmProvider',
    'crmExternalId',
    'branchId',
    'revision',
  ])('refuses changed %s during the original result read', async (field) => {
    const f = fixture();
    f.status.mockImplementation(async (input) => {
      if (field === 'link')
        f.tx.clientChannelLink.findMany.mockResolvedValue([]);
      else if (field === 'client')
        f.tx.client.findUnique.mockResolvedValue(null);
      else if (field === 'revision')
        f.crm.readBranchAvailabilityRevision.mockResolvedValue('changed');
      else
        f.tx.appointment.findFirst.mockResolvedValue({
          ...f.appointment,
          [field]: 'changed',
        });
      await input.authorize();
      return { executionId: 'cancel-original', state: 'SUCCEEDED' };
    });
    await expect(f.read()).rejects.toThrow();
    f.noCancel();
  });
});
