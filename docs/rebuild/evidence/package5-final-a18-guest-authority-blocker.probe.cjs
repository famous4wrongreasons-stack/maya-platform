'use strict';
const path = require('node:path');
const assert = require('node:assert/strict');
const repo = process.argv[2];
assert(repo, 'Explicit repository directory required');
const backend = path.join(repo, 'maya-saas-backend');
require(path.join(backend, 'node_modules/ts-node')).register({
  project: path.join(backend, 'tsconfig.scripts.json'), transpileOnly: true,
});
const { Package5Wave3ShadowService } = require(path.join(backend,
  'src/package5-wave3/package5-wave3.service.ts'));
const unexpected = new Proxy({}, { get(_target, key) {
  throw new Error(`Unexpected dependency access: ${String(key)}`);
}});
let membershipReads = 0;
const service = new Package5Wave3ShadowService(unexpected, {
  membership: { findUnique: async ({ where }) => {
    assert.equal(where.userId_tenantId.userId, null);
    membershipReads++;
    return null;
  } },
}, { assertTenantId: value => value }, unexpected, unexpected);
(async () => {
  await assert.rejects(service.build('synthetic-tenant-a', { userId: null }, {
    operation: 'record_client_consent', clientId: 'synthetic-guest-client-a',
    kind: 'privacy', decision: 'grant',
    occurredAt: new Date('2026-09-04T00:00:00Z'),
    effectiveAt: new Date('2026-09-04T00:00:00Z'),
    sourceIdentityHash: 'a'.repeat(64), sourceIntentRef: 'guest-consent-probe-0001',
  }, 'execute'), error => error.getStatus() === 403 &&
    error.message === 'Active tenant membership required');
  assert.equal(membershipReads, 1);
  console.log(JSON.stringify({ diagnostic: 'A18 guest authority precondition',
    reproduced: true, result: 'REJECTED BEFORE CONSENT TARGET RESOLUTION',
    failure: 'Active tenant membership required',
    databaseConnections: 0, domainWrites: 0, actionExecutions: 0,
    productionRequests: 0, shadowGateOrExecutableProofRun: false }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
