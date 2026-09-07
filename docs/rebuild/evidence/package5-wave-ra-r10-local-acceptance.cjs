/* Current R10 acceptance entry point. Historical Stage 1 DEFECT_REPRODUCED
 * results and original probe remain immutable in accepted checkpoint 45688886.
 * This entry now runs the registered acceptance/ratchet cases, never asserts
 * that the old timeout tombstone should remain. No database/provider access. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const backend = path.join(root, 'maya-saas-backend');
const output = path.resolve(process.argv[2] || '');
assert(output.startsWith('/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/package5-wave-ra-implementation/r10/'));
let blockedIoAttempts = 0;
const denyIo = () => { blockedIoAttempts += 1; const error = new Error('R10 hermetic proof forbids database/network/provider/process IO'); process.stderr.write(error.stack + '\n'); throw error; };
require('node:net').Socket.prototype.connect = denyIo;
require('node:tls').connect = denyIo;
global.fetch = denyIo;
for (const name of ['spawn', 'exec', 'execFile', 'fork', 'spawnSync', 'execSync', 'execFileSync']) require('node:child_process')[name] = denyIo;
const suites = ['src/ai-tools/ai-tool-canonical-receipt.spec.ts', 'src/action-engine/ai-invocation-receipt.architecture.spec.ts'];
require(path.join(backend, 'node_modules/jest')).runCLI({ watchman: false, runInBand: true, runTestsByPath: true, _: suites.map((file) => path.join(backend, file)), $0: 'r10-local-acceptance' }, [backend]).then(({ results }) => {
  const report = { contract: 'package5.wave-ra.r10.hermetic-acceptance/1', status: results.success ? 'PASS' : 'FAIL',
    suites: results.numTotalTestSuites, tests: results.numTotalTests, passedTests: results.numPassedTests, failedTests: results.numFailedTests,
    blockedIoAttempts, databaseConnections: 0, providerCalls: 0, productionEffects: 0 };
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  assert.equal(results.success, true); assert.equal(blockedIoAttempts, 0); process.stdout.write(JSON.stringify(report) + '\n');
}).catch((error) => { process.stderr.write(String(error.stack) + '\n'); process.exitCode = 1; });
