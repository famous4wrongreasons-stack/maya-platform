// One bounded HTTP/PG regression, using the existing owned-cluster runner.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
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
assert.ok(
  values.output &&
    path.isAbsolute(values.output) &&
    !fs.existsSync(values.output),
);
for (const name of ['.env', '.env.local'])
  assert.equal(fs.existsSync(path.join(backend, name)), false);
const scopes = [
  'src',
  'prisma',
  'prisma.config.ts',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'test/widgets-live',
  'test/jest-widgets-live.json',
  'scripts/cancel-source-proof.mjs',
  'scripts/c9-occupancy-proof.mjs',
];
const git = (args) =>
  execFileSync('git', args, {
    cwd: backend,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
const clean = () =>
  git(['status', '--porcelain', '--untracked-files=all', '--', ...scopes]) ===
  '';
assert.ok(clean(), 'Commit exact proof source before running');
const snapshot = () =>
  Object.fromEntries(
    git(['ls-files', '-z', '--', ...scopes])
      .split('\0')
      .filter(Boolean)
      .sort()
      .map((file) => [
        file,
        createHash('sha256')
          .update(fs.readFileSync(path.resolve(backend, file)))
          .digest('hex'),
      ]),
  );
const hashes = snapshot(),
  candidateCommit = git(['rev-parse', 'HEAD']).trim();
fs.mkdirSync(values.output, { mode: 0o700 });
fs.writeFileSync(
  path.join(values.output, 'source-hashes.json'),
  JSON.stringify(hashes, null, 2) + '\n',
);
const privateRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'maya-cancel-source-'),
  ),
  cluster = path.join(privateRoot, 'pg');
const server = net.createServer();
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
const database =
  'maya_widget_gate_proof_c9occ_' + randomBytes(6).toString('hex');
const env = proofEnvironment(
  process.env,
  `postgresql://c9_proof@127.0.0.1:${port}/${database}`,
);
const pgBin = '/opt/homebrew/opt/postgresql@16/bin';
const steps = proofCommands({
  pgBin,
  cluster,
  port,
  database,
  output: values.output,
  log: path.join(values.output, 'postgres.log'),
  receipt: path.join(privateRoot, 'unused.json'),
  branchBinding: true,
}).slice(0, 4);
steps.push({
  name: 'regression',
  command: process.execPath,
  args: [
    'node_modules/jest/bin/jest.js',
    '--config',
    'test/jest-widgets-live.json',
    '--testRegex',
    'cancel-source.probe-spec.ts$',
    '--runInBand',
    '--runTestsByPath',
    'test/widgets-live/cancel-source.probe-spec.ts',
    '--json',
    '--outputFile=' + path.join(values.output, 'regression-jest.json'),
  ],
  env: { JEST_CANCEL_SOURCE_OUTPUT: values.output },
});
const manifest = {
  contract: 'maya.cancel-source-proof/1',
  baselineCommit: 'aa8feb8a726cc8a162d4527da0e2333c0977c28a',
  candidateCommit,
  cluster,
  port,
  database,
  status: 'running',
  completed: [],
  realProviderCalls: 0,
  realModelCalls: 0,
  qualification: 'SYNTHETIC_NATIVE_YCLIENTS_ACTUAL_HTTP_PG_ONLY',
};
const save = () =>
  fs.writeFileSync(
    path.join(values.output, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
const control = {
  cancelled: null,
  terminateActive: null,
  activeCleanup: false,
};
const cancel = (signal) => {
  control.cancelled ??= signal;
  if (!control.activeCleanup) control.terminateActive?.();
};
const onInt = () => cancel('SIGINT'),
  onTerm = () => cancel('SIGTERM');
process.on('SIGINT', onInt);
process.on('SIGTERM', onTerm);
let pgAttempted = false;
save();
try {
  for (const step of steps) {
    console.log(step.name);
    if (step.name === 'pg-start') pgAttempted = true;
    await runCommand(step, env, values.output, control);
    manifest.completed.push(step.name);
    save();
  }
  manifest.status = 'passed';
} catch (error) {
  manifest.status = 'failed';
  manifest.error = error.message;
} finally {
  if (pgAttempted) {
    try {
      await runCommand(
        {
          name: 'pg-stop',
          command: path.join(pgBin, 'pg_ctl'),
          args: ['-D', cluster, '-w', '-t', '30', '-m', 'fast', 'stop'],
        },
        env,
        values.output,
        control,
      );
      manifest.clusterStopped = true;
    } catch {
      manifest.clusterStopped = false;
      manifest.status = 'failed-stop';
    }
  }
  try {
    manifest.sourcesUnchanged =
      clean() &&
      git(['rev-parse', 'HEAD']).trim() === candidateCommit &&
      JSON.stringify(snapshot()) === JSON.stringify(hashes);
  } catch {
    manifest.sourcesUnchanged = false;
  }
  if (!manifest.sourcesUnchanged) manifest.status = 'failed-source-change';
  if (control.cancelled) {
    manifest.status = 'cancelled';
    manifest.cancelledBy = control.cancelled;
  }
  save();
  process.off('SIGINT', onInt);
  process.off('SIGTERM', onTerm);
}
assert.equal(
  manifest.status,
  'passed',
  'Inspect retained regression evidence: ' + values.output,
);
