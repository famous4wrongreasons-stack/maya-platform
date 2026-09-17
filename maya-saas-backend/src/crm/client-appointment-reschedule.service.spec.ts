import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ActionExecutionUncertainError } from '../action-engine';
import { ClientAppointmentRescheduleService } from './client-appointment-reschedule.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

type Options = {
  links?: Array<Record<string, unknown>>;
  client?: Record<string, unknown> | null;
  appointment?: Record<string, unknown> | null;
  membership?: Record<string, unknown> | null;
  principalUserId?: string;
  slots?: Array<Record<string, unknown>>;
};

type RescheduleInvocation = {
  sourceType: string;
  sourceRef: string;
  authorizationCheck: () => Promise<void>;
  callerIdempotency: { scope: string; key: string };
};

type RescheduleExecutor = (
  tenantId: string,
  params: Record<string, unknown>,
  invocation: RescheduleInvocation,
) => Promise<{
  value: { external_id: string; status: string; start: string };
  execution: { state: string; executionId: string };
}>;

const FUTURE = new Date(Date.now() + 86_400_000);

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
          branchId: null,
          crmExternalId: null,
          source: 'internal',
          staffExternalId: 'staff-1',
          serviceIds: ['svc-1'],
          startAt: FUTURE,
          endAt: new Date(FUTURE.getTime() + 3_600_000),
          blockedStartAt: FUTURE,
          blockedEndAt: new Date(FUTURE.getTime() + 3_600_000),
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
      findFirst: jest.fn().mockResolvedValue(
        appointment
          ? {
              ...appointment,
              startAt: new Date('2026-09-20T10:00:00.000Z'),
            }
          : null,
      ),
    },
    branch: { findFirst: jest.fn().mockResolvedValue(null) },
    tenant: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ defaultTimezone: 'Europe/Moscow' }),
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
  const executeInternal = jest.fn<RescheduleExecutor>().mockResolvedValue({
    value: {
      external_id: 'appt-1',
      status: 'confirmed',
      start: '2026-09-20T10:00:00.000Z',
    },
    execution: { state: 'SUCCEEDED', executionId: 'exec-1' },
  });
  const executeCrm = jest.fn<RescheduleExecutor>().mockResolvedValue({
    value: {
      external_id: 'crm-1',
      status: 'confirmed',
      start: '2026-09-20T10:00:00.000Z',
    },
    execution: { state: 'SUCCEEDED', executionId: 'exec-crm' },
  });
  const getAvailableSlots = jest.fn().mockResolvedValue(
    options.slots === undefined
      ? [
          {
            start: '2026-09-20T13:00:00',
            end: '2026-09-20T14:00:00',
            staff_id: 'staff-1',
            branch_id: null,
          },
        ]
      : options.slots,
  );
  const crm = {
    executeInternalAppointmentRescheduleWithReceipt: executeInternal,
    executeRescheduleAppointmentWithReceipt: executeCrm,
    getServices: jest.fn().mockResolvedValue([
      {
        id: 'svc-1',
        name: 'Cut',
        price: 1000,
        duration_minutes: 60,
        currency: 'RUB',
      },
    ]),
    getAvailableSlots,
  };
  const service = new ClientAppointmentRescheduleService(
    prisma as never,
    context as unknown as TenantContextService,
    encryption as never,
    crm as never,
  );
  return {
    service,
    tx,
    prisma,
    crm,
    executeInternal,
    executeCrm,
    getAvailableSlots,
    context,
  };
}

const dto = { start: '2026-09-20T13:00:00' };

describe('B30 verified Client appointment reschedule authority', () => {
  it('reschedules an owned internal Appointment through the existing Action Engine action', async () => {
    const { service, tx, executeInternal, executeCrm } = setup();

    await expect(
      service.forAccount('tenant-1', 'user-1', 'appt-1', dto),
    ).resolves.toMatchObject({
      appointment: { id: 'appt-1' },
    });

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
      [string, Record<string, unknown>, RescheduleInvocation]
    >;
    const invocation = calls[0][2];
    expect(invocation.sourceType).toBe('authenticated_request');
    expect(invocation.callerIdempotency.scope).toBe(
      'appointments.http.reschedule.v1',
    );
    await invocation.authorizationCheck();
    expect(executeCrm).not.toHaveBeenCalled();
  });

  it('allows a Client without Maya User through a verified maya_user binding', async () => {
    const { service, executeInternal } = setup({
      client: { id: 'client-1', mergedIntoClientId: null, userId: null },
    });

    await expect(
      service.forAccount('tenant-1', 'user-1', 'appt-1', dto),
    ).resolves.toMatchObject({ appointment: { id: 'appt-1' } });
    expect(executeInternal).toHaveBeenCalledTimes(1);
  });

  it('denies missing binding without ActionExecution or Appointment mutation', async () => {
    const { service, executeInternal, executeCrm, prisma, getAvailableSlots } =
      setup({
        links: [],
      });

    await expect(
      service.forAccount('tenant-1', 'user-1', 'appt-1', dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(executeInternal).not.toHaveBeenCalled();
    expect(executeCrm).not.toHaveBeenCalled();
    expect(getAvailableSlots).not.toHaveBeenCalled();
    expect(prisma.appointment.findFirst).not.toHaveBeenCalled();
  });

  it('denies revoked binding without ActionExecution', async () => {
    const { service, executeInternal } = setup({ links: [] });

    await expect(
      service.forAccount('tenant-1', 'user-1', 'appt-1', dto),
    ).rejects.toThrow('client_link_required');
    expect(executeInternal).not.toHaveBeenCalled();
  });

  it('denies Client A from rescheduling Client B Appointment', async () => {
    const { service, executeInternal, executeCrm } = setup({
      appointment: null,
    });

    await expect(
      service.forAccount('tenant-1', 'user-1', 'appt-b', dto),
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
      service.forAccount('tenant-2', 'user-1', 'appt-1', dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(executeInternal).not.toHaveBeenCalled();
  });

  it('creates or reuses a canonical Action Engine execution for accepted reschedule', async () => {
    const { service, executeInternal } = setup();
    await service.forAccount('tenant-1', 'user-1', 'appt-1', dto);
    await service.forAccount('tenant-1', 'user-1', 'appt-1', dto);
    const calls = executeInternal.mock.calls as Array<
      [string, Record<string, unknown>, RescheduleInvocation]
    >;
    expect(calls[0][2].callerIdempotency.key).toBe(
      calls[1][2].callerIdempotency.key,
    );
  });

  it('creates no ActionExecution when reschedule is rejected', async () => {
    const { service, executeInternal, executeCrm } = setup({ links: [] });
    await expect(
      service.forAccount('tenant-1', 'user-1', 'appt-1', dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(executeInternal).not.toHaveBeenCalled();
    expect(executeCrm).not.toHaveBeenCalled();
  });

  it('converges concurrent reschedule onto one Action Engine identity', async () => {
    const { service, executeInternal } = setup();
    await Promise.all([
      service.forAccount('tenant-1', 'user-1', 'appt-1', dto),
      service.forAccount('tenant-1', 'user-1', 'appt-1', dto),
    ]);
    const calls = executeInternal.mock.calls as Array<
      [string, Record<string, unknown>, RescheduleInvocation]
    >;
    const keys = calls.map((call) => call[2].callerIdempotency.key);
    expect(new Set(keys).size).toBe(1);
  });

  it('rejects an invalid new time before Action Engine ingress', async () => {
    const { service, executeInternal, executeCrm } = setup({ slots: [] });

    await expect(
      service.forAccount('tenant-1', 'user-1', 'appt-1', dto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(executeInternal).not.toHaveBeenCalled();
    expect(executeCrm).not.toHaveBeenCalled();
  });

  it('preserves CRM UNKNOWN without a local Appointment write', async () => {
    const { service, executeCrm, prisma } = setup({
      appointment: {
        id: 'appt-1',
        tenantId: 'tenant-1',
        clientId: null,
        mayaClientId: 'client-1',
        branchId: null,
        crmExternalId: 'crm-1',
        source: 'external',
        staffExternalId: 'staff-1',
        serviceIds: ['svc-1'],
        startAt: FUTURE,
        endAt: new Date(FUTURE.getTime() + 3_600_000),
        blockedStartAt: FUTURE,
        blockedEndAt: new Date(FUTURE.getTime() + 3_600_000),
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
      service.forAccount('tenant-1', 'user-1', 'appt-1', dto),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
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
        serviceIds: ['svc-1'],
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
      service.forAccount('tenant-1', 'user-1', 'appt-1', dto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(executeInternal).not.toHaveBeenCalled();
  });
});

/** U-OWN·V11: the read-only half of the reschedule owner. `forAccount` must be
 * that quote plus the existing execution, with the same codes and order. */
const CANCELLED_APPOINTMENT = {
  id: 'appt-1',
  tenantId: 'tenant-1',
  clientId: null,
  mayaClientId: 'client-1',
  branchId: null,
  crmExternalId: null,
  source: 'internal',
  staffExternalId: 'staff-1',
  serviceIds: ['svc-1'],
  startAt: FUTURE,
  endAt: new Date(FUTURE.getTime() + 3_600_000),
  blockedStartAt: FUTURE,
  blockedEndAt: new Date(FUTURE.getTime() + 3_600_000),
  status: 'cancelled',
  notes: null,
  totalPriceKopecks: 1000,
  currency: 'RUB',
  providerPayload: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  branch: null,
};

describe('U-OWN read-only reschedule quote', () => {
  it('quotes the owned reschedule without an execution or a post-execution read', async () => {
    const { service, tx, prisma, executeInternal, executeCrm } = setup();

    await expect(
      service.quoteOwnedReschedule('tenant-1', 'user-1', 'appt-1', dto),
    ).resolves.toMatchObject({
      target: {
        tenantId: 'tenant-1',
        clientId: 'client-1',
        linkId: 'link-1',
        appointment: { id: 'appt-1' },
      },
      prepared: {
        matchedSlotStart: '2026-09-20T13:00:00',
        timezone: 'Europe/Moscow',
        staffId: 'staff-1',
        serviceIds: ['svc-1'],
      },
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

  it('runs forAccount as that quote plus the existing execution', async () => {
    const { service, executeInternal } = setup();
    const quote = jest.spyOn(service, 'quoteOwnedReschedule');

    await service.forAccount('tenant-1', 'user-1', 'appt-1', dto);

    expect(quote).toHaveBeenCalledTimes(1);
    expect(quote).toHaveBeenCalledWith('tenant-1', 'user-1', 'appt-1', dto);
    const quoted = (await quote.mock.results[0].value) as {
      prepared: { start: string; staffId: string; serviceIds: string[] };
    };
    const calls = executeInternal.mock.calls as Array<
      [string, Record<string, unknown>, RescheduleInvocation]
    >;
    // the internal branch dispatches the quote's canonical instant
    expect(calls[0][1]).toMatchObject({
      start: quoted.prepared.start,
      staffId: quoted.prepared.staffId,
      serviceIds: quoted.prepared.serviceIds,
    });
  });

  it.each([
    [
      'an already cancelled appointment',
      { appointment: CANCELLED_APPOINTMENT },
      ConflictException,
    ],
    ['an unavailable slot', { slots: [] }, BadRequestException],
    ['a foreign appointment', { appointment: null }, NotFoundException],
    ['missing binding', { links: [] }, ForbiddenException],
    ['a principal mismatch', { principalUserId: 'user-2' }, ForbiddenException],
  ])(
    'refuses %s with the owner code and no execution',
    async (_case, options, expected) => {
      const { service, executeInternal, executeCrm } = setup(options);

      await expect(
        service.quoteOwnedReschedule('tenant-1', 'user-1', 'appt-1', dto),
      ).rejects.toBeInstanceOf(expected);
      await expect(
        service.forAccount('tenant-1', 'user-1', 'appt-1', dto),
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
      service.quoteOwnedReschedule('tenant-2', 'user-1', 'appt-1', dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.appointment.findFirst).not.toHaveBeenCalled();
    expect(executeInternal).not.toHaveBeenCalled();
  });
});
