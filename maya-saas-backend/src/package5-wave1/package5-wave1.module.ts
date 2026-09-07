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
  controllers: [OperationalWorkController],
  providers: [
    Package5Wave1ShadowService,
    Package5Wave1CanonicalCutoverService,
    {
      provide: Package5Wave1ExecutableService,
      useFactory: (
        prisma: PrismaService,
        ingress: CanonicalActionIngressService,
        kernel: ActionEngineKernel,
      ) => new Package5Wave1ExecutableService(prisma, ingress, kernel),
      inject: [
        PrismaService,
        CanonicalActionIngressService,
        ActionEngineKernel,
      ],
    },
  ],
  exports: [Package5Wave1CanonicalCutoverService],
})
export class Package5Wave1Module {}
