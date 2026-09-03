import { Module } from '@nestjs/common';

import {
  ActionEngineKernel,
  ActionEngineModule,
  CanonicalActionIngressService,
} from '../action-engine';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommerceIntegrationController } from './commerce-integration.controller';
import { CommerceIntegrationService } from './commerce-integration.service';
import { P410CommerceCredentialCanonicalCutoverService } from './p4-10-commerce-credential-canonical-cutover.service';
import { P410CommerceCredentialExecutableService } from './p4-10-commerce-credential-executable.service';
import { P410CommerceCredentialShadowService } from './p4-10-commerce-credential-shadow.service';
import { P410YooKassaCredentialVerifier } from './p4-10-yookassa-credential-verifier';

@Module({
  imports: [ActionEngineModule],
  controllers: [CommerceIntegrationController],
  providers: [
    CommerceIntegrationService,
    P410CommerceCredentialShadowService,
    P410YooKassaCredentialVerifier,
    P410CommerceCredentialCanonicalCutoverService,
    {
      provide: P410CommerceCredentialExecutableService,
      useFactory: (
        prisma: PrismaService,
        ingress: CanonicalActionIngressService,
        kernel: ActionEngineKernel,
        encryption: EncryptionService,
        verifier: P410YooKassaCredentialVerifier,
      ) =>
        new P410CommerceCredentialExecutableService(
          prisma,
          ingress,
          kernel,
          encryption,
          verifier,
        ),
      inject: [
        PrismaService,
        CanonicalActionIngressService,
        ActionEngineKernel,
        EncryptionService,
        P410YooKassaCredentialVerifier,
      ],
    },
  ],
  exports: [CommerceIntegrationService],
})
export class CommerceModule {}
