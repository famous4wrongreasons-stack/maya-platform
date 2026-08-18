import { Module } from '@nestjs/common';

import { BusinessStateModule } from '../business-state/business-state.module';
import { OperationsAnalyticsController } from './operations-analytics.controller';
import { OperationsAnalyticsModule } from './operations-analytics.module';

/**
 * HTTP-поверхность аналитики.
 *
 * Направление зависимости: `HTTP → Business State → операционное вычисление`.
 * Обратного пути нет, и храповик границы это проверяет.
 */
@Module({
  imports: [BusinessStateModule, OperationsAnalyticsModule],
  controllers: [OperationsAnalyticsController],
})
export class AnalyticsHttpModule {}
