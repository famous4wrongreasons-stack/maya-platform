import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { diagnosticSandboxPolicy } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-local-crm-setup-20261010/maya-saas-backend/scripts/local-yclients-read-diagnostic.mjs';
const servers=[];
const open = async listener => { const server=net.createServer(listener); servers.push(server); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); return server; };
let allowed=0, forbidden=0, child;
const report={contract:'maya.local-yclients-read-os-network-proof/1',externalConnectionAttempts:0};
try {
 const pg=await open(socket=>{allowed++;socket.end();}), denied=await open(socket=>{forbidden++;socket.end();}), spare=await open(socket=>socket.end());
 const pgPort=pg.address().port, deniedPort=denied.address().port, apiPort=spare.address().port;
 await new Promise(resolve=>spare.close(resolve));
 const code=`const net=require('node:net'),assert=require('node:assert/strict');const t=setTimeout(()=>process.exit(2),3000);(async()=>{await new Promise((resolve,reject)=>{const s=net.connect({host:'127.0.0.1',port:${pgPort}},()=>{s.end();resolve()});s.on('error',reject)});await new Promise((resolve,reject)=>{const s=net.connect({host:'127.0.0.1',port:${deniedPort}});s.on('connect',()=>{s.destroy();reject(new Error('denied port connected'))});s.on('error',e=>{try{assert.equal(e.code,'EPERM');resolve()}catch(x){reject(x)}})});await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(${apiPort},'127.0.0.1',()=>s.close(resolve))});clearTimeout(t);process.stdout.write('closed_network_checks_passed\\n')})().catch(()=>{clearTimeout(t);process.exitCode=1})`;
 const policy=diagnosticSandboxPolicy(pgPort,apiPort);report.policy=policy;
 child=spawn('/usr/bin/sandbox-exec',['-p',policy,process.execPath,'-e',code],{stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';child.stdout.on('data',b=>{stdout+=b.toString();assert.ok(stdout.length<1024)});child.stderr.on('data',b=>{stderr+=b.toString();assert.ok(stderr.length<4096)});
 const exit=await new Promise(resolve=>child.on('close',(code,signal)=>resolve({code,signal})));
 assert.equal(exit.code,0);assert.equal(exit.signal,null);assert.equal(stdout.trim(),'closed_network_checks_passed');assert.equal(stderr,'');assert.equal(allowed,1);assert.equal(forbidden,0);
 Object.assign(report,{result:'PASS',allowedOwnLoopbackConnection:true,blockedOtherLoopbackConnection:true,blockedCode:'EPERM',allowedOwnApiBind:true,allowedAccepted:allowed,forbiddenAccepted:forbidden,exit});
} catch {report.result='FAIL';process.exitCode=1;}
finally {child?.kill('SIGTERM');for(const server of servers)if(server.listening)await new Promise(resolve=>server.close(resolve));report.ownedListenersClosed=servers.every(s=>!s.listening);fs.writeFileSync('/tmp/maya-yc-startup-diagnostic-20261010/network-proof.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
