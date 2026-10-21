// Owned full-application D3 proof. Never reuses a DB, credential, or output.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  proofCommands,
  proofEnvironment,
  runCommand,
} from './c9-occupancy-proof.mjs';
const backend = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const { values } = parseArgs({
  options: { run: { type: 'boolean' }, output: { type: 'string' } },
});
assert.equal(values.run, true);
assert(
  values.output &&
    path.isAbsolute(values.output) &&
    !fs.existsSync(values.output),
);
for (const f of ['.env', '.env.local'])
  assert(!fs.existsSync(path.join(backend, f)));
const out = values.output;
fs.mkdirSync(out, { mode: 0o700 });
const sources = {};
for (const name of [
  'maya-saas-backend/scripts/customer-facts-http-proof.mjs',
  'maya-saas-backend/test/widgets-live/customer-facts.probe-spec.ts',
  'maya-carrier-react/test/customer-facts-browser-probe.mjs',
]) {
  const content = fs.readFileSync(path.resolve(backend, '..', name));
  const dest = path.join(out, 'sources', name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
  sources[name] = createHash('sha256').update(content).digest('hex');
}
const privateRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'maya-customer-facts-'),
);
fs.chmodSync(privateRoot, 0o700);
const cluster = path.join(privateRoot, 'pg');
const server = net.createServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
await new Promise((r) => server.close(r));
const database =
  'maya_widget_gate_proof_c9occ_' + randomBytes(6).toString('hex');
const env = proofEnvironment(
  process.env,
  `postgresql://c9_proof@127.0.0.1:${port}/${database}`,
);
const pgBin = '/opt/homebrew/opt/postgresql@16/bin';
const setup = proofCommands({
  pgBin,
  cluster,
  port,
  database,
  output: out,
  log: path.join(out, 'postgres.log'),
  receipt: path.join(privateRoot, 'unused'),
}).slice(0, 4);
const policy =
  '(version 1) (allow default) (deny network-outbound) (allow network-outbound (remote ip "localhost:*"))';
const stage = (name) => ({
  name,
  command: '/usr/bin/sandbox-exec',
  args: [
    '-p',
    policy,
    process.execPath,
    'node_modules/jest/bin/jest.js',
    '--config',
    'test/jest-widgets-live.json',
    '--testRegex',
    'customer-facts\\.probe-spec\\.ts$',
    '--runInBand',
    '--runTestsByPath',
    'test/widgets-live/customer-facts.probe-spec.ts',
    '--json',
    '--outputFile=' + path.join(out, name + '-jest.json'),
  ],
  env: {
    JEST_D3_PHASE: name,
    JEST_D3_OUTER_NETWORK_FENCE: 'loopback',
    JEST_D3_OUT: out,
    JEST_D3_PRIVATE: path.join(privateRoot, 'restart.json'),
  },
});
const steps = [
  ...setup,
  {
    name: 'react-build',
    command: process.execPath,
    args: ['build.mjs', '--target=web'],
    cwd: path.resolve(backend, '../maya-carrier-react'),
  },
  stage('prepare'),
  {
    name: 'pg-restart',
    command: path.join(pgBin, 'pg_ctl'),
    args: ['-D', cluster, '-w', '-t', '30', '-m', 'fast', 'restart'],
  },
  stage('resume'),
];
const manifest = {
  contract: 'maya.customer-facts-owned-full-app/1',
  status: 'running',
  database,
  port,
  cluster,
  completed: [],
  migrationCount: fs
    .readdirSync(path.join(backend, 'prisma/migrations'))
    .filter((n) =>
      fs.existsSync(
        path.join(backend, 'prisma/migrations', n, 'migration.sql'),
      ),
    ).length,
  appProvidersOverridden: [],
  scriptedModelSelection: true,
  networkPolicy: policy,
  sources,
  externalEffects: 'NOT_YET_VERIFIED',
  admission: 'NOT_ISSUED',
};
const save = () =>
  fs.writeFileSync(
    path.join(out, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
const control = {
  cancelled: null,
  terminateActive: null,
  activeCleanup: false,
};
const cancel = (s) => {
  control.cancelled ??= s;
  if (!control.activeCleanup) control.terminateActive?.();
};
process.on('SIGINT', cancel);
process.on('SIGTERM', cancel);
let started = false;
save();
try {
  for (const step of steps) {
    if (step.name === 'pg-start') started = true;
    console.log(step.name);
    await runCommand(step, env, out, control);
    manifest.completed.push(step.name);
    save();
  }
  manifest.status = 'PASS';
  const phaseEvidence = ['prepare', 'resume'].map((name) =>
    JSON.parse(fs.readFileSync(path.join(out, name + '.json'), 'utf8')),
  );
  assert(
    phaseEvidence.every((x) => x.status === 'PASS' && x.externalCalls === 0),
  );
  manifest.externalEffects = 0;
} catch (e) {
  manifest.status = 'FAIL';
  manifest.failure = String(e.message);
  process.exitCode = 1;
} finally {
  if (started) {
    try {
      await runCommand(
        {
          name: 'pg-stop',
          command: path.join(pgBin, 'pg_ctl'),
          args: ['-D', cluster, '-m', 'fast', '-w', '-t', '30', 'stop'],
        },
        env,
        out,
        control,
      );
      manifest.ownedPostgresStopped = true;
    } catch {
      manifest.ownedPostgresStopped = false;
      manifest.status = 'FAIL';
      process.exitCode = 1;
    }
  }
  // Erase only the proof-owned credential checkpoint, not retained source/evidence.
  const checkpoint = path.join(privateRoot, 'restart.json');
  if (fs.existsSync(checkpoint)) fs.unlinkSync(checkpoint);
  manifest.privateCheckpointRemoved = !fs.existsSync(checkpoint);
  save();
}
console.log(JSON.stringify(manifest));
