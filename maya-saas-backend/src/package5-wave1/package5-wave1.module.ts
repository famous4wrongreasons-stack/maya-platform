import { GovernedSettingsReadService } from './governed-settings.read';
import { GovernedSettingsController } from './governed-settings.controller';
import { Module } from '@nestjs/common';

import {
  ActionEngineKernel,
  ActionEngineModule,
  CanonicalActionIngressService,
} from '../action-engine';
import { InboxModule } from '../inbox/inbox.module';
import { PrismaService } from '../prisma/prisma.service';
import { Package5Wave1CanonicalCutoverService } from './package5-wave1-canonical-cutover.service';
import { OperationalWorkController } from './operational-work.controller';
import {
  Package5Wave1ExecutableService,
  Package5Wave1ShadowService,
} from './package5-wave1.service';

@Module({
  imports: [ActionEngineModule, InboxModule],
  controllers: [OperationalWorkController, GovernedSettingsController],
  providers: [
    GovernedSettingsReadService,
    Package5Wave1ShadowService,
    Package5Wave1CanonicalCutoverService,
    {
      provide: Package5Wave1ExecutableService,
      useFactory: (
        prisma: PrismaService,
        ingress: CanonicalActionIngressService,
        kernel: ActionEngineKernel,
        governed: GovernedSettingsReadService,
      ) =>
        new Package5Wave1ExecutableService(
          prisma,
          ingress,
          kernel,
          undefined,
          governed,
        ),
      inject: [
        PrismaService,
        CanonicalActionIngressService,
        ActionEngineKernel,
        GovernedSettingsReadService,
      ],
    },
  ],
  exports: [Package5Wave1CanonicalCutoverService, GovernedSettingsReadService],
})
export class Package5Wave1Module {}
