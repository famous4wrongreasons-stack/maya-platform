// Narrow existing C9 READ qualification. The shared owned-cluster helpers do not grant runtime authority.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { proofCommands, proofEnvironment, runCommand } from './c9-occupancy-proof.mjs';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: { run: { type: 'boolean' }, output: { type: 'string' } } });
assert.equal(values.run, true, 'Explicit --run and parent heavy slot required');
assert.ok(values.output && path.isAbsolute(values.output) && !fs.existsSync(values.output));
for (const name of ['.env', '.env.local']) assert.equal(fs.existsSync(path.join(backend, name)), false);
const output = values.output;
fs.mkdirSync(output, { mode: 0o700 });
const cluster = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'maya-admin-status-')), 'pg');
const server = net.createServer();
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const port = server.address().port;
await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
// The existing cluster helper's closed DB namespace, not a production or shared cluster.
const database = 'maya_widget_gate_proof_c9occ_' + randomBytes(6).toString('hex');
const pgBin = '/opt/homebrew/opt/postgresql@16/bin';
const env = proofEnvironment(process.env, `postgresql://c9_proof@127.0.0.1:${port}/${database}`);
const commands = proofCommands({ pgBin, cluster, port, database, output, log: path.join(output, 'postgres.log'), receipt: path.join(output, 'unused-receipt.json') }).slice(0, 4);
commands.push({ name: 'admin-http', command: process.execPath, args: ['node_modules/jest/bin/jest.js', '--config', 'test/jest-widgets-live.json', '--runInBand', '--runTestsByPath', 'test/widgets-live/c9-chat-reads.live-spec.ts', '--testNamePattern=Admin integration status', '--json', '--outputFile=' + path.join(output, 'admin-http-jest.json')], env: { JEST_ADMIN_STATUS_REPORT: path.join(output, 'admin-http.json') } });
const manifest = { contract: 'maya.admin-status-owned-cluster/1', status: 'running', cluster, port, database, completed: [], resources: { nodeHeapMb: 3072, pgSharedBuffersMb: 64, pgWorkMemMb: 4, pgMaxConnections: 30, jestWorkers: 1 }, realModelAcceptance: false, browserAcceptance: false, backgroundAuthority: false };
const save = () => fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const control = { cancelled: null, terminateActive: null, activeCleanup: false };
const cancel = signal => { control.cancelled ??= signal; manifest.cancelledBy = signal; save(); if (!control.activeCleanup) control.terminateActive?.(); };
const onInt = () => cancel('SIGINT'), onTerm = () => cancel('SIGTERM');
process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
let startAttempted = false;
save();
try {
  for (const command of commands) {
    if (command.name === 'pg-start') startAttempted = true;
    console.log(command.name);
    await runCommand(command, env, output, control);
    manifest.completed.push(command.name); save();
  }
  manifest.status = 'passed';
} catch (error) { manifest.status = 'failed'; throw error; }
finally {
  if (startAttempted) {
    try {
      await runCommand({ name: 'pg-stop', command: path.join(pgBin, 'pg_ctl'), args: ['-D', cluster, '-m', 'fast', '-w', '-t', '30', 'stop'] }, env, output, control);
      manifest.clusterStopped = true;
    } catch { manifest.clusterStopped = false; manifest.status = 'failed-owned-cluster-stop'; }
  }
  save(); process.off('SIGINT', onInt); process.off('SIGTERM', onTerm);
}
assert.equal(manifest.status, 'passed');
console.log('Admin local HTTP proof passed; owned cluster stopped: ' + output);
