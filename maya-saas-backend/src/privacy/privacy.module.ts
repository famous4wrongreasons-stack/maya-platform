import { Module } from '@nestjs/common';

import { WidgetsModule } from '../widgets/widgets.module';
import { HistoryErasureController } from './history-erasure.controller';

/** Privacy transport only; WidgetsModule owns the single RT6 erasure mechanism. */
@Module({
  imports: [WidgetsModule],
  controllers: [HistoryErasureController],
})
export class PrivacyModule {}
