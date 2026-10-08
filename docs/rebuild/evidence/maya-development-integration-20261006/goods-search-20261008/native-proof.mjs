// Own fresh loopback PG only. Native YCLIENTS adapter uses finite synthetic fetch; no real provider acceptance.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  proofEnvironment,
  proofCommands as ownedCommands,
  runCommand,
} from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/scripts/c9-occupancy-proof.mjs';
import { runOwnedStage } from './owned-stage.mjs';
export { proofEnvironment };
const backend = '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend';
export function proofCommands(options) {
  const plan = ownedCommands({...options, browser: false, branchBinding: true});
  const prepare = plan.find(step => step.name === 'prepare');
  return [
    ...plan.slice(0,4),
    {name:'shell-runtime-build',command:process.execPath,args:['build.mjs'],cwd:path.resolve(backend,'../maya-chat-shell')},
    {name:'react-web-build',command:process.execPath,args:['build.mjs','--target=web'],cwd:path.resolve(backend,'../maya-carrier-react')},
    {...prepare,name:'browser',timeoutMs:720000,
      args:prepare.args.map(arg=>arg.replaceAll('crm-branch-binding-restart','goods-search').replace('prepare-jest.json','browser-jest.json')).concat('--testTimeout=660000'),
      env:{JEST_GOODS_SEARCH_OUTPUT:options.output}},
  ];
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}
export async function main(args) {
  const { values } = parseArgs({
    args,
    strict: true,
    options: {
      run: { type: 'boolean' },
      browser: { type: 'boolean' },
      ordinary: { type: 'boolean' },
      output: { type: 'string' },
      'pg-bin': {
        type: 'string',
        default: '/opt/homebrew/opt/postgresql@16/bin',
      },
    },
  });
  if (!values.run) {
    process.stdout.write(
      'Preparation only. Local goods-search proof: --run --browser --output=/absolute/new/path\n',
    );
    return;
  }
  assert.ok(
    values.output && path.isAbsolute(values.output),
    'new absolute output directory required',
  );
  assert.equal(
    fs.existsSync(values.output),
    false,
    'evidence is never overwritten',
  );
  for (const file of ['.env', '.env.local'])
    assert.equal(
      fs.existsSync(path.join(backend, file)),
      false,
      'env files forbidden',
    );
  for (const name of ['initdb', 'pg_ctl', 'createdb'])
    fs.accessSync(path.join(values['pg-bin'], name), fs.constants.X_OK);
  fs.mkdirSync(values.output, { mode: 0o700 });
  const privateRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'maya-goods-search-'),
  );
  fs.chmodSync(privateRoot, 0o700);
  const cluster = path.join(privateRoot, 'pg'),
    port = await freePort(),
    database = 'maya_widget_gate_proof_c9occ_' + randomBytes(6).toString('hex');
  const env = proofEnvironment(
    process.env,
    `postgresql://c9_proof@127.0.0.1:${port}/${database}`,
  );
  env.NODE_OPTIONS += ' --require=/tmp/maya-goods-search-20261008/loopback-only.cjs';
  const commands = proofCommands({
    pgBin: values['pg-bin'],
    cluster,
    log: path.join(values.output, 'postgres.log'),
    port,
    database,
    receipt: path.join(privateRoot, 'private-restart.json'),
    output: values.output,
    browser: values.browser,
    ordinary: values.ordinary,
  });
  const tracked = execFileSync(
    'git',
    [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      'src',
      'prisma',
      'test/widgets-live/support',
      'test/jest-widgets-live.json',
      'test/widgets-live/goods-search.probe-spec.ts',
      'scripts/c9-occupancy-proof.mjs',
      ...(values.browser
        ? [
            '../maya-carrier-react/src',
            '../maya-chat-shell/src',
            '../maya-carrier-react/build.mjs',
            '../maya-chat-shell/build.mjs',
            '../maya-chat-shell/dev/serve.mjs',
            '../maya-carrier-react/test/goods-search-browser-guard.test.mjs',
            '../maya-carrier-react/test/goods-search-browser-probe.mjs',
            '../maya-carrier-react/test/goods-search-browser-guard.mjs',
            ...(values.ordinary
              ? [
                  '../maya-carrier-react/test/ordinary-booking-selector-browser-probe.mjs',
                  '../maya-carrier-react/test/ordinary-booking-selector-browser-guard.mjs',
                ]
              : []),
            '../maya-carrier-react/test/personal-owner-proof-server.mjs',
            '../maya-carrier-react/test/personal-owner-browser-guard.mjs',
            '../maya-chat-shell/test/cdp-verify.mjs',
          ]
        : []),
    ],
    { cwd: backend, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  for (const file of [
    'test/widgets-live/goods-search.probe-spec.ts',
  ])
    if (!tracked.includes(file)) tracked.push(file);
  const hashes = Object.fromEntries(
    tracked.sort().map((file) => [
      file,
      createHash('sha256')
        .update(fs.readFileSync(path.join(backend, file)))
        .digest('hex'),
    ]),
  );
  const sourceSha256 = createHash('sha256')
    .update(JSON.stringify(hashes))
    .digest('hex');
  fs.writeFileSync(
    path.join(values.output, 'source-hashes.json'),
    JSON.stringify(hashes, null, 2) + '\n',
    { mode: 0o600 },
  );
  const manifest = {
    contract: 'maya.goods-search-owned-cluster/1',
    mode: 'current-react-http-postgres-scripted-model',
    candidateCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: backend,
      encoding: 'utf8',
    }).trim(),
    sourceBinding: 'LAUNCH_TIME_WORKTREE_BYTES',
    ownedSupervisorSha256: createHash('sha256').update(fs.readFileSync(new URL('./owned-stage.mjs',import.meta.url))).digest('hex'),
    launcherSha256: createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
    fenceSha256: createHash('sha256').update(fs.readFileSync('/tmp/maya-goods-search-20261008/loopback-only.cjs')).digest('hex'),
    sourceSha256,
    database,
    port,
    cluster,
    status: 'running',
    completed: [],
    resources: {
      nodeHeapMb: 3072,
      pgSharedBuffersMb: 64,
      pgWorkMemMb: 4,
      pgMaxConnections: 30,
      jestWorkers: 1,
    },
    qualification: 'FINITE_LOCAL_HTTP_REACT_SCRIPTED_SELECTION_ONLY',
    realProviderAcceptance: false,
    realModelAcceptance: false,
  };
  const save = () =>
    fs.writeFileSync(
      path.join(values.output, 'manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n',
      { mode: 0o600 },
    );
  const control = {
    cancelled: null,
    terminateActive: null,
    activeCleanup: false,
  };
  const cancel = (signal) => {
    control.cancelled ??= signal;
    manifest.cancelledBy = signal;
    save();
    if (!control.activeCleanup) control.terminateActive?.();
  };
  const onInt = () => cancel('SIGINT'),
    onTerm = () => cancel('SIGTERM');
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);
  save();
  let startAttempted = false;
  try {
    for (const command of commands) {
      if (command.name === 'pg-start') startAttempted = true;
      process.stdout.write(command.name + '\n');
      if(command.command === process.execPath) await runOwnedStage({...command,cwd:command.cwd??backend,timeoutMs:command.timeoutMs??180000},env,values.output,control,manifest);
      else await runCommand(command, env, values.output, control);
      manifest.completed.push(command.name);
      save();
    }
    manifest.commitAtEnd = execFileSync('git',['rev-parse','HEAD'],{cwd:backend,encoding:'utf8'}).trim();
    assert.equal(manifest.candidateCommit,manifest.commitAtEnd,'Candidate changed during proof');
    manifest.sourceUnchanged = Object.entries(hashes).every(
      ([file, digest]) =>
        createHash('sha256')
          .update(fs.readFileSync(path.join(backend, file)))
          .digest('hex') === digest,
    );
    assert.equal(
      manifest.sourceUnchanged,
      true,
      'Source changed during proof; run is not candidate acceptance',
    );
    manifest.harnessUnchanged = manifest.launcherSha256 === createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex') && manifest.ownedSupervisorSha256 === createHash('sha256').update(fs.readFileSync(new URL('./owned-stage.mjs',import.meta.url))).digest('hex') && manifest.fenceSha256 === createHash('sha256').update(fs.readFileSync('/tmp/maya-goods-search-20261008/loopback-only.cjs')).digest('hex');
    assert.equal(manifest.harnessUnchanged,true,'Harness changed during proof');
    manifest.status = 'passed';
  } catch (error) {
    manifest.status = 'failed';
    throw error;
  } finally {
    if (startAttempted) {
      try {
        await runCommand(
          {
            name: 'pg-stop',
            command: path.join(values['pg-bin'], 'pg_ctl'),
            args: ['-D', cluster, '-m', 'fast', '-w', '-t', '30', 'stop'],
          },
          env,
          values.output,
          control,
        );
        manifest.clusterStopped = true;
      } catch {
        manifest.status = 'failed-owned-cluster-stop';
        manifest.clusterStopped = false;
        process.stderr.write(`Owned cluster may need cleanup: ${cluster}\n`);
      }
    }
    save();
    process.off('SIGINT', onInt);
    process.off('SIGTERM', onTerm);
  }
  assert.equal(manifest.status, 'passed');
  process.stdout.write(
    `Synthetic client dossier source READ ${values.browser ? 'current React reload/re-login' : 'HTTP/PG restart'} passed: ${values.output}\n`,
  );
}
await main(process.argv.slice(2));
