import type { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { AppointmentChangeService } from './appointment-change.service';
import type { AppointmentObservationService } from './appointment-observation.service';
import { QuarantineCatchupService } from './quarantine-catchup.service';

/**
 * 🔴 Cycle 03 B3.4 — адресный догон по карантину.
 *
 * Главные обещания: исторических событий создания не появляется, совпавшее
 * состояние проходит молча, а строка карантина не исчезает без следа.
 */

type Mocked<T extends (...args: never[]) => unknown> = jest.MockedFunction<T>;
type QuarantineRow = {
  id: string;
  fingerprint: string;
  diagnostic: Record<string, unknown> | null;
};
type UpdateArgs = { where: { id: string }; data: Record<string, unknown> };

const observation = {
  externalId: '9001',
  state: {
    staffExternalId: '1461615',
    staffId: 'staff-1',
    startAt: new Date('2026-08-20T10:00:00.000Z'),
    endAt: new Date('2026-08-20T11:00:00.000Z'),
    serviceIds: ['svc-1'],
    status: 'confirmed',
    attendance: null,
    mayaClientId: null,
  },
  totalPriceKopecks: 250_000,
  currency: 'RUB',
};

const build = (over?: {
  rows?: QuarantineRow[];
  observed?: unknown;
  applied?: Record<string, unknown>;
  baseline?: boolean;
}) => {
  const rows = over?.rows ?? [
    { id: 'q-1', fingerprint: 'f1', diagnostic: { external_id: '9001' } },
  ];

  const findMany: Mocked<(args: unknown) => Promise<QuarantineRow[]>> = jest
    .fn()
    .mockResolvedValue(rows);
  const findUnique: Mocked<(args: unknown) => Promise<QuarantineRow | null>> =
    jest.fn().mockResolvedValue(rows[0] ?? null);
  const update: Mocked<(args: UpdateArgs) => Promise<unknown>> = jest
    .fn()
    .mockResolvedValue({});
  const deleteMany: Mocked<(args: unknown) => Promise<unknown>> = jest.fn();

  const prisma = {
    ingestionQuarantine: { findMany, findUnique, update, deleteMany },
  } as unknown as PrismaService;

  const observe: Mocked<AppointmentObservationService['observe']> = jest
    .fn()
    .mockResolvedValue(over?.observed ?? observation);
  const baselineEstablished = jest
    .fn()
    .mockResolvedValue(over?.baseline ?? true);
  const observationService = {
    observe,
    baselineEstablished,
  } as unknown as AppointmentObservationService;

  const applyObservation: Mocked<AppointmentChangeService['applyObservation']> =
    jest.fn().mockResolvedValue({
      appointmentId: 'ap-1',
      outcome: 'unchanged',
      transitions: [],
      eventsEmitted: 0,
      duplicateEvents: 0,
      ...over?.applied,
    });
  const changeService = {
    applyObservation,
  } as unknown as AppointmentChangeService;

  const tenantContext = new TenantContextService();
  const service = new QuarantineCatchupService(
    prisma,
    tenantContext,
    observationService,
    changeService,
  );

  const run = () =>
    tenantContext.runAsSystemTenant('tenant-1', () =>
      service.run({ tenantId: 'tenant-1', provider: 'yclients' }),
    );

  return { run, findMany, update, deleteMany, observe, applyObservation };
};

describe('догон по карантину', () => {
  it('🔴 берёт только то, что имеет смысл перечитывать', async () => {
    const { run, findMany } = build();

    await run();

    const where = (
      findMany.mock.calls[0][0] as { where: Record<string, unknown> }
    ).where;
    expect(where).toMatchObject({
      resolution: 'open',
      reason: { in: ['entity_unresolved', 'source_unreadable'] },
    });
  });

  it('совпавшее состояние проходит молча', async () => {
    const { run, applyObservation } = build();

    const result = await run();

    expect(result.explained_no_change).toBe(1);
    expect(result.events_emitted).toBe(0);
    expect(applyObservation).toHaveBeenCalledTimes(1);
  });

  it('🔴 догон НЕ заключает удаление по отсутствию записи', async () => {
    const { run, observe } = build();

    await run();

    // Доставка старая: отсутствие записи сейчас не доказывает ничего.
    expect(observe.mock.calls[0][0].expectRemoved).toBe(false);
  });

  it('🔴 строка карантина НЕ удаляется — записывается исход', async () => {
    const { run, update, deleteMany } = build();

    await run();

    expect(deleteMany).not.toHaveBeenCalled();
    const written = update.mock.calls[0][0];
    expect(written.data.resolution).toBe('explained');
    expect(
      (written.data.diagnostic as Record<string, unknown>).catchup_outcome,
    ).toBe('explained_no_change');
  });

  it('источник по-прежнему молчит — строка остаётся открытой', async () => {
    const { run, update } = build({ observed: 'unreadable' });

    const result = await run();

    expect(result.still_unresolved).toBe(1);
    // Открытая строка — это честное «до сих пор не объяснено».
    expect(update.mock.calls[0][0].data.resolution).toBe('open');
  });

  it('🔴 состояние базовой линии передаётся компаратору, а не решается здесь', async () => {
    const { run, applyObservation } = build({ baseline: false });

    await run();

    expect(applyObservation.mock.calls[0][0].baselineEstablished).toBe(false);
  });

  it('без идентификатора записи перечитывать нечего', async () => {
    const { run, observe } = build({
      rows: [
        { id: 'q-2', fingerprint: 'f2', diagnostic: { resource: 'record' } },
      ],
    });

    const result = await run();

    expect(observe).not.toHaveBeenCalled();
    expect(result.still_unresolved).toBe(1);
  });

  it('в счётчиках догона нет персональных данных', async () => {
    const { run } = build();

    const result = await run();

    expect(JSON.stringify(result)).not.toMatch(/phone|name|email/i);
  });
});
