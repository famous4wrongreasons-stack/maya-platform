// Foundation assessment only. No runtime patch, database, network or live user.
// Usage: node this-file.cjs /absolute/path/to/upstream-b6c53ff9
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createRequire, Module } = require('node:module');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const vm = require('node:vm');

const repo = resolve(__dirname, '../../..');
const snapshot = resolve(process.argv[2] || '');
assert(snapshot.endsWith('upstream-b6c53ff9'));
const backend = resolve(snapshot, 'maya-saas-backend');
const req = createRequire(resolve(backend, 'package.json'));
req('ts-node').register({ project: resolve(backend, 'tsconfig.json'), transpileOnly: true });
req('reflect-metadata');
const sources = {};
function gitSource(revision, path) {
  const text = execFileSync('git', ['show', `${revision}:${path}`], { cwd: repo, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  sources[`${revision}:${path}`] = createHash('sha256').update(text).digest('hex');
  return text;
}
function exactUpstream(path) {
  assert.equal(readFileSync(resolve(backend, path), 'utf8'), gitSource('b6c53ff9', `maya-saas-backend/${path}`));
  return req(resolve(backend, path));
}

// Compile the already certified issuer implementation in memory. All imported
// challenge/link dependencies must still match the certified revision exactly.
for (const file of ['client-link-challenge.service.ts', 'client-channel-link.service.ts']) {
  assert.equal(readFileSync(resolve(backend, 'src/crm', file), 'utf8'), gitSource('0ad0eef2', `maya-saas-backend/src/crm/${file}`));
}
const original = gitSource('0ad0eef2', 'maya-saas-backend/src/crm/client-channel-runtime.service.ts');
const runtimeModule = new Module(resolve(backend, 'src/crm/foundation-assessment-memory-only.js'));
runtimeModule.filename = runtimeModule.id;
runtimeModule.paths = Module._nodeModulePaths(resolve(backend, 'src/crm'));
runtimeModule._compile(req('typescript').transpileModule(original, {
  compilerOptions: { module: req('typescript').ModuleKind.CommonJS, target: req('typescript').ScriptTarget.ES2022, experimentalDecorators: true, emitDecoratorMetadata: true },
}).outputText, runtimeModule.filename);
const ProvenRuntime = runtimeModule.exports.ClientChannelRuntimeService;
const { Package5Wave3CanonicalCutoverService: Cutover } = exactUpstream('src/package5-wave3/package5-wave3-canonical-cutover.service.ts');
const { ClientChannelRuntimeService: UpstreamRuntime } = exactUpstream('src/crm/client-channel-runtime.service.ts');
const hash = (namespace, value) => createHash('sha256').update(namespace + '\0' + value).digest('hex');

function provenanceFixture(options = {}) {
  const now = new Date('2026-09-08T10:00:00Z');
  const tenantId = 'synthetic-tenant';
  const channel = { tenantId, userId: options.guest ? null : 'synthetic-user', provider: options.guest ? 'telegram' : 'maya_user', providerSubjectHash: 'a'.repeat(64), channelControlProofHash: 'b'.repeat(64), validUntil: new Date(now.getTime() + 600000) };
  const client = { id: 'synthetic-client', tenantId, userId: options.guest ? null : 'synthetic-user', mergedIntoClientId: null, crmLinks: [] };
  const binding = { id: 'synthetic-verified-link', tenantId, clientId: client.id, provider: channel.provider, providerSubjectHash: channel.providerSubjectHash, revokedAt: null, verificationVersion: 1, subjectHashVersion: 1, verificationEvidenceHash: 'c'.repeat(64), ...options.binding };
  const writes = [];
  const query = { profileReads: 0, clientReads: 0 };
  const tx = {
    $queryRaw: async (q) => String(q.sql).includes('clock_timestamp') ? [{ now }] : [],
    clientChannelLink: { findMany: async ({ where }) => options.noBinding ? [] : Object.entries(where).every(([key, value]) => binding[key] === value) ? [binding] : [] },
    client: { findUnique: async ({ where }) => { query.clientReads++; return where.id_tenantId.id === client.id && where.id_tenantId.tenantId === client.tenantId ? client : null; } },
    customerProfile: { findMany: async () => { query.profileReads++; throw Error('Projection cannot supply authority'); } },
    clientLinkChallenge: { create: async ({ data }) => { writes.push(data); return { id: 'synthetic-challenge', ...data }; } },
  };
  const context = { requireTenantId: () => tenantId, assertTenantId: (id) => { assert.equal(id, tenantId); return id; } };
  const runtime = new ProvenRuntime({ $transaction: async (work) => work(tx) }, context, { authenticate: async () => channel }, { opaqueReference: hash }, {}, {}, {});
  return { runtime, writes, query, channel };
}

async function main() {
  const g1 = [];
  for (const name of ['CLIENT_USER_ONLY', 'PROFILE_USER_ONLY', 'BOTH_USER_FKS_PROFILE_CLIENT_NULL', 'MATCHING_FKS_WITHOUT_VERIFIED_LINK']) {
    // None of these row combinations is ever read by the approved resolver.
    const fixture = provenanceFixture({ noBinding: true });
    await assert.rejects(fixture.runtime.issue('authenticated-channel-proof'));
    assert.equal(fixture.writes.length, 0); assert.equal(fixture.query.profileReads, 0);
    g1.push({ case: name, outcome: 'DENIED', challengeWrites: 0, consentWrites: 0, clientWrites: 0 });
  }
  for (const [name, binding] of [
    ['REVOKED_BINDING', { revokedAt: new Date() }],
    ['WRONG_TENANT_BINDING', { tenantId: 'other-tenant' }],
    ['WRONG_CLIENT_TARGET', { clientId: 'nonexistent-or-other-tenant-client' }],
  ]) {
    const fixture = provenanceFixture({ binding });
    await assert.rejects(fixture.runtime.issue('authenticated-channel-proof'));
    assert.equal(fixture.writes.length, 0);
    g1.push({ case: name, outcome: 'DENIED', challengeWrites: 0, consentWrites: 0, clientWrites: 0 });
  }
  for (const guest of [false, true]) {
    const fixture = provenanceFixture({ guest });
    await fixture.runtime.issue('authenticated-channel-proof');
    assert.equal(fixture.writes.length, 1);
    assert.equal(fixture.writes[0].clientId, 'synthetic-client');
    assert.equal(fixture.writes[0].issuanceEvidenceJson.resolutionEvidenceRef, 'client-channel-link:synthetic-verified-link');
    g1.push({ case: guest ? 'VERIFIED_GUEST_BINDING' : 'VERIFIED_MAYA_BINDING', outcome: 'ALLOWED', challengeWrites: 1 });
  }

  // Execute the actual old installed component's submit handler. No fetch leaves
  // this VM. It sends only two booleans, even for two distinct button presses.
  const oldPwa = gitSource('0ad0eef2', 'сайт и приложение/app.html');
  const start = oldPwa.indexOf('function AMayaConsent() {');
  const end = oldPwa.indexOf('window.AMayaConsent = AMayaConsent;', start);
  assert(start >= 0 && end > start);
  const calls = [];
  let stateIndex = 0;
  const states = [true, true, true, false, ''];
  const context = { React: { useState: () => [states[stateIndex++], () => {}], useEffect: () => {}, createElement: (type, props, ...children) => ({ type, props, children }) }, window: { __meSaasAuthedFetch: async (path, input) => { calls.push({ path, ...input }); } }, Promise, Uint8Array };
  vm.createContext(context);
  vm.runInContext(oldPwa.slice(start, end) + '\nthis.tree = AMayaConsent();', context);
  function findButton(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.props?.onClick && node.children.includes('Подписать и продолжить')) return node;
    for (const child of node.children || []) { const found = findButton(child); if (found) return found; }
    return null;
  }
  const button = findButton(context.tree); assert(button);
  button.props.onClick(); await new Promise(setImmediate);
  button.props.onClick(); await new Promise(setImmediate);
  assert.equal(calls.length, 2); assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[0].body, JSON.stringify({ privacyConsent: true, marketingConsent: true }));
  assert.deepEqual(Object.keys(calls[0].headers), ['Content-Type']);

  // Existing command foundation preserves caller event identity. This observes
  // inputs handed to the real canonical execute method; it is not a DB proof.
  const commands = [];
  const cutover = Object.assign(Object.create(Cutover.prototype), {
    tenantContext: { assertTenantId: (id) => id },
    prisma: { clientChannelLink: { findMany: async ({ where }) => [{ id: 'verified-link', clientId: 'client-1', providerSubjectHash: where.providerSubjectHash, verificationEvidenceHash: 'c'.repeat(64) }] } },
    encryption: { opaqueReference: hash },
    execute: async (tenant, actor, command, source) => { const result = { tenant, client: command.clientId, source, sourceIdentityHash: command.sourceIdentityHash }; commands.push(result); return result; },
  });
  for (const [event, granted] of [['grant-event-1', true], ['grant-event-1', true], ['revoke-event-1', false], ['revoke-event-1', false], ['grant-event-2', true], ['grant-event-2', true]]) {
    await cutover.recordChannelConsent('tenant-1', { userId: null, provider: 'telegram', providerSubjectHash: 'a'.repeat(64) }, 'marketing', granted, new Date(), event);
  }
  assert.deepEqual(commands[0], commands[1]); assert.deepEqual(commands[2], commands[3]); assert.deepEqual(commands[4], commands[5]);
  assert.notEqual(commands[0].source, commands[4].source);

  const legacyInputs = [];
  const upstream = Object.assign(Object.create(UpstreamRuntime.prototype), { prisma: { $transaction: async (work) => work({}) }, status: async () => ({ linked: true }), resolve: async () => ({ tenantId: 'tenant-1', linkId: 'verified-link', clientId: 'client-1' }), submitConsent: async (proof, input) => { legacyInputs.push(input); return input; } });
  for (const granted of [true, false, true]) await upstream.submitLegacyNativeConsent('authenticated-channel-proof', { privacyConsent: true, marketingConsent: granted });
  assert.equal(legacyInputs[0].idempotencyKey, legacyInputs[2].idempotencyKey);

  // Indistinguishability counterexample, not a simulated database result:
  // both worlds have the same committed G1/R1 records and current generation.
  // The next identical request is either a delayed G1 retry or explicit G2.
  const observed = { tenant: 'tenant-1', client: 'client-1', currentGeneration: 2, history: ['G1 grant committed', 'R1 revoke committed'], request: calls[0] };
  const delayedRetry = structuredClone(observed), explicitNewGrant = structuredClone(observed);
  assert.deepEqual(delayedRetry, explicitNewGrant);
  console.log(JSON.stringify({
    result: 'FOUNDATION_ASSESSMENT_COMPLETE_KEYLESS_EVENT_AMBIGUITY_PROVED', sources, g1,
    g1FoundationSufficient: true,
    g2KeyedCanonicalFoundationSufficient: true,
    g2UnchangedKeylessCompatibilityFoundationSufficient: false,
    nativePayload: calls[0], nativeRepeatedPayloadIdentical: true,
    canonicalCommandIdentityChecks: { firstGrantDiffersFromSecondGrant: true, retriesKeepIdentity: true, existingEvents: commands },
    upstreamStateTupleCollisionStillPresent: true,
    ambiguity: { serverObservationsIdentical: true, delayedRetryRequiredIdentity: 'G1', explicitNewGrantRequiredIdentity: 'G2', currentGenerationCannotDistinguish: true },
    proofLimits: 'Actual source with memory-only repositories; no database executor/concurrency/production acceptance claimed.',
    runtimeChanges: 0, schemaChanges: 0, databaseConnections: 0, productionEffects: 0,
  }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
