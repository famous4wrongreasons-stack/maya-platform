/* Owned PostgreSQL proof only. No application bootstrap or provider client. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const backend = path.join(root, 'maya-saas-backend');
const phase = process.argv[2];
const out = path.resolve(process.argv[3] || '');
assert(out.startsWith('/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/package5-wave-ra-implementation/r10/'));
const databaseUrl = 'postgresql://maya_ra@127.0.0.1:55507/maya_ra_r10';
assert.equal(new URL(databaseUrl).pathname, '/maya_ra_r10');
require(path.join(backend, 'node_modules/ts-node')).register({ project: path.join(backend, 'tsconfig.json'), transpileOnly: true });
const { PrismaClient } = require(path.join(backend, 'node_modules/@prisma/client'));
const { PrismaPg } = require(path.join(backend, 'node_modules/@prisma/adapter-pg'));
const { ActionEngineKernel } = require(path.join(backend, 'src/action-engine/action-engine.kernel.ts'));
const { CanonicalActionIngressService } = require(path.join(backend, 'src/action-engine/action-engine.ingress.ts'));
const { ActionEngineRuntimeService } = require(path.join(backend, 'src/action-engine/action-engine.runtime.ts'));
const { ActionCapabilityRegistry } = require(path.join(backend, 'src/action-engine/action-engine.registry.ts'));
const { CanonicalActionPolicyResolver, CanonicalActionPolicyRegistry } = require(path.join(backend, 'src/action-engine/action-engine.policy-resolver.ts'));
const { EncryptionService } = require(path.join(backend, 'src/encryption/encryption.service.ts'));
const { TenantContextService } = require(path.join(backend, 'src/tenancy/tenant-context.service.ts'));
const { AiToolReceiptService } = require(path.join(backend, 'src/ai-tools/ai-tool-receipt.service.ts'));
const { AiToolRuntimeService } = require(path.join(backend, 'src/ai-tools/ai-tool-runtime.service.ts'));
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, max: 12 }) });
const sourceHash = createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
const runtimeHashes = Object.fromEntries(['src/ai-tools/ai-tool-runtime.service.ts', 'src/ai-tools/ai-tool-receipt.service.ts', 'src/action-engine/action-invocation-receipt.context.ts', 'src/action-engine/action-engine.ingress.ts'].map((name) => [name, createHash('sha256').update(fs.readFileSync(path.join(backend, name))).digest('hex')]));
const write = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify({ ...value, fixtureSha256: sourceHash, runtimeHashes, observedAt: new Date().toISOString() }, null, 2) + '\n');
let manifest;
const policyDefinition = {
  capability: 'kernel.test.safe-retry', policyProfileKey: 'canonical.r10.owned-fixture', policyProfileVersion: 1,
  actorPolicy: 'OPTIONAL_TRUSTED_SERVICE', allowedActorRoles: [], trustedServiceSourceTypes: ['synthetic_shadow'],
  requiredFeatures: [], permissionCodes: ['tenant.active', 'fixture.bound'], approverPolicyKey: 'none', validityMs: 60000,
};
const encryption = new EncryptionService({ get: () => 'r10-owned-fixture-encryption-not-production' });
const context = new TenantContextService();

function services(key, options = {}) {
  const registry = new ActionCapabilityRegistry();
  const resolver = new CanonicalActionPolicyResolver(prisma, {
    resolveFeatureRequirements: async (tenantId) => ({ contract: 'maya.feature-requirement-decision/1', tenantId, planId: null, requiredFeatures: [],
      allowed: true, evaluatedAt: new Date(), validUntil: new Date(Date.now() + 60000) }),
  }, { attestationSecret: 'r10-owned-policy-secret-aaaaaaaaaaaaaaaa' }, new CanonicalActionPolicyRegistry([policyDefinition]), registry);
  const kernel = new ActionEngineKernel(prisma, { controlledFixtureMode: true, identitySecret: 'r10-owned-identity-secret-aaaaaaaaaaa',
    payloadEncryptionSecret: 'r10-owned-payload-secret-aaaaaaaaaaaa', executionLeaseMs: 100, reconciliationLeaseMs: 1000 }, registry, resolver);
  const ingress = new CanonicalActionIngressService(kernel, resolver);
  const engine = new ActionEngineRuntimeService(kernel, ingress);
  if (options.crashBeforeReconcile) {
    const finalize = kernel.finalizeUnknown.bind(kernel);
    kernel.finalizeUnknown = async (input) => {
      const result = await finalize(input);
      const attempts = await prisma.actionAttempt.findMany({ where: { actionExecutionId: input.executionId }, select: { kind: true, state: true } });
      write('crash-unknown-ready.json', { phase, executionId: input.executionId, state: result.state, attempts, processId: process.pid });
      process.exit(0);
    };
  }
  const user = { userId: manifest.userId, tenantId: manifest.tenantId, role: 'tenant_owner' };
  const request = (slot = 'first') => ({ contract: 'maya.action-execution-request/1', tenantId: manifest.tenantId,
    capability: 'kernel.test.safe-retry', source: { type: 'synthetic_shadow', sourceRef: `r10-fixture:${key}:${slot}`, occurrenceScope: `r10-fixture:${key}:${slot}` },
    targetRef: `r10-fixture:${key}:${slot}`, input: { valueRef: `r10-value:${slot}` }, evidenceRefs: [], callerIdempotency: { scope: 'r10-owned-fixture', key: `${key}:${slot}` } });
  const effectCount = () => prisma.auditLog.count({ where: { tenantId: manifest.tenantId, action: 'r10.synthetic_effect', entityType: key } });
  const definition = { name: 'settings.update', riskTier: 'low_write', approvalPolicy: 'none', idempotency: 'required', timeoutMs: options.timeoutMs ?? 5000, fallbackPolicy: 'fail_closed' };
  const executeAction = (slot = 'first') => engine.executeWithReceipt(request(slot), {
    dispatch: async (_input, transportKey, executionContext) => {
      const row = await prisma.aiToolExecution.findUniqueOrThrow({ where: { tenantId_idempotencyKey: { tenantId: manifest.tenantId, idempotencyKey: key } } });
      const receipt = JSON.parse(encryption.decrypt(row.encryptedResult));
      assert(receipt.bindings.some((binding) => binding.executionId === executionContext.executionId));
      assert.equal(receipt.bindings.find((binding) => binding.executionId === executionContext.executionId).request.input, null);
      await prisma.auditLog.create({ data: { tenantId: manifest.tenantId, action: 'r10.synthetic_effect', entityType: key,
        entityId: executionContext.executionId, metadataJson: { transportKey, slot } } });
      if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      if (options.unknown) throw new Error('synthetic provider acknowledgement lost');
      return { value: { accepted: true }, safeResult: { accepted: true } };
    },
    restore: (safe) => safe,
    reconcile: async (_input, _prepared, executionContext) => {
      if (options.crashUnknown) {
        write('crash-unknown.json', { phase, executionId: executionContext.executionId, effects: await effectCount(), status: 'UNKNOWN_RECONCILIATION_CLAIMED', processId: process.pid });
        process.exit(0);
      }
      return options.reconcileSuccess ? { outcome: 'PROVEN_SUCCEEDED', safeResult: { accepted: true } } : { outcome: 'STILL_UNKNOWN' };
    },
    classifyError: () => ({ kind: 'unknown', outcomeCode: 'synthetic_provider_unknown', errorClass: 'synthetic_unknown' }),
  });
  const handler = {
    normalizeArguments: async (_name, _principal, args) => args,
    execute: async () => {
      if (options.crashReady) {
        const execution = await ingress.createExecution(request());
        write('crash-ready.json', { phase, executionId: execution.id, effects: await effectCount(), state: execution.state, processId: process.pid });
        process.exit(0);
      }
      const result = await executeAction();
      if (options.crashPrefix) {
        write('crash-prefix.json', { phase, executionId: result.execution.executionId, effects: await effectCount(), state: result.execution.state, nextSlotNotAdmitted: true, processId: process.pid });
        process.exit(0);
      }
      if (options.secondSlot) await executeAction('second');
      if (options.presentationFailure) throw new Error('synthetic presentation unavailable');
      return result.value;
    },
  };
  let receiptDb = prisma;
  if (options.failReceiptSave) receiptDb = prisma.$extends({ query: { aiToolExecution: { async update({ args, query }) {
    if (args.data.encryptedResult && !args.data.status) throw new Error('synthetic receipt commit rejected');
    return query(args);
  } } } });
  const receipt = new AiToolReceiptService(receiptDb, encryption, kernel);
  const ai = new AiToolRuntimeService(prisma, context, { get: () => definition, validateArguments: (_name, args) => args },
    { buildPrincipal: (tenantId, userId, role, surface) => ({ tenantId, userId, role, surface }), assertCanExecute: async () => undefined },
    handler, encryption, { log: async () => { if (options.auditFailure) throw new Error('synthetic audit unavailable'); } }, receipt);
  const run = () => context.runAsSystemTenant(manifest.tenantId, () => ai.execute(user, definition.name, { surface: 'web', arguments: { enabled: true }, idempotencyKey: key }));
  return { run, effectCount, request, definition };
}

async function execute() {
  fs.mkdirSync(out, { recursive: true });
  if (phase === 'baseline') {
    const id = randomUUID();
    const tenant = await prisma.tenant.create({ data: { name: 'R10 owned synthetic proof', slug: `r10-${id}`, status: 'active', currentPeriodEnd: new Date('2099-01-01') } });
    const user = await prisma.user.create({ data: { tenantId: tenant.id, email: `r10-${id}@example.invalid`, passwordHash: 'owned-fixture-no-login', role: 'tenant_owner' } });
    await prisma.membership.create({ data: { tenantId: tenant.id, userId: user.id, role: 'tenant_owner' } });
    manifest = { tenantId: tenant.id, userId: user.id, keys: Object.fromEntries(['concurrent', 'save-failure', 'late', 'audit', 'lost-presentation', 'ready', 'prefix', 'unknown'].map((name) => [name, randomUUID()])) };
    write('manifest.json', manifest);
    const result = [];
    const parallel = services(manifest.keys.concurrent);
    const outcomes = await Promise.all(Array.from({ length: 6 }, () => parallel.run()));
    assert(outcomes.every((value) => ['completed', 'unknown', 'executing'].includes(value.status)), JSON.stringify(outcomes));
    assert.equal(await parallel.effectCount(), 1);
    assert.equal((await parallel.run()).status, 'completed');
    result.push({ case: 'concurrent_same_key', callers: 6, effects: 1, status: 'PASS' });
    const rollback = services(manifest.keys['save-failure'], { failReceiptSave: true });
    assert.equal((await rollback.run()).status, 'not_executed');
    assert.equal(await rollback.effectCount(), 0);
    assert.equal(await prisma.actionExecution.count({ where: { tenantId: manifest.tenantId, sourceRef: rollback.request().source.sourceRef } }), 0);
    result.push({ case: 'receipt_failure_rolls_back_canonical_admission', effects: 0, executions: 0, status: 'PASS' });
    const late = services(manifest.keys.late, { timeoutMs: 20, delayMs: 80 });
    assert(['executing', 'unknown'].includes((await late.run()).status));
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal((await services(manifest.keys.late).run()).status, 'completed');
    assert.equal(await late.effectCount(), 1);
    result.push({ case: 'timeout_late_success', effects: 1, status: 'PASS' });
    const audit = services(manifest.keys.audit, { auditFailure: true });
    assert.equal((await audit.run()).status, 'completed');
    assert.equal(await audit.effectCount(), 1);
    result.push({ case: 'audit_failure_preserves_canonical_success', status: 'PASS' });
    const lost = services(manifest.keys['lost-presentation'], { presentationFailure: true });
    const lostResult = await lost.run();
    assert.equal(lostResult.status, 'unknown');
    assert.equal(lostResult.canonical_actions[0].state, 'SUCCEEDED');
    assert.equal(lostResult.invocation_completed, false);
    assert.equal((await services(manifest.keys['lost-presentation']).run()).status, 'unknown');
    assert.equal(await lost.effectCount(), 1);
    result.push({ case: 'lost_presentation_does_not_claim_whole_tool_completion', effects: 1, status: 'PASS' });
    write('baseline.json', { phase, result, processId: process.pid, productionEffects: 0, providerCalls: 0 });
  } else {
    manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json')));
    if (phase === 'crash-unknown-ready') {
      assert(!manifest.keys['unknown-ready'], 'fresh phase requires a new manifest');
      manifest.keys['unknown-ready'] = randomUUID(); write('manifest.json', manifest);
      await services(manifest.keys['unknown-ready'], { unknown: true, crashBeforeReconcile: true }).run();
    }
    else if (phase === 'crash-ready') await services(manifest.keys.ready, { crashReady: true }).run();
    else if (phase === 'crash-prefix') await services(manifest.keys.prefix, { crashPrefix: true, secondSlot: true }).run();
    else if (phase === 'crash-unknown') await services(manifest.keys.unknown, { unknown: true, crashUnknown: true }).run();
    else if (phase === 'resume-ready') {
      const h = services(manifest.keys.ready); const result = await h.run();
      const before = JSON.parse(fs.readFileSync(path.join(out, 'crash-ready.json')));
      assert.equal(result.status, 'completed'); assert.equal(result.canonical_actions[0].executionId, before.executionId);
      assert.equal(await h.effectCount(), 1); assert.notEqual(process.pid, before.processId);
      write('resume-ready.json', { phase, status: 'PASS', result, effects: 1, processId: process.pid });
    } else if (phase === 'resume-prefix') {
      const h = services(manifest.keys.prefix, { secondSlot: true }); const result = await h.run();
      const before = JSON.parse(fs.readFileSync(path.join(out, 'crash-prefix.json')));
      assert.equal(result.status, 'unknown'); assert.equal(result.invocation_completed, false);
      assert.equal(result.canonical_actions[0].executionId, before.executionId); assert.equal(result.canonical_actions.length, 1);
      assert.equal(await h.effectCount(), 1); assert.notEqual(process.pid, before.processId);
      write('resume-prefix.json', { phase, status: 'PASS', result, effects: 1, newSlots: 0, processId: process.pid });
    } else if (phase === 'resume-unknown-ready') {
      const h = services(manifest.keys['unknown-ready'], { reconcileSuccess: true }); const result = await h.run();
      const before = JSON.parse(fs.readFileSync(path.join(out, 'crash-unknown-ready.json')));
      assert.equal(result.status, 'completed'); assert.equal(result.canonical_actions[0].executionId, before.executionId);
      const attempts = await prisma.actionAttempt.findMany({ where: { actionExecutionId: before.executionId }, select: { kind: true, state: true } });
      assert.equal(attempts.filter((attempt) => attempt.kind === 'EXECUTION').length, 1);
      assert.equal(attempts.filter((attempt) => attempt.kind === 'RECONCILIATION' && attempt.state === 'SUCCEEDED').length, 1);
      assert.equal(await h.effectCount(), 1); assert.notEqual(process.pid, before.processId);
      write('resume-unknown-ready.json', { phase, status: 'PASS', result, effects: 1, attempts, newProviderAttempts: 0, processId: process.pid });
    } else if (phase === 'resume-unknown') {
      // Existing policy exhausts its second inconclusive reconciliation.
      const h = services(manifest.keys.unknown); const result = await h.run();
      const before = JSON.parse(fs.readFileSync(path.join(out, 'crash-unknown.json')));
      assert.equal(result.status, 'unknown'); assert.equal(result.canonical_actions[0].executionId, before.executionId);
      assert.equal(result.canonical_actions[0].reconciliationState, 'MANUAL_REQUIRED');
      const attempts = await prisma.actionAttempt.findMany({ where: { actionExecutionId: before.executionId }, select: { kind: true, state: true } });
      assert.equal(attempts.filter((attempt) => attempt.kind === 'EXECUTION').length, 1);
      assert.equal(await h.effectCount(), 1); assert.notEqual(process.pid, before.processId);
      write('resume-unknown.json', { phase, status: 'PASS', result, effects: 1, attempts, newProviderAttempts: 0, processId: process.pid });
    } else throw new Error('Unknown proof phase');
  }
  process.stdout.write(JSON.stringify({ phase, status: 'PASS', productionEffects: 0, providerCalls: 0 }) + '\n');
}
execute().catch((error) => { process.stderr.write(String(error.stack) + '\n'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
