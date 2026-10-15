// Fresh contract/runtime/carrier/widgets surfaces on a clean committed candidate. Owned artificial database only; no deployment or grant.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
const backend = '/private/tmp/maya-ci-packaging-cfea53a8-20261015/candidate/maya-saas-backend';
const { values } = parseArgs({ options: { run: { type: 'boolean' }, output: { type: 'string' } } });
assert.equal(values.run, true, 'Explicit --run required');
assert.ok(values.output && path.isAbsolute(values.output) && !fs.existsSync(values.output), 'New absolute output required');
for (const name of ['.env', '.env.local']) assert.equal(fs.existsSync(path.join(backend, name)), false);
fs.mkdirSync(values.output, { mode: 0o700 });
fs.copyFileSync(process.argv[1], path.join(values.output, 'executed-runner.mjs'));
const privateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-platform-bootstrap-'));
const cluster = path.join(privateRoot, 'pg'), pgBin = '/opt/homebrew/opt/postgresql@16/bin';
const portServer = net.createServer();
await new Promise((resolve, reject) => { portServer.once('error', reject); portServer.listen(0, '127.0.0.1', resolve); });
const port = portServer.address().port;
await new Promise((resolve) => portServer.close(resolve));
const database = 'maya_widget_gate_proof_personal_release_' + randomBytes(6).toString('hex');
const env = { DATABASE_URL: `postgresql://staging_proof@127.0.0.1:${port}/${database}`, NODE_ENV: 'test', NODE_OPTIONS: '--max-old-space-size=3072', LANG: 'C', TZ: 'UTC' };
const require = createRequire(path.join(backend, 'package.json'));
const ciLiterals = require('js-yaml').load(fs.readFileSync(path.resolve(backend, '../.github/workflows/widgets-live.yml'), 'utf8')).jobs['widgets-live'].env;
for (const [key, value] of Object.entries(ciLiterals)) if (!['DATABASE_URL', 'WIDGET_GATEWAY_PG'].includes(key)) env[key] = value;
for (const key of ['PATH', 'HOME', 'TMPDIR']) if (process.env[key]) env[key] = process.env[key];
const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: backend, encoding: 'utf8' }).trim();
const sourceDirty = execFileSync('git', ['status', '--porcelain'], { cwd: backend, encoding: 'utf8' }).trim().length > 0;
assert.equal(sourceHead, 'cfea53a8fc745bb43e025d2556d37bdf9d5d0781');
assert.equal(sourceDirty, false, 'A clean committed candidate is required');
env.PATH = '/private/tmp/maya-cert-node22-20261013/node-v22.23.3-darwin-arm64/bin:/opt/homebrew/opt/python@3.11/libexec/bin:' + env.PATH;
const manifest = { sourceHead, sourceDirty, kind: 'personal-entry-release-surface-verification', cluster, database, port, status: 'running', completed: [], productionSigningKeysCreated: false, syntheticEphemeralSigningKeysUsed: true, syntheticTenants: true, externalCalls: 0, externalProviderAcceptance: false, realModelAcceptance: false, certificate: 'NOT_ISSUED', resources: { nodeHeapMb: 3072, pgSharedBuffersMb: 64, jestWorkers: 1, browserCount: 0 } };
const save = () => fs.writeFileSync(path.join(values.output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
let cancelled = null, activeChild = null, activeCleanup = false;
const cancel = (signal) => {
  cancelled ??= signal;
  manifest.cancelledBy = cancelled;
  save();
  // Only the directly owned stage. Its browser receives IPC disconnect and
  // cleans its own Chrome child; PostgreSQL is stopped by the outer finally.
  if (!activeCleanup) activeChild?.kill('SIGTERM');
};
const onInt = () => cancel('SIGINT'), onTerm = () => cancel('SIGTERM');
process.on('SIGINT', onInt);
process.on('SIGTERM', onTerm);
async function run(name, command, args, extra = {}, cwd = backend) {
  const cleanup = name === 'pg-stop';
  if (cancelled && !cleanup) throw new Error('Proof cancelled: ' + cancelled);
  console.log(name);
  const fd = fs.openSync(path.join(values.output, name + '.log'), 'wx', 0o600);
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd, env: { ...env, ...extra }, stdio: ['ignore', fd, fd] });
      activeChild = child; activeCleanup = cleanup;
      let killTimer;
      const terminate = () => {
        child.kill('SIGTERM');
        killTimer ??= setTimeout(() => child.kill('SIGKILL'), 5000);
      };
      // Cancellation and timeout both have a bounded TERM → KILL path.
      const onCancel = () => { if (!cleanup) terminate(); };
      process.on('SIGINT', onCancel); process.on('SIGTERM', onCancel);
      const timer = setTimeout(terminate, cleanup ? 45_000 : 1_800_000);
      const done = () => {
        clearTimeout(timer); clearTimeout(killTimer);
        process.off('SIGINT', onCancel); process.off('SIGTERM', onCancel);
        activeChild = null; activeCleanup = false;
      };
      child.once('error', e => { done(); reject(e); });
      child.once('close', code => {
        done();
        code === 0 && (!cancelled || cleanup)
          ? resolve()
          : reject(new Error(`${name} exited ${code}${cancelled ? '; cancelled: ' + cancelled : ''}; inspect its log`));
      });
    });
    manifest.completed.push(name); save();
  } finally { fs.closeSync(fd); }
}
const pg = (name) => path.join(pgBin, name), pgArgs = ['-D', cluster, '-w', '-t', '30'];
const stage = (name) => run(name, process.execPath, ['node_modules/jest/bin/jest.js', '--config', 'test/jest-widgets-live.json', '--testRegex', 'widgets-live/platform-owner-bootstrap\\.probe-spec\\.ts$', '--runTestsByPath', 'test/widgets-live/platform-owner-bootstrap.probe-spec.ts', '--runInBand', '--json', '--outputFile=' + path.join(values.output, name + '-jest.json')]);
let startAttempted = false;
save();
try {
  await run('widget-contract-types', process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '--project', 'tsconfig.widget-contract.json']);
  await run('widget-contract-check', process.execPath, ['scripts/widget-contract-check.mjs']);
  await run('k1-dossier', process.execPath, ['docs/rebuild/evidence/maya-chat-first-ux/k1/k1-dossier-check.mjs'], {}, path.dirname(backend));
  await run('live-types', process.execPath, ['node_modules/typescript/bin/tsc', '--project', 'test/tsconfig.widgets-live.json']);
  await run('initdb', pg('initdb'), ['-D', cluster, '--auth=trust', '--username=staging_proof', '--encoding=UTF8', '--locale=C']);
  startAttempted = true;
  await run('pg-start', pg('pg_ctl'), [...pgArgs, '-l', path.join(values.output, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k '' -c shared_buffers=64MB -c work_mem=4MB -c max_connections=30`, 'start']);
  await run('createdb', pg('createdb'), ['--host=127.0.0.1', '--port=' + port, '--username=staging_proof', database]);
  await run('migrations', process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
  await run('backend-build', process.execPath, ['node_modules/@nestjs/cli/bin/nest.js', 'build']);
  await run('preflight-build', process.execPath, ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.preflight.json']);
  const shell = path.resolve(backend, '../maya-chat-shell');
  const carrier = path.resolve(backend, '../maya-carrier-react');
  await run('runtime-build', process.execPath, ['build.mjs', '--no-baseline'], {}, shell);
  await run('runtime-check', process.execPath, ['build.mjs', '--check', '--no-baseline'], {}, shell);
  await run('runtime-selftest', process.execPath, ['build.mjs', '--self-test'], {}, shell);
  await run('runtime-types', process.execPath, ['build.mjs', '--typecheck', '--no-baseline'], {}, shell);
  await run('runtime-icons', process.execPath, ['brand/make-icons.mjs', '--check'], {}, shell);
  const runtimeTests = ['conformance.test.mjs', ...fs.readdirSync(path.join(shell, 'test')).filter(f=>f.endsWith('.test.mjs')).map(f=>'test/'+f)];
  await run('runtime-tests', process.execPath, ['--test', '--test-reporter=tap', ...runtimeTests], {}, shell);
  const node24 = '/usr/local/bin/node';
  assert.match(execFileSync(node24, ['--version'], { encoding: 'utf8' }).trim(), /^v24\./);
  await run('runtime-node24-check', node24, ['build.mjs', '--check', '--no-baseline'], {}, shell);
  await run('runtime-node24-build', node24, ['build.mjs', '--no-baseline'], {}, shell);
  await run('runtime-node24-selftest', node24, ['build.mjs', '--self-test'], {}, shell);
  await run('runtime-node24-types', node24, ['build.mjs', '--typecheck', '--no-baseline'], {}, shell);
  await run('runtime-node24-icons', node24, ['brand/make-icons.mjs', '--check'], {}, shell);
  await run('runtime-node24-tests', node24, ['--test', '--test-reporter=tap', ...runtimeTests], {}, shell);
  for (const name of ['runtime-tests', 'runtime-node24-tests']) {
    const skips = fs.readFileSync(path.join(values.output, name + '.log'), 'utf8').split('\n').filter(l=>/^\s*ok \d+ - .* # SKIP\b/.test(l));
    assert(skips.every(l=>/not a pass/i.test(l)), 'Every skip must be disclosed as not a pass');
    fs.writeFileSync(path.join(values.output, name + '-skips.json'), JSON.stringify(skips, null, 2)+'\n');
  }
  await run('k5-exit', '/bin/bash', ['docs/rebuild/evidence/maya-chat-first-ux/k5-exit-gate.sh'], {}, path.dirname(backend));
  await run('k15-census', process.execPath, ['docs/rebuild/evidence/maya-chat-first-ux/k15-bundle-census.mjs', '--json'], {}, path.dirname(backend));
  const census = JSON.parse(fs.readFileSync(path.join(values.output, 'k15-census.log'), 'utf8'));
  assert.equal(census.clientSideAuthorityValuesInSuccessor, 0);
  assert.deepEqual(census.successorReadsClientStorage, []);
  assert.deepEqual(census.successorReflectiveAccess, []);
  assert.equal(census.storageScan, 'ast+text');
  for (const wanted of ['maya-chat-shell/src', 'maya-chat-shell/entry']) assert(census.successorRoots.some(r=>r.root===wanted && r.present && r.files>0));
  await run('staging-carrier-preflight', process.execPath, ['--test', 'scripts/staging-carrier-preflight.test.mjs']);
  await run('phone-packaging-boundaries', process.execPath, ['--test', 'scripts/phone-staging-plan.test.mjs', 'scripts/phone-catalog-egress.test.mjs', 'scripts/phone-owner-bootstrap-plan.test.mjs', 'scripts/phone-catalog-plan.test.mjs']);
  await run('phone-catalog-mutations', process.execPath, ['scripts/phone-catalog-mutations.mjs']);
  await run('carrier-tests', 'npm', ['test'], {}, carrier);
  await run('canonical-release-build', process.execPath, ['tools/release.mjs', 'build'], {}, carrier);
  await run('carrier-release-tests', 'npm', ['run', 'test:release'], {}, carrier);
  const evidence = path.join(values.output, 'evidence');
  assert.equal(fs.existsSync(evidence), false);
  fs.mkdirSync(evidence, { mode: 0o700 });
  const evidenceEnv = { WIDGETS_EVIDENCE: '1', WIDGETS_EVIDENCE_DIR: evidence };
  await run('widgets-live', process.execPath, ['node_modules/jest/bin/jest.js', '--config', 'test/jest-widgets-live.json', '--runInBand', '--json', '--outputFile=' + path.join(values.output, 'widgets-live-jest.json')], evidenceEnv);
  await run('widgets-http-bin', process.execPath, ['node_modules/ts-node/dist/bin.js', '--project', 'tsconfig.scripts.json', '--transpile-only', 'scripts/widgets-intent-http-proof.ts'], evidenceEnv);
  await run('widgets-release-binary', process.execPath, ['node_modules/jest/bin/jest.js', '--config', 'test/jest-widgets-live.json', '--testRegex', 'widgets-live/.*\\.binary-spec\\.ts$', '--runInBand', '--json', '--outputFile=' + path.join(values.output, 'release-binary-jest.json')]);
  await run('strict-evidence-verifier', process.execPath, ['scripts/widgets-evidence-verify.mjs', '--dir', evidence]);
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: backend, encoding: 'utf8' }).trim(), sourceHead);
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: backend, encoding: 'utf8' }).trim(), '');

  manifest.status = 'passed';
} catch (e) { manifest.status = 'failed'; throw e; }
finally {
  if (startAttempted) {
    try { await run('pg-stop', pg('pg_ctl'), [...pgArgs, '-m', 'fast', 'stop']); manifest.clusterStopped = true; }
    catch { manifest.status = 'failed-stop'; manifest.clusterStopped = false; }
  }
  save();
  process.off('SIGINT', onInt); process.off('SIGTERM', onTerm);
}
assert.equal(manifest.status, 'passed');
console.log('Proof passed; owned services stopped: ' + values.output);
