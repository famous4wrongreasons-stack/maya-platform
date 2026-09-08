import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import { EventStoreService } from '../src/events/event-store.service';
import { AppointmentChangeService } from '../src/crm/appointment-change.service';
import { AppointmentObservationService } from '../src/crm/appointment-observation.service';
import type { CrmService } from '../src/crm/crm.service';
import { MeasurementService } from '../src/measurement/measurement.service';
import { MeasurementIntent } from '../src/measurement/measurement.contract';
import { Prisma } from '@prisma/client';
import { MeasurementSources } from '../src/measurement/measurement.sources';

// Option A acceptance. Synthetic exact-source-owner proof; never production repair.
const url = new URL(process.env.DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55517');
assert.equal(url.pathname, '/maya_c7_replay');
assert.equal(url.username, 'maya_c7');
const db = new PrismaService(
  new ConfigService({ DATABASE_URL: url.toString() }),
);
const context = new TenantContextService();

async function main() {
  await db.$connect();
  const tenant = await db.tenant.create({
    data: {
      name: 'C7 source compatibility synthetic',
      slug: randomUUID(),
      status: 'active',
    },
  });
  const a = await db.client.create({ data: { tenantId: tenant.id } });
  const b = await db.client.create({ data: { tenantId: tenant.id } });
  for (const [externalId, clientId] of [
    ['700001', a.id],
    ['700002', b.id],
  ])
    await db.crmClientLink.create({
      data: { tenantId: tenant.id, provider: 'yclients', externalId, clientId },
    });
  const source = new AppointmentObservationService(db, context, {
    resolveStaffIdForBooking: () => Promise.resolve(null),
  } as unknown as CrmService);
  const owner = new AppointmentChangeService(
    db,
    context,
    new EventStoreService(db, context),
  );
  const measurements = new MeasurementService(
    db,
    context,
    new MeasurementSources(db),
  );
  const start = new Date(Date.now() - 86400000),
    end = new Date(start.getTime() + 3600000);
  const system = <T>(run: () => T) => context.runAsSystemTenant(tenant.id, run);
  const observe = async (externalClient: string) => {
    const observed = await source.fromSourceShape(tenant.id, 'yclients', {
      id: 'crm-900001',
      client: { id: externalClient },
      provider: { id: '800001' },
      service_ids: ['100001'],
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      status: 'confirmed',
      attendance: 'arrived',
      total_price: 100,
      currency: 'RUB',
    });
    assert.ok(observed);
    assert.equal(
      observed.state.mayaClientId,
      externalClient === '700001' ? a.id : b.id,
    );
    return owner.applyObservation({
      tenantId: tenant.id,
      provider: 'yclients',
      observed,
      ingestionMethod: 'reconciliation',
      baselineEstablished: false,
      observedAt: new Date(),
    });
  };
  const first = await system(() => observe('700001'));
  const control = await system(() => observe('700002'));
  assert.equal(control.outcome, 'updated');
  assert.equal(
    (
      await db.appointment.findUniqueOrThrow({
        where: { id: first.appointmentId },
      })
    ).mayaClientId,
    b.id,
  );
  await system(() => observe('700001'));
  assert.equal(
    await db.nativeFeedbackRequest.count({ where: { tenantId: tenant.id } }),
    0,
  );
  const checks: string[] = [
    'no measurement: canonical A→B correction succeeds',
  ];
  const intent = (clientId: string): MeasurementIntent => ({
    kind: 'appointment_outcome',
    clientId,
    appointmentId: first.appointmentId,
    periodFrom: start,
    periodTo: end,
    asOf: new Date(),
    timezone: 'UTC',
    scope: {
      version: 1,
      capabilityKey: 'measurement.read',
      branchIds: [],
      dimensions: {},
      sourceQuery: {},
    },
  });
  const admit = (clientId: string) =>
    system(() =>
      measurements.admit(intent(clientId), {
        namespace: 'measurement_request',
        id: randomUUID(),
      }),
    );
  const read = (id: string) =>
    db.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
      return tx.measurementRevision.findUniqueOrThrow({ where: { id } });
    });
  const pending = await admit(a.id);
  await system(() => observe('700002'));
  checks.push('pending measurement does not block canonical source correction');
  await assert.rejects(admit(a.id), /measurement_appointment_client_mismatch/);
  checks.push('wrong/current Client initial admission rejected');
  const foreignTenant = await db.tenant.create({
    data: { name: 'foreign synthetic', slug: randomUUID(), status: 'active' },
  });
  await assert.rejects(
    context.runAsSystemTenant(foreignTenant.id, () =>
      measurements.admit(intent(a.id), {
        namespace: 'measurement_request',
        id: randomUUID(),
      }),
    ),
  );
  checks.push('wrong tenant and cross-Client admission rejected');
  // The DB guard independently rejects a forged stale-source admission.
  await assert.rejects(
    db.measurementRevision.create({
      data: {
        ...pending,
        id: randomUUID(),
        revision: 2,
        requestKeyHash: createHash('sha256').update(randomUUID()).digest('hex'),
        scopeJson: pending.scopeJson as Prisma.InputJsonValue,
        evidenceRefsJson: Prisma.DbNull,
        valuesJson: Prisma.DbNull,
        limitationsJson: Prisma.DbNull,
      },
    }),
    /C7 admission Appointment Client mismatch/,
  );
  checks.push('SQL admission guard independently verifies exact Client');
  const unavailable = await system(() =>
    new MeasurementService(db, context, new MeasurementSources(db)).resume(
      pending.id,
    ),
  );
  assert.equal(unavailable.id, pending.id);
  assert.equal(unavailable.clientId, a.id);
  assert.equal(unavailable.completeness, 'UNAVAILABLE');
  assert.equal(unavailable.creditedExecutionId, null);
  assert.deepEqual(unavailable.valuesJson, { version: 1, metrics: [] });
  assert.deepEqual(unavailable.evidenceRefsJson, {
    version: 1,
    sources: [],
    dependencies: [],
  });
  assert.deepEqual(unavailable.limitationsJson, {
    version: 1,
    reasons: ['source_subject_changed'],
  });
  checks.push(
    'pending closes unavailable with no stale facts, credit or silent Client rebind',
  );
  assert.deepEqual(
    await system(() => measurements.resume(pending.id)),
    unavailable,
  );
  checks.push('restart/retry preserves exact unavailable outcome');
  assert.equal(
    (await system(() => measurements.current(intent(b.id)))).revision,
    null,
  );
  checks.push('current Client B does not receive historical Client A result');
  const next = await admit(b.id);
  assert.equal(next.identityHash, pending.identityHash);
  assert.equal(next.revision, pending.revision + 1);
  const publishedB = await system(() => measurements.resume(next.id));
  assert.equal(publishedB.clientId, b.id);
  checks.push(
    'genuine Client B observation uses same Appointment identity and next revision',
  );
  await system(() => observe('700001'));
  const publishedA = await system(async () =>
    measurements.resume((await admit(a.id)).id),
  );
  const serialized = JSON.stringify(publishedA);
  await system(() => observe('700002'));
  assert.equal(JSON.stringify(await read(publishedA.id)), serialized);
  assert.equal(
    JSON.stringify(await system(() => measurements.resume(publishedA.id))),
    serialized,
  );
  checks.push(
    'published A→B correction succeeds; all historical snapshot fields remain immutable',
  );
  assert.equal(
    (await system(() => measurements.current(intent(b.id)))).revision,
    null,
  );
  checks.push(
    'current projection cannot resurrect an older matching Client revision',
  );
  await assert.rejects(
    db.measurementRevision.update({
      where: { id: publishedA.id },
      data: { clientId: b.id },
    }),
    /C7 snapshot immutable/,
  );
  checks.push('published historical Client cannot be changed in place');

  // Reject a stale publisher even if it bypasses the application source reader.
  await system(() => observe('700001'));
  const stale = await admit(a.id);
  const lease = await system(() => measurements.claim(stale.id));
  assert.ok(lease);
  await system(() => observe('700002'));
  await assert.rejects(
    db.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
      await tx.$queryRaw`SELECT set_config('maya.c7.claim_token',${lease.token},true)`;
      return tx.measurementRevision.update({
        where: { id: stale.id },
        data: {
          state: 'PUBLISHED',
          publishedAt: new Date(),
          leaseTokenHash: null,
          leaseExpiresAt: null,
          evidenceHash: publishedA.evidenceHash,
          snapshotHash: publishedA.snapshotHash,
          evidenceRefsJson:
            publishedA.evidenceRefsJson as Prisma.InputJsonValue,
          valuesJson: publishedA.valuesJson as Prisma.InputJsonValue,
          limitationsJson: publishedA.limitationsJson as Prisma.InputJsonValue,
          completeness: publishedA.completeness,
          qualification: publishedA.qualification,
          attributionStatus: publishedA.attributionStatus,
        },
      });
    }),
    /C7 changed source requires unavailable outcome/,
  );
  assert.equal(
    (await system(() => measurements.compute(lease))).completeness,
    'UNAVAILABLE',
  );
  checks.push(
    'SQL publication guard rejects stale Client facts independently; retry closes same receipt',
  );

  // Real row-lock contention in both orders; barriers are test-only, never a production hook.
  const barrier = () => {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    return { promise, release };
  };
  const waitForBlocked = async (minimum: number) => {
    for (let count = 0; count < 200; count++) {
      const [state] = await db.$queryRaw<Array<{ blocked: number }>>`
        SELECT count(*)::int AS blocked FROM pg_stat_activity
        WHERE datname=current_database() AND wait_event_type='Lock'
          AND query LIKE '%Appointment%'`;
      if (state.blocked >= minimum) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('source owner lock contention not observed');
  };
  await system(() => observe('700001'));
  const race = await admit(a.id);
  const raceLease = await system(() => measurements.claim(race.id));
  assert.ok(raceLease);
  const held = barrier(),
    release = barrier();
  const blocker = db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Appointment" WHERE id=${first.appointmentId} FOR UPDATE`;
    held.release();
    await release.promise;
  });
  await held.promise;
  const correction = system(() => observe('700002'));
  await waitForBlocked(1);
  const publishing = system(() => measurements.compute(raceLease));
  await waitForBlocked(2);
  release.release();
  await blocker;
  await correction;
  assert.equal((await publishing).completeness, 'UNAVAILABLE');
  checks.push('concurrent correction wins → pending publication unavailable');

  await system(() => observe('700001'));
  const publicationWins = await admit(a.id);
  const readStarted = barrier(),
    finishRead = barrier();
  class PausedSources extends MeasurementSources {
    override async read(...args: Parameters<MeasurementSources['read']>) {
      const result = await super.read(...args);
      readStarted.release();
      await finishRead.promise;
      return result;
    }
  }
  const paused = new MeasurementService(db, context, new PausedSources(db));
  const firstPublication = system(() => paused.resume(publicationWins.id));
  await readStarted.promise;
  const laterCorrection = system(() => observe('700002'));
  await waitForBlocked(1);
  finishRead.release();
  const stableSnapshot = await firstPublication;
  assert.equal(stableSnapshot.clientId, a.id);
  assert.equal(stableSnapshot.completeness, 'PARTIAL');
  await laterCorrection;
  assert.deepEqual(await read(stableSnapshot.id), stableSnapshot);
  checks.push(
    'publication wins → later correction succeeds and historical snapshot immutable',
  );
  const finalIntent = intent(b.id),
    occurrence = {
      namespace: 'measurement_request' as const,
      id: randomUUID(),
    };
  const concurrent = await Promise.all(
    Array.from({ length: 8 }, () =>
      system(() => measurements.admit(finalIntent, occurrence)),
    ),
  );
  assert.equal(new Set(concurrent.map((r) => r.id)).size, 1);
  assert.equal(concurrent[0].revision, stableSnapshot.revision + 1);
  const claims = await Promise.all(
    Array.from({ length: 4 }, () =>
      system(() => measurements.claim(concurrent[0].id)),
    ),
  );
  const winners = claims.filter((c) => c !== null);
  assert.equal(winners.length, 1);
  const final = await system(() => measurements.compute(winners[0]));
  assert.deepEqual(await system(() => measurements.resume(final.id)), final);
  assert.equal(
    (await system(() => measurements.current(finalIntent))).revision?.id,
    final.id,
  );
  checks.push(
    'concurrent admission/claims: one winner, deterministic next revision and restart-safe current outcome',
  );
  await assert.rejects(
    system(() =>
      measurements.admit({ ...finalIntent, clientId: a.id }, occurrence),
    ),
  );
  checks.push('old request identity cannot be reused to change Client');
  assert.equal(await db.user.count(), 0);
  assert.equal(
    await db.actionExecution.count({ where: { tenantId: tenant.id } }),
    0,
  );
  assert.equal(
    await db.domainEvent.count({ where: { tenantId: tenant.id } }),
    0,
  );
  assert.equal(
    await db.nativeFeedbackRequest.count({ where: { tenantId: tenant.id } }),
    0,
  );
  checks.push(
    'Client without Maya User supported; no business actions, provider calls or fabricated source lineage',
  );
  console.log(
    JSON.stringify(
      {
        sourceOwnerCompatibility: 'PASS',
        option: 'A',
        checks: checks.length,
        results: checks,
        productionMutations: 0,
        providerCalls: 0,
        oldDatabasesTouched: 0,
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
