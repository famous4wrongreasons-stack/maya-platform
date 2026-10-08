import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration';
const backend = path.join(root, 'maya-saas-backend');
const output = '/tmp/maya-unified-regression-20261008';
const require = createRequire(path.join(backend, 'package.json'));
require('ts-node').register({transpileOnly:true,project:path.join(backend,'tsconfig.json')});
const { WIDGETS_LIVE_TEST_LITERALS } = require(path.join(backend, 'test/widgets-live/support/environment.ts'));
const { runCommand } = await import(path.join(backend, 'scripts/c9-occupancy-proof.mjs'));
assert.equal(execFileSync('git', ['status', '--porcelain'], {cwd:root,encoding:'utf8'}), '');
for (const file of ['.env', '.env.local']) assert.equal(fs.existsSync(path.join(backend, file)), false);
for (const dir of ['node_modules', 'node_modules/.prisma', 'node_modules/@prisma/client', 'node_modules/prisma']) assert.ok(fs.realpathSync(path.join(backend,dir)).startsWith(backend + '/'));
const env = {PATH:process.env.PATH, HOME:process.env.HOME, TMPDIR:process.env.TMPDIR,
 ...WIDGETS_LIVE_TEST_LITERALS,
 NODE_OPTIONS:`--max-old-space-size=6144 --require=${output}/loopback-only.cjs`,
 DATABASE_URL:'postgresql://maya_gate@127.0.0.1:57483/maya_widget_gate_proof_regression',
 PRISMA_HIDE_UPDATE_MESSAGE:'1', CHECKPOINT_DISABLE:'1'};
const node = (name,args,cwd=backend,timeoutMs=180000) => ({name,command:process.execPath,args,cwd,timeoutMs});
const npm = (name,script,cwd=backend,extra=[])=>({name,command:'npm',args:['run',script,...extra],cwd,timeoutMs:720000});
const groups = {
 g1:[node('prisma-generate',['node_modules/prisma/build/index.js','generate']),node('prisma-validate',['node_modules/prisma/build/index.js','validate']),
 ...['build-tables','emit-runtime-floor','emit-confirmation-guard','emit-ledgers','emit-f88'].map(x=>node(x,['scripts/widget-contract/'+x+'.mjs','--check'])),
 node('contract-types',['node_modules/typescript/bin/tsc','--noEmit','--project','tsconfig.widget-contract.json','--incremental','false']),
 node('contract-check',['scripts/widget-contract-check.mjs']),npm('backend-types','typecheck'),npm('scripts-types','typecheck:scripts'),npm('widgets-live-types','typecheck:widgets-live'),npm('backend-lint','lint'),node('k3',['scripts/k3-gateway-check.mjs']),npm('backend-build','build')],
 g2:[...['typecheck','self-test','test'].map(x=>npm('shell-'+x,x,path.join(root,'maya-chat-shell'))),node('shell-build',['build.mjs'],path.join(root,'maya-chat-shell')),
 npm('react-types','typecheck',path.join(root,'maya-carrier-react')),npm('react-tests','test',path.join(root,'maya-carrier-react')),
 node('react-release-build',['tools/release.mjs','build'],path.join(root,'maya-carrier-react'),300000),node('react-release-verify',['tools/release.mjs','verify'],path.join(root,'maya-carrier-react')),
 npm('react-release-tests','test:release',path.join(root,'maya-carrier-react'))],
 census:[node('backend-full',['node_modules/jest/bin/jest.js','--maxWorkers=1','--workerIdleMemoryLimit=768MB','--logHeapUsage','--json','--outputFile='+output+'/backend-full.json'],backend,720000)],
 e2e:[npm('backend-e2e','test:e2e',backend,['--','--runInBand','--json','--outputFile='+output+'/backend-e2e.json'])]
};
groups['g2-resume'] = groups.g2.slice(1).map(spec=>({...spec,name:spec.name==='shell-self-test'?'shell-self-test-attempt2':spec.name}));
groups['fixes-attempt2'] = undefined;
groups['g1-resume'] = groups.g1.slice(8).map(spec => ({...spec, name: spec.name === 'contract-check' ? 'contract-check-attempt2' : spec.name}));
groups.census[0].env = {NODE_OPTIONS:`--max-old-space-size=3072 --require=${output}/loopback-only.cjs`};
const initialCensus=JSON.parse(fs.readFileSync(path.join(output,'backend-full.json'),'utf8'));
const failedFiles=initialCensus.testResults.filter(r=>r.status!=='passed').map(r=>path.relative(backend,r.name));
const relatedFiles=['src/ai-tools/ai-core-model.service.spec.ts','src/widgets/consent/history-erasure.owner.spec.ts','src/widgets/consent/erasure.job.spec.ts','src/widgets/stores/timeline.store.spec.ts','src/widgets/booking/booking-selection-preferences.spec.ts','src/widgets/composition/typed-step0.spec.ts','src/widgets/widget-import-graph.architecture.spec.ts','src/widgets/consent/consent.spec.ts','src/widgets/emission/emitter.spec.ts','src/widgets/gates/gate-antecedents.inv30.spec.ts','src/crm/availability-day.spec.ts','src/widgets/owner-ports/booking-selector.adapter.spec.ts','src/widgets/validation/f88-walk.spec.ts','src/widgets/presentation-audit.spec-helper.spec.ts'];
groups.fixes=[node('regression-fixes',['node_modules/jest/bin/jest.js','--maxWorkers=1','--workerIdleMemoryLimit=768MB','--runTestsByPath',...new Set([...failedFiles,...relatedFiles]),'--json','--outputFile='+output+'/regression-fixes.json'],backend,720000)];
groups['fixes-attempt2']=groups.fixes.map(spec=>({...spec,name:'regression-fixes-attempt2',args:spec.args.map(arg=>arg==='--outputFile='+output+'/regression-fixes.json'?'--outputFile='+output+'/regression-fixes-attempt2.json':arg)}));
groups['g1-after-fixes']=groups.g1.slice(7).map(spec=>({...spec,name:spec.name+'-after-fixes'}));
groups['census-after-fixes']=groups.census.map(spec=>({...spec,name:'backend-full-after-fixes',args:spec.args.map(arg=>arg==='--outputFile='+output+'/backend-full.json'?'--outputFile='+output+'/backend-full-after-fixes.json':arg)}));
groups['g1-final-tail']=groups.g1.slice(12).map(spec=>({...spec,name:spec.name+'-final'}));
groups['census-loopback'] = groups['census-after-fixes'].map(spec=>({...spec,name:'backend-full-loopback',args:spec.args.map(arg=>arg==='--outputFile='+output+'/backend-full-after-fixes.json'?'--outputFile='+output+'/backend-full-loopback.json':arg)}));
groups['post-pg-static'] = [node('approval-tx-regressions',['node_modules/jest/bin/jest.js','--maxWorkers=1','--workerIdleMemoryLimit=768MB','--runTestsByPath','src/widgets/emission/emitter.spec.ts','src/widgets/pricing/service-price-approval-trigger.service.spec.ts','src/widgets/inventory/goods-receipt-widget.contract.spec.ts','src/widgets/consent/history-erasure.owner.spec.ts','src/widgets/composition/typed-step0.spec.ts','--json','--outputFile='+output+'/approval-tx-regressions.json'],backend,180000), ...groups.g1.slice(7).map(spec=>({...spec,name:spec.name+'-post-pg'}))];
groups['post-fixture-static'] = groups.g1.slice(9).map(spec=>({...spec,name:spec.name+'-post-fixtures'}));
groups['booking-followup-unit'] = [node('booking-followup-unit',['node_modules/jest/bin/jest.js','--maxWorkers=1','--workerIdleMemoryLimit=768MB','--runTestsByPath','src/ai-tools/ai-core.service.spec.ts','--json','--outputFile='+output+'/booking-followup-unit.json'],backend,180000)];
groups['candidate-final-static'] = groups.g1.slice(7).map(spec=>({...spec,name:spec.name+'-candidate-final'}));
groups['candidate-final-census'] = groups.census.map(spec=>({...spec,name:'backend-final-census',args:spec.args.map(arg=>arg==='--outputFile='+output+'/backend-full.json'?'--outputFile='+output+'/backend-final-census.json':arg)}));
groups['service-correction-unit'] = groups['booking-followup-unit'].map(spec=>({...spec,name:'service-correction-unit',args:spec.args.map(arg=>arg==='--outputFile='+output+'/booking-followup-unit.json'?'--outputFile='+output+'/service-correction-unit.json':arg)}));
groups['candidate-final-static-2'] = groups.g1.slice(7).map(spec=>({...spec,name:spec.name+'-candidate-final-2'}));
const stage = process.argv[2]; assert.ok(Object.hasOwn(groups,stage));
const report = {stage,source:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),tree:execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:root,encoding:'utf8'}).trim(),node:process.version,started:new Date().toISOString(),status:'RUNNING',launcherSha256:createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex'),nodeFenceSha256:createHash('sha256').update(fs.readFileSync(path.join(output,'loopback-only.cjs'))).digest('hex'),heapMb:stage.includes('census')?3072:6144,workerCount:(stage.includes('census')||stage==='e2e')?1:'existing-command-default',externalNodeNetwork:'loopback-only preload',lockfiles:{},commands:[],completed:[]};
for(const project of ['maya-saas-backend','maya-carrier-react']){const p=path.join(root,project,'package-lock.json');report.lockfiles[project]=createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
const file=path.join(output,stage+'-report.json');assert.equal(fs.existsSync(file),false);
const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{mode:0o600});
const control={cancelled:null,terminateActive:null,activeCleanup:false};
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{control.cancelled=signal;control.terminateActive?.();});
save();
try{for(const spec of groups[stage]){report.commands.push(spec);save();process.stdout.write('START '+spec.name+'\n');const started=Date.now();await runCommand(spec,env,output,control);report.completed.push({name:spec.name,durationMs:Date.now()-started});save();process.stdout.write('PASS '+spec.name+'\n');}report.status='PASS';}
catch(error){report.status='FAIL';report.error=error.message;process.exitCode=1;process.stderr.write(error.message+'\n');}
finally{report.sourceAtEnd=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();report.dirtyAtEnd=execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'});if(report.sourceAtEnd!==report.source||report.dirtyAtEnd){report.status='FAIL_SOURCE_CHANGED';process.exitCode=1;}report.finished=new Date().toISOString();save();}
