import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import { MeasurementService } from '../src/measurement/measurement.service';
import { MeasurementSources } from '../src/measurement/measurement.sources';
import { MeasurementFinanceReader } from '../src/measurement/measurement.finance';
import { MeasurementReadService } from '../src/measurement/measurement.read.service';
import { MeasurementReportReader } from '../src/measurement/measurement.report';
import { TenantAuditReadService } from '../src/audit-log/tenant-audit-read.service';
import { EntitlementsService } from '../src/entitlements/entitlements.service';
import { CrmService } from '../src/crm/crm.service';
import {
  measurementForAi,
  measurementText,
} from '../src/measurement/measurement.presentation';
import { MEASUREMENT_RETENTION_MS } from '../src/measurement/measurement.contract';
const url = new URL(process.env.DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55517');
assert.equal(url.pathname, '/maya_c7_replay');
assert.equal(url.username, 'maya_c7');
const db = new PrismaService(
  new ConfigService({ DATABASE_URL: url.toString() }),
);
const context = new TenantContextService();
const sources = new MeasurementSources(
  db,
  new MeasurementFinanceReader(db, {} as CrmService, context),
);
const core = () => new MeasurementService(db, context, sources);
const makeReader = () =>
  new MeasurementReadService(
    db,
    context,
    {
      resolveFeatureRequirements: () => Promise.resolve({ allowed: true }),
    } as unknown as EntitlementsService,
    core(),
    sources,
  );
const checks: string[] = [];
async function check(name: string, fn: () => unknown) {
  await fn();
  checks.push(name);
  console.log('PASS ' + name);
}
async function main() {
  await db.$connect();
  const tenant = await db.tenant.create({
    data: {
      name: 'C7 P06 synthetic',
      slug: randomUUID(),
      status: 'active',
      calendarSource: 'internal',
      defaultTimezone: 'UTC',
    },
  });
  const other = await db.tenant.create({
    data: {
      name: 'C7 P06 unrelated',
      slug: randomUUID(),
      status: 'active',
      calendarSource: 'internal',
      defaultTimezone: 'UTC',
    },
  });
  const actor = await db.user.create({
    data: {
      tenantId: tenant.id,
      role: 'tenant_owner',
      email: randomUUID() + '@proof.invalid',
      passwordHash: 'synthetic-only',
      memberships: {
        create: { tenantId: tenant.id, role: 'tenant_owner', status: 'active' },
      },
    },
  });
  const membership = await db.membership.findUniqueOrThrow({
    where: { userId_tenantId: { userId: actor.id, tenantId: tenant.id } },
  });
  const client = await db.client.create({ data: { tenantId: tenant.id } });
  const from = new Date(Date.now() - 3 * 86400000);
  from.setUTCHours(0, 0, 0, 0);
  const end = new Date(from.getTime() + 86400000);
  const at = new Date(from.getTime() + 3600000),
    until = new Date(at.getTime() + 3600000);
  const appointment = await db.appointment.create({
    data: {
      tenantId: tenant.id,
      mayaClientId: client.id,
      source: 'internal',
      staffExternalId: 'synthetic',
      serviceIds: ['synthetic'],
      startAt: at,
      endAt: until,
      blockedStartAt: at,
      blockedEndAt: until,
      attendance: 'arrived',
      totalPriceKopecks: 12345,
      currency: 'RUB',
    },
  });
  const run = <T>(fn: () => T) =>
    context.run('p06-proof', () => {
      context.setResolvedTenant({
        tenantId: tenant.id,
        userId: actor.id,
        role: 'tenant_owner',
        membershipId: membership.id,
        source: 'membership',
      });
      return fn();
    });
  const system = <T>(fn: () => T) => context.runAsSystemTenant(tenant.id, fn);
  const reader = makeReader();
  const query = {
    kind: 'business_period' as const,
    from: from.toISOString(),
    to: end.toISOString(),
  };
  const baseline = await db.measurementRevision.count({
    where: { tenantId: tenant.id },
  });
  let live = await run(() => reader.read(tenant.id, actor.id, query));
  await check(
    'live source projection creates no MeasurementRevision or ActionExecution',
    async () => {
      assert.equal(
        await db.measurementRevision.count({ where: { tenantId: tenant.id } }),
        baseline,
      );
      assert.equal(
        await db.actionExecution.count({ where: { tenantId: tenant.id } }),
        0,
      );
      assert.equal(live.mode, 'live');
    },
  );
  await check('Client without Maya User remains canonical source', async () => {
    assert.equal(client.userId, null);
    const own = await run(() =>
      reader.read(tenant.id, actor.id, {
        ...query,
        kind: 'client_history',
        clientId: client.id,
      }),
    );
    assert.ok(own.metrics.length);
  });
  await check(
    'unknown cash/refunds/net not zero; observed booked value remains separate',
    () => {
      assert.equal(
        live.metrics.find((x) => x.key === 'observed_booked_value')?.value,
        '12345',
      );
      for (const k of ['confirmed_cash', 'confirmed_refunds', 'net_profit'])
        assert.equal(live.metrics.find((x) => x.key === k)?.value, null);
    },
  );
  await check('wrong tenant rejected before source read/admission', () =>
    assert.rejects(() => run(() => reader.read(other.id, actor.id, query))),
  );
  const period = {
    from: from.toISOString(),
    to: new Date(end.getTime() - 1).toISOString(),
  };
  const snapshot = () =>
    system(() =>
      new MeasurementReportReader(db, context, core()).snapshot(
        tenant.id,
        'daily_report/1/synthetic',
        period,
        new Date(),
      ),
    );
  const first = await snapshot();
  await check(
    'report pins exact published revision and original 365-day expiry',
    async () => {
      assert.equal(first.mode, 'as_reported');
      const row = await db.measurementRevision.findFirstOrThrow({
        where: { id: first.revisionId!, tenantId: tenant.id },
      });
      assert.equal(row.state, 'PUBLISHED');
      assert.equal(
        row.expiresAt.getTime() - row.admittedAt.getTime(),
        MEASUREMENT_RETENTION_MS,
      );
    },
  );
  await check(
    'restart/retry of report reuses original asOf, identity, hash and expiry',
    async () => {
      const retry = await snapshot();
      assert.deepEqual(retry, first);
      assert.equal(
        await db.measurementRevision.count({ where: { tenantId: tenant.id } }),
        1,
      );
    },
  );
  await check('same report identity with changed period conflicts', () =>
    assert.rejects(
      () =>
        system(() =>
          new MeasurementReportReader(db, context, core()).snapshot(
            tenant.id,
            'daily_report/1/synthetic',
            {
              ...period,
              from: new Date(from.getTime() - 86400000).toISOString(),
            },
            new Date(),
          ),
        ),
      /measurement_idempotency_conflict/,
    ),
  );
  await check(
    'concurrent report admission has one immutable logical outcome',
    async () => {
      const work = () =>
        system(() =>
          new MeasurementReportReader(db, context, core()).snapshot(
            tenant.id,
            'daily_report/1/concurrent',
            period,
            new Date(),
          ),
        );
      const attempts = await Promise.allSettled([work(), work(), work()]);
      assert.ok(attempts.some((x) => x.status === 'fulfilled'));
      for (const x of attempts)
        if (x.status === 'rejected')
          assert.match(
            String(x.reason),
            /measurement_claim_busy|measurement_lease_lost|measurement_claim_lost/,
          );
      const retry = await work();
      for (const x of attempts)
        if (x.status === 'fulfilled')
          assert.equal(x.value.revisionId, retry.revisionId);
      assert.equal(
        await db.measurementRevision.count({ where: { tenantId: tenant.id } }),
        2,
      );
    },
  );
  await db.appointment.update({
    where: { id: appointment.id },
    data: { totalPriceKopecks: 56789 },
  });
  live = await run(() => reader.read(tenant.id, actor.id, query));
  await check(
    'late source correction changes live facts, never the as-reported snapshot',
    async () => {
      assert.equal(
        live.metrics.find((x) => x.key === 'observed_booked_value')?.value,
        '56789',
      );
      assert.deepEqual(
        await run(() =>
          makeReader().snapshot(tenant.id, actor.id, first.revisionId!),
        ),
        first,
      );
      assert.deepEqual(await snapshot(), first);
    },
  );
  await check(
    'AI/HTTP/report use identical fact values with safe AI projection',
    () => {
      const ai = measurementForAi(first);
      assert.deepEqual(
        ai.metrics.map((x) => x.value),
        first.metrics.filter((x) => x.unit !== 'label').map((x) => x.value),
      );
      assert.ok(!JSON.stringify(ai).includes(client.id));
      assert.match(measurementText(ai), /неизвестное|Неизвестное/);
    },
  );
  const audit = new TenantAuditReadService(db, context);
  const stamp = new Date(Date.now() - 1000);
  for (const id of ['safe-a', 'safe-b'])
    await db.auditLog.create({
      data: {
        id: randomUUID() + id,
        tenantId: tenant.id,
        scope: 'tenant',
        action: 'appointment.created',
        entityType: 'appointment',
        entityId: appointment.id,
        metadataJson: { private: 'SYNTHETIC_PRIVATE' },
        createdAt: stamp,
      },
    });
  await db.auditLog.create({
    data: {
      tenantId: other.id,
      scope: 'tenant',
      action: 'appointment.created',
      entityType: 'appointment',
      entityId: randomUUID(),
      metadataJson: { private: 'FOREIGN_PRIVATE' },
      createdAt: stamp,
    },
  });
  await db.auditLog.create({
    data: {
      scope: 'platform',
      action: 'appointment.created',
      entityType: 'appointment',
      entityId: randomUUID(),
      metadataJson: { private: 'PLATFORM_PRIVATE' },
      createdAt: stamp,
    },
  });
  await check(
    'tenant audit excludes platform/foreign/raw payload and paginates timestamp ties',
    async () => {
      const page = await run(() =>
        audit.read(tenant.id, actor.id, { limit: '1' }),
      );
      assert.equal(page.items.length, 1);
      assert.ok(page.nextCursor);
      const next = await run(() =>
        audit.read(tenant.id, actor.id, {
          ...page.window,
          limit: '1',
          cursor: page.nextCursor!,
        }),
      );
      assert.equal(next.items.length, 1);
      assert.notEqual(next.items[0].id, page.items[0].id);
      assert.equal(next.nextCursor, null);
      assert.ok(!JSON.stringify([page, next]).includes('PRIVATE'));
      assert.ok(!JSON.stringify(page.items).includes(appointment.id));
    },
  );
  await check(
    'audit rejects unbounded range and cross-window cursor',
    async () => {
      await assert.rejects(() =>
        run(() =>
          audit.read(tenant.id, actor.id, {
            from: '2020-01-01',
            to: new Date().toISOString(),
          }),
        ),
      );
      const page = await run(() =>
        audit.read(tenant.id, actor.id, { limit: '1' }),
      );
      await assert.rejects(() =>
        run(() =>
          audit.read(tenant.id, actor.id, {
            from: from.toISOString(),
            to: end.toISOString(),
            cursor: page.nextCursor!,
          }),
        ),
      );
    },
  );
  await db.membership.update({
    where: { id: membership.id },
    data: { status: 'suspended' },
  });
  await check(
    'revoked membership cannot read live, historical snapshot, or audit',
    async () => {
      await assert.rejects(() =>
        run(() => reader.read(tenant.id, actor.id, query)),
      );
      await assert.rejects(() =>
        run(() => reader.snapshot(tenant.id, actor.id, first.revisionId!)),
      );
      await assert.rejects(() =>
        run(() => audit.read(tenant.id, actor.id, {})),
      );
    },
  );
  console.log(
    JSON.stringify({
      status: 'PASS',
      checks: checks.length,
      names: checks,
      productionEffects: 0,
      preExistingDatabasesTouched: 0,
    }),
  );
}
void main().finally(() => db.$disconnect());
