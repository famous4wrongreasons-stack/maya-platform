import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ActionEngineKernel } from '../src/action-engine/action-engine.kernel';
import { ActionIdentityService } from '../src/action-engine/action-engine.identity';

// Schema transaction proof only. The compiled HTTP/AI runtime proof is separate.
const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55501');
assert.match(url.pathname, /^\/maya_c06_b31_(schema|replay)$/);
let db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }),
});
const identity = new ActionIdentityService(
  'b31-schema-synthetic-identity'.repeat(3),
  'b31-schema-synthetic-payload'.repeat(3),
);
const contract = 'maya.client-appointment-create-intent/1';
const scope = 'appointments.client.create.v1';
const results: string[] = [];
const h = (value: unknown) =>
  identity.hmac('synthetic-schema-fixture/1', value);

function executionData(
  tenantId: string,
  intent: string,
  legacy = false,
): Prisma.ActionExecutionUncheckedCreateInput {
  return {
    id: randomUUID(),
    tenantId,
    identityVersion: 1,
    identityFingerprint: h([tenantId, intent]),
    sourceType: 'authenticated_request',
    sourceRef: 'synthetic:b31-schema',
    actionClass: 'create_appointment',
    capability: 'crm.appointment.create.v1',
    capabilityVersion: 1,
    targetKind: 'appointment',
    targetRef: 'create/synthetic',
    normalizedInputContract: 'maya.create_appointment-input/1',
    normalizedInputHash: h(intent),
    normalizedInputEncrypted: identity.encryptNormalizedPayload('{}'),
    evidenceRefsJson: [],
    riskProfileVersion: 1,
    riskFacetsJson: [],
    policyKey: 'production.create_appointment.confirmed-request',
    policyVersion: 1,
    policyDecision: 'ALLOW',
    autonomyLevel: 'L2_CONFIRMED_REQUEST',
    policyDecidedBy: 'synthetic:b31-schema',
    approvalRequirement: 'NONE',
    approvalDecision: 'NOT_REQUIRED',
    state: 'READY',
    retryPolicyKey: 'production.create_appointment.safe-retry',
    retryPolicyVersion: 1,
    maxExecutionAttempts: 2,
    reconciliationPolicyKey: 'production.create_appointment.canonical-read',
    reconciliationPolicyVersion: 1,
    reconciliationState: 'NOT_REQUIRED',
    transportIdentityVersion: 1,
    transportIdempotencyKey: h([tenantId, intent, 'transport']),
    ...(legacy
      ? {}
      : {
          bookingIntentContract: contract,
          bookingIntentHash: intent,
          bookingIntentEncrypted:
            identity.encryptNormalizedPayload('{"synthetic":true}'),
        }),
  };
}

async function fixture() {
  const tenantId = randomUUID();
  await db.tenant.create({
    data: { id: tenantId, slug: tenantId, name: 'Synthetic B31 schema' },
  });
  const client = await db.client.create({ data: { tenantId } });
  return { tenantId, clientId: client.id };
}
type Scope = Awaited<ReturnType<typeof fixture>>;

// The production kernel must implement this same transaction boundary; this
// function verifies PostgreSQL constraints and winner reread before migration.
async function accept(s: Scope, key: string, intent: string): Promise<string> {
  const requestIdempotencyKeyHash = identity.callerIdempotencyHash({
    tenantId: s.tenantId,
    scope,
    key,
  });
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await db.$transaction(
        async (tx) => {
          const binding = await tx.actionExecutionIdempotencyBinding.findUnique(
            {
              where: {
                tenantId_idempotencyScope_requestIdempotencyKeyHash: {
                  tenantId: s.tenantId,
                  idempotencyScope: scope,
                  requestIdempotencyKeyHash,
                },
              },
              include: { execution: true },
            },
          );
          if (binding) {
            assert.equal(binding.clientId, s.clientId, 'IDEMPOTENCY_CONFLICT');
            assert.equal(
              binding.execution.bookingIntentHash,
              intent,
              'IDEMPOTENCY_CONFLICT',
            );
            return binding.actionExecutionId;
          }
          const data = executionData(s.tenantId, intent);
          const duplicate = await tx.actionExecution.findUnique({
            where: {
              tenantId_identityFingerprint: {
                tenantId: s.tenantId,
                identityFingerprint: data.identityFingerprint,
              },
            },
          });
          const execution =
            duplicate ?? (await tx.actionExecution.create({ data }));
          assert.equal(
            execution.bookingIntentHash,
            intent,
            'IDEMPOTENCY_CONFLICT',
          );
          await tx.actionExecutionIdempotencyBinding.create({
            data: {
              ...s,
              idempotencyScope: scope,
              requestIdempotencyKeyHash,
              actionExecutionId: execution.id,
            },
          });
          return execution.id;
        },
        { timeout: 10_000 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      )
        continue;
      throw error;
    }
  }
  throw new Error('Schema proof transaction retry budget exhausted');
}

async function run() {
  assert.equal(await db.actionExecutionIdempotencyBinding.count(), 0);
  assert.equal(
    await db.actionExecution.count({
      where: { bookingIntentHash: { not: null } },
    }),
    0,
  );
  results.push(
    'empty migration: no fabricated historical bindings/fingerprints',
  );
  if (process.argv.includes('--replay-only')) return;
  const s = await fixture();
  const intent = h([s.tenantId, s.clientId, 'A']);
  const e = await accept(s, 'K1', intent);
  assert.equal(await accept(s, 'K1', intent), e);
  await assert.rejects(accept(s, 'K1', h('changed')), /IDEMPOTENCY_CONFLICT/);
  assert.equal(await accept(s, 'K2', intent), e);
  await assert.rejects(accept(s, 'K2', h('changed')), /IDEMPOTENCY_CONFLICT/);
  assert.equal(
    await db.actionExecution.count({ where: { tenantId: s.tenantId } }),
    1,
  );
  results.push(
    'same/same replay; first and secondary key changed intent conflict with zero new executions',
  );

  const race = await fixture();
  const same = await Promise.all(
    Array.from({ length: 12 }, () =>
      accept(race, 'race-same', h([race, 'same'])),
    ),
  );
  assert.equal(new Set(same).size, 1);
  assert.equal(
    await db.actionExecutionIdempotencyBinding.count({
      where: { tenantId: race.tenantId },
    }),
    1,
  );
  assert.equal(
    await db.actionExecution.count({ where: { tenantId: race.tenantId } }),
    1,
  );
  results.push(
    '12 PostgreSQL concurrent same/same: one durable binding and execution',
  );

  const conflict = await fixture();
  const changed = await Promise.allSettled([
    accept(conflict, 'race-change', h([conflict, 'A'])),
    accept(conflict, 'race-change', h([conflict, 'B'])),
  ]);
  assert.equal(changed.filter((x) => x.status === 'fulfilled').length, 1);
  const rejected = changed.find((x) => x.status === 'rejected');
  assert.ok(
    rejected?.status === 'rejected' &&
      /IDEMPOTENCY_CONFLICT/.test(String(rejected.reason)),
  );
  assert.equal(
    await db.actionExecution.count({ where: { tenantId: conflict.tenantId } }),
    1,
  );
  results.push(
    'PostgreSQL concurrent same/different: one accepted intent and one conflict; loser execution rolled back',
  );

  const other = await fixture();
  await accept(other, 'K1', h([other, 'A'])); // Same raw key in a distinct authorized tenant is another identity.
  await assert.rejects(
    accept({ ...s, clientId: other.clientId }, 'K1', intent),
    /IDEMPOTENCY_CONFLICT/,
  );
  const secondClient = await db.client.create({
    data: { tenantId: s.tenantId },
  });
  await assert.rejects(
    accept({ ...s, clientId: secondClient.id }, 'K1', intent),
    /IDEMPOTENCY_CONFLICT/,
  );
  await assert.rejects(
    db.actionExecutionIdempotencyBinding.create({
      data: {
        ...other,
        actionExecutionId: e,
        idempotencyScope: scope,
        requestIdempotencyKeyHash: h('foreign-execution'),
      },
    }),
  );
  await assert.rejects(
    db.actionExecutionIdempotencyBinding.create({
      data: {
        ...s,
        clientId: secondClient.id,
        actionExecutionId: e,
        idempotencyScope: scope,
        requestIdempotencyKeyHash: h('wrong-client-alias'),
      },
    }),
  );
  results.push(
    'tenant-qualified FK and immutable Client isolation; authorized tenants have independent key namespaces',
  );

  const binding = await db.actionExecutionIdempotencyBinding.findFirstOrThrow({
    where: { actionExecutionId: e },
  });
  const where = {
    tenantId_idempotencyScope_requestIdempotencyKeyHash: {
      tenantId: s.tenantId,
      idempotencyScope: scope,
      requestIdempotencyKeyHash: binding.requestIdempotencyKeyHash,
    },
  };
  await assert.rejects(
    db.actionExecutionIdempotencyBinding.update({
      where,
      data: { clientId: secondClient.id },
    }),
  );
  await assert.rejects(db.actionExecutionIdempotencyBinding.delete({ where }));
  await assert.rejects(
    db.actionExecution.update({
      where: { id: e },
      data: { bookingIntentHash: h('mutated') },
    }),
  );
  await assert.rejects(
    db.actionExecution.update({
      where: { id: e },
      data: { bookingIntentEncrypted: identity.encryptNormalizedPayload('{}') },
    }),
  );
  await assert.rejects(
    db.actionExecution.update({
      where: { id: e },
      data: {
        normalizedInputEncrypted: identity.encryptNormalizedPayload(
          '{"start":"changed"}',
        ),
      },
    }),
  );
  results.push(
    'database guards prohibit key/Client/hash/snapshot rewrite and binding deletion',
  );

  const legacy = await db.actionExecution.create({
    data: executionData(s.tenantId, h('legacy'), true),
  });
  await assert.rejects(
    db.actionExecution.update({
      where: { id: legacy.id },
      data: {
        bookingIntentContract: contract,
        bookingIntentHash: h('fake-backfill'),
        bookingIntentEncrypted: 'fake',
      },
    }),
  );
  assert.equal(
    (await db.actionExecution.findUniqueOrThrow({ where: { id: legacy.id } }))
      .bookingIntentHash,
    null,
  );
  await assert.rejects(
    db.actionExecution.create({
      data: executionData(s.tenantId, h('missing-first-binding')),
    }),
  );
  results.push(
    'legacy unchanged; no fake backfill; deferred constraint rejects execution without first binding',
  );

  const kernel = new ActionEngineKernel(db, {
    identitySecret: 'b31-schema-synthetic-identity'.repeat(3),
    payloadEncryptionSecret: 'b31-schema-synthetic-payload'.repeat(3),
    controlledFixtureMode: true,
  });
  const claim = await kernel.claimExecution({
    tenantId: s.tenantId,
    executionId: e,
    workerId: 'synthetic-b31',
  });
  const owned = {
    tenantId: s.tenantId,
    executionId: e,
    attemptId: claim.attempt.id,
    leaseToken: claim.leaseToken,
  };
  await kernel.markDispatchMayHaveCrossed(owned);
  await kernel.finalizeUnknown({
    ...owned,
    outcomeCode: 'synthetic_unknown',
    errorClass: 'synthetic_timeout',
  });
  await db.$disconnect();
  db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.toString() }),
  });
  assert.equal(await accept(s, 'K1', intent), e);
  await assert.rejects(
    accept(s, 'K1', h('unknown-bypass')),
    /IDEMPOTENCY_CONFLICT/,
  );
  assert.equal(
    (await db.actionExecution.findUniqueOrThrow({ where: { id: e } })).state,
    'UNKNOWN',
  );
  await assert.rejects(
    db.actionExecution.update({
      where: { id: e },
      data: {
        bookingIntentEncrypted: null,
        payloadRetentionUntil: new Date(0),
      },
    }),
  );
  results.push(
    'connection restart preserves same UNKNOWN execution and blocks changed intent/payload cleanup',
  );
  assert.equal(await db.appointment.count(), 0);
}

void run()
  .then(() =>
    console.log(
      JSON.stringify(
        {
          verdict: 'PASS',
          proof: 'schema transaction, not runtime dispatch',
          cases: results,
          fakeBackfill: 0,
          providerWrites: 0,
          productionMutations: 0,
        },
        null,
        2,
      ),
    ),
  )
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
