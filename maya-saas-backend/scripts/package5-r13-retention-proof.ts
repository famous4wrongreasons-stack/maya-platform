import { AuditLogService } from '../src/audit-log/audit-log.service';
import assert from 'node:assert/strict';
import {
  ActionEngineKernel,
  CanonicalActionIngressService,
} from '../src/action-engine';
import { AiToolPolicyService } from '../src/ai-tools/ai-tool-policy.service';
import { AiToolRegistryService } from '../src/ai-tools/ai-tool-registry.service';
import { EncryptionService } from '../src/encryption/encryption.service';
import type { EntitlementsService } from '../src/entitlements/entitlements.service';
import { ExpenseReminderStore } from '../src/expense-intake/expense-reminder.store';
import {
  expenseWeek,
  expenseDay,
} from '../src/expense-intake/expense-reminder.contract';
import { localDateMinuteToUtc } from '../src/internal-calendar/internal-calendar.utils';
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

const week = expenseWeek('Europe/Moscow', new Date()),
  start = expenseDay(week.start, -28),
  end = expenseDay(start, 6),
  old = localDateMinuteToUtc(end, 20 * 60 + 10, 'Europe/Moscow');
// Only synthetic insert defaults use the past trusted clock. No historical
// production row is updated and no retention rule is bypassed.
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
const engine = new ActionEngineKernel(
    fixtureDb,
    { identitySecret: secret, payloadEncryptionSecret: secret, now: () => old },
    caps,
    resolver,
    {
      audit: new AuditLogService(fixtureDb, context),
      encryption: new EncryptionService(config),
    },
  ),
  ingress = new CanonicalActionIngressService(engine, resolver),
  registry = new AiToolRegistryService();
const feature = {
  assertFeature: async () => await Promise.resolve(undefined),
} as unknown as EntitlementsService;
const store = new ExpenseReminderStore(
  fixtureDb,
  context,
  new EncryptionService(config),
  ingress,
  engine,
  new AiToolPolicyService(context, feature, registry),
  registry,
  () => old,
);
async function main() {
  await db.$connect();
  async function fixture(kind: 'resolved' | 'pending' | 'unknown' | 'empty') {
    const tenant = await tenantFixture();
    if (kind !== 'empty') {
      const staff = await staffFixture(tenant.id);
      await db.authIdentity.create({
        data: {
          tenantId: tenant.id,
          userId: staff.user.id,
          provider: 'telegram',
          providerUserId: '91301',
        },
      });
      await db.dashboardPreference.create({
        data: {
          tenantId: tenant.id,
          userId: staff.user.id,
          section: 'assistant',
          configJson: {
            schema_version: 1,
            enabled_capabilities: ['weekly_expense_reminders'],
          },
        },
      });
    }
    return context.runAsSystemTenant(tenant.id, async () => {
      const root = await store.admit(tenant.id, start, end),
        rows = await store.executions(root);
      if (kind === 'resolved' || kind === 'unknown') {
        const execution = rows[0],
          claim = await engine.claimExecution({
            tenantId: tenant.id,
            executionId: execution.id,
            workerId: 'r13.synthetic.retention',
          });
        if (kind === 'resolved')
          await engine.finalizeDefinitiveFailure({
            tenantId: tenant.id,
            executionId: execution.id,
            attemptId: claim.attempt.id,
            leaseToken: claim.leaseToken,
            outcomeCode: 'synthetic_recipient_revoked',
            errorClass: 'synthetic',
          });
        else {
          await engine.markDispatchMayHaveCrossed({
            tenantId: tenant.id,
            executionId: execution.id,
            attemptId: claim.attempt.id,
            leaseToken: claim.leaseToken,
          });
          await engine.finalizeUnknown({
            tenantId: tenant.id,
            executionId: execution.id,
            attemptId: claim.attempt.id,
            leaseToken: claim.leaseToken,
            outcomeCode: 'synthetic_provider_uncertain',
            errorClass: 'synthetic',
          });
        }
      }
      await assert.rejects(
        db.expenseReminderRun.update({
          where: { id: root.id },
          data: { intentEncrypted: null },
        }),
      );
      const ac6 = new Package5Wave6MaintenanceService(db, context),
        prepared = await ac6.prepare({
          actionClass: 'purge_expense_reminder_payloads',
          batchSize: 10,
        });
      const result = await Promise.all([
          ac6.execute(prepared),
          ac6.execute(prepared),
        ]),
        expected = ['resolved', 'empty'].includes(kind) ? 1 : 0;
      assert.ok(result.some((r) => r.deleted === expected));
      assert.equal((await ac6.execute(prepared)).deleted, expected);
      const after = await store.load(tenant.id, root.id);
      assert.equal(after.intentEncrypted === null, expected === 1);
      assert.equal(after.intentHash, root.intentHash);
      assert.equal(
        after.auditRetentionUntil.getTime(),
        root.auditRetentionUntil.getTime(),
      );
      assert.equal(
        await db.actionExecution.count({ where: { tenantId: tenant.id } }),
        rows.length,
      );
      assert.equal(
        await db.expense.count({ where: { tenantId: tenant.id } }),
        0,
      );
      assert.equal(
        await db.aiApprovalRequest.count({ where: { tenantId: tenant.id } }),
        0,
      );
      assert.equal((await store.admit(tenant.id, start, end)).id, root.id);
      if (expected) assert.throws(() => store.read(after), /unavailable/);
      await assert.rejects(
        db.expenseReminderRun.delete({ where: { id: root.id } }),
      );
      return kind;
    });
  }
  const checks = [];
  for (const kind of ['resolved', 'pending', 'unknown', 'empty'] as const)
    checks.push(await fixture(kind));
  console.log(
    JSON.stringify(
      {
        package: 'R13',
        scope: 'actual AC6 concurrent retention',
        result: 'PASS',
        checks,
        hashAndAuditRetained: true,
        unresolvedHeld: true,
        ordinaryClearAndDeleteDenied: true,
        expiredIdentityReused: true,
        approvalAndExpenseWrites: 0,
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
