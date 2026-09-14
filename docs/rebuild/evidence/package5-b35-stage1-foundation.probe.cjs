// Contract assessment only. Actual source methods with explicit in-memory doubles.
// No Nest application, database connection, HTTP server or provider is started.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(process.argv[2] || '.');
require(path.join(root, 'node_modules/ts-node')).register({
  transpileOnly: true, project: path.join(root, 'tsconfig.json'),
});
const { ActionCapabilityRegistry } = require(path.join(root, 'src/action-engine/action-engine.registry.ts'));
const { CommunicationCapabilityRegistry } = require(path.join(root, 'src/communication-delivery/communication-delivery.capabilities.ts'));
const { normalizeClientWebPushDelivery } = require(path.join(root, 'src/communication-delivery/communication-web-push.contract.ts'));
const { CommunicationDeliveryService } = require(path.join(root, 'src/communication-delivery/communication-delivery.service.ts'));
const { MarketingService } = require(path.join(root, 'src/marketing/marketing.service.ts'));
const results = [];
const bulk = new ActionCapabilityRegistry().get('communication.bulk-campaign.execute.v1');
const request = { campaignId: 'campaign-a', audienceId: 'audience-a', audienceSnapshotHash: 'a'.repeat(64), messageSnapshotHash: 'b'.repeat(64), title: 'Synthetic title', bodyText: 'Synthetic content' };
assert.deepEqual(bulk.normalizeInput(request), request);
for (const extension of [{ channel: 'telegram' }, { clientId: 'client-a' }, { routePlan: {} }]) {
  assert.throws(() => bulk.normalizeInput({ ...request, ...extension }));
}
results.push({ case: 'registered-bulk-contract', baselineAccepted: true, rejectedExtensions: ['channel', 'clientId', 'routePlan'], actionClass: bulk.actionClass, executorKey: bulk.executorKey });
const push = { channel: 'web_push', messageType: 'appointment_reminder', clientId: 'client-a', endpointIds: ['device-a'], sourceEventId: 'event-a', title: 'Synthetic title', bodyText: 'Synthetic content', expiresAt: '2099-01-01T00:00:00.000Z' };
assert.equal(normalizeClientWebPushDelivery(push).clientId, 'client-a');
assert.throws(() => normalizeClientWebPushDelivery({ ...push, messageType: 'marketing_campaign' }));
results.push({ case: 'web-push-classification', existingReminderAccepted: true, marketingRejected: true });

async function prepareBulk(internalUserId) {
  let envelope = null;
  let actionRequest = null;
  const expiresAt = new Date('2099-01-01T00:00:00Z');
  const service = Object.create(CommunicationDeliveryService.prototype);
  service.prisma = {
    marketingCampaign: { findUnique: async () => ({ status: 'sending', messageSnapshotHash: request.messageSnapshotHash, expiresAt }) },
    marketingAudience: { findUnique: async () => ({ snapshotHash: request.audienceSnapshotHash, expiresAt, recipients: [{ id: 'recipient-a', externalClientId: 'client-a', internalUserId, eligibilityStatus: 'ALLOW', exclusionReason: null, createdAt: new Date('2098-12-31T00:00:00Z') }] }) },
  };
  service.kernel = { createEnvelope: async (input) => { envelope = input; throw new Error('PROBE_ENVELOPE_CAPTURED'); } };
  service.actionEngine = { executeWithReceipt: async (input, handlers) => {
    actionRequest = input;
    return handlers.prepare(bulk.normalizeInput(input.input), { tenantId: 'tenant-a', executionId: 'execution-a' });
  } };
  let outcome;
  try {
    await service.deliverBulkCampaign({ ...request, tenantId: 'tenant-a', actorUserId: 'owner-a', idempotencyKey: 'bulk-a', expiresAt });
    assert.fail('Probe must stop before actual delivery');
  } catch (error) {
    outcome = error.outcomeCode || error.message;
  }
  return { outcome, envelope, actionRequest };
}

(async () => {
  const withoutUser = await prepareBulk(null);
  assert.equal(withoutUser.outcome, 'bulk_internal_recipient_missing');
  assert.equal(withoutUser.envelope, null);
  const withUser = await prepareBulk('user-a');
  assert.equal(withUser.outcome, 'PROBE_ENVELOPE_CAPTURED');
  assert.equal(withUser.envelope.channel, 'inbox');
  assert.equal(withUser.envelope.recipients[0].recipientKind, 'internal_user');
  results.push({ case: 'actual-bulk-prepare', clientWithoutUser: withoutUser.outcome, noEnvelopeForUserFreeClient: true, userBoundEnvelopeChannel: withUser.envelope.channel, recipientKind: withUser.envelope.recipients[0].recipientKind, dispatchExecuted: false });

  const service = Object.create(MarketingService.prototype);
  let claims = 0, deliveryCalls = 0;
  service.prisma = { marketingCampaign: {
    findFirst: async () => ({ id: 'campaign-a', tenantId: 'tenant-a', status: 'sending', expiresAt: new Date('2099-01-01T00:00:00Z') }),
    updateMany: async () => { claims++; return { count: 0 }; },
  } };
  service.communicationDelivery = { deliverBulkCampaign: async () => { deliveryCalls++; assert.fail('No delivery expected'); } };
  await assert.rejects(service.sendCampaign({ tenantId: 'tenant-a', actorUserId: 'owner-a', campaignId: 'campaign-a', idempotencyKey: 'bulk-a' }), error => error.getResponse().error.code === 'marketing_campaign_busy');
  assert.equal(claims, 1);
  assert.equal(deliveryCalls, 0);
  results.push({ case: 'replay-sending-campaign', outcome: 'marketing_campaign_busy', communicationDeliveryCalls: deliveryCalls, persistence: 'in-memory read/claim doubles only' });

  const caps = new CommunicationCapabilityRegistry().list();
  const production = caps.filter(c => c.externalDispatchEnabled && !c.testOnly);
  results.push({ case: 'registered-production-transports', capabilities: production.map(c => ({ key: c.key, channel: c.channel, maxExecutionAttempts: c.retry.maxExecutionAttempts, reconciliationSupported: c.reconciliationSupported, acceptedIsTerminal: c.acceptedIsTerminal })) });
  assert(!production.some(c => ['sms', 'email'].includes(c.channel)));
  const sourceFiles = [
    'src/action-engine/action-engine.registry.ts', 'src/communication-delivery/communication-delivery.capabilities.ts',
    'src/communication-delivery/communication-web-push.contract.ts', 'src/communication-delivery/communication-delivery.service.ts',
    'src/marketing/marketing.service.ts', 'src/marketing/marketing.module.ts', 'src/app.module.ts',
    'src/communication-delivery/communication-delivery.kernel.ts', 'prisma/schema.prisma',
  ];
  const sourceSha256 = Object.fromEntries(sourceFiles.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
  console.log(JSON.stringify({ assessment: 'EXISTING CANONICAL BULK COMMUNICATION FOUNDATION SUFFICIENT: NO', probeResult: 'PASS — gaps reproduced', limitations: ['Selected actual source contracts/methods only; synthetic authority and persistence fixtures', 'No full Action Engine, kernel dispatch, concurrency, restart or live Client resolution proof', 'Not the B35 mandatory remediation matrix or Package 5 Final Gate'], results, sourceSha256, databasesOpened: 0, providerCalls: 0, productionMessages: 0 }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
