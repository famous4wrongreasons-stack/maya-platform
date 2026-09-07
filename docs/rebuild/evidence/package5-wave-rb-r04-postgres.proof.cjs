/* Run from backend with ts-node/register/transpile-only. Synthetic local DB only. */
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const path = require('node:path');
const root = process.cwd(), db = process.env.DATABASE_URL || '', url = new URL(db);
assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '55508'); assert.equal(url.pathname, '/maya_rb_r04');
const from = name => require(path.join(root, name));
const {PrismaClient} = from('node_modules/@prisma/client');
const {PrismaPg} = from('node_modules/@prisma/adapter-pg');
const {createStandaloneCanonicalActionEngine} = from('src/action-engine');
const {Package5Wave1ShadowService, Package5Wave1ExecutableService} = from('src/package5-wave1/package5-wave1.service');
const {Package5Wave1CanonicalCutoverService} = from('src/package5-wave1/package5-wave1-canonical-cutover.service');
const {OperationalWorkController} = from('src/package5-wave1/operational-work.controller');
const {FEATURE_REQUIREMENT_DECISION_CONTRACT} = from('src/entitlements/entitlements.service');
const prisma = new PrismaClient({adapter: new PrismaPg({connectionString: db})});
const NOW = new Date('2026-09-07T21:00:00Z'), secret = 'r04-synthetic-secret-'.repeat(6);
let checks = 0, projectionFails = false, projectionCalls = 0;
function check(condition, label) { assert.ok(condition, label); checks++; }
async function reject(fn, label) { let failed = false; try { await fn(); } catch { failed = true; } check(failed, label); }
async function scope(label) {
  const suffix = randomUUID().replaceAll('-', ''), tenantId = 'r04_' + label + '_' + suffix;
  const owner = 'owner_' + suffix, staff = 'staff_' + suffix;
  await prisma.tenant.create({data: {id: tenantId, name: 'Synthetic R04', slug: tenantId, status: 'active', calendarSource: 'internal', users: {create: [
    {id: owner, email: owner + '@proof.invalid', passwordHash: 'not-real', role: 'tenant_owner', memberships: {create: {tenantId, role: 'tenant_owner', status: 'active'}}},
    {id: staff, email: staff + '@proof.invalid', passwordHash: 'not-real', role: 'staff', memberships: {create: {tenantId, role: 'staff', status: 'active'}}},
  ]}}});
  const actors = {};
  for (const [name, userId] of [['owner', owner], ['staff', staff]]) {
    const m = await prisma.membership.findUnique({where: {userId_tenantId: {userId, tenantId}}});
    actors[name] = {tenantId, userId, membershipId: m.id, membershipStatus: 'active', role: m.role};
  }
  return {tenantId, ...actors};
}
function build() {
  const engine = createStandaloneCanonicalActionEngine(prisma, {resolveFeatureRequirements: async (tenantId, requiredFeatures, evaluatedAt = NOW) => ({contract: FEATURE_REQUIREMENT_DECISION_CONTRACT, tenantId, planId: null, requiredFeatures: requiredFeatures.map(featureKey => ({featureKey, enabled: true})), allowed: true, evaluatedAt, validUntil: null})}, {identitySecret: secret, payloadEncryptionSecret: secret, policyAttestationSecret: secret, now: () => NOW});
  const context = {assertTenantId: tenantId => tenantId, get: () => undefined};
  const planner = new Package5Wave1ShadowService(engine.runtime, prisma, context);
  const executor = new Package5Wave1ExecutableService(prisma, engine.ingress, engine.kernel, () => NOW);
  const inbox = {
    publishForTenant: async (tenantId, input) => {
      projectionCalls++; if (projectionFails) throw Error('synthetic projection unavailable');
      for (const userId of input.userIds) await prisma.inboxItem.upsert({where: {tenantId_userId_type_sourceEventId: {tenantId, userId, type: input.type, sourceEventId: input.sourceEventId}}, create: {tenantId, userId, type: input.type, sourceEventId: input.sourceEventId, title: input.title, bodyText: input.bodyText, operationalWorkItemId: input.operationalWorkItemId}, update: {}});
      return {stored: input.userIds.length};
    },
    projectOperationalWorkItemCompletion: async () => { projectionCalls++; if (projectionFails) throw Error('synthetic projection unavailable'); },
  };
  const canonical = new Package5Wave1CanonicalCutoverService(prisma, context, inbox, planner, executor, engine.kernel);
  return new OperationalWorkController(prisma, canonical);
}
async function main() {
  const p = await scope('primary'), foreign = await scope('foreign'); let controller = build();
  const command = {assigneeUserId: p.staff.userId, title: 'Count stock', bodyText: 'Verify sealed stock', dueAt: '2026-09-09T10:00:00Z'};
  const key = 'r04-proof-' + randomUUID(), initial = await prisma.actionExecution.count({where: {tenantId: p.tenantId}});
  await reject(() => controller.create({...p.owner, tenantId: null}, key, command), 'tenantless actor denied');
  await reject(() => controller.create(p.owner, undefined, command), 'explicit identity required');
  await reject(() => controller.create(p.owner, key, {...command, assigneeUserId: foreign.staff.userId}), 'cross-tenant assignee denied');
  check(await prisma.actionExecution.count({where: {tenantId: p.tenantId}}) === initial, 'rejected intent no execution');
  const concurrent = await Promise.allSettled(Array.from({length: 4}, () => controller.create(p.owner, key, command)));
  const first = concurrent.find(row => row.status === 'fulfilled'); check(!!first, 'same intent one winner');
  const id = first.value.result.actionExecutionId, target = first.value.result.targetRef;
  check(await prisma.operationalWorkItem.count({where: {tenantId: p.tenantId}}) === 1, 'concurrent create one work item');
  for (const row of concurrent) if (row.status === 'fulfilled') check(row.value.result.actionExecutionId === id, 'same execution');
  controller = build(); const retry = await controller.create(p.owner, key, command);
  check(retry.result.actionExecutionId === id, 'restart resumes same execution');
  await reject(() => controller.create(p.owner, key, {...command, title: 'Changed'}), 'same key changed intent conflicts');
  check(await prisma.operationalWorkItem.count({where: {tenantId: p.tenantId}}) === 1, 'no second outcome for changed intent');
  const key2 = 'r04-conflict-' + randomUUID();
  const conflict = await Promise.allSettled([controller.create(p.owner, key2, {...command, title: 'A'}), controller.create(p.owner, key2, {...command, title: 'B'})]);
  check(conflict.filter(row => row.status === 'fulfilled').length === 1, 'concurrent changed intent one accepted');
  check(conflict.filter(row => row.status === 'rejected').length === 1, 'concurrent changed intent other rejected');
  const beforeRead = await prisma.actionExecution.count({where: {tenantId: p.tenantId}}), beforeProjection = projectionCalls;
  const own = await controller.list(p.staff); await controller.list(p.staff);
  check(own.tasks.length === 2 && own.tasks.every(task => task.canonical), 'personal canonical task view');
  check((await controller.list(foreign.staff)).tasks.length === 0, 'tenant isolation');
  check((await controller.list(p.owner)).tasks.length === 0, 'owner role not another assignee');
  check(await prisma.actionExecution.count({where: {tenantId: p.tenantId}}) === beforeRead && projectionCalls === beforeProjection, 'reads have no admission or projection effects');
  const task = own.tasks.find(row => row.work_item_id === target), completeKey = 'r04-complete-' + randomUUID();
  await reject(() => controller.complete(p.owner, completeKey, {inboxItemId: task.task_id}), 'only exact assignee completes');
  await reject(() => controller.complete(p.staff, completeKey, {inboxItemId: '123'}), 'legacy ID denied');
  projectionFails = true;
  const done = await controller.complete(p.staff, completeKey, {inboxItemId: task.task_id});
  check(done.projectionPending === true, 'committed completion survives projection failure');
  check((await prisma.operationalWorkItem.findUnique({where: {id: target}})).status === 'COMPLETED', 'business completion durable');
  controller = build(); const doneRetry = await controller.complete(p.staff, completeKey, {inboxItemId: task.task_id});
  check(doneRetry.actionExecutionId === done.actionExecutionId, 'completion restart same outcome');
  const pending = await controller.create(p.owner, 'r04-projection-' + randomUUID(), {...command, title: 'Projection unavailable'});
  check(pending.projectionPending && !!pending.result.actionExecutionId, 'creation receipt survives projection failure');
  check(!!await prisma.operationalWorkItem.findUnique({where: {id: pending.result.targetRef}}), 'creation remains committed');
  await prisma.membership.update({where: {id: p.staff.membershipId}, data: {status: 'suspended'}});
  const beforeRevoked = await prisma.actionExecution.count({where: {tenantId: p.tenantId}});
  await reject(() => controller.create(p.owner, 'r04-revoked-' + randomUUID(), command), 'revoked assignee rejected');
  check(await prisma.actionExecution.count({where: {tenantId: p.tenantId}}) === beforeRevoked, 'revoked assignee no execution');
  check(await prisma.actionExecution.count({where: {tenantId: p.tenantId, state: 'UNKNOWN'}}) === 0, 'local A23 no provider UNKNOWN');
  console.log(JSON.stringify({package: 'R04', status: 'PASS', checks, database: 'maya_rb_r04', concurrentSameIntent: concurrent.map(row => row.status), concurrentChangedIntent: conflict.map(row => row.status), syntheticProjection: true, providerWrites: 0, productionMutations: 0}, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
