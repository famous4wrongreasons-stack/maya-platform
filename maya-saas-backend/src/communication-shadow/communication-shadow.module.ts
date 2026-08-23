import { Module } from '@nestjs/common';

import { ActionEngineModule } from '../action-engine';
import { CommunicationShadowService } from './communication-shadow.service';

@Module({
  imports: [ActionEngineModule],
  providers: [CommunicationShadowService],
  exports: [CommunicationShadowService],
})
export class CommunicationShadowModule {}
