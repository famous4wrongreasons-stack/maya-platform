import { RC_DURABLE_COMMANDS } from '../src/action-engine/action-engine.durable-policy';
import { EncryptionService } from '../src/encryption/encryption.service';
import { AuditLogService } from '../src/audit-log/audit-log.service';
import 'reflect-metadata';
import type { UserRole } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import {
  ActionCapabilityRegistry,
  ActionEngineKernel,
  CanonicalActionIngressService,
} from '../src/action-engine';
import { CanonicalActionPolicyResolver } from '../src/action-engine/action-engine.policy-resolver';
import { createCanonicalProductionPolicyRegistry } from '../src/action-engine/action-engine.policy-registry';
import {
  FEATURE_REQUIREMENT_DECISION_CONTRACT,
  type EntitlementsService,
} from '../src/entitlements/entitlements.service';

/** Synthetic PostgreSQL proof support. It cannot connect to production or any
 * pre-existing database and contains no transport implementation. */
const url = new URL(process.env.DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55509');
assert.equal(url.pathname, '/maya_rc_clean_replay');
assert.equal(url.username, 'maya_rc');
export const secret = 'wave-rc-local-proof-not-production';
export const config = new ConfigService({
  DATABASE_URL: url.toString(),
  CRM_ENCRYPTION_KEY: secret,
  STAFF_AI_AVAILABLE_PROVIDERS: 'claude,openai',
});
export const db = new PrismaService(config),
  context = new TenantContextService(),
  caps = new ActionCapabilityRegistry();
export const entitlements: Pick<
  EntitlementsService,
  'resolveFeatureRequirements'
> = {
  resolveFeatureRequirements: (tenantId, features) =>
    Promise.resolve({
      contract: FEATURE_REQUIREMENT_DECISION_CONTRACT,
      tenantId,
      planId: null,
      requiredFeatures: features.map((featureKey) => ({
        featureKey,
        enabled: true,
      })),
      allowed: true,
      evaluatedAt: new Date(),
      validUntil: new Date('2099-01-01T00:00:00Z'),
    }),
};
export const resolver = new CanonicalActionPolicyResolver(
  db,
  entitlements,
  { attestationSecret: secret },
  createCanonicalProductionPolicyRegistry(caps),
  caps,
);
export const engine = new ActionEngineKernel(
  db,
  { identitySecret: secret, payloadEncryptionSecret: secret },
  caps,
  resolver,
  {
    audit: new AuditLogService(db, context),
    encryption: new EncryptionService(config),
  },
);
// Optional executable lifetime proof only on the exact isolated database above.
// Real elapsed time exceeds the original 60s attestation; no runtime TTL is changed.
if (process.env.MAYA_RC_DELAYED_PROOF === '1') {
  const originalClaim = engine.claimExecution.bind(engine);
  let barrier: Promise<void> | undefined;
  engine.claimExecution = async (input, transaction) => {
    // Atomic local commands have no persisted pre-claim restart point.
    if (transaction) return originalClaim(input, transaction);
    const row = await db.actionExecution.findUniqueOrThrow({
      where: {
        id_tenantId: { id: input.executionId, tenantId: input.tenantId },
      },
    });
    const owned =
      RC_DURABLE_COMMANDS.has(row.capability) ||
      row.ownerReportRunId ||
      row.operationalAlertRunId ||
      row.nativeFeedbackRequestId ||
      row.teamMessageId ||
      row.expenseReminderRunId;
    if (owned && row.state === 'READY' && row.approvalRequirement === 'NONE') {
      if (!barrier) {
        barrier = new Promise<void>((resolve) => setTimeout(resolve, 65000));
        console.log(
          JSON.stringify({
            delayedPolicyProof: 'waiting',
            executionId: row.id,
            capability: row.capability,
            originalExpiry: row.policyValidUntil?.toISOString(),
            delayMs: 65000,
          }),
        );
      }
      await barrier;
    }
    const result = await originalClaim(input);
    if (
      owned &&
      row.policyValidUntil &&
      row.policyValidUntil.getTime() < Date.now()
    ) {
      const after = await db.actionExecution.findUniqueOrThrow({
        where: { id: row.id },
      });
      assert.equal(
        after.policyValidUntil?.getTime(),
        row.policyValidUntil.getTime(),
      );
      assert.equal(after.approvalBindingHash, row.approvalBindingHash);
      assert.equal(after.identityFingerprint, row.identityFingerprint);
      assert.equal(
        await db.auditLog.count({
          where: {
            tenantId: row.tenantId,
            entityId: row.id,
            action: 'action.rc_claim_policy',
            metadataJson: { path: ['attemptId'], equals: result.attempt.id },
          },
        }),
        1,
      );
      console.log(
        JSON.stringify({
          delayedPolicyProof: 'PASS',
          executionId: row.id,
          capability: row.capability,
          sameAdmission: true,
          claimAudit: 1,
        }),
      );
    }
    return result;
  };
}

export const ingress = new CanonicalActionIngressService(engine, resolver);
export async function tenantFixture() {
  return db.tenant.create({
    data: {
      name: 'Wave R-C synthetic proof',
      slug: randomUUID(),
      status: 'active',
    },
  });
}
export async function staffFixture(
  tenantId: string,
  role: UserRole = 'tenant_owner',
) {
  const user = await db.user.create({
    data: {
      tenantId,
      email: randomUUID() + '@example.invalid',
      passwordHash: 'synthetic',
      status: 'active',
      role,
    },
  });
  const member = await db.membership.create({
    data: { tenantId, userId: user.id, status: 'active', role },
  });
  return { user, member };
}
export function asActor<T>(
  tenantId: string,
  userId: string,
  role: string,
  work: () => T,
): T {
  return context.runAsAuthPrincipal({ tenantId, userId, role }, work);
}
