import type { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AppointmentMirrorService } from './appointment-mirror.service';
import type { CrmService } from './crm.service';

/**
 * 🔴 CYCLE 03 B3.2 — наполнение зеркала.
 *
 * Главные обещания режима: событий не создаётся ни одного, аккаунты не
 * заводятся, клиенты по телефону не склеиваются, а неполная выборка ничего не
 * объявляет исчезнувшим.
 */

type Fn<T extends (...args: never[]) => unknown> = jest.MockedFunction<T>;
type WriteArgs = { data: Record<string, unknown> };

const journalAppointment = (over: Record<string, unknown> = {}) => ({
  id: 'crm-9001',
  client: { id: '5501', name: 'Клиент' },
  provider: { id: '1461615', name: 'Мастер' },
  service_ids: ['svc-2', 'svc-1'],
  start_at: '2026-08-20T10:00:00.000Z',
  end_at: '2026-08-20T11:00:00.000Z',
  status: 'confirmed',
  notes: null,
  total_price: 2500,
  currency: 'RUB',
  ...over,
});

const build = (over?: {
  existing?: unknown;
  journal?: Record<string, unknown>;
  staffId?: string | null;
  clientLink?: { clientId: string } | null;
}) => {
  const appointmentCreate: Fn<(args: WriteArgs) => Promise<unknown>> = jest
    .fn()
    .mockResolvedValue({ id: 'ap-1' });
  const appointmentUpdate: Fn<(args: WriteArgs) => Promise<unknown>> = jest
    .fn()
    .mockResolvedValue({ id: 'ap-1' });
  const appointmentFindFirst: Fn<(args: unknown) => Promise<unknown>> = jest
    .fn()
    .mockResolvedValue(over?.existing ?? null);
  const crmClientLinkFindFirst: Fn<(args: unknown) => Promise<unknown>> = jest
    .fn()
    .mockResolvedValue(over?.clientLink ?? null);

  const prisma = {
    appointment: {
      create: appointmentCreate,
      update: appointmentUpdate,
      findFirst: appointmentFindFirst,
    },
    crmClientLink: { findFirst: crmClientLinkFindFirst },
    crmIntegration: {
      findUnique: jest.fn().mockResolvedValue({ provider: 'yclients' }),
    },
  } as unknown as PrismaService;

  const getJournal: Fn<CrmService['getJournal']> = jest.fn().mockResolvedValue({
    calendar_source: 'external',
    completeness: 'complete',
    timezone: 'Europe/Moscow',
    range: { from: '', to: '' },
    provider_id: null,
    count: 1,
    appointments: [journalAppointment(over?.journal)],
    ...(over?.journal?.__journalOverride as object | undefined),
  });
  const resolveStaffIdForBooking: Fn<CrmService['resolveStaffIdForBooking']> =
    jest
      .fn()
      .mockResolvedValue(
        over?.staffId === undefined ? 'staff-maya-1' : over.staffId,
      );

  const crmService = {
    getJournal,
    resolveStaffIdForBooking,
  } as unknown as CrmService;

  const tenantContext = new TenantContextService();
  const service = new AppointmentMirrorService(
    prisma,
    tenantContext,
    crmService,
  );

  const run = (apply: boolean) =>
    tenantContext.runAsSystemTenant('tenant-1', () =>
      service.bootstrap({
        tenantId: 'tenant-1',
        from: new Date('2026-08-01T00:00:00.000Z'),
        to: new Date('2026-08-25T00:00:00.000Z'),
        apply,
      }),
    );

  return {
    run,
    appointmentCreate,
    appointmentUpdate,
    getJournal,
    crmClientLinkFindFirst,
  };
};

describe('наполнение зеркала визитов', () => {
  it('сухой прогон ничего не пишет, но считает', async () => {
    const { run, appointmentCreate } = build();

    const result = await run(false);

    expect(result.would_create).toBe(1);
    expect(result.applied).toBe(false);
    expect(appointmentCreate).not.toHaveBeenCalled();
  });

  it('🔴 запись салона создаётся БЕЗ аккаунта Maya', async () => {
    const { run, appointmentCreate } = build();

    await run(true);

    const written = appointmentCreate.mock.calls[0][0];
    // Пользователей зеркало не заводит: аккаунт появляется только через вход.
    expect(written.data.clientId).toBeNull();
    expect(written.data.crmProvider).toBe('yclients');
    expect(written.data.crmExternalId).toBe('9001');
    expect(written.data.source).toBe('external');
  });

  it('клиент разрешается ТОЛЬКО через связь провайдера', async () => {
    const withLink = build({ clientLink: { clientId: 'client-maya-1' } });
    await withLink.run(true);
    expect(withLink.appointmentCreate.mock.calls[0][0].data.mayaClientId).toBe(
      'client-maya-1',
    );

    // Связи нет — клиента нет. По телефону не ищем вовсе.
    const withoutLink = build({ clientLink: null });
    await withoutLink.run(true);
    expect(
      withoutLink.appointmentCreate.mock.calls[0][0].data.mayaClientId,
    ).toBeNull();
  });

  it('🔴 неразрешённый мастер НЕ подменяется внешним id', async () => {
    const { run, appointmentCreate } = build({ staffId: null });

    await run(true);

    const written = appointmentCreate.mock.calls[0][0];
    expect(written.data.staffId).toBeNull();
    // Внешний id остаётся отдельно, как провенанс.
    expect(written.data.staffExternalId).toBe('1461615');
  });

  it('повторный проход без изменений ничего не создаёт и не обновляет', async () => {
    const { run, appointmentCreate, appointmentUpdate } = build({
      existing: {
        id: 'ap-1',
        staffId: 'staff-maya-1',
        staffExternalId: '1461615',
        startAt: new Date('2026-08-20T10:00:00.000Z'),
        endAt: new Date('2026-08-20T11:00:00.000Z'),
        status: 'confirmed',
        serviceIds: ['svc-1', 'svc-2'],
        mayaClientId: null,
        totalPriceKopecks: 250_000,
      },
    });

    const result = await run(true);

    expect(result.unchanged).toBe(1);
    expect(result.would_create).toBe(0);
    expect(result.would_update).toBe(0);
    expect(appointmentCreate).not.toHaveBeenCalled();
    expect(appointmentUpdate).not.toHaveBeenCalled();
  });

  it('изменившееся время признаётся изменением', async () => {
    const { run, appointmentUpdate } = build({
      existing: {
        id: 'ap-1',
        staffId: 'staff-maya-1',
        staffExternalId: '1461615',
        startAt: new Date('2026-08-20T14:00:00.000Z'),
        endAt: new Date('2026-08-20T15:00:00.000Z'),
        status: 'confirmed',
        serviceIds: ['svc-1', 'svc-2'],
        mayaClientId: null,
        totalPriceKopecks: 250_000,
      },
    });

    const result = await run(true);

    expect(result.would_update).toBe(1);
    expect(appointmentUpdate).toHaveBeenCalledTimes(1);
  });

  it('🔴 неполное окно помечается и полным проход не считается', async () => {
    const { run, getJournal } = build();
    getJournal.mockResolvedValue({
      calendar_source: 'external',
      completeness: 'truncated',
      truncation_reason: 'page_limit_reached',
      timezone: 'Europe/Moscow',
      range: { from: '', to: '' },
      provider_id: null,
      count: 0,
      appointments: [],
    } as unknown as Awaited<ReturnType<CrmService['getJournal']>>);

    const result = await run(false);

    expect(result.truncated_windows).toBeGreaterThan(0);
    // Проход неполон — значит по нему нельзя объявлять что-либо исчезнувшим.
    expect(result.complete).toBe(false);
  });

  it('отменённые считаются отдельно и не пропадают из зеркала', async () => {
    const { run } = build({ journal: { status: 'canceled' } });

    const result = await run(false);

    expect(result.cancelled_or_deleted).toBe(1);
    expect(result.would_create).toBe(1);
  });
});
