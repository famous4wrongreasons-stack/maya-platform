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
import {
  observedServiceCatalog,
  BOOKING_FACTS_EVIDENCE_PREFIX,
} from '../crm/service-catalog-read';

const START = '2099-09-20T10:00:00.000Z';
const END = '2099-09-20T11:00:00.000Z';
function setup() {
  let executionEvidence: readonly string[] | null = null;
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
    crmLinks: [] as Array<{ provider: string; externalId: string }>,
  };
  const prisma = {
    internalProvider: {
      findFirst: jest.fn().mockResolvedValue({ branch: null }),
    },
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
    clientChannelLink: {
      findMany: jest.fn().mockResolvedValue([link]),
      findUnique: jest.fn().mockResolvedValue(link),
    },
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
    actionExecution: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn(() =>
        Promise.resolve({ evidenceRefsJson: executionEvidence ?? [] }),
      ),
    },
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
  const catalog = observedServiceCatalog(services, 'synthetic');
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
        executionEvidence ??= request.evidenceRefs;
        await handlers.prepare?.(input, {
          tenantId: request.tenantId,
          executionId: 'execution-1',
        });
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
    readServiceCatalog: jest.fn().mockResolvedValue(catalog),
    getStaff: jest
      .fn()
      .mockResolvedValue([
        { id: 'staff-1', name: '  Александр  ', phone: 'not-for-the-preview' },
      ]),
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
    context,
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
    catalog,
    dto,
    run,
  };
}

describe('B31 verified Client create initiator and canonical executor', () => {
  it('refuses a mixed source snapshot before quoting even without an inbound slot witness', async () => {
    const h = setup();
    (h.crm.getCalendarSource as jest.Mock).mockResolvedValue('external');
    h.prisma.client.findUnique.mockResolvedValue({
      ...h.client,
      user: { encryptedName: 'cipher', phone: '+79990001122' },
    });
    let currentRevision = 'a'.repeat(64);
    const revision = jest.fn(() => Promise.resolve(currentRevision));
    Object.assign(h.crm, { readBranchAvailabilityRevision: revision });
    h.prisma.branch.findFirst.mockImplementationOnce(() => {
      // The target was read from A, but the mapping/zone changed before the
      // branch read completed. No preview may stamp B onto that old target.
      currentRevision = 'b'.repeat(64);
      return Promise.resolve({
        id: 'branch-1',
        timezone: 'Asia/Yekaterinburg',
      });
    });
    await expect(
      h.context.runAsAuthPrincipal(
        { tenantId: 'tenant-1', userId: 'user-1', role: 'client' },
        () =>
          h.service.quoteForAccount('tenant-1', 'user-1', {
            ...h.dto,
            branchId: 'branch-1',
          }),
      ),
    ).rejects.toMatchObject({
      response: { error: { code: 'booking_preview_stale' } },
    });
    expect(revision).toHaveBeenCalledTimes(2);
    expect(h.crm.getAvailableSlots).not.toHaveBeenCalled();
    expect(h.runtime.executeWithReceipt).not.toHaveBeenCalled();
  });

  it('pins bound source revision in preview facts and refuses a changed mapping before AE ingress', async () => {
    const h = setup();
    (h.crm.getCalendarSource as jest.Mock).mockResolvedValue('external');
    h.prisma.client.findUnique.mockResolvedValue({
      ...h.client,
      user: { encryptedName: 'cipher', phone: '+79990001122' },
    });
    const revision = jest.fn().mockResolvedValue('a'.repeat(64));
    Object.assign(h.crm, { readBranchAvailabilityRevision: revision });
    const dto = { ...h.dto, branchId: 'branch-1' };
    const actor = { tenantId: 'tenant-1', userId: 'user-1', role: 'client' };
    const quoted = await h.context.runAsAuthPrincipal(actor, () =>
      h.service.quoteForAccount('tenant-1', 'user-1', dto),
    );
    expect(quoted.branchSourceRevision).toBe('a'.repeat(64));
    revision.mockResolvedValue('b'.repeat(64));
    await expect(
      h.context.runAsAuthPrincipal(actor, () =>
        h.service.forAccount('tenant-1', 'user-1', dto, {
          expectedBookingFactsHash: quoted.factsHash!,
        }),
      ),
    ).rejects.toMatchObject({
      response: { error: { code: 'booking_preview_stale' } },
    });
    await expect(
      h.context.runAsAuthPrincipal(actor, () =>
        h.service.quoteForAccount('tenant-1', 'user-1', dto, {
          branchSourceRevision: quoted.branchSourceRevision!,
        }),
      ),
    ).rejects.toMatchObject({
      response: { error: { code: 'booking_preview_stale' } },
    });
    expect(h.runtime.executeWithReceipt).not.toHaveBeenCalled();
    expect(h.provider.createAppointment).not.toHaveBeenCalled();
  });

  it('READY/reconciliation keep the originally persisted source after a new caller observes a changed mapping', async () => {
    const h = setup();
    (h.crm.getCalendarSource as jest.Mock).mockResolvedValue('external');
    h.prisma.client.findUnique.mockResolvedValue({
      ...h.client,
      user: { encryptedName: 'cipher', phone: '+79990001122' },
    });
    const revision = jest.fn().mockResolvedValue('a'.repeat(64));
    Object.assign(h.crm, { readBranchAvailabilityRevision: revision });
    await h.run({ ...h.dto, branchId: 'branch-1' } as typeof h.dto);
    const plan = h.plans[0];
    expect(plan.request.evidenceRefs).toContain(
      'crm-branch-source/1:' + 'a'.repeat(64),
    );
    revision.mockResolvedValue('b'.repeat(64));
    const context = { tenantId: 'tenant-1', executionId: 'execution-1' };
    await expect(
      h.context.runAsAuthPrincipal(
        { tenantId: 'tenant-1', userId: 'user-1', role: 'client' },
        () => plan.handlers.prepare!(plan.input, context),
      ),
    ).rejects.toMatchObject({
      response: { error: { code: 'booking_preview_stale' } },
    });
    await expect(
      h.context.runAsSystemTenant('tenant-1', () =>
        plan.handlers.reconcile(plan.input, undefined, context),
      ),
    ).resolves.toMatchObject({ outcome: 'STILL_UNKNOWN' });
    expect(h.provider.createAppointment).toHaveBeenCalledTimes(1);
    expect(h.provider.getClientAppointments).not.toHaveBeenCalled();
  });
  it('uses the common creator for an authenticated channel without an account actor', async () => {
    const h = setup();
    h.client.crmLinks.push({
      provider: 'yclients',
      externalId: 'canonical-contact',
    });
    Object.assign(h.crm, {
      getClientRegistry: jest.fn().mockResolvedValue({
        provider: 'yclients',
        clients: [
          {
            external_id: 'canonical-contact',
            name: 'Verified guest',
            phone: '+79990001122',
          },
        ],
      }),
    });
    await h.context.runAsPublicTenant('tenant-1', () =>
      h.service.forVerifiedChannel(
        'tenant-1',
        h.link.id,
        {
          staffId: h.dto.staffId,
          serviceIds: h.dto.serviceIds,
          start: h.dto.start,
        },
        { authorizationCheck: () => Promise.resolve() },
      ),
    );
    expect(h.plans[0].request.source.actorUserId).toBeUndefined();
    expect(h.plans[0].request.evidenceRefs).toEqual([
      'client-authority:v1:link-1',
      expect.stringMatching(
        new RegExp('^' + BOOKING_FACTS_EVIDENCE_PREFIX + '[a-f0-9]{64}$'),
      ),
    ]);
    expect(h.prisma.membership.findFirst).not.toHaveBeenCalled();
    expect(h.rows[0].mayaClientId).toBe('client-1');
  });

  it('rejects a new external intent without canonical contact instead of inventing a User', async () => {
    const h = setup();
    (h.crm.getCalendarSource as jest.Mock).mockResolvedValue('external');
    await expect(h.run()).rejects.toThrow(
      'Verified Client booking identity unavailable',
    );
    expect(h.runtime.executeWithReceipt).not.toHaveBeenCalled();
    expect(h.provider.createAppointment).not.toHaveBeenCalled();
  });

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
      (
        await h.context.runAsSystemTenant('tenant-1', () =>
          h.plans[0].handlers.reconcile(h.plans[0].input, undefined, {
            tenantId: 'tenant-1',
            executionId: 'execution-1',
          }),
        )
      ).outcome,
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
    const reconcile = () =>
      h.context.runAsSystemTenant('tenant-1', () =>
        plan.handlers.reconcile(plan.input, undefined, {
          tenantId: 'tenant-1',
          executionId: 'execution-1',
        }),
      );
    expect((await reconcile()).outcome).toBe('PROVEN_NOT_EXECUTED');
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
    expect((await reconcile()).outcome).toBe('STILL_UNKNOWN');
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

/** U-OWN·V11: the read-only half of the create owner. `forAccount` runs the same
 * extraction and then executes, so a quote can never drift from the create. */
describe('U-OWN read-only create quote', () => {
  const quote = (
    h: ReturnType<typeof setup>,
    input?: Record<string, unknown>,
  ) =>
    h.context.runAsAuthPrincipal(
      { tenantId: 'tenant-1', userId: 'user-1', role: 'client' },
      () =>
        h.service.quoteForAccount(
          'tenant-1',
          'user-1',
          (input ?? h.dto) as never,
        ),
    );

  it('quotes the owned create without an execution or a row', async () => {
    const h = setup();

    const quoted = await quote(h);

    expect(quoted).toMatchObject({
      link: { id: 'link-1', clientId: 'client-1' },
      source: 'internal',
      timezone: 'Europe/Moscow',
      bookingIdentity: { clientName: 'Guest' },
      previous: null,
    });
    expect(quoted.services).toHaveLength(1);
    expect(quoted.staff).toEqual({ id: 'staff-1', name: 'Александр' });
    expect(h.crm.getStaff).toHaveBeenCalledWith('tenant-1');
    expect(h.runtime.executeWithReceipt).not.toHaveBeenCalled();
    expect(h.provider.createAppointment).not.toHaveBeenCalled();
    expect(h.rows).toHaveLength(0);
  });

  it('answers exactly what the create then uses (one sequence)', async () => {
    const h = setup();

    const quoted = await quote(h);
    const created = await h.run();

    expect(created.bookingIdentity).toEqual(quoted.bookingIdentity);
    expect(created.timezone).toBe(quoted.timezone);
    expect(created.services).toEqual(quoted.services);
    expect(h.runtime.executeWithReceipt).toHaveBeenCalledTimes(1);
    expect(h.rows).toHaveLength(1);
    expect(h.crm.getStaff).toHaveBeenCalledTimes(1);
  });

  it.each([
    [],
    [null],
    [{ id: 'staff-1', name: 123 }],
    [{ id: 'staff-1', name: { value: 'Untrusted object' } }],
    [{ id: 'foreign-staff', name: 'Other salon' }],
    [{ id: 'staff-1', name: ' ' }],
    [{ id: 'staff-1', name: 'x'.repeat(161) }],
    [
      { id: 'staff-1', name: 'First' },
      { id: 'staff-1', name: 'Second' },
    ],
  ])(
    'keeps incomplete or ambiguous staff labels outside the quote projection (%j)',
    async (...members) => {
      const h = setup();
      (h.crm.getStaff as jest.Mock).mockResolvedValue(members);
      expect((await quote(h)).staff).toBeNull();
      expect(h.runtime.executeWithReceipt).not.toHaveBeenCalled();
      expect(h.rows).toHaveLength(0);
    },
  );

  it('treats a malformed catalogue root as missing presentation data', async () => {
    const h = setup();
    (h.crm.getStaff as jest.Mock).mockResolvedValue({ staff: [] });
    expect((await quote(h)).staff).toBeNull();
    expect(h.runtime.executeWithReceipt).not.toHaveBeenCalled();
  });

  it('treats staff catalogue failure only as missing presentation data, preserving the execution owner', async () => {
    const h = setup();
    (h.crm.getStaff as jest.Mock).mockRejectedValue(
      new Error('catalogue down'),
    );
    expect((await quote(h)).staff).toBeNull();
    await h.run();
    expect(h.runtime.executeWithReceipt).toHaveBeenCalledTimes(1);
    expect(h.rows).toHaveLength(1);
    expect(h.provider.createAppointment).not.toHaveBeenCalled();
    expect(h.crm.getStaff).toHaveBeenCalledTimes(1);
  });

  it('rejects a foreign tenant or actor before reading public staff', async () => {
    const h = setup();
    for (const [tenantId, userId] of [
      ['foreign-tenant', 'user-1'],
      ['tenant-1', 'foreign-user'],
    ]) {
      await expect(
        h.context.runAsAuthPrincipal(
          { tenantId: 'tenant-1', userId: 'user-1', role: 'client' },
          () => h.service.quoteForAccount(tenantId, userId, h.dto),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(h.crm.getStaff).not.toHaveBeenCalled();
    expect(h.runtime.executeWithReceipt).not.toHaveBeenCalled();
  });

  it('refuses invalid services with the owner code and no execution', async () => {
    const h = setup();
    const input = { ...h.dto, serviceIds: ['other-service'] };

    await expect(quote(h, input)).rejects.toBeInstanceOf(BadRequestException);
    await expect(h.run(input as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(h.runtime.executeWithReceipt).not.toHaveBeenCalled();
    expect(h.rows).toHaveLength(0);
  });

  it('refuses an unavailable slot with the owner code and no execution', async () => {
    const h = setup();
    (h.crm.getAvailableSlots as jest.Mock).mockResolvedValue([]);

    await expect(quote(h)).rejects.toBeInstanceOf(BadRequestException);
    await expect(h.run()).rejects.toBeInstanceOf(BadRequestException);
    expect(h.runtime.executeWithReceipt).not.toHaveBeenCalled();
    expect(h.rows).toHaveLength(0);
  });

  it('refuses a missing verified binding before any owner read', async () => {
    const h = setup();
    h.prisma.clientChannelLink.findMany.mockResolvedValue([]);

    await expect(quote(h)).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.prisma.client.findUnique).not.toHaveBeenCalled();
    expect(h.crm.getStaff).not.toHaveBeenCalled();
    expect(h.runtime.executeWithReceipt).not.toHaveBeenCalled();
  });
});

describe('Factual booking admission, precondition and durable retry', () => {
  it.each([
    { price: null, price_min: 100, price_max: 200 },
    { price: null, price_min: null, price_max: null },
    { duration_minutes: null },
    { currency: null },
  ])(
    'refuses incomplete selected terms before availability or action ingress: %j',
    async (patch) => {
      const h = setup();
      Object.assign(h.catalog.services[0], patch);
      await expect(h.run()).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(h.crm.getAvailableSlots).not.toHaveBeenCalled();
      expect(h.runtime.executeWithReceipt).not.toHaveBeenCalled();
      expect(h.rows).toHaveLength(0);
    },
  );
  it('does not guess a slot when observed service duration conflicts with availability', async () => {
    const h = setup();
    h.catalog.services[0].duration_minutes = 30;
    await expect(h.run()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(h.runtime.executeWithReceipt).not.toHaveBeenCalled();
  });
  it('rejects changed terms after preview without changing execution identity or creating an action', async () => {
    const h = setup();
    await h.context.runAsAuthPrincipal(
      { tenantId: 'tenant-1', userId: 'user-1', role: 'client' },
      async () => {
        const quote = await h.service.quoteForAccount(
          'tenant-1',
          'user-1',
          h.dto,
        );
        const fact = h.catalog.services[0];
        Object.assign(fact, { price: 2600, price_min: 2600, price_max: 2600 });
        await expect(
          h.service.forAccount('tenant-1', 'user-1', h.dto, {
            expectedBookingFactsHash: quote.factsHash!,
          }),
        ).rejects.toMatchObject({
          response: { error: { code: 'booking_preview_stale' } },
        });
      },
    );
    expect(h.runtime.executeWithReceipt).not.toHaveBeenCalled();
    expect(h.rows).toHaveLength(0);
  });
  it('prepare compares durable initial evidence, not the retry request current snapshot', async () => {
    const h = setup();
    await h.run();
    const originalEvidence = [...h.plans[0].request.evidenceRefs];
    const fact = h.catalog.services[0];
    Object.assign(fact, { price: 2600, price_min: 2600, price_max: 2600 });
    h.prisma.actionExecution.findUnique.mockResolvedValue({
      id: 'execution-1',
    });
    await expect(h.run()).rejects.toMatchObject({
      response: { error: { code: 'booking_preview_stale' } },
    });
    expect(h.plans[1].request.evidenceRefs).not.toContain(
      originalEvidence.at(-1),
    );
    expect(h.rows).toHaveLength(1);
    expect(h.provider.createAppointment).not.toHaveBeenCalled();
  });
  it('historical canonical replay reaches the durable result when the catalog is unavailable', async () => {
    const h = setup();
    const first = await h.run();
    h.prisma.actionExecution.findUnique.mockResolvedValue({
      id: 'execution-1',
    });
    (h.crm.readServiceCatalog as jest.Mock).mockRejectedValue(
      new Error('catalog unavailable'),
    );
    h.runtime.executeWithReceipt.mockResolvedValue({
      value: { external_id: first.appointment.id },
      execution: { state: 'SUCCEEDED', executionId: 'execution-1' },
    });
    (h.crm.getAvailableSlots as jest.Mock).mockClear();
    const repeated = await h.run();
    expect(repeated.appointment.id).toBe(first.appointment.id);
    expect(h.rows).toHaveLength(1);
    expect(h.crm.getAvailableSlots).not.toHaveBeenCalled();
  });
  it('a removed mapping cannot hide a durable result or create another provider effect', async () => {
    const h = setup();
    (h.crm.getCalendarSource as jest.Mock).mockResolvedValue('external');
    h.prisma.client.findUnique.mockResolvedValue({
      ...h.client,
      user: { encryptedName: 'cipher', phone: '+79990001122' },
    });
    const revision = jest.fn().mockResolvedValue('a'.repeat(64));
    Object.assign(h.crm, { readBranchAvailabilityRevision: revision });
    const dto = { ...h.dto, branchId: 'branch-1' };
    const first = await h.run(dto);
    h.prisma.actionExecution.findUnique.mockResolvedValue({
      id: 'execution-1',
    });
    revision.mockRejectedValue(
      new ServiceUnavailableException({
        error: { code: 'booking_branch_source_unavailable' },
      }),
    );
    (h.crm.readServiceCatalog as jest.Mock).mockRejectedValue(
      new Error('catalog unavailable'),
    );
    h.runtime.executeWithReceipt.mockResolvedValue({
      value: { external_id: first.appointment.crmExternalId },
      execution: { state: 'SUCCEEDED', executionId: 'execution-1' },
    });
    (h.crm.getAvailableSlots as jest.Mock).mockClear();
    expect((await h.run(dto)).appointment.id).toBe(first.appointment.id);
    expect(h.provider.createAppointment).toHaveBeenCalledTimes(1);
    expect(h.crm.getAvailableSlots).not.toHaveBeenCalled();
  });
  it('refuses changed provider target before dispatch even with identical service facts', async () => {
    const h = setup();
    const execute = h.runtime.executeWithReceipt.getMockImplementation()!;
    h.runtime.executeWithReceipt.mockImplementation(async (req, handlers) => {
      (h.crm.getCalendarSource as jest.Mock).mockResolvedValue('external');
      return execute(req, handlers);
    });
    await expect(h.run()).rejects.toMatchObject({
      response: { error: { code: 'booking_preview_stale' } },
    });
    expect(h.provider.createAppointment).not.toHaveBeenCalled();
    expect(h.rows).toHaveLength(0);
  });
  it('does not mirror new numbers if catalog terms change after provider acceptance', async () => {
    const h = setup();
    Object.assign(h.client, {
      user: { encryptedName: 'encrypted', phone: '+79990001122' },
    });
    (h.crm.getCalendarSource as jest.Mock).mockResolvedValue('external');
    h.provider.createAppointment.mockImplementation(() => {
      Object.assign(h.catalog.services[0], {
        price: 2600,
        price_min: 2600,
        price_max: 2600,
      });
      return Promise.resolve({
        external_id: 'remote-1',
        status: 'confirmed',
        start: START,
        end: END,
        staff_id: 'staff-1',
        service_ids: ['svc-1'],
      });
    });
    await expect(h.run()).rejects.toBeInstanceOf(CrmOutcomeUnknownError);
    expect(h.provider.createAppointment).toHaveBeenCalledTimes(1);
    expect(h.rows).toHaveLength(0);
  });
  it('refuses company 42 to 43 drift with the same external provider and service facts', async () => {
    const h = setup();
    Object.assign(h.client, {
      user: { encryptedName: 'encrypted', phone: '+79990001122' },
    });
    (h.crm.getCalendarSource as jest.Mock).mockResolvedValue('external');
    const execute = h.runtime.executeWithReceipt.getMockImplementation()!;
    h.runtime.executeWithReceipt.mockImplementation(async (req, handlers) => {
      h.prisma.crmIntegration.findUnique.mockResolvedValue({
        provider: 'yclients',
        settingsJson: { companyId: 43 },
      });
      return execute(req, handlers);
    });
    await expect(h.run()).rejects.toMatchObject({
      response: { error: { code: 'booking_preview_stale' } },
    });
    expect(h.provider.createAppointment).not.toHaveBeenCalled();
    expect(h.rows).toHaveLength(0);
  });
  it('refuses legacy READY without a durable facts witness before dispatch', async () => {
    const h = setup();
    h.prisma.actionExecution.findUnique.mockResolvedValue({
      id: 'execution-1',
    });
    h.prisma.actionExecution.findFirst.mockResolvedValue({
      evidenceRefsJson: [],
    });
    await expect(h.run()).rejects.toMatchObject({
      response: { error: { code: 'booking_preview_refresh_required' } },
    });
    expect(h.provider.createAppointment).not.toHaveBeenCalled();
    expect(h.rows).toHaveLength(0);
  });
});

describe('SB-1 canonical create with personal context', () => {
  const personal = () => ({
    kind: 'personal_client' as const,
    tenantId: 'tenant-1',
    userId: 'user-1',
    sessionId: 'session-1',
    membershipId: 'member-1',
    membershipRole: 'tenant_owner',
    linkId: 'link-1',
    clientId: 'client-1',
    verificationEvidenceHash: 'evidence',
    evidenceRefs: [
      'personal-context:v1:personal_client',
      'personal-actor-user:v1:user-1',
      'personal-actor-session:v1:session-1',
      'personal-actor-membership:v1:member-1',
      'personal-actor-role:v1:tenant_owner',
    ],
    revalidate: jest.fn().mockResolvedValue(undefined),
  });
  const ownerRun = <T>(h: ReturnType<typeof setup>, fn: () => T) =>
    h.context.runAsAuthPrincipal(
      { tenantId: 'tenant-1', userId: 'user-1', role: 'tenant_owner' },
      fn,
    );
  it('SB1-NOSELECT refuses owner create and quote without an explicit personal context', async () => {
    const h = setup();
    await expect(
      ownerRun(h, () => h.service.forAccount('tenant-1', 'user-1', h.dto)),
    ).rejects.toThrow('explicit_personal_client_context_required');
    await expect(
      ownerRun(h, () => h.service.quoteForAccount('tenant-1', 'user-1', h.dto)),
    ).rejects.toThrow('explicit_personal_client_context_required');
    expect(h.prisma.clientChannelLink.findMany).not.toHaveBeenCalled();
    expect(h.provider.createAppointment).not.toHaveBeenCalled();
  });
  it('SB1-CREATE persists actual actor/context alongside Client authority without owner privileges', async () => {
    const h = setup();
    const selected = personal();
    const quote = await ownerRun(h, () =>
      h.service.quoteForAccount('tenant-1', 'user-1', h.dto, {
        personalContext: selected,
      }),
    );
    await ownerRun(h, () =>
      h.service.forAccount('tenant-1', 'user-1', h.dto, {
        personalContext: selected,
        expectedBookingFactsHash: quote.factsHash!,
      }),
    );
    expect(h.plans[0].request.source.actorUserId).toBeUndefined();
    expect(h.plans[0].request.evidenceRefs).toEqual([
      'client-authority:v1:link-1',
      ...selected.evidenceRefs,
      BOOKING_FACTS_EVIDENCE_PREFIX + quote.factsHash,
    ]);
    expect(h.plans[0].input.clientId).toBe('client-1');
    expect(h.plans[0].input.creationMode).toBe('client');
    expect(h.rows).toHaveLength(1);
    expect(selected.revalidate.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
  it.each([
    'tenantId',
    'userId',
    'linkId',
    'clientId',
    'verificationEvidenceHash',
  ] as const)('SB1-BOUND refuses a changed selected %s', async (field) => {
    const h = setup();
    const selected = personal();
    selected[field] = 'other';
    await expect(
      ownerRun(h, () =>
        h.service.forAccount('tenant-1', 'user-1', h.dto, {
          personalContext: selected,
        }),
      ),
    ).rejects.toThrow();
    expect(h.provider.createAppointment).not.toHaveBeenCalled();
  });
  it('SB1-DISPATCH rechecks revocation immediately before provider dispatch', async () => {
    const h = setup();
    const selected = personal();
    const quote = await ownerRun(h, () =>
      h.service.quoteForAccount('tenant-1', 'user-1', h.dto, {
        personalContext: selected,
      }),
    );
    selected.revalidate
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new ForbiddenException('revoked'));
    await expect(
      ownerRun(h, () =>
        h.service.forAccount('tenant-1', 'user-1', h.dto, {
          personalContext: selected,
          expectedBookingFactsHash: quote.factsHash!,
        }),
      ),
    ).rejects.toThrow('revoked');
    expect(h.provider.createAppointment).not.toHaveBeenCalled();
  });
});
