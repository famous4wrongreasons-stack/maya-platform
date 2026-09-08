import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import { MeasurementService } from '../src/measurement/measurement.service';
import { MeasurementSources } from '../src/measurement/measurement.sources';
import {
  MeasurementIntent,
  MEASUREMENT_RETENTION_MS,
  measurementHash,
} from '../src/measurement/measurement.contract';
import { Package5Wave6MaintenanceService } from '../src/package5-wave6/package5-wave6.service';
const url = new URL(process.env.DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55517');
assert.equal(url.pathname, '/maya_c7_replay');
assert.equal(url.username, 'maya_c7');
const db = new PrismaService(
  new ConfigService({ DATABASE_URL: url.toString() }),
);
const context = new TenantContextService();
const readRevision = (id: string) =>
  db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
    return tx.measurementRevision.findUnique({ where: { id } });
  });
const make = () =>
  new MeasurementService(db, context, new MeasurementSources(db));
let owner = make();
const checks: string[] = [];
async function proof(name: string, run: () => unknown) {
  await run();
  checks.push(name);
  console.log('PASS ' + name);
}
async function main() {
  await db.$connect();
  const baselineTenants = await db.tenant.count();
  const tenant = await db.tenant.create({
    data: {
      name: 'C7 synthetic',
      slug: randomUUID(),
      status: 'active',
      calendarSource: 'internal',
    },
  });
  const other = await db.tenant.create({
    data: {
      name: 'C7 unrelated synthetic',
      slug: randomUUID(),
      status: 'active',
    },
  });
  const client = await db.client.create({ data: { tenantId: tenant.id } });
  const wrongClient = await db.client.create({ data: { tenantId: tenant.id } });
  const foreign = await db.client.create({ data: { tenantId: other.id } });
  const date = new Date(Date.now() - 86400000),
    end = new Date(date.getTime() + 3600000);
  const appointment = await db.appointment.create({
    data: {
      tenantId: tenant.id,
      mayaClientId: client.id,
      source: 'internal',
      staffExternalId: 'proof-only',
      serviceIds: ['proof-service'],
      startAt: date,
      endAt: end,
      blockedStartAt: date,
      blockedEndAt: end,
      attendance: 'arrived',
      totalPriceKopecks: 10000,
      currency: 'RUB',
    },
  });
  const intent: MeasurementIntent = {
    kind: 'appointment_outcome',
    clientId: client.id,
    appointmentId: appointment.id,
    periodFrom: new Date(date.getTime() - 86400000),
    periodTo: new Date(end.getTime() + 86400000),
    timezone: 'UTC',
    asOf: new Date(),
    scope: {
      version: 1,
      capabilityKey: 'measurement.read',
      branchIds: [],
      dimensions: {},
      sourceQuery: {},
    },
  };
  const system = <T>(run: () => T) => context.runAsSystemTenant(tenant.id, run);
  const occurrence = {
    namespace: 'measurement_request' as const,
    id: randomUUID(),
  };
  await proof('no request principal admission', () =>
    assert.rejects(() => owner.admit(intent, occurrence)),
  );
  await proof('cross tenant Client denied', () =>
    system(() =>
      assert.rejects(() =>
        owner.admit({ ...intent, clientId: foreign.id }, occurrence),
      ),
    ),
  );
  await proof('same tenant wrong Client denied', () =>
    system(() =>
      assert.rejects(() =>
        owner.admit({ ...intent, clientId: wrongClient.id }, occurrence),
      ),
    ),
  );
  await proof(
    'cross-scope branch/Staff/configuration rejected before admission',
    async () => {
      for (const delta of [
        { branchId: randomUUID() },
        { staffId: randomUUID() },
        { configurationUserId: randomUUID() },
      ])
        await assert.rejects(() =>
          system(() => owner.admit({ ...intent, ...delta }, occurrence)),
        );
    },
  );
  await proof('unknown bridge event cannot become admission authority', () =>
    system(() =>
      assert.rejects(
        () =>
          owner.admit(intent, { namespace: 'source_event', id: randomUUID() }),
        /event_not_owned/,
      ),
    ),
  );
  await proof('reject creates no revision / execution', async () => {
    assert.equal(await db.measurementRevision.count(), 0);
    assert.equal(await db.actionExecution.count(), 0);
  });
  const receipts = await system(() =>
    Promise.all(
      Array.from({ length: 8 }, () => owner.admit(intent, occurrence)),
    ),
  );
  const first = receipts[0];
  await proof('eight concurrent admissions converge', async () => {
    assert.equal(new Set(receipts.map((r) => r.id)).size, 1);
    assert.equal(await db.measurementRevision.count(), 1);
  });
  await proof('UTC roundtrip under a non-UTC PostgreSQL server', async () => {
    const [zone] = await db.$queryRaw<
      Array<{ TimeZone: string }>
    >`SHOW TIME ZONE`;
    assert.equal(zone.TimeZone, 'Europe/Moscow');
    assert.equal(first.asOf.getTime(), intent.asOf.getTime());
    assert.equal(first.periodFrom.getTime(), intent.periodFrom.getTime());
    assert.ok(Math.abs(first.admittedAt.getTime() - Date.now()) < 10000);
  });
  await proof('Client without Maya User', () => {
    assert.equal(client.userId, null);
    assert.equal(first.clientId, client.id);
  });
  await proof('same key changed intent conflicts', () =>
    system(() =>
      assert.rejects(
        () =>
          owner.admit(
            { ...intent, asOf: new Date(intent.asOf.getTime() - 1000) },
            occurrence,
          ),
        /idempotency_conflict/,
      ),
    ),
  );
  await proof('different occurrence cannot bypass pending', () =>
    system(() =>
      assert.rejects(
        () => owner.admit(intent, { ...occurrence, id: randomUUID() }),
        /refresh_pending/,
      ),
    ),
  );
  const leases = await system(() =>
    Promise.all([owner.claim(first.id), owner.claim(first.id)]),
  );
  const lease = leases.find(Boolean)!;
  await proof('concurrent claims one winner', () =>
    assert.equal(leases.filter(Boolean).length, 1),
  );
  await proof('forged claim fenced', () =>
    system(() =>
      assert.rejects(
        () => owner.compute({ ...lease, token: randomUUID() }),
        /fenced/,
      ),
    ),
  );
  await proof('revocation after claim forbids publication', async () => {
    await db.tenant.update({
      where: { id: tenant.id },
      data: { status: 'suspended' },
    });
    await assert.rejects(() => system(() => owner.compute(lease)), /inactive/);
    assert.equal((await readRevision(first.id))?.state, 'PENDING');
    await assert.rejects(
      () =>
        db.measurementRevision.update({
          where: { id: first.id },
          data: { leaseGeneration: lease.generation + 1 },
        }),
      /authority revoked/,
    );
    await db.tenant.update({
      where: { id: tenant.id },
      data: { status: 'active' },
    });
  });
  owner = make();
  const published = await system(() => owner.compute(lease));
  await proof('restart after claim preserves execution', () => {
    assert.equal(published.id, first.id);
    assert.equal(published.state, 'PUBLISHED');
  });
  await proof('published retry immutable', async () =>
    assert.deepEqual(await system(() => owner.resume(first.id)), published),
  );
  await proof('qualified source does not invent cash or credit', () => {
    assert.equal(published.qualification, 'VERIFIED');
    assert.equal(published.attributionStatus, 'UNATTRIBUTED');
    assert.equal(published.creditedExecutionId, null);
    const metrics = (
      published.valuesJson as {
        metrics: Array<{ key: string; value: unknown }>;
      }
    ).metrics;
    assert.equal(metrics.find((m) => m.key === 'confirmed_cash')?.value, null);
  });
  await proof('365 days from admission', () =>
    assert.equal(
      published.expiresAt.getTime() - published.admittedAt.getTime(),
      MEASUREMENT_RETENTION_MS,
    ),
  );
  await proof('snapshot update denied', () =>
    assert.rejects(() =>
      db.measurementRevision.update({
        where: { id: first.id },
        data: { snapshotHash: 'b'.repeat(64) },
      }),
    ),
  );
  await proof('expiry extension denied', () =>
    assert.rejects(() =>
      db.measurementRevision.update({
        where: { id: first.id },
        data: { expiresAt: new Date(first.expiresAt.getTime() + 1) },
      }),
    ),
  );
  const historyIntent: MeasurementIntent = {
    ...intent,
    kind: 'client_history',
    appointmentId: null,
  };
  await proof(
    'Client history records arrived facts without pretending complete coverage',
    async () => {
      const receipt = await system(() =>
        owner.admit(historyIntent, { ...occurrence, id: randomUUID() }),
      );
      const snapshot = await system(() => owner.resume(receipt.id));
      const metrics = (
        snapshot.valuesJson as {
          metrics: Array<{ key: string; value: unknown }>;
        }
      ).metrics;
      assert.equal(
        metrics.find((m) => m.key === 'observed_attended_visits')?.value,
        '1',
      );
      assert.equal(
        metrics.find((m) => m.key === 'last_proven_visit')?.value,
        date.toISOString(),
      );
      assert.equal(snapshot.completeness, 'PARTIAL');
    },
  );
  await proof(
    'large history retains bounded query evidence and exact last visit',
    async () => {
      await db.appointment.createMany({
        data: Array.from({ length: 1100 }, (_, n) => {
          const startAt = new Date(date.getTime() + (n + 1) * 1000),
            endAt = new Date(startAt.getTime() + 3600000);
          return {
            tenantId: tenant.id,
            mayaClientId: client.id,
            source: 'internal',
            staffExternalId: 'c7-bulk-proof-' + n,
            serviceIds: ['synthetic'],
            startAt,
            endAt,
            blockedStartAt: startAt,
            blockedEndAt: endAt,
            attendance: 'arrived',
            currency: 'RUB',
          };
        }),
      });
      const receipt = await system(() =>
        owner.admit(historyIntent, { ...occurrence, id: randomUUID() }),
      );
      const snapshot = await system(() => owner.resume(receipt.id));
      const metrics = (
        snapshot.valuesJson as {
          metrics: Array<{ key: string; value: unknown }>;
        }
      ).metrics;
      assert.equal(
        metrics.find((m) => m.key === 'observed_attended_visits')?.value,
        '1101',
      );
      assert.equal(
        metrics.find((m) => m.key === 'last_proven_visit')?.value,
        new Date(date.getTime() + 1100000).toISOString(),
      );
      assert.equal(
        (snapshot.evidenceRefsJson as { sources: unknown[] }).sources.length,
        1,
      );
      assert.ok(
        Buffer.byteLength(JSON.stringify(snapshot.evidenceRefsJson)) < 2048,
      );
      assert.equal(snapshot.completeness, 'PARTIAL');
    },
  );
  await proof('unknown last visit is not dormant', async () => {
    const receipt = await system(() =>
      owner.admit(
        { ...historyIntent, clientId: wrongClient.id },
        { ...occurrence, id: randomUUID() },
      ),
    );
    const snapshot = await system(() => owner.resume(receipt.id));
    const metrics = (
      snapshot.valuesJson as { metrics: Array<{ key: string; value: unknown }> }
    ).metrics;
    assert.equal(
      metrics.find((m) => m.key === 'last_proven_visit')?.value,
      null,
    );
    assert.equal(
      metrics.some((m) => /dormant|loyal|clv|score/.test(m.key)),
      false,
    );
  });
  // Synthetic source-owner fixture advances evidence; never production.
  await db.appointment.update({
    where: { id: appointment.id },
    data: { status: 'cancelled', attendance: 'no_show' },
  });
  const second = await system(() =>
    owner.admit(
      { ...intent, asOf: new Date() },
      { ...occurrence, id: randomUUID() },
    ),
  );
  const secondLease = (await system(() => owner.claim(second.id)))!;
  const counterfeitPublish = (delta: Record<string, unknown>) =>
    db.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
      await tx.$queryRaw`SELECT set_config('maya.c7.claim_token',${secondLease.token},true)`;
      const data = {
        state: 'PUBLISHED',
        publishedAt: new Date(),
        leaseTokenHash: null,
        leaseExpiresAt: null,
        evidenceHash: published.evidenceHash!,
        snapshotHash: published.snapshotHash!,
        completeness: published.completeness!,
        qualification: published.qualification!,
        evidenceRefsJson: published.evidenceRefsJson!,
        valuesJson: published.valuesJson!,
        limitationsJson: published.limitationsJson!,
        attributionStatus: 'UNATTRIBUTED',
        ...delta,
      };
      return tx.measurementRevision.update({ where: { id: second.id }, data });
    });
  await proof(
    'SQL publication rejects cross-tenant evidence despite valid fence',
    () =>
      assert.rejects(
        () =>
          counterfeitPublish({
            evidenceRefsJson: {
              version: 1,
              sources: [{ tenantId: other.id }],
              dependencies: [],
            },
          }),
        /evidence tenant mismatch/,
      ),
  );
  await proof(
    'SQL publication refuses invented execution / attempt credit',
    () =>
      assert.rejects(
        () =>
          counterfeitPublish({
            attributionStatus: 'ATTRIBUTED',
            creditedExecutionId: randomUUID(),
            creditedAttemptId: randomUUID(),
          }),
        /confirmed effect receipt required/,
      ),
  );
  await proof('SQL dependency must pin exact existing snapshot', () =>
    assert.rejects(
      () =>
        counterfeitPublish({
          evidenceRefsJson: {
            version: 1,
            sources: [],
            dependencies: [
              {
                id: first.id,
                identityHash: first.identityHash,
                snapshotHash: 'f'.repeat(64),
                asOf: first.asOf.toISOString(),
                expiresAt: first.expiresAt.toISOString(),
              },
            ],
          },
        }),
      /dependency snapshot mismatch/,
    ),
  );
  const changed = await system(() => owner.compute(secondLease));
  await proof('changed evidence / correct current revision', async () => {
    assert.equal(changed.revision, first.revision + 1);
    assert.equal(
      (await system(() => owner.current(intent))).revision?.id,
      changed.id,
    );
    assert.notEqual(changed.evidenceHash, published.evidenceHash);
  });
  await proof('previous as-reported snapshot unchanged', async () =>
    assert.deepEqual(await readRevision(first.id), published),
  );
  await proof('wrong tenant receipt denied', () =>
    context.runAsSystemTenant(other.id, () =>
      assert.rejects(() => owner.resume(first.id)),
    ),
  );
  await proof('no executions / deliveries / hidden Clients', async () => {
    assert.equal(await db.actionExecution.count(), 0);
    assert.equal(await db.marketingCampaign.count(), 0);
    assert.equal(await db.client.count(), 3);
  });
  const sourceBefore = measurementHash(
    await db.appointment.findUniqueOrThrow({ where: { id: appointment.id } }),
  );
  await proof('direct delete denied', () =>
    assert.rejects(() =>
      db.measurementRevision.delete({ where: { id: first.id } }),
    ),
  );
  await proof('truncate denied', () =>
    assert.rejects(() =>
      db.$executeRawUnsafe('TRUNCATE "MeasurementRevision"'),
    ),
  );
  // Privileged aging of fixtures ONLY in the hard-coded disposable database.
  // No production clock override or backdoor is installed.
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      'ALTER TABLE "MeasurementRevision" DISABLE TRIGGER "C7_measurement_publication_guard_trg"',
    );
    await tx.$executeRaw`UPDATE "MeasurementRevision" SET "admittedAt"="admittedAt"-interval '366 days',"expiresAt"="expiresAt"-interval '366 days',"publishedAt"="publishedAt"-interval '366 days',"asOf"="asOf"-interval '366 days' WHERE "tenantId"=${tenant.id}`;
    await tx.$executeRawUnsafe(
      'ALTER TABLE "MeasurementRevision" ENABLE TRIGGER "C7_measurement_publication_guard_trg"',
    );
  });
  await proof('expired receipt cannot resume', () =>
    system(() => assert.rejects(() => owner.resume(first.id), /expired/)),
  );
  await proof('expired current unavailable', async () =>
    assert.equal((await system(() => owner.current(intent))).revision, null),
  );
  await db.tenant.update({
    where: { id: tenant.id },
    data: { status: 'suspended' },
  });
  const maintenance = new Package5Wave6MaintenanceService(db, context);
  await proof('AC6 requires exact tenant', () =>
    assert.rejects(() =>
      maintenance.shadow({ actionClass: 'expire_measurement_revisions' }),
    ),
  );
  const run = await system(() =>
    maintenance.prepare({ actionClass: 'expire_measurement_revisions' }),
  );
  const cleaned = await system(() => maintenance.execute(run));
  await proof('AC6 inactive-tenant exact cleanup and retry', async () => {
    assert.equal(cleaned.deleted, 5);
    assert.equal((await system(() => maintenance.execute(run))).deleted, 5);
    assert.equal(await db.measurementRevision.count(), 0);
  });
  await proof('AC6 source and Client preservation', async () => {
    assert.equal(
      measurementHash(
        await db.appointment.findUniqueOrThrow({
          where: { id: appointment.id },
        }),
      ),
      sourceBefore,
    );
    assert.equal(await db.client.count(), 3);
    assert.equal(await db.appointment.count(), 1101);
    assert.equal(await db.tenant.count(), baselineTenants + 2);
  });
  await proof('expired compute receipt never readmitted', () =>
    system(() => assert.rejects(() => owner.compute(lease), /missing/)),
  );
  await proof('missing receipt never readmitted', () =>
    system(() => assert.rejects(() => owner.resume(first.id), /missing/)),
  );
  const columns = await db.$queryRaw<
    Array<{ n: bigint }>
  >`SELECT count(*) AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='MeasurementRevision'`;
  await proof('37 physical fields', () =>
    assert.equal(Number(columns[0].n), 37),
  );
  await proof(
    'exact approved constraints and source-safe FK actions',
    async () => {
      const constraints = await db.$queryRaw<
        Array<{ type: string; n: bigint }>
      >`
      SELECT contype::text AS type,count(*) AS n FROM pg_constraint
      WHERE conrelid='"MeasurementRevision"'::regclass GROUP BY contype`;
      assert.equal(Number(constraints.find((c) => c.type === 'c')?.n), 16);
      assert.equal(Number(constraints.find((c) => c.type === 'f')?.n), 8);
      const [foreignKeys] = await db.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM pg_constraint WHERE conrelid='"MeasurementRevision"'::regclass
      AND contype='f' AND confdeltype='r' AND confupdtype='r'`;
      assert.equal(Number(foreignKeys.n), 8);
    },
  );
  console.log(
    JSON.stringify({
      status: 'PASS',
      checks: checks.length,
      requirements: ['Q01', 'Q02', 'Q03', 'Q17', 'Q18', 'Q22'],
      productionEffects: 0,
      oldDatabasesTouched: 0,
    }),
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
