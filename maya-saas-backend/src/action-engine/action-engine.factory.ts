import type { EntitlementsService } from '../entitlements/entitlements.service';
import type { PrismaService } from '../prisma/prisma.service';
import { CanonicalActionIngressService } from './action-engine.ingress';
import { ActionEngineKernel } from './action-engine.kernel';
import { createCanonicalProductionPolicyRegistry } from './action-engine.policy-registry';
import { CanonicalActionPolicyResolver } from './action-engine.policy-resolver';
import { ActionCapabilityRegistry } from './action-engine.registry';
import { ActionEngineRuntimeService } from './action-engine.runtime';

export interface StandaloneCanonicalActionEngineOptions {
  identitySecret: string;
  payloadEncryptionSecret: string;
  policyAttestationSecret?: string;
  now?: () => Date;
}

export interface StandaloneCanonicalActionEngine {
  runtime: ActionEngineRuntimeService;
  kernel: ActionEngineKernel;
  ingress: CanonicalActionIngressService;
  policyResolver: CanonicalActionPolicyResolver;
}

/** Local proof/test composition helper. Production composition is Nest-owned. */
export function createStandaloneCanonicalActionEngineRuntime(
  prisma: PrismaService,
  entitlements: Pick<EntitlementsService, 'resolveFeatureRequirements'>,
  options: StandaloneCanonicalActionEngineOptions,
): ActionEngineRuntimeService {
  return createStandaloneCanonicalActionEngine(prisma, entitlements, options)
    .runtime;
}

/** Full local composition for executable PostgreSQL proofs only. */
export function createStandaloneCanonicalActionEngine(
  prisma: PrismaService,
  entitlements: Pick<EntitlementsService, 'resolveFeatureRequirements'>,
  options: StandaloneCanonicalActionEngineOptions,
): StandaloneCanonicalActionEngine {
  const capabilities = new ActionCapabilityRegistry();
  const policyResolver = new CanonicalActionPolicyResolver(
    prisma,
    entitlements,
    {
      attestationSecret:
        options.policyAttestationSecret ?? options.identitySecret,
      now: options.now,
    },
    createCanonicalProductionPolicyRegistry(capabilities),
    capabilities,
  );
  const kernel = new ActionEngineKernel(
    prisma,
    {
      identitySecret: options.identitySecret,
      payloadEncryptionSecret: options.payloadEncryptionSecret,
      now: options.now,
    },
    capabilities,
    policyResolver,
  );
  const ingress = new CanonicalActionIngressService(kernel, policyResolver);
  const runtime = new ActionEngineRuntimeService(kernel, ingress);
  return { runtime, kernel, ingress, policyResolver };
}
