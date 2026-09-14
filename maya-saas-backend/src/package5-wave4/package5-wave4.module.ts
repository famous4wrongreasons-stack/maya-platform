import { Module } from '@nestjs/common';

import {
  ActionEngineKernel,
  ActionEngineModule,
  ActionEngineRuntimeService,
  CanonicalActionIngressService,
} from '../action-engine';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { QuotasModule } from '../quotas/quotas.module';
import { Package5Wave4CanonicalCutoverService } from './package5-wave4-canonical-cutover.service';
import { Package5Wave4FileObjectStore } from './package5-wave4-object-store.service';
import {
  Package5Wave4ExecutableService,
  Package5Wave4ReviewFactService,
  Package5Wave4ShadowService,
} from './package5-wave4.service';

@Module({
  imports: [ActionEngineModule, QuotasModule],
  providers: [
    Package5Wave4ShadowService,
    Package5Wave4FileObjectStore,
    Package5Wave4CanonicalCutoverService,
    {
      provide: Package5Wave4ReviewFactService,
      useFactory: (prisma: PrismaService, encryption: EncryptionService) =>
        new Package5Wave4ReviewFactService(prisma, encryption),
      inject: [PrismaService, EncryptionService],
    },
    {
      provide: Package5Wave4ExecutableService,
      useFactory: (
        prisma: PrismaService,
        ingress: CanonicalActionIngressService,
        kernel: ActionEngineKernel,
        runtime: ActionEngineRuntimeService,
        planner: Package5Wave4ShadowService,
        objectStore: Package5Wave4FileObjectStore,
      ) =>
        new Package5Wave4ExecutableService(
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
        Package5Wave4ShadowService,
        Package5Wave4FileObjectStore,
      ],
    },
  ],
  exports: [
    Package5Wave4CanonicalCutoverService,
    Package5Wave4ReviewFactService,
  ],
})
export class Package5Wave4Module {}
