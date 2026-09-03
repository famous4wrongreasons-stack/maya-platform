import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';

import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import {
  WAVE6_CLASSES,
  Wave6Class,
} from '../src/package5-wave6/package5-wave6.policy';
import { Package5Wave6MaintenanceService } from '../src/package5-wave6/package5-wave6.service';

const DAY = 86_400_000;
const BASE = new Date('2026-09-04T02:00:00.000Z');
let clock = new Date(BASE);
const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '55486' ||
  !url.pathname.startsWith('/maya_c06_p5_wave6_')
) {
  throw new Error('Wave 6 proof refuses a non-owned disposable database');
}
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }),
});
const context = new TenantContextService();
const service = () =>
  new Package5Wave6MaintenanceService(
    prisma as unknown as PrismaService,
    context,
    () => clock,
  );
const platform = () =>
  new Package5Wave6MaintenanceService(
    prisma as unknown as PrismaService,
    undefined,
    () => clock,
  );
const inTenant = <T>(tenantId: string, run: () => T) =>
  context.runAsSystemTenant(tenantId, run);
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const failures: string[] = [];
async function rejects(fn: () => Promise<unknown>, label: string) {
  let failed = false;
  try {
    await fn();
  } catch {
    failed = true;
  }
  assert(failed, label);
  failures.push(label);
}
const tables = Object.values(WAVE6_CLASSES).map((r) => r.table);
const tableSql = (table: string) => {
  assert([...tables, 'AuthRefreshToken'].includes(table));
  return Prisma.raw(`"${table}"`);
};
async function exists(table: string, id: string) {
  const rows = await prisma.$queryRaw<Array<{ n: number }>>(
    Prisma.sql`SELECT count(*)::int n FROM ${tableSql(table)} WHERE "id"=${id}`,
  );
  return rows[0].n === 1;
}
async function scope(label: string) {
  const id = `p5w6_${label}_${randomUUID()}`;
  await prisma.tenant.create({ data: { id, name: 'Wave 6 proof', slug: id } });
  const user = await prisma.user.create({
    data: {
      tenantId: id,
      email: `${id}@proof.invalid`,
      passwordHash: 'not-real',
      role: 'tenant_owner',
      memberships: {
        create: { tenantId: id, role: 'tenant_owner', status: 'active' },
      },
    },
  });
  return { tenantId: id, userId: user.id };
}
type Scope = Awaited<ReturnType<typeof scope>>;
async function fixture(
  action: Wave6Class,
  owner: Scope,
  label: string,
  expiry: Date,
  terminal?: Date,
) {
  const id = `p5w6_${label}_${randomUUID()}`;
  const createdAt = new Date(BASE.getTime() - 100 * DAY);
  const shared = { id, tenantId: owner.tenantId, expiresAt: expiry, createdAt };
  switch (action) {
    case 'purge_auth_sessions':
      await prisma.authSession.create({
        data: {
          ...shared,
          userId: owner.userId,
          deviceLabel: 'proof',
          revokedAt: terminal,
        },
      });
      break;
    case 'purge_phone_auth_codes':
      await prisma.phoneAuthCode.create({
        data: {
          ...shared,
          phone: `synthetic-phone-${id}`,
          codeHash: 'synthetic-code-hash',
          consumedAt: terminal,
        },
      });
      break;
    case 'purge_email_auth_codes':
      await prisma.emailAuthCode.create({
        data: {
          ...shared,
          email: `${id}@proof.invalid`,
          codeHash: 'synthetic-code-hash',
          consumedAt: terminal,
        },
      });
      break;
    case 'purge_auth_flow_states':
      await prisma.authFlowState.create({
        data: {
          ...shared,
          provider: 'synthetic',
          state: `synthetic-secret-${id}`,
          redirectUri: 'https://proof.invalid',
          consumedAt: terminal,
        },
      });
      break;
    case 'purge_auth_rate_limit_buckets':
      await prisma.authRateLimitBucket.create({
        data: {
          id,
          tenantId: owner.tenantId,
          createdAt,
          policyKey: 'proof',
          action: 'proof',
          scope: 'identity',
          subjectHash: hash(id),
          windowStartedAt: createdAt,
          windowEndsAt: expiry,
        },
      });
      break;
    case 'purge_ingestion_quarantine':
      await prisma.ingestionQuarantine.create({
        data: {
          id,
          tenantId: owner.tenantId,
          receivedAt: createdAt,
          source: 'proof',
          fingerprint: hash(id),
          reason: 'synthetic',
          expiresAt: expiry,
        },
      });
      break;
  }
  return { id, stamp: createdAt, table: WAVE6_CLASSES[action].table };
}
async function token(sessionId: string) {
  return prisma.authRefreshToken.create({
    data: {
      id: randomUUID(),
      sessionId,
      tokenHash: hash(randomUUID()),
      expiresAt: new Date(BASE.getTime() - 40 * DAY),
      consumedAt: new Date(BASE.getTime() - 41 * DAY),
      createdAt: new Date(BASE.getTime() - 50 * DAY),
    },
  });
}
async function allSettledValues<T>(promises: Promise<T>[]): Promise<T[]> {
  const settled = await Promise.allSettled(promises);
  const failure = settled.find((value) => value.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
  return settled.map((value) => (value as PromiseFulfilledResult<T>).value);
}

async function main() {
  const a = await scope('a');
  const b = await scope('b');
  let shadowClasses = 0;
  const protectedRows: Array<{ table: string; id: string }> = [];
  const foreignRows: Array<{ table: string; id: string }> = [];
  for (const action of Object.keys(WAVE6_CLASSES) as Wave6Class[]) {
    const rule = WAVE6_CLASSES[action];
    // Independent golden cutoff: no production predicate/selection helper is used.
    const duration =
      action === 'purge_auth_sessions'
        ? 30 * DAY
        : action === 'purge_ingestion_quarantine'
          ? 0
          : DAY;
    const cutoff = new Date(BASE.getTime() - duration);
    const expired = await fixture(
      action,
      a,
      'expired',
      new Date(cutoff.getTime() - 1),
    );
    const active = await fixture(
      action,
      a,
      'active-old-created',
      new Date(BASE.getTime() + DAY),
    );
    const boundary = await fixture(action, a, 'exact-boundary', cutoff);
    const recent = await fixture(
      action,
      a,
      'inside-window',
      new Date(cutoff.getTime() + 1),
    );
    protectedRows.push(active, boundary, recent);
    foreignRows.push(
      await fixture(
        action,
        b,
        'foreign-expired',
        new Date(cutoff.getTime() - 1),
      ),
    );
    const expected: Array<{ itemKind: string; id: string; stamp: Date }> = [
      { itemKind: rule.table, id: expired.id, stamp: expired.stamp },
    ];
    if (rule.terminal) {
      const terminal = await fixture(
        action,
        a,
        'approved-terminal',
        new Date(BASE.getTime() + DAY),
        new Date(cutoff.getTime() - 1),
      );
      expected.push({
        itemKind: rule.table,
        id: terminal.id,
        stamp: terminal.stamp,
      });
      protectedRows.push(
        await fixture(
          action,
          a,
          'terminal-boundary',
          new Date(BASE.getTime() + DAY),
          cutoff,
        ),
      );
      protectedRows.push(
        await fixture(
          action,
          a,
          'recent-terminal',
          new Date(BASE.getTime() + DAY),
          new Date(cutoff.getTime() + 1),
        ),
      );
    }
    if (action === 'purge_auth_sessions') {
      const child = await token(expired.id);
      expected.push({
        itemKind: 'AuthRefreshToken',
        id: child.id,
        stamp: child.createdAt,
      });
      const liveHistory = await token(active.id);
      protectedRows.push({ table: 'AuthRefreshToken', id: liveHistory.id });
    }
    await inTenant(a.tenantId, async () => {
      const before = await prisma.maintenanceRun.count();
      const request = { actionClass: action, batchSize: 20 };
      const shadow = await service().shadow(request);
      assert.equal(shadow.cutoffAt.toISOString(), cutoff.toISOString());
      assert.deepEqual(
        shadow.items.map((i) => `${i.itemKind}/${i.itemRefHash}`).sort(),
        expected
          .map(
            (i) =>
              `${i.itemKind}/${hash(`${shadow.runIdentity}/${i.itemKind}/${i.id}/${i.stamp.getTime()}`)}`,
          )
          .sort(),
      );
      assert.equal(
        await prisma.maintenanceRun.count(),
        before,
        'Shadow writes no envelope',
      );
      assert.equal(
        await exists(rule.table, expired.id),
        true,
        'Shadow deletes nothing',
      );
      shadowClasses++;
      const [runId, sameId] = await allSettledValues([
        service().prepare(request),
        service().prepare(request),
      ]);
      assert.equal(
        runId,
        sameId,
        'concurrent deterministic prepare has one run',
      );
      assert.equal(
        await service().prepare(request),
        runId,
        'restart plan reuses same run',
      );
      const durable = await prisma.maintenanceRun.findUniqueOrThrow({
        where: { id: runId },
        include: { itemClaims: true },
      });
      assert.equal(durable.state, 'PLANNED');
      assert.equal(durable.itemClaims.length, expected.length);
      assert.equal(durable.cursorHash, shadow.manifestHash);
      await rejects(
        () =>
          prisma.maintenanceRun.update({
            where: { id: runId },
            data: { policyVersion: 2 },
          }),
        'immutable policy version',
      );
      await rejects(
        () =>
          prisma.maintenanceRun.update({
            where: { id: runId },
            data: { cutoffAt: BASE },
          }),
        'immutable cutoff',
      );
      const results = await allSettledValues([
        service().execute(runId),
        service().execute(runId),
      ]);
      assert.equal(
        results.filter((r) => !r.replayed).length,
        1,
        'one lease winner',
      );
      const result = await service().result(runId);
      assert.equal(result.state, 'SUCCEEDED');
      assert.equal(result.deleted, expected.length);
      assert.equal(
        (await service().execute(runId)).replayed,
        true,
        'terminal replay does not delete',
      );
      assert.equal(await exists(rule.table, expired.id), false);
      const claim = await prisma.maintenanceItemClaim.findFirstOrThrow({
        where: { maintenanceRunId: runId },
      });
      await rejects(
        () =>
          prisma.maintenanceItemClaim.update({
            where: { id: claim.id },
            data: { outcomeCode: 'rewritten' },
          }),
        'terminal item immutable',
      );
      await rejects(
        () => prisma.maintenanceRun.delete({ where: { id: runId } }),
        'run audit survives',
      );
      await inTenant(b.tenantId, () =>
        rejects(
          () => service().execute(runId),
          'foreign tenant cannot resume run',
        ),
      );
      await rejects(
        () => platform().execute(runId),
        'platform handle cannot silently widen tenant run',
      );
    });
  }
  for (const row of [...protectedRows, ...foreignRows])
    assert(
      await exists(row.table, row.id),
      `protected row retained: ${row.table}`,
    );
  for (const key of [
    'cutoffAt',
    'now',
    'tenantId',
    'scope',
    'policyVersion',
    'retentionMs',
    'predicate',
    'targetIds',
    'maxItems',
  ]) {
    await rejects(
      () =>
        service().prepare({
          actionClass: 'purge_auth_sessions',
          [key]: 'forged',
        }),
      `payload rejects ${key}`,
    );
  }
  await context.runAsAuthPrincipal(
    { tenantId: a.tenantId, userId: a.userId, role: 'tenant_owner' },
    () =>
      rejects(
        () => service().prepare({ actionClass: 'purge_auth_sessions' }),
        'tenant human not system authority',
      ),
  );
  await rejects(
    () => service().prepare({ actionClass: 'purge_clients' }),
    'broader cleanup denied',
  );

  await inTenant(a.tenantId, async () => {
    clock = new Date(clock.getTime() + 60_000);
    const row = await fixture(
      'purge_email_auth_codes',
      a,
      'restart',
      new Date(BASE.getTime() - 2 * DAY),
    );
    const run = await service().prepare({
      actionClass: 'purge_email_auth_codes',
      batchSize: 20,
    });
    const oldLease = await service().claim(run);
    assert(oldLease);
    await rejects(
      () => service().commit({ runId: run, token: 'forged' }),
      'unforgeable worker fence',
    );
    assert.equal(
      await service().claim(run),
      null,
      'live lease excludes second worker',
    );
    clock = new Date(clock.getTime() + 61_000);
    assert.equal(
      await service().prepare({
        actionClass: 'purge_email_auth_codes',
        batchSize: 20,
      }),
      run,
      'restart initiator resumes frozen earlier-window run',
    );
    const restoredShadow = await service().shadow({
      actionClass: 'purge_email_auth_codes',
      batchSize: 20,
    });
    assert.equal(
      restoredShadow.runIdentity,
      (await prisma.maintenanceRun.findUniqueOrThrow({ where: { id: run } }))
        .runIdentityFingerprint,
    );
    const newLease = await service().claim(run);
    assert(newLease);
    await rejects(
      () => service().commit(oldLease),
      'expired owner fenced after takeover',
    );
    await service().commit(newLease);
    assert.equal(await exists('EmailAuthCode', row.id), false);
    const claims = await prisma.maintenanceItemClaim.findMany({
      where: { maintenanceRunId: run },
    });
    assert(claims.every((c) => c.claimGeneration === 1));

    clock = new Date(clock.getTime() + 60_000);
    const crashRow = await fixture(
      'purge_phone_auth_codes',
      a,
      'atomic-crash',
      new Date(BASE.getTime() - 2 * DAY),
    );
    const crashRun = await service().prepare({
      actionClass: 'purge_phone_auth_codes',
      batchSize: 20,
    });
    const crashLease = await service().claim(crashRun);
    assert(crashLease);
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION wave6_proof_abort_outcome() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected proof crash after delete before outcome'; END $$`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER wave6_proof_abort_outcome BEFORE UPDATE ON "MaintenanceItemClaim" FOR EACH ROW WHEN (NEW.state <> 'CLAIMED') EXECUTE FUNCTION wave6_proof_abort_outcome()`,
    );
    await rejects(
      () => service().commit(crashLease),
      'rollback after deletion before audit',
    );
    assert(await exists('PhoneAuthCode', crashRow.id));
    assert.equal(
      (
        await prisma.maintenanceRun.findUniqueOrThrow({
          where: { id: crashRun },
        })
      ).succeededCount,
      0,
    );
    assert.equal(
      await prisma.maintenanceItemClaim.count({
        where: { maintenanceRunId: crashRun, state: { not: 'CLAIMED' } },
      }),
      0,
    );
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER wave6_proof_abort_outcome ON "MaintenanceItemClaim"',
    );
    await prisma.$executeRawUnsafe('DROP FUNCTION wave6_proof_abort_outcome()');
    clock = new Date(clock.getTime() + 61_000);
    await service().execute(crashRun);
    assert.equal(await exists('PhoneAuthCode', crashRow.id), false);

    clock = new Date(clock.getTime() + 60_000);
    const shared = await fixture(
      'purge_auth_flow_states',
      a,
      'overlap',
      new Date(BASE.getTime() - 2 * DAY),
    );
    const first = await service().prepare({
      actionClass: 'purge_auth_flow_states',
      batchSize: 20,
    });
    clock = new Date(clock.getTime() + 60_000);
    const second = await platform().prepare({
      actionClass: 'purge_auth_flow_states',
      batchSize: 20,
    });
    assert.notEqual(first, second, 'independent tenant/platform runs overlap');
    const overlapping = await allSettledValues([
      service().execute(first),
      platform().execute(second),
    ]);
    // Other fixtures may newly cross their exact boundary as the server clock advances;
    // this specific target must have one successful outcome across both runs.
    const outcomes = await prisma.maintenanceItemClaim.findMany({
      where: { maintenanceRunId: { in: [first, second] }, state: 'SUCCEEDED' },
    });
    const runRows = await prisma.maintenanceRun.findMany({
      where: { id: { in: [first, second] } },
    });
    const targetHashes = runRows.map((r) =>
      hash(
        `${r.runIdentityFingerprint}/AuthFlowState/${shared.id}/${shared.stamp.getTime()}`,
      ),
    );
    assert.equal(
      outcomes.filter((c) => targetHashes.includes(c.itemRefHash)).length,
      1,
    );
    assert(overlapping.every((r) => r.state === 'SUCCEEDED'));
    assert.equal(await exists('AuthFlowState', shared.id), false);

    clock = new Date(clock.getTime() + 60_000);
    const renewal = await fixture(
      'purge_email_auth_codes',
      a,
      'renewed',
      new Date(BASE.getTime() - 2 * DAY),
    );
    const renewalRun = await service().prepare({
      actionClass: 'purge_email_auth_codes',
      batchSize: 20,
    });
    await prisma.emailAuthCode.update({
      where: { id: renewal.id },
      data: { expiresAt: new Date(clock.getTime() + DAY), consumedAt: null },
    });
    await service().execute(renewalRun);
    assert(
      await exists('EmailAuthCode', renewal.id),
      'renewed target rechecked under lock',
    );

    const cascadeRow = await fixture(
      'purge_auth_sessions',
      a,
      'cascade-changed',
      new Date(BASE.getTime() - 40 * DAY),
    );
    const cascadeRun = await service().prepare({
      actionClass: 'purge_auth_sessions',
      batchSize: 20,
    });
    const extra = await token(cascadeRow.id);
    await rejects(
      () => service().execute(cascadeRun),
      'unclaimed cascade is forbidden',
    );
    assert(await exists('AuthSession', cascadeRow.id));
    assert(await exists('AuthRefreshToken', extra.id));
    clock = new Date(clock.getTime() + 61_000);
    // Undo only the injected synthetic concurrent token, then resume the frozen run.
    await prisma.authRefreshToken.delete({ where: { id: extra.id } });
    assert.equal(
      await service().prepare({
        actionClass: 'purge_auth_sessions',
        batchSize: 20,
      }),
      cascadeRun,
    );
    await service().execute(cascadeRun);
    assert.equal(await exists('AuthSession', cascadeRow.id), false);
    const large = await fixture(
      'purge_auth_sessions',
      a,
      'oversized',
      new Date(BASE.getTime() - 40 * DAY),
    );
    await token(large.id);
    await token(large.id);
    await rejects(
      () =>
        service().prepare({ actionClass: 'purge_auth_sessions', batchSize: 2 }),
      'physical cascade fits run cap',
    );
    assert(await exists('AuthSession', large.id));
  });

  // Platform scope explicitly includes legitimate null-tenant protocol rows.
  await prisma.ingestionQuarantine.create({
    data: {
      id: 'null-tenant-proof',
      source: 'proof',
      fingerprint: hash('null-tenant-proof'),
      reason: 'tenant_unresolved',
      expiresAt: new Date(BASE.getTime() - DAY),
    },
  });
  const platformRun = await platform().prepare({
    actionClass: 'purge_ingestion_quarantine',
    batchSize: 100,
  });
  await inTenant(a.tenantId, () =>
    rejects(
      () => service().execute(platformRun),
      'tenant cannot resume platform envelope',
    ),
  );
  await platform().execute(platformRun);
  assert.equal(await exists('IngestionQuarantine', 'null-tenant-proof'), false);
  const runs = await prisma.maintenanceRun.findMany({
    include: { itemClaims: true },
  });
  for (const run of runs) {
    assert.equal(run.policyVersion, 1);
    assert.equal(run.actionExecutionId, null);
    assert(run.attemptedCount <= run.maxItems);
    assert(run.itemClaims.length <= run.maxItems);
    for (const claim of run.itemClaims)
      assert.match(claim.itemRefHash, /^[0-9a-f]{64}$/);
  }
  const audit = JSON.stringify(runs);
  for (const forbidden of [
    'synthetic-phone',
    '@proof.invalid',
    'synthetic-secret',
    'synthetic-code-hash',
    'tokenHash',
    'redirectUri',
  ])
    assert(!audit.includes(forbidden), `no raw PII in audit: ${forbidden}`);
  assert.equal(
    await prisma.actionExecution.count(),
    0,
    'AC6 must not fabricate ActionExecution',
  );
  assert.equal(await prisma.clientConsentFact.count(), 0);
  assert.equal(await prisma.domainEvent.count(), 0);
  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        shadowActionClasses: `${shadowClasses}/6`,
        shadowDivergences: 0,
        negativeAssertions: failures.length,
        durableRuns: runs.length,
        concurrentPrepare: 'ONE RUN',
        sameRunLease: 'ONE WINNER',
        crossRunDelete: 'ONE EFFECT',
        crashRollback: 'PASS',
        restartFence: 'PASS',
        terminalAndBoundaryProtection: 'PASS',
        cascadeBound: 'PASS',
        tenantIsolation: 'PASS',
        immutableAudit: 'PASS',
        rawPiiInAudit: 0,
        fabricatedActionExecutions: 0,
        productionBusinessProviderMutations: 0,
      },
      null,
      2,
    ),
  );
}
main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
