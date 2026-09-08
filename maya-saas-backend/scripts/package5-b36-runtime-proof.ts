import { EncryptionService } from '../src/encryption/encryption.service';
import { AuditLogService } from '../src/audit-log/audit-log.service';
import { Prisma } from '@prisma/client';
import { ActionEngineRuntimeService } from '../src/action-engine';
import { CommunicationDeliveryService } from '../src/communication-delivery/communication-delivery.service';
import { OwnerReportsService } from '../src/owner-reports/owner-reports.service';
import { DashboardPreferencesService } from '../src/dashboard-preferences/dashboard-preferences.service';
import type { Package5Wave1CanonicalCutoverService } from '../src/package5-wave1/package5-wave1-canonical-cutover.service';
import type {
  BusinessStateService,
  BusinessState,
} from '../src/business-state/business-state.service';
import type { InboxService } from '../src/inbox/inbox.service';
import * as apns from '../src/inbox/apns-push';
/** Real PostgreSQL/owner/Action Engine/Communication Delivery; synthetic external transports only. */
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

function dailyPlan(
  store: OwnerReportStore,
  run: Parameters<OwnerReportStore['readPlan']>[0],
  now?: Date,
) {
  const plan = store.readPlan(run, now);
  if (plan.contract !== OWNER_REPORT_CONTRACT)
    throw new Error('B36 proof requires unchanged daily V1');
  return plan;
}
const url = new URL(process.env.DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1');
assert.ok(
  (url.port === '55506' && url.pathname === '/maya_b36_runtime') ||
    (url.port === '55509' && url.pathname === '/maya_rc_b36_runtime'),
  'Only an isolated B36/Wave R-C proof database is allowed',
);
const secret = 'b36-schema-fixture-secret-not-production';
const config = new ConfigService({
  DATABASE_URL: url.toString(),
  CRM_ENCRYPTION_KEY: secret,
  MAYA_INBOX_BRIDGE_TOKEN: secret,
  MAYA_PACKAGE2_TELEGRAM_EXECUTOR_URL: 'http://b36.invalid/synthetic',
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
  {
    audit: new AuditLogService(db, context),
    encryption: new EncryptionService(config),
  },
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
const runtime = new ActionEngineRuntimeService(engine, ingress);
const preferences = new DashboardPreferencesService(
  db,
  context,
  undefined as unknown as Package5Wave1CanonicalCutoverService,
);
const delivery = new CommunicationDeliveryService(
  db,
  runtime,
  config,
  undefined,
  store,
);
const builds = new Map<string, number>();
const business = {
  business: ({ tenantId }: { tenantId: string }) => {
    builds.set(tenantId, (builds.get(tenantId) ?? 0) + 1);
    return Promise.resolve({
      source: 'internal_calendar',
      current: {},
      metrics: {
        appointments_total: 0,
        appointments_scheduled: 0,
        appointments_completed: 0,
        appointments_cancelled: 0,
        booked_minutes: 0,
        revenue_basis: 'unavailable',
      },
      unavailableMetrics: [],
      staffJoin: [],
    } as unknown as BusinessState);
  },
} as unknown as BusinessStateService;
const makeReports = () =>
  new OwnerReportsService(
    db,
    business,
    {} as InboxService,
    context,
    config,
    preferences,
    store,
    delivery,
  );
const reports = makeReports();
const calls: Array<{
  tenantId: string;
  userId: string;
  key: string;
  channel: string;
}> = [];
const outcomes = new Map<string, 'unknown' | 'rejected'>();
const blocked = new Set<string>();
const invoke = delivery.deliverOwnerReportSlot.bind(delivery);
delivery.deliverOwnerReportSlot = (tenant, run, slot) => {
  if (blocked.has(slot))
    return Promise.reject(new Error('synthetic process loss before sibling'));
  return invoke(tenant, run, slot).catch((error) => {
    if (process.env.MAYA_RC_DEBUG === '1') console.error(error);
    throw error;
  });
};
async function record(channel: string, destination: string) {
  const tenantId = context.requireTenantId();
  const run = await db.ownerReportRun.findFirstOrThrow({ where: { tenantId } });
  const plan = dailyPlan(store, run);
  const executions = await store.executions(run, plan);
  assert.equal(
    executions.length,
    plan.recipients.flatMap((r) => r.slots).length,
  );
  const recipient = plan.recipients.find((r) =>
    r.slots.some((s) => s.channel === channel && s.destination === destination),
  );
  assert.ok(recipient);
  const slot = recipient.slots.find(
    (s) => s.channel === channel && s.destination === destination,
  )!;
  const own = executions.find((e) => e.ownerReportSlotKey === slot.key)!;
  assert.equal(own.state, 'EXECUTING');
  assert.equal(own.ownerReportRunId, run.id);
  for (const previous of recipient.slots.slice(
    0,
    recipient.slots.indexOf(slot),
  ))
    assert.equal(
      executions.find((e) => e.ownerReportSlotKey === previous.key)!.state,
      'SUCCEEDED',
    );
  calls.push({ tenantId, userId: recipient.userId, key: slot.key, channel });
  return slot;
}
const upsertInbox = db.inboxItem.upsert.bind(db.inboxItem);
Object.defineProperty(db.inboxItem, 'upsert', {
  value: async (args: Prisma.InboxItemUpsertArgs) => {
    const data = args.create as Prisma.InboxItemUncheckedCreateInput;
    await record('inbox', data.userId);
    return upsertInbox(args);
  },
});
globalThis.fetch = async (target, init) => {
  assert.equal(target, 'http://b36.invalid/synthetic');
  assert.equal(typeof init?.body, 'string');
  const body = JSON.parse(init!.body as string) as { telegram_chat_id: string };
  const slot = await record('telegram', body.telegram_chat_id);
  const outcome = outcomes.get(slot.key);
  return new Response(JSON.stringify({ message_id: 'synthetic-confirmed' }), {
    status: outcome === 'unknown' ? 503 : outcome === 'rejected' ? 403 : 200,
  });
};
Object.defineProperty(apns, 'prepareInboxApnsCanonical', {
  value: () => ({
    send: async (input: { deviceToken: string }) => {
      const slot = await record('apns', input.deviceToken);
      const outcome = outcomes.get(slot.key);
      return outcome
        ? {
            outcome: outcome === 'unknown' ? 'unknown' : 'rejected',
            reason: 'synthetic',
          }
        : { outcome: 'accepted', providerReference: 'synthetic-apns' };
    },
  }),
});
const tenantFor = (plan: OwnerReportPlan) => ({
  id: plan.tenantId,
  slug: 'synthetic',
  name: 'Synthetic',
  defaultTimezone: plan.timezone,
});
const countCalls = (tenantId: string) =>
  calls.filter((c) => c.tenantId === tenantId);
async function main() {
  if (process.argv[2] === '--after-restart') {
    const saved = JSON.parse(readFileSync(process.argv[3], 'utf8')) as {
      tenantId: string;
      date: string;
      id: string;
      hash: string;
      executionIds: string[];
      admittedAt: string;
      unknownExecutionId: string;
      firstUserId: string;
    };
    await context.runAsSystemTenant(saved.tenantId, async () => {
      const run = await store.find(saved.tenantId, saved.date);
      assert.ok(run);
      assert.equal(run.id, saved.id);
      assert.equal(run.intentHash, saved.hash);
      const plan = dailyPlan(store, run),
        before = await store.executions(run, plan);
      assert.deepEqual(before.map((e) => e.id).sort(), saved.executionIds);
      const attemptsBefore = await db.actionAttempt.count({
        where: {
          actionExecutionId: saved.unknownExecutionId,
          kind: 'EXECUTION',
        },
      });
      await makeReports().runDailyReport(
        tenantFor(plan),
        new Date(saved.admittedAt),
      );
      const resumed = countCalls(saved.tenantId);
      assert.equal(resumed.length, 4);
      assert.ok(resumed.every((c) => c.userId !== saved.firstUserId));
      assert.equal(builds.get(saved.tenantId), undefined);
      assert.equal(
        await db.actionAttempt.count({
          where: {
            actionExecutionId: saved.unknownExecutionId,
            kind: 'EXECUTION',
          },
        }),
        attemptsBefore,
      );
      const after = await store.executions(run, plan);
      assert.deepEqual(after.map((e) => e.id).sort(), saved.executionIds);
      assert.equal(
        after.find((e) => e.id === saved.unknownExecutionId)!.state,
        'UNKNOWN',
      );
      await makeReports().runDailyReport(
        tenantFor(plan),
        new Date(saved.admittedAt),
      );
      assert.equal(countCalls(saved.tenantId).length, 4);
    });
    checks.push(
      'actual process/PostgreSQL restart resumes four original sibling slots in order',
      'same UNKNOWN execution reconciles without any repeat/provider/APNS effect',
      'no new device/recipient/slot/content after restart',
    );
  } else {
    const normal = await fixture();
    await Promise.all(
      Array.from({ length: 4 }, () =>
        makeReports().runDailyReport(tenantFor(normal)),
      ),
    );
    await context.runAsSystemTenant(normal.tenantId, async () => {
      const run = await store.find(normal.tenantId, normal.periodLocalDate);
      assert.ok(run);
      const frozen = dailyPlan(store, run);
      assert.equal(countCalls(normal.tenantId).length, 8);
      for (const recipient of frozen.recipients)
        assert.deepEqual(
          countCalls(normal.tenantId)
            .filter((c) => c.userId === recipient.userId)
            .map((c) => c.key),
          recipient.slots.map((s) => s.key),
        );
      const executions = await store.executions(run, frozen);
      assert.ok(executions.every((e) => e.state === 'SUCCEEDED'));
      assert.equal(executions.length, 8);
      await reports.runDailyReport(tenantFor(normal));
      assert.equal(countCalls(normal.tenantId).length, 8);
      const changed = structuredClone(frozen);
      changed.content.title += ' changed';
      await assert.rejects(store.admit(changed), /different immutable plan/);
      assert.equal(
        await db.ownerReportRun.count({ where: { tenantId: normal.tenantId } }),
        1,
      );
    });
    checks.push(
      'four concurrent first scheduler calls converge: one root, eight executions/effects',
      'actual Inbox/Telegram/APNS boundaries observe committed full admission and predecessor success',
      'confirmed replay sends nothing; explicit changed plan conflicts',
    );

    const before = await fixture(),
      create = ingress.createExecution.bind(ingress);
    let admissions = 0;
    ingress.createExecution = (request, tx) => {
      if (request.tenantId === before.tenantId && ++admissions === 8)
        throw new Error('synthetic before commit');
      return create(request, tx);
    };
    await assert.rejects(
      reports.runDailyReport(tenantFor(before)),
      /synthetic before commit/,
    );
    ingress.createExecution = create;
    assert.equal(
      await db.ownerReportRun.count({ where: { tenantId: before.tenantId } }),
      0,
    );
    assert.equal(
      await db.actionExecution.count({ where: { tenantId: before.tenantId } }),
      0,
    );
    assert.equal(countCalls(before.tenantId).length, 0);
    const after = await fixture(),
      admit = store.admit.bind(store);
    store.admit = async (...args) => {
      const result = await admit(...args);
      if (args[0].tenantId === after.tenantId)
        throw new Error('synthetic after commit');
      return result;
    };
    await assert.rejects(
      reports.runDailyReport(tenantFor(after)),
      /synthetic after commit/,
    );
    store.admit = admit;
    assert.equal(countCalls(after.tenantId).length, 0);
    assert.equal(
      await db.actionExecution.count({
        where: { tenantId: after.tenantId, state: 'READY' },
      }),
      8,
    );
    const buildsBefore = builds.get(after.tenantId);
    await makeReports().runDailyReport(tenantFor(after));
    assert.equal(builds.get(after.tenantId), buildsBefore);
    assert.equal(countCalls(after.tenantId).length, 8);
    checks.push(
      'crash before commit rolls back every slot with zero effects',
      'crash after commit leaves eight READY slots and resumes without rebuilding content',
    );

    for (const kind of ['telegram-rejected', 'apns-unknown'] as const) {
      const plan = await fixture();
      await context.runAsSystemTenant(plan.tenantId, async () => {
        const run = await store.admit(plan),
          frozen = dailyPlan(store, run),
          recipient = frozen.recipients[0];
        const failed = recipient.slots.find(
          (s) =>
            s.channel === (kind === 'telegram-rejected' ? 'telegram' : 'apns'),
        )!;
        outcomes.set(
          failed.key,
          kind === 'telegram-rejected' ? 'rejected' : 'unknown',
        );
        await reports.runDailyReport(tenantFor(plan));
        const own = countCalls(plan.tenantId).filter(
          (c) => c.userId === recipient.userId,
        );
        assert.deepEqual(
          own.map((c) => c.key),
          recipient.slots
            .slice(0, recipient.slots.indexOf(failed) + 1)
            .map((s) => s.key),
        );
        assert.equal(
          countCalls(plan.tenantId).filter((c) => c.userId !== recipient.userId)
            .length,
          4,
        );
        const effects = countCalls(plan.tenantId).length;
        await makeReports().runDailyReport(tenantFor(plan));
        assert.equal(countCalls(plan.tenantId).length, effects);
        const execution = (await store.executions(run, frozen)).find(
          (e) => e.ownerReportSlotKey === failed.key,
        )!;
        assert.equal(
          execution.state,
          kind === 'telegram-rejected' ? 'FAILED' : 'UNKNOWN',
        );
        assert.equal(execution.executionAttemptCount, 1);
      });
    }
    checks.push(
      'Telegram deterministic failure blocks APNS without fallback',
      'one APNS UNKNOWN blocks later device; independent sibling completes; no blind retry',
    );

    for (const kind of [
      'membership',
      'user',
      'preferences',
      'route',
      'tenant',
    ] as const) {
      const plan = await fixture();
      await context.runAsSystemTenant(plan.tenantId, async () => {
        const run = await store.admit(plan),
          frozen = dailyPlan(store, run),
          recipient = frozen.recipients[0];
        if (kind === 'membership')
          await db.membership.update({
            where: { id: recipient.membershipId },
            data: { status: 'suspended' },
          });
        if (kind === 'user')
          await db.user.update({
            where: { id: recipient.userId },
            data: { status: 'suspended' },
          });
        if (kind === 'preferences')
          await db.dashboardPreference.create({
            data: {
              tenantId: plan.tenantId,
              userId: recipient.userId,
              section: 'assistant',
              configJson: { schema_version: 1, enabled_capabilities: [] },
            },
          });
        if (kind === 'route')
          await db.authIdentity.delete({
            where: {
              id: recipient.slots.find((s) => s.channel === 'telegram')!
                .routeId,
            },
          });
        if (kind === 'tenant')
          await db.tenant.update({
            where: { id: plan.tenantId },
            data: { status: 'suspended' },
          });
        await reports.runDailyReport(tenantFor(plan));
        const own = countCalls(plan.tenantId).filter(
          (c) => c.userId === recipient.userId,
        );
        assert.equal(own.length, kind === 'route' ? 1 : 0);
        if (kind !== 'tenant')
          assert.equal(
            countCalls(plan.tenantId).filter(
              (c) => c.userId !== recipient.userId,
            ).length,
            4,
          );
        assert.equal((await store.executions(run, frozen)).length, 8);
      });
    }
    const nobody = await fixture();
    await db.user.updateMany({
      where: { tenantId: nobody.tenantId },
      data: { status: 'suspended' },
    });
    await reports.runDailyReport(tenantFor(nobody));
    assert.equal(
      await db.ownerReportRun.count({ where: { tenantId: nobody.tenantId } }),
      0,
    );
    assert.equal(builds.get(nobody.tenantId), undefined);
    checks.push(
      'current membership/User/preferences/verified route/tenant revocation prevents effects',
      'no authorized recipient: no report, execution, private composition or effect',
    );

    const partial = await fixture();
    await context.runAsSystemTenant(partial.tenantId, async () => {
      const run = await store.admit(partial),
        plan = dailyPlan(store, run),
        first = plan.recipients[0],
        other = plan.recipients[1],
        telegram = first.slots.find((s) => s.channel === 'telegram')!;
      outcomes.set(telegram.key, 'unknown');
      blocked.add(other.slots[0].key);
      await reports.runDailyReport(tenantFor(partial));
      assert.deepEqual(
        countCalls(partial.tenantId).map((c) => c.key),
        first.slots.slice(0, 2).map((s) => s.key),
      );
      await db.devicePushToken.create({
        data: {
          tenantId: partial.tenantId,
          userId: first.userId,
          platform: 'ios',
          token: 'f'.repeat(64),
        },
      });
      assert.deepEqual(dailyPlan(store, run), plan);
      const executions = await store.executions(run, plan),
        unknown = executions.find(
          (e) => e.ownerReportSlotKey === telegram.key,
        )!;
      assert.equal(unknown.state, 'UNKNOWN');
      assert.equal(unknown.executionAttemptCount, 1);
      await assert.rejects(
        context.runAsSystemTenant(randomUUID(), () =>
          delivery.deliverOwnerReportSlot(
            partial.tenantId,
            run.id,
            telegram.key,
          ),
        ),
      );
      assert.equal(countCalls(partial.tenantId).length, 2);
      if (process.argv[3])
        writeFileSync(
          process.argv[3],
          JSON.stringify({
            tenantId: partial.tenantId,
            date: partial.periodLocalDate,
            id: run.id,
            hash: run.intentHash,
            admittedAt: run.admittedAt.toISOString(),
            executionIds: executions.map((e) => e.id).sort(),
            unknownExecutionId: unknown.id,
            firstUserId: first.userId,
          }),
        );
    });
    checks.push(
      'Telegram UNKNOWN leaves APNS unstarted and original sibling pending for actual restart',
      'new device excluded from immutable plan; wrong tenant rejected before effect',
    );
  }
  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        checks,
        syntheticTransportEffects: calls.length,
        productionMessages: 0,
        productionProviderMutations: 0,
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
