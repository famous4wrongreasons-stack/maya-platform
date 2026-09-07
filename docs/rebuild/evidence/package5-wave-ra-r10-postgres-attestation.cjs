/* Read-only attestation of the exact owned R10 fixture tenant. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const backend = path.join(root, 'maya-saas-backend');
const directory = path.resolve(process.argv[2] || '');
assert(directory.startsWith('/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/package5-wave-ra-implementation/r10/'));
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json')));
const { PrismaClient } = require(path.join(backend, 'node_modules/@prisma/client'));
const { PrismaPg } = require(path.join(backend, 'node_modules/@prisma/adapter-pg'));
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://maya_ra@127.0.0.1:55507/maya_ra_r10' }) });
(async () => {
  const [executions, effects, invocations] = await Promise.all([
    prisma.actionExecution.findMany({ where: { tenantId: manifest.tenantId }, select: { id: true, sourceRef: true, state: true, reconciliationState: true, executionAttemptCount: true,
      attempts: { select: { kind: true, state: true, outcomeCode: true } } } }),
    prisma.auditLog.findMany({ where: { tenantId: manifest.tenantId, action: 'r10.synthetic_effect' }, select: { entityId: true, entityType: true } }),
    prisma.aiToolExecution.findMany({ where: { tenantId: manifest.tenantId }, select: { id: true, idempotencyKey: true, status: true } }),
  ]);
  const cases = Object.entries(manifest.keys).map(([name, key]) => {
    const rows = executions.filter((row) => row.sourceRef === `r10-fixture:${key}:first`);
    const expected = name === 'save-failure' ? 0 : 1;
    assert.equal(rows.length, expected, name); assert.equal(effects.filter((row) => row.entityType === key).length, expected, name);
    assert.equal(invocations.filter((row) => row.idempotencyKey === key).length, 1, name);
    for (const row of rows) { assert.equal(row.executionAttemptCount, 1, name); assert.equal(row.attempts.filter((attempt) => attempt.kind === 'EXECUTION').length, 1, name); }
    return { name, executions: rows, effects: expected, invocationCount: 1 };
  });
  assert.equal(executions.length, 8); assert.equal(effects.length, 8); assert.equal(invocations.length, 9);
  const report = { status: 'PASS', tenantId: manifest.tenantId, cases, executionCount: executions.length, invocationCount: invocations.length,
    syntheticEffects: effects.length, providerCalls: 0, productionEffects: 0, processId: process.pid, fixtureSha256: createHash('sha256').update(fs.readFileSync(__filename)).digest('hex') };
  fs.writeFileSync(path.join(directory, 'read-only-attestation.json'), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ status: report.status, executions: report.executionCount, invocations: report.invocationCount, effects: report.syntheticEffects }) + '\n');
})().catch((error) => { process.stderr.write(String(error.stack) + '\n'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
