import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppointmentNotificationsService } from './appointment-notifications.service';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 90 * 1000;

@Injectable()
export class AppointmentNotificationsScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AppointmentNotificationsScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private firstRunTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly reminders: AppointmentNotificationsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      this.logger.log('Appointment reminders scheduler is disabled.');
      return;
    }
    const intervalMs = this.intervalMs();
    this.firstRunTimer = setTimeout(() => void this.tick(), FIRST_RUN_DELAY_MS);
    this.firstRunTimer.unref?.();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref?.();
    this.logger.log(
      `Appointment reminders scheduler started, interval ${Math.round(intervalMs / 60_000)} min.`,
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
      this.logger.warn('Previous appointment reminder run is still active.');
      return;
    }
    this.running = true;
    try {
      const result = await this.reminders.tick();
      if (result.sent || result.failed) {
        this.logger.log(
          `Appointment reminders: tenants=${result.tenants} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Appointment reminders tick failed: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    } finally {
      this.running = false;
    }
  }

  private isEnabled(): boolean {
    const raw = String(
      this.config.get<string>('APPOINTMENT_REMINDERS_SCHEDULER_ENABLED') ?? '',
    )
      .trim()
      .toLowerCase();
    return !['false', '0', 'off', 'no'].includes(raw);
  }

  private intervalMs(): number {
    const minutes = Number(
      this.config.get<string>('APPOINTMENT_REMINDERS_INTERVAL_MINUTES'),
    );
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 60) {
      return DEFAULT_INTERVAL_MS;
    }
    return Math.trunc(minutes) * 60 * 1000;
  }
}
