import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const src = (name: string) =>
  readFileSync(resolve(__dirname, '..', name), 'utf8');
const runtime = () => src('ai-tools/ai-tool-runtime.service.ts');

function method(text: string, name: string): string {
  const file = ts.createSourceFile(
    'fixture.ts',
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  let result = '';
  const visit = (node: ts.Node) => {
    if (ts.isMethodDeclaration(node) && node.name.getText(file) === name)
      result = node.body?.getText(file) ?? '';
    ts.forEachChild(node, visit);
  };
  visit(file);
  return result;
}

function unsafeMutationWrapper(body: string): boolean {
  return (
    /(?:\.aiToolExecution|\.aiApprovalRequest)\.(?:update|updateMany)\([\s\S]*?(?:FAILED|['"]failed['"])/.test(
      body,
    ) ||
    /(?:appointment|expense|loyaltyTransaction|marketingCampaignRecipient)\.(?:create|update|upsert|delete)\(/.test(
      body,
    ) ||
    /(?:fetch|sendMessage|sendPush|createBooking)\(/.test(body)
  );
}

function astCalls(text: string) {
  const file = ts.createSourceFile(
    'candidate.ts',
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { file, calls };
}

function writeWrapperViolations(text: string): string[] {
  const { file, calls } = astCalls(
    `class Candidate { async executeCanonicalTool() ${text} }`,
  );
  const violations: string[] = [];
  const handlerCalls = calls.filter(
    (call) =>
      call.expression.getText(file).replace(/\s+/g, '') ===
      'this.handler.execute',
  );
  if (handlerCalls.length !== 1) violations.push('handler-call-count');
  for (const call of handlerCalls) {
    let parent: ts.Node | undefined = call.parent;
    let bound = false;
    let attachedToOperation = false;
    while (parent) {
      if (
        ts.isCallExpression(parent) &&
        parent.expression.getText(file).replace(/\s+/g, '') ===
          'this.receipts.run' &&
        parent.arguments[1] &&
        call.pos >= parent.arguments[1].pos &&
        call.end <= parent.arguments[1].end
      )
        bound = true;
      if (
        ts.isVariableDeclaration(parent) &&
        parent.name.getText(file) === 'operation'
      )
        attachedToOperation = true;
      parent = parent.parent;
    }
    if (!attachedToOperation) violations.push('detached-receipt-result');
    if (!bound) violations.push('handler-before-receipt');
    if (call.arguments[3]?.getText(file) !== 'params.idempotencyKey')
      violations.push('new-handler-key');
  }
  for (const call of calls) {
    const target = call.expression.getText(file).replace(/\s+/g, '');
    if (
      /\.(?:aiToolExecution|aiApprovalRequest)\.(?:update|updateMany)$/.test(
        target,
      ) &&
      /(?:FAILED|['"]failed['"])/.test(call.getText(file))
    )
      violations.push('terminal-tombstone');
    if (target === 'randomUUID') violations.push('fresh-key');
    if (
      /\.(?:appointment|expense|loyaltyTransaction)\.(?:create|update|upsert|delete)$/.test(
        target,
      ) ||
      /(?:^|\.)(?:fetch|sendMessage|createBooking)$/.test(target)
    )
      violations.push('direct-effect');
  }
  const awaitedTimeout = calls.some(
    (call) =>
      call.expression.getText(file).replace(/\s+/g, '') ===
        'this.withTimeout' &&
      call.arguments[0]?.getText(file) === 'operation' &&
      ts.isAwaitExpression(call.parent),
  );
  if (!awaitedTimeout) violations.push('detached-receipt-operation');
  return violations;
}

function ingressReceiptViolations(text: string): string[] {
  const { file, calls } = astCalls(
    `class Candidate { async createExecution() ${text} }`,
  );
  const violations: string[] = [];
  const admits = calls.filter(
    (call) => call.expression.getText(file) === 'admitWithInvocationReceipt',
  );
  const writes = calls.filter(
    (call) =>
      call.expression.getText(file).replace(/\s+/g, '') ===
      'this.kernel.createCanonicalExecution',
  );
  if (admits.length !== 1 || writes.length !== 1)
    return ['canonical-admission-count'];
  const admit = admits[0];
  const write = writes[0];
  const callback = admit.arguments[1];
  if (
    !callback ||
    !ts.isArrowFunction(callback) ||
    write.pos < callback.pos ||
    write.end > callback.end
  )
    violations.push('canonical-write-outside-attachment');
  if (
    !ts.isReturnStatement(admit.parent) &&
    !ts.isAwaitExpression(admit.parent)
  )
    violations.push('detached-admission');
  const prepared = calls.find(
    (call) => call.expression.getText(file) === 'this.prepare',
  );
  if (
    !prepared ||
    !ts.isAwaitExpression(prepared.parent) ||
    prepared.pos > write.pos
  )
    violations.push('policy-not-awaited-before-admission');
  if (write.arguments[2]?.getText(file) !== 'tx')
    violations.push('attachment-transaction-lost');
  return violations;
}

function receiptAdmissionViolations(text: string): string[] {
  const { file, calls } = astCalls(text);
  const persist = calls.find(
    (call) =>
      call.expression.getText(file).replace(/\s+/g, '') === 'persist' &&
      call.arguments[0]?.getText(file) === 'request',
  );
  const violations: string[] = [];
  if (!persist || !ts.isAwaitExpression(persist.parent))
    return ['admission-not-awaited'];
  let node: ts.Node | undefined = persist;
  let block: ts.Block | undefined;
  while (node) {
    if (ts.isBlock(node)) {
      block = node;
      break;
    }
    node = node.parent;
  }
  if (!block) return ['admission-block-missing'];
  const save = calls.find(
    (call) =>
      call.pos > persist.pos &&
      call.end < block.end &&
      call.expression.getText(file).replace(/\s+/g, '') === 'this.save',
  );
  if (!save || !ts.isAwaitExpression(save.parent))
    violations.push('receipt-not-awaited');
  let transaction: ts.Node | undefined = block.parent;
  while (
    transaction &&
    !(
      ts.isCallExpression(transaction) &&
      transaction.expression.getText(file).replace(/\s+/g, '') ===
        'this.transaction'
    )
  )
    transaction = transaction.parent;
  if (!transaction) violations.push('not-atomic');
  for (const statement of block.statements) {
    if (
      ts.isReturnStatement(statement) &&
      statement.expression?.getText(file) === 'execution' &&
      (!save || statement.pos < save.end)
    )
      violations.push('return-before-receipt');
  }
  return violations;
}

describe('R10 permanent canonical AI receipt ratchet', () => {
  it('separates mutation receipt projection from read-only timeout and stale snapshot fallback', () => {
    const entry = method(runtime(), 'executeNow');
    expect(entry.indexOf("params.definition.riskTier !== 'read'")).toBeLessThan(
      entry.indexOf('aiToolExecution.findUnique'),
    );
    expect(entry).toContain('return this.executeCanonicalTool(params)');
    const writes = method(runtime(), 'executeCanonicalTool');
    expect(writes).toContain('this.receipts.project(');
    expect(writes).not.toContain('lastVerifiedSnapshot');
    expect(unsafeMutationWrapper(writes)).toBe(false);
    expect(writeWrapperViolations(writes)).toEqual([]);
    expect(writes).not.toContain('actionExecution.create');
    expect(writes).not.toContain('ActionEngineKernel');
  });

  it('rejects mutated real write methods with early/detached execution, tombstones, or fresh replay keys', () => {
    const writes = method(runtime(), 'executeCanonicalTool');
    const mutations = [
      writes.replace(
        'const operation =',
        'await this.handler.execute(params.definition.name, params.principal, params.args, params.idempotencyKey); const operation =',
      ),
      writes.replace(
        'let result;',
        "await this.prisma.aiToolExecution.update({data:{status:'failed'}}); let result;",
      ),
      writes.replace(
        '.catch(() => undefined)',
        ".catch(() => this.prisma.aiToolExecution.update({data:{status:'failed'}}))",
      ),
      writes.replace('params.idempotencyKey', 'randomUUID()'),
      writes.replace(
        'const operation =',
        'const operation = Promise.resolve(); const detached =',
      ),
      writes.replace(
        'await this.withTimeout(operation,',
        'this.withTimeout(operation,',
      ),
    ];
    for (const mutation of mutations) {
      expect(mutation).not.toBe(writes);
      expect(writeWrapperViolations(mutation).length).toBeGreaterThan(0);
    }
  });

  it('rejects a timeout tombstone or direct domain/provider regression fixture', () => {
    for (const regression of [
      "catch(error) { return prisma.aiToolExecution.update({ data: { status: 'failed' } }); }",
      'await prisma.appointment.create({data: input});',
      'await sendMessage(input.chat_id, input.text);',
    ])
      expect(unsafeMutationWrapper(regression)).toBe(true);
  });

  it('attaches through canonical admission before returning to every existing executor family', () => {
    const ingress = method(
      src('action-engine/action-engine.ingress.ts'),
      'createExecution',
    );
    expect(ingressReceiptViolations(ingress)).toEqual([]);
    expect(ingress).toContain('admitWithInvocationReceipt(');
    expect(ingress).toContain('this.prepare(admittedRequest)');
    expect(ingress).toContain('this.kernel.createCanonicalExecution(');
    const receipt = src('ai-tools/ai-tool-receipt.service.ts');
    expect(receipt).toContain('FOR UPDATE');
    expect(receipt).toContain('this.transaction(transaction,');
    expect(receipt).toContain('const execution = await persist(request, tx)');
    expect(receipt).toContain('await this.save(invocation, receipt, tx)');
    expect(receipt).not.toContain('actionExecution.create(');
    expect(receipt).not.toContain('actionAttempt.create(');
    expect(receiptAdmissionViolations(receipt)).toEqual([]);
    for (const family of [
      'package5-wave1/package5-wave1.service.ts',
      'package5-wave3/package5-wave3.service.ts',
    ])
      expect(src(family)).toContain('await attachExistingInvocationReceipt(');
  });

  it('rejects mutated canonical ingress with detached persistence, missing policy await or lost transaction', () => {
    const ingress = method(
      src('action-engine/action-engine.ingress.ts'),
      'createExecution',
    );
    for (const mutation of [
      ingress.replace(
        'return admitWithInvocationReceipt(',
        'admitWithInvocationReceipt(',
      ),
      ingress.replace(
        'await this.prepare(admittedRequest)',
        'this.prepare(admittedRequest)',
      ),
      ingress.replace('          tx,', '          undefined,'),
      ingress.replace(
        'return admitWithInvocationReceipt(',
        'await this.kernel.createCanonicalExecution(request, policy); return admitWithInvocationReceipt(',
      ),
    ]) {
      expect(mutation).not.toBe(ingress);
      expect(ingressReceiptViolations(mutation).length).toBeGreaterThan(0);
    }
  });

  it('rejects mutated real admission methods that return/dispatch before durable attachment', () => {
    const receipt = src('ai-tools/ai-tool-receipt.service.ts');
    for (const mutation of [
      receipt.replace(
        'const execution = await persist(request, tx)',
        'const execution = persist(request, tx)',
      ),
      receipt.replace(
        'await this.save(invocation, receipt, tx)',
        'this.save(invocation, receipt, tx)',
      ),
      receipt.replace(
        'await this.save(invocation, receipt, tx)',
        'return execution; await this.save(invocation, receipt, tx)',
      ),
    ]) {
      expect(mutation).not.toBe(receipt);
      expect(receiptAdmissionViolations(mutation).length).toBeGreaterThan(0);
    }
  });

  it('keeps immutable correlation encrypted and reads current canonical outcome rather than owning a new lifecycle', () => {
    const receipt = src('ai-tools/ai-tool-receipt.service.ts');
    expect(receipt).toContain("'maya.ai-canonical-receipt/1'");
    expect(receipt).toContain(
      'row.actorUserId !== invocation.principal.userId',
    );
    expect(receipt).toContain('row.inputHash !== invocation.inputHash');
    expect(receipt).toContain('row.surface !== invocation.principal.surface');
    expect(receipt).toContain(
      'execution.identityFingerprint !== binding.identityFingerprint',
    );
    expect(receipt).toContain('this.kernel.readTrustedNormalizedInput(');
    expect(receipt).toContain('input: null');
    expect(receipt).toContain("'ai_tool_canonical_plan_changed'");
    expect(receipt).toContain('receipt.settled === true');
    expect(receipt).toContain('receipt.admissionToken !== admissionToken');
    expect(receipt).toContain("continuation: 'manual_required'");
    expect(receipt).not.toMatch(/status:\s*['"]unknown['"]/);
    expect(receipt).not.toContain('claimExecution(');
    expect(receipt).not.toContain('finalizeUnknown(');
  });
});
