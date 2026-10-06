// Run only after the parent's heavy slot is assigned. No existing DATABASE_URL,
// shared cluster, provider credential, env file or existing output is reused.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function proofEnvironment(source, databaseUrl) {
  const url = new URL(databaseUrl);
  assert.equal(url.protocol, 'postgresql:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.ok(url.port && url.port !== '5432');
  assert.match(url.pathname, /^\/maya_widget_gate_proof_c9occ_[a-f0-9]+$/);
  assert.equal(url.username, 'c9_proof');
  assert.equal(url.password + url.search + url.hash, '');
  const env = { DATABASE_URL: databaseUrl, NODE_ENV: 'test', LANG: 'C', TZ: 'UTC' };
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'SYSTEMROOT']) if (source[key]) env[key] = source[key];
  return env;
}
export function proofCommands({ pgBin, cluster, log, port, database, receipt, output }) {
  assert.match(database, /^maya_widget_gate_proof_c9occ_[a-f0-9]+$/);
  assert.ok(Number.isInteger(port) && port > 1024 && port <= 65535 && port !== 5432);
  assert.ok(path.isAbsolute(cluster) && !/\s|'/.test(cluster), 'private cluster path must fit pg_ctl options');
  const executable = (name) => path.join(pgBin, name);
  const pgArgs = ['-D', cluster, '-w', '-t', '30'];
  // Explicit probe suffix keeps this mandatory two-process entry out of the
  // ordinary widgets-live aggregate. It still uses the exact existing harness.
  const jestArgs = ['node_modules/jest/bin/jest.js', '--config', 'test/jest-widgets-live.json', '--testRegex', 'c9-occupancy-restart\\.probe-spec\\.ts$', '--runInBand', '--runTestsByPath', 'test/widgets-live/c9-occupancy-restart.probe-spec.ts'];
  const stage = (name) => ({ name, command: process.execPath, args: jestArgs, env: { JEST_C9_OCCUPANCY_STAGE: name, JEST_C9_OCCUPANCY_RECEIPT: receipt, JEST_C9_OCCUPANCY_REPORT: path.join(output, name + '.json') } });
  return [
    { name: 'initdb', command: executable('initdb'), args: ['-D', cluster, '--auth=trust', '--username=c9_proof', '--encoding=UTF8', '--locale=C'] },
    { name: 'pg-start', command: executable('pg_ctl'), args: [...pgArgs, '-l', log, '-o', `-h 127.0.0.1 -p ${port} -k ''`, 'start'] },
    { name: 'createdb', command: executable('createdb'), args: ['--host=127.0.0.1', `--port=${port}`, '--username=c9_proof', database] },
    { name: 'migrations', command: process.execPath, args: ['node_modules/prisma/build/index.js', 'migrate', 'deploy'] },
    { name: 'carrier-bundle', command: process.execPath, args: ['../maya-carrier-react/test/build-harness.mjs'] },
    stage('prepare'),
    { name: 'pg-restart', command: executable('pg_ctl'), args: [...pgArgs, '-m', 'fast', 'restart'] },
    stage('resume'),
  ];
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}
async function runCommand(spec, env, output) {
  const fd = fs.openSync(path.join(output, spec.name + '.log'), 'wx', 0o600);
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(spec.command, spec.args, { cwd: backend, env: { ...env, ...spec.env }, stdio: ['ignore', fd, fd] });
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 180_000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('close', (code) => { clearTimeout(timer); code === 0 && !timedOut ? resolve() : reject(new Error(`${spec.name} ${timedOut ? 'timed out' : `exited ${code}`}; inspect its log`)); });
    });
  } finally { fs.closeSync(fd); }
}
export async function main(args) {
  const { values } = parseArgs({ args, options: { run: { type: 'boolean' }, output: { type: 'string' }, 'pg-bin': { type: 'string', default: '/opt/homebrew/opt/postgresql@16/bin' } }, strict: true });
  if (!values.run) {
    process.stdout.write('Preparation only. After parent assigns the heavy slot: node scripts/c9-occupancy-proof.mjs --run --output=/absolute/new/evidence-directory [--pg-bin=/path/to/postgresql/bin]\n');
    return;
  }
  assert.ok(values.output && path.isAbsolute(values.output), 'new absolute output directory required');
  for (const name of ['.env', '.env.local']) assert.equal(fs.existsSync(path.join(backend, name)), false, 'env file not permitted');
  assert.equal(fs.existsSync(values.output), false, 'output must be new; evidence is not overwritten');
  for (const name of ['initdb', 'pg_ctl', 'createdb']) fs.accessSync(path.join(values['pg-bin'], name), fs.constants.X_OK);
  fs.mkdirSync(values.output, { mode: 0o700 });
  const privateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-c9occ-'));
  fs.chmodSync(privateRoot, 0o700);
  const cluster = path.join(privateRoot, 'pg'), port = await freePort(), database = 'maya_widget_gate_proof_c9occ_' + randomBytes(6).toString('hex');
  const env = proofEnvironment(process.env, `postgresql://c9_proof@127.0.0.1:${port}/${database}`);
  const commands = proofCommands({ pgBin: values['pg-bin'], cluster, log: path.join(values.output, 'postgres.log'), port, database, receipt: path.join(privateRoot, 'private-restart.json'), output: values.output });
  const manifest = { contract: 'maya.c9-occupancy-owned-cluster/1', database, port, cluster, status: 'running', completed: [] };
  const save = () => fs.writeFileSync(path.join(values.output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  save();
  let startAttempted = false;
  try {
    for (const command of commands) {
      if (command.name === 'pg-start') startAttempted = true;
      process.stdout.write(command.name + '\n');
      await runCommand(command, env, values.output);
      manifest.completed.push(command.name); save();
    }
    manifest.status = 'passed';
  } catch (error) {
    manifest.status = 'failed'; throw error;
  } finally {
    if (startAttempted) {
      try { await runCommand({ name: 'pg-stop', command: path.join(values['pg-bin'], 'pg_ctl'), args: ['-D', cluster, '-m', 'fast', '-w', '-t', '30', 'stop'] }, env, values.output); }
      catch { manifest.status = 'failed-owned-cluster-stop'; process.stderr.write(`Owned cluster may need cleanup: ${cluster}\n`); }
    }
    save();
  }
  assert.equal(manifest.status, 'passed');
  process.stdout.write(`HTTP/PG/current text-carrier proof passed. Evidence: ${values.output}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main(process.argv.slice(2));
