/** Prospective B35 SQL proof. Synthetic data; owned database only; no providers. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { ActionEngineKernel } from '../src/action-engine/action-engine.kernel';
import { ActionCapabilityRegistry } from '../src/action-engine/action-engine.registry';
import { ACTION_EXECUTION_REQUEST_CONTRACT } from '../src/action-engine/action-engine.contract';

const url = new URL(process.env.DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55505');
assert(url.pathname.startsWith('/maya_b35_'));
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }),
});
const checks: string[] = [];
const hash = 'a'.repeat(64);
const rootCapability = 'communication.bulk-campaign.admit.v2';
class SchemaFixtureRegistry extends ActionCapabilityRegistry {
  override get(key: string) {
    if (key !== rootCapability) return super.get(key);
    return {
      ...super.get('kernel.test.approval'),
      capability: key,
      actionClass: 'deliver_bulk_campaign',
    };
  }
}
const engine = new ActionEngineKernel(
  db,
  {
    identitySecret: 'b35-owned-schema-fixture-identity-secret',
    payloadEncryptionSecret: 'b35-owned-schema-fixture-payload-secret',
    controlledFixtureMode: true,
  },
  new SchemaFixtureRegistry(),
);
const route = {
  contract: 'maya.bulk-client-route/1',
  primary: 'none',
  link: null,
  userId: null,
  webPushEndpoints: [],
  apnsDevices: [],
  policyVersion: 1,
};
async function reject(
  name: string,
  fn: () => Promise<unknown>,
  match: RegExp = /B35|IDEMPOTENCY_CONFLICT|Unique constraint|Foreign key/,
) {
  await assert.rejects(fn, match, name);
  checks.push(name);
}
async function main() {
  const tenant = await db.tenant.create({
    data: { name: 'B35 synthetic', slug: randomUUID() },
  });
  const other = await db.tenant.create({
    data: { name: 'B35 foreign synthetic', slug: randomUUID() },
  });
  const user = await db.user.create({
    data: {
      email: `${randomUUID()}@example.invalid`,
      passwordHash: 'synthetic',
      role: 'tenant_owner',
      tenantId: tenant.id,
    },
  });
  await db.membership.create({
    data: { tenantId: tenant.id, userId: user.id, role: 'tenant_owner' },
  });
  const client = await db.client.create({ data: { tenantId: tenant.id } });
  const foreign = await db.client.create({ data: { tenantId: other.id } });
  const expiresAt = new Date(Date.now() + 86_400_000);
  const audienceData = {
    tenantId: tenant.id,
    createdByUserId: user.id,
    ruleJson: {},
    recipientUserIdsJson: [],
    candidateCount: 1,
    eligibleCount: 1,
    expiresAt,
    snapshotContract: 'maya.bulk-client-audience/1',
    snapshotHash: hash,
    status: 'ASSEMBLING',
  };
  await reject('unsealed audience cannot commit', () =>
    db.marketingAudience.create({ data: audienceData }),
  );
  await reject('cross-tenant Client FK rejects during audience assembly', () =>
    db.$transaction(async (tx) => {
      const a = await tx.marketingAudience.create({ data: audienceData });
      await tx.marketingAudienceRecipient.create({
        data: {
          id: randomUUID(),
          tenantId: tenant.id,
          audienceId: a.id,
          clientId: foreign.id,
          externalClientId: 'foreign',
          eligibilityStatus: 'CANDIDATE',
        },
      });
    }),
  );
  await reject(
    'duplicate canonical Client violates exact audience unique',
    () =>
      db.$transaction(async (tx) => {
        const a = await tx.marketingAudience.create({ data: audienceData });
        for (const externalClientId of ['one', 'two'])
          await tx.marketingAudienceRecipient.create({
            data: {
              id: randomUUID(),
              tenantId: tenant.id,
              audienceId: a.id,
              clientId: client.id,
              externalClientId,
              eligibilityStatus: 'CANDIDATE',
            },
          });
      }),
  );
  const audience = await db.$transaction(async (tx) => {
    const a = await tx.marketingAudience.create({ data: audienceData });
    await tx.marketingAudienceRecipient.create({
      data: {
        id: randomUUID(),
        tenantId: tenant.id,
        audienceId: a.id,
        clientId: client.id,
        externalClientId: hash,
        eligibilityStatus: 'CANDIDATE',
      },
    });
    return tx.marketingAudience.update({
      where: { id: a.id },
      data: { status: 'FROZEN' },
    });
  });
  checks.push('canonical Client audience seals atomically without Maya User');
  await reject('sealed audience immutable', () =>
    db.marketingAudience.update({
      where: { id: audience.id },
      data: { snapshotHash: 'b'.repeat(64) },
    }),
  );
  await reject('sealed member insertion forbidden', () =>
    db.marketingAudienceRecipient.create({
      data: {
        id: randomUUID(),
        tenantId: tenant.id,
        audienceId: audience.id,
        clientId: foreign.id,
        externalClientId: 'foreign',
        eligibilityStatus: 'CANDIDATE',
      },
    }),
  );
  await reject('sealed member deletion forbidden', () =>
    db.marketingAudienceRecipient.deleteMany({
      where: { audienceId: audience.id },
    }),
  );
  const campaign = await db.marketingCampaign.create({
    data: {
      tenantId: tenant.id,
      createdByUserId: user.id,
      audienceId: audience.id,
      channel: null,
      provider: null,
      message: 'Synthetic approved message',
      recipientUserIdsJson: [],
      recipientCount: 1,
      idempotencyKey: randomUUID(),
      expiresAt,
      lifecycleVersion: 2,
      scope: 'BULK',
      aggregateState: 'DRAFT',
      bulkIntentContract: 'maya.marketing-bulk-intent/1',
      bulkIntentHash: hash,
      audienceSnapshotHash: hash,
      messageSnapshotHash: hash,
    },
  });
  const child = await db.marketingCampaignRecipient.create({
    data: {
      id: randomUUID(),
      tenantId: tenant.id,
      campaignId: campaign.id,
      clientId: client.id,
      externalClientId: hash,
      idempotencyKey: randomUUID(),
      updatedAt: new Date(),
      lifecycleVersion: 2,
      identityVersion: 1,
      recipientKind: 'canonical_client',
      recipientRefHash: hash,
      contentIdentityHash: hash,
      contentEncrypted: 'synthetic-encrypted-fixture',
      routePlanJson: route,
      aggregateState: 'READY',
      payloadRetentionUntil: expiresAt,
    },
  });
  await reject(
    'duplicate Client child unique independent of opaque transport identity',
    () =>
      db.marketingCampaignRecipient.create({
        data: {
          ...child,
          id: randomUUID(),
          externalClientId: 'different-opaque-ref',
          idempotencyKey: randomUUID(),
          routePlanJson: route,
        },
      }),
  );
  const execution = await engine.createExecutionForControlledFixture({
    contract: ACTION_EXECUTION_REQUEST_CONTRACT,
    tenantId: tenant.id,
    capability: rootCapability,
    source: {
      type: 'synthetic_shadow',
      occurrenceScope: campaign.id,
      sourceRef: campaign.id,
    },
    targetRef: campaign.id,
    input: { valueRef: campaign.id },
    evidenceRefs: [`b35:intent:${hash}`],
    intentExpiresAt: expiresAt,
  });
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.actionExecution.update({
      where: { id: execution.id },
      data: {
        approvalDecision: 'APPROVED',
        approvalDecidedAt: now,
        approvalDecidedByUserId: user.id,
        state: 'READY',
        revision: { increment: 1 },
      },
    });
    await tx.marketingCampaign.update({
      where: { id: campaign.id },
      data: {
        confirmedAt: now,
        confirmedByUserId: user.id,
        confirmationHash: hash,
        actionExecutionId: execution.id,
        aggregateState: 'READY',
        revision: { increment: 1 },
      },
    });
  });
  checks.push('approval and exact child graph committed atomically');
  for (const [key, value] of Object.entries({
    message: 'changed',
    audienceId: randomUUID(),
    bulkIntentHash: 'b'.repeat(64),
    expiresAt: new Date(expiresAt.getTime() + 1),
    confirmedByUserId: randomUUID(),
  })) {
    await reject(`confirmed ${key} conflict`, () =>
      db.marketingCampaign.update({
        where: { id: campaign.id },
        data: { [key]: value },
      }),
    );
  }
  await reject('fixed route cannot change', () =>
    db.marketingCampaignRecipient.update({
      where: { id: child.id },
      data: {
        routePlanJson: { ...route, policyVersion: 2 },
        revision: { increment: 1 },
      },
    }),
  );
  await reject('logical recipient cannot create fake provider attempt', () =>
    db.marketingDeliveryAttempt.create({
      data: {
        id: randomUUID(),
        tenantId: tenant.id,
        campaignId: campaign.id,
        recipientId: child.id,
        batchKey: hash,
        attemptNumber: 1,
        status: 'STARTED',
      },
    }),
  );
  const claims = await Promise.all(
    [1, 2].map(() =>
      db.marketingCampaignRecipient.updateMany({
        where: { id: child.id, revision: child.revision, leaseOwner: null },
        data: {
          leaseOwner: 'schema-proof',
          leaseTokenHash: randomUUID(),
          leaseExpiresAt: expiresAt,
          revision: { increment: 1 },
        },
      }),
    ),
  );
  assert.equal(
    claims.reduce((n, r) => n + r.count, 0),
    1,
  );
  checks.push('concurrent logical CAS claim one winner');
  await reject('live lease cannot be stolen with a fresh revision', () =>
    db.marketingCampaignRecipient.update({
      where: { id: child.id },
      data: { leaseTokenHash: randomUUID(), revision: { increment: 1 } },
    }),
  );
  await reject('stale revision cannot update', () =>
    db.marketingCampaignRecipient.update({
      where: { id: child.id },
      data: { revision: child.revision },
    }),
  );
  await db.marketingCampaignRecipient.update({
    where: { id: child.id },
    data: {
      leaseOwner: null,
      leaseTokenHash: null,
      leaseExpiresAt: null,
      aggregateState: 'SKIPPED',
      terminalAt: new Date(),
      terminalReasonCode: 'NO_ELIGIBLE_ENDPOINT',
      revision: { increment: 1 },
    },
  });
  await reject('terminal logical outcome cannot reopen', () =>
    db.marketingCampaignRecipient.update({
      where: { id: child.id },
      data: {
        aggregateState: 'READY',
        terminalAt: null,
        revision: { increment: 1 },
      },
    }),
  );
  const policy = await db.marketingPolicy.create({
    data: {
      tenantId: tenant.id,
      updatedAt: now,
      canonicalHistoryStartedAt: new Date('2000-01-01'),
    },
  });
  assert(
    policy.canonicalHistoryStartedAt && policy.canonicalHistoryStartedAt >= now,
  );
  checks.push('epoch uses current database time, never caller history');
  await reject('epoch cannot clear', () =>
    db.marketingPolicy.update({
      where: { tenantId: tenant.id },
      data: { canonicalHistoryStartedAt: null },
    }),
  );
  await reject('epoch cannot delete/recreate', () =>
    db.marketingPolicy.delete({ where: { tenantId: tenant.id } }),
  );
  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        phase: 'schema ownership (transport proof follows)',
        checks,
        fixture: {
          tenantId: tenant.id,
          campaignId: campaign.id,
          childId: child.id,
        },
        productionMessages: 0,
      },
      null,
      2,
    ),
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
