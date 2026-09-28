/**
 * 🔴 Регрессия на дефект, сломавший сверку записей с 2026-09-20 по 2026-09-28.
 *
 * Что произошло в бою. `EventStoreService.append` ловил `P2002` и возвращал
 * `duplicate`. Снаружи транзакции это верно, внутри — нет: PostgreSQL к моменту
 * возврата ошибки уже перевёл транзакцию в состояние aborted, и следующий же
 * оператор падал с `25P02 current transaction is aborted`. Один штатный повтор
 * ронял весь проход сверки; откат отменял и обновление зеркала, поэтому
 * следующий проход находил тот же переход и падал снова. 154 прохода подряд,
 * 48 в сутки на ближнем контуре.
 *
 * 🔴 Почему по ЖИВОЙ базе, а не по моку. Прежний модульный тест отклонял промис
 * `create` синтетическим `P2002` — и проходил. У мока нет состояния aborted,
 * поэтому дефект был невидим ПО ПОСТРОЕНИЮ. Единственный способ доказать
 * «транзакция осталась пригодной» — настоящая транзакция настоящего PostgreSQL.
 *
 * Граница утверждения, честно. Здесь доказан инвариант УРОВНЯ ПРИЁМА: повтор не
 * отравляет транзакцию вызывающего. Сам `AppointmentReconciliationService` тут
 * не исполняется — он поднимает половину графа модулей и провайдерский адаптер.
 * «Сверка продолжается» следует из этого инварианта плюс боевых измерений, а не
 * из прогонки самой сверки; на её уровне цикл переходов по-прежнему покрыт
 * моком (`appointment-change.service.spec.ts`).
 *
 * Контроль от пустоты идёт последним: он воспроизводит прежнюю реализацию на
 * том же сценарии и требует, чтобы она упала. Без него «зелено» ничего не
 * значило бы — сценарий мог просто не задевать дефект.
 */

import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { DOMAIN_EVENT_TYPE, DOMAIN_EVENT_VERSION } from '../../src/domain';
import { EventStoreService } from '../../src/events/event-store.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TenantContextService } from '../../src/tenancy/tenant-context.service';
import { assertEventsProofDatabase } from './support/proof-db-guard';

describe('приём факта внутри чужой транзакции (живой PostgreSQL)', () => {
  let prisma: PrismaService;
  let store: EventStoreService;
  let tenantContext: TenantContextService;
  let tenantId: string;
  let appointmentId: string;

  /** Прогон помечается, чтобы параллельные запуски не видели чужих строк. */
  const run = randomUUID().slice(0, 8);
  /** Отпечаток канонического состояния — детерминированный, без времени. */
  const fingerprint = (suffix: string) => `regression-${run}-${suffix}`;

  const occurredAt = new Date('2026-09-28T17:54:46.000Z');
  const appendInput = (suffix: string) => ({
    tenantId,
    type: DOMAIN_EVENT_TYPE.appointmentCreated,
    entityType: 'appointment' as const,
    entityId: appointmentId,
    entitySequence: 7,
    occurredAt,
    source: 'yclients',
    sourceRef: '1911799161',
    ingestionMethod: 'reconciliation' as const,
    observation: 'observed_existing' as const,
    dedupFingerprint: fingerprint(suffix),
    payload: { staff_id: 'staff-1' } as Prisma.InputJsonValue,
  });

  beforeAll(async () => {
    assertEventsProofDatabase();
    // Тот же клиент, что и в бою: соединение через адаптер `PrismaPg`, а не
    // голый `PrismaClient` — иначе проверялся бы не тот путь.
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();

    tenantContext = new TenantContextService();
    store = new EventStoreService(prisma, tenantContext);

    const tenant = await prisma.tenant.create({
      data: { name: `evt-regression-${run}`, slug: `evt-regression-${run}` },
      select: { id: true },
    });
    tenantId = tenant.id;

    const startAt = new Date('2026-10-02T09:00:00.000Z');
    const endAt = new Date('2026-10-02T10:00:00.000Z');
    const appointment = await prisma.appointment.create({
      data: {
        tenantId,
        staffExternalId: 'staff-1',
        serviceIds: [1] as Prisma.InputJsonValue,
        startAt,
        endAt,
        blockedStartAt: startAt,
        blockedEndAt: endAt,
        status: 'confirmed',
      },
      select: { id: true },
    });
    appointmentId = appointment.id;

    // Первое событие принято и ЗАКОММИЧЕНО здесь, а не внутри теста: каждый
    // тест ниже обязан работать в одиночку, под `-t`, под `--shard` и в любом
    // порядке. Зависимость теста от состояния соседа — ложные красные.
    await expect(
      tenantContext.runAsSystemTenant(tenantId, () =>
        store.append(appendInput('first')),
      ),
    ).resolves.toMatchObject({ outcome: 'persisted' });
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
      // Каскад по арендатору убирает и зеркало, и события этого прогона.
      if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } });
      await prisma.$disconnect();
    }
  }, 60_000);

  it('🔴 повтор не отравляет транзакцию: следующее событие пишется, зеркало коммитится', async () => {
    const applied = await tenantContext.runAsSystemTenant(tenantId, () =>
      prisma.$transaction(async (tx) => {
        // 1. Повтор внутри транзакции — штатный исход, не ошибка.
        const duplicate = await store.append(appendInput('first'), tx);

        // 2. 🔴 Здесь прежняя реализация умирала: `25P02` на СЛЕДУЮЩЕМ операторе.
        const second = await store.append(appendInput('second'), tx);

        // 3. И здесь — обновление зеркала, которое обязано коммититься вместе
        //    с событиями. В бою откат отменял именно его, из-за чего следующий
        //    проход заново находил тот же переход и падал снова.
        const mirror = await tx.appointment.update({
          where: { id: appointmentId },
          data: { status: 'arrived' },
          select: { status: true },
        });

        return { duplicate, second, mirror };
      }),
    );

    expect(applied.duplicate).toEqual({ outcome: 'duplicate', eventId: null });
    expect(applied.second.outcome).toBe('persisted');
    expect(applied.second.eventId).toEqual(expect.any(String));
    expect(applied.mirror.status).toBe('arrived');

    // Транзакция закоммитилась целиком — проверяем ПОСЛЕ неё, из базы.
    await expect(
      prisma.domainEvent.count({
        where: { tenantId, dedupFingerprint: fingerprint('first') },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.domainEvent.count({
        where: { tenantId, dedupFingerprint: fingerprint('second') },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: 'arrived' });
  }, 60_000);

  it('🔴 записанная строка совпадает со входом поле в поле', async () => {
    // Приём стал позиционным `INSERT`, и компилятор больше не сопоставляет
    // колонку со значением: перестановка двух соседних TEXT-колонок —
    // `source` и `ingestionMethod` — прошла бы и типы, и линтер, и все моки.
    // Ловит её только сверка всей записанной строки со входом.
    const input = appendInput('first');
    const row = await prisma.domainEvent.findFirstOrThrow({
      where: { tenantId, dedupFingerprint: fingerprint('first') },
    });

    expect(row.tenantId).toBe(tenantId);
    expect(row.type).toBe(input.type);
    expect(row.entityType).toBe(input.entityType);
    expect(row.entityId).toBe(input.entityId);
    expect(row.entitySequence).toBe(input.entitySequence);
    expect(row.occurredAt.toISOString()).toBe(occurredAt.toISOString());
    expect(row.source).toBe(input.source);
    expect(row.sourceRef).toBe(input.sourceRef);
    expect(row.ingestionMethod).toBe(input.ingestionMethod);
    expect(row.observation).toBe(input.observation);
    expect(row.dedupFingerprint).toBe(input.dedupFingerprint);
    expect(row.payload).toEqual(input.payload);

    // Колонки, которые запрос теперь проставляет сам. Значения те же, что
    // посылал Prisma: в боевом логе его `INSERT` нёс ровно эти 17 колонок,
    // включая `receivedAt`, `status` и `attempts`.
    expect(row.version).toBe(DOMAIN_EVENT_VERSION);
    expect(row.status).toBe('pending');
    expect(row.attempts).toBe(0);
    expect(row.receivedAt.getTime()).toBeGreaterThan(0);
    expect(row.processedAt).toBeNull();
    expect(row.leaseUntil).toBeNull();
    expect(row.lastError).toBeNull();
    // 🔴 Идентификатор обязан остаться cuid, а не стать случайным UUID.
    // `DomainEvent` читается постранично с `orderBy: { id: 'asc' }` в четырёх
    // местах, и cuid монотонен по времени: случайный идентификатор переставлял
    // бы события одной транзакции и позволял бы вставке уйти до курсора.
    expect(row.id).toMatch(/^c[a-z0-9]{10,}$/);
  }, 60_000);

  it('🔴 повтор не плодит строк', async () => {
    // Ещё один повтор того же отпечатка, теперь вне транзакции: исход тот же,
    // строка по-прежнему одна.
    await expect(
      tenantContext.runAsSystemTenant(tenantId, () =>
        store.append(appendInput('first')),
      ),
    ).resolves.toEqual({ outcome: 'duplicate', eventId: null });

    await expect(
      prisma.domainEvent.count({
        where: { tenantId, dedupFingerprint: fingerprint('first') },
      }),
    ).resolves.toBe(1);
  }, 60_000);

  it('контроль: прежняя реализация на этом же сценарии разворачивает транзакцию', async () => {
    // Без этого контроля зелёный результат выше ничего не доказывал бы: сценарий
    // мог просто не задевать дефект. Здесь дословно воспроизведён прежний код —
    // `create`, `catch (P2002) -> duplicate`, и продолжение работы.
    const control = fingerprint('control');
    const oldImplementation = prisma.$transaction(async (tx) => {
      try {
        await tx.domainEvent.create({
          data: {
            tenantId,
            type: DOMAIN_EVENT_TYPE.appointmentCreated,
            version: DOMAIN_EVENT_VERSION,
            entityType: 'appointment',
            entityId: appointmentId,
            occurredAt,
            source: 'yclients',
            dedupFingerprint: fingerprint('first'),
            payload: { staff_id: 'staff-1' },
          },
          select: { id: true },
        });
      } catch (error) {
        if (!(
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ))
          throw error;
        // Прежний `append` возвращал отсюда `duplicate`, и вызывающий
        // продолжал цикл переходов — вот это продолжение:
      }

      return tx.domainEvent.create({
        data: {
          tenantId,
          type: DOMAIN_EVENT_TYPE.appointmentCreated,
          version: DOMAIN_EVENT_VERSION,
          entityType: 'appointment',
          entityId: appointmentId,
          occurredAt,
          source: 'yclients',
          dedupFingerprint: control,
          payload: { staff_id: 'staff-1' },
        },
        select: { id: true },
      });
    });

    await expect(oldImplementation).rejects.toThrow(
      /current transaction is aborted|25P02/i,
    );

    // И откат унёс бы вместе с собой всё остальное: второй записи нет.
    await expect(
      prisma.domainEvent.count({
        where: { tenantId, dedupFingerprint: control },
      }),
    ).resolves.toBe(0);
  }, 60_000);
});
