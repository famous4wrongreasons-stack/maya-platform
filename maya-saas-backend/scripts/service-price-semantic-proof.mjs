// Local, serial synthetic YC-SP1 qualification. Reuses the guarded proof-cluster
// primitives; never reads developer credentials or connects to a real provider.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { proofCommands, proofEnvironment, runCommand } from './c9-occupancy-proof.mjs';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.dirname(backend);
const output = process.argv[2];
assert.ok(output && path.isAbsolute(output) && !fs.existsSync(output), 'new absolute evidence directory required');
for (const name of ['.env', '.env.local']) assert.ok(!fs.existsSync(path.join(backend, name)));
const scopes = ['maya-saas-backend', 'maya-carrier-react', 'maya-chat-shell'];
const clean = () => execFileSync('git', ['diff', '--exit-code', 'HEAD', '--', ...scopes], { cwd: root, stdio: 'pipe' });
clean();
const fixtureDirectory = path.join(root, 'pricing-evidence/ui-carrier');
assert.ok(!fs.existsSync(fixtureDirectory), 'do not overwrite an earlier carrier export');
fs.mkdirSync(output, { mode: 0o700 });
const privateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-price-semantic-'));
const cluster = path.join(privateRoot, 'pg');
const server = net.createServer();
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const database = 'maya_widget_gate_proof_c9occ_' + randomBytes(6).toString('hex');
const pgBin = '/opt/homebrew/opt/postgresql@16/bin';
const env = { ...proofEnvironment(process.env, `postgresql://c9_proof@127.0.0.1:${port}/${database}`), NODE_OPTIONS: '--max-old-space-size=1536', FORCE_COLOR: '0' };
const control = { cancelled: null, terminateActive: null, activeCleanup: false };
const commands = proofCommands({ pgBin, cluster, log: path.join(output, 'postgres.log'), port, database, receipt: path.join(privateRoot, 'unused.json'), output }).slice(0, 4);
commands.push(
  { name: 'price-http-pg', command: process.execPath, args: ['node_modules/jest/bin/jest.js', '--config', 'test/jest-widgets-live.json', '--runInBand', '--runTestsByPath', 'test/widgets-live/service-price.live-spec.ts', '--json', '--outputFile=' + path.join(output, 'http-jest.json')], env: { WIDGETS_EVIDENCE_DIR: fixtureDirectory } },
  { name: 'carrier-bundle', command: process.execPath, args: ['test/build-harness.mjs'], cwd: path.join(root, 'maya-carrier-react') },
  { name: 'carrier-http-fixture', command: process.execPath, args: ['--test', 'test/service-price-http-fixture.test.mjs'], cwd: path.join(root, 'maya-carrier-react'), env: { MAYA_SERVICE_PRICE_HTTP_FIXTURE: path.join(fixtureDirectory, 'service-price-carrier.json') } },
  { name: 'carrier-typecheck', command: process.execPath, args: ['build.mjs', '--typecheck'], cwd: path.join(root, 'maya-carrier-react') },
  { name: 'carrier-web-build', command: process.execPath, args: ['build.mjs', '--target=web'], cwd: path.join(root, 'maya-carrier-react') },
);
const files = [
  'maya-saas-backend/src/conversation-intelligence/conversation-taxonomy.ts',
  'maya-saas-backend/src/ai-tools/ai-core-model.service.ts',
  'maya-saas-backend/src/ai-tools/ai-core.service.ts',
  'maya-saas-backend/src/ai-tools/service-price-chat-binding.ts',
  'maya-saas-backend/test/widgets-live/service-price.live-spec.ts',
  'maya-carrier-react/test/service-price-http-fixture.test.mjs',
];
const hashes = () => Object.fromEntries(files.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
const manifest = { qualification: 'SYNTHETIC_SCRIPTED_VALIDATED_SEMANTICS_HTTP_PG_CURRENT_CARRIER', sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sourceHashes: hashes(), status: 'running', completed: [], cluster, database, port, realModelAcceptance: false, externalProviderAcceptance: false, browserAcceptance: false, resources: { nodeHeapMb: 1536, jestWorkers: 1, pgSharedBuffersMb: 64 } };
const save = () => fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const cancel = signal => { control.cancelled ??= signal; save(); if (!control.activeCleanup) control.terminateActive?.(); };
process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
let started = false;
save();
try {
  for (const spec of commands) {
    if (spec.name === 'pg-start') started = true;
    console.log(spec.name);
    await runCommand({ cwd: backend, ...spec }, env, output, control);
    manifest.completed.push(spec.name); save();
  }
  fs.copyFileSync(path.join(fixtureDirectory, 'service-price-carrier.json'), path.join(output, 'service-price-carrier.json'));
  manifest.status = 'passed';
} catch (error) { manifest.status = 'failed'; throw error; }
finally {
  try {
    if (started) {
      await runCommand({ name: 'pg-stop', command: path.join(pgBin, 'pg_ctl'), args: ['-D', cluster, '-m', 'fast', '-w', '-t', '30', 'stop'] }, env, output, control);
      manifest.clusterStopped = true;
      manifest.pidAbsent = !fs.existsSync(path.join(cluster, 'postmaster.pid'));
    }
    clean();
    manifest.sourceUnchanged = JSON.stringify(hashes()) === JSON.stringify(manifest.sourceHashes);
  } finally { save(); }
}
