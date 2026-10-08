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
  return [...plan.slice(0,4), ...(options.browser ? [
    {name:'shell-runtime-build',command:process.execPath,args:['build.mjs'],cwd:path.resolve(backend,'../maya-chat-shell')},
    {name:'react-web-build',command:process.execPath,args:['build.mjs','--target=web'],cwd:path.resolve(backend,'../maya-carrier-react')},
  ] : []), {
    name:options.browser?'photo-browser':'photo-http', command:process.execPath, timeoutMs:options.browser?660000:240000,
    args:['node_modules/jest/bin/jest.js','--config','/tmp/maya-goods-photo-20261008/jest-proof.json',
      '--runInBand','--runTestsByPath','/tmp/maya-goods-photo-20261008/goods-photo.probe-spec.ts',
      '--json','--outputFile='+path.join(options.output,options.browser?'browser-jest.json':'http-jest.json')],
    env:{JEST_GOODS_PHOTO_OUTPUT:options.output,JEST_GOODS_PHOTO_BROWSER:options.browser?'1':'0',JEST_GOODS_PHOTO_SYNTHETIC_APPROVE:options.syntheticApprove?'1':'0'},
  }];
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
      'synthetic-approve': { type: 'boolean' },
      'expected-commit': { type: 'string' },
      output: { type: 'string' },
      'pg-bin': {
        type: 'string',
        default: '/opt/homebrew/opt/postgresql@16/bin',
      },
    },
  });
  if (!values.run) {
    process.stdout.write(
      'Preparation only. Root-controlled HTTP proof: --run --expected-commit=<reviewed candidate> --output=/absolute/new/path [--synthetic-approve] [--browser]. Browser mode requires explicit synthetic approval authorization.\n',
    );
    return;
  }
  if(values.browser) assert.equal(values['synthetic-approve'],true,'Browser synthetic receipt requires explicit opt-in');
  assert.match(values['expected-commit'] ?? '', /^[a-f0-9]{40}$/, 'Reviewed candidate commit required');
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:backend,encoding:'utf8'}).trim(),values['expected-commit'],'Candidate changed before launch');
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
    path.join(os.tmpdir(), 'maya-goods-photo-'),
  );
  fs.chmodSync(privateRoot, 0o700);
  const cluster = path.join(privateRoot, 'pg'),
    port = await freePort(),
    database = 'maya_widget_gate_proof_c9occ_' + randomBytes(6).toString('hex');
  const env = proofEnvironment(
    process.env,
    `postgresql://c9_proof@127.0.0.1:${port}/${database}`,
  );
  env.NODE_OPTIONS += ' --require=/tmp/maya-goods-photo-20261008/loopback-only.cjs';
  const commands = proofCommands({
    pgBin: values['pg-bin'],
    cluster,
    log: path.join(values.output, 'postgres.log'),
    port,
    database,
    receipt: path.join(privateRoot, 'private-restart.json'),
    output: values.output,
    browser: values.browser,
    syntheticApprove: values['synthetic-approve'],
  });
  const tracked = execFileSync('git',['ls-files','--cached','--others','--exclude-standard',
    'src','prisma','test/widgets-live/support','test/jest-widgets-live.json','test/tsconfig.widgets-live.json','tsconfig.json','scripts/c9-occupancy-proof.mjs'],
    {cwd:backend,encoding:'utf8'}).trim().split('\n').filter(Boolean);
  const scratchNames = ['native-proof.mjs','owned-stage.mjs','loopback-only.cjs','goods-photo.probe-spec.ts','goods-photo-browser-probe.mjs','goods-photo-browser-guard.mjs','goods-photo-browser-guard.test.mjs','jest-proof.json','tsconfig.proof.json','proof-plan.json','main.png','cancel.png','unknown.png'];
  tracked.push(...scratchNames.map(file=>'/tmp/maya-goods-photo-20261008/'+file));
  if(values.browser) {
    const repo=path.resolve(backend,'..');
    const ui=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','maya-chat-shell/src','maya-chat-shell/build.mjs','maya-chat-shell/package.json','maya-chat-shell/tsconfig.json','maya-chat-shell/dev','maya-chat-shell/test/cdp-verify.mjs','maya-carrier-react/src','maya-carrier-react/build.mjs','maya-carrier-react/package.json','maya-carrier-react/tsconfig.json'],{cwd:repo,encoding:'utf8'}).trim().split('\n').filter(Boolean);
    tracked.push(...ui.map(file=>path.join(repo,file)));
  }
  const readSource = file => fs.readFileSync(path.isAbsolute(file)?file:path.join(backend,file));
  const hashes = Object.fromEntries(
    tracked.sort().map((file) => [
      file,
      createHash('sha256')
        .update(readSource(file))
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
    contract: 'maya.goods-photo-owned-cluster/1',
    mode: values.browser?'actual-current-react-http-postgres-native-search-item-synthetic-extraction-receipt-port':'actual-http-postgres-native-search-item-synthetic-extraction-receipt-port',
    candidateCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: backend,
      encoding: 'utf8',
    }).trim(),
    sourceBinding: 'LAUNCH_TIME_WORKTREE_BYTES',
    ownedSupervisorSha256: createHash('sha256').update(fs.readFileSync(new URL('./owned-stage.mjs',import.meta.url))).digest('hex'),
    launcherSha256: createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
    fenceSha256: createHash('sha256').update(fs.readFileSync('/tmp/maya-goods-photo-20261008/loopback-only.cjs')).digest('hex'),
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
    qualification: values.browser?'CURRENT_REACT_WITH_SYNTHETIC_EXTRACTION_AND_RECEIPT_PORT_NOT_OCR_PROVIDER_ACCEPTANCE':'FINITE_HTTP_ONLY_NOT_OCR_OR_CURRENT_REACT_ACCEPTANCE',
    scratchHarnessGitBinding: false,
    syntheticApproveEnabled: values['synthetic-approve'] === true,
    currentReactAcceptance: false,
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
          .update(readSource(file))
          .digest('hex') === digest,
    );
    assert.equal(
      manifest.sourceUnchanged,
      true,
      'Source changed during proof; run is not candidate acceptance',
    );
    manifest.harnessUnchanged = manifest.launcherSha256 === createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex') && manifest.ownedSupervisorSha256 === createHash('sha256').update(fs.readFileSync(new URL('./owned-stage.mjs',import.meta.url))).digest('hex') && manifest.fenceSha256 === createHash('sha256').update(fs.readFileSync('/tmp/maya-goods-photo-20261008/loopback-only.cjs')).digest('hex');
    assert.equal(manifest.harnessUnchanged,true,'Harness changed during proof');
    manifest.currentReactAcceptance = values.browser === true;
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
    `Goods photo ${values.browser ? "current React / HTTP" : "HTTP"} preparation${values['synthetic-approve'] ? ' plus explicitly approved synthetic AE receipt' : ''} passed: ${values.output}\n`,
  );
}
if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) await main(process.argv.slice(2));
