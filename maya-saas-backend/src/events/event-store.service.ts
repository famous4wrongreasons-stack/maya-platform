import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type {
  DomainEntityType,
  DomainEventType,
  IngestionMethod,
  IngestionOutcome,
  ObservationOrigin,
} from '../domain';
import { DOMAIN_EVENT_VERSION } from '../domain';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

/** Срок хранения карантина. Диагностика обязана истекать, история — нет. */
const DEFAULT_QUARANTINE_RETENTION_DAYS = 14;

/** Сколько раз пробуем обработать, прежде чем признать безнадёжным. */
const DEFAULT_MAX_ATTEMPTS = 5;

/** Аренда: сколько обработчик держит событие, пока не подтвердил исход. */
const DEFAULT_LEASE_MS = 60_000;

export interface AppendEventInput {
  tenantId: string;
  type: DomainEventType;
  entityType: DomainEntityType;
  /** Идентичность MAYA. Внешний идентификатор сюда не кладётся. */
  entityId: string;
  occurredAt: Date;
  source: string;
  /** Ссылка на сущность у источника — провенанс. */
  sourceRef?: string | null;
  ingestionMethod?: IngestionMethod;
  observation?: ObservationOrigin;
  /** Детерминированный отпечаток канонического состояния. */
  dedupFingerprint: string;
  /** Минимальный факт без ПД. */
  payload: Prisma.InputJsonValue;
  entitySequence?: number | null;
}

export interface AppendEventResult {
  outcome: IngestionOutcome;
  eventId: string | null;
}

export interface QuarantineInput {
  tenantId?: string | null;
  source: string;
  discriminator?: string | null;
  fingerprint: string;
  reason: string;
  diagnostic?: Prisma.InputJsonValue;
  retentionDays?: number;
}

/**
 * Хранилище доменных событий Maya.
 *
 * 🔴 Что здесь НЕ происходит. Ни уведомлений, ни записей в CRM, ни начислений,
 * ни кампаний. Приём отделён от последствий: событие означает «мы это заметили»,
 * а не «мы на это отреагировали». Действия — глава 6.
 *
 * 🔴 Дедупликация живёт в БАЗЕ, а не в памяти процесса. Множество в памяти
 * теряется при перезапуске, а провайдер повторяет доставки: измерено до семи
 * доставок одной и той же пары за минуты.
 */
@Injectable()
export class EventStoreService {
  private readonly logger = new Logger(EventStoreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * Принять факт.
   *
   * Возвращает исход, а не бросает на повторе: повторная доставка — штатное
   * поведение источника, а не ошибка. Смешать их значило бы завести тревогу на
   * том, что происходит каждый день.
   *
   * 🔴 `client` позволяет записать факт ВНУТРИ чужой транзакции. Это нужно
   * обнаружению изменений (B3.3): обновление зеркала и события о переходах
   * обязаны быть одним коммитом. Разрыв недопустим в обе стороны — обновить
   * зеркало без события значит потерять переход навсегда, записать событие без
   * зеркала значит выпустить его повторно на следующем проходе.
   */
  async append(
    input: AppendEventInput,
    client?: Prisma.TransactionClient,
  ): Promise<AppendEventResult> {
    const tenantId = this.tenantContext.assertTenantId(input.tenantId);
    const db = client ?? this.prisma;

    try {
      const event = await db.domainEvent.create({
        data: {
          tenantId,
          type: input.type,
          version: DOMAIN_EVENT_VERSION,
          entityType: input.entityType,
          entityId: input.entityId,
          entitySequence: input.entitySequence ?? null,
          occurredAt: input.occurredAt,
          source: input.source,
          sourceRef: input.sourceRef ?? null,
          ingestionMethod: input.ingestionMethod ?? 'webhook',
          observation: input.observation ?? 'after_watch_started',
          dedupFingerprint: input.dedupFingerprint,
          payload: input.payload,
        },
        select: { id: true },
      });
      return { outcome: 'persisted', eventId: event.id };
    } catch (error) {
      // 🔴 Уникальность в базе — единственный надёжный арбитр: два процесса,
      // принявшие одну доставку одновременно, договориться в памяти не могут.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { outcome: 'duplicate', eventId: null };
      }
      throw error;
    }
  }

  /**
   * Отложить непонятую доставку.
   *
   * Доменного события из неё НЕ возникает: у карантина нет ни типа, ни
   * сущности, и прочитать его как факт невозможно по построению.
   */
  async quarantine(input: QuarantineInput): Promise<{ id: string | null }> {
    const retentionDays =
      input.retentionDays ?? this.configuredQuarantineRetentionDays();
    const expiresAt = new Date(
      Date.now() + retentionDays * 24 * 60 * 60 * 1000,
    );

    try {
      const row = await this.prisma.ingestionQuarantine.create({
        data: {
          tenantId: input.tenantId ?? null,
          source: input.source,
          discriminator: input.discriminator ?? null,
          fingerprint: input.fingerprint,
          reason: input.reason,
          diagnostic: input.diagnostic,
          expiresAt,
        },
        select: { id: true },
      });
      return { id: row.id };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Повтор непонятой доставки — не новая строка: иначе один неизвестный
        // тип за неделю дал бы сотни одинаковых записей (221 доставка измерена).
        return { id: null };
      }
      throw error;
    }
  }

  /** Сколько дней держим карантин. Настраивается, но не бесконечно. */
  configuredQuarantineRetentionDays(): number {
    const raw = Number(process.env.INGESTION_QUARANTINE_RETENTION_DAYS);
    if (!Number.isFinite(raw) || raw <= 0) {
      return DEFAULT_QUARANTINE_RETENTION_DAYS;
    }
    return Math.min(Math.floor(raw), 90);
  }

  /**
   * Захватить события на обработку.
   *
   * 🔴 `FOR UPDATE SKIP LOCKED` плюс аренда: два обработчика не возьмут одно и
   * то же, а упавший не удержит событие навсегда — по истечении аренды оно
   * возвращается в очередь. Без аренды падение процесса означало бы вечно
   * «обрабатываемое» событие, которое никто не обрабатывает.
   */
  async claimBatch(
    limit = 20,
    leaseMs = DEFAULT_LEASE_MS,
  ): Promise<Array<{ id: string; tenantId: string; type: string }>> {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + leaseMs);

    return this.prisma.$transaction(async (tx) => {
      const candidates = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "DomainEvent"
        WHERE ("status" = 'pending' OR "status" = 'failed'
               OR ("status" = 'processing' AND "leaseUntil" < ${now}))
        ORDER BY "receivedAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `;
      if (candidates.length === 0) return [];

      const ids = candidates.map((row) => row.id);
      await tx.domainEvent.updateMany({
        where: { id: { in: ids } },
        data: { status: 'processing', leaseUntil },
      });

      return tx.domainEvent.findMany({
        where: { id: { in: ids } },
        select: { id: true, tenantId: true, type: true },
      });
    });
  }

  /** Обработка удалась. Факт и его обработка учитываются раздельно. */
  async markProcessed(eventId: string): Promise<void> {
    await this.prisma.domainEvent.update({
      where: { id: eventId },
      data: {
        status: 'processed',
        processedAt: new Date(),
        leaseUntil: null,
        lastError: null,
      },
    });
  }

  /**
   * Обработка не удалась.
   *
   * 🔴 Факт НЕ удаляется. Провал обработки — это состояние обработки, а не
   * отмена того, что событие произошло. Исчерпание попыток даёт `dead`:
   * видимый исход вместо тихого вечного повтора.
   */
  async markFailed(
    eventId: string,
    error: string,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
  ): Promise<'failed' | 'dead'> {
    const current = await this.prisma.domainEvent.update({
      where: { id: eventId },
      data: { attempts: { increment: 1 }, lastError: error.slice(0, 500) },
      select: { attempts: true },
    });

    const status = current.attempts >= maxAttempts ? 'dead' : 'failed';
    await this.prisma.domainEvent.update({
      where: { id: eventId },
      data: { status, leaseUntil: null },
    });

    if (status === 'dead') {
      this.logger.error(
        `domain event ${eventId} is dead after ${current.attempts} attempts: ${error.slice(0, 200)}`,
      );
    }
    return status;
  }
}
