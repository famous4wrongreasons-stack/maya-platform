import test from 'node:test';
import assert from 'node:assert/strict';
import { projectFeed, projectReports, projectReport } from '../src/net/workspace-reads.ts';
import { createTransport } from '../src/net/client.ts';
import { createWorkspaceReads } from '../src/shell/workspace-reads.ts';
import { createShell, asPrimaryRoute } from '../src/shell/shell.ts';
const id='10000000-0000-4000-8000-000000000001', other='10000000-0000-4000-8000-000000000002';
const feed=(key='one')=>({id:key,type:'owner_alert',title:'Сохранённое уведомление',body_text:'Искусственные данные',created_at:'2026-10-13T09:00:00.000Z',read_at:null,payload:{secret:'discard'},deep_link:'https://unsafe.invalid',source_event_id:'private-event'});
const report=(key=id)=>({runId:key,reportType:'daily_report',periodLocalDate:'2026-10-12',title:'Отчёт за день'});
const selected=projectReports({reports:[report()]}).rows[0];
const detail=(key=id)=>({contract:'maya.owner-report-snapshot/1',runId:key,reportType:'daily_report',periodLocalDate:'2026-10-12',timezone:'Europe/Moscow',content:{title:'Отчёт за день',bodyText:'Личные сохранённые факты',payload:{secret:'discard'},deepLink:'/app/?panel=chat'}});
const ok=value=>({ok:true,value});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('feed projection is text-only, bounded and preserves persisted unread state without delivery authority',()=>{
  assert.deepEqual(projectFeed({items:[feed()]}),{rows:[{key:'one',type:'owner_alert',title:'Сохранённое уведомление',body:'Искусственные данные',createdAt:'2026-10-13T09:00:00.000Z',unread:true}],possiblyCapped:false});
  assert.equal(projectFeed({items:Array.from({length:50},(_,i)=>feed(String(i)))}).possiblyCapped,true);
  assert.equal(projectFeed({items:[{...feed(),read_at:'2026-10-13T10:00:00.000Z'}]}).rows[0].unread,false);
});
test('feed malformed, duplicate and oversized responses fail closed, never as empty success',()=>{
  for(const patch of [{id:''},{title:''},{body_text:null},{body_text:'x'.repeat(12001)},{type:[]},{created_at:'2026-02-30T09:00:00.000Z'},{read_at:'yesterday'}])assert.equal(projectFeed({items:[{...feed(),...patch}]}),null);
  for(const value of [{items:[feed(),feed()]},{items:Array.from({length:51},(_,i)=>feed(String(i)))},{items:null},{}])assert.equal(projectFeed(value),null);
});
test('report projection binds immutable summary and drops encrypted/source/payload/link metadata',()=>{
  assert.deepEqual(projectReports({reports:[report()]}),{rows:[{key:id,type:'daily_report',period:'2026-10-12',title:'Отчёт за день'}]});
  assert.deepEqual(projectReport(detail(),selected),{...selected,timezone:'Europe/Moscow',body:'Личные сохранённые факты'});
  for(const patch of [{runId:other},{reportType:'morning_owner'},{periodLocalDate:'2026-10-11'},{contract:'other'},{timezone:''},{content:{title:'substituted',bodyText:'content'}}])assert.equal(projectReport({...detail(),...patch},selected),null);
});
test('report list refuses invalid UUID/date/type, duplicates and oversized list',()=>{
  for(const patch of [{runId:'../admin'},{periodLocalDate:'2026-02-30'},{reportType:'daily_report_unknown'},{title:''}])assert.equal(projectReports({reports:[{...report(),...patch}]}),null);
  assert.equal(projectReports({reports:[report(),report()]}),null);
  assert.equal(projectReports({reports:Array(101).fill(report())}),null);
  assert.deepEqual(projectReports({reports:[]}),{rows:[]});
});
function net(replies) {
  const calls=[],counts={authorize:0,refresh:0,refused:0};
  globalThis.fetch=async(url,init)=>{calls.push({url,init});const reply=replies.shift();assert.ok(reply,'unexpected request');return new Response(JSON.stringify(reply.body??{}),{status:reply.status??200,headers:reply.headers});};
  const auth={authorize:async()=>{counts.authorize++;return {kind:'bearer',serial:1,bearer:'synthetic-only'};},reauthorize:async()=>{counts.refresh++;return {kind:'bearer',serial:2,bearer:'synthetic-refreshed'};},refused:()=>counts.refused++};
  return {calls,counts,transport:createTransport(auth)};
}
const signal=()=>new AbortController().signal;
const methods=[['feed',{items:[feed()]},'/api/inbox'],['reports',{reports:[report()]},'/api/owner-reports'],['report',detail(),'/api/owner-reports/'+id+'/snapshot']];
const invoke=(transport,method,s=signal())=>method==='report'?transport.report(selected,s):transport[method](s);
test('finite authenticated GETs only; no caller tenant, body, cookies, command or model request',async()=>{
  for(const [method,body,url] of methods){const n=net([{body}]);assert.equal((await invoke(n.transport,method)).ok,true);assert.equal(n.calls.length,1);assert.equal(n.calls[0].url,url);assert.deepEqual({...n.calls[0].init,signal:null},{method:'GET',headers:{Authorization:'Bearer synthetic-only'},body:null,signal:null,credentials:'omit',cache:'no-store',redirect:'error'});}
  const n=net([]);for(const key of ['', '../admin',id+'/read',id+'?tenant=foreign'])assert.equal((await n.transport.report({...selected,key},signal())).ok,false);assert.equal(n.calls.length,0);
});
test('all workspace reads refresh once on 401, refuse 403/revoked, respect 429 and abort',async()=>{
  for(const [method,body] of methods){
    let n=net([{status:401},{body}]);assert.equal((await invoke(n.transport,method)).ok,true);assert.equal(n.counts.refresh,1);
    n=net([{status:401},{status:401}]);assert.equal((await invoke(n.transport,method)).failure.reason,'forbidden');assert.equal(n.counts.refused,1);
    for(const [reply,reason] of [[{status:403},'forbidden'],[{status:429,headers:{'Retry-After':'4'}},'rate_limited'],[{body:{}},'invalid_response'],[{status:503},'unavailable']]){n=net([reply]);const result=await invoke(n.transport,method);assert.equal(result.failure.reason,reason);assert.equal(n.calls.length,1);assert.equal(n.counts.refresh,0);if(reason==='rate_limited')assert.equal(result.failure.retryAfterSec,4);}
    n=net([]);const abort=new AbortController();abort.abort();assert.equal((await invoke(n.transport,method,abort.signal)).failure.reason,'aborted');assert.equal(n.calls.length,0);
  }
});
function rig(signedIn=true){
  let sessionView={signedIn},now=0;const listeners=new Set(),timers=[],requests=[];
  const session={view:()=>sessionView,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
  const shell=createShell({session,history:{push(){},back(){},onBack(){return()=>{};}}});
  const request=(method,signal,selection)=>new Promise(resolve=>requests.push({method,signal,selection,resolve}));
  const port=createWorkspaceReads({session,shell,newAbort:()=>new AbortController(),scheduler:{now:()=>now,after:(ms,fn)=>{const t={fn,at:now+ms,cancelled:false};timers.push(t);return()=>t.cancelled=true;}},transport:{feed:s=>request('feed',s),reports:s=>request('reports',s),report:(row,s)=>request('report',s,row)}});
  return {port,shell,requests,session(value){sessionView={signedIn:value};for(const fn of [...listeners])fn(sessionView);},advance(ms){now+=ms;for(const t of timers.splice(0))if(!t.cancelled&&t.at<=now)t.fn();},dispose(){port.dispose();shell.dispose();}};
}
const loadReports=async(r)=>{r.port.openLibrary();r.requests.at(-1).resolve(ok(projectReports({reports:[report(),{...report(other),title:'Аналитика'}]})));await tick();};
test('finite host workspaces never become widget routes and require sign-in',()=>{
  const r=rig(false);r.port.openFeed();r.port.openLibrary();assert.equal(r.requests.length,0);
  for(const route of ['feed','library','shell.feed','shell.library'])assert.equal(asPrimaryRoute(route),null);
  r.session(true);r.port.openFeed();assert.equal(r.shell.view().workspace,'feed');r.shell.openProgress({itemId:'w',ref:'intent:test'});assert.equal(r.port.view().workspace,null);assert.equal(r.requests[0].signal.aborted,true);r.dispose();
});
test('lazy one-flight lists; filter/sort/layout are local and no acknowledgment occurs',async()=>{
  const r=rig();assert.equal(r.requests.length,0);r.port.openFeed();r.port.openFeed();await r.port.refresh();assert.equal(r.requests.length,1);
  r.requests[0].resolve(ok(projectFeed({items:[feed(),{...feed('two'),read_at:'2026-10-13T10:00:00.000Z'}]})));await tick();r.port.filterUnread(true);assert.equal(r.port.view().feed.length,1);assert.equal(r.requests.length,1);
  await loadReports(r);assert.deepEqual(r.port.view().feed,[]);r.port.order('title');r.port.layout('grid');assert.equal(r.port.view().reports[0].key,other);assert.equal(r.port.view().layout,'grid');assert.equal(r.requests.length,2);r.port.order('recent');assert.equal(r.port.view().reports[0].key,id);r.dispose();
});
test('only current loaded report keys may open; fresh detail read and back cancel without timeline mutation',async()=>{
  const r=rig();await r.port.read(id);assert.equal(r.requests.length,0);await loadReports(r);await r.port.read('foreign');assert.equal(r.requests.length,1);
  const pending=r.port.read(id);assert.deepEqual(r.requests[1].selection,selected);assert.equal(r.port.view().detail.phase,'loading');r.requests[1].resolve(ok(projectReport(detail(),selected)));await pending;assert.equal(r.port.view().detail.report.body,'Личные сохранённые факты');assert.equal(r.shell.view().fullscreen,null);
  r.port.back();assert.equal(r.port.view().detail,null);assert.equal(r.port.view().reports.length,2);r.dispose();
});
test('late detail cannot overwrite a newer selection or survive close, back, refresh, session replacement or disposal',async()=>{
  for(const boundary of ['newer','close','back','refresh','replacement','signout','dispose']){
    const r=rig();await loadReports(r);const p=r.port.read(id),req=r.requests[1];
    if(boundary==='newer')void r.port.read(other);
    if(boundary==='close')r.port.close();if(boundary==='back')r.port.back();if(boundary==='refresh')void r.port.refresh();if(boundary==='replacement')r.session(true);if(boundary==='signout')r.session(false);if(boundary==='dispose')r.dispose();
    assert.equal(req.signal.aborted,true,boundary);req.resolve(ok(projectReport(detail(),selected)));await p;
    assert.notEqual(r.port.view().detail?.phase,'ready',boundary);if(boundary==='newer')assert.equal(r.port.view().detail.title,'Аналитика');if(boundary!=='dispose')r.dispose();
  }
});
test('late feed/list from previous workspace/session is discarded, including same-workspace reopen',async()=>{
  for(const boundary of ['library','reopen','replacement','signout']){
    const r=rig();r.port.openFeed();const req=r.requests[0];
    if(boundary==='library')r.port.openLibrary();if(boundary==='reopen'){r.port.close();r.port.openFeed();}if(boundary==='replacement')r.session(true);if(boundary==='signout')r.session(false);
    req.resolve(ok(projectFeed({items:[feed()]})));await tick();assert.deepEqual(r.port.view().feed,[],boundary);assert.equal(req.signal.aborted,true);r.dispose();
  }
});
test('denied detail clears retained titles/content; rate limit waits for explicit list retry',async()=>{
  const r=rig();await loadReports(r);const p=r.port.read(id);r.requests[1].resolve({ok:false,failure:{reason:'forbidden'}});await p;assert.equal(r.port.view().phase,'failed');assert.deepEqual(r.port.view().reports,[]);assert.equal(r.port.view().detail,null);await r.port.read(id);assert.equal(r.requests.length,2);
  const limited=r.port.refresh();r.requests[2].resolve({ok:false,failure:{reason:'rate_limited',retryAfterSec:3}});await limited;await r.port.refresh();assert.equal(r.requests.length,3);r.advance(3000);assert.equal(r.port.view().retryAt,null);assert.equal(r.requests.length,3);const retry=r.port.refresh();r.requests[3].resolve(ok({rows:[]}));await retry;assert.equal(r.port.view().phase,'ready');r.dispose();
});

test('build admits only fixed UUID report suffix and exact Inbox READ literal owner',async()=>{
  const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');
  const {fileURLToPath}=await import('node:url');
  const {loadTypeScript,emitContract,runFixture,sharedDirs}=await import('../build.mjs');
  const ts=loadTypeScript(),shell=fileURLToPath(new URL('../',import.meta.url)),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'maya-workspace-path-proof-'));
  try {
    const contract=emitContract(ts,tmp),shared=sharedDirs(ts,contract);
    const source=fs.readFileSync(path.join(shell,'src/net/client.ts'),'utf8');
    const files=()=>new Map(['src/net/endpoint.ts','src/net/project.ts','src/net/client.ts','src/net/session.ts'].map(p=>[p,fs.readFileSync(path.join(shell,p),'utf8')]));
    const check=(id,text,direction)=>runFixture(ts,contract,{id,direction,row:'net',files:files().set('src/net/client.ts',text),expect:new Set(),probes:false,typecheck:null},shared);
    assert.deepEqual(check('workspace-admit',source,'admit').refusals,[]);
    for(const [id,from,to,rule] of [
      ['suffix','}/snapshot`','}/download`','fetch-shape'],
      ['prefix',"reportSnapshot: '/owner-reports/'","reportSnapshot: '/owner-reports-admin/'",'fetch-shape'],
      ['guard',"if (endpoint === 'reportSnapshot' && (reportRunId.length","if (endpoint === 'feed' && (reportRunId.length",'fetch-shape'],
      ['encoding','${encodeURIComponent(reportRunId)}/snapshot','${reportRunId}/snapshot','fetch-shape'],
      ['reassign','const controller = new AbortController();',"reportRunId = '../admin'; const controller = new AbortController();",'fetch-shape'],
      ['arbitrary-inbox','export function createTransport(',"const forbiddenPath = '/inbox'; export function createTransport(",'literal-ban'],
      ['inbox-mutation',"feed: '/inbox'","feed: '/inbox/read'",'literal-ban'],
    ]){const mutated=source.replace(from,to);assert.notEqual(mutated,source,id);assert.ok(check(id,mutated,'refuse').got.includes(rule),id);}
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
