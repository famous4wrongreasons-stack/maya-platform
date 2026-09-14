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
  normalizeCanonicalOwnerReportPlan,
  MORNING_REPORT_CONTRACT,
  type MorningReportPlan,
  type CanonicalOwnerReportPlan,
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
assert.equal(url.port, '55509');
assert.equal(url.pathname, '/maya_rc_clean_replay');
const secret = 'b36-schema-fixture-secret-not-production';
const config = new ConfigService({
  DATABASE_URL: url.toString(),
  CRM_ENCRYPTION_KEY: secret,
  OWNER_REPORTS_MORNING_HOUR: '0',
  OWNER_REPORTS_MORNING_CANONICAL_CUTOVER_AT: new Date(
    Date.now() - 2 * OWNER_REPORT_DAY,
  ).toISOString(),
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
  return invoke(tenant, run, slot);
};
async function record(channel: string, destination: string) {
  const tenantId = context.requireTenantId();
  const runs = await db.ownerReportRun.findMany({ where: { tenantId } });
  const matches = [];
  for (const run of runs) {
    const plan = store.readPlan(run);
    const executions = await store.executions(run, plan);
    for (const recipient of plan.recipients)
      for (const slot of recipient.slots) {
        const own = executions.find((e) => e.ownerReportSlotKey === slot.key);
        if (
          slot.channel === channel &&
          slot.destination === destination &&
          own?.state === 'EXECUTING'
        )
          matches.push({ run, plan, executions, recipient, slot, own });
      }
  }
  assert.equal(
    matches.length,
    1,
    'Exactly one already admitted/claimed matching slot before effect',
  );
  const { run, plan, executions, recipient, slot, own } = matches[0];
  assert.equal(
    executions.length,
    plan.recipients.flatMap((r) => r.slots).length,
  );
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
const tenantFor = (plan: CanonicalOwnerReportPlan) => ({
  id: plan.tenantId,
  slug: 'synthetic',
  name: 'Synthetic',
  defaultTimezone: plan.timezone,
});
const countCalls = (tenantId: string) =>
  calls.filter((c) => c.tenantId === tenantId);

async function morningFixture(
  kind: MorningReportPlan['reportType'],
  calendar: 'internal' | 'external' = 'internal',
) {
  const v1 = await fixture();
  await db.tenant.update({
    where: { id: v1.tenantId },
    data: { calendarSource: calendar },
  });
  const { content, ...common } = v1;
  if (calendar === 'external')
    await db.crmIntegration.create({
      data: {
        tenantId: v1.tenantId,
        provider: 'yclients',
        encryptedApiToken: 'synthetic-only',
        settingsJson: { companyId: 'synthetic-company' },
      },
    });
  const recipients: MorningReportPlan['recipients'] = [];
  for (const [index, recipient] of v1.recipients.entries()) {
    let staffId: string | null = null,
      staffBindingEvidenceHash: string | null = null;
    if (kind === 'morning_staff') {
      const staff = await db.staff.create({
        data: { tenantId: v1.tenantId, userId: recipient.userId },
      });
      staffId = staff.id;
      if (calendar === 'internal')
        await db.internalProvider.create({
          data: {
            id: staff.id,
            tenantId: v1.tenantId,
            userId: recipient.userId,
            displayName: 'synthetic',
          },
        });
      else {
        await db.staffProviderLink.create({
          data: {
            tenantId: v1.tenantId,
            staffId: staff.id,
            provider: 'yclients',
            externalId: 'synthetic-' + index,
          },
        });
        await db.crmStaffAccess.create({
          data: {
            tenantId: v1.tenantId,
            staffId: staff.id,
            userId: recipient.userId,
            externalStaffId: 'synthetic-' + index,
            encryptedDisplayName: 'synthetic',
            role: 'tenant_owner',
            status: 'active',
          },
        });
      }
      const binding = await context.runAsSystemTenant(v1.tenantId, () =>
        store.staffBinding(v1.tenantId, recipient.userId),
      );
      assert.ok(binding);
      staffBindingEvidenceHash = binding.evidenceHash;
    }
    recipients.push({
      ...recipient,
      staffId,
      staffBindingEvidenceHash,
      content: {
        ...content,
        bodyText: 'ONLY RECIPIENT ' + index,
        payload: { recipient: index },
      },
    });
  }
  const plan = normalizeCanonicalOwnerReportPlan({
    ...common,
    contract: MORNING_REPORT_CONTRACT,
    reportType: kind,
    recipients,
  });
  assert.equal(plan.contract, MORNING_REPORT_CONTRACT);
  return plan;
}
async function main() {
  for (const kind of ['morning_owner', 'morning_staff'] as const) {
    const plan = await morningFixture(kind);
    await context.runAsSystemTenant(plan.tenantId, async () => {
      const roots = await Promise.all(
        Array.from({ length: 4 }, () => store.admit(plan)),
      );
      assert.equal(new Set(roots.map((r) => r.id)).size, 1);
      const run = roots[0];
      assert.equal((await store.executions(run, plan)).length, 8);
      assert.equal(countCalls(plan.tenantId).length, 0);
      const changed = structuredClone(plan);
      changed.recipients[0].content.bodyText += ' changed';
      await assert.rejects(store.admit(changed), /different immutable plan/);
      await reports.runMorningBrief(tenantFor(plan));
      const rows = await store.executions(run, plan);
      assert.ok(rows.every((e) => e.state === 'SUCCEEDED'));
      for (const recipient of plan.recipients) {
        const snapshot = await store.snapshot(
          plan.tenantId,
          recipient.userId,
          run.id,
        );
        assert.deepEqual(snapshot.content, recipient.content);
        const stored = await db.inboxItem.findMany({
          where: {
            tenantId: plan.tenantId,
            userId: recipient.userId,
            type: 'morning_brief',
          },
        });
        assert.ok(
          stored.some((row) => row.bodyText === recipient.content.bodyText),
        );
      }
      await assert.rejects(
        store.snapshot(plan.tenantId, 'wrong-user', run.id),
        /SNAPSHOT_NOT_OWNED/,
      );
      const before = countCalls(plan.tenantId).length;
      await makeReports().runMorningBrief(tenantFor(plan));
      assert.equal(countCalls(plan.tenantId).length, before);
      assert.equal(
        builds.get(plan.tenantId) ?? 0,
        kind === 'morning_owner' ? 0 : 1,
      );
    });
    checks.push(
      kind +
        ': atomic four-way admission, changed intent conflict, scoped snapshot and unchanged restart outcome',
    );
  }
  for (const calendar of ['internal', 'external'] as const) {
    const plan = await morningFixture('morning_staff', calendar);
    await context.runAsSystemTenant(plan.tenantId, async () => {
      const first = plan.recipients[0];
      await db.staff.update({
        where: { id: first.staffId! },
        data: { active: false },
      });
      await assert.rejects(store.admit(plan), /STAFF_BINDING_REVOKED/);
      assert.equal(
        await db.ownerReportRun.count({ where: { tenantId: plan.tenantId } }),
        0,
      );
      assert.equal(
        await db.actionExecution.count({ where: { tenantId: plan.tenantId } }),
        0,
      );
      await db.staff.update({
        where: { id: first.staffId! },
        data: { active: true },
      });
      const run = await store.admit(plan);
      if (calendar === 'external')
        await db.staffProviderLink.updateMany({
          where: { tenantId: plan.tenantId, staffId: first.staffId! },
          data: { unlinkedAt: new Date() },
        });
      else
        await db.internalProvider.update({
          where: { id: first.staffId! },
          data: { userId: null },
        });
      await assert.rejects(
        store.snapshot(plan.tenantId, first.userId, run.id),
        /STAFF_BINDING_REVOKED/,
      );
      await assert.rejects(
        delivery.deliverOwnerReportSlot(
          plan.tenantId,
          run.id,
          first.slots[0].key,
        ),
      );
      assert.equal(countCalls(plan.tenantId).length, 0);
    });
    checks.push(
      calendar +
        ': current exact Staff/calendar binding is required before admission/read/dispatch',
    );
  }
  for (const failure of ['unknown', 'rejected'] as const) {
    const plan = await morningFixture('morning_owner');
    await context.runAsSystemTenant(plan.tenantId, async () => {
      const run = await store.admit(plan),
        first = plan.recipients[0];
      const tg = first.slots.find((s) => s.channel === 'telegram')!;
      outcomes.set(tg.key, failure);
      await reports.runMorningBrief(tenantFor(plan));
      const firstCalls = countCalls(plan.tenantId).filter(
        (c) => c.userId === first.userId,
      );
      assert.deepEqual(
        firstCalls.map((c) => c.channel),
        ['inbox', 'telegram'],
      );
      assert.equal(
        countCalls(plan.tenantId).filter(
          (c) => c.userId === plan.recipients[1].userId,
        ).length,
        4,
      );
      const ids = (await store.executions(run, plan)).map((e) => e.id).sort();
      await db.devicePushToken.create({
        data: {
          tenantId: plan.tenantId,
          userId: first.userId,
          platform: 'ios',
          token: randomUUID().replaceAll('-', '').repeat(2),
        },
      });
      await makeReports().runMorningBrief(tenantFor(plan));
      assert.deepEqual(
        (await store.executions(run, plan)).map((e) => e.id).sort(),
        ids,
      );
      assert.equal(
        countCalls(plan.tenantId).filter((c) => c.userId === first.userId)
          .length,
        2,
      );
      assert.deepEqual(store.readPlan(run), plan);
    });
    checks.push(
      failure +
        ': Telegram stops own APNS, other recipients continue, new device/restart cannot expand plan',
    );
  }
  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        checks,
        syntheticTransportEffects: calls.length,
        productionMessages: 0,
        productionMutations: 0,
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
  .finally(() => db.$disconnect());
