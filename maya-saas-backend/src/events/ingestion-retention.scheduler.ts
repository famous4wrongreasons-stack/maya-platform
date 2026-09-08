import {WaveRcPayloadRetentionService} from '../package5-wave6/package5-wave-rc-retention.service';
import {
  Injectable,
  Optional,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EventStoreService } from './event-store.service';

/** Срок хранения — суточная величина, чаще проверять нечего. */
const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Первый проход не в момент старта: приложение должно подняться. */
const FIRST_RUN_DELAY_MS = 3 * 60 * 1000;

/**
 * Применение срока хранения карантина (Cycle 03, closure fix).
 *
 * 🔴 Зачем понадобился отдельный планировщик, а не строчка в существующем.
 *
 * Уборку можно было повесить на такт сверки — он уже ходит по расписанию. Но
 * сверка идёт по АКТИВНЫМ интеграциям CRM: у арендатора без CRM её такт
 * заканчивается сразу, а карантин у него всё равно копится (доставка с
 * неразрешённым арендатором попадает туда без арендатора вовсе). Привязав
 * хранение к сверке, мы бы получили ту же болезнь, которую лечим: политика
 * есть, а в части случаев не исполняется.
 *
 * 🔴 Включён по умолчанию, в отличие от сверки. Это не новое поведение, а
 * исполнение срока, объявленного при создании каждой строки. Флаг оставлен
 * только для того, чтобы уборку можно было остановить, если она когда-нибудь
 * помешает разбору.
 */
@Injectable()
export class IngestionRetentionScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(IngestionRetentionScheduler.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly eventStore: EventStoreService,
    private readonly config: ConfigService,
    @Optional() private readonly payloads?: WaveRcPayloadRetentionService,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      this.logger.log('Ingestion quarantine retention is disabled.');
      return;
    }

    const first = setTimeout(() => void this.tick(), FIRST_RUN_DELAY_MS);
    first.unref?.();
    const repeat = setInterval(() => void this.tick(), RETENTION_INTERVAL_MS);
    repeat.unref?.();
    this.timers.push(first, repeat);
    // Payload deadlines/reads are enforced independently of the daily quarantine
    // policy. An empty AC6 shadow never creates a maintenance run.
    const payloadFirst=setTimeout(()=>void this.tickPayloads(),FIRST_RUN_DELAY_MS);
    const payloadRepeat=setInterval(()=>void this.tickPayloads(),60_000);
    payloadFirst.unref?.();payloadRepeat.unref?.();this.timers.push(payloadFirst,payloadRepeat);

    this.logger.log(
      `Ingestion quarantine retention started: every ${
        RETENTION_INTERVAL_MS / 3_600_000
      } h, keeping ${this.eventStore.configuredQuarantineRetentionDays()} days.`,
    );
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
  }

  /**
   * Один проход уборки.
   *
   * Повторный запуск безопасен: удалять нечего, потому что удалённого больше
   * нет. Сбой не роняет приложение — не убранная сегодня диагностика будет
   * убрана завтра, и это не повод останавливать приём.
   */
  async tick(): Promise<void> {
    try {
      const { deleted } = await this.eventStore.purgeExpiredQuarantine();
      if (deleted === 0) {
        this.logger.debug('quarantine retention: nothing expired');
      }
    } catch (error) {
      this.logger.error(
        'quarantine retention failed: ' +
          (error instanceof Error ? error.message : 'unknown error'),
      );
    }
  }

  private async tickPayloads(){try{await this.payloads?.tick();}catch{this.logger.warn('AC6 payload retention held for retry');}}

  private isEnabled(): boolean {
    const raw = String(
      this.config.get<string>('INGESTION_QUARANTINE_RETENTION_ENABLED') ?? '',
    )
      .trim()
      .toLowerCase();
    // Пусто — значит включено: срок объявлен при создании строки, и его
    // исполнение не должно зависеть от того, вспомнили ли про переменную.
    if (!raw) return true;
    return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
  }
}
