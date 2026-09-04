import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import {
  ActionApprovalDecision,
  ActionExecutionState,
  ActionPolicyDecision,
  ActionReconciliationState,
  PrismaClient,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '55487' ||
  !url.pathname.startsWith('/maya_c06_wanted_slot_v1_')
)
  throw new Error('Owned isolated B9 schema proof database required');
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }),
});
const hash = (v: unknown) =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex');
const cases: string[] = [];

async function execution(tenantId: string, label: string) {
  const policyEvaluatedAt = new Date();
  return db.actionExecution.create({
    data: {
      tenantId,
      identityVersion: 1,
      identityFingerprint: hash(['wanted-slot', tenantId, label]),
      idempotencyScope: 'package5.b9.schema-proof.v1',
      requestIdempotencyKeyHash: hash(['request', tenantId, label]),
      sourceType: 'authenticated_request',
      sourceRef: `synthetic:${label}`,
      actionClass: 'add_client_wanted_slot',
      capability: 'package5.client-wanted-slot.add.execute.v1',
      capabilityVersion: 1,
      targetKind: 'client_wanted_slot',
      targetRef: `wanted-slot:${hash(label)}`,
      normalizedInputContract: 'maya.client-wanted-slot-input/1',
      normalizedInputHash: hash(['input', label]),
      evidenceRefsJson: [`synthetic:${hash(label)}`],
      riskProfileVersion: 1,
      riskFacetsJson: ['a18', 'ac1', 'local_atomic'],
      policyKey: 'chapter6.package5.client-wanted-slot.add',
      policyVersion: 1,
      policyDecision: ActionPolicyDecision.ALLOW,
      autonomyLevel: 'L3_CANONICAL',
      policyDecidedBy: 'package5-b9-schema-proof',
      policyContextContract: 'maya.action-policy-context/1',
      policyContextHash: hash(['policy', label]),
      policyEvidenceJson: { synthetic: true },
      policyEvaluatedAt,
      policyValidUntil: new Date(policyEvaluatedAt.getTime() + 60 * 60 * 1000),
      approvalRequirement: 'NONE',
      approvalDecision: ActionApprovalDecision.NOT_REQUIRED,
      approvalBindingHash: hash(['approval', label]),
      state: ActionExecutionState.SUCCEEDED,
      retryPolicyKey: 'client-wanted-slot.local-transaction',
      retryPolicyVersion: 1,
      maxExecutionAttempts: 1,
      executionAttemptCount: 1,
      reconciliationPolicyKey: 'client-wanted-slot.not-required',
      reconciliationPolicyVersion: 1,
      reconciliationState: ActionReconciliationState.NOT_REQUIRED,
      transportIdentityVersion: 1,
      transportIdempotencyKey: `synthetic:${hash(['transport', label])}`,
      finalOutcomeCode: 'client_wanted_slot_created',
      firstAttemptedAt: new Date(),
      finalizedAt: new Date(),
    },
  });
}

async function fixture(label: string) {
  const tenantId = randomUUID();
  await db.tenant.create({
    data: { id: tenantId, slug: tenantId, name: `Synthetic ${label}` },
  });
  const branch = await db.branch.create({
    data: { tenantId, name: 'Synthetic branch', timezone: 'Europe/Moscow' },
  });
  const staff = await db.staff.create({
    data: {
      tenantId,
      branchId: branch.id,
      encryptedDisplayName: 'synthetic',
      active: true,
    },
  });
  const client = await db.client.create({ data: { tenantId } });
  const providerSubjectHash = hash([label, 'subject']);
  const verificationIdentityHash = hash([label, 'verification']);
  const evidence = {
    contract: 'a18.client-channel-verification.v1',
    verifier: 'synthetic-b9-schema-proof',
    channelControlProofHash: hash([label, 'channel-control']),
    clientAuthorityProofHash: hash([label, 'client-authority']),
    verificationIdentityHash,
    tenantId,
    provider: 'telegram',
    providerSubjectHash,
    clientId: client.id,
  };
  const link = await db.clientChannelLink.create({
    data: {
      tenantId,
      clientId: client.id,
      provider: 'telegram',
      providerSubjectHash,
      verificationMethod: 'explicit_verified_challenge',
      verificationIdentityHash,
      verificationEvidenceJson: evidence,
      verificationEvidenceHash: hash(evidence),
    },
  });
  return { tenantId, branch, staff, client, link };
}

async function add(
  scope: Awaited<ReturnType<typeof fixture>>,
  label: string,
  start: Date,
) {
  const e = await execution(scope.tenantId, label);
  return db.clientWantedSlotInterest.create({
    data: {
      tenantId: scope.tenantId,
      clientId: scope.client.id,
      branchId: scope.branch.id,
      staffId: scope.staff.id,
      desiredStartAt: start,
      expiresAt: new Date(0),
      matchToleranceMinutes: 99,
      status: 'CANCELLED',
      createdByActionExecutionId: e.id,
      sourceChannelLinkId: scope.link.id,
      terminalAt: new Date(),
    },
  });
}

async function run() {
  assert.equal(await db.clientWantedSlotInterest.count(), 0);
  if (process.argv.includes('--replay-only')) {
    console.log(JSON.stringify({ cleanReplay: 'PASS', backfill: 0 }));
    return;
  }
  const s = await fixture('primary');
  const first = await add(s, 'first', new Date('2040-01-01T10:00:00Z'));
  assert.equal(first.status, 'ACTIVE');
  assert.equal(first.matchToleranceMinutes, 0);
  assert.equal(
    first.expiresAt.toISOString(),
    first.desiredStartAt.toISOString(),
  );
  assert.equal(first.terminalAt, null);
  cases.push(
    'server derives ACTIVE exact-time expiry and clears forged lifecycle input',
  );
  await assert.rejects(add(s, 'duplicate', first.desiredStartAt));
  assert.equal(await db.clientWantedSlotInterest.count(), 1);
  cases.push('duplicate exact interest rejected with no extra row');
  for (let i = 2; i <= 10; i++)
    await add(
      s,
      `cap-${i}`,
      new Date(`2040-01-${String(i).padStart(2, '0')}T10:00:00Z`),
    );
  assert.equal(await db.clientWantedSlotInterest.count(), 10);
  await assert.rejects(
    add(s, 'cap-11', new Date('2040-02-01T10:00:00Z')),
    /CLIENT_WANTED_SLOT_LIMIT_EXCEEDED/,
  );
  assert.equal(await db.clientWantedSlotInterest.count(), 10);
  cases.push('active 1-10 accepted and 11th atomically rejected');
  const c = await fixture('concurrent-cap');
  for (let i = 0; i < 9; i++)
    await add(
      c,
      `base-${i}`,
      new Date(`2041-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`),
    );
  const attempts = await Promise.allSettled(
    Array.from({ length: 4 }, (_, i) =>
      add(
        c,
        `race-${i}`,
        new Date(`2041-02-${String(i + 1).padStart(2, '0')}T10:00:00Z`),
      ),
    ),
  );
  assert.equal(attempts.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(
    await db.clientWantedSlotInterest.count({
      where: { tenantId: c.tenantId, status: 'ACTIVE' },
    }),
    10,
  );
  cases.push('concurrent attempts cannot exceed ten active interests');
  const foreign = await fixture('foreign');
  const e = await execution(s.tenantId, 'cross-tenant');
  await assert.rejects(
    db.clientWantedSlotInterest.create({
      data: {
        tenantId: s.tenantId,
        clientId: foreign.client.id,
        branchId: s.branch.id,
        staffId: s.staff.id,
        desiredStartAt: new Date('2042-01-01T10:00:00Z'),
        expiresAt: new Date(0),
        createdByActionExecutionId: e.id,
        sourceChannelLinkId: s.link.id,
      },
    }),
  );
  cases.push('cross-tenant Client rejected');
  const before = await db.clientWantedSlotInterest.findUniqueOrThrow({
    where: { id: first.id },
  });
  await assert.rejects(
    db.clientWantedSlotInterest.update({
      where: { id: first.id },
      data: { desiredStartAt: new Date('2040-01-01T11:00:00Z') },
    }),
  );
  await assert.rejects(
    db.clientWantedSlotInterest.delete({ where: { id: first.id } }),
  );
  assert.deepEqual(
    await db.clientWantedSlotInterest.findUniqueOrThrow({
      where: { id: first.id },
    }),
    before,
  );
  cases.push('historical facts immutable and physical deletion forbidden');

  const exactStart = new Date('2043-01-01T10:00:00Z');
  const rows = [];
  for (let i = 0; i < 4; i++) {
    // Rebind all synthetic identities to one tenant/branch/staff while retaining distinct Clients.
    const client = await db.client.create({ data: { tenantId: s.tenantId } });
    const providerSubjectHash = hash(['match-subject', i]);
    const verificationIdentityHash = hash(['match-verification', i]);
    const evidence = {
      contract: 'a18.client-channel-verification.v1',
      verifier: 'synthetic-b9-schema-proof',
      channelControlProofHash: hash(['match-channel', i]),
      clientAuthorityProofHash: hash(['match-authority', i]),
      verificationIdentityHash,
      tenantId: s.tenantId,
      provider: 'telegram',
      providerSubjectHash,
      clientId: client.id,
    };
    const link = await db.clientChannelLink.create({
      data: {
        tenantId: s.tenantId,
        clientId: client.id,
        provider: 'telegram',
        providerSubjectHash,
        verificationMethod: 'explicit_verified_challenge',
        verificationIdentityHash,
        verificationEvidenceJson: evidence,
        verificationEvidenceHash: hash(evidence),
      },
    });
    const scoped = { ...s, client, link };
    rows.push(await add(scoped, `match-row-${i}`, exactStart));
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  const ordered = await db.clientWantedSlotInterest.findMany({
    where: { id: { in: rows.map((x) => x.id) } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const event = 'synthetic-availability-event';
  for (const row of ordered.slice(0, 3))
    await db.clientWantedSlotInterest.update({
      where: { id: row.id },
      data: {
        status: 'MATCHED',
        matchedSourceEventId: event,
        matchedAt: new Date(),
      },
    });
  await assert.rejects(
    db.clientWantedSlotInterest.update({
      where: { id: ordered[3].id },
      data: {
        status: 'MATCHED',
        matchedSourceEventId: event,
        matchedAt: new Date(),
      },
    }),
    /WANTED_SLOT_MATCH_FAN_OUT_EXCEEDED/,
  );
  assert.equal(
    await db.clientWantedSlotInterest.count({
      where: { matchedSourceEventId: event },
    }),
    3,
  );
  cases.push(
    'deterministic earliest ordering and max three match fan-out enforced',
  );
  const mismatched = await add(
    {
      ...s,
      client: await db.client.create({ data: { tenantId: s.tenantId } }),
      link: s.link,
    },
    'mismatched-link',
    new Date('2043-01-01T10:01:00Z'),
  ).catch(() => null);
  assert.equal(mismatched, null);
  assert.equal(await db.clientConsentFact.count(), 0);
  cases.push(
    'creation produces no consent fact and heuristic cross-Client binding fails',
  );
  console.log(
    JSON.stringify({
      schemaProof: 'PASS',
      passed: cases.length,
      cases,
      backfill: 0,
      productionBusinessProviderMutations: 0,
    }),
  );
}
run()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
