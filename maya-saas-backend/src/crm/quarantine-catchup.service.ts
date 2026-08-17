import { Injectable, Logger } from '@nestjs/common';

import { AppointmentChangeService } from './appointment-change.service';
import { AppointmentObservationService } from './appointment-observation.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

/**
 * Причины карантина, которые ИМЕЕТ СМЫСЛ перечитывать.
 *
 * 🔴 `unknown_discriminator` сюда не входит. У таких доставок нет канонического
 * имени, и придумать его перечитыванием невозможно: кассовые операции
 * (`finances_operation/*`) — предмет отдельного разбора главы 4, а не догона.
 * Перечитать можно то, что мы понимаем, но чего у нас тогда не было.
 */
const RETRYABLE_REASONS = ['entity_unresolved', 'source_unreadable'] as const;

/** Исход перечитывания одной строки карантина. */
export type CatchupResolution =
  /** Запись нашлась и совпала с зеркалом — событий нет. */
  | 'explained_no_change'
  /** Запись нашлась, состояние изменилось — выпущены канонические события. */
  | 'explained_changed'
  /** Запись впервые появилась в зеркале этим догоном. */
  | 'explained_created'
  /** Источник по-прежнему не отвечает — строка остаётся открытой. */
  | 'still_unresolved';

export interface CatchupCounts {
  considered: number;
  explained_no_change: number;
  explained_changed: number;
  explained_created: number;
  still_unresolved: number;
  events_emitted: number;
}

export interface CatchupResult extends CatchupCounts {
  tenantId: string;
  provider: string;
}

/**
 * Адресный догон по карантину (Cycle 03 B3.4).
 *
 * 🔴 Зачем он нужен. В карантине лежат доставки, которые Maya поняла, но не
 * смогла применить: чаще всего — потому что записи ещё не было в зеркале. Это
 * след эпохи до наполнения. Регулярная сверка их не подберёт: она смотрит окно
 * по времени, а эти записи могут быть где угодно.
 *
 * 🔴 Чего он НЕ делает — по прямому указанию владельца.
 *
 * 1. **Не выпускает исторических `appointment.created`** только потому, что
 *    сущность теперь разрешается. Запись, существовавшая до базовой линии, не
 *    становится созданной сегодня оттого, что мы наконец её разглядели.
 * 2. **Не заводит второго правила сравнения.** Перечитанное состояние идёт
 *    через ТОТ ЖЕ компаратор, что вебхук и сверка.
 * 3. **Не удаляет строки карантина молча.** Исход записывается в `resolution`:
 *    диагностика обязана сохранять след того, чем всё кончилось.
 */
@Injectable()
export class QuarantineCatchupService {
  private readonly logger = new Logger(QuarantineCatchupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly observationService: AppointmentObservationService,
    private readonly changeService: AppointmentChangeService,
  ) {}

  async run(params: {
    tenantId: string;
    provider: string;
    limit?: number;
  }): Promise<CatchupResult> {
    const tenantId = this.tenantContext.assertTenantId(params.tenantId);
    const counts: CatchupCounts = {
      considered: 0,
      explained_no_change: 0,
      explained_changed: 0,
      explained_created: 0,
      still_unresolved: 0,
      events_emitted: 0,
    };

    const rows = await this.prisma.ingestionQuarantine.findMany({
      where: {
        tenantId,
        source: params.provider,
        resolution: 'open',
        reason: { in: [...RETRYABLE_REASONS] },
      },
      orderBy: { receivedAt: 'asc' },
      take: params.limit ?? 100,
      select: { id: true, diagnostic: true, fingerprint: true },
    });

    const baselineEstablished =
      await this.observationService.baselineEstablished(tenantId);

    for (const row of rows) {
      const externalId = this.externalIdOf(row);
      if (!externalId) {
        // Идентификатора записи в диагностике нет — перечитывать нечего.
        counts.considered += 1;
        counts.still_unresolved += 1;
        continue;
      }

      counts.considered += 1;

      const observed = await this.observationService.observe({
        tenantId,
        provider: params.provider,
        externalId,
        // Догон НИКОГДА не заключает удаление: доставка старая, а отсутствие
        // записи сейчас может значить что угодно. Снятие доказывает только
        // свежий признак у самой записи.
        expectRemoved: false,
      });

      if (observed === 'unreadable') {
        counts.still_unresolved += 1;
        await this.resolve(row.id, 'still_unresolved');
        continue;
      }

      const applied = await this.changeService.applyObservation({
        tenantId,
        provider: params.provider,
        observed,
        ingestionMethod: 'reconciliation',
        /**
         * 🔴 Базовая линия учитывается как обычно, но для догона это почти
         * всегда означает: строка появится в зеркале БЕЗ события создания,
         * если её там не было до базовой линии. А если запись возникла после
         * неё, `created` законен — это действительно новая запись, просто
         * доставку о ней мы когда-то не смогли применить.
         */
        baselineEstablished,
        observedAt: new Date(),
      });

      counts.events_emitted += applied.eventsEmitted;

      const resolution: CatchupResolution =
        applied.outcome === 'created'
          ? 'explained_created'
          : applied.transitions.length > 0
            ? 'explained_changed'
            : 'explained_no_change';

      counts[resolution] += 1;
      await this.resolve(row.id, resolution);
    }

    this.logger.log(
      `quarantine catch-up for ${params.provider}: ` +
        `considered=${counts.considered} explained=${
          counts.explained_no_change +
          counts.explained_changed +
          counts.explained_created
        } still_unresolved=${counts.still_unresolved} events=${counts.events_emitted}`,
    );

    return { ...counts, tenantId, provider: params.provider };
  }

  /**
   * Записать исход.
   *
   * 🔴 Строка НЕ удаляется. Словарь поля — `open | explained | discarded`;
   * подробность исхода уходит в диагностику рядом с уже собранными именами
   * ключей. Персональных данных здесь не появляется: только имя исхода.
   */
  private async resolve(
    id: string,
    resolution: CatchupResolution,
  ): Promise<void> {
    const row = await this.prisma.ingestionQuarantine.findUnique({
      where: { id },
      select: { diagnostic: true },
    });

    const diagnostic =
      row?.diagnostic && typeof row.diagnostic === 'object'
        ? (row.diagnostic as Record<string, unknown>)
        : {};

    await this.prisma.ingestionQuarantine.update({
      where: { id },
      data: {
        resolution: resolution === 'still_unresolved' ? 'open' : 'explained',
        diagnostic: {
          ...diagnostic,
          catchup_outcome: resolution,
          catchup_at: new Date().toISOString(),
        },
      },
    });
  }

  /** Внешний идентификатор записи из диагностики карантина. */
  private externalIdOf(row: { diagnostic: unknown }): string | null {
    if (!row.diagnostic || typeof row.diagnostic !== 'object') return null;
    const value = (row.diagnostic as Record<string, unknown>).external_id;
    const externalId = typeof value === 'string' ? value.trim() : '';
    return externalId || null;
  }
}
