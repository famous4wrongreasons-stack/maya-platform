const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'../../..'),source=fs.readFileSync(path.join(repo,'maya-saas-backend/deploy/platform/beget-edge/rc/r12-team-communications.js'),'utf8').split('function ATeamChat()')[0];
const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
const env={crypto:crypto.webcrypto,Uint8Array,Uint32Array,DataView,TextEncoder,JSON,Blob,File,URL,fetch:async()=>{throw Error('unexpected network');},window:{},localStorage:storage,btoa:s=>Buffer.from(s,'binary').toString('base64')};vm.createContext(env);vm.runInContext(source,env);
(async()=>{
 for(const n of [0,1,55,56,63,64,65,127,128,1048575,1048576,1048577,6291467]){
  const bytes=crypto.randomBytes(n),blob=new Blob([bytes]);assert.equal(await env.mayaTeamFileHash(blob),crypto.createHash('sha256').update(bytes).digest('hex'),'digest '+n);
 }
 const calls=[];let loseSend=true,loseReserve=false,unknownFinalize=false,loseAttachmentSend=false,reads=0;
 async function request(url,options){const body=JSON.parse(options.body);calls.push({url,body,key:options.headers['Idempotency-Key']});
  if(url.includes('/chunks/'))return{contract:'maya.team-communications/1',attachmentId:'attachment-a',index:Number(url.split('/').at(-1))};
  const op=url.split('/').at(-1);if(op==='send'&&(!body.attachmentId&&loseSend||body.attachmentId&&loseAttachmentSend))throw Error('lost response');if(op==='reserve'&&loseReserve)throw Error('lost response');
  return{contract:'maya.team-communications/1',actionExecutionId:op+'-execution',...(op==='send'?{status:'SENT',messageId:'message-a'}:op==='reserve'?{state:'RESERVED',attachmentId:'attachment-a'}:op==='finalize'?{state:unknownFinalize?'UNKNOWN':'SEALED'}:{status:'WITHDRAWN'})};
 }
 let client=env.mayaTeamTransport({tenantId:'tenant-a',userId:'user-a'},request,storage),command={conversationKey:'team/main',text:'Original',attachmentId:null};
 await assert.rejects(client.submit('message','send',command));const first=calls[0];assert.equal(values.size,1);await assert.rejects(client.submit('message','send',{...command,text:'Changed'}),/pending_intent_changed/);assert.equal(calls.length,1);
 assert.equal(env.mayaTeamTransport({tenantId:'other',userId:'user-a'},request,storage).read('message'),null);
 loseSend=false;client=env.mayaTeamTransport({tenantId:'tenant-a',userId:'user-a'},request,storage);await client.retry('message');assert.deepEqual(calls[1],first);assert.equal(values.size,0);
 const file=new File([Buffer.alloc(6291467,65)],'synthetic.txt',{type:'text/plain'});loseReserve=true;await assert.rejects(client.upload(file));const reserve=calls.at(-1);assert.ok(client.read('upload').reserveKey);
 loseReserve=false;unknownFinalize=true;client=env.mayaTeamTransport({tenantId:'tenant-a',userId:'user-a'},request,storage);await assert.rejects(client.upload(file),/receipt_unknown/);assert.deepEqual(calls.findLast(c=>c.url.endsWith('/reserve')),reserve);assert.equal(calls.filter(c=>c.url.includes('/chunks/')).length,2);const final=calls.at(-1);assert.ok(client.read('upload').finalStarted);
 await assert.rejects(client.upload(new File(['different'],'synthetic.txt',{type:'text/plain'})),/pending_file_changed/);
 unknownFinalize=false;loseAttachmentSend=true;client=env.mayaTeamTransport({tenantId:'tenant-a',userId:'user-a'},request,storage);await assert.rejects(client.resumeUpload());assert.deepEqual(calls.findLast(c=>c.url.endsWith('/finalize')),final);const sent=calls.at(-1);assert.ok(client.read('upload').sealed);
 loseAttachmentSend=false;client=env.mayaTeamTransport({tenantId:'tenant-a',userId:'user-a'},request,storage);await client.resumeUpload();assert.deepEqual(calls.at(-1),sent);assert.equal(calls.filter(c=>c.url.includes('/chunks/')).length,2);assert.equal(values.size,0);
 env.window.__ME_SAAS_CTX={api:'https://synthetic.invalid/api',ns:'fixture',slug:'expected'};values.set('me_saas_auth_v2:fixture',JSON.stringify({token:'synthetic',tenant_slug:'expected',api_base:'https://synthetic.invalid/api'}));env.fetch=async()=>{reads++;return{ok:true,json:async()=>({contract:'maya.team-communications/1',tenantId:'different',userId:'user-a'})};};
 await assert.rejects(env.mayaTeamPrivateBlob({tenantId:'tenant-a',userId:'user-a'},'attachment-a'),/session_changed/);assert.equal(reads,1);
 for(const state of ['UNKNOWN','READY','EXECUTING','unrecognized']){const guarded=env.mayaTeamTransport({tenantId:'scope-'+state,userId:'user'},async()=>({contract:'maya.team-communications/1',actionExecutionId:'same-execution',state}),storage);await assert.rejects(guarded.submit('message','send',command),/receipt_unknown/);assert.ok(guarded.read('message'));await assert.rejects(guarded.submit('message','send',{...command,text:'Changed'}),/pending_intent_changed/);}
 for(const state of ['FAILED','NOT_EXECUTED']){const terminal=env.mayaTeamTransport({tenantId:'scope-'+state,userId:'user'},async()=>({contract:'maya.team-communications/1',actionExecutionId:'terminal-execution',state}),storage);await assert.rejects(terminal.submit('message','send',command),/command_rejected/);assert.equal(terminal.read('message'),null);}
 const ambiguous=env.mayaTeamTransport({tenantId:'http-error',userId:'user'},async()=>{throw Error('HTTP 403 after previously lost response');},storage);await assert.rejects(ambiguous.submit('message','send',command));assert.ok(ambiguous.read('message'));
 const pwa=fs.readFileSync(path.join(repo,'сайт и приложение/app.html'),'utf8');assert.ok(pwa.includes('href:"?team=main"'));assert.ok(pwa.includes("url.startsWith('blob:')"));assert.ok(!pwa.includes('action=team_chat_media'));
 console.log(JSON.stringify({package:'R12',proof:'actual browser transport in VM',result:'PASS',hashBoundaries:13,lostSendStable:true,lostReserveStable:true,unknownFinalizeSameKey:true,lostAttachmentSendStable:true,otherTenantIsolated:true,privateDownloadCrossAccountDenied:true,productionEffects:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
