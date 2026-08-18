import { Module } from '@nestjs/common';

import { OperationsAnalyticsModule } from '../analytics/operations-analytics.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BusinessStateService } from './business-state.service';

/**
 * Канонический владелец состояния бизнеса.
 *
 * Направление зависимости одностороннее: этот модуль ничего не знает про AI,
 * а AI импортирует его. Обратный импорт ловит храповик границы.
 */
@Module({
  imports: [OperationsAnalyticsModule, PrismaModule],
  providers: [BusinessStateService],
  exports: [BusinessStateService],
})
export class BusinessStateModule {}
