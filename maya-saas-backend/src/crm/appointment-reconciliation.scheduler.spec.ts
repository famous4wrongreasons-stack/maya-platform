import type { ConfigService } from '@nestjs/config';

import type { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AppointmentReconciliationScheduler } from './appointment-reconciliation.scheduler';
import type { AppointmentReconciliationService } from './appointment-reconciliation.service';

/**
 * 🔴 Cycle 03 B3.4 — планировщик сверки.
 *
 * Что здесь закрепляется: планировщик ходит по АКТИВНЫМ интеграциям, сбой
 * одного арендатора не трогает остальных, а занятая аренда — штатный исход, а
 * не ошибка.
 */

type Mocked<T extends (...args: never[]) => unknown> = jest.MockedFunction<T>;

const build = (over?: {
  integrations?: Array<{ tenantId: string; provider: string }>;
  run?: Mocked<AppointmentReconciliationService['run']>;
  enabled?: boolean;
}) => {
  const findMany: Mocked<(args: unknown) => Promise<unknown>> = jest
    .fn()
    .mockResolvedValue(
      over?.integrations ?? [{ tenantId: 'tenant-1', provider: 'yclients' }],
    );
  const prisma = {
    crmIntegration: { findMany },
  } as unknown as PrismaService;

  const run =
    over?.run ??
    (jest.fn().mockResolvedValue({
      status: 'ran',
      run_id: 'run-1',
      completeness: 'complete',
      fetched: 1,
      created: 0,
      updated: 0,
      unchanged: 1,
      events_emitted: 0,
    }) as Mocked<AppointmentReconciliationService['run']>);
  const reconciliation = { run } as unknown as AppointmentReconciliationService;

  const config = {
    get: jest.fn().mockReturnValue(over?.enabled === false ? 'false' : 'true'),
  } as unknown as ConfigService;

  const scheduler = new AppointmentReconciliationScheduler(
    prisma,
    new TenantContextService(),
    reconciliation,
    config,
  );

  return { scheduler, findMany, run, config };
};

describe('планировщик сверки', () => {
  it('🔴 идёт по АКТИВНЫМ интеграциям CRM, а не по всем арендаторам', async () => {
    const { scheduler, findMany } = build();

    await scheduler.tick('near');

    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { status: 'active' },
    });
  });

  it('🔴 арендатор без CRM не даёт ни прогонов, ни ошибок', async () => {
    // `maya-os` в выборку активных интеграций не попадает вовсе.
    const { scheduler, run } = build({ integrations: [] });

    await expect(scheduler.tick('near')).resolves.toBeUndefined();

    expect(run).not.toHaveBeenCalled();
  });

  it('🔴 сбой одного арендатора НЕ блокирует остальных', async () => {
    const run = jest
      .fn()
      .mockRejectedValueOnce(new Error('провайдер первого молчит'))
      .mockResolvedValueOnce({
        status: 'ran',
        completeness: 'complete',
        fetched: 0,
        created: 0,
        updated: 0,
        unchanged: 0,
        events_emitted: 0,
      }) as Mocked<AppointmentReconciliationService['run']>;

    const { scheduler } = build({
      integrations: [
        { tenantId: 'tenant-1', provider: 'yclients' },
        { tenantId: 'tenant-2', provider: 'yclients' },
      ],
      run,
    });

    await expect(scheduler.tick('near')).resolves.toBeUndefined();

    // Второй арендатор обработан несмотря на падение первого.
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('🔴 занятая аренда — штатный пропуск, а не сбой', async () => {
    const run = jest.fn().mockResolvedValue({
      status: 'already_running',
      tenantId: 'tenant-1',
      provider: 'yclients',
      held_by: 'manual:host:1',
      lease_until: '2026-08-18T00:10:00.000Z',
    }) as Mocked<AppointmentReconciliationService['run']>;

    const { scheduler } = build({ run });

    await expect(scheduler.tick('near')).resolves.toBeUndefined();
  });

  it('окна контуров различаются: ближний уже среднего', async () => {
    const { scheduler, run } = build();

    await scheduler.tick('near');
    await scheduler.tick('medium');

    const near = run.mock.calls[0][0];
    const medium = run.mock.calls[1][0];
    const span = (call: { from: Date; to: Date }) =>
      call.to.getTime() - call.from.getTime();

    expect(span(near)).toBeLessThan(span(medium));
    expect(near.holder).toBe('scheduler:near');
    expect(medium.holder).toBe('scheduler:medium');
  });

  it('🔴 выключенный планировщик не заводит таймеров', () => {
    const { scheduler, findMany } = build({ enabled: false });

    scheduler.onModuleInit();

    // Выкат и включение — разные события.
    expect(findMany).not.toHaveBeenCalled();
    scheduler.onModuleDestroy();
  });
});
