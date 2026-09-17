import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
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
        branchId: null,
        crmExternalId: 'crm-1',
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
