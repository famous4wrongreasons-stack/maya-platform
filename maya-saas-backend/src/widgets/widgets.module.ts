import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { ControlRegistryService } from './control/control-registry.service';
import { WidgetEmitterService } from './emission/emitter.service';
import { IntentGatewayService } from './intent-gateway.service';
import { WidgetStoresService } from './stores/widget-stores.service';
import { WidgetsController } from './widgets.controller';

/**
 * K3 — the widget runtime.
 *
 * It imports PrismaModule and nothing else. That is deliberate and worth stating: a gateway that
 * could import a capability module could reach a canonical owner, and section 3 puts the whole of
 * the authority in this component precisely so it is the only thing that may consume an intent
 * token. Every later package adds gates to the pipeline, not paths around it.
 */
@Module({
  imports: [PrismaModule],
  controllers: [WidgetsController],
  providers: [
    IntentGatewayService,
    WidgetStoresService,
    WidgetEmitterService,
    ControlRegistryService,
  ],
  exports: [
    IntentGatewayService,
    WidgetStoresService,
    WidgetEmitterService,
    ControlRegistryService,
  ],
})
export class WidgetsModule {}
