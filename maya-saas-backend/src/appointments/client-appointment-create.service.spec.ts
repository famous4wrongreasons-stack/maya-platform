import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ActionCapabilityRegistry,
  type ActionRuntimeHandlers,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import { ClientAppointmentCreateService } from './client-appointment-create.service';
import { CrmService } from '../crm/crm.service';
import { CrmOutcomeUnknownError } from '../crm/crm-request.errors';
import { TenantContextService } from '../tenancy/tenant-context.service';

const START = '2099-09-20T10:00:00.000Z';
const END = '2099-09-20T11:00:00.000Z';
function setup() {
  const context = new TenantContextService();
  const link = {
    id: 'link-1',
    tenantId: 'tenant-1',
    clientId: 'client-1',
    revokedAt: null,
    verificationVersion: 1,
    subjectHashVersion: 1,
    verificationEvidenceHash: 'evidence',
  };
  const rows: Array<Record<string, unknown>> = [];
  const client = {
    id: 'client-1',
    tenantId: 'tenant-1',
    mergedIntoClientId: null,
    user: null,
    crmLinks: [],
  };
  const prisma = {
    crmIntegration: {
      findUnique: jest.fn().mockResolvedValue({
        provider: 'yclients',
        settingsJson: { companyId: 42 },
      }),
    },
    unresolvedClientIdentityHold: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    membership: { findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }) },
    clientChannelLink: { findMany: jest.fn().mockResolvedValue([link]) },
    client: { findUnique: jest.fn().mockResolvedValue(client) },
    tenant: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ defaultTimezone: 'Europe/Moscow' }),
    },
    branch: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'branch-1', timezone: 'Europe/Moscow' }),
    },
    actionExecution: { findUnique: jest.fn().mockResolvedValue(null) },
    appointment: {
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          rows.find((row) =>
            Object.entries(where).every(([key, value]) => row[key] === value),
          ) ?? null,
        ),
      ),
      upsert: jest.fn(({ create }: { create: Record<string, unknown> }) => {
        const row = { id: 'mirror-1', ...create };
        rows.push(row);
        return Promise.resolve(row);
      }),
      updateMany: jest.fn(),
    },
  };
  const services = [
    {
      id: 'svc-1',
      name: 'Cut',
      price: 2500,
      duration_minutes: 60,
      currency: 'RUB',
    },
  ];
  const slots = [
    { start: START, end: END, staff_id: 'staff-1', branch_id: null },
  ];
  const provider = {
    createAppointment: jest.fn().mockResolvedValue({
      external_id: 'remote-1',
      status: 'confirmed',
      start: START,
      end: END,
      staff_id: 'staff-1',
      service_ids: ['svc-1'],
    }),
    getClientAppointments: jest.fn().mockResolvedValue([]),
  };
  const calendar = {
    getAvailableSlots: jest.fn().mockResolvedValue(slots),
    getServiceTiming: jest
      .fn()
      .mockResolvedValue({ bufferBeforeMinutes: 10, bufferAfterMinutes: 5 }),
  };
  const plans: Array<{
    request: TrustedActionExecutionRequestV1;
    handlers: ActionRuntimeHandlers<unknown>;
    input: Record<string, unknown>;
  }> = [];
  const registry = new ActionCapabilityRegistry();
  const runtime = {
    resolveClientBookingRetry: jest.fn().mockResolvedValue(null),
    preview: jest.fn((request: TrustedActionExecutionRequestV1) =>
      Promise.resolve({
        identityFingerprint: createHash('sha256')
          .update(
            JSON.stringify(
              registry.get(request.capability).normalizeInput(request.input),
            ),
          )
          .digest('hex'),
      }),
    ),
    executeWithReceipt: jest.fn(
      async (
        request: TrustedActionExecutionRequestV1,
        handlers: ActionRuntimeHandlers<unknown>,
      ) => {
        const input = registry
          .get(request.capability)
          .normalizeInput(request.input);
        plans.push({ request, handlers, input });
        const result = await handlers.dispatch(input, 'transport-key', {
          tenantId: request.tenantId,
          executionId: 'execution-1',
        });
        return {
          value: result.value,
          execution: { state: 'SUCCEEDED', executionId: 'execution-1' },
        };
      },
    ),
  };
  const crm = Object.assign(Object.create(CrmService.prototype) as CrmService, {
    prisma,
    tenantContext: context,
    actionEngineRuntime: runtime,
    internalCalendarService: calendar,
    getCalendarSource: jest.fn().mockResolvedValue('internal'),
    getExternalProviderKey: jest.fn().mockResolvedValue('yclients'),
    getAdapterForTenant: jest.fn().mockResolvedValue(provider),
    getServices: jest.fn().mockResolvedValue(services),
    getAvailableSlots: jest.fn().mockResolvedValue(slots),
    resolveStaffIdForBooking: jest.fn().mockResolvedValue('maya-staff-1'),
  });
  const service = new ClientAppointmentCreateService(
    prisma as never,
    context,
    {
      opaqueReference: () => 'a'.repeat(64),
      decrypt: () => 'Bound Client',
    } as never,
    crm,
  );
  const dto = {
    staffId: 'staff-1',
    serviceIds: ['svc-1'],
    start: START,
    clientName: 'Guest',
    clientPhone: '+79990001122',
  };
  const run = (input = dto, tenantId = 'tenant-1', userId = 'user-1') =>
    context.runAsAuthPrincipal(
      { tenantId: 'tenant-1', userId: 'user-1', role: 'client' },
      () => service.forAccount(tenantId, userId, input),
    );
  return {
    service,
    prisma,
    client,
    link,
    rows,
    plans,
    runtime,
    crm,
    provider,
    calendar,
    dto,
    run,
  };
}

describe('B31 verified Client create initiator and canonical executor', () => {
  it('creates an owned internal Appointment through the existing action without a Maya User', async () => {
    const h = setup();
    const result = await h.run();
    expect(result.appointment).toMatchObject({
      tenantId: 'tenant-1',
      mayaClientId: 'client-1',
      clientId: null,
      id: 'appointment-action:execution-1',
      staffId: 'maya-staff-1',
      staffExternalId: 'staff-1',
      totalPriceKopecks: 250000,
    });
    expect(h.runtime.executeWithReceipt).toHaveBeenCalledTimes(1);
    expect(h.plans[0].request.capability).toBe('crm.appointment.create.v1');
    expect(h.plans[0].input.clientId).toBe('client-1');
    expect(h.provider.createAppointment).not.toHaveBeenCalled();
    expect(result.appointment.blockedStartAt.toISOString()).toBe(
      '2099-09-20T09:50:00.000Z',
    );
  });

  it('resolves Client-without-User contact through one exact active CRM link', async () => {
    const h = setup();
    h.prisma.client.findUnique.mockResolvedValue({
      ...h.client,
      crmLinks: [{ provider: 'yclients', externalId: 'client-external' }],
    });
    h.crm.getClientRegistry = jest.fn().mockResolvedValue({
      provider: 'yclients',
      clients: [
        {
          external_id: 'client-external',
          name: 'Guest',
          phone: '+79990001122',
        },
        { external_id: 'unrelated', name: 'Other', phone: '+79990003344' },
      ],
    });
    const result = await h.run({ ...h.dto, clientName: '', clientPhone: '' });
    expect(result.appointment.mayaClientId).toBe('client-1');
    expect(h.plans[0].input.clientName).toBe('Guest');
    expect(h.plans[0].input.clientPhone).toBe('+79990001122');
  });

  it.each([
    'missing',
    'revoked',
    'ambiguous',
    'merged',
    'wrong_tenant',
    'wrong_user',
    'inactive',
    'unsupported_version',
  ])('rejects %s before any Action Engine ingress or write', async (mode) => {
    const h = setup();
    if (mode === 'missing' || mode === 'revoked')
      h.prisma.clientChannelLink.findMany.mockResolvedValue([]);
    if (mode === 'ambiguous')
      h.prisma.clientChannelLink.findMany.mockResolvedValue([h.link, h.link]);
    if (mode === 'merged')
      h.prisma.client.findUnique.mockResolvedValue({
        ...h.client,
        mergedIntoClientId: 'other',
      });
    if (mode === 'inactive')
      h.prisma.membership.findFirst.mockResolvedValue(null);
    if (mode === 'unsupported_version') h.link.verificationVersion = 2;
    await expect(
      h.run(
        h.dto,
        mode === 'wrong_tenant' ? 'tenant-2' : 'tenant-1',
        mode === 'wrong_user' ? 'user-2' : 'user-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.runtime.executeWithReceipt).not.toHaveBeenCalled();
    expect(h.prisma.appointment.upsert).not.toHaveBeenCalled();
    expect(h.provider.createAppointment).not.toHaveBeenCalled();
    if (mode === 'revoked')
      expect(h.prisma.clientChannelLink.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          provider: 'maya_user',
          providerSubjectHash: 'a'.repeat(64),
          revokedAt: null,
        },
        take: 2,
      });
  });

  it('rejects an unavailable slot or invalid services before ingress', async () => {
    const h = setup();
    await expect(
      h.run({ ...h.dto, serviceIds: ['other-service'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    (h.crm.getAvailableSlots as jest.Mock).mockResolvedValue([]);
    await expect(h.run()).rejects.toBeInstanceOf(BadRequestException);
    expect(h.runtime.executeWithReceipt).not.toHaveBeenCalled();
  });

  it('rechecks exact Client and binding before dispatch', async () => {
    const h = setup();
    h.prisma.clientChannelLink.findMany
      .mockResolvedValueOnce([h.link])
      .mockResolvedValue([{ ...h.link, clientId: 'client-2' }]);
    await expect(h.run()).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.runtime.executeWithReceipt).not.toHaveBeenCalled();
    expect(h.rows).toHaveLength(0);
  });

  it('restores the execution-owned internal row on repeat without another write', async () => {
    const h = setup();
    const first = await h.run();
    h.prisma.actionExecution.findUnique.mockResolvedValue({
      id: 'execution-1',
    });
    (h.crm.getAvailableSlots as jest.Mock).mockResolvedValue([]);
    const second = await h.run();
    expect(second.appointment.id).toBe(first.appointment.id);
    expect(h.prisma.appointment.upsert).toHaveBeenCalledTimes(1);
    expect(h.plans[0].input).toEqual(h.plans[1].input);
    const result = await h.plans[0].handlers.reconcile(
      h.plans[0].input,
      undefined,
      { tenantId: 'tenant-1', executionId: 'execution-1' },
    );
    expect(result.outcome).toBe('PROVEN_SUCCEEDED');
  });

  it.each([
    ['Asia/Novosibirsk', null, '2099-09-20T17:00:00'],
    ['Asia/Novosibirsk', 'Europe/Moscow', '2099-09-20T13:00:00'],
  ])(
    'preserves branch/tenant wall time (%s, %s)',
    async (tenantTimezone, branchTimezone, start) => {
      const h = setup();
      h.prisma.tenant.findUnique.mockResolvedValue({
        defaultTimezone: tenantTimezone,
      });
      h.prisma.branch.findFirst.mockResolvedValue({
        id: 'branch-1',
        timezone: branchTimezone,
      });
      await h.run({ ...h.dto, start, branchId: 'branch-1' } as typeof h.dto);
      expect(h.plans[0].input.start).toBe(START);
    },
  );

  it('keeps unresolved staff identity null rather than substituting the external id', async () => {
    const h = setup();
    (h.crm.resolveStaffIdForBooking as jest.Mock).mockResolvedValue(null);
    expect((await h.run()).appointment.staffId).toBeNull();
  });

  it('persists the exact canonical owner inside CRM dispatch and reconciliation', async () => {
    const h = setup();
    (h.crm.getCalendarSource as jest.Mock).mockResolvedValue('external');
    h.prisma.client.findUnique.mockResolvedValue({
      ...h.client,
      user: { encryptedName: 'cipher', phone: '+79990001122' },
    });
    const result = await h.run();
    expect(result.appointment).toMatchObject({
      mayaClientId: 'client-1',
      tenantId: 'tenant-1',
      crmExternalId: 'remote-1',
      clientId: null,
    });
    expect(h.provider.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'client-1', notifyBySmsHours: 0 }),
    );
    h.provider.getClientAppointments.mockResolvedValue([
      h.provider.createAppointment.mock.results[0]
        ? await h.provider.createAppointment.mock.results[0].value
        : {},
    ]);
    expect(
      (await h.plans[0].handlers.reconcile(h.plans[0].input)).outcome,
    ).toBe('PROVEN_SUCCEEDED');
    expect(h.provider.createAppointment).toHaveBeenCalledTimes(1);
  });

  it('keeps provider timeout and post-provider mirror failure UNKNOWN without blind retry', async () => {
    const h = setup();
    (h.crm.getCalendarSource as jest.Mock).mockResolvedValue('external');
    h.prisma.client.findUnique.mockResolvedValue({
      ...h.client,
      user: { encryptedName: 'cipher', phone: '+79990001122' },
    });
    h.prisma.appointment.upsert.mockRejectedValue(
      new Error('database response lost'),
    );
    await expect(h.run()).rejects.toBeInstanceOf(CrmOutcomeUnknownError);
    const plan = h.plans[0];
    expect(
      plan.handlers.classifyError(
        new CrmOutcomeUnknownError('timeout'),
        'dispatch',
      ).kind,
    ).toBe('unknown');
    h.provider.getClientAppointments.mockResolvedValue([]);
    expect((await plan.handlers.reconcile(plan.input)).outcome).toBe(
      'PROVEN_NOT_EXECUTED',
    );
    h.provider.getClientAppointments.mockResolvedValue([
      {
        status: 'confirmed',
        start: START,
        staff_id: 'staff-1',
        service_ids: ['svc-1'],
      },
      {
        status: 'confirmed',
        start: START,
        staff_id: 'staff-1',
        service_ids: ['svc-1'],
      },
    ] as never);
    expect((await plan.handlers.reconcile(plan.input)).outcome).toBe(
      'STILL_UNKNOWN',
    );
    expect(h.provider.createAppointment).toHaveBeenCalledTimes(1);
  });

  it('rejects an external phone override before ingress or provider dispatch', async () => {
    const h = setup();
    (h.crm.getCalendarSource as jest.Mock).mockResolvedValue('external');
    h.prisma.client.findUnique.mockResolvedValue({
      ...h.client,
      user: { encryptedName: 'cipher', phone: '+79990001122' },
    });
    await expect(
      h.run({ ...h.dto, clientPhone: '+79990003344' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.runtime.executeWithReceipt).not.toHaveBeenCalled();
    expect(h.provider.createAppointment).not.toHaveBeenCalled();
  });

  it('maps a durable UNKNOWN to unavailable without claiming accepted ownership', async () => {
    const h = setup();
    const error = Object.assign(new Error('unknown'), {
      actionExecutionResult: { state: 'UNKNOWN' },
    });
    h.runtime.executeWithReceipt.mockRejectedValue(error);
    await expect(h.run()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(h.rows).toHaveLength(0);
  });
});
