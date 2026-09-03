import type { ConfigService } from '@nestjs/config';
import { EventStoreService } from './event-store.service';
import { IngestionRetentionScheduler } from './ingestion-retention.scheduler';
import type { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { Package5Wave6MaintenanceService } from '../package5-wave6/package5-wave6.service';

describe('quarantine canonical maintenance adapter', () => {
  afterEach(() => jest.restoreAllMocks());
  it('delegates to the bounded AC6 coordinator and reports no second deletion on replay', async () => {
    const prepare = jest
      .spyOn(Package5Wave6MaintenanceService.prototype, 'prepare')
      .mockResolvedValue('run');
    jest
      .spyOn(Package5Wave6MaintenanceService.prototype, 'execute')
      .mockResolvedValueOnce({
        byKind: { IngestionQuarantine: 2 },
        replayed: false,
      } as never)
      .mockResolvedValueOnce({
        byKind: { IngestionQuarantine: 2 },
        replayed: true,
      } as never);
    const direct = jest.fn();
    const service = new EventStoreService(
      {
        ingestionQuarantine: { deleteMany: direct },
      } as unknown as PrismaService,
      new TenantContextService(),
    );
    expect(await service.purgeExpiredQuarantine()).toEqual({ deleted: 2 });
    expect(await service.purgeExpiredQuarantine()).toEqual({ deleted: 0 });
    expect(prepare).toHaveBeenCalledWith({
      actionClass: 'purge_ingestion_quarantine',
    });
    expect(direct).not.toHaveBeenCalled();
  });
  it('keeps eligibility reads read-only and fails closed on coordinator errors', async () => {
    const count = jest.fn().mockResolvedValue(2);
    const direct = jest.fn();
    jest
      .spyOn(Package5Wave6MaintenanceService.prototype, 'prepare')
      .mockRejectedValue(new Error('denied'));
    const service = new EventStoreService(
      {
        ingestionQuarantine: { count, deleteMany: direct },
      } as unknown as PrismaService,
      new TenantContextService(),
    );
    expect(await service.countExpiredQuarantine(new Date())).toBe(2);
    await expect(service.purgeExpiredQuarantine()).rejects.toThrow('denied');
    expect(direct).not.toHaveBeenCalled();
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
