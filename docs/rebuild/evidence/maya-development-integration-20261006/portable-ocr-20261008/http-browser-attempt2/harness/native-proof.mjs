// PREPARED NOT EXECUTED. Own fresh loopback PG; actual configured local OCR.
// Upload-only. No provider/model/receipt path. Parent controls execution context.
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
  const plan = ownedCommands({...options, browser:false, branchBinding:true});
  return [...plan.slice(0,4), {
    name:options.browser?'actual-ocr-browser':'actual-ocr-http', command:process.execPath, timeoutMs:300000,
    args:['node_modules/jest/bin/jest.js','--config','/tmp/maya-linux-ocr-20261008/http-carrier-harness/jest-proof.json',
      '--runInBand','--runTestsByPath','/tmp/maya-linux-ocr-20261008/http-carrier-harness/actual-ocr.probe-spec.ts',
      '--json','--outputFile='+path.join(options.output,options.browser?'browser-jest.json':'http-jest.json')],
    env:{JEST_ACTUAL_OCR_OUTPUT:options.output,JEST_ACTUAL_OCR_BROWSER:options.browser?'1':'0',JEST_ACTUAL_OCR_NATIVE_PROOF:'/tmp/maya-linux-ocr-20261008/actual-attempt3/actual-corpus.json'},
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
      'Prepared only. Root serial: --run --browser --expected-commit=<reviewed candidate> --output=/tmp/maya-linux-ocr-20261008/new-attempt. No builds or business actions.\n',
    );
    return;
  }
  const fixedPath='/tmp/maya-linux-ocr-20261008/http-carrier-harness/fixed-input-hashes.json';
  const fixed=JSON.parse(fs.readFileSync(fixedPath,'utf8'));
  for(const [file,sha] of Object.entries(fixed)) assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),sha,'Fixed native proof input changed: '+file);
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
    path.join(os.tmpdir(), 'maya-tesseract-http-'),
  );
  fs.chmodSync(privateRoot, 0o700);
  const cluster = path.join(privateRoot, 'pg'),
    port = await freePort(),
    database = 'maya_widget_gate_proof_c9occ_' + randomBytes(6).toString('hex');
  const env = proofEnvironment(
    process.env,
    `postgresql://c9_proof@127.0.0.1:${port}/${database}`,
  );
  env.NODE_OPTIONS += ' --require=/tmp/maya-linux-ocr-20261008/http-carrier-harness/loopback-only.cjs';
  const commands = proofCommands({
    pgBin: values['pg-bin'],
    cluster,
    log: path.join(values.output, 'postgres.log'),
    port,
    database,
    receipt: path.join(privateRoot, 'private-restart.json'),
    output: values.output,
    browser: values.browser,
  });
  const tracked = execFileSync('git',['ls-files','--cached','--others','--exclude-standard',
    'src','prisma','test/widgets-live/support','test/jest-widgets-live.json','test/tsconfig.widgets-live.json','tsconfig.json','scripts/c9-occupancy-proof.mjs','scripts/goods-photo-ocr-models.json','scripts/prepare-goods-photo-ocr-models.mjs','Dockerfile','package.json','package-lock.json'],
    {cwd:backend,encoding:'utf8'}).trim().split('\n').filter(Boolean);
  const scratchNames = ['native-proof.mjs','owned-stage.mjs','loopback-only.cjs','actual-ocr.probe-spec.ts','actual-ocr-browser.mjs','actual-ocr-browser-guard.mjs','actual-ocr-browser-guard.test.mjs','jest-proof.json','tsconfig.proof.json','fixed-input-hashes.json','bind-native-inputs.mjs','README.md'];
  tracked.push(...scratchNames.map(file=>'/tmp/maya-linux-ocr-20261008/http-carrier-harness/'+file));
  tracked.push(...Object.keys(fixed));
  if(values.browser) {
    const repo=path.resolve(backend,'..');
    const ui=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','maya-chat-shell/src','maya-chat-shell/build.mjs','maya-chat-shell/package.json','maya-chat-shell/tsconfig.json','maya-chat-shell/dev','maya-chat-shell/test/cdp-verify.mjs','maya-carrier-react/src','maya-carrier-react/build.mjs','maya-carrier-react/package.json','maya-carrier-react/tsconfig.json'],{cwd:repo,encoding:'utf8'}).trim().split('\n').filter(Boolean);
    tracked.push(...ui.map(file=>path.join(repo,file)));
  }
  if(values.browser) {
    const addDist=directory=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true})) { const file=path.join(directory,entry.name); if(entry.isDirectory())addDist(file); else if(entry.isFile())tracked.push(file); }};
    addDist(path.resolve(backend,'../maya-carrier-react/dist/web'));
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
  const harnessDir = path.join(values.output, 'harness');
  fs.mkdirSync(harnessDir);
  for (const file of scratchNames) fs.copyFileSync(path.join('/tmp/maya-linux-ocr-20261008/http-carrier-harness',file),path.join(harnessDir,file));
  const manifest = {
    contract: 'maya.actual-ocr-owned-cluster/1',
    mode: values.browser?'actual-current-react-http-postgres-local-native-ocr-preview':'actual-http-postgres-local-native-ocr-preview',
    candidateCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: backend,
      encoding: 'utf8',
    }).trim(),
    sourceBinding: 'LAUNCH_TIME_WORKTREE_BYTES',
    ownedSupervisorSha256: createHash('sha256').update(fs.readFileSync(new URL('./owned-stage.mjs',import.meta.url))).digest('hex'),
    launcherSha256: createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
    fenceSha256: createHash('sha256').update(fs.readFileSync('/tmp/maya-linux-ocr-20261008/http-carrier-harness/loopback-only.cjs')).digest('hex'),
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
    qualification:'ACTUAL_NATIVE_TESSERACT_SYNTHETIC_PIXELS_ONLY_NOT_LINUX_EXECUTION_OR_DEPLOYMENT_ACCEPTANCE',
    nativeEngine:'TESSERACT_CLI_RUS_ENG_PINNED_FAST_MODELS',
    platform:process.platform, linuxExecutionAcceptance:false,
    scratchHarnessGitBinding: false,
    businessActionsAdmitted:false,
    fixedNativeInputs:fixed,
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
    manifest.harnessUnchanged = manifest.launcherSha256 === createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex') && manifest.ownedSupervisorSha256 === createHash('sha256').update(fs.readFileSync(new URL('./owned-stage.mjs',import.meta.url))).digest('hex') && manifest.fenceSha256 === createHash('sha256').update(fs.readFileSync('/tmp/maya-linux-ocr-20261008/http-carrier-harness/loopback-only.cjs')).digest('hex');
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
    `Actual local OCR ${values.browser ? 'current React / HTTP' : 'HTTP'} upload-only proof passed: ${values.output}\n`,
  );
}
if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) await main(process.argv.slice(2));
