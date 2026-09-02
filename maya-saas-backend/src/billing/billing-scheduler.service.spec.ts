import { ConfigService } from '@nestjs/config';

import { BillingSchedulerService } from './billing-scheduler.service';
import { P408TenantBillingCanonicalCutoverService } from './p4-08-tenant-billing-canonical-cutover.service';

/**
 * Планировщик автопродления.
 *
 * Проверяем ровно то, из-за чего продление и не работало / могло навредить:
 * что проход вообще случается, что два прохода не накладываются (иначе одна
 * подписка спишется дважды) и что упавший проход не роняет приложение.
 */
describe('BillingSchedulerService', () => {
  const emptyRun = () =>
    Promise.resolve({
      checked: 0,
      charged: 0,
      marked_past_due: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    });

  const build = (
    runDueBilling: jest.Mock,
    env: Record<string, string> = {},
    reconcilePendingPayments: jest.Mock = jest
      .fn()
      .mockResolvedValue({ checked: 0, applied: 0, failed: 0 }),
  ) => {
    const canonicalBilling = {
      runDueBilling,
      reconcilePendingPayments,
    } as unknown as P408TenantBillingCanonicalCutoverService;
    const configService = {
      get: (key: string) => env[key],
    } as unknown as ConfigService;

    return new BillingSchedulerService(canonicalBilling, configService);
  };

  afterEach(() => {
    jest.useRealTimers();
  });

  it('делает проход продления', async () => {
    const runDueBilling = jest.fn().mockImplementation(emptyRun);
    const scheduler = build(runDueBilling);

    await scheduler.tick();

    expect(runDueBilling).toHaveBeenCalledTimes(1);
  });

  it('не запускает второй проход поверх незавершённого', async () => {
    let release: (() => void) | null = null;
    const runDueBilling = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              checked: 0,
              charged: 0,
              marked_past_due: 0,
              skipped: 0,
              failed: 0,
              errors: [],
            });
        }),
    );
    const scheduler = build(runDueBilling);

    const first = scheduler.tick();
    await scheduler.tick(); // второй тик приходит, пока первый ещё идёт

    expect(runDueBilling).toHaveBeenCalledTimes(1);

    release?.();
    await first;

    // После завершения первого прохода следующий снова разрешён.
    runDueBilling.mockImplementation(emptyRun);
    await scheduler.tick();
    expect(runDueBilling).toHaveBeenCalledTimes(2);
  });

  it('переживает падение прохода и не бросает наружу', async () => {
    const runDueBilling = jest
      .fn()
      .mockRejectedValue(new Error('YooKassa недоступна'));
    const scheduler = build(runDueBilling);

    await expect(scheduler.tick()).resolves.toBeUndefined();

    // Флаг занятости снят — следующий проход состоится.
    runDueBilling.mockImplementation(emptyRun);
    await scheduler.tick();
    expect(runDueBilling).toHaveBeenCalledTimes(2);
  });

  it('не заводит таймеры, когда выключен конфигурацией', () => {
    const runDueBilling = jest.fn().mockImplementation(emptyRun);
    const scheduler = build(runDueBilling, {
      BILLING_SCHEDULER_ENABLED: 'false',
    });
    const setIntervalSpy = jest.spyOn(global, 'setInterval');

    scheduler.onModuleInit();

    expect(setIntervalSpy).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
    scheduler.onModuleDestroy();
  });
  it('сверяет зависшие платежи ДО продления', async () => {
    const order: string[] = [];
    const reconcile = jest.fn().mockImplementation(() => {
      order.push('сверка');
      return Promise.resolve({ checked: 0, applied: 0, failed: 0 });
    });
    const runDueBilling = jest.fn().mockImplementation(() => {
      order.push('продление');
      return emptyRun();
    });
    const scheduler = build(runDueBilling, {}, reconcile);

    await scheduler.tick();

    // Порядок важен: платёж мог пройти, а уведомление не дойти. Если не
    // досчитать его первым, салон с оплаченной подпиской выглядел бы должником.
    expect(order).toEqual(['сверка', 'продление']);
  });
});
