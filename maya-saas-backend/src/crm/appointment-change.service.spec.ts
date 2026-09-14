import { DOMAIN_EVENT_TYPE, type CanonicalAppointmentState } from '../domain';
import type { EventStoreService } from '../events/event-store.service';
import type { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  AppointmentChangeService,
  type ObservedAppointment,
} from './appointment-change.service';

/**
 * 🔴 Cycle 03 B3.3 — применение наблюдения.
 *
 * Что здесь доказывается: зеркало и события пишутся ОДНОЙ транзакцией, событие
 * создания не выпускается до установленной базовой линии, а повторное
 * наблюдение того же состояния не порождает ничего.
 */

type UpdateArgs = { data: Record<string, unknown> };

type Row = {
  id: string;
  staffId: string | null;
  staffExternalId: string;
  startAt: Date;
  endAt: Date;
  serviceIds: unknown;
  status: string;
  attendance: string | null;
  mayaClientId: string | null;
  totalPriceKopecks: number | null;
};

const row = (over: Partial<Row> = {}): Row => ({
  id: 'ap-1',
  staffId: 'staff-maya-1',
  staffExternalId: '1461615',
  startAt: new Date('2026-08-20T10:00:00.000Z'),
  endAt: new Date('2026-08-20T11:00:00.000Z'),
  serviceIds: ['svc-1', 'svc-2'],
  status: 'confirmed',
  attendance: null,
  mayaClientId: null,
  totalPriceKopecks: 250_000,
  ...over,
});

const observedState = (
  over: Partial<CanonicalAppointmentState> = {},
): CanonicalAppointmentState => ({
  staffExternalId: '1461615',
  staffId: 'staff-maya-1',
  startAt: new Date('2026-08-20T10:00:00.000Z'),
  endAt: new Date('2026-08-20T11:00:00.000Z'),
  serviceIds: ['svc-1', 'svc-2'],
  status: 'confirmed',
  attendance: null,
  mayaClientId: null,
  ...over,
});

const observed = (
  over: Partial<CanonicalAppointmentState> = {},
  price: number | null = 250_000,
): ObservedAppointment => ({
  externalId: '9001',
  state: observedState(over),
  totalPriceKopecks: price,
  currency: 'RUB',
});

const build = (opts?: { existing?: Row | null; appendThrows?: boolean }) => {
  const existing = opts?.existing ?? null;

  /** Клиент транзакции. Всё, что ушло не через него, — вне одного коммита. */
  const update: jest.MockedFunction<(args: UpdateArgs) => Promise<unknown>> =
    jest.fn().mockResolvedValue({ id: existing?.id ?? 'ap-new' });
  const create: jest.MockedFunction<(args: unknown) => Promise<unknown>> = jest
    .fn()
    .mockResolvedValue({ id: 'ap-new' });
  const tx = {
    $queryRaw: jest
      .fn()
      .mockResolvedValue(existing ? [{ id: existing.id }] : []),
    appointment: {
      findUnique: jest.fn().mockResolvedValue(existing),
      create,
      update,
    },
    domainEvent: {
      aggregate: jest.fn().mockResolvedValue({ _max: { entitySequence: 3 } }),
    },
  };

  const committed = { value: false };
  const transaction: jest.MockedFunction<
    (fn: (client: unknown) => Promise<unknown>) => Promise<unknown>
  > = jest.fn(async (fn) => {
    const result = await fn(tx);
    committed.value = true;
    return result;
  });
  const prisma = {
    $transaction: transaction,
    // Прямые обращения мимо транзакции обязаны быть видны как ошибка теста.
    appointment: {
      create: jest.fn(() => {
        throw new Error('запись мимо транзакции');
      }),
      update: jest.fn(() => {
        throw new Error('запись мимо транзакции');
      }),
    },
  } as unknown as PrismaService;

  const append: jest.MockedFunction<EventStoreService['append']> = jest.fn(
    () => {
      if (opts?.appendThrows) {
        return Promise.reject(new Error('событие не записалось'));
      }
      return Promise.resolve({
        outcome: 'persisted' as const,
        eventId: 'ev-1',
      });
    },
  );

  const eventStore = { append } as unknown as EventStoreService;
  const tenantContext = new TenantContextService();
  const service = new AppointmentChangeService(
    prisma,
    tenantContext,
    eventStore,
  );

  const apply = (over?: {
    observed?: ObservedAppointment;
    baselineEstablished?: boolean;
    ingestionMethod?: 'webhook' | 'reconciliation';
  }) =>
    tenantContext.runAsSystemTenant('tenant-1', () =>
      service.applyObservation({
        tenantId: 'tenant-1',
        provider: 'yclients',
        observed: over?.observed ?? observed(),
        ingestionMethod: over?.ingestionMethod ?? 'webhook',
        baselineEstablished: over?.baselineEstablished ?? true,
        observedAt: new Date('2026-08-18T09:00:00.000Z'),
      }),
    );

  return { apply, tx, transaction, append, committed, update, create };
};

describe('применение наблюдения к зеркалу', () => {
  it('совпавшее состояние не пишет ничего', async () => {
    const { apply, tx, append } = build({ existing: row() });

    const result = await apply();

    expect(result.outcome).toBe('unchanged');
    expect(result.transitions).toEqual([]);
    expect(tx.appointment.update).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('🔴 зеркало и события пишутся ОДНИМ клиентом транзакции', async () => {
    const { apply, tx, transaction, append } = build({
      existing: row(),
    });

    await apply({
      observed: observed({ startAt: new Date('2026-08-20T14:00:00.000Z') }),
    });

    expect(tx.appointment.update).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledTimes(1);
    // Второй аргумент `append` — тот же клиент, которым обновлено зеркало.
    expect(append.mock.calls[0][1]).toBe(tx);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('🔴 провал записи события уносит транзакцию целиком', async () => {
    const { apply, committed } = build({
      existing: row(),
      appendThrows: true,
    });

    await expect(
      apply({
        observed: observed({ startAt: new Date('2026-08-20T14:00:00.000Z') }),
      }),
    ).rejects.toThrow('событие не записалось');

    // Коммита не было: обновление зеркала уйдёт вместе с событием.
    expect(committed.value).toBe(false);
  });

  it('новая запись после установленной базовой линии даёт created', async () => {
    const { apply, tx, append } = build({ existing: null });

    const result = await apply({ baselineEstablished: true });

    expect(result.outcome).toBe('created');
    expect(tx.appointment.create).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledTimes(1);
    expect(append.mock.calls[0][0].type).toBe(
      DOMAIN_EVENT_TYPE.appointmentCreated,
    );
  });

  it('🔴 до установленной базовой линии created НЕ выпускается', async () => {
    const { apply, tx, append } = build({ existing: null });

    const result = await apply({ baselineEstablished: false });

    expect(result.outcome).toBe('created');
    expect(tx.appointment.create).toHaveBeenCalledTimes(1);
    // Строка зеркала появилась, событие — нет.
    expect(append).not.toHaveBeenCalled();
    expect(result.eventsEmitted).toBe(0);
  });

  it('первое наблюдение присутствия обновляет зеркало и молчит', async () => {
    const { apply, tx, append, update } = build({
      existing: row({ attendance: null }),
    });

    const result = await apply({
      observed: observed({ attendance: 'awaiting' }),
    });

    expect(result.outcome).toBe('updated');
    expect(tx.appointment.update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data.attendance).toBe('awaiting');
    expect(append).not.toHaveBeenCalled();
  });

  it('переход присутствия даёт ровно одно событие', async () => {
    const { apply, append } = build({
      existing: row({ attendance: 'awaiting' }),
    });

    await apply({ observed: observed({ attendance: 'arrived' }) });

    expect(append).toHaveBeenCalledTimes(1);
    expect(append.mock.calls[0][0].type).toBe(
      DOMAIN_EVENT_TYPE.appointmentAttendanceChanged,
    );
  });

  it('🔴 изменение цены зеркало обновляет, но событием не считает', async () => {
    const { apply, tx, append } = build({ existing: row() });

    const result = await apply({ observed: observed({}, 300_000) });

    expect(result.outcome).toBe('updated');
    expect(tx.appointment.update).toHaveBeenCalledTimes(1);
    expect(append).not.toHaveBeenCalled();
  });

  it('порядковые номера событий возрастают от последнего известного', async () => {
    const { apply, append } = build({
      existing: row({ attendance: 'awaiting' }),
    });

    await apply({
      observed: observed({
        startAt: new Date('2026-08-20T14:00:00.000Z'),
        attendance: 'arrived',
      }),
    });

    expect(append).toHaveBeenCalledTimes(2);
    expect(append.mock.calls[0][0].entitySequence).toBe(4);
    expect(append.mock.calls[1][0].entitySequence).toBe(5);
  });

  it('🔴 отпечаток НЕ зависит от способа приёма', async () => {
    const viaWebhook = build({ existing: row() });
    await viaWebhook.apply({
      observed: observed({ startAt: new Date('2026-08-20T14:00:00.000Z') }),
      ingestionMethod: 'webhook',
    });

    const viaReconciliation = build({ existing: row() });
    await viaReconciliation.apply({
      observed: observed({ startAt: new Date('2026-08-20T14:00:00.000Z') }),
      ingestionMethod: 'reconciliation',
    });

    // Один и тот же факт, увиденный двумя путями, — один ключ дедупликации.
    expect(viaWebhook.append.mock.calls[0][0].dedupFingerprint).toBe(
      viaReconciliation.append.mock.calls[0][0].dedupFingerprint,
    );
  });

  it('идентичность события — Maya, внешний идентификатор только провенанс', async () => {
    const { apply, append } = build({ existing: row() });

    await apply({
      observed: observed({ startAt: new Date('2026-08-20T14:00:00.000Z') }),
    });

    expect(append.mock.calls[0][0].entityId).toBe('ap-1');
    expect(append.mock.calls[0][0].sourceRef).toBe('9001');
  });

  it('в нагрузке события нет персональных данных', async () => {
    const { apply, append } = build({ existing: row() });

    await apply({
      observed: observed({ startAt: new Date('2026-08-20T14:00:00.000Z') }),
    });

    const payload = JSON.stringify(append.mock.calls[0][0].payload);
    expect(payload).not.toMatch(/phone|name|email|клиент/i);
  });
});
