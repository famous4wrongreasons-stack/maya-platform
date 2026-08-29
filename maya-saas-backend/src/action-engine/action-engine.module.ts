import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EntitlementsModule } from '../entitlements/entitlements.module';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActionContractError } from './action-engine.errors';
import { CanonicalActionIngressService } from './action-engine.ingress';
import { ActionEngineKernel } from './action-engine.kernel';
import { createCanonicalProductionPolicyRegistry } from './action-engine.policy-registry';
import {
  CanonicalActionPolicyRegistry,
  CanonicalActionPolicyResolver,
} from './action-engine.policy-resolver';
import { ActionCapabilityRegistry } from './action-engine.registry';
import { ActionEngineRuntimeService } from './action-engine.runtime';

@Module({
  imports: [EntitlementsModule],
  providers: [
    ActionCapabilityRegistry,
    {
      provide: CanonicalActionPolicyRegistry,
      useFactory: (capabilities: ActionCapabilityRegistry) =>
        createCanonicalProductionPolicyRegistry(capabilities),
      inject: [ActionCapabilityRegistry],
    },
    {
      provide: CanonicalActionPolicyResolver,
      useFactory: (
        prisma: PrismaService,
        entitlements: EntitlementsService,
        config: ConfigService,
        policies: CanonicalActionPolicyRegistry,
        capabilities: ActionCapabilityRegistry,
      ) =>
        new CanonicalActionPolicyResolver(
          prisma,
          entitlements,
          {
            attestationSecret: requiredActionSecret(
              config,
              'ACTION_ENGINE_POLICY_ATTESTATION_SECRET',
            ),
          },
          policies,
          capabilities,
        ),
      inject: [
        PrismaService,
        EntitlementsService,
        ConfigService,
        CanonicalActionPolicyRegistry,
        ActionCapabilityRegistry,
      ],
    },
    {
      provide: ActionEngineKernel,
      useFactory: (
        prisma: PrismaService,
        config: ConfigService,
        capabilities: ActionCapabilityRegistry,
        policyResolver: CanonicalActionPolicyResolver,
      ) =>
        new ActionEngineKernel(
          prisma,
          {
            identitySecret: requiredActionSecret(
              config,
              'ACTION_ENGINE_IDENTITY_SECRET',
            ),
            payloadEncryptionSecret: requiredActionSecret(
              config,
              'ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET',
            ),
          },
          capabilities,
          policyResolver,
        ),
      inject: [
        PrismaService,
        ConfigService,
        ActionCapabilityRegistry,
        CanonicalActionPolicyResolver,
      ],
    },
    CanonicalActionIngressService,
    ActionEngineRuntimeService,
  ],
  exports: [ActionEngineRuntimeService],
})
export class ActionEngineModule {}

function requiredActionSecret(config: ConfigService, key: string): string {
  const value =
    config.get<string>(key)?.trim() ??
    config.get<string>('CRM_ENCRYPTION_KEY')?.trim();
  if (!value) {
    throw new ActionContractError(`${key} is not configured`);
  }
  return value;
}
