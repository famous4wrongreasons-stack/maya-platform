import { EncryptionService } from '../src/encryption/encryption.service';
import { AuditLogService } from '../src/audit-log/audit-log.service';
import assert from 'node:assert/strict';
import { ConfigService } from '@nestjs/config';
import {
  ActionEngineKernel,
  CanonicalActionIngressService,
} from '../src/action-engine';
import { OperationalAlertStore } from '../src/operational-alerts/operational-alert.store';
import { OperationalAlertPayloadVerifier } from '../src/operational-alerts/operational-alert-payload-verifier';
import {
  ALERT_CONTRACT,
  alertPolicy,
  type AlertPlan,
} from '../src/operational-alerts/operational-alert.contract';
import { Package5Wave6MaintenanceService } from '../src/package5-wave6/package5-wave6.service';
import {
  caps,
  config,
  context,
  db,
  resolver,
  secret,
  staffFixture,
  tenantFixture,
} from './package5-wave-rc-proof-support';
const old = new Date(Date.now() - 8 * 86400000),
  clock = () => old;
// Only synthetic fixture insertion aligns database defaults with its trusted old clock.
const fixtureDb = db.$extends({
  query: {
    actionExecution: {
      async create({ args, query }) {
        args.data.createdAt = old;
        args.data.updatedAt = old;
        return query(args);
      },
    },
  },
}) as unknown as typeof db;
const kernel = new ActionEngineKernel(
    fixtureDb,
    { identitySecret: secret, payloadEncryptionSecret: secret, now: clock },
    caps,
    resolver,
    {
      audit: new AuditLogService(fixtureDb, context),
      encryption: new EncryptionService(config),
    },
  ),
  ingress = new CanonicalActionIngressService(kernel, resolver);
const settings = new ConfigService({
    CRM_ENCRYPTION_KEY: secret,
    OPERATIONAL_ALERTS_CANONICAL_CUTOVER_AT: new Date(
      old.getTime() - 86400000,
    ).toISOString(),
  }),
  store = new OperationalAlertStore(fixtureDb, context, ingress, settings),
  verifier = new OperationalAlertPayloadVerifier(store, kernel);
const checks: string[] = [];
async function main() {
  await db.$connect();
  const tenant = await tenantFixture(),
    member = await staffFixture(tenant.id, 'staff'),
    branch = await db.branch.create({
      data: { tenantId: tenant.id, name: 'Synthetic expired shift' },
    }),
    staff = await db.staff.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        userId: member.user.id,
        encryptedDisplayName: 'Synthetic',
      },
    });
  await context.runAsSystemTenant(tenant.id, async () => {
    async function fixture(label: string) {
      const occurrenceRef = store.identity.hmac(
          'synthetic-expired-occurrence',
          { tenantId: tenant.id, label },
        ),
        key = store.identity.hmac('maya.operational-alert-slot/1', {
          tenantId: tenant.id,
          occurrenceRef,
          userId: member.user.id,
          membershipId: member.member.id,
          channel: 'inbox',
        }),
        end = new Date(old.getTime() + 3600000);
      const plan: AlertPlan = {
        contract: ALERT_CONTRACT,
        tenantId: tenant.id,
        alertType: 'staff_shift_reminder',
        occurrenceRef,
        contractVersion: 1,
        occurredAt: old.toISOString(),
        expiresAt: end.toISOString(),
        source: {
          staffId: staff.id,
          branchId: branch.id,
          calendarSource: 'internal',
          integrationId: null,
          staffProviderLinkId: null,
          localDate: old.toISOString().slice(0, 10),
          timezone: 'UTC',
          leadMinutes: 60,
          scheduledStartAt: end.toISOString(),
          scheduleEvidenceHash: store.identity.hmac('synthetic-schedule', {
            label,
          }),
        },
        policy: alertPolicy('staff_shift_reminder'),
        recipients: [
          {
            userId: member.user.id,
            membershipId: member.member.id,
            role: member.member.role,
            branchScope: 'tenant',
            content: {
              title: 'Synthetic expired shift',
              bodyText: 'Synthetic immutable payload',
              deepLink: '/app/?panel=schedule',
              payload: {},
            },
            slot: {
              key,
              channel: 'inbox',
              routeId: member.member.id,
              destination: member.user.id,
            },
          },
        ],
      };
      // This old clock/source is an explicit synthetic precondition, never import/backfill.
      const root = await store.admit(plan, () => Promise.resolve(), old),
        execution = (await store.executions(root, plan))[0];
      return { root, execution };
    }
    const expired = await fixture('resolved'),
      pending = await fixture('pending'),
      unknown = await fixture('unknown');
    const claim = await kernel.claimExecution({
      tenantId: tenant.id,
      executionId: expired.execution.id,
      workerId: 'synthetic-expired-owner',
    });
    await kernel.finalizeDefinitiveFailure({
      tenantId: tenant.id,
      executionId: expired.execution.id,
      attemptId: claim.attempt.id,
      leaseToken: claim.leaseToken,
      outcomeCode: 'source_revoked_before_dispatch',
      errorClass: 'canonical_source_denied',
    });
    const uncertainty = await kernel.claimExecution({
      tenantId: tenant.id,
      executionId: unknown.execution.id,
      workerId: 'synthetic-uncertainty',
    });
    await kernel.markDispatchMayHaveCrossed({
      tenantId: tenant.id,
      executionId: unknown.execution.id,
      attemptId: uncertainty.attempt.id,
      leaseToken: uncertainty.leaseToken,
    });
    await kernel.finalizeUnknown({
      tenantId: tenant.id,
      executionId: unknown.execution.id,
      attemptId: uncertainty.attempt.id,
      leaseToken: uncertainty.leaseToken,
      outcomeCode: 'synthetic_outcome_uncertain',
      errorClass: 'synthetic',
    });
    const ac6 = new Package5Wave6MaintenanceService(
        db,
        context,
        undefined,
        undefined,
        verifier,
      ),
      run = await ac6.prepare({
        actionClass: 'purge_operational_alert_payloads',
        batchSize: 10,
      }),
      results = await Promise.all([ac6.execute(run), ac6.execute(run)]);
    assert.ok(results.some((r) => r.deleted === 1));
    assert.equal(
      (
        await db.operationalAlertRun.findUniqueOrThrow({
          where: { id: expired.root.id },
        })
      ).intentEncrypted,
      null,
    );
    for (const held of [pending, unknown])
      assert.ok(
        (
          await db.operationalAlertRun.findUniqueOrThrow({
            where: { id: held.root.id },
          })
        ).intentEncrypted,
      );
    assert.equal(
      await db.actionExecution.count({ where: { tenantId: tenant.id } }),
      3,
    );
    assert.equal((await ac6.execute(run)).deleted, 1);
    checks.push(
      'exact manifest/slot verifier + actual AC6 concurrent claim erases only expired resolved payload; pending/UNKNOWN retained; same-run resume',
    );
    await assert.rejects(
      db.operationalAlertRun.update({
        where: { id: unknown.root.id },
        data: { intentEncrypted: null },
      }),
    );
    await assert.rejects(
      db.operationalAlertRun.delete({ where: { id: expired.root.id } }),
    );
    checks.push(
      'ordinary root clear/delete rejected; root/hash/time/AE tombstones retained',
    );
  });
  console.log(
    JSON.stringify(
      {
        package: 'R06',
        scope: 'actual AC6 runtime retention',
        result: 'PASS',
        checks,
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
