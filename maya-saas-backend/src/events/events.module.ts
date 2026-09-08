import { ActionEngineModule } from '../action-engine';
import { WaveRcPayloadRetentionService } from '../package5-wave6/package5-wave-rc-retention.service';
import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { EventStoreService } from './event-store.service';
import { IngestionRetentionScheduler } from './ingestion-retention.scheduler';

/**
 * Фундамент наблюдения. В B1 здесь нет ни приёмника, ни обработчика:
 * только хранилище фактов. Приёмник появляется в теневом режиме позже, и
 * побочных действий не получает вовсе.
 */
@Module({
  imports: [PrismaModule, ActionEngineModule],
  providers: [
    EventStoreService,
    IngestionRetentionScheduler,
    WaveRcPayloadRetentionService,
  ],
  exports: [EventStoreService],
})
export class EventsModule {}
