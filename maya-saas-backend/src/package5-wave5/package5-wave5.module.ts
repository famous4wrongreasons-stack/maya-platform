import { Module } from '@nestjs/common';

import {
  ActionEngineKernel,
  ActionEngineModule,
  CanonicalActionIngressService,
} from '../action-engine';
import { PrismaService } from '../prisma/prisma.service';
import {
  Package5Wave5ExecutableService,
  Package5Wave5RecoveryFactPlaneService,
  Package5Wave5ShadowService,
} from './package5-wave5.service';

@Module({
  imports: [ActionEngineModule],
  providers: [
    Package5Wave5RecoveryFactPlaneService,
    Package5Wave5ShadowService,
    {
      provide: Package5Wave5ExecutableService,
      useFactory: (
        prisma: PrismaService,
        ingress: CanonicalActionIngressService,
        kernel: ActionEngineKernel,
        planner: Package5Wave5ShadowService,
      ) => new Package5Wave5ExecutableService(prisma, ingress, kernel, planner),
      inject: [
        PrismaService,
        CanonicalActionIngressService,
        ActionEngineKernel,
        Package5Wave5ShadowService,
      ],
    },
  ],
  exports: [
    Package5Wave5RecoveryFactPlaneService,
    Package5Wave5ShadowService,
    Package5Wave5ExecutableService,
  ],
})
export class Package5Wave5Module {}
