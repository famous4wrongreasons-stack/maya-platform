import test from 'node:test';
import assert from 'node:assert/strict';
import { projectOwnTasks } from '../src/net/own-tasks.ts';
import { createTransport } from '../src/net/client.ts';
import { createOwnTasks } from '../src/shell/own-tasks.ts';
import { createShell, initialState, navigateState, openState, progressState, asPrimaryRoute } from '../src/shell/shell.ts';

const row = (id = 'task-one') => ({ canonical: true, work_item_id: id, task_id: 'inbox-only', title: 'Проверить расписание', detail: 'На завтра', due_at: '2026-10-14T09:00:00.000Z', status: 'OPEN', next_actions: ['done'], create_execution_id: 'execution-private' });
const response = (tasks = [row()]) => ({ contract: 'maya.operational-work/1', ok: true, read_only: true, tenant_id: 'synthetic-tenant', current_user_id: 'synthetic-user', tasks });
const success = (tasks = [row()]) => ({ ok: true, value: projectOwnTasks(response(tasks)) });
const tick = () => new Promise(resolve => setImmediate(resolve));

test('A23 read projection strips all command/authority fields and explicitly discloses the cap', () => {
  assert.deepEqual(projectOwnTasks(response()), { rows: [{ key: 'task-one', title: 'Проверить расписание', detail: 'На завтра', dueAt: '2026-10-14T09:00:00.000Z', completed: false }], possiblyCapped: false });
  assert.deepEqual(projectOwnTasks(response([])), { rows: [], possiblyCapped: false });
  assert.equal(projectOwnTasks(response(Array.from({length:50}, (_, i) => row('task-'+i)))).possiblyCapped, true);
  const done = projectOwnTasks(response([{...row(), status:'COMPLETED', due_at:null}])).rows[0];
  assert.equal(done.completed, true); assert.equal(done.dueAt, null);
});
test('malformed rows, duplicates, oversize, invalid dates and undocumented statuses refuse the entire snapshot', () => {
  for (const patch of [{canonical:false},{work_item_id:''},{title:''},{title:'x'.repeat(301)},{detail:null},{detail:'x'.repeat(4001)},{status:'CANCELLED'},{status:['OPEN']},{due_at:'2026-02-30T09:00:00.000Z'},{due_at:'2026-10-14T09:00:00+03:00'},{due_at:undefined}]) {
    assert.equal(projectOwnTasks(response([{...row(),...patch}])), null, JSON.stringify(patch));
  }
  for (const patch of [{contract:'other'},{read_only:false},{current_user_id:''},{tenant_id:''},{ok:false},{tasks:null}]) assert.equal(projectOwnTasks({...response(),...patch}),null);
  assert.equal(projectOwnTasks(response([row(), row()])),null);
  assert.equal(projectOwnTasks(response(Array.from({length:51}, (_, i)=>row(String(i))))),null);
});
function net(replies) {
  const calls=[], counts={authorize:0, refresh:0, refused:0};
  globalThis.fetch = async (url, init) => {
    calls.push({url,init});
    const reply=replies.shift(); assert.ok(reply, 'unexpected request');
    return new Response(JSON.stringify(reply.body ?? {}), {status:reply.status ?? 200,headers:reply.headers});
  };
  const auth={authorize:async()=>{counts.authorize++;return {kind:'bearer',serial:1,bearer:'test-only'};}, reauthorize:async()=>{counts.refresh++;return {kind:'bearer',serial:2,bearer:'test-next'};}, refused:()=>counts.refused++};
  return {calls,counts,transport:createTransport(auth)};
}
test('only GET current-user path, no caller scope, client context, cookies, body or write capability', async () => {
  const n=net([{body:response()}]);
  assert.equal((await n.transport.ownTasks(new AbortController().signal)).ok,true);
  assert.equal(n.calls.length,1);
  const {url,init}=n.calls[0];
  assert.equal(url,'/api/operational-work'); assert.equal(init.method,'GET'); assert.equal(init.body,null);
  assert.deepEqual(init.headers,{Authorization:'Bearer test-only'});
  assert.equal(init.credentials,'omit'); assert.equal(init.cache,'no-store'); assert.equal(init.redirect,'error');
});
test('401 retries once through existing auth; revoked session refuses; no refresh on 403', async () => {
  let n=net([{status:401},{body:response()}]);
  assert.equal((await n.transport.ownTasks(new AbortController().signal)).ok,true);
  assert.deepEqual(n.counts,{authorize:1,refresh:1,refused:0}); assert.equal(n.calls[1].init.headers.Authorization,'Bearer test-next');
  n=net([{status:401},{status:401}]);
  assert.equal((await n.transport.ownTasks(new AbortController().signal)).failure.reason,'forbidden');
  assert.deepEqual(n.counts,{authorize:1,refresh:1,refused:1}); assert.equal(n.calls.length,2);
  n=net([{status:403}]); assert.equal((await n.transport.ownTasks(new AbortController().signal)).failure.reason,'forbidden');
  assert.equal(n.counts.refresh,0); assert.equal(n.calls.length,1);
});
test('429, malformed success, unavailable and abort are distinct from empty success', async () => {
  for (const [reply,reason] of [[{status:429,headers:{'Retry-After':'9'}},'rate_limited'],[{body:{}},'invalid_response'],[{status:503},'unavailable']]) {
    const n=net([reply]), result=await n.transport.ownTasks(new AbortController().signal);
    assert.equal(result.failure.reason,reason); assert.equal(n.calls.length,1);
    if(reason==='rate_limited')assert.equal(result.failure.retryAfterSec,9);
  }
  const n=net([]), controller=new AbortController();controller.abort();
  assert.equal((await n.transport.ownTasks(controller.signal)).failure.reason,'aborted');assert.equal(n.calls.length,0);
});
function rig(signedIn=true) {
  let sessionView={signedIn}, now=0;
  const listeners=new Set(), timers=[], requests=[];
  const session={view:()=>sessionView,subscribe:fn=>{listeners.add(fn);return ()=>listeners.delete(fn);}};
  const shell=createShell({session,history:{push(){},back(){},onBack(){return ()=>{};}}});
  const port=createOwnTasks({session,shell,newAbort:()=>new AbortController(),scheduler:{now:()=>now,after:(ms,fn)=>{const t={at:now+ms,fn,cancelled:false};timers.push(t);return ()=>t.cancelled=true;}},
    transport:{ownTasks:signal=>new Promise(resolve=>requests.push({signal,resolve}))}});
  return {port,shell,requests, session(value){sessionView={signedIn:value};for(const fn of [...listeners])fn(sessionView);},
    advance(ms){now+=ms;for(const t of timers.splice(0))if(!t.cancelled&&t.at<=now)t.fn();},
    dispose(){port.dispose();shell.dispose();}};
}
test('workspace has no WidgetRoute/deeplink key; canonical detail and navigation replace it', () => {
  const r=rig(false);
  r.port.open();assert.equal(r.shell.view().workspace,undefined);assert.equal(r.requests.length,0);
  r.session(true);r.port.open();assert.equal(r.shell.view().workspace,'tasks');
  assert.equal(asPrimaryRoute('shell.tasks'),null);assert.equal(asPrimaryRoute('tasks'),null);
  r.shell.navigate('shell.tasks');assert.equal(r.shell.view().workspace,'tasks');
  const s={...initialState(),workspace:'tasks'},opener={itemId:'w',ref:'intent:x'};
  assert.equal(navigateState(s,'shell.root').workspace,undefined);
  assert.equal(progressState(s,opener).workspace,undefined);
  assert.equal(openState(s,opener,'detail',{}).workspace,undefined);
  r.shell.openProgress(opener);assert.equal(r.shell.view().workspace,undefined);assert.equal(r.requests[0].signal.aborted,true);
  r.dispose();
});
test('lazy one-flight read; filtering is local; close clears rows and reopen rereads', async () => {
  const r=rig();assert.equal(r.requests.length,0);
  r.port.open();r.port.open();await r.port.refresh();assert.equal(r.requests.length,1);
  r.requests[0].resolve(success([row(),{...row('done'),status:'COMPLETED'}]));await tick();
  assert.equal(r.port.view().activeCount,1);assert.equal(r.port.view().doneCount,1);
  r.port.filter('done');assert.equal(r.port.view().rows[0].key,'done');assert.equal(r.requests.length,1);
  r.port.close();assert.equal(r.port.view().phase,'closed');assert.deepEqual(r.port.view().rows,[]);
  r.port.open();assert.equal(r.requests.length,2);assert.equal(r.port.view().filter,'active');
  r.dispose();
});
test('close / signout / new session / disposal discard late private data', async () => {
  for(const boundary of ['close','signout','replacement','dispose']) {
    const r=rig();r.port.open();const first=r.requests[0];
    if(boundary==='close')r.port.close();
    if(boundary==='signout')r.session(false);
    if(boundary==='replacement')r.session(true);
    if(boundary==='dispose')r.dispose();
    assert.equal(first.signal.aborted,true);
    first.resolve(success([row('old-user')]));await tick();
    assert.deepEqual(r.port.view().rows,[],boundary);
    if(boundary==='replacement') { assert.equal(r.requests.length,2);r.requests[1].resolve(success([row('new-user')]));await tick();assert.equal(r.port.view().rows[0].key,'new-user'); }
    if(boundary!=='dispose')r.dispose();
  }
});
test('refresh clears old snapshot; denial cannot retain stale tasks; rate limit waits for explicit retry', async () => {
  const r=rig();r.port.open();r.requests[0].resolve(success());await tick();
  const refreshed=r.port.refresh();assert.deepEqual(r.port.view().rows,[]);
  r.requests[1].resolve({ok:false,failure:{reason:'forbidden'}});await refreshed;
  assert.equal(r.port.view().phase,'failed');assert.deepEqual(r.port.view().rows,[]);
  const limited=r.port.refresh();r.requests[2].resolve({ok:false,failure:{reason:'rate_limited',retryAfterSec:3}});await limited;
  await r.port.refresh();assert.equal(r.requests.length,3);
  r.advance(3000);assert.equal(r.port.view().retryAt,null);assert.equal(r.requests.length,3);
  const retried=r.port.refresh();assert.equal(r.requests.length,4);
  r.requests[3].resolve(success([]));await retried;assert.equal(r.port.view().phase,'ready');r.dispose();
});
