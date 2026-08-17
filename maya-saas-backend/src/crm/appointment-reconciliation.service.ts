import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hostname } from 'node:os';

import { CRM_JOURNAL_MAX_WINDOW_DAYS } from './crm-provider-limits';
import { AppointmentChangeService } from './appointment-change.service';
import { AppointmentObservationService } from './appointment-observation.service';
import { CrmService } from './crm.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

/** Счётчики прохода. Ни одного поля с персональными данными. */
export interface ReconciliationCounts {
  windows: number;
  fetched: number;
  complete_windows: number;
  truncated_windows: number;
  created: number;
  updated: number;
  unchanged: number;
  events_emitted: number;
  duplicate_events: number;
  skipped: number;
}

export interface ReconciliationResult extends ReconciliationCounts {
  status: 'ran';
  run_id: string;
  from: string;
  to: string;
  /**
   * Полон ли проход ЦЕЛИКОМ. Только полный даёт право на выводы об отсутствии
   * и двигает базовую линию наблюдения.
   */
  completeness: 'complete' | 'truncated';
  truncation_reason?: string;
}

/**
 * Отказ по занятой аренде.
 *
 * 🔴 Это НЕ сбой. Занятая аренда означает, что работа уже идёт, и смешать её с
 * ошибкой значило бы поднимать тревогу на штатном поведении планировщика.
 */
export interface ReconciliationSkipped {
  status: 'already_running';
  tenantId: string;
  provider: string;
  held_by: string | null;
  lease_until: string | null;
}

export type ReconciliationOutcome =
  ReconciliationResult | ReconciliationSkipped;

/**
 * Срок аренды.
 *
 * 🔴 Равен потолку прохода: аренда не может пережить работу, ради которой
 * взята. Измеренная длительность прохода — 1,3–1,8 с, то есть запас двухсотый;
 * пять минут покрывают зависший запрос к провайдеру, а не нормальную работу.
 */
export const RECONCILIATION_LEASE_MS = 5 * 60 * 1000;

/**
 * Сверка зеркала визитов с источником (Cycle 03 B3.3).
 *
 * 🔴 Сверка — не запасной путь на случай пропущенного вебхука, а ОСНОВНОЙ
 * способ поддерживать зеркало. Вебхук лишь ускоряет реакцию: провайдер не
 * гарантирует доставку, не подписывает её и не даёт идентификатора события,
 * поэтому система, полагающаяся только на него, расходится с источником молча.
 *
 * 🔴 Компаратор и применение — те же, что у вебхука. Здесь только чтение окна и
 * учёт прохода: если бы сверка сравнивала по-своему, «одно и то же состояние»
 * означало бы у двух путей разное.
 *
 * 🔴 Планировщика здесь нет. Запуск — ручной, пока владелец не увидит поведение
 * на управляемых прогонах.
 */
@Injectable()
export class AppointmentReconciliationService {
  private readonly logger = new Logger(AppointmentReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly crmService: CrmService,
    private readonly observationService: AppointmentObservationService,
    private readonly changeService: AppointmentChangeService,
  ) {}

  /**
   * Один проход по окну.
   *
   * Окно режется по правилу провайдера: полнота каждого куска оценивается
   * отдельно, и один неполный кусок не отменяет остальные.
   *
   * 🔴 Аренда обязательна и одна на всех: и планировщик, и ручной запуск идут
   * этим путём. Обходного пути «мимо аренды» нет намеренно — иначе ручной
   * прогон во время планового делал бы ровно то, ради предотвращения чего
   * аренда и заведена.
   */
  async run(params: {
    tenantId: string;
    from: Date;
    to: Date;
    /** Кто просит. Провенанс для разбора: `scheduler:near`, `manual`, … */
    holder?: string;
  }): Promise<ReconciliationOutcome> {
    const tenantId = this.tenantContext.assertTenantId(params.tenantId);
    const provider = await this.providerOf(tenantId);
    const holderId = this.holderId(params.holder);

    const lease = await this.acquireLease({
      tenantId,
      provider,
      holderId,
      windowFrom: params.from,
      windowTo: params.to,
    });

    if (lease === 'already_running') {
      /**
       * 🔴 Честный отказ, а не второй процесс.
       *
       * Занятая аренда — это НЕ ошибка: она означает, что работа уже идёт.
       * Отличать её от сбоя обязательно, иначе наблюдаемость превратится в
       * шум: планировщик, споткнувшийся о собственный предыдущий тик, поднял
       * бы тревогу на штатном поведении.
       */
      const held = await this.prisma.reconciliationRun.findFirst({
        where: { tenantId, provider, finishedAt: null, failureCode: null },
        orderBy: { startedAt: 'desc' },
        select: { id: true, leaseUntil: true, holderId: true, startedAt: true },
      });
      this.logger.log(
        `reconciliation skipped for ${provider}: lease held by ` +
          `${held?.holderId ?? 'unknown'} until ${held?.leaseUntil?.toISOString() ?? '—'}`,
      );
      return {
        status: 'already_running',
        tenantId,
        provider,
        held_by: held?.holderId ?? null,
        lease_until: held?.leaseUntil?.toISOString() ?? null,
      };
    }

    const run = { id: lease.runId };

    const counts: ReconciliationCounts = {
      windows: 0,
      fetched: 0,
      complete_windows: 0,
      truncated_windows: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      events_emitted: 0,
      duplicate_events: 0,
      skipped: 0,
    };

    const baselineEstablished =
      await this.observationService.baselineEstablished(tenantId);
    let truncationReason: string | undefined;

    try {
      const windowMs = CRM_JOURNAL_MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000;

      for (
        let cursor = params.from.getTime();
        cursor < params.to.getTime();
        cursor += windowMs
      ) {
        const windowFrom = new Date(cursor);
        const windowTo = new Date(
          Math.min(cursor + windowMs, params.to.getTime()),
        );
        counts.windows += 1;

        const journal = await this.crmService.getJournal(
          tenantId,
          { from: windowFrom.toISOString(), to: windowTo.toISOString() },
          // Отменённые нужны: без них отмена выглядела бы исчезновением, а по
          // исчезновению выводы делать запрещено.
          { includeCanceled: true },
        );

        if (journal.completeness === 'complete') {
          counts.complete_windows += 1;
        } else {
          counts.truncated_windows += 1;
          truncationReason = journal.truncation_reason ?? 'unknown';
          this.logger.warn(
            `reconciliation window ${windowFrom.toISOString()}..${windowTo.toISOString()} ` +
              `is ${journal.completeness} (${truncationReason}); ` +
              'nothing is declared missing from it',
          );
        }

        for (const appointment of journal.appointments) {
          counts.fetched += 1;
          await this.applyOne({
            tenantId,
            provider,
            appointment,
            baselineEstablished,
            counts,
          });
        }
      }

      const completeness =
        counts.truncated_windows === 0 ? 'complete' : 'truncated';

      await this.prisma.reconciliationRun.update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          completeness,
          truncationReason: truncationReason ?? null,
          fetched: counts.fetched,
          created: counts.created,
          updated: counts.updated,
          unchanged: counts.unchanged,
          eventsEmitted: counts.events_emitted,
          // Аренда отпущена вместе с завершением: строка вышла из частичного
          // уникального индекса, место для следующего прогона свободно.
          leaseUntil: null,
        },
      });

      return {
        ...counts,
        status: 'ran',
        run_id: run.id,
        from: params.from.toISOString(),
        to: params.to.toISOString(),
        completeness,
        truncation_reason: truncationReason,
      };
    } catch (error) {
      /**
       * 🔴 Упавший проход НЕ завершается: `finishedAt` и `completeness`
       * остаются пустыми. Это делает его неотличимым от «ещё идёт» и,
       * главное, отличимым от полного — выводов по нему сделать нельзя ни
       * случайно, ни намеренно.
       */
      await this.prisma.reconciliationRun.update({
        where: { id: run.id },
        data: {
          failureCode: 'reconciliation_failed',
          failureMessage: String(
            error instanceof Error ? error.message : error,
          ).slice(0, 500),
          // Аренда отпускается и при провале: сбой не должен блокировать
          // следующую попытку до истечения срока.
          leaseUntil: null,
        },
      });
      throw error;
    }
  }

  /**
   * Захват аренды.
   *
   * 🔴 Два шага, и намеренно БЕЗ общей транзакции.
   *
   * Первый шаг закрывает брошенную аренду; второй — единственный арбитр. Если
   * бы они шли одной интерактивной транзакцией, нарушение уникальности во
   * втором шаге прервало бы транзакцию целиком, и вернуть из неё «занято»
   * штатным исходом было бы уже нельзя: PostgreSQL не даёт продолжить
   * прерванную транзакцию.
   *
   * Разделение безопасно: первый шаг трогает ТОЛЬКО просроченные аренды, а
   * атомарность самого захвата обеспечивает частичный уникальный индекс.
   */
  private async acquireLease(input: {
    tenantId: string;
    provider: string;
    holderId: string;
    windowFrom: Date;
    windowTo: Date;
  }): Promise<{ runId: string } | 'already_running'> {
    const now = new Date();

    /**
     * 🔴 Брошенный прогон закрывается как УПАВШИЙ, а не переиспользуется.
     *
     * Переиспользование строки стёрло бы след падения, а именно он отвечает на
     * вопрос «как давно мы на самом деле не знаем, что происходит». Строка
     * остаётся с кодом сбоя и без отметки завершения — то есть честно говорит
     * «начался и не закончился», — и одновременно выходит из частичного
     * индекса, освобождая место. Ручной разблокировки не требуется.
     */
    const reclaimed = await this.prisma.reconciliationRun.updateMany({
      where: {
        tenantId: input.tenantId,
        provider: input.provider,
        finishedAt: null,
        failureCode: null,
        leaseUntil: { lt: now },
      },
      data: {
        failureCode: 'lease_expired',
        failureMessage:
          'аренда истекла: процесс не завершил проход и не продлил её',
      },
    });

    if (reclaimed.count > 0) {
      this.logger.warn(
        `reclaimed ${reclaimed.count} abandoned reconciliation run(s) ` +
          `for ${input.provider}: lease had expired`,
      );
    }

    try {
      const run = await this.prisma.reconciliationRun.create({
        data: {
          tenantId: input.tenantId,
          provider: input.provider,
          windowFrom: input.windowFrom,
          windowTo: input.windowTo,
          leaseUntil: new Date(now.getTime() + RECONCILIATION_LEASE_MS),
          holderId: input.holderId,
        },
        select: { id: true },
      });
      return { runId: run.id };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return 'already_running';
      }
      throw error;
    }
  }

  /**
   * Кто держит аренду.
   *
   * Провенанс для разбора, не идентичность: узел, процесс и роль запуска. Ни
   * одного персонального поля.
   */
  private holderId(role: string | undefined): string {
    return [role || 'manual', hostname(), String(process.pid)].join(':');
  }

  /**
   * Последний ПОЛНЫЙ завершённый проход.
   *
   * 🔴 Отдельного курсора нет намеренно: он был бы вторым источником правды о
   * том же самом. Здесь же видно, почему его нельзя перепутать с усечённым или
   * упавшим: усечённый отсеивается значением полноты, упавший — отсутствием
   * `finishedAt`.
   */
  async lastCompleteRun(tenantId: string): Promise<{
    id: string;
    windowFrom: Date;
    windowTo: Date;
    finishedAt: Date | null;
  } | null> {
    return this.prisma.reconciliationRun.findFirst({
      where: {
        tenantId,
        completeness: 'complete',
        finishedAt: { not: null },
        failureCode: null,
      },
      orderBy: { finishedAt: 'desc' },
      select: { id: true, windowFrom: true, windowTo: true, finishedAt: true },
    });
  }

  private async applyOne(input: {
    tenantId: string;
    provider: string;
    appointment: Parameters<
      AppointmentObservationService['fromSourceShape']
    >[2];
    baselineEstablished: boolean;
    counts: ReconciliationCounts;
  }): Promise<void> {
    const observed = await this.observationService.fromSourceShape(
      input.tenantId,
      input.provider,
      input.appointment,
    );

    if (!observed) {
      input.counts.skipped += 1;
      return;
    }

    const applied = await this.changeService.applyObservation({
      tenantId: input.tenantId,
      provider: input.provider,
      observed,
      ingestionMethod: 'reconciliation',
      baselineEstablished: input.baselineEstablished,
      observedAt: new Date(),
    });

    if (applied.outcome === 'created') input.counts.created += 1;
    else if (applied.outcome === 'updated') input.counts.updated += 1;
    else input.counts.unchanged += 1;

    input.counts.events_emitted += applied.eventsEmitted;
    input.counts.duplicate_events += applied.duplicateEvents;
  }

  private async providerOf(tenantId: string): Promise<string> {
    const integration = await this.prisma.crmIntegration.findUnique({
      where: { tenantId },
      select: { provider: true },
    });
    if (!integration) {
      throw new Error(`tenant ${tenantId} has no CRM integration`);
    }
    return integration.provider;
  }
}
