/* Stage 1 assessment only. Runs the current wrapper and Action Engine runtime
 * with in-memory persistence and synthetic handlers. It intentionally proves
 * the known B50 baseline defect; it is not a remediation acceptance test. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '../../..');
const backend = path.join(root, 'maya-saas-backend');
let blockedIoAttempts = 0;
const denyIo = () => { blockedIoAttempts += 1; throw new Error('Hermetic proof forbids network/process IO'); };
require('node:net').Socket.prototype.connect = denyIo;
require('node:tls').connect = denyIo;
global.fetch = denyIo;
for (const name of ['spawn', 'exec', 'execFile', 'fork', 'spawnSync', 'execSync', 'execFileSync'])
  require('node:child_process')[name] = denyIo;
require(path.join(backend, 'node_modules/ts-node')).register({
  project: path.join(backend, 'tsconfig.json'), transpileOnly: true,
});
const { AiToolRuntimeService } = require(path.join(backend, 'src/ai-tools/ai-tool-runtime.service.ts'));
const { ActionEngineRuntimeService, actionExecutionResultFromError } = require(path.join(backend, 'src/action-engine/action-engine.runtime.ts'));
const receipt = (state) => ({ contract: 'maya.action-execution-result/1', executionId: 'canonical-fixture', state });

function wrapperHarness(handler, failCompletionAudit = false) {
  let row;
  let approvalStatus = 'approved';
  let calls = 0;
  const writes = [];
  const prisma = {
    aiToolExecution: {
      findUnique: async () => row ? { ...row } : null,
      create: async ({ data }) => { row = { id: 'ai-fixture', ...data }; return row; },
      update: async ({ data }) => { writes.push(data.status); Object.assign(row, data); return row; },
    },
    aiApprovalRequest: {
      updateMany: async () => { approvalStatus = 'executing'; return { count: 1 }; },
      update: async ({ data }) => { approvalStatus = data.status; return {}; },
    },
    $transaction: async (operations) => Promise.all(operations),
  };
  const runtime = new AiToolRuntimeService(prisma, {}, {}, {}, {
    execute: async () => { calls += 1; return handler(); },
  }, { encrypt: (value) => Buffer.from(value).toString('base64'), decrypt: (value) => Buffer.from(value, 'base64').toString() }, {
    log: async ({ action }) => {
      if (failCompletionAudit && action === 'ai.tool_execution_completed') throw new Error('synthetic audit unavailable');
    },
  });
  const params = {
    principal: { tenantId: 'tenant-fixture', userId: 'user-fixture', surface: 'web' },
    definition: { name: 'appointments.own.create', riskTier: 'medium_write', timeoutMs: 5, fallbackPolicy: 'none' },
    args: {}, inputHash: 'immutable-fixture', idempotencyKey: 'same-fixture-key',
    approval: { id: 'approval-fixture', tenantId: 'tenant-fixture' },
  };
  return { run: () => runtime.executeNow(params), row: () => row, approval: () => approvalStatus, calls: () => calls, writes };
}

async function wrapperDefects() {
  let release;
  let syntheticEffects = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  const timed = wrapperHarness(async () => { await gate; syntheticEffects += 1; return { created: true }; });
  await assert.rejects(timed.run(), (error) => error.getResponse().error.code === 'ai_tool_timeout_unknown');
  assert.equal(timed.row().status, 'failed');
  assert.equal(timed.approval(), 'failed');
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(syntheticEffects, 1);
  assert.equal(timed.row().status, 'failed');
  await assert.rejects(timed.run(), (error) => error.getResponse().error.code === 'ai_tool_previous_execution_failed');
  assert.equal(timed.calls(), 1);

  const lowerUnknown = new Error('synthetic provider uncertainty');
  Object.defineProperty(lowerUnknown, 'actionExecutionResult', { value: receipt('UNKNOWN') });
  const unknown = wrapperHarness(async () => { throw lowerUnknown; });
  await assert.rejects(unknown.run(), (error) => actionExecutionResultFromError(error).state === 'UNKNOWN');
  assert.equal(unknown.row().status, 'failed');
  assert.equal(unknown.approval(), 'failed');
  assert.equal(unknown.row().encryptedResult, undefined);
  await assert.rejects(unknown.run(), (error) => error.getResponse().error.code === 'ai_tool_previous_execution_failed');

  const audit = wrapperHarness(async () => ({ created: true }), true);
  await assert.rejects(audit.run(), /synthetic audit unavailable/);
  assert.deepEqual(audit.writes, ['completed', 'failed']);
  assert.equal(audit.row().status, 'failed');
  assert.equal(audit.approval(), 'failed');
  return [
    { case: 'wrapper_timeout_then_late_effect_same_key', status: 'DEFECT_REPRODUCED', wrapper: 'failed', approval: 'failed', replay: 'ai_tool_previous_execution_failed', syntheticEffects, handlerCalls: timed.calls() },
    { case: 'lower_unknown_receipt_collapsed_by_wrapper', status: 'DEFECT_REPRODUCED', canonical: 'UNKNOWN', wrapper: 'failed', approval: 'failed', durableCompatibilityReceipt: false },
    { case: 'post_success_audit_failure_overwrites_completion', status: 'DEFECT_REPRODUCED', statusWrites: audit.writes, handlerCalls: audit.calls() },
  ];
}

function engineHarness(manual) {
  let row = { id: 'canonical-fixture', tenantId: 'tenant-fixture', state: 'UNKNOWN', reconciliationState: manual ? 'MANUAL_REQUIRED' : 'PENDING' };
  let dispatched = 0;
  let reconciled = 0;
  let ingressCalls = 0;
  const kernel = {
    getExecutionResult: async () => ({ ...receipt(row.state), ...(row.safeResultSummaryJson ? { safeResult: row.safeResultSummaryJson } : {}) }),
    getAudit: async () => ({ execution: { ...row } }),
    claimExecution: async () => { throw new Error('UNKNOWN cannot claim execution'); },
    claimReconciliation: async () => ({ attempt: { id: 'reconcile-fixture' }, leaseToken: 'fixture' }),
    readTrustedNormalizedInput: async () => ({}),
    readLatestPreDispatchContext: async () => undefined,
    finalizeReconciliation: async ({ outcome, safeResult }) => {
      assert.equal(outcome, 'CONFIRMED_APPLIED');
      row = { ...row, state: 'SUCCEEDED', reconciliationState: 'RESOLVED', safeResultSummaryJson: safeResult };
    },
  };
  const runtime = new ActionEngineRuntimeService(kernel, {
    createExecution: async () => { ingressCalls += 1; return { ...row }; },
  });
  const request = { tenantId: 'tenant-fixture', callerIdempotency: { scope: 'fixture', key: 'same-fixture-key' } };
  const handlers = {
    dispatch: async () => { dispatched += 1; throw new Error('No dispatch permitted in this proof'); },
    reconcile: async () => { reconciled += 1; return { outcome: 'CONFIRMED_APPLIED', safeResult: { accepted: true } }; },
    restore: (value) => value,
    classifyError: () => ({ kind: 'unknown', outcomeCode: 'fixture', errorClass: 'fixture' }),
  };
  return { run: () => runtime.executeWithReceipt(request, handlers), counts: () => ({ dispatched, reconciled, ingressCalls }) };
}

async function engineFoundation() {
  const manual = engineHarness(true);
  for (let retry = 0; retry < 2; retry += 1)
    await assert.rejects(manual.run(), (error) => error.code === 'ACTION_RECONCILIATION_MANUAL_REQUIRED' && actionExecutionResultFromError(error).executionId === 'canonical-fixture' && actionExecutionResultFromError(error).state === 'UNKNOWN');
  assert.deepEqual(manual.counts(), { dispatched: 0, reconciled: 0, ingressCalls: 2 });
  const reconciled = engineHarness(false);
  const first = await reconciled.run();
  const retry = await reconciled.run();
  assert.equal(first.execution.executionId, retry.execution.executionId);
  assert.equal(first.execution.state, 'SUCCEEDED');
  assert.deepEqual(first.value, retry.value);
  assert.deepEqual(reconciled.counts(), { dispatched: 0, reconciled: 1, ingressCalls: 2 });
  return [
    { case: 'canonical_unknown_manual_required_same_receipt_no_dispatch', status: 'FOUNDATION_PASS', ...manual.counts() },
    { case: 'canonical_unknown_reconcile_then_same_receipt_replay', status: 'FOUNDATION_PASS', ...reconciled.counts() },
  ];
}

(async () => {
  const result = {
    package: 'R10', blockers: ['B50'], mode: 'STAGE1_ASSESSMENT_ONLY',
    baseline: await wrapperDefects(), foundation: await engineFoundation(),
    limitations: 'Actual TypeScript services with in-memory persistence and synthetic handlers. No PostgreSQL lock/transaction, process-restart durability, real provider or remediation acceptance proof.',
    databaseConnections: 0, networkRequests: 0, productionMutations: 0, blockedIoAttempts,
  };
  assert.equal(blockedIoAttempts, 0);
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(JSON.stringify(result) + '\n');
})().catch((error) => { process.stderr.write(String(error.stack) + '\n'); process.exitCode = 1; });
