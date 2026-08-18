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
  imports: [PrismaModule],
  providers: [EventStoreService, IngestionRetentionScheduler],
  exports: [EventStoreService],
})
export class EventsModule {}
