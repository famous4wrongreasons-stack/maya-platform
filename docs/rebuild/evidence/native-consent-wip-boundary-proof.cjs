// Narrow local WIP evidence, not PostgreSQL lifecycle/package acceptance.
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { createRequire } = require('node:module');
const root = resolve(__dirname, '../../..');
const backend = resolve(root, 'maya-saas-backend');
const req = createRequire(resolve(backend, 'package.json'));
req('ts-node').register({ project: resolve(backend, 'tsconfig.json'), transpileOnly: true });
req('reflect-metadata');
const { ClientChannelRuntimeService } = req(resolve(backend, 'src/crm/client-channel-runtime.service.ts'));
const { MayaUserClientAssociationIssuer } = req(resolve(backend, 'src/crm/maya-user-client-association-issuer.ts'));
(async () => {
  const effects = [];
  const runtime = Object.assign(Object.create(ClientChannelRuntimeService.prototype), {
    submitConsent: async (proof, input) => { effects.push({ proof, input }); return input; },
    issue: () => { throw Error('Unexpected challenge'); },
    consume: () => { throw Error('Unexpected link effect'); },
    status: () => { throw Error('Unexpected pre-key authority lookup'); },
  });
  const input = { privacyConsent: true, marketingConsent: true };
  for (const key of [undefined, '', 'short', 'contains spaces']) {
    await assert.rejects(runtime.submitLegacyNativeConsent('proof', input, key), /consent_transition_identity_required/);
    assert.equal(effects.length, 0);
  }
  for (const [key, marketingConsent] of [['grant-event-1', true], ['grant-event-1', true], ['revoke-event-1', false], ['revoke-event-1', false], ['grant-event-2', true], ['grant-event-2', true]]) {
    await runtime.submitLegacyNativeConsent('proof', { privacyConsent: true, marketingConsent }, key);
  }
  assert.deepEqual(effects[0], effects[1]); assert.deepEqual(effects[2], effects[3]); assert.deepEqual(effects[4], effects[5]);
  assert.notEqual(effects[0].input.idempotencyKey, effects[4].input.idempotencyKey);
  const retired = new MayaUserClientAssociationIssuer();
  await assert.rejects(retired.resolve('proof', new Proxy({}, { get: () => { throw Error('No FK reads permitted'); } })), /Trusted verified Client resolution required/);
  console.log(JSON.stringify({
    scope: 'actual WIP adapter with synthetic effect sink, no database',
    keylessRejectedBeforeEffects: 4, keylessEffects: 0,
    keyedAdapterPreservesThreeEventIdentities: true, adapterRetriesPreserveEachIdentity: true,
    retiredHeuristicIssuerDeniesWithoutDatabaseReads: true,
    fullProvenanceOrConsentLifecycleAcceptance: false,
    databaseConnections: 0, productionEffects: 0,
  }, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
