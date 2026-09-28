import { Prisma } from '@prisma/client';

import { DOMAIN_EVENT_TYPE } from '../domain';
import type { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { EventStoreService } from './event-store.service';

/**
 * 🔴 CYCLE 03 B1 — хранилище фактов.
 *
 * Проверяются ровно те правила, которые легко потерять при следующей правке:
 * повтор — не ошибка, провал обработки не стирает факт, а карантин не умеет
 * притвориться событием.
 */

type Mock<T extends (...args: never[]) => unknown> = jest.MockedFunction<T>;

/** Аргумент записи: без явного типа `mock.calls` становится `any`. */
type WriteArgs = { data: Record<string, unknown> };

/** Приём факта идёт `createManyAndReturn` + `skipDuplicates`, поэтому мок — на нём. */
type AppendArgs = {
  data: Record<string, unknown>[];
  skipDuplicates?: boolean;
};
type AppendMany = Mock<(args: AppendArgs) => Promise<{ id: string }[]>>;

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'test',
  });

const buildService = (overrides?: {
  appendMany?: AppendMany;
  quarantineCreate?: Mock<(args: WriteArgs) => Promise<{ id: string }>>;
  update?: Mock<(args: WriteArgs) => Promise<{ attempts: number }>>;
}) => {
  // Тип задаётся явно и здесь: у голого `jest.fn()` он выводится как `any`, и
  // тогда `mock.calls` перестаёт проверяться типами вовсе.
  const appendMany: AppendMany =
    overrides?.appendMany ?? jest.fn().mockResolvedValue([{ id: 'event-1' }]);
  const quarantineCreate: Mock<(args: WriteArgs) => Promise<{ id: string }>> =
    overrides?.quarantineCreate ??
    jest.fn().mockResolvedValue({ id: 'quarantine-1' });
  const update: Mock<(args: WriteArgs) => Promise<{ attempts: number }>> =
    overrides?.update ?? jest.fn().mockResolvedValue({ attempts: 1 });

  const prisma = {
    domainEvent: { createManyAndReturn: appendMany, update },
    ingestionQuarantine: { create: quarantineCreate },
  } as unknown as PrismaService;

  const tenantContext = new TenantContextService();
  const service = new EventStoreService(prisma, tenantContext);
  return { service, tenantContext, appendMany, quarantineCreate, update };
};

const appendInput = {
  tenantId: 'tenant-1',
  type: DOMAIN_EVENT_TYPE.appointmentCreated,
  entityType: 'appointment' as const,
  entityId: 'appointment-maya-1',
  occurredAt: new Date('2026-08-17T10:00:00.000Z'),
  source: 'yclients',
  dedupFingerprint: 'fingerprint-1',
  payload: { staff_id: 'staff-1' },
};

describe('приём факта', () => {
  it('новый факт сохраняется', async () => {
    const { service, tenantContext } = buildService();

    await expect(
      tenantContext.runAsSystemTenant('tenant-1', () =>
        service.append(appendInput),
      ),
    ).resolves.toEqual({ outcome: 'persisted', eventId: 'event-1' });
  });

  it('🔴 повторная доставка — исход `duplicate`, а не ошибка', async () => {
    // Повтор ожидаем: измерено до семи доставок одной пары за минуты. Если бы
    // здесь летело исключение, штатное поведение провайдера выглядело бы
    // аварией и заглушало бы настоящие сбои.
    //
    // Пустой результат — это ровно то, что возвращает `ON CONFLICT DO NOTHING`:
    // строки нет, ошибки нет. Прежний мок отклонял промис с `P2002`, и именно
    // поэтому дефект был невидим — у мока нет состояния aborted, которое в
    // живой базе и разворачивало весь проход.
    const appendMany: AppendMany = jest.fn().mockResolvedValue([]);
    const { service, tenantContext } = buildService({ appendMany });

    await expect(
      tenantContext.runAsSystemTenant('tenant-1', () =>
        service.append(appendInput),
      ),
    ).resolves.toEqual({ outcome: 'duplicate', eventId: null });
  });

  it('🔴 уникальность гасится в запросе, а не в `catch`', async () => {
    // Сторож против возврата к `domainEvent.create`: снаружи транзакции такой
    // код выглядит работающим, а внутри чужой транзакции роняет весь проход.
    const { service, tenantContext, appendMany } = buildService();

    await tenantContext.runAsSystemTenant('tenant-1', () =>
      service.append(appendInput),
    );

    // Без `skipDuplicates` вставка снова поднимет `P2002` внутри чужой
    // транзакции — ровно тот дефект. Цель конфликта задаёт схема
    // (`@@unique([tenantId, dedupFingerprint])`), а не этот вызов.
    expect(appendMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it('🔴 идентичность в событии — Maya, версия задана явно', async () => {
    const { service, tenantContext, appendMany } = buildService();

    await tenantContext.runAsSystemTenant('tenant-1', () =>
      service.append({ ...appendInput, sourceRef: '1911799161' }),
    );

    const written = appendMany.mock.calls[0][0].data[0];
    expect(written.entityId).toBe('appointment-maya-1');
    // Внешний идентификатор допустим ТОЛЬКО как провенанс.
    expect(written.sourceRef).toBe('1911799161');
    expect(written.version).toBe(1);
    expect(written.observation).toBe('after_watch_started');
  });

  it('чужой контекст арендатора отвергается', async () => {
    const { service, tenantContext } = buildService();

    await expect(
      tenantContext.runAsSystemTenant('tenant-other', () =>
        service.append(appendInput),
      ),
    ).rejects.toBeDefined();
  });

  it('иная ошибка базы не выдаётся за дубликат', async () => {
    const appendMany: AppendMany = jest
      .fn()
      .mockRejectedValue(new Error('connection lost'));
    const { service, tenantContext } = buildService({ appendMany });

    await expect(
      tenantContext.runAsSystemTenant('tenant-1', () =>
        service.append(appendInput),
      ),
    ).rejects.toThrow('connection lost');
  });
});

describe('карантин', () => {
  it('🔴 у карантина нет ни типа события, ни сущности', async () => {
    const { service, quarantineCreate } = buildService();

    await service.quarantine({
      source: 'yclients',
      fingerprint: 'unknown-1',
      reason: 'unknown_discriminator',
      discriminator: 'resource=client',
      diagnostic: { keys: ['resource', 'resource_id', 'status'] },
    });

    const written = quarantineCreate.mock.calls[0][0];
    // Прочитать карантин как факт невозможно по построению.
    expect(written.data).not.toHaveProperty('type');
    expect(written.data).not.toHaveProperty('entityId');
    expect(written.data.reason).toBe('unknown_discriminator');
  });

  it('срок хранения конечен и настраивается', () => {
    const { service } = buildService();
    expect(service.configuredQuarantineRetentionDays()).toBe(14);

    process.env.INGESTION_QUARANTINE_RETENTION_DAYS = '30';
    expect(service.configuredQuarantineRetentionDays()).toBe(30);

    // Бесконечного хранения диагностики не бывает: потолок жёсткий.
    process.env.INGESTION_QUARANTINE_RETENTION_DAYS = '3650';
    expect(service.configuredQuarantineRetentionDays()).toBe(90);
    delete process.env.INGESTION_QUARANTINE_RETENTION_DAYS;
  });

  it('повтор непонятой доставки не плодит строки', async () => {
    const quarantineCreate: Mock<(args: WriteArgs) => Promise<{ id: string }>> =
      jest.fn().mockRejectedValue(uniqueViolation());
    const { service } = buildService({ quarantineCreate });

    await expect(
      service.quarantine({
        source: 'yclients',
        fingerprint: 'unknown-1',
        reason: 'unknown_discriminator',
      }),
    ).resolves.toEqual({ id: null });
  });

  it('арендатор может быть не определён — это законная причина карантина', async () => {
    const { service, quarantineCreate } = buildService();

    await service.quarantine({
      source: 'yclients',
      fingerprint: 'no-tenant-1',
      reason: 'tenant_unresolved',
    });

    const written = quarantineCreate.mock.calls[0][0];
    expect(written.data.tenantId).toBeNull();
  });
});

describe('обработка', () => {
  it('🔴 провал обработки НЕ удаляет факт', async () => {
    const update: Mock<(args: WriteArgs) => Promise<{ attempts: number }>> =
      jest.fn().mockResolvedValue({ attempts: 1 });
    const { service } = buildService({ update });

    await expect(service.markFailed('event-1', 'boom')).resolves.toBe('failed');
    // Обе записи — обновления состояния обработки, не удаление строки.
    for (const call of update.mock.calls) {
      expect(call[0].data).toBeDefined();
    }
  });

  it('исчерпание попыток даёт видимый исход, а не вечный повтор', async () => {
    const update: Mock<(args: WriteArgs) => Promise<{ attempts: number }>> =
      jest.fn().mockResolvedValue({ attempts: 5 });
    const { service } = buildService({ update });

    await expect(service.markFailed('event-1', 'boom')).resolves.toBe('dead');
  });
});
