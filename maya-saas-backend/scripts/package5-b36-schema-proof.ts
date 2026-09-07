/** Owned PostgreSQL only. Synthetic identities and engine outcomes; no transport. */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
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
import { OwnerReportStore } from '../src/owner-reports/owner-report.store';
import {
  normalizeOwnerReportPlan,
  OWNER_REPORT_ACTION,
  OWNER_REPORT_CONTRACT,
  OWNER_REPORT_DAY,
  OWNER_REPORT_ORDER,
  type OwnerReportPlan,
} from '../src/owner-reports/owner-report.contract';
import {
  dayIsoRange,
  localCalendarDate,
} from '../src/owner-reports/owner-reports.time';

const url = new URL(process.env.DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55506');
assert.match(url.pathname, /^\/maya_b36_(schema|replay|runtime)$/);
const secret = 'b36-schema-fixture-secret-not-production';
const config = new ConfigService({
  DATABASE_URL: url.toString(),
  CRM_ENCRYPTION_KEY: secret,
  OWNER_REPORTS_CANONICAL_CUTOVER_AT: new Date(
    Date.now() - 2 * OWNER_REPORT_DAY,
  ).toISOString(),
});
const db = new PrismaService(config),
  context = new TenantContextService(),
  caps = new ActionCapabilityRegistry();
const entitlements: Pick<EntitlementsService, 'resolveFeatureRequirements'> = {
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
const resolver = new CanonicalActionPolicyResolver(
  db,
  entitlements,
  { attestationSecret: secret },
  createCanonicalProductionPolicyRegistry(caps),
  caps,
);
const engine = new ActionEngineKernel(
  db,
  { identitySecret: secret, payloadEncryptionSecret: secret },
  caps,
  resolver,
);
const ingress = new CanonicalActionIngressService(engine, resolver);
const store = new OwnerReportStore(db, context, ingress, config);
const checks: string[] = [];

async function fixture(): Promise<OwnerReportPlan> {
  const tenant = await db.tenant.create({
    data: {
      name: 'B36 synthetic report schema',
      slug: randomUUID(),
      status: 'active',
    },
  });
  const recipients: OwnerReportPlan['recipients'] = [];
  for (let i = 0; i < 2; i++) {
    const user = await db.user.create({
      data: {
        tenantId: tenant.id,
        email: randomUUID() + '@example.invalid',
        passwordHash: 'synthetic',
        role: 'tenant_owner',
        status: 'active',
      },
    });
    const membership = await db.membership.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        role: 'tenant_owner',
        status: 'active',
      },
    });
    const tg = await db.authIdentity.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        provider: 'telegram',
        providerUserId: String(1000 + i),
      },
    });
    const slots = [
      store.slot(tenant.id, user.id, 'inbox', membership.id, user.id),
      store.slot(tenant.id, user.id, 'telegram', tg.id, tg.providerUserId),
    ];
    for (let j = 0; j < 2; j++) {
      const device = await db.devicePushToken.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          platform: 'ios',
          token: randomUUID().replaceAll('-', '').repeat(2),
        },
      });
      slots.push(
        store.slot(tenant.id, user.id, 'apns', device.id, device.token),
      );
    }
    recipients.push({
      userId: user.id,
      membershipId: membership.id,
      role: 'tenant_owner',
      slots,
    });
  }
  const timezone = 'Europe/Moscow',
    periodLocalDate = localCalendarDate(timezone, new Date());
  const range = dayIsoRange(timezone, periodLocalDate),
    periodEnd = new Date(Date.parse(range.to) + 1).toISOString();
  return normalizeOwnerReportPlan({
    contract: OWNER_REPORT_CONTRACT,
    tenantId: tenant.id,
    reportType: 'daily_report',
    periodLocalDate,
    reportVersion: 1,
    timezone,
    periodStart: range.from,
    periodEnd,
    expiresAt: new Date(
      Date.parse(periodEnd) + 7 * OWNER_REPORT_DAY,
    ).toISOString(),
    classification: 'operational_single',
    channelOrder: OWNER_REPORT_ORDER,
    policy: {
      action: OWNER_REPORT_ACTION,
      key: 'production.deliver_report_briefing.proven-cutover',
      version: 1,
      preference: 'daily_brief',
    },
    content: {
      title: 'Synthetic report',
      bodyText: 'Synthetic business snapshot',
      payload: { schema_version: 1 },
      deepLink: '/app/?panel=chat',
    },
    recipients,
  });
}
async function outcome(tenantId: string, executionId: string, unknown = false) {
  const claim = await engine.claimExecution({
    tenantId,
    executionId,
    workerId: 'b36-schema-proof',
  });
  const input = {
    tenantId,
    executionId,
    attemptId: claim.attempt.id,
    leaseToken: claim.leaseToken,
    outcomeCode: unknown ? 'SYNTHETIC_UNKNOWN' : 'SYNTHETIC_CONFIRMED',
  };
  await engine.markDispatchMayHaveCrossed(input);
  if (unknown)
    await engine.finalizeUnknown({
      ...input,
      errorClass: 'SYNTHETIC_TRANSPORT_UNKNOWN',
    });
  else {
    await engine.markDispatchAcknowledged(input);
    await engine.finalizeSuccess(input);
  }
}
async function main() {
  if (process.argv[2] === '--after-restart') {
    const saved = JSON.parse(readFileSync(process.argv[3], 'utf8')) as {
      tenantId: string;
      date: string;
      id: string;
      hash: string;
      executionIds: string[];
      plan: OwnerReportPlan;
    };
    await context.runAsPublicTenant(saved.tenantId, async () => {
      const run = await store.find(saved.tenantId, saved.date);
      assert.ok(run);
      assert.equal(run.id, saved.id);
      assert.equal(run.intentHash, saved.hash);
      const plan = store.readPlan(run);
      assert.deepEqual(plan, saved.plan);
      const executions = await store.executions(run, plan);
      assert.deepEqual(executions.map((e) => e.id).sort(), saved.executionIds);
      assert.equal(executions.filter((e) => e.state === 'UNKNOWN').length, 1);
      const first = plan.recipients[0],
        other = plan.recipients[1];
      await assert.rejects(
        store.assertDispatchAllowed(run, plan, first, first.slots[2]),
        /B36_PREVIOUS_SLOT_NOT_SUCCESSFUL/,
      );
      await store.assertDispatchAllowed(run, plan, other, other.slots[0]);
      assert.equal((await store.admit(plan)).id, run.id);
    });
    checks.push(
      'actual PostgreSQL restart preserves root/manifest/order/executions',
      'UNKNOWN blocks same-recipient APNS; other recipient remains eligible',
    );
  } else {
    const plan = await fixture();
    await context.runAsPublicTenant(plan.tenantId, async () => {
      const roots = await Promise.all(
        Array.from({ length: 4 }, () => store.admit(plan)),
      );
      assert.equal(new Set(roots.map((r) => r.id)).size, 1);
      const run = roots[0],
        executions = await store.executions(run, plan);
      assert.equal(executions.length, 8);
      assert.ok(executions.every((e) => e.state === 'READY'));
      assert.equal(
        await db.actionAttempt.count({ where: { tenantId: plan.tenantId } }),
        0,
      );
      assert.deepEqual(store.readPlan(run), plan);
      checks.push(
        'concurrent same intent: one root and eight READY slots; zero effects/attempts',
      );
      const changed = structuredClone(plan);
      changed.content.bodyText += ' changed';
      await assert.rejects(store.admit(changed), /different immutable plan/);
      for (const data of [
        { intentHash: 'a'.repeat(64) },
        { intentEncrypted: null },
        { timezone: 'UTC' },
        { reportVersion: 2 },
        { expiresAt: new Date(Date.now() + 900000) },
        { admittedAt: new Date() },
        { periodLocalDate: '2000-01-01' },
        { id: randomUUID() },
        { tenantId: randomUUID() },
        { reportType: 'other' },
        { payloadRetentionUntil: new Date() },
        { auditRetentionUntil: new Date() },
      ]) {
        await assert.rejects(
          db.ownerReportRun.update({ where: { id: run.id }, data }),
        );
      }
      await assert.rejects(db.ownerReportRun.delete({ where: { id: run.id } }));
      await assert.rejects(
        db.actionExecution.update({
          where: { id: executions[0].id },
          data: {
            ownerReportSlotKey: 'a'.repeat(64),
            revision: { increment: 1 },
          },
        }),
      );
      await assert.rejects(
        db.actionExecution.delete({ where: { id: executions[0].id } }),
      );
      checks.push(
        'changed intent conflicts; all twelve root fields immutable; early payload/root/slot removal rejected',
      );
      const cloneExecution = async (overrides: Record<string, unknown>) =>
        db.$executeRaw`INSERT INTO "ActionExecution" SELECT (jsonb_populate_record(NULL::"ActionExecution", (SELECT to_jsonb(e) FROM "ActionExecution" e WHERE id=${executions[0].id}) || ${JSON.stringify({ id: randomUUID(), identityFingerprint: randomUUID().replaceAll('-', '').repeat(2), idempotencyScope: null, requestIdempotencyKeyHash: null, ...overrides })}::jsonb)).*`;
      await assert.rejects(
        cloneExecution({ ownerReportSlotKey: 'b'.repeat(64) }),
        /B36 atomic accepted report admission required/,
      );
      await assert.rejects(
        cloneExecution({ ownerReportRunId: null }),
        /B36_execution_binding_check/,
      );
      await assert.rejects(
        cloneExecution({ tenantId: randomUUID() }),
        /B36 atomic accepted report admission required/,
      );
      checks.push(
        'late slot insert, half-null binding and foreign tenant rejected',
      );
      const historicalId = randomUUID();
      await cloneExecution({
        id: historicalId,
        ownerReportRunId: null,
        ownerReportSlotKey: null,
      });
      await assert.rejects(
        db.actionExecution.update({
          where: { id: historicalId },
          data: {
            ownerReportRunId: run.id,
            ownerReportSlotKey: 'd'.repeat(64),
            revision: { increment: 1 },
          },
        }),
        /historical promotion forbidden/,
      );
      await assert.rejects(
        db.$transaction(async (tx) => {
          const rootData = { ...run, id: randomUUID() };
          const root = await tx.ownerReportRun.create({
            data: { ...rootData, periodLocalDate: '2000-01-01' },
          });
          for (let n = 0; n < 2; n++)
            await tx.$executeRaw`INSERT INTO "ActionExecution" SELECT (jsonb_populate_record(NULL::"ActionExecution", (SELECT to_jsonb(e) FROM "ActionExecution" e WHERE id=${executions[0].id}) || ${JSON.stringify({ id: randomUUID(), identityFingerprint: randomUUID().replaceAll('-', '').repeat(2), idempotencyScope: null, requestIdempotencyKeyHash: null, ownerReportRunId: root.id })}::jsonb)).*`;
        }),
        /B36_execution_slot_key/,
      );
      assert.equal(
        await db.ownerReportRun.count({ where: { tenantId: plan.tenantId } }),
        1,
      );
      checks.push(
        'same-transaction duplicate slot rejected by exact SQL unique constraint; historical promotion rejected',
      );
      const recipient = plan.recipients[0],
        inbox = executions.find(
          (e) => e.ownerReportSlotKey === recipient.slots[0].key,
        )!,
        telegram = executions.find(
          (e) => e.ownerReportSlotKey === recipient.slots[1].key,
        )!;
      await assert.rejects(
        store.assertDispatchAllowed(run, plan, recipient, recipient.slots[1]),
        /B36_PREVIOUS_SLOT_NOT_SUCCESSFUL/,
      );
      await store.assertDispatchAllowed(
        run,
        plan,
        recipient,
        recipient.slots[0],
      );
      await outcome(plan.tenantId, inbox.id);
      await store.assertDispatchAllowed(
        run,
        plan,
        recipient,
        recipient.slots[1],
      );
      await outcome(plan.tenantId, telegram.id, true);
      await assert.rejects(
        store.assertDispatchAllowed(run, plan, recipient, recipient.slots[2]),
        /B36_PREVIOUS_SLOT_NOT_SUCCESSFUL/,
      );
      await store.assertDispatchAllowed(
        run,
        plan,
        plan.recipients[1],
        plan.recipients[1].slots[0],
      );
      await db.devicePushToken.create({
        data: {
          tenantId: plan.tenantId,
          userId: recipient.userId,
          platform: 'ios',
          token: 'c'.repeat(64),
        },
      });
      assert.deepEqual(store.readPlan(run), plan);
      assert.equal((await store.executions(run, plan)).length, 8);
      checks.push(
        'Inbox before Telegram; Telegram UNKNOWN blocks APNS; independent recipient allowed; new device excluded',
      );
      if (process.argv[3])
        writeFileSync(
          process.argv[3],
          JSON.stringify({
            tenantId: plan.tenantId,
            date: plan.periodLocalDate,
            id: run.id,
            hash: run.intentHash,
            executionIds: executions.map((e) => e.id).sort(),
            plan,
          }),
        );
    });
    const conflict = await fixture();
    await context.runAsPublicTenant(conflict.tenantId, async () => {
      const changed = structuredClone(conflict);
      changed.content.title += ' changed';
      const results = await Promise.allSettled([
        store.admit(conflict),
        store.admit(changed),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
      assert.equal(
        await db.ownerReportRun.count({
          where: { tenantId: conflict.tenantId },
        }),
        1,
      );
      assert.equal(
        await db.actionExecution.count({
          where: { tenantId: conflict.tenantId },
        }),
        8,
      );
    });
    checks.push(
      'concurrent different intent: one accepted immutable plan and one conflict',
    );
    const denied = await fixture();
    await db.membership.update({
      where: { id: denied.recipients[1].membershipId },
      data: { status: 'suspended' },
    });
    await context.runAsPublicTenant(denied.tenantId, async () => {
      await assert.rejects(
        store.admit(denied),
        /B36_REPORT_RECIPIENT_NOT_AUTHORIZED/,
      );
      assert.equal(
        await db.ownerReportRun.count({ where: { tenantId: denied.tenantId } }),
        0,
      );
      assert.equal(
        await db.actionExecution.count({
          where: { tenantId: denied.tenantId },
        }),
        0,
      );
    });
    const lifecycle = await fixture();
    await context.runAsPublicTenant(lifecycle.tenantId, async () => {
      const expired = structuredClone(lifecycle);
      expired.periodLocalDate = localCalendarDate(
        expired.timezone,
        new Date(Date.now() - 10 * OWNER_REPORT_DAY),
      );
      const range = dayIsoRange(expired.timezone, expired.periodLocalDate);
      expired.periodStart = range.from;
      expired.periodEnd = new Date(Date.parse(range.to) + 1).toISOString();
      expired.expiresAt = new Date(
        Date.parse(expired.periodEnd) + 7 * OWNER_REPORT_DAY,
      ).toISOString();
      await assert.rejects(store.admit(expired), /B36_REPORT_EXPIRED/);
      const old = new Date(Date.now() - 8 * OWNER_REPORT_DAY);
      const root = await db.ownerReportRun.create({
        data: {
          tenantId: lifecycle.tenantId,
          reportType: 'daily_report',
          periodLocalDate: '2000-01-01',
          reportVersion: 1,
          timezone: lifecycle.timezone,
          intentHash: 'f'.repeat(64),
          intentEncrypted: 'synthetic-retention-fixture',
          admittedAt: old,
          expiresAt: new Date(old.getTime() + 7 * OWNER_REPORT_DAY),
          payloadRetentionUntil: new Date(old.getTime() + 7 * OWNER_REPORT_DAY),
          auditRetentionUntil: new Date(old.getTime() + 365 * OWNER_REPORT_DAY),
        },
      });
      assert.throws(() => store.readPlan(root), /B36_REPORT_PAYLOAD_EXPIRED/);
      await store.purgeExpiredPayloads(lifecycle.tenantId);
      const tombstone = await db.ownerReportRun.findUniqueOrThrow({
        where: { id: root.id },
      });
      assert.equal(tombstone.intentEncrypted, null);
      assert.equal(tombstone.intentHash, root.intentHash);
      await assert.rejects(
        db.ownerReportRun.update({
          where: { id: root.id },
          data: { intentEncrypted: 'recovered' },
        }),
        /immutable/,
      );
      await assert.rejects(
        db.ownerReportRun.delete({ where: { id: root.id } }),
        /retention/,
      );
    });
    await context.runAsPublicTenant(randomUUID(), () =>
      assert.rejects(store.admit(lifecycle)),
    );
    checks.push(
      'expired admission forbidden; expired payload purged without changing audit identity; restoration/early deletion forbidden; tenant context isolated',
    );
    const rollback = await fixture();
    const create = ingress.createExecution.bind(ingress);
    let admitted = 0;
    ingress.createExecution = (request, tx) => {
      if (++admitted === 8) throw new Error('synthetic final-slot denial');
      return create(request, tx);
    };
    await context.runAsPublicTenant(rollback.tenantId, async () => {
      await assert.rejects(
        store.admit(rollback),
        /synthetic final-slot denial/,
      );
      assert.equal(
        await db.ownerReportRun.count({
          where: { tenantId: rollback.tenantId },
        }),
        0,
      );
      assert.equal(
        await db.actionExecution.count({
          where: { tenantId: rollback.tenantId },
        }),
        0,
      );
    });
    ingress.createExecution = create;
    checks.push(
      'revoked authority rejects admission; final required-slot denial rolls back root and seven admitted slots',
    );
  }
  console.log(
    JSON.stringify(
      { status: 'PASS', checks, productionMessages: 0, historicalBackfill: 0 },
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
