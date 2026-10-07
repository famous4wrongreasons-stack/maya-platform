import { CrmService } from './crm.service';
import { CrmOutcomeUnknownError } from './crm-request.errors';
import { YclientsCRMAdapter } from './adapters/yclients-crm.adapter';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { CrmAdapterConfig } from './crm-adapter.interface';
import { CrmProvider } from '../common/domain.enums';

function fixture() {
  const context = new TenantContextService();
  const integration = {
    id: 'integration-a',
    tenantId: 'tenant-a',
    provider: 'yclients',
    status: 'active',
    encryptedApiToken: 'synthetic',
    baseUrl: null,
    updatedAt: new Date('2026-10-07T00:00:00Z'),
    settingsJson: {
      companyId: 123,
      branchBinding: {
        contract: 'maya.crm-branch-binding/1',
        branchId: 'branch-a',
        companyId: 123,
      } as unknown,
    },
  };
  let branchExists = true;
  const branch: { id: string; timezone: string | null } = {
    id: 'branch-a',
    timezone: 'Europe/Moscow',
  };
  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        calendarSource: 'external',
        defaultTimezone: 'UTC',
      }),
    },
    crmIntegration: {
      findUnique: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(structuredClone(integration)),
        ),
    },
    branch: {
      findFirst: jest
        .fn()
        .mockImplementation((q: { where: { id: string; tenantId: string } }) =>
          Promise.resolve(
            branchExists &&
              q.where.id === 'branch-a' &&
              q.where.tenantId === 'tenant-a'
              ? structuredClone(branch)
              : null,
          ),
        ),
    },
    actionExecution: { findFirst: jest.fn() },
    appointment: {
      findFirst: jest.fn().mockResolvedValue({
        branchId: 'branch-a',
        mayaClientId: 'client-a',
        crmExternalId: '501',
        crmProvider: 'yclients',
        source: 'external',
      }),
    },
  };
  const create = jest.fn(
    (_provider: CrmProvider, config: CrmAdapterConfig) =>
      new YclientsCRMAdapter({
        ...config,
        baseUrl: 'https://synthetic-yc.invalid/api/v1',
      }),
  );
  const service = new CrmService(
    prisma as never,
    { decrypt: () => 'synthetic' } as never,
    { create } as never,
    context,
  );
  const origin = jest.fn().mockResolvedValue({
    calendarTarget: {
      source: 'external',
      provider: 'yclients',
      companyId: '123',
    },
    branchId: 'branch-a',
  });
  Object.assign(service, {
    actionEngineRuntime: { readClientAppointmentOrigin: origin },
  });
  const run = <T>(fn: () => Promise<T>) =>
    context.runAsSystemTenant('tenant-a', fn);
  return {
    service,
    origin,
    prisma,
    create,
    integration,
    branch,
    run,
    removeBranch: () => {
      branchExists = false;
    },
  };
}
const request = { date: '2026-10-08', staffId: '15', branchId: 'branch-a' };
const originalFetch = global.fetch;
beforeEach(() => {
  jest.replaceProperty(process, 'env', {
    YCLIENTS_PARTNER_TOKEN: 'synthetic-test-only',
  });
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('configured native booking branch retains one source window', () => {
  function configuredFixture() {
    const f = fixture();
    // The preference owner's own tenant/name resolution is covered below. This
    // seam changes source metadata while that owner's asynchronous read runs.
    const preference = jest
      .spyOn(f.service, 'resolveBookingBranchPreference')
      .mockImplementation(() =>
        Promise.resolve({
          id: f.branch.id,
          name: 'Центральный',
          timezone: f.branch.timezone!,
        }),
      );
    global.fetch = jest.fn();
    return {
      ...f,
      preference,
      configured: () =>
        f.run(() => f.service.resolveConfiguredBookingBranch('tenant-a')),
      noProvider: () => {
        expect(global.fetch).not.toHaveBeenCalled();
        expect(f.create).not.toHaveBeenCalled();
        expect(f.origin).not.toHaveBeenCalled();
      },
    };
  }

  it('uses the configured branch ID and the canonical availability revision', async () => {
    const f = configuredFixture();
    const revision = await f.run(() =>
      f.service.readBranchAvailabilityRevision('tenant-a', 'branch-a'),
    );
    await expect(f.configured()).resolves.toEqual({
      id: 'branch-a',
      name: 'Центральный',
      timezone: 'Europe/Moscow',
      sourceRevision: revision,
    });
    expect(f.preference).toHaveBeenCalledWith('tenant-a', null, 'branch-a');
    f.noProvider();
  });

  it.each([
    'timezone',
    'metadata',
    'company',
    'withdrawn',
    'provider',
    'internal',
  ])(
    'refuses %s changing while the display preference is read',
    async (change) => {
      const f = configuredFixture();
      f.preference.mockImplementationOnce(() => {
        const prior = {
          id: f.branch.id,
          name: 'Центральный',
          timezone: f.branch.timezone!,
        };
        if (change === 'timezone') f.branch.timezone = 'Asia/Tokyo';
        if (change === 'metadata')
          f.integration.updatedAt = new Date('2026-10-07T00:01:00Z');
        if (change === 'company') f.integration.settingsJson.companyId = 456;
        if (change === 'withdrawn')
          f.integration.settingsJson.branchBinding = null;
        if (change === 'provider')
          f.integration.provider = 'unsupported-provider';
        if (change === 'internal')
          f.prisma.tenant.findUnique.mockResolvedValue({
            calendarSource: 'internal',
            defaultTimezone: 'UTC',
          });
        return Promise.resolve(prior);
      });
      await expect(f.configured()).rejects.toMatchObject({
        status: 503,
        response: { error: { code: 'booking_branch_source_unavailable' } },
      });
      expect(f.preference).toHaveBeenCalledTimes(1);
      f.noProvider();
    },
  );

  it('treats an unsupported external provider as unavailable, never as an internal calendar', async () => {
    const f = configuredFixture();
    f.integration.provider = 'unsupported-provider';
    await expect(f.configured()).rejects.toMatchObject({
      status: 503,
      response: { error: { code: 'booking_branch_source_unavailable' } },
    });
    expect(f.preference).not.toHaveBeenCalled();
    f.noProvider();
  });

  it('keeps the existing internal-calendar path unscoped without reading CRM', async () => {
    const f = configuredFixture();
    f.prisma.tenant.findUnique.mockResolvedValue({
      calendarSource: 'internal',
      defaultTimezone: 'UTC',
    });
    await expect(f.configured()).resolves.toBeNull();
    expect(f.prisma.crmIntegration.findUnique).not.toHaveBeenCalled();
    expect(f.preference).not.toHaveBeenCalled();
    f.noProvider();
  });

  it('rejects a foreign tenant before source or preference reads', async () => {
    const f = configuredFixture();
    await expect(
      f.run(() => f.service.resolveConfiguredBookingBranch('tenant-b')),
    ).rejects.toMatchObject({ status: 403 });
    expect(f.prisma.tenant.findUnique).not.toHaveBeenCalled();
    expect(f.preference).not.toHaveBeenCalled();
    f.noProvider();
  });
});

describe('current CRM owner resolves semantic booking branch preferences', () => {
  function preferenceFixture() {
    const f = fixture();
    const branches = [
      { ...f.branch, tenantId: 'tenant-a', name: 'Центральный' },
      {
        id: 'branch-b',
        tenantId: 'tenant-a',
        name: 'Северный',
        timezone: 'Asia/Tokyo',
      },
      {
        id: 'branch-foreign',
        tenantId: 'tenant-b',
        name: 'Другой салон',
        timezone: 'Europe/London',
      },
    ];
    const findMany = jest.fn().mockImplementation(
      (query: {
        where: {
          tenantId: string;
          id?: string;
          OR?: [{ id: string }, { name: { equals: string; mode: string } }];
        };
        take: number;
      }) =>
        Promise.resolve(
          branches
            .filter(
              (branch) =>
                branch.tenantId === query.where.tenantId &&
                (query.where.OR
                  ? branch.id === query.where.OR[0].id ||
                    branch.name.toLocaleLowerCase('ru-RU') ===
                      query.where.OR[1].name.equals.toLocaleLowerCase('ru-RU')
                  : branch.id === query.where.id),
            )
            .slice(0, query.take)
            .map(({ id, name }) => ({ id, name })),
        ),
    );
    Object.assign(f.prisma.branch, { findMany });
    f.prisma.tenant.findUnique.mockImplementation(
      (query: {
        where: { id: string };
        select: { branches: { where: { id: string } } };
      }) =>
        Promise.resolve({
          calendarSource: 'external',
          defaultTimezone: 'UTC',
          branches: branches
            .filter(
              (branch) =>
                branch.tenantId === query.where.id &&
                branch.id === query.select.branches.where.id,
            )
            .map(({ id, timezone }) => ({ id, timezone })),
          crmIntegration: structuredClone(f.integration),
        }),
    );
    global.fetch = jest.fn();
    const resolve = (preference?: string | null, proposedId?: string) =>
      f.run(() =>
        f.service.resolveBookingBranchPreference(
          'tenant-a',
          preference,
          proposedId,
        ),
      );
    const noProviderOrExecution = () => {
      expect(global.fetch).not.toHaveBeenCalled();
      expect(f.create).not.toHaveBeenCalled();
      expect(f.origin).not.toHaveBeenCalled();
      expect(f.prisma.actionExecution.findFirst).not.toHaveBeenCalled();
      expect(f.prisma.appointment.findFirst).not.toHaveBeenCalled();
    };
    return { ...f, branches, findMany, resolve, noProviderOrExecution };
  }

  it.each([
    ['case-insensitive exact name', 'центральный', undefined],
    ['tenant-owned ID', 'branch-a', undefined],
    ['matching semantic and proposed ID', 'Центральный', 'branch-a'],
    ['proposed ID only', null, 'branch-a'],
  ])(
    'resolves %s using verified branch timezone, not tenant timezone',
    async (_label, preference, proposedId) => {
      const f = preferenceFixture();
      await expect(
        f.resolve(preference, proposedId ?? undefined),
      ).resolves.toEqual({
        id: 'branch-a',
        name: 'Центральный',
        timezone: 'Europe/Moscow',
      });
      expect(f.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-a' }) as unknown,
          take: 2,
          select: { id: true, name: true },
        }),
      );
      expect(f.prisma.tenant.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tenant-a' },
          select: expect.objectContaining({
            branches: {
              where: { id: 'branch-a' },
              select: { id: true, timezone: true },
              take: 1,
            },
          }) as unknown,
        }),
      );
      f.noProviderOrExecution();
    },
  );

  it.each([
    ['foreign ID', 'branch-foreign', undefined],
    ['foreign name', 'Другой салон', undefined],
    ['foreign proposed ID', null, 'branch-foreign'],
    ['conflicting proposed ID', 'Центральный', 'branch-b'],
    ['partial name', 'Центр', undefined],
  ])(
    'does not bind %s or read a replacement source',
    async (_label, preference, proposedId) => {
      const f = preferenceFixture();
      await expect(
        f.resolve(preference, proposedId ?? undefined),
      ).resolves.toBeNull();
      expect(f.prisma.tenant.findUnique).not.toHaveBeenCalled();
      f.noProviderOrExecution();
    },
  );

  it('refuses two tenant-owned matches even when a proposed ID names one of them', async () => {
    const f = preferenceFixture();
    f.branches.push({
      id: 'branch-duplicate',
      tenantId: 'tenant-a',
      name: 'Центральный',
      timezone: 'Europe/Moscow',
    });
    await expect(f.resolve('Центральный', 'branch-a')).resolves.toBeNull();
    expect(f.prisma.tenant.findUnique).not.toHaveBeenCalled();
    f.noProviderOrExecution();
  });

  it('rejects a foreign tenant before querying branch metadata', async () => {
    const f = preferenceFixture();
    await expect(
      f.run(() =>
        f.service.resolveBookingBranchPreference('tenant-b', 'branch-foreign'),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(f.findMany).not.toHaveBeenCalled();
    expect(f.prisma.tenant.findUnique).not.toHaveBeenCalled();
    f.noProviderOrExecution();
  });

  it.each(['removed', 'company-changed', 'inactive'])(
    'rechecks a previously resolved branch and refuses its %s source binding',
    async (change) => {
      const f = preferenceFixture();
      await expect(f.resolve('Центральный')).resolves.toMatchObject({
        id: 'branch-a',
      });
      if (change === 'removed') f.integration.settingsJson.branchBinding = null;
      if (change === 'company-changed')
        f.integration.settingsJson.companyId = 999;
      if (change === 'inactive') f.integration.status = 'pending_activation';
      await expect(f.resolve('Центральный')).rejects.toMatchObject({
        status: 503,
        response: { error: { code: 'booking_branch_source_unavailable' } },
      });
      expect(f.findMany).toHaveBeenCalledTimes(2);
      expect(f.prisma.tenant.findUnique).toHaveBeenCalledTimes(2);
      f.noProviderOrExecution();
    },
  );
});

it('uses persisted tenant-owned binding with actual adapter and selected branch timezone', async () => {
  const f = fixture();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({ data: [{ time: '10:00', seance_length: 1800 }] }),
  });
  await expect(
    f.run(() => f.service.getAvailableSlots('tenant-a', request)),
  ).resolves.toEqual([
    {
      start: '2026-10-08T07:00:00.000Z',
      end: '2026-10-08T07:30:00.000Z',
      staff_id: '15',
      branch_id: 'branch-a',
    },
  ]);
  expect(f.create).toHaveBeenCalledWith(
    'yclients',
    expect.objectContaining({ tenantId: 'tenant-a' }),
  );
});
it.each(['binding', 'company', 'branch', 'status', 'calendar'])(
  'withholds slots when %s changes during provider read',
  async (change) => {
    const f = fixture();
    global.fetch = jest.fn().mockImplementation(() => {
      if (change === 'binding') f.integration.settingsJson.branchBinding = null;
      if (change === 'company') f.integration.settingsJson.companyId = 999;
      if (change === 'branch') f.removeBranch();
      if (change === 'status') f.integration.status = 'pending_activation';
      if (change === 'calendar')
        f.prisma.tenant.findUnique.mockResolvedValue({
          calendarSource: 'internal',
        });
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ data: [{ time: '10:00', seance_length: 1800 }] }),
      });
    });
    await expect(
      f.run(() => f.service.getAvailableSlots('tenant-a', request)),
    ).rejects.toMatchObject({
      response: { error: { code: 'booking_branch_source_unavailable' } },
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  },
);
it('refuses deleted or foreign selected branch before provider transport', async () => {
  const f = fixture();
  global.fetch = jest.fn();
  f.removeBranch();
  await expect(
    f.run(() => f.service.getAvailableSlots('tenant-a', request)),
  ).rejects.toMatchObject({ status: 404 });
  expect(global.fetch).not.toHaveBeenCalled();
});
it('binds source revision to explicit removal, never cached attribution', async () => {
  const f = fixture();
  const first = await f.run(() =>
    f.service.readBranchAvailabilityRevision('tenant-a', 'branch-a'),
  );
  expect(first).toMatch(/^[a-f0-9]{64}$/);
  f.integration.settingsJson.branchBinding = null;
  await expect(
    f.run(() =>
      f.service.readBranchAvailabilityRevision('tenant-a', 'branch-a'),
    ),
  ).rejects.toMatchObject({ status: 503 });
});
it.each(['missing', 'old', 'duplicate', 'current'])(
  'READY create checks its persisted original branch witness: %s',
  async (kind) => {
    const f = fixture();
    global.fetch = jest.fn();
    const revision = await f.run(() =>
      f.service.readBranchAvailabilityRevision('tenant-a', 'branch-a'),
    );
    const ref = 'crm-branch-source/1:' + revision;
    f.prisma.actionExecution.findFirst.mockResolvedValue({
      evidenceRefsJson:
        kind === 'missing'
          ? []
          : kind === 'old'
            ? ['crm-branch-source/1:' + 'f'.repeat(64)]
            : kind === 'duplicate'
              ? [ref, ref]
              : [ref],
    });
    const owner = f.service as unknown as {
      confirmedCreateBranchRevision(
        t: string,
        b: string,
        e: string,
      ): Promise<string>;
    };
    const check = () =>
      f.run(() =>
        owner.confirmedCreateBranchRevision(
          'tenant-a',
          'branch-a',
          'execution-a',
        ),
      );
    if (kind === 'current') {
      await expect(check()).resolves.toBe(revision);
      // Same company/branch after reconfiguration is still a different source.
      f.integration.updatedAt = new Date('2026-10-07T00:00:01Z');
    }
    await expect(check()).rejects.toMatchObject({
      response: { error: { code: 'booking_preview_stale' } },
    });
    expect(global.fetch).not.toHaveBeenCalled();
  },
);
it.each([null, 'old', 'current'])(
  'READY reschedule requires the original persisted source witness: %s',
  async (witness) => {
    const f = fixture();
    const current = await f.run(() =>
      f.service.readBranchAvailabilityRevision('tenant-a', 'branch-a'),
    );
    f.prisma.actionExecution.findFirst.mockResolvedValue({
      evidenceRefsJson:
        witness === null
          ? []
          : [
              'crm-branch-source/1:' +
                (witness === 'current' ? current : 'a'.repeat(64)),
            ],
    });
    // Invoke the existing owner's finite dispatch guard with the persisted AE row.
    const guard = f.service as unknown as {
      assertRescheduleBranchWitness(
        t: string,
        i: unknown,
        e: string,
      ): Promise<void>;
    };
    const result = f.run(() =>
      guard.assertRescheduleBranchWitness(
        'tenant-a',
        { clientPrincipal: { appointmentId: 'appointment-a' } },
        'execution-a',
      ),
    );
    if (witness === 'current') await expect(result).resolves.toBeUndefined();
    else
      await expect(result).rejects.toMatchObject({
        response: { error: { code: 'booking_branch_source_stale' } },
      });
  },
);

it.each(['branch-null', 'calendar', 'provider'])(
  'an original persisted witness cannot be bypassed by current %s',
  async (change) => {
    const f = fixture();
    const revision = await f.run(() =>
      f.service.readBranchAvailabilityRevision('tenant-a', 'branch-a'),
    );
    f.prisma.actionExecution.findFirst.mockResolvedValue({
      evidenceRefsJson: ['crm-branch-source/1:' + revision],
    });
    if (change === 'branch-null')
      f.prisma.appointment.findFirst.mockResolvedValue({ branchId: null });
    if (change === 'calendar')
      f.prisma.tenant.findUnique.mockResolvedValue({
        calendarSource: 'internal',
      });
    if (change === 'provider') f.integration.provider = 'mock';
    const guard = f.service as unknown as {
      assertRescheduleBranchWitness(
        t: string,
        i: unknown,
        e: string,
      ): Promise<void>;
    };
    await expect(
      f.run(() =>
        guard.assertRescheduleBranchWitness(
          'tenant-a',
          { clientPrincipal: { appointmentId: 'appointment-a' } },
          'execution-a',
        ),
      ),
    ).rejects.toMatchObject({
      response: { error: { code: 'booking_branch_source_stale' } },
    });
  },
);

it('UNKNOWN reconciliation cannot resolve using detail observed across a binding change', async () => {
  const f = fixture();
  const revision = await f.run(() =>
    f.service.readBranchAvailabilityRevision('tenant-a', 'branch-a'),
  );
  f.prisma.actionExecution.findFirst.mockResolvedValue({
    evidenceRefsJson: ['crm-branch-source/1:' + revision],
  });
  const owner = f.service as unknown as {
    loadAppointmentDetail: (t: string, id: string) => Promise<unknown>;
    rescheduleAppointmentActionPlan: (
      t: string,
      p: unknown,
      i: unknown,
    ) => Promise<{
      handlers: {
        reconcile: (
          input: unknown,
          previous: unknown,
          context: unknown,
        ) => Promise<unknown>;
      };
    }>;
  };
  jest.spyOn(owner, 'loadAppointmentDetail').mockImplementation(() => {
    f.integration.settingsJson.branchBinding = null;
    return Promise.resolve({});
  });
  const params = {
    externalId: 'provider-appointment',
    start: '2026-10-08T09:00:00Z',
    staffId: '15',
  };
  const plan = await f.run(() =>
    owner.rescheduleAppointmentActionPlan('tenant-a', params, {
      clientPrincipal: { linkId: 'link-a', appointmentId: 'appointment-a' },
    }),
  );
  await expect(
    f.run(() =>
      plan.handlers.reconcile(params, {}, { executionId: 'execution-a' }),
    ),
  ).resolves.toEqual({ outcome: 'STILL_UNKNOWN' });
});

it('fallback tenant timezone changes invalidate the binding witness and in-flight slots', async () => {
  const f = fixture();
  f.branch.timezone = null;
  const before = await f.run(() =>
    f.service.readBranchAvailabilityRevision('tenant-a', 'branch-a'),
  );
  global.fetch = jest.fn().mockImplementation(() => {
    f.prisma.tenant.findUnique.mockResolvedValue({
      calendarSource: 'external',
      defaultTimezone: 'Europe/Moscow',
    });
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({ data: [{ time: '10:00', seance_length: 1800 }] }),
    });
  });
  await expect(
    f.run(() => f.service.getAvailableSlots('tenant-a', request)),
  ).rejects.toMatchObject({ status: 503 });
  expect(
    await f.run(() =>
      f.service.readBranchAvailabilityRevision('tenant-a', 'branch-a'),
    ),
  ).not.toBe(before);
});

type TestPlan = {
  handlers: {
    reconcile(i: unknown, p: unknown, c: unknown): Promise<unknown>;
    dispatch(
      input: unknown,
      key: string,
      context: { executionId: string },
    ): Promise<unknown>;
  };
};
type TestOwner = {
  createAppointmentActionPlan(
    t: string,
    p: unknown,
    i: unknown,
    v: boolean,
  ): Promise<TestPlan>;
  rescheduleAppointmentActionPlan(
    t: string,
    p: unknown,
    i: unknown,
  ): Promise<TestPlan>;
  persistRescheduledAppointmentMirror(...args: unknown[]): Promise<void>;
};
const wireParams = {
  externalId: '501',
  clientId: 'client-a',
  clientName: 'Synthetic',
  clientPhone: '+79990000001',
  branchId: 'branch-a',
  start: '2026-10-08T07:00:00.000Z',
  staffId: '15',
  serviceIds: ['25'],
  notifyBySmsHours: 0,
};
function nativeWire(
  f: ReturnType<typeof fixture>,
  drift?: 'before-put' | 'after-put' | 'after-post',
) {
  const writes: Array<{ method: string; body: Record<string, unknown> }> = [];
  global.fetch = jest
    .fn()
    .mockImplementation((input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'PUT' || method === 'POST') {
        writes.push({
          method,
          body: JSON.parse(
            typeof init?.body === 'string' ? init.body : '{}',
          ) as Record<string, unknown>,
        });
        if (drift === 'after-put' || drift === 'after-post')
          f.integration.settingsJson.branchBinding = null;
      }
      const services = [
        {
          id: 25,
          title: 'Synthetic',
          price_min: 1000,
          price_max: 1000,
          seance_length: 1800,
        },
      ];
      const data = url.includes('/book_services/')
        ? { services }
        : url.includes('/services/')
          ? services
          : url.endsWith('/staff') ||
              url.includes('/staff/') ||
              url.includes('/book_staff/') ||
              url.includes('/service_categories/')
            ? []
            : {
                id: 501,
                record_id: 501,
                datetime: '2026-10-08 10:00:00',
                staff: { id: 15 },
                services: [{ id: 25, cost: 1000 }],
                client: { id: 50 },
                seance_length: 1800,
              };
      if (url.includes('/book_services/') && drift === 'before-put')
        f.integration.settingsJson.branchBinding = null;
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, data }), { status: 200 }),
      );
    });
  return writes;
}
it.each([undefined, 'after-post'] as const)(
  'verified create uses immutable branch zone at native wire; drift=%s',
  async (drift) => {
    const f = fixture();
    const sourceRevision = await f.run(() =>
      f.service.readBranchAvailabilityRevision('tenant-a', 'branch-a'),
    );
    f.prisma.actionExecution.findFirst.mockResolvedValue({
      evidenceRefsJson: ['crm-branch-source/1:' + sourceRevision],
    });
    const writes = nativeWire(f, drift);
    const owner = f.service as unknown as TestOwner;
    const invocation = {
      bookingIntent: { timezone: 'Europe/Moscow' },
      authorizationCheck: jest.fn().mockResolvedValue(undefined),
    };
    const plan = await f.run(() =>
      owner.createAppointmentActionPlan(
        'tenant-a',
        wireParams,
        invocation,
        true,
      ),
    );
    const result = f.run(() =>
      plan.handlers.dispatch(wireParams, 'key', { executionId: 'execution-a' }),
    );
    if (drift)
      await expect(result).rejects.toBeInstanceOf(CrmOutcomeUnknownError);
    else
      await expect(result).resolves.toMatchObject({
        value: { start: wireParams.start },
      });
    expect(writes).toHaveLength(1);
    expect(writes[0].body.appointments).toEqual([
      expect.objectContaining({ datetime: '2026-10-08T10:00:00' }),
    ]);
  },
);
it('verified create refuses a stale immutable branch timezone before POST', async () => {
  const f = fixture();
  const writes = nativeWire(f);
  const owner = f.service as unknown as TestOwner;
  const plan = await f.run(() =>
    owner.createAppointmentActionPlan(
      'tenant-a',
      wireParams,
      { bookingIntent: { timezone: 'UTC' } },
      true,
    ),
  );
  await expect(
    f.run(() =>
      plan.handlers.dispatch(wireParams, 'key', { executionId: 'execution-a' }),
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(writes).toEqual([]);
});
it.each([undefined, 'before-put', 'after-put'] as const)(
  'native verified reschedule preserves branch zone and source witness; drift=%s',
  async (drift) => {
    const f = fixture();
    const revision = await f.run(() =>
      f.service.readBranchAvailabilityRevision('tenant-a', 'branch-a'),
    );
    f.prisma.actionExecution.findFirst.mockResolvedValue({
      evidenceRefsJson: ['crm-branch-source/1:' + revision],
    });
    const owner = f.service as unknown as TestOwner;
    const mirror = jest
      .spyOn(owner, 'persistRescheduledAppointmentMirror')
      .mockResolvedValue(undefined);
    const writes = nativeWire(f, drift);
    const plan = await f.run(() =>
      owner.rescheduleAppointmentActionPlan('tenant-a', wireParams, {
        clientPrincipal: { linkId: 'link-a', appointmentId: 'appointment-a' },
        appointmentTimezone: 'Europe/Moscow',
      }),
    );
    const result = f.run(() =>
      plan.handlers.dispatch(wireParams, 'key', { executionId: 'execution-a' }),
    );
    if (drift === 'before-put') {
      await expect(result).rejects.toMatchObject({ status: 503 });
      expect(writes).toEqual([]);
    } else {
      if (drift === 'after-put')
        await expect(result).rejects.toBeInstanceOf(CrmOutcomeUnknownError);
      else
        await expect(result).resolves.toMatchObject({
          value: { start: wireParams.start },
        });
      expect(writes).toEqual([
        {
          method: 'PUT',
          body: expect.objectContaining({
            datetime: '2026-10-08T10:00:00',
          }) as unknown,
        },
      ]);
    }
    if (drift) expect(mirror).not.toHaveBeenCalled();
    else expect(mirror).toHaveBeenCalledTimes(1);
  },
);

it.each(['old-company', 'old-provider', 'unproven'] as const)(
  'refuses bound reschedule provenance %s before provider transport',
  async (kind) => {
    const f = fixture();
    const revision = await f.run(() =>
      f.service.readBranchAvailabilityRevision('tenant-a', 'branch-a'),
    );
    f.prisma.actionExecution.findFirst.mockResolvedValue({
      evidenceRefsJson: ['crm-branch-source/1:' + revision],
    });
    if (kind === 'old-company')
      f.origin.mockResolvedValue({
        calendarTarget: {
          source: 'external',
          provider: 'yclients',
          companyId: '999',
        },
        branchId: 'branch-a',
      });
    if (kind === 'old-provider')
      f.prisma.appointment.findFirst.mockResolvedValue({
        branchId: 'branch-a',
        mayaClientId: 'client-a',
        crmExternalId: '501',
        crmProvider: 'altegio',
        source: 'external',
      });
    if (kind === 'unproven')
      f.origin.mockRejectedValue(new Error('No original canonical create'));
    const writes = nativeWire(f);
    const owner = f.service as unknown as TestOwner;
    const plan = await f.run(() =>
      owner.rescheduleAppointmentActionPlan('tenant-a', wireParams, {
        clientPrincipal: { linkId: 'link-a', appointmentId: 'appointment-a' },
        appointmentTimezone: 'Europe/Moscow',
      }),
    );
    await expect(
      f.run(() =>
        plan.handlers.dispatch(wireParams, 'key', {
          executionId: 'execution-a',
        }),
      ),
    ).rejects.toMatchObject({
      response: { error: { code: 'booking_appointment_source_unproven' } },
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  },
);
it('reconciles offset-less native detail in branch timezone without another PUT', async () => {
  const f = fixture();
  const revision = await f.run(() =>
    f.service.readBranchAvailabilityRevision('tenant-a', 'branch-a'),
  );
  f.prisma.actionExecution.findFirst.mockResolvedValue({
    evidenceRefsJson: ['crm-branch-source/1:' + revision],
  });
  const writes = nativeWire(f);
  const owner = f.service as unknown as TestOwner;
  const mirror = jest
    .spyOn(owner, 'persistRescheduledAppointmentMirror')
    .mockResolvedValue(undefined);
  const plan = await f.run(() =>
    owner.rescheduleAppointmentActionPlan('tenant-a', wireParams, {
      clientPrincipal: { linkId: 'link-a', appointmentId: 'appointment-a' },
      appointmentTimezone: 'Europe/Moscow',
    }),
  );
  await expect(
    f.run(() =>
      plan.handlers.reconcile(wireParams, undefined, {
        executionId: 'execution-a',
      }),
    ),
  ).resolves.toMatchObject({
    outcome: 'PROVEN_SUCCEEDED',
    safeResult: { start: wireParams.start },
  });
  expect(writes).toEqual([]);
  expect(mirror).toHaveBeenCalledTimes(1);
});

it('capacity metadata uses the selected branch timezone and no provider transport', async () => {
  const f = fixture();
  f.prisma.tenant.findUnique.mockResolvedValue({
    calendarSource: 'external',
    defaultTimezone: 'UTC',
    branches: [f.branch],
    crmIntegration: f.integration,
  });
  global.fetch = jest.fn();
  const source = await f.run(() =>
    f.service.readCapacitySource('tenant-a', 'branch-a'),
  );
  expect(source).toMatchObject({
    timezone: 'Europe/Moscow',
    revision: expect.stringMatching(/^[a-f0-9]{64}$/) as unknown,
  });
  f.integration.settingsJson.companyId = 999;
  await expect(
    f.run(() => f.service.readCapacitySource('tenant-a', 'branch-a')),
  ).rejects.toMatchObject({ status: 503 });
  expect(global.fetch).not.toHaveBeenCalled();
});
it.each(['timezone', 'binding', 'foreign', 'calendar'])(
  'capacity metadata detects %s drift',
  async (change) => {
    const f = fixture();
    const snapshot = {
      calendarSource: 'external',
      defaultTimezone: 'UTC',
      branches: [f.branch],
      crmIntegration: f.integration,
    };
    f.prisma.tenant.findUnique.mockResolvedValue(snapshot);
    const read = () =>
      f.run(() => f.service.readCapacitySource('tenant-a', 'branch-a'));
    const source = await read();
    if (change === 'timezone') snapshot.branches[0].timezone = 'Asia/Tokyo';
    if (change === 'binding') f.integration.settingsJson.branchBinding = null;
    if (change === 'foreign') snapshot.branches = [];
    if (change === 'calendar') snapshot.calendarSource = 'internal';
    if (['binding', 'foreign'].includes(change))
      await expect(read()).rejects.toMatchObject({
        status: change === 'foreign' ? 404 : 503,
      });
    else expect((await read()).revision).not.toBe(source.revision);
  },
);
