import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { OwnerReportsService } from './owner-reports.service';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 90 * 1000;

/**
 * Multi-tenant owner morning/evening reports → persistent Nest inbox.
 * No Telegram bot required per subscriber.
 *
 * Single-instance only (same constraint as billing scheduler).
 */
@Injectable()
export class OwnerReportsSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(OwnerReportsSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private firstRunTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly reports: OwnerReportsService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      this.logger.log('Owner reports scheduler is disabled by configuration.');
      return;
    }

    const intervalMs = this.resolveIntervalMs();
    this.firstRunTimer = setTimeout(() => {
      void this.tick();
    }, FIRST_RUN_DELAY_MS);
    this.firstRunTimer.unref?.();

    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    this.timer.unref?.();

    this.logger.log(
      `Owner reports scheduler started, interval ${Math.round(intervalMs / 60000)} min.`,
    );
  }

  onModuleDestroy(): void {
    if (this.firstRunTimer) clearTimeout(this.firstRunTimer);
    if (this.timer) clearInterval(this.timer);
    this.firstRunTimer = null;
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('Previous owner-reports run still in progress, skipping.');
      return;
    }
    this.running = true;
    try {
      const result = await this.reports.tick();
      if (result.morning || result.evening || result.failed) {
        this.logger.log(
          `Owner reports tick: morning=${result.morning} evening=${result.evening} skipped=${result.skipped} failed=${result.failed}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Owner reports tick failed: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    } finally {
      this.running = false;
    }
  }

  private isEnabled(): boolean {
    const raw = this.configService.get<string>('OWNER_REPORTS_SCHEDULER_ENABLED');
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      return true;
    }
    return !['false', '0', 'off', 'no'].includes(String(raw).trim().toLowerCase());
  }

  private resolveIntervalMs(): number {
    const minutes = Number(
      this.configService.get<string>('OWNER_REPORTS_SCHEDULER_INTERVAL_MINUTES'),
    );
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 60) {
      return DEFAULT_INTERVAL_MS;
    }
    return Math.trunc(minutes) * 60 * 1000;
  }
}
