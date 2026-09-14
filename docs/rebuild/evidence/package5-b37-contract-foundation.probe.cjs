// Stage 1 only. Actual TypeScript methods; synthetic read dependencies.
// No application bootstrap, PrismaClient, database, network or domain writes.
// Run from repository root: node docs/rebuild/evidence/package5-b37-contract-foundation.probe.cjs
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const backend = path.join(root, 'maya-saas-backend');
const load = createRequire(path.join(backend, 'package.json'));
load('ts-node').register({ project: path.join(backend, 'tsconfig.json'), transpileOnly: true });
const { ExpenseCanonicalShadowService } = load('./src/expenses/expense-canonical-shadow.service.ts');
const { AiToolRuntimeService } = load('./src/ai-tools/ai-tool-runtime.service.ts');
const { normalizeOwnerReportPlan, OWNER_REPORT_CONTRACT, OWNER_REPORT_ORDER, OWNER_REPORT_ACTION } = load('./src/owner-reports/owner-report.contract.ts');

async function main() {
  let membershipStatus = 'active';
  const planner = new ExpenseCanonicalShadowService(
    {},
    {
      membership: { findUnique: async () => ({ id: 'synthetic-membership', role: 'tenant_owner', status: membershipStatus }) },
      tenant: { findUniqueOrThrow: async () => ({ defaultCurrency: 'RUB' }) },
    },
    { assertTenantId: value => { assert.equal(value, 'synthetic-tenant'); return value; } },
    { encrypt: () => { throw new Error('No note/encryption needed in this probe'); } },
  );
  const dto = { initiator: 'ai_tool', source_intent_ref: 'synthetic-same-update', category: 'supplies', amount_kopecks: 50000, currency: 'RUB', occurred_at: '2026-09-06T12:00:00.000Z' };
  const build = input => planner.buildCreateRequest('synthetic-tenant', 'synthetic-user', input, 'expenses.create.execute.v1');
  const first = await build(dto);
  const repeat = await build(dto);
  const changed = await build({ ...dto, amount_kopecks: 60000 });
  assert.equal(first.callerIdempotency.key, repeat.callerIdempotency.key);
  assert.notEqual(first.callerIdempotency.key, changed.callerIdempotency.key);
  assert.notEqual(first.targetRef, changed.targetRef);
  membershipStatus = 'revoked';
  await assert.rejects(build(dto), /Expense actor is not authorized/);

  const runtime = Object.create(AiToolRuntimeService.prototype);
  const principal = { tenantId: 'synthetic-tenant', userId: 'synthetic-user', surface: 'telegram', role: 'tenant_owner' };
  const definition = { name: 'expenses.create' };
  const args = { category: 'supplies', amount_rubles: 500, occurred_on: '2026-09-06' };
  const sameHash = runtime.inputHash(definition.name, args, principal);
  const changedHash = runtime.inputHash(definition.name, { ...args, amount_rubles: 600 }, principal);
  const approval = { toolName: definition.name, requestedByUserId: principal.userId, surface: principal.surface, payloadHash: sameHash };
  runtime.assertSameApproval(approval, definition, principal, sameHash);
  assert.throws(() => runtime.assertSameApproval(approval, definition, principal, changedHash), error => error.getResponse().error.code === 'ai_approval_idempotency_conflict');

  const plan = {
    contract: OWNER_REPORT_CONTRACT, tenantId: 'synthetic-tenant', reportType: 'daily_report', periodLocalDate: '2026-09-06', reportVersion: 1, timezone: 'UTC',
    periodStart: '2026-09-06T00:00:00.000Z', periodEnd: '2026-09-07T00:00:00.000Z', expiresAt: '2026-09-14T00:00:00.000Z', classification: 'operational_single', channelOrder: OWNER_REPORT_ORDER,
    policy: { action: OWNER_REPORT_ACTION, key: 'production.deliver_report_briefing.proven-cutover', version: 1, preference: 'daily_brief' },
    content: { title: 'Synthetic', bodyText: 'Synthetic', payload: {}, deepLink: '/app/?panel=chat' },
    recipients: [{ userId: 'synthetic-user', membershipId: 'synthetic-membership', role: 'tenant_owner', slots: [{ key: 'a'.repeat(64), routeHash: 'b'.repeat(64), channel: 'inbox', routeId: 'synthetic-membership', destination: 'synthetic-user' }] }],
  };
  normalizeOwnerReportPlan(plan);
  assert.throws(() => normalizeOwnerReportPlan({ ...plan, reportType: 'weekly_expense_reminder' }), /Invalid owner report identity\/order/);

  const files = [
    'maya-saas-backend/src/expenses/expense-canonical-shadow.service.ts',
    'maya-saas-backend/src/expenses/p4-07-expense-executable.service.ts',
    'maya-saas-backend/src/expenses/p4-07-expense-canonical-cutover.service.ts',
    'maya-saas-backend/src/expenses/expenses.controller.ts',
    'maya-saas-backend/src/ai-tools/ai-tool-runtime.service.ts',
    'maya-saas-backend/src/ai-tools/ai-tool.catalog.ts',
    'maya-saas-backend/src/action-engine/action-engine.policy-registry.ts',
    'maya-saas-backend/src/owner-reports/owner-report.contract.ts',
    'maya-saas-backend/prisma/migrations/20260907180000_b36_owner_report_run/migration.sql',
  ];
  console.log(JSON.stringify({
    status: 'PASS_DIAGNOSTIC_GAPS_CONFIRMED', sourceCheckpoint: '7201f7bd',
    checks: {
      dailyReportPlanAccepted: true, weeklyReminderRejectedByB36Normalizer: true,
      expenseSameSourceSameValuesSameDerivedKey: true,
      expenseSameSourceChangedAmountChangesDerivedKeyAndTarget: true,
      revokedMembershipRejectedByExpensePlanner: true,
      existingAiApprovalSameIntentAccepted: true, existingAiApprovalChangedIntentRejected: true,
    },
    limitation: 'Pure source-method proof only. No claim of B37 admitted execution, PostgreSQL behavior, staff Telegram authentication, durable reply binding or runtime remediation.',
    sourceHashes: Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex')])),
    databasesOpened: 0, productionMessages: 0, productionExpenseMutations: 0, processHygiene: 0,
  }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
