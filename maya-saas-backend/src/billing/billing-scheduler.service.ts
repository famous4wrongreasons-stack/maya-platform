import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { BillingService } from './billing.service';

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_INTERVAL_MS = HOUR_MS;
const FIRST_RUN_DELAY_MS = 60 * 1000;

/**
 * Автопродление подписок.
 *
 * 🔴 Логика продления (runDueBilling) была написана давно, но её НИЧТО не
 * вызывало: ни планировщика, ни крона в проекте не было. Салон оплачивал
 * месяц, а на 31-й день просто блокировался — деньги взяли, доступ закрыли.
 *
 * Планировщик намеренно сделан на голом setInterval, без @nestjs/schedule:
 * новая зависимость означала бы полную переустановку пакетов на сервере, а
 * канал до него рвётся, и выкат уже падал ровно на этом шаге.
 *
 * ⚠️ Расчёт на ОДИН экземпляр приложения (сейчас это один systemd-юнит). При
 * горизонтальном масштабировании оставить BILLING_SCHEDULER_ENABLED=true
 * только на одном экземпляре, иначе списания задвоятся.
 */
@Injectable()
export class BillingSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private firstRunTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly billingService: BillingService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      this.logger.log('Billing scheduler is disabled by configuration.');
      return;
    }

    const intervalMs = this.resolveIntervalMs();

    // Первый проход не на старте: дать приложению подняться и не мешать
    // деплою, если он прокатывает несколько релизов подряд.
    this.firstRunTimer = setTimeout(() => {
      void this.tick();
    }, FIRST_RUN_DELAY_MS);
    this.firstRunTimer.unref?.();

    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    this.timer.unref?.();

    this.logger.log(
      `Billing scheduler started, interval ${Math.round(intervalMs / 60000)} min.`,
    );
  }

  onModuleDestroy(): void {
    if (this.firstRunTimer) {
      clearTimeout(this.firstRunTimer);
      this.firstRunTimer = null;
    }

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Один проход. Публичный, чтобы его можно было дёрнуть из теста. */
  async tick(): Promise<void> {
    // Проход может затянуться: каждый должник — это сетевой запрос в ЮKassa.
    // Наложение проходов означало бы двойное списание по одной подписке.
    if (this.running) {
      this.logger.warn('Previous billing run is still in progress, skipping.');
      return;
    }

    this.running = true;

    try {
      // Сначала сверка: платёж мог пройти, а уведомление не дойти. Если не
      // досчитать его ДО продления, салон выглядел бы должником с оплаченной
      // подпиской — и мог получить второе списание.
      await this.billingService.reconcilePendingPayments();

      const result = await this.billingService.runDueBilling();

      if (result.charged > 0 || result.marked_past_due > 0 || result.failed > 0) {
        this.logger.log(
          `Billing run: charged ${result.charged}, past due ${result.marked_past_due}, failed ${result.failed}.`,
        );
      }
    } catch (error) {
      // Падение прохода не должно ронять приложение: следующий тик повторит.
      this.logger.error(
        `Billing run failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      this.running = false;
    }
  }

  private isEnabled(): boolean {
    const raw = this.configService.get<string>('BILLING_SCHEDULER_ENABLED');

    if (raw === undefined || raw === null || String(raw).trim() === '') {
      return true;
    }

    return !['false', '0', 'off', 'no'].includes(
      String(raw).trim().toLowerCase(),
    );
  }

  private resolveIntervalMs(): number {
    const raw = Number(
      this.configService.get<string>('BILLING_SCHEDULER_INTERVAL_MINUTES'),
    );

    if (!Number.isFinite(raw) || raw < 5 || raw > 24 * 60) {
      return DEFAULT_INTERVAL_MS;
    }

    return Math.round(raw) * 60 * 1000;
  }
}
