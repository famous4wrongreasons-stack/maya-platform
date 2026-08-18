import { Injectable, Logger } from '@nestjs/common';

import type { BusinessPeriod, PeriodRead } from '../domain';
import { collectPeriodRecords } from '../domain';
import { CRM_JOURNAL_MAX_WINDOW_MS } from '../crm/crm-provider-limits';
import { CrmService } from '../crm/crm.service';

/**
 * Запись журнала провайдера — форма выводится СТРУКТУРНО из границы CRM.
 *
 * 🔴 Импорта `crm-adapter.interface` здесь нет намеренно: барьер главы 2
 * (`domain/boundary.spec.ts`) считает импортёров контракта адаптера и разрешает
 * этому числу только уменьшаться. Вывод типа из сигнатуры сервиса даёт ту же
 * форму, не заводя новую зависимость от провайдерского контракта.
 */
type JournalRead = Awaited<ReturnType<CrmService['getJournal']>>;
export type ProviderJournalRecord = JournalRead['appointments'][number];

/** Чтение периода вместе с границей наблюдения. */
export interface AppointmentPeriodRead extends PeriodRead<ProviderJournalRecord> {
  /** До какого момента источник реально прочитан. */
  observedThrough: string;
}

/**
 * Единственный читатель записей за бизнес-период.
 *
 * 🔴 Зачем понадобился. Phase A нашла три независимых читателя журнала, и
 * фильтр по запрошенному окну был ровно у одного. Реестр 3.8 доказал, что
 * фильтр обязателен: провайдер возвращает записи вне окна. Ещё важнее —
 * признание источника в неполноте (`completeness`) не читал ни один из тех,
 * кто отвечает владельцу, и усечённая выборка выглядела полной.
 *
 * 🔴 Чего этот класс НЕ делает. Он не считает метрик, не знает ролей и не
 * решает, что показывать. Его единственная работа — отдать записи, которые
 * ДЕЙСТВИТЕЛЬНО принадлежат периоду, и честно сказать, полон ли ответ.
 */
@Injectable()
export class AppointmentPeriodReader {
  private readonly logger = new Logger(AppointmentPeriodReader.name);

  constructor(private readonly crmService: CrmService) {}

  async readProviderJournal(
    tenantId: string,
    period: BusinessPeriod,
    options?: { providerId?: string | null; now?: Date },
  ): Promise<AppointmentPeriodRead> {
    const now = options?.now ?? new Date();
    const from = new Date(period.from);
    const to = new Date(period.to);

    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from.getTime() >= to.getTime()
    ) {
      // Пустой период — это полный ответ на пустой вопрос, а не сбой.
      return {
        ...collectPeriodRecords<ProviderJournalRecord>([], period, SELECTORS),
        observedThrough: now.toISOString(),
      };
    }

    const ranges = this.chunk(from, to);
    const windows: Array<{
      items: ProviderJournalRecord[];
      completeness: JournalRead['completeness'];
      truncationReason?: string | null;
    }> = [];

    // Куски читаем волнами: длинная история не ждёт последовательных
    // round-trip, но и не превращается в неограниченный всплеск запросов.
    for (let index = 0; index < ranges.length; index += READ_WAVE) {
      const wave = await Promise.all(
        ranges.slice(index, index + READ_WAVE).map((range) =>
          this.crmService.getJournal(
            tenantId,
            {
              from: range.from,
              to: range.to,
              ...(options?.providerId
                ? { providerId: options.providerId }
                : {}),
            },
            // 🔴 Отменённые нужны. Без флага удалённая запись не доходит сюда
            // вовсе, счётчик отмен всегда ноль, и владельцу отвечали «отмен
            // нет» вместо «не вижу».
            { includeCanceled: true },
          ),
        ),
      );
      for (const journal of wave) {
        windows.push({
          items: journal.appointments,
          completeness: journal.completeness,
          truncationReason: journal.truncation_reason ?? null,
        });
      }
    }

    const read = collectPeriodRecords<ProviderJournalRecord>(
      windows,
      period,
      SELECTORS,
    );

    if (read.outOfPeriodDiscarded > 0) {
      // Ни одного поля записи — только счётчик. Персональных данных в журнал
      // не попадает, а факт изменения контракта провайдера остаётся видимым.
      this.logger.log(
        `provider returned ${read.outOfPeriodDiscarded} record(s) outside the requested period ` +
          `(${period.from}..${period.to}); they are not counted`,
      );
    }
    if (read.completeness === 'truncated') {
      this.logger.warn(
        `journal read for ${period.from}..${period.to} is truncated ` +
          `(${read.truncationReason}); absence conclusions are not allowed`,
      );
    }

    return { ...read, observedThrough: now.toISOString() };
  }

  /**
   * Разбить период на окна, которые провайдер согласен отдать.
   *
   * Ограничение принадлежит границе CRM и живёт там константой: литерал здесь
   * означал бы, что при смене лимита разойдутся два числа.
   */
  private chunk(from: Date, to: Date): Array<{ from: string; to: string }> {
    const ranges: Array<{ from: string; to: string }> = [];
    let cursor = from.getTime();
    while (cursor < to.getTime()) {
      const chunkTo = Math.min(
        cursor + CRM_JOURNAL_MAX_WINDOW_MS,
        to.getTime(),
      );
      ranges.push({
        from: new Date(cursor).toISOString(),
        to: new Date(chunkTo).toISOString(),
      });
      cursor = chunkTo;
    }
    return ranges;
  }
}

const READ_WAVE = 3;

const SELECTORS = {
  startAt: (item: ProviderJournalRecord) => new Date(item.start_at),
  key: (item: ProviderJournalRecord) => item.id,
};
