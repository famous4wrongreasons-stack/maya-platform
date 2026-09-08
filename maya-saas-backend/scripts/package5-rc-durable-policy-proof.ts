import {
  DURABLE_CLAIM_POLICY_AUDIT,
  RC_DURABLE_COMMANDS,
  rcPolicyResumeCandidate,
} from '../src/action-engine/action-engine.durable-policy';
import { ownerReportRequest } from '../src/owner-reports/owner-report.contract';
import { EncryptionService } from '../src/encryption/encryption.service';
import { AuditLogService } from '../src/audit-log/audit-log.service';
import { Prisma } from '@prisma/client';
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
assert.ok(
  (url.port === '55506' && url.pathname === '/maya_b36_runtime') ||
    (url.port === '55509' && url.pathname === '/maya_rc_b36_runtime'),
  'Only an isolated B36/Wave R-C proof database is allowed',
);
let clock = new Date();
let allowed = true;
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
        enabled: allowed,
      })),
      allowed,
      evaluatedAt: new Date(),
      validUntil: new Date('2099-01-01T00:00:00Z'),
    }),
};
const resolver = new CanonicalActionPolicyResolver(
  db,
  entitlements,
  { attestationSecret: secret, now: () => clock },
  createCanonicalProductionPolicyRegistry(caps),
  caps,
);
const engine = new ActionEngineKernel(
  db,
  { identitySecret: secret, payloadEncryptionSecret: secret, now: () => clock },
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
const admission = (
  e: Prisma.ActionExecutionGetPayload<Record<string, never>>,
) =>
  Object.fromEntries(
    [
      'id',
      'tenantId',
      'sourceRef',
      'targetRef',
      'identityFingerprint',
      'requestIdempotencyKeyHash',
      'normalizedInputHash',
      'normalizedInputEncrypted',
      'policyContextHash',
      'policyEvidenceJson',
      'policyEvaluatedAt',
      'policyValidUntil',
      'approvalBindingHash',
      'approvalExpiresAt',
      'ownerReportRunId',
      'ownerReportSlotKey',
      'intentExpiresAt',
    ].map((k) => [k, e[k as keyof typeof e]]),
  );
async function scenario(
  name: string,
  work: (f: Awaited<ReturnType<typeof admitted>>) => Promise<void>,
) {
  clock = new Date();
  allowed = true;
  const f = await admitted();
  await context.runAsSystemTenant(f.plan.tenantId, () => work(f));
  assert.deepEqual(
    admission(
      await db.actionExecution.findUniqueOrThrow({ where: { id: f.row.id } }),
    ),
    admission(f.row),
  );
  checks.push(name);
}
async function admitted() {
  const plan = await fixture();
  const run = await context.runAsSystemTenant(plan.tenantId, () =>
    store.admit(plan),
  );
  const recipient = plan.recipients[0],
    slot = recipient.slots[0];
  const row = await db.actionExecution.findFirstOrThrow({
    where: {
      tenantId: plan.tenantId,
      ownerReportRunId: run.id,
      ownerReportSlotKey: slot.key,
    },
  });
  assert.equal(row.state, 'READY');
  assert.equal(
    row.policyValidUntil!.getTime() - row.policyEvaluatedAt!.getTime(),
    60000,
  );
  const key = {
    tenantId: plan.tenantId,
    executionId: row.id,
    workerId: 'rc.policy-proof',
  };
  return {
    plan,
    run,
    recipient,
    slot,
    row,
    key,
    request: ownerReportRequest(run.id, store.identity, plan, recipient, slot),
  };
}
type Fixture = Awaited<ReturnType<typeof admitted>>;
const advance = (f: Fixture, ms = 900000) => {
  clock = new Date(f.row.policyValidUntil!.getTime() + ms);
};
async function untouched(f: Fixture, work: () => Promise<unknown>) {
  await assert.rejects(work);
  assert.equal(
    await db.actionAttempt.count({ where: { actionExecutionId: f.row.id } }),
    0,
  );
  assert.equal(
    await db.auditLog.count({
      where: {
        tenantId: f.plan.tenantId,
        entityId: f.row.id,
        action: DURABLE_CLAIM_POLICY_AUDIT,
      },
    }),
    0,
  );
  assert.equal(
    (await db.actionExecution.findUniqueOrThrow({ where: { id: f.row.id } }))
      .state,
    'READY',
  );
}
async function claim(f: Fixture) {
  await store.assertDispatchAllowed(f.run, f.plan, f.recipient, f.slot);
  return engine.claimExecution(f.key);
}
async function effect(f: Fixture, c: Awaited<ReturnType<typeof claim>>) {
  const key = { ...f.key, attemptId: c.attempt.id, leaseToken: c.leaseToken };
  await engine.markDispatchMayHaveCrossed(key);
  await engine.markDispatchAcknowledged(key);
  await engine.finalizeSuccess({
    ...key,
    outcomeCode: 'synthetic_policy_success',
    safeResult: { synthetic: true },
  });
}
async function main() {
  await db.$connect();
  assert.equal(RC_DURABLE_COMMANDS.size, 13);
  for (const capability of [
    'crm.appointment.create.v1',
    'crm.appointment.attendance.v1',
    'client.consent.execute.v1',
    'communication.bulk-campaign.execute.v1',
  ])
    assert.equal(
      rcPolicyResumeCandidate({
        capability,
        capabilityVersion: 1,
        approvalRequirement: 'NONE',
        approvalDecision: 'NOT_REQUIRED',
        policyDecision: 'ALLOW',
        dryRun: false,
      } as Fixture['row']),
      false,
    );
  await scenario(
    'immediate ALLOW; atomic claim audit; original admission preserved',
    async (f) => {
      const c = await claim(f);
      await effect(f, c);
    },
  );
  await scenario(
    'delayed >15 minutes ALLOW; same execution; terminal success cannot replay',
    async (f) => {
      advance(f);
      const c = await claim(f);
      await effect(f, c);
      await assert.rejects(() => engine.claimExecution(f.key));
      assert.equal(
        await db.actionAttempt.count({
          where: { actionExecutionId: f.row.id },
        }),
        1,
      );
      const logs = await db.auditLog.findMany({
        where: {
          tenantId: f.plan.tenantId,
          entityId: f.row.id,
          action: DURABLE_CLAIM_POLICY_AUDIT,
        },
      });
      assert.equal(logs.length, 1);
      const evidence = logs[0].metadataJson as Record<string, unknown>;
      assert.equal(evidence.attemptId, c.attempt.id);
      assert.equal(evidence.originalPolicyContextHash, f.row.policyContextHash);
      assert.notEqual(evidence.policyContextHash, f.row.policyContextHash);
      assert.equal(evidence.policyEvaluatedAt, clock.toISOString());
    },
  );
  await scenario(
    'delayed current DENY has no claim/effect; old ALLOW cannot override',
    async (f) => {
      advance(f);
      allowed = false;
      await untouched(f, () => engine.claimExecution(f.key));
    },
  );
  await scenario(
    'recipient Membership revoked before delayed claim: no effect',
    async (f) => {
      advance(f);
      await db.membership.update({
        where: { id: f.recipient.membershipId },
        data: { status: 'suspended' },
      });
      await untouched(f, () => claim(f));
    },
  );
  await scenario(
    'exact planned Telegram identity revoked: no fallback/reselection',
    async (f) => {
      const slot = f.recipient.slots.find((s) => s.channel === 'telegram')!;
      await db.authIdentity.delete({ where: { id: slot.routeId } });
      advance(f);
      await assert.rejects(() =>
        store.assertDispatchAllowed(f.run, f.plan, f.recipient, slot),
      );
      assert.equal(
        await db.actionAttempt.count({
          where: { actionExecutionId: f.row.id },
        }),
        0,
      );
    },
  );
  await scenario(
    'business intent expiry cannot be renewed by fresh ALLOW',
    async (f) => {
      clock = new Date(f.run.expiresAt.getTime() + 1);
      await untouched(f, () => claim(f));
    },
  );
  await scenario(
    'concurrent delayed claims: one original execution/attempt/audit winner',
    async (f) => {
      advance(f);
      const result = await Promise.allSettled([claim(f), claim(f), claim(f)]),
        winners = result.filter((r) => r.status === 'fulfilled');
      assert.equal(winners.length, 1);
      await effect(f, winners[0].value);
      assert.equal(
        await db.actionAttempt.count({
          where: { actionExecutionId: f.row.id },
        }),
        1,
      );
      assert.equal(
        await db.auditLog.count({
          where: { entityId: f.row.id, action: DURABLE_CLAIM_POLICY_AUDIT },
        }),
        1,
      );
    },
  );
  await scenario(
    'audit unavailable: claim/attempt roll back together before effect',
    async (f) => {
      advance(f);
      const unavailable = new ActionEngineKernel(
        db,
        {
          identitySecret: secret,
          payloadEncryptionSecret: secret,
          now: () => clock,
        },
        caps,
        resolver,
        {
          audit: {
            log: () => Promise.reject(new Error('synthetic audit unavailable')),
          },
          encryption: new EncryptionService(config),
        },
      );
      await untouched(f, () => unavailable.claimExecution(f.key));
    },
  );
  await scenario(
    'policy revoked between claim and dispatch: dispatch remains NOT_CROSSED',
    async (f) => {
      advance(f);
      const c = await claim(f);
      allowed = false;
      await assert.rejects(() =>
        engine.markDispatchMayHaveCrossed({
          ...f.key,
          attemptId: c.attempt.id,
          leaseToken: c.leaseToken,
        }),
      );
      assert.equal(
        (
          await db.actionAttempt.findUniqueOrThrow({
            where: { id: c.attempt.id },
          })
        ).externalDispatchState,
        'NOT_CROSSED',
      );
    },
  );
  await scenario(
    'expired claim evidence/lease never grants delayed effect',
    async (f) => {
      advance(f);
      const c = await claim(f);
      clock = new Date(clock.getTime() + 61000);
      await assert.rejects(() =>
        engine.markDispatchMayHaveCrossed({
          ...f.key,
          attemptId: c.attempt.id,
          leaseToken: c.leaseToken,
        }),
      );
      await engine.recoverExpiredClaim(f.key);
      assert.equal(
        (
          await db.actionAttempt.findUniqueOrThrow({
            where: { id: c.attempt.id },
          })
        ).externalDispatchState,
        'NOT_CROSSED',
      );
    },
  );
  await scenario(
    'UNKNOWN cannot use policy refresh as a new claim or channel escape',
    async (f) => {
      const c = await claim(f),
        key = { ...f.key, attemptId: c.attempt.id, leaseToken: c.leaseToken };
      await engine.markDispatchMayHaveCrossed(key);
      await engine.finalizeUnknown({
        ...key,
        outcomeCode: 'synthetic_unknown',
        errorClass: 'synthetic_transport_unknown',
      });
      advance(f);
      await assert.rejects(() => engine.claimExecution(f.key));
      assert.equal(
        await db.actionAttempt.count({
          where: { actionExecutionId: f.row.id },
        }),
        1,
      );
    },
  );
  await scenario('deterministic terminal failure cannot revive', async (f) => {
    const c = await claim(f);
    await engine.finalizeDefinitiveFailure({
      ...f.key,
      attemptId: c.attempt.id,
      leaseToken: c.leaseToken,
      outcomeCode: 'synthetic_rejected',
      errorClass: 'permanent_rejection',
    });
    advance(f);
    await assert.rejects(() => engine.claimExecution(f.key));
    assert.equal(
      await db.actionAttempt.count({ where: { actionExecutionId: f.row.id } }),
      1,
    );
  });
  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        checks,
        immutableAdmissionsPreserved: true,
        originalPolicyTtlMs: 60000,
        controlledDelayedMs: 960000,
        productionEffects: 0,
      },
      null,
      2,
    ),
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
