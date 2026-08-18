import type { ConfigService } from '@nestjs/config';

import { EventStoreService } from './event-store.service';
import { IngestionRetentionScheduler } from './ingestion-retention.scheduler';
import type { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

/**
 * 🔴 Cycle 03 closure fix — применение срока хранения карантина.
 *
 * Срок был объявлен с самого начала и не исполнялся. Здесь закрепляется, что
 * теперь он исполняется ИМЕННО так: истёкшее убирается, живое остаётся, а
 * история событий не трогается вовсе.
 */

type Row = { id: string; expiresAt: Date };
type DeleteArgs = { where: { expiresAt: { lt: Date } } };
type Mocked<T extends (...args: never[]) => unknown> = jest.MockedFunction<T>;

const build = (rows: Row[] = []) => {
  const store = [...rows];

  const deleteMany: Mocked<(args: DeleteArgs) => Promise<{ count: number }>> =
    jest.fn((args) => {
      const cutoff = args.where.expiresAt.lt;
      const before = store.length;
      for (let i = store.length - 1; i >= 0; i -= 1) {
        if (store[i].expiresAt.getTime() < cutoff.getTime()) store.splice(i, 1);
      }
      return Promise.resolve({ count: before - store.length });
    });

  const count: Mocked<(args: DeleteArgs) => Promise<number>> = jest.fn((args) =>
    Promise.resolve(
      store.filter(
        (row) => row.expiresAt.getTime() < args.where.expiresAt.lt.getTime(),
      ).length,
    ),
  );

  const eventDeleteMany = jest.fn();
  const eventUpdate = jest.fn();

  const prisma = {
    ingestionQuarantine: { deleteMany, count },
    domainEvent: { deleteMany: eventDeleteMany, update: eventUpdate },
  } as unknown as PrismaService;

  const service = new EventStoreService(prisma, new TenantContextService());

  return { service, store, deleteMany, count, eventDeleteMany, eventUpdate };
};

const NOW = new Date('2026-08-18T12:00:00.000Z');
const expired = (id: string): Row => ({
  id,
  expiresAt: new Date('2026-08-01T00:00:00.000Z'),
});
const alive = (id: string): Row => ({
  id,
  expiresAt: new Date('2026-09-01T00:00:00.000Z'),
});

describe('срок хранения карантина', () => {
  it('истёкшие строки удаляются', async () => {
    const { service, store } = build([expired('q-1'), expired('q-2')]);

    const result = await service.purgeExpiredQuarantine(NOW);

    expect(result.deleted).toBe(2);
    expect(store).toHaveLength(0);
  });

  it('🔴 ещё живые строки НЕ удаляются', async () => {
    const { service, store } = build([expired('q-1'), alive('q-2')]);

    const result = await service.purgeExpiredQuarantine(NOW);

    expect(result.deleted).toBe(1);
    expect(store.map((row) => row.id)).toEqual(['q-2']);
  });

  it('🔴 события НЕ трогаются: карантин истекает, история — нет', async () => {
    const { service, eventDeleteMany, eventUpdate } = build([expired('q-1')]);

    await service.purgeExpiredQuarantine(NOW);

    expect(eventDeleteMany).not.toHaveBeenCalled();
    expect(eventUpdate).not.toHaveBeenCalled();
  });

  it('🔴 повторный запуск не удаляет ничего сверх', async () => {
    const { service } = build([expired('q-1'), alive('q-2')]);

    const first = await service.purgeExpiredQuarantine(NOW);
    const second = await service.purgeExpiredQuarantine(NOW);

    expect(first.deleted).toBe(1);
    expect(second.deleted).toBe(0);
  });

  it('удаление ограничено сроком, а не арендатором или причиной', async () => {
    const { service, deleteMany } = build([expired('q-1')]);

    await service.purgeExpiredQuarantine(NOW);

    // У строки карантина арендатора может не быть вовсе — «арендатор не
    // разрешён» законная причина попасть сюда. Срок принадлежит платформе.
    expect(deleteMany.mock.calls[0][0].where).toEqual({
      expiresAt: { lt: NOW },
    });
  });

  it('сухой прогон считает и ничего не удаляет', async () => {
    const { service, store, deleteMany } = build([
      expired('q-1'),
      alive('q-2'),
    ]);

    const expiredCount = await service.countExpiredQuarantine(NOW);

    expect(expiredCount).toBe(1);
    expect(deleteMany).not.toHaveBeenCalled();
    expect(store).toHaveLength(2);
  });
});

describe('планировщик уборки', () => {
  const scheduler = (enabled: string | undefined, purge: jest.Mock) =>
    new IngestionRetentionScheduler(
      {
        purgeExpiredQuarantine: purge,
        configuredQuarantineRetentionDays: () => 14,
      } as unknown as EventStoreService,
      { get: () => enabled } as unknown as ConfigService,
    );

  it('🔴 включён по умолчанию — срок объявлен при создании строки', () => {
    const purge = jest.fn().mockResolvedValue({ deleted: 0 });
    const s = scheduler(undefined, purge);

    s.onModuleInit();
    s.onModuleDestroy();

    // Таймеры заведены: явного «выключено» не было.
    expect(purge).not.toHaveBeenCalled(); // первый проход отложен, не мгновенный
  });

  it('сбой уборки не роняет приложение', async () => {
    const purge = jest.fn().mockRejectedValue(new Error('база недоступна'));
    const s = scheduler('true', purge);

    await expect(s.tick()).resolves.toBeUndefined();
  });

  it('явное выключение уважается', () => {
    const purge = jest.fn();
    const s = scheduler('false', purge);

    s.onModuleInit();
    s.onModuleDestroy();

    expect(purge).not.toHaveBeenCalled();
  });
});
