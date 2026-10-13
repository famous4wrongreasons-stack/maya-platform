import test from 'node:test';
import assert from 'node:assert/strict';
import { projectOwnTasks, projectTaskReceipt } from '../src/net/own-tasks.ts';
import { createTransport } from '../src/net/client.ts';
import { createOwnTasks } from '../src/shell/own-tasks.ts';
import { createShell } from '../src/shell/shell.ts';
const identity='companion-task:10000000-0000-4000-8000-000000000001';
const row=(patch={})=>({canonical:true,work_item_id:'work-one',task_id:'inbox-one',title:'Test task',detail:'Synthetic details',status:'OPEN',due_at:null,next_actions:['done'],...patch});
const raw=(patch={})=>({contract:'maya.operational-work/1',ok:true,read_only:true,current_user_id:'user-one',tenant_id:'tenant-one',action_contract:'maya.operational-work.actions/1',can_create:true,tasks:[row()],...patch});
const receipt=(kind='create',patch={})=>({actionClass:kind==='create'?'create_operational_task':'complete_operational_task',actionExecutionId:'execution-one',targetRef:'work-one',targetGeneration:kind==='create'?0:1,noOp:false,settingMutations:0,workItemMutations:1,unknownApplicable:false,providerWrites:0,...patch});
const result=(kind='create',patch={})=>kind==='create'?{result:receipt(kind,patch),projected:1,projectionPending:false}:{...receipt(kind,patch),projectionPending:false};
const create={kind:'create',assignee:'user-one',title:' Task ',detail:' Details '},complete={kind:'complete',key:'work-one',inboxId:'inbox-one'};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('action context is explicit, finite and exact; no Inbox fallback or duplicate binding',()=>{
  const p=projectOwnTasks(raw());assert.deepEqual(p.actions,{userId:'user-one',tenantId:'tenant-one',canCreate:true,completions:[{key:'work-one',inboxId:'inbox-one'}]});
  for(const patch of [{action_contract:'other'},{can_create:'yes'},{tasks:[row({task_id:'123'})]},{tasks:[row({task_id:undefined})]},{tasks:[row({next_actions:['undo']})]},{tasks:[row(),row({work_item_id:'work-two'})]}])assert.equal(projectOwnTasks(raw(patch)),null);
  for(const patch of [{task_id:null},{status:'COMPLETED'},{next_actions:[]}])assert.deepEqual(projectOwnTasks(raw({tasks:[row(patch)]})).actions.completions,[]);
  assert.equal(projectOwnTasks(raw({action_contract:undefined})).actions,undefined);
});
test('receipt proof rejects wrong target, class, generation, missing proof and provider effects',()=>{
  assert.equal(projectTaskReceipt(result('complete'),complete).target,'work-one');
  assert.equal(projectTaskReceipt(result(),create).executionId,'execution-one');
  for(const patch of [{targetRef:'other'},{actionClass:'create_operational_task'},{targetGeneration:0},{providerWrites:1},{unknownApplicable:true},{actionExecutionId:''},{settingMutations:1}])assert.equal(projectTaskReceipt(result('complete',patch),complete),null);
  assert.equal(projectTaskReceipt({completed:true},complete),null);
  assert.equal(projectTaskReceipt({...result(),projectionPending:undefined},create),null);
});
function net(replies){const calls=[];globalThis.fetch=async(url,init)=>{calls.push({url,init});const reply=replies.shift();if(reply==='lost')throw Error('lost');assert.ok(reply);return new Response(JSON.stringify(reply.body??{}),{status:reply.status??201});};return {calls,transport:createTransport({authorize:async()=>({kind:'bearer',bearer:'synthetic',serial:1}),reauthorize:async()=>({kind:'bearer',bearer:'synthetic-refreshed',serial:2}),refused(){}})};}
test('typed task commands use finite A23 owners, explicit idempotency and stripped DTOs',async()=>{
  for(const command of [create,complete]){
    const n=net([{body:result(command.kind)}]);assert.equal((await n.transport.taskCommand({...command,tenantId:'forged',role:'owner',dueAt:'forged'},identity,new AbortController().signal)).ok,true);
    const {url,init}=n.calls[0];assert.equal(url,'/api/operational-work/'+command.kind);assert.equal(init.method,'POST');assert.equal(init.headers['Idempotency-Key'],identity);assert.equal(init.headers['X-Maya-Authority-Context'],undefined);assert.equal(init.credentials,'omit');
    assert.deepEqual(JSON.parse(init.body),command.kind==='create'?{assigneeUserId:'user-one',title:'Task',bodyText:'Details',dueAt:null}:{inboxItemId:'inbox-one'});
  }
});
test('invalid commands never dispatch; loss/malformed success/409/5xx remain unknown without auto replay',async()=>{
  let n=net([]);for(const cmd of [{...create,title:''},{...create,title:'x'.repeat(161)},{...create,detail:' '},{...complete,inboxId:'123'}])assert.equal((await n.transport.taskCommand(cmd,identity,new AbortController().signal)).ok,false);
  await n.transport.taskCommand(create,'forged',new AbortController().signal);assert.equal(n.calls.length,0);
  for(const reply of ['lost',{body:{}},{status:409},{status:500},{status:429}]){n=net([reply]);assert.equal((await n.transport.taskCommand(create,identity,new AbortController().signal)).failure.reason,'unknown');assert.equal(n.calls.length,1);}
  n=net([{status:403}]);assert.equal((await n.transport.taskCommand(create,identity,new AbortController().signal)).failure.reason,'refused');
});
test('401 refresh preserves exact command and identity; no refresh on forbidden',async()=>{
  const n=net([{status:401},{body:result()}]);assert.equal((await n.transport.taskCommand(create,identity,new AbortController().signal)).ok,true);
  assert.equal(n.calls.length,2);assert.equal(n.calls[0].init.body,n.calls[1].init.body);assert.equal(n.calls[1].init.headers['Idempotency-Key'],identity);
});
function rig(){let signedIn=true, snapshot=raw(), reads=0, ids=0;const listeners=new Set(),commands=[];
  const session={view:()=>({signedIn}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
  const shell=createShell({session,history:{push(){},back(){},onBack(){return()=>{};}}});
  const port=createOwnTasks({session,shell,scheduler:{now:()=>0,after:()=>()=>{}},newAbort:()=>new AbortController(),newId:()=>{ids++;return identity.slice('companion-task:'.length);},transport:{ownTasks:async()=>{reads++;return{ok:true,value:projectOwnTasks(snapshot)};},taskCommand:(command,key,signal)=>new Promise(resolve=>commands.push({command,key,signal,resolve}))}});
  return {port,shell,commands,get reads(){return reads},get ids(){return ids},set(v){snapshot=v},session(value){signedIn=value;for(const fn of listeners)fn(session.view());},dispose(){port.dispose();shell.dispose();}};
}
async function ready(r){r.port.open();await tick();}
test('self creation freezes server-resolved assignee, double tap sends once, success rereads',async()=>{
  const r=rig();await ready(r);const first=r.port.create(' Task ',' Detail ');await r.port.create('duplicate','duplicate');await r.port.complete('work-one');
  assert.equal(r.commands.length,1);assert.equal(r.ids,1);assert.deepEqual(r.commands[0].command,{kind:'create',assignee:'user-one',title:'Task',detail:'Detail'});
  assert.equal(r.port.view().command.phase,'pending');assert.equal(r.port.view().rows.length,1);
  r.commands[0].resolve({ok:true,value:projectTaskReceipt(result(),create)});await first;
  assert.equal(r.port.view().command.phase,'confirmed');assert.equal(r.reads,2);r.dispose();
});
test('completion uses exact retained Inbox binding, refuses forged/missing/done targets',async()=>{
  const r=rig();await ready(r);await r.port.complete('inbox-one');await r.port.complete('foreign');assert.equal(r.commands.length,0);
  const p=r.port.complete('work-one');assert.deepEqual(r.commands[0].command,complete);assert.equal(r.port.view().rows[0].completed,false);
  r.set(raw({tasks:[row({status:'COMPLETED',next_actions:[]})]}));r.commands[0].resolve({ok:true,value:projectTaskReceipt(result('complete'),complete)});await p;
  assert.equal(r.port.view().activeCount,0);await r.port.complete('work-one');assert.equal(r.commands.length,1);r.dispose();
});
test('lost response survives close/reopen and explicit retry uses same immutable operation',async()=>{
  const r=rig();await ready(r);let p=r.port.create('Task','Detail');r.commands[0].resolve({ok:false,failure:{reason:'unknown'}});await p;
  await r.port.create('new','new');assert.equal(r.commands.length,1);r.port.close();await ready(r);assert.equal(r.port.view().command.phase,'unknown');
  p=r.port.retryCommand();assert.deepEqual(r.commands[1].command,r.commands[0].command);assert.equal(r.commands[1].key,r.commands[0].key);assert.equal(r.ids,1);
  r.commands[1].resolve({ok:false,failure:{reason:'refused'}});await p;assert.equal(r.port.view().command.phase,'unknown');r.dispose();
});
test('session replacement/signout/disposal cannot accept late command or replay another identity',async()=>{
  for(const boundary of ['replacement','signout','dispose']){const r=rig();await ready(r);const p=r.port.complete('work-one');if(boundary==='dispose')r.dispose();else r.session(boundary==='replacement');r.commands[0].resolve({ok:true,value:projectTaskReceipt(result('complete'),complete)});await p;assert.notEqual(r.port.view().command?.phase,'confirmed');assert.equal(r.commands[0].signal.aborted,true);if(boundary!=='dispose')r.dispose();}
});
test('changed principal/tenant on reread blocks uncertain retry; read-only peers have no controls',async()=>{
  for(const change of [{tenant_id:'tenant-other'},{current_user_id:'user-other'}]){const r=rig();await ready(r);const p=r.port.complete('work-one');r.commands[0].resolve({ok:false,failure:{reason:'unknown'}});await p;r.set(raw(change));await r.port.refresh();await r.port.retryCommand();assert.equal(r.commands.length,1);r.dispose();}
  const r=rig();r.set(raw({can_create:false,tasks:[row({task_id:null})]}));await ready(r);assert.equal(r.port.view().canCreate,false);assert.deepEqual(r.port.view().completable,[]);await r.port.create('Task','Detail');await r.port.complete('work-one');assert.equal(r.commands.length,0);r.dispose();
});

test('navigation during pending command keeps progress and refreshes when late outcome arrives',async()=>{
  for(const ok of [true,false]){const r=rig();await ready(r);const p=r.port.complete('work-one');r.port.close();r.port.open();assert.equal(r.port.view().command.phase,'pending');r.commands[0].resolve(ok?{ok:true,value:projectTaskReceipt(result('complete'),complete)}:{ok:false,failure:{reason:'unknown'}});await p;assert.equal(r.port.view().phase,'ready');assert.equal(r.port.view().command.phase,ok?'confirmed':'unknown');r.dispose();}
});

test('create respects actual A23 executor title bound 160, stricter than legacy HTTP parser',async()=>{
  const r=rig();await ready(r);await r.port.create('x'.repeat(161),'Detail');assert.equal(r.commands.length,0);const p=r.port.create('x'.repeat(160),'Detail');assert.equal(r.commands.length,1);r.commands[0].resolve({ok:true,value:projectTaskReceipt(result(),create)});await p;r.dispose();
});
