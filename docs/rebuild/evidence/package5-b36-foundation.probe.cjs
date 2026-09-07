// Stage 1 diagnostic only: actual compiled baseline methods, synthetic dependencies.
// No PrismaClient construction, DB, timers, network, runtime edits or provider calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const backend = path.resolve(process.argv[2] || path.join(__dirname, '../../../maya-saas-backend'));
const load = p => require(path.join(backend, 'dist/src', p));
global.fetch = async () => { throw new Error('network forbidden in stage1 proof'); };
const { OwnerReportsService } = load('owner-reports/owner-reports.service.js');
const { InboxService } = load('inbox/inbox.service.js');
const { CommunicationDeliveryService } = load('communication-delivery/communication-delivery.service.js');
const { ActionEngineKernel } = load('action-engine/action-engine.kernel.js');
const facts = load('owner-reports/owner-reports.facts.js');
const composer = load('owner-reports/owner-reports.composers.js');
const tenant = { id: 'synthetic-tenant', slug: 'synthetic', defaultTimezone: 'Europe/Moscow' };
const now = new Date('2026-09-07T18:05:00.000Z');
const logger = { log() {}, warn() {}, error() {} };

async function run() {
  const rows = [], calls = [];
  let bodyVersion = 0, crashAfterFirstInbox = true;
  facts.businessBriefFacts = () => ({ revenue: { basis: 'available' } });
  composer.composeDailyReport = () => ({ title: 'Synthetic daily report', bodyText: `revision ${++bodyVersion}`, payload: {} });
  const prisma = {
    membership: { findMany: async () => [{ userId: 'owner-a' }, { userId: 'owner-b' }] },
    authIdentity: { findMany: async () => [] },
    devicePushToken: { findMany: async () => [{ userId: 'owner-a', token: 'synthetic-device' }] },
    inboxItem: { findFirst: async ({ where }) => rows.find(r => r.tenantId === where.tenantId && r.type === where.type && r.sourceEventId === where.sourceEventId) || null },
  };
  const delivery = {
    deliverPackage2Inbox: async input => {
      calls.push({ channel: 'inbox', userId: input.userId, bodyText: input.bodyText });
      rows.push({ ...input, type: input.messageType });
      if (crashAfterFirstInbox) { crashAfterFirstInbox = false; throw new Error('synthetic process loss after durable first inbox'); }
    },
    deliverPackage2Apns: async input => { calls.push({ channel: 'apns', userId: input.userId }); },
    deliverPackage2Telegram: async input => { calls.push({ channel: 'telegram', rawRecipientPassed: input.telegramChatId }); },
  };
  const inbox = Object.assign(Object.create(InboxService.prototype), { prisma, logger, communicationDelivery: delivery });
  const owner = Object.assign(Object.create(OwnerReportsService.prototype), {
    prisma, inbox, logger, readState: async () => ({}),
    tenantContext: { runAsSystemTenant: async (_id, fn) => fn() },
    dashboardPreferences: { filterUsersWithAssistantCapability: async (_id, ids) => ids },
  });
  await assert.rejects(owner.runDailyReport(tenant, now), /synthetic process loss/);
  const afterCrash = calls.length;
  assert.equal(await owner.runDailyReport(tenant, now), 'skipped');
  assert.equal(calls.length, afterCrash);
  assert.deepEqual(calls.map(c => c.channel), ['inbox']);
  const partial = { admittedInboxRecipients: rows.length, intendedRecipients: 2,
    retryResult: 'skipped', pendingSecondRecipientResumed: false, pendingApnsResumed: false,
    actualOwnerMethod: true, actualInboxLoopAndHasSourceEvent: true };

  const beforeRaw = calls.length;
  await inbox.publishForTenant(tenant.id, {
    type: 'daily_report', sourceEventId: 'synthetic-report', title: 'Report', bodyText: 'Synthetic',
    telegramChatIds: ['synthetic-unbound-chat'], fanoutOwners: false,
  });
  assert.equal(calls.length, beforeRaw + 1);
  assert.equal(calls.at(-1).channel, 'telegram');
  const rawRecipient = { canonicalAuthIdentities: 0, canonicalUsers: 0,
    callToCommunicationDeliveryWithRawTelegram: true,
    providerCalls: 0, limitation: 'CD is a recording fixture; this proves missing owner-side authority, not a live provider acceptance.' };

  const captured = [];
  const capture = Object.assign(Object.create(CommunicationDeliveryService.prototype), {
    actionEngine: { executeWithReceipt: async request => { captured.push(request); throw new Error('capture only'); } },
  });
  const input = { tenantId: tenant.id, messageType: 'daily_report', sourceType: 'scheduler',
    sourceEventId: 'nest:daily_report:2026-09-07', telegramChatId: 'synthetic-route-a',
    title: 'Report', bodyText: 'revision 1' };
  for (const changes of [{}, { bodyText: 'revision 2' }, { telegramChatId: 'synthetic-route-b' }, { sourceEventId: 'legacy-other-occurrence' }]) {
    await assert.rejects(capture.deliverPackage2Telegram({ ...input, ...changes }), /capture only/);
  }
  const engine = new ActionEngineKernel({}, {
    identitySecret: 'synthetic-stage1-identity-secret-never-production',
    payloadEncryptionSecret: 'synthetic-stage1-payload-secret-never-production',
  });
  const normalized = captured.map(r => engine.normalizeRequest(r));
  const first = { id: 'synthetic-existing-execution', ...normalized[0],
    capability: normalized[0].capability.capability, actionClass: normalized[0].capability.actionClass };
  const existing = { actionExecution: { findUnique: async ({ where }) => {
    const key = where.tenantId_idempotencyScope_requestIdempotencyKeyHash;
    return key && key.requestIdempotencyKeyHash === first.requestIdempotencyKeyHash ? first : null;
  } } };
  assert.equal(await engine.findDuplicate(existing, captured[0], normalized[0]), first);
  await assert.rejects(engine.findDuplicate(existing, captured[1], normalized[1]), e => e.code === 'ACTION_IDEMPOTENCY_CONFLICT');
  assert.equal(await engine.findDuplicate(existing, captured[2], normalized[2]), null);
  assert.equal(await engine.findDuplicate(existing, captured[3], normalized[3]), null);
  const identities = { sameLeafKeySameInput: 'SAME_EXECUTION', sameLeafKeyChangedInput: 'ACTION_IDEMPOTENCY_CONFLICT',
    changedRouteHasDifferentCallerKey: normalized[0].requestIdempotencyKeyHash !== normalized[2].requestIdempotencyKeyHash,
    changedProducerOccurrenceHasDifferentCallerKey: normalized[0].requestIdempotencyKeyHash !== normalized[3].requestIdempotencyKeyHash,
    rootReportBindingUsed: false, newActionExecutionsCreated: 0,
    limitation: 'Real request builder/normalizer/duplicate resolver with fixture storage; no DB concurrency claim.' };

  // Before any inbox receipt, the real report method computes content again.
  const contentAttempts = [];
  const preInboxFailureOwner = Object.assign(Object.create(OwnerReportsService.prototype), owner, {
    inbox: { hasSourceEvent: async () => false, publishForTenant: async (_tenant, data) => {
      contentAttempts.push({ sourceEventId: data.sourceEventId, bodyText: data.bodyText });
      throw new Error('synthetic delivery unavailable before inbox');
    } },
  });
  for (let i = 0; i < 2; i++) await assert.rejects(preInboxFailureOwner.runDailyReport(tenant, now), /synthetic delivery unavailable/);
  assert.equal(contentAttempts[0].sourceEventId, contentAttempts[1].sourceEventId);
  assert.notEqual(contentAttempts[0].bodyText, contentAttempts[1].bodyText);
  const content = { sameReportPeriodSourceId: true, recomputedContentDifferent: true,
    frozenReportContentLoaded: false, limitation: 'Changed business facts/composition are synthetic; actual report control flow is executed.' };
  const files = ['owner-reports/owner-reports.service', 'inbox/inbox.service',
    'communication-delivery/communication-delivery.service', 'action-engine/action-engine.kernel',
    'action-engine/action-engine.registry', 'action-engine/action-engine.identity'];
  const executedArtifacts = Object.fromEntries(files.map(name => [name, {
    sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(backend, 'src', name + '.ts'))).digest('hex'),
    compiledSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(backend, 'dist/src', name + '.js'))).digest('hex'),
  }]));
  console.log(JSON.stringify({ status: 'STAGE1_GAPS_REPRODUCED', partial, rawRecipient, identities, content,
    executedArtifacts, databaseConnections: 0, providerCalls: 0, productionMessages: 0,
    productionBusinessProviderMutations: 0, runtimeRemediationClaimed: false }, null, 2));
}
run().catch(error => { console.error(error.stack); process.exitCode = 1; });
