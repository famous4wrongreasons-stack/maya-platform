import { Module } from '@nestjs/common';

import {
  ActionEngineKernel,
  ActionEngineModule,
  ActionEngineRuntimeService,
  CanonicalActionIngressService,
} from '../action-engine';
import { PrismaService } from '../prisma/prisma.service';
import { Package5Wave2FileObjectStore } from './package5-wave2-object-store.service';
import { Package5Wave2CanonicalCutoverService } from './package5-wave2-canonical-cutover.service';
import {
  Package5Wave2ExecutableService,
  Package5Wave2ShadowService,
} from './package5-wave2.service';
import { TrialActivationBootstrapService } from './trial-activation-bootstrap.service';

@Module({
  imports: [ActionEngineModule],
  providers: [
    Package5Wave2ShadowService,
    Package5Wave2FileObjectStore,
    Package5Wave2CanonicalCutoverService,
    {
      provide: TrialActivationBootstrapService,
      useFactory: (prisma: PrismaService) =>
        new TrialActivationBootstrapService(prisma),
      inject: [PrismaService],
    },
    {
      provide: Package5Wave2ExecutableService,
      useFactory: (
        prisma: PrismaService,
        ingress: CanonicalActionIngressService,
        kernel: ActionEngineKernel,
        runtime: ActionEngineRuntimeService,
        planner: Package5Wave2ShadowService,
        objectStore: Package5Wave2FileObjectStore,
      ) =>
        new Package5Wave2ExecutableService(
          prisma,
          ingress,
          kernel,
          runtime,
          planner,
          objectStore,
        ),
      inject: [
        PrismaService,
        CanonicalActionIngressService,
        ActionEngineKernel,
        ActionEngineRuntimeService,
        Package5Wave2ShadowService,
        Package5Wave2FileObjectStore,
      ],
    },
  ],
  exports: [
    Package5Wave2ShadowService,
    Package5Wave2ExecutableService,
    Package5Wave2CanonicalCutoverService,
    TrialActivationBootstrapService,
  ],
})
export class Package5Wave2Module {}
