import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppointmentReconciliationService } from './appointment-reconciliation.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

/** Ближний контур: где происходит то, что происходит сейчас. */
const NEAR_TERM_INTERVAL_MS = 30 * 60 * 1000;
const NEAR_TERM_DAYS_BACK = 7;
const NEAR_TERM_DAYS_FORWARD = 7;

/** Средний контур: догон того, что ближний не покрывает. */
const MEDIUM_TERM_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MEDIUM_TERM_DAYS_BACK = 31;
const MEDIUM_TERM_DAYS_FORWARD = 31;

/**
 * Первый тик не сразу после старта: приложение поднимается, и подсовывать ему
 * работу в момент запуска незачем. Заодно разводит выкат и первый проход.
 */
const FIRST_RUN_DELAY_MS = 2 * 60 * 1000;

/** Разные контуры не стартуют в один момент. */
const MEDIUM_TERM_DELAY_MS = 5 * 60 * 1000;

type Contour = 'near' | 'medium';

/**
 * Регулярная сверка зеркала визитов (Cycle 03 B3.4).
 *
 * 🔴 Планировщик — это ТОЛЬКО повод запустить то, что уже доказано в B3.3.
 * Ни одного побочного действия он не добавляет: ни уведомлений, ни записей в
 * CRM, ни интерпретаций. Весь его вклад — вопрос «не пора ли посмотреть».
 *
 * 🔴 Своей защиты от параллельного запуска у него НЕТ и быть не должно.
 * Процессная переменная не спасает уже сегодня: ручной запуск сверки — другой
 * процесс, а во время выката старый процесс дорабатывает проход, пока новый
 * уже стартовал. Единственный арбитр — аренда в базе, и берёт её сам сервис
 * сверки. Планировщик о ней даже не знает: занято — сервис честно скажет.
 */
@Injectable()
export class AppointmentReconciliationScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AppointmentReconciliationScheduler.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly reconciliation: AppointmentReconciliationService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      this.logger.log('Appointment reconciliation scheduler is disabled.');
      return;
    }

    this.schedule('near', FIRST_RUN_DELAY_MS, NEAR_TERM_INTERVAL_MS);
    this.schedule(
      'medium',
      FIRST_RUN_DELAY_MS + MEDIUM_TERM_DELAY_MS,
      MEDIUM_TERM_INTERVAL_MS,
    );

    this.logger.log(
      'Appointment reconciliation scheduler started: ' +
        `near ±${NEAR_TERM_DAYS_BACK}d every ${NEAR_TERM_INTERVAL_MS / 60_000} min, ` +
        `medium ±${MEDIUM_TERM_DAYS_BACK}d every ${MEDIUM_TERM_INTERVAL_MS / 3_600_000} h.`,
    );
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
  }

  private schedule(
    contour: Contour,
    delayMs: number,
    intervalMs: number,
  ): void {
    const first = setTimeout(() => void this.tick(contour), delayMs);
    first.unref?.();
    const repeat = setInterval(() => void this.tick(contour), intervalMs);
    repeat.unref?.();
    this.timers.push(first, repeat);
  }

  /**
   * Один тик контура.
   *
   * 🔴 Идём по АКТИВНЫМ интеграциям CRM, а не по списку арендаторов. Арендатор
   * без CRM (`maya-os`) не попадает сюда вовсе: у него нечего сверять, и
   * заводить ему пустой прогон значило бы врать наблюдаемости — «сверка не
   * прошла» выглядело бы там, где сверять нечего.
   */
  async tick(contour: Contour): Promise<void> {
    const integrations = await this.prisma.crmIntegration.findMany({
      where: { status: 'active' },
      select: { tenantId: true, provider: true },
    });

    if (integrations.length === 0) {
      this.logger.debug(
        `reconciliation ${contour}: no active CRM integrations`,
      );
      return;
    }

    const daysBack =
      contour === 'near' ? NEAR_TERM_DAYS_BACK : MEDIUM_TERM_DAYS_BACK;
    const daysForward =
      contour === 'near' ? NEAR_TERM_DAYS_FORWARD : MEDIUM_TERM_DAYS_FORWARD;

    for (const integration of integrations) {
      /**
       * 🔴 Сбой одного арендатора НЕ трогает остальных.
       *
       * Провайдер, отвечающий отказом одному салону, не имеет отношения к
       * другому. Общий `try` вокруг цикла остановил бы сверку у всех из-за
       * чужой проблемы — поэтому он вокруг КАЖДОГО.
       */
      try {
        const now = Date.now();
        const outcome = await this.tenantContext.runAsSystemTenant(
          integration.tenantId,
          () =>
            this.reconciliation.run({
              tenantId: integration.tenantId,
              from: new Date(now - daysBack * 24 * 60 * 60 * 1000),
              to: new Date(now + daysForward * 24 * 60 * 60 * 1000),
              holder: `scheduler:${contour}`,
            }),
        );

        if (outcome.status === 'already_running') {
          // Не тревога: работа уже идёт. Тревогой было бы обратное — два
          // прохода по одному арендатору одновременно.
          this.logger.log(
            `reconciliation ${contour} skipped for ${integration.provider}: ` +
              `lease held by ${outcome.held_by ?? 'unknown'}`,
          );
          continue;
        }

        this.logger.log(
          `reconciliation ${contour} ${outcome.completeness} for ${integration.provider}: ` +
            `fetched=${outcome.fetched} created=${outcome.created} ` +
            `updated=${outcome.updated} unchanged=${outcome.unchanged} ` +
            `events=${outcome.events_emitted}`,
        );
      } catch (error) {
        // Строка прогона уже помечена сбоем самим сервисом: она и есть
        // наблюдаемый след. Здесь — только то, что цикл продолжается.
        this.logger.error(
          `reconciliation ${contour} failed for ${integration.provider}: ` +
            (error instanceof Error ? error.message : 'unknown error'),
        );
      }
    }
  }

  /** Выкат и включение — разные события. По умолчанию выключен. */
  private isEnabled(): boolean {
    const raw = String(
      this.config.get<string>('CRM_RECONCILIATION_SCHEDULER_ENABLED') ?? '',
    )
      .trim()
      .toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
  }
}
