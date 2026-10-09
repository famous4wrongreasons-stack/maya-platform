/** Real owner/projection/formatter methods with finite in-memory DB/catalog
 * rows. Native Date baseline evidence is retained in the diagnostic run log;
 * branchless display timezone comes only from the current authenticated owner.
 * No HTTP, provider, mutation or original-venue attribution. */
import { runInNewContext } from 'node:vm';
import { ForbiddenException } from '@nestjs/common';
import { AppointmentsService } from '../appointments/appointments.service';
import { ClientAppointmentReadService } from '../crm/client-appointment-read.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { UserRole } from '../common/domain.enums';
import { AiToolHandlerService } from './ai-tool-handler.service';
import { AiToolRegistryService } from './ai-tool-registry.service';
import { AiCoreService } from './ai-core.service';

type DisplayOwner = {
  deterministicOwnAppointmentsReply(
    result: unknown,
    stale: boolean,
  ): {
    reply: string;
    status: 'verified' | 'blocked';
  };
  sanitizeToolResult(result: unknown): unknown;
};
const formatter = Object.create(AiCoreService.prototype) as DisplayOwner;
const actor = {
  tenantId: 'tenant-own',
  userId: 'account-own',
  role: UserRole.CLIENT,
  surface: 'native' as const,
};
function fixture() {
  const context = new TenantContextService();
  const branch = {
    id: 'branch-own',
    tenantId: actor.tenantId,
    name: 'Северный',
    address: null,
    phone: null,
    timezone: 'Europe/Moscow',
  };
  const row = {
    id: 'appointment-own',
    tenantId: actor.tenantId,
    clientId: null,
    branchId: null as string | null,
    branch: null as typeof branch | null,
    crmExternalId: null,
    source: 'internal',
    staffExternalId: 'staff-own',
    serviceIds: ['service-own'],
    startAt: new Date('2026-10-10T14:00:00.000Z'),
    endAt: new Date('2026-10-10T14:30:00.000Z'),
    status: 'confirmed',
    notes: null,
    totalPriceKopecks: null,
    currency: 'RUB',
    createdAt: new Date('2026-10-09T00:00:00.000Z'),
    updatedAt: new Date('2026-10-09T00:00:00.000Z'),
  };
  const membership = jest.fn().mockResolvedValue({ id: 'membership-own' });
  const links = jest
    .fn()
    .mockResolvedValue([
      { clientId: 'client-own', subjectHashVersion: 1, verificationVersion: 1 },
    ]);
  const findAppointments = jest.fn().mockImplementation((input: unknown) => {
    expect(input).toMatchObject({
      where: { tenantId: actor.tenantId, mayaClientId: 'client-own' },
    });
    return Promise.resolve([row]);
  });
  const tenant = jest
    .fn()
    .mockResolvedValue({ defaultTimezone: 'Europe/Moscow' });
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    membership: { findFirst: membership },
    clientChannelLink: { findMany: links },
    client: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'client-own',
        mergedIntoClientId: null,
        crmLinks: [],
      }),
    },
    appointment: { findMany: findAppointments },
    tenant: { findUnique: tenant },
  };
  const transaction = jest
    .fn()
    .mockImplementation((read: (transaction: typeof tx) => unknown) =>
      read(tx),
    );
  const getServices = jest.fn().mockResolvedValue([
    {
      id: 'service-own',
      name: 'Мужская стрижка',
      price: 1500,
      currency: 'RUB',
      duration_minutes: 30,
    },
  ]);
  const getStaff = jest
    .fn()
    .mockResolvedValue([{ id: 'staff-own', name: 'Артём' }]);
  const reader = new ClientAppointmentReadService(
    { $transaction: transaction } as never,
    context,
    {} as never,
    {
      opaqueReference: jest.fn().mockReturnValue('synthetic-subject-hash'),
    } as never,
    { getServices, getStaff } as never,
  );
  const appointments = Object.create(
    AppointmentsService.prototype,
  ) as AppointmentsService;
  Object.defineProperty(appointments, 'clientAppointmentReader', {
    value: reader,
  });
  const handler = Object.create(
    AiToolHandlerService.prototype,
  ) as AiToolHandlerService;
  Object.defineProperties(handler, {
    appointmentsService: { value: appointments },
    governedSettings: {
      value: { ownHistoryEnabled: jest.fn().mockResolvedValue(false) },
    },
  });
  const registry = new AiToolRegistryService();
  const read = () =>
    context.runAsAuthPrincipal(actor, () =>
      handler.execute(
        'appointments.own.list',
        actor,
        registry.validateArguments('appointments.own.list', {}),
        'synthetic-read',
      ),
    );
  return {
    context,
    branch,
    row,
    membership,
    links,
    findAppointments,
    transaction,
    tx,
    tenant,
    getServices,
    getStaff,
    reader,
    registry,
    read,
  };
}

describe('own appointment source trace [synthetic owner regression]', () => {
  beforeEach(() =>
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-10-09T10:00:00.000Z')),
  );
  afterEach(() => jest.restoreAllMocks());

  it('actual owner and handler preserve Date and qualify a branchless current tenant display timezone', async () => {
    const f = fixture();
    const result = (await f.read()) as {
      appointments: Array<{
        start_at: unknown;
        end_at: unknown;
        branch: unknown;
      }>;
    };
    expect(result.appointments[0].start_at).toBe(f.row.startAt);
    expect(result.appointments[0].end_at).toBe(f.row.endAt);
    expect(result.appointments[0].branch).toBeNull();
    expect(result.appointments[0]).toMatchObject({
      timezone: 'Europe/Moscow',
      timezone_source: 'tenant_default',
    });
    expect(f.tenant).toHaveBeenCalledWith({
      where: { id: actor.tenantId },
      select: { defaultTimezone: true },
    });
    expect(f.tx.$executeRaw).toHaveBeenCalledWith([
      'SET TRANSACTION READ ONLY',
    ]);
    expect(f.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    // Same persisted instants and actual methods; only the existing branch source
    // relation now supplies its authoritative timezone. No date substitution.
    f.row.branchId = f.branch.id;
    f.row.branch = f.branch;
    const branchQualified = await f.read();
    expect(
      formatter.deterministicOwnAppointmentsReply(branchQualified, false),
    ).toMatchObject({ status: 'verified' });
    expect(
      formatter.deterministicOwnAppointmentsReply(branchQualified, false).reply,
    ).toContain('17:00');
    expect(
      formatter.deterministicOwnAppointmentsReply(branchQualified, false).reply,
    ).toContain('Europe/Moscow');
    expect(f.tenant).toHaveBeenCalledTimes(1);
    expect(f.links).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: actor.tenantId,
          provider: 'maya_user',
          revokedAt: null,
        }) as unknown,
      }),
    );
  });

  it.each([
    null,
    { defaultTimezone: null },
    { defaultTimezone: '' },
    { defaultTimezone: 'Mars/Olympus' },
  ])(
    'does not invent a timezone from unavailable tenant configuration: %j',
    async (tenant) => {
      const f = fixture();
      f.tenant.mockResolvedValue(tenant);
      const result = await f.read();
      expect(result).toMatchObject({ appointments: [{ branch: null }] });
      expect(result).not.toHaveProperty('appointments.0.timezone');
      expect(result).not.toHaveProperty('appointments.0.timezone_source');
      expect(
        formatter.deterministicOwnAppointmentsReply(result, false).status,
      ).toBe('blocked');
    },
  );

  it('retains a different valid branch timezone and does not consult tenant fallback', async () => {
    const f = fixture();
    f.row.branchId = f.branch.id;
    f.row.branch = { ...f.branch, timezone: 'Asia/Novosibirsk' };
    const result = await f.read();
    expect(result).toMatchObject({
      appointments: [{ branch: { timezone: 'Asia/Novosibirsk' } }],
    });
    expect(result).not.toHaveProperty('appointments.0.timezone_source');
    expect(f.tenant).not.toHaveBeenCalled();
    expect(
      formatter.deterministicOwnAppointmentsReply(result, false).reply,
    ).toContain('21:00');
  });

  it.each(['missing-relation', 'mismatched-relation', 'unbound-relation'])(
    'does not substitute tenant timezone for %s',
    async (shape) => {
      const f = fixture();
      f.row.branchId = shape === 'unbound-relation' ? null : 'branch-other';
      f.row.branch = shape === 'missing-relation' ? null : f.branch;
      const result = await f.read();
      expect(result).toMatchObject({ appointments: [{ branch: null }] });
      expect(result).not.toHaveProperty('appointments.0.timezone_source');
      expect(f.tenant).not.toHaveBeenCalled();
      expect(
        formatter.deterministicOwnAppointmentsReply(result, false).status,
      ).toBe('blocked');
    },
  );

  it('audit sanitizer loses Date separately; source composer reads the original result and ISO replay remains usable', async () => {
    const f = fixture();
    f.row.branchId = f.branch.id;
    f.row.branch = f.branch;
    const original = await f.read();
    expect(formatter.sanitizeToolResult(original)).toMatchObject({
      appointments: [{ start_at: {}, end_at: {} }],
    });
    expect(
      formatter.deterministicOwnAppointmentsReply(original, false).status,
    ).toBe('verified');
    const persisted = JSON.parse(JSON.stringify(original)) as unknown;
    expect(
      formatter.deterministicOwnAppointmentsReply(persisted, false).status,
    ).toBe('verified');
    expect(
      formatter.deterministicOwnAppointmentsReply(original, true).status,
    ).toBe('blocked');
  });

  it('cross-realm Date is a separate baseline formatter boundary, unrelated to branchless refusal', async () => {
    const f = fixture();
    f.row.branchId = f.branch.id;
    f.row.branch = f.branch;
    const original = (await f.read()) as {
      appointments: Array<Record<string, unknown>>;
    };
    const foreignDate: unknown = runInNewContext(
      "new Date('2026-10-10T14:00:00.000Z')",
    );
    expect(foreignDate instanceof Date).toBe(false);
    const result = {
      appointments: [{ ...original.appointments[0], start_at: foreignDate }],
    };
    expect(
      formatter.deterministicOwnAppointmentsReply(result, false).status,
    ).toBe('blocked');
    expect(
      formatter.deterministicOwnAppointmentsReply(
        JSON.parse(JSON.stringify(result)) as unknown,
        false,
      ).status,
    ).toBe('verified');
  });

  it.each([
    { tenantId: 'tenant-foreign', userId: actor.userId },
    { tenantId: actor.tenantId, userId: 'account-foreign' },
  ])(
    'refuses mismatched current tenant/actor before database or catalog reads: %j',
    (requested) => {
      const f = fixture();
      expect(() =>
        f.context.runAsAuthPrincipal(actor, () =>
          f.reader.forAccount(requested.tenantId, requested.userId),
        ),
      ).toThrow(ForbiddenException);
      expect(f.transaction).not.toHaveBeenCalled();
      expect(f.findAppointments).not.toHaveBeenCalled();
      expect(f.getServices).not.toHaveBeenCalled();
      expect(f.tenant).not.toHaveBeenCalled();
    },
  );

  it.each(['inactive-membership', 'revoked-link'])(
    'refuses %s before appointment facts',
    async (reason) => {
      const f = fixture();
      if (reason === 'inactive-membership')
        f.membership.mockResolvedValue(null);
      else f.links.mockResolvedValue([]);
      await expect(f.read()).rejects.toBeInstanceOf(ForbiddenException);
      expect(f.findAppointments).not.toHaveBeenCalled();
      expect(f.getServices).not.toHaveBeenCalled();
      expect(f.getStaff).not.toHaveBeenCalled();
      expect(f.tenant).not.toHaveBeenCalled();
    },
  );

  it('registry refuses caller-selected identity and foreign branch metadata cannot supply a timezone', async () => {
    const f = fixture();
    for (const forged of [
      { client_id: 'foreign' },
      { tenant_id: 'foreign' },
      { user_id: 'foreign' },
    ])
      expect(() =>
        f.registry.validateArguments('appointments.own.list', forged),
      ).toThrow();
    f.row.branchId = 'foreign-branch';
    f.row.branch = {
      ...f.branch,
      tenantId: 'foreign-tenant',
      name: 'DO_NOT_DISPLAY_FOREIGN_BRANCH',
    };
    const result = await f.read();
    expect(result).toMatchObject({ appointments: [{ branch: null }] });
    expect(result).not.toHaveProperty('appointments.0.timezone_source');
    expect(f.tenant).not.toHaveBeenCalled();
    const reply = formatter.deterministicOwnAppointmentsReply(result, false);
    expect(reply.status).toBe('blocked');
    expect(reply.reply).not.toContain('DO_NOT_DISPLAY_FOREIGN_BRANCH');
  });
});
