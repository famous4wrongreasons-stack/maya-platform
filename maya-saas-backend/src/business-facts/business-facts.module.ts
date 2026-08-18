import { Module } from '@nestjs/common';

import { CrmModule } from '../crm/crm.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AppointmentPeriodReader } from './appointment-period.reader';
import { AttendanceFactsService } from './attendance-facts.service';

/**
 * Примитивы правды главы 4.
 *
 * 🔴 Здесь НЕТ бизнес-состояния целиком и нет ни одной метрики верхнего
 * уровня. P0 сознательно ограничен входами: пока «прочитано» не отличается от
 * «в периоде», а «ноль» — от «не измерено», централизовать композицию значило
 * бы централизовать неверную истину.
 *
 * Ни таблиц, ни проекций, ни планировщика: всё считается по запросу.
 */
@Module({
  imports: [PrismaModule, CrmModule],
  providers: [AppointmentPeriodReader, AttendanceFactsService],
  exports: [AppointmentPeriodReader, AttendanceFactsService],
})
export class BusinessFactsModule {}
