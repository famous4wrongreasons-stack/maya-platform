import { runOwnedStage } from './owned-stage.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration';
const backend = path.join(root, 'maya-saas-backend');
const base = '0bf1488ff25c24f7c6386d2ecdcce73e85705b7a';
const output = process.argv[2];
assert.match(output ?? '', /^\/tmp\/maya-task-list-20261008\/local-attempt[1-9][0-9]*$/);
assert.equal(fs.existsSync(output), false);
const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
const initialDirty = git('status', '--porcelain');
for (const name of ['.env', '.env.local']) assert.equal(fs.existsSync(path.join(backend, name)), false);
for (const dir of ['node_modules', 'node_modules/.prisma', 'node_modules/@prisma/client', 'node_modules/prisma']) assert.ok(fs.realpathSync(path.join(backend,dir)).startsWith(backend + '/'));
const changedTs = [...new Set([...git('diff', '--name-only', '--', 'maya-saas-backend').split('\n'),...git('ls-files','--others','--exclude-standard','--','maya-saas-backend').split('\n')])].filter(p => p.endsWith('.ts'));
assert.ok(changedTs.length >= 7 && changedTs.length <= 12);

const require = createRequire(path.join(backend, 'package.json'));
require('ts-node').register({transpileOnly: true, project: path.join(backend, 'tsconfig.json')});
const { WIDGETS_LIVE_TEST_LITERALS } = require(path.join(backend, 'test/widgets-live/support/environment.ts'));
const { runCommand } = await import(path.join(backend, 'scripts/c9-occupancy-proof.mjs'));
const fence = '/tmp/maya-task-list-20261008/loopback-only.cjs';
const env = {PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, LC_ALL: 'C', LANG: 'C', TZ: 'UTC',
  ...WIDGETS_LIVE_TEST_LITERALS, NODE_OPTIONS: `--max-old-space-size=3072 --require=${fence}`,
  DATABASE_URL: 'postgresql://maya_gate@127.0.0.1:55991/maya_widget_gate_proof_exact_time_unstarted',
  PRISMA_HIDE_UPDATE_MESSAGE: '1', CHECKPOINT_DISABLE: '1'};
const tests = ['src/ai-tools/ai-core.service.spec.ts','src/ai-tools/own-tasks-presentation.spec.ts','src/ai-tools/ai-tool-handler.service.spec.ts','src/ai-tools/ai-tool-extended-capabilities.spec.ts','src/package5-wave1/package5-wave1-canonical-cutover.service.spec.ts','src/package5-wave1/operational-tasks.read.spec.ts'];
const spec = (name, args, timeoutMs = 180000) => ({name, command: process.execPath, args, cwd: backend, timeoutMs});
const commands = [
  spec('targeted-unit', ['node_modules/jest/bin/jest.js','--maxWorkers=1','--workerIdleMemoryLimit=768MB','--runTestsByPath',...tests,'--json',`--outputFile=${output}/targeted-unit.json`]),
  spec('backend-types',['node_modules/typescript/bin/tsc','--noEmit','--project','tsconfig.build.json','--incremental','false']),
  spec('widgets-live-types',['node_modules/typescript/bin/tsc','--noEmit','--project','test/tsconfig.widgets-live.json','--incremental','false']),
  spec('changed-typescript-lint',['node_modules/eslint/bin/eslint.js',...changedTs.map(p => path.relative(backend,path.join(root,p)))]),
  spec('contract-types',['node_modules/typescript/bin/tsc','--noEmit','--project','tsconfig.widget-contract.json','--incremental','false']),
  spec('contract-check',['scripts/widget-contract-check.mjs']),
  spec('k3',['scripts/k3-gateway-check.mjs']),
];
// Unit and backend types passed in attempt1; only the new fixture request helper type changed.
commands.splice(0, 2);
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.mkdirSync(output, {mode: 0o700});
const report = {contract:'maya.own-tasks-local-gates/1',source:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),base,started:new Date().toISOString(),status:'RUNNING',commands,completed:[],failures:[],node:process.version,heapMb:3072,jestWorkers:1,workerIdleMemoryLimit:'768MB',sourceHashes:Object.fromEntries(changedTs.map(p => [p,hash(path.join(root,p))])),launcherSha256:hash(new URL(import.meta.url)),fenceSha256:hash(fence),supervisorSha256:hash(new URL('./owned-stage.mjs',import.meta.url)),runCommandSha256:hash(path.join(backend,'scripts/c9-occupancy-proof.mjs')),networkQualification:'Loopback-only Node TCP preload; not a measured global call count. Unit/static gates do not start a database.'};
const save = () => fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
const control = {cancelled:null,terminateActive:null,activeCleanup:false};
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{control.cancelled??=signal;control.terminateActive?.();});
save();
try {
  for (const command of commands) {
    process.stdout.write(`START ${command.name}\n`); const start=Date.now();
    await runOwnedStage(command,env,output,control,report);
    report.completed.push({name:command.name,elapsedMs:Date.now()-start});save();
    process.stdout.write(`PASS ${command.name}\n`);
  }
  report.status='PASS';
} catch(error) { report.status='FAIL';report.failures.push({error:error.message});process.exitCode=1; }
finally {
  report.sourceAtEnd=git('rev-parse','HEAD');report.treeAtEnd=git('rev-parse','HEAD^{tree}');report.dirtyAtEnd=git('status','--porcelain');
  report.sourceUnchanged=report.source===report.sourceAtEnd && report.tree===report.treeAtEnd && report.dirtyAtEnd === initialDirty && Object.entries(report.sourceHashes).every(([p,h])=>hash(path.join(root,p))===h);
  if(!report.sourceUnchanged){report.status='FAIL_SOURCE_CHANGED';process.exitCode=1;}
  report.launcherSha256AtEnd=hash(new URL(import.meta.url));report.fenceSha256AtEnd=hash(fence);report.supervisorSha256AtEnd=hash(new URL('./owned-stage.mjs',import.meta.url));report.runCommandSha256AtEnd=hash(path.join(backend,'scripts/c9-occupancy-proof.mjs'));
  report.harnessUnchanged=report.launcherSha256===report.launcherSha256AtEnd&&report.fenceSha256===report.fenceSha256AtEnd&&report.supervisorSha256===report.supervisorSha256AtEnd&&report.runCommandSha256===report.runCommandSha256AtEnd;
  if(!report.harnessUnchanged){report.status='FAIL_HARNESS_CHANGED';process.exitCode=1;}
  report.cancelled=control.cancelled;if(control.cancelled){report.status='CANCELLED';process.exitCode=1;}
  report.finished=new Date().toISOString();save();
  process.stdout.write(`RESULT ${report.status}\n`);
}
