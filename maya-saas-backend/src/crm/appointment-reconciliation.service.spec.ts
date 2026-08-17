import { DOMAIN_EVENT_TYPE } from '../domain';
import type { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { AppointmentChangeService } from './appointment-change.service';
import type { AppointmentObservationService } from './appointment-observation.service';
import { AppointmentReconciliationService } from './appointment-reconciliation.service';
import type { CrmService } from './crm.service';

/**
 * 🔴 Cycle 03 B3.3 — сверка.
 *
 * Главное, что здесь закрепляется: по НЕПОЛНОМУ проходу нельзя объявить
 * что-либо исчезнувшим, а упавший проход нельзя перепутать с полным.
 */

const journalAppointment = (over: Record<string, unknown> = {}) => ({
  id: 'crm-9001',
  client: { id: '5501', name: 'Клиент' },
  provider: { id: '1461615', name: 'Мастер' },
  service_ids: ['svc-1'],
  start_at: '2026-08-20T10:00:00.000Z',
  end_at: '2026-08-20T11:00:00.000Z',
  status: 'confirmed',
  attendance: null,
  notes: null,
  total_price: 2500,
  currency: 'RUB',
  ...over,
});

type Shape = {
  id: string;
  provider: { id: string };
  service_ids: string[];
  start_at: string;
  end_at: string;
  status: string;
  attendance: string | null;
};

type RunUpdateArgs = { data: Record<string, unknown> };
type RunFindArgs = { where: Record<string, unknown> };
type Mocked<T extends (...args: never[]) => unknown> = jest.MockedFunction<T>;

const build = (over?: {
  journal?: Record<string, unknown>;
  journalThrows?: boolean;
  applyResult?: Record<string, unknown>;
}) => {
  const runRow = { id: 'run-1' };
  const create: Mocked<(args: unknown) => Promise<unknown>> = jest
    .fn()
    .mockResolvedValue(runRow);
  const update: Mocked<(args: RunUpdateArgs) => Promise<unknown>> = jest
    .fn()
    .mockResolvedValue(runRow);
  const findFirst: Mocked<(args: RunFindArgs) => Promise<unknown>> = jest
    .fn()
    .mockResolvedValue(null);

  const prisma = {
    reconciliationRun: { create, update, findFirst },
    crmIntegration: {
      findUnique: jest.fn().mockResolvedValue({ provider: 'yclients' }),
    },
  } as unknown as PrismaService;

  const getJournal: Mocked<
    (tenantId: string, query: unknown, options?: unknown) => Promise<unknown>
  > = over?.journalThrows
    ? jest.fn().mockRejectedValue(new Error('провайдер молчит'))
    : jest.fn().mockResolvedValue({
        calendar_source: 'external',
        completeness: 'complete',
        timezone: 'Europe/Moscow',
        range: { from: '', to: '' },
        provider_id: null,
        count: 1,
        appointments: [journalAppointment()],
        ...over?.journal,
      });
  const crmService = { getJournal } as unknown as CrmService;

  const fromSourceShape: Mocked<
    (tenantId: string, provider: string, item: Shape) => Promise<unknown>
  > = jest.fn((_tenantId: string, _provider: string, item: Shape) =>
    Promise.resolve({
      externalId: item.id.replace(/^crm-/, ''),
      state: {
        staffExternalId: item.provider.id,
        staffId: 'staff-maya-1',
        startAt: new Date(item.start_at),
        endAt: new Date(item.end_at),
        serviceIds: [...item.service_ids].sort(),
        status: item.status,
        attendance: item.attendance ?? null,
        mayaClientId: null,
      },
      totalPriceKopecks: 250_000,
      currency: 'RUB',
    }),
  );
  const baselineEstablished = jest.fn().mockResolvedValue(true);
  const observationService = {
    fromSourceShape,
    baselineEstablished,
  } as unknown as AppointmentObservationService;

  const applyObservation: Mocked<
    (input: {
      ingestionMethod: string;
      baselineEstablished: boolean;
    }) => Promise<unknown>
  > = jest.fn().mockResolvedValue({
    appointmentId: 'ap-1',
    outcome: 'unchanged',
    transitions: [],
    eventsEmitted: 0,
    duplicateEvents: 0,
    ...over?.applyResult,
  });
  const changeService = {
    applyObservation,
  } as unknown as AppointmentChangeService;

  const tenantContext = new TenantContextService();
  const service = new AppointmentReconciliationService(
    prisma,
    tenantContext,
    crmService,
    observationService,
    changeService,
  );

  const run = () =>
    tenantContext.runAsSystemTenant('tenant-1', () =>
      service.run({
        tenantId: 'tenant-1',
        from: new Date('2026-08-18T00:00:00.000Z'),
        to: new Date('2026-08-25T00:00:00.000Z'),
      }),
    );

  return {
    service,
    run,
    create,
    update,
    findFirst,
    getJournal,
    applyObservation,
    tenantContext,
  };
};

describe('сверка зеркала визитов', () => {
  it('полный проход помечается полным и завершается', async () => {
    const { run, update } = build();

    const result = await run();

    expect(result.completeness).toBe('complete');
    const written = update.mock.calls[0][0].data;
    expect(written.completeness).toBe('complete');
    expect(written.finishedAt).toBeInstanceOf(Date);
  });

  it('🔴 усечённый проход полным не считается — выводов об отсутствии по нему нет', async () => {
    const { run, update } = build({
      journal: {
        completeness: 'truncated',
        truncation_reason: 'page_limit_reached',
        appointments: [],
      },
    });

    const result = await run();

    expect(result.completeness).toBe('truncated');
    expect(result.truncation_reason).toBe('page_limit_reached');
    expect(update.mock.calls[0][0].data.completeness).toBe('truncated');
  });

  it('🔴 упавший проход НЕ завершается — его нельзя принять за полный', async () => {
    const { run, update } = build({ journalThrows: true });

    await expect(run()).rejects.toThrow('провайдер молчит');

    const written = update.mock.calls[0][0].data;
    expect(written.failureCode).toBe('reconciliation_failed');
    // Ни отметки завершения, ни полноты: по такому проходу выводов не сделать.
    expect(written.finishedAt).toBeUndefined();
    expect(written.completeness).toBeUndefined();
  });

  it('🔴 последний ПОЛНЫЙ проход отбирается так, что усечённый и упавший исключены', async () => {
    const { service, findFirst } = build();

    await service.lastCompleteRun('tenant-1');

    expect(findFirst.mock.calls[0][0].where).toEqual({
      tenantId: 'tenant-1',
      completeness: 'complete',
      finishedAt: { not: null },
      failureCode: null,
    });
  });

  it('отменённые из выборки не выбрасываются — иначе отмена выглядела бы исчезновением', async () => {
    const { run, getJournal } = build();

    await run();

    expect(getJournal.mock.calls[0][2]).toEqual({ includeCanceled: true });
  });

  it('🔴 сверка применяет наблюдение тем же компаратором, отмечая свой способ приёма', async () => {
    const { run, applyObservation } = build();

    await run();

    expect(applyObservation).toHaveBeenCalledTimes(1);
    expect(applyObservation.mock.calls[0][0].ingestionMethod).toBe(
      'reconciliation',
    );
  });

  it('счётчики событий берутся из применения, а не считаются заново', async () => {
    const { run } = build({
      applyResult: {
        outcome: 'updated',
        transitions: [DOMAIN_EVENT_TYPE.appointmentRescheduled],
        eventsEmitted: 1,
        duplicateEvents: 0,
      },
    });

    const result = await run();

    expect(result.updated).toBe(1);
    expect(result.events_emitted).toBe(1);
    expect(result.unchanged).toBe(0);
  });

  it('в счётчиках прохода нет персональных данных', async () => {
    const { run } = build();

    const result = await run();

    expect(JSON.stringify(result)).not.toMatch(/phone|name|Клиент|Мастер/i);
  });
});
