import { Injectable, Logger } from '@nestjs/common';

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
   */
  async run(params: {
    tenantId: string;
    from: Date;
    to: Date;
  }): Promise<ReconciliationResult> {
    const tenantId = this.tenantContext.assertTenantId(params.tenantId);
    const provider = await this.providerOf(tenantId);

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

    const run = await this.prisma.reconciliationRun.create({
      data: {
        tenantId,
        provider,
        windowFrom: params.from,
        windowTo: params.to,
      },
      select: { id: true },
    });

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
        },
      });

      return {
        ...counts,
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
        },
      });
      throw error;
    }
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
