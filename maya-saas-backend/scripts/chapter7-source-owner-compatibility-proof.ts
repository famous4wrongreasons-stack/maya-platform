import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import { EventStoreService } from '../src/events/event-store.service';
import { AppointmentChangeService } from '../src/crm/appointment-change.service';
import { AppointmentObservationService } from '../src/crm/appointment-observation.service';
import type { CrmService } from '../src/crm/crm.service';
import { MeasurementService } from '../src/measurement/measurement.service';
import { MeasurementSources } from '../src/measurement/measurement.sources';

// A regression reproducer, not a production repair or a migration workaround.
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
  const receipt = await system(() =>
    measurements.admit(
      {
        kind: 'appointment_outcome',
        clientId: a.id,
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
      },
      { namespace: 'measurement_request', id: randomUUID() },
    ),
  );
  const failures: Array<{
    state: string;
    prismaCode: string;
    constraint: string;
  }> = [];
  for (const state of ['PENDING', 'PUBLISHED']) {
    if (state === 'PUBLISHED')
      await system(() => measurements.resume(receipt.id));
    let error: unknown;
    try {
      await system(() => observe('700002'));
    } catch (e) {
      error = e;
    }
    assert.ok(error instanceof Error);
    assert.match(error.message, /C7_measurement_appointment_fk/);
    failures.push({
      state,
      prismaCode: (error as Error & { code: string }).code,
      constraint: 'C7_measurement_appointment_fk',
    });
    assert.equal(
      (
        await db.appointment.findUniqueOrThrow({
          where: { id: first.appointmentId },
        })
      ).mayaClientId,
      a.id,
    );
  }
  assert.equal(
    await db.measurementRevision.count({ where: { tenantId: tenant.id } }),
    1,
  );
  assert.equal(
    await db.actionExecution.count({ where: { tenantId: tenant.id } }),
    0,
  );
  assert.equal(
    await db.domainEvent.count({ where: { tenantId: tenant.id } }),
    0,
  );
  console.log(
    JSON.stringify(
      {
        reproduction: 'CONFIRMED',
        sourceOwnerCompatibility: 'FAIL',
        canonicalSourceOwner:
          'AppointmentObservationService → AppointmentChangeService.applyObservation',
        controlWithoutMeasurement:
          'PASS: exact CRM binding A→B correction succeeds',
        withMeasurement: failures,
        sourceCorrectionRolledBackByC7ForeignKey: true,
        unrelatedNativeFeedbackRequests: 0,
        fakeAuthorityOrPhoneMatch: false,
        newSchemaBusinessContractDecisionRequired: true,
        manifestDefect: false,
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
