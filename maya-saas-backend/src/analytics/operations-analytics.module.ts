import { Module } from '@nestjs/common';

import { BusinessFactsModule } from '../business-facts/business-facts.module';
import { CrmModule } from '../crm/crm.module';
import { TenantsModule } from '../tenants/tenants.module';
import { OperationsAnalyticsService } from './operations-analytics.service';

/**
 * Операционное вычисление — примитив, на котором стоит состояние бизнеса.
 *
 * 🔴 Cycle 04 P3. Контроллер отсюда уехал намеренно: HTTP теперь ходит за
 * фактами к каноническому владельцу, а владелец — сюда. Оставь контроллер
 * здесь, и модулям пришлось бы импортировать друг друга по кругу.
 */
@Module({
  imports: [TenantsModule, CrmModule, BusinessFactsModule],
  providers: [OperationsAnalyticsService],
  exports: [OperationsAnalyticsService],
})
export class OperationsAnalyticsModule {}
