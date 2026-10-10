import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { projectRuntimeStatus } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-local-crm-setup-20261010/maya-saas-backend/scripts/local-yclients-read-status.mjs';
const runtime='/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-local-crm-setup-20261010/maya-saas-backend/scripts/local-yclients-read-runtime.mjs';
const report={contract:'maya.local-yclients-read-negative-startup/1',result:'FAIL',environment:'empty synthetic environment',networkPolicy:'(version 1)(allow default)(deny network*)',statuses:[],unexpectedIpc:false};
const child=spawn('/usr/bin/sandbox-exec',['-p',report.networkPolicy,process.execPath,runtime,'--diagnostic-no-provider'],{cwd:'/private/tmp',env:{},stdio:['ignore','ignore','ignore','ipc']});
const timer=setTimeout(()=>child.kill('SIGKILL'),10000);
child.on('message',message=>{const safe=projectRuntimeStatus(message);if(safe)report.statuses.push(safe);else report.unexpectedIpc=true;});
try{
 const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
 report.exit=exit;assert.equal(exit.code,1);assert.equal(exit.signal,null);assert.equal(report.unexpectedIpc,false);
 assert.ok(report.statuses.some(s=>s.stage==='environment_validating'&&s.outcome==='failed'&&s.code==='environment_refused'&&s.cause==='assertion'));
 assert.ok(report.statuses.every(s=>['environment_validating','runtime_stopping'].includes(s.stage)));
 report.result='PASS';
}catch{process.exitCode=1;}finally{clearTimeout(timer);fs.writeFileSync('/tmp/maya-yc-startup-diagnostic-20261010/negative-runtime-proof.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
