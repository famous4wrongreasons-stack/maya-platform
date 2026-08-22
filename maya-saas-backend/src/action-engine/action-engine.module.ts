import { Module } from '@nestjs/common';

import { ActionEngineRuntimeService } from './action-engine.runtime';

@Module({
  providers: [ActionEngineRuntimeService],
  exports: [ActionEngineRuntimeService],
})
export class ActionEngineModule {}
