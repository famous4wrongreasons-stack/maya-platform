import assert from 'node:assert/strict';
import path from 'node:path';

// Public synthetic material, admitted only with an explicit network-closed mode.
export const PUBLIC_DIAGNOSTIC_PARTNER = 'MAYA_PUBLIC_DIAGNOSTIC_NO_PROVIDER_20261010';
export function diagnosticSandboxPolicy(pgPort, apiPort) {
  for (const port of [pgPort, apiPort]) assert.ok(Number.isSafeInteger(port) && port > 1024 && port <= 65535);
  assert.notEqual(pgPort, apiPort);
  // macOS sandbox-exec accepts localhost (both loopbacks), not a literal IP.
  // This is a per-process restriction; no system security setting is changed.
  return `(version 1)(allow default)(deny network*)(allow network-bind (local ip "localhost:${apiPort}"))(allow network-inbound (local ip "localhost:${apiPort}"))(allow network-outbound (remote ip "localhost:${pgPort}"))`;
}
export function diagnosticRuntimeCommand(plan, runtimeEnv) {
  assert.equal(process.platform, 'darwin');
  assert.equal(runtimeEnv.YCLIENTS_PARTNER_TOKEN, PUBLIC_DIAGNOSTIC_PARTNER);
  const database = new URL(runtimeEnv.DATABASE_URL);
  assert.equal(database.hostname, '127.0.0.1');
  assert.equal(database.protocol, 'postgresql:');
  assert.equal(path.basename(plan.runtime.command), 'node');
  assert.equal(plan.runtime.args.length, 2);
  assert.equal(path.basename(plan.runtime.args[0]), 'local-yclients-read-runtime.mjs');
  assert.equal(plan.runtime.args[1], '--diagnostic-no-provider');
  return { command: '/usr/bin/sandbox-exec', args: ['-p', diagnosticSandboxPolicy(Number(database.port), Number(runtimeEnv.PORT)), plan.runtime.command, ...plan.runtime.args] };
}
