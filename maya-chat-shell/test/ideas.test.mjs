import test from 'node:test';
import assert from 'node:assert/strict';
import { projectIdeas } from '../src/net/ideas.ts';
import { createTransport } from '../src/net/client.ts';
import { createIdeas } from '../src/shell/ideas.ts';
import { createShell, asPrimaryRoute } from '../src/shell/shell.ts';
const t0=Date.parse('2026-10-14T09:00:00.000Z');
export const row=(patch={})=>({contract:'c8.valuation.read/1',version:1,id:'result-one',revision:1,snapshotHash:'a'.repeat(64),mode:'immutable_snapshot',kind:'OBSERVED_VALUE',subject:{kind:'tenant',id:'PRIVATE_TENANT'},current:true,available:true,asOf:'2026-10-14T08:00:00.000Z',expiresAt:'2026-10-14T10:00:00.000Z',period:{from:'2026-10-01T00:00:00.000Z',to:'2026-10-14T08:00:00.000Z',timezone:'Europe/Moscow'},completeness:'PARTIAL',qualification:'VERIFIED',message:'Результат рассчитан по указанным фактам и подтверждённому правилу.',boundaries:{factIsPrediction:false,predictionIsPolicy:false,valueImpliesConsent:false,rankingImpliesContactPermission:false,rankingImpliesActionAuthority:false,opportunityImpliesExecution:false},numericPrediction:null,activation:'DISABLED',values:[{value:'123456'}],ranking:{members:[{id:'PRIVATE_CLIENT'}]},proposedActionIntent:{danger:'PRIVATE_ACTION'},...patch});
const wire=(items=[row()],patch={})=>({contract:'c8.valuation.list/1',items,nextCursor:null,numericPredictionsAvailable:false,...patch});
const snapshot=(items=[row()],patch={})=>projectIdeas(wire(items,patch));
const ok=value=>({ok:true,value});
const tick=()=>new Promise(r=>setImmediate(r));
test('Ideas retain only read metadata; no values, subjects, ranking, action or contact authority',()=>{
 const out=snapshot();assert.equal(out.rows.length,1);assert.equal(out.rows[0].coverage,'PARTIAL');assert.equal(out.possiblyCapped,false);
 assert.equal(snapshot([], {nextCursor:'more'}).possiblyCapped,true);
 assert.ok(!/PRIVATE|123456|boundaries|proposedActionIntent|numericPrediction|ranking/.test(JSON.stringify(out)));
 for(const kind of ['OBSERVED_VALUE','POLICY_SIGNAL','SCENARIO','RANKING','PREDICTION'])assert.ok(snapshot([row({kind,...(kind==='PREDICTION'?{available:false}: {})})]));
});
test('Ideas malformed, duplicate, future authority and false prediction availability fail closed',()=>{
 for(const patch of [{contract:'other'},{version:2},{mode:'live'},{id:''},{revision:0},{snapshotHash:'forged'},{kind:'PLAN'},{subject:{kind:'everyone'}},{asOf:'now'},{expiresAt:'2026-10-14T07:00:00.000Z'},{current:'true'},{available:'true'},{available:true,current:false},{available:true,snapshotHash:null},{kind:'PREDICTION'},{completeness:'ANY'},{qualification:'TRUSTED'},{message:''},{numericPrediction:0},{activation:'ENABLED'},{boundaries:{...row().boundaries,opportunityImpliesExecution:true}},{boundaries:{}}])assert.equal(snapshot([row(patch)]),null,JSON.stringify(patch));
 for(const patch of [{contract:'other'},{items:null},{nextCursor:42},{numericPredictionsAvailable:true}])assert.equal(projectIdeas(wire([],patch)),null);
 assert.equal(snapshot([row(),row()]),null);assert.equal(snapshot(Array.from({length:26},(_,i)=>row({id:String(i)}))),null);
 assert.ok(snapshot([row({current:false,available:false,snapshotHash:null,qualification:'UNQUALIFIED',completeness:'UNAVAILABLE'})]));
});
function net(replies){const calls=[],counts={refresh:0,refused:0};globalThis.fetch=async(url,init)=>{calls.push({url,init});const r=replies.shift();assert.ok(r);return new Response(JSON.stringify(r.body??{}),{status:r.status??200,headers:r.headers});};return {calls,counts,transport:createTransport({authorize:async()=>({kind:'bearer',serial:1,bearer:'synthetic-only'}),reauthorize:async()=>{counts.refresh++;return{kind:'bearer',serial:2,bearer:'synthetic-refreshed'};},refused:()=>counts.refused++})};}
test('Ideas use one finite authenticated GET without body/query/tenant/model/compute',async()=>{const n=net([{body:wire()}]);assert.equal((await n.transport.ideas(new AbortController().signal)).ok,true);assert.equal(n.calls.length,1);assert.equal(n.calls[0].url,'/api/analytics/valuations');assert.deepEqual({...n.calls[0].init,signal:null},{method:'GET',headers:{Authorization:'Bearer synthetic-only'},body:null,signal:null,credentials:'omit',cache:'no-store',redirect:'error'});});
test('Ideas refresh auth once and expose forbidden/rate/invalid/unavailable/abort distinctly',async()=>{
 let n=net([{status:401},{body:wire()}]);assert.equal((await n.transport.ideas(new AbortController().signal)).ok,true);assert.equal(n.counts.refresh,1);
 n=net([{status:401},{status:401}]);assert.equal((await n.transport.ideas(new AbortController().signal)).failure.reason,'forbidden');assert.equal(n.counts.refused,1);
 for(const [r,reason] of [[{status:403},'forbidden'],[{status:429,headers:{'Retry-After':'4'}},'rate_limited'],[{body:{}},'invalid_response'],[{status:503},'unavailable'],[{status:404},'unavailable']]){n=net([r]);assert.equal((await n.transport.ideas(new AbortController().signal)).failure.reason,reason);assert.equal(n.counts.refresh,0);}
 n=net([]);const a=new AbortController();a.abort();assert.equal((await n.transport.ideas(a.signal)).failure.reason,'aborted');assert.equal(n.calls.length,0);
});
function rig(signedIn=true){let now=t0,sessionView={signedIn};const listeners=new Set(),timers=[],requests=[];const session={view:()=>sessionView,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};const shell=createShell({session,history:{push(){},back(){},onBack(){return()=>{};}}});const port=createIdeas({session,shell,newAbort:()=>new AbortController(),scheduler:{now:()=>now,after:(ms,fn)=>{const t={fn,at:now+ms,cancelled:false};timers.push(t);return()=>t.cancelled=true;}},transport:{ideas:signal=>new Promise(resolve=>requests.push({signal,resolve}))}});return{port,shell,requests,session(value){sessionView={signedIn:value};for(const fn of [...listeners])fn(sessionView);},advance(ms){now+=ms;for(const t of [...timers])if(!t.cancelled&&t.at<=now){t.cancelled=true;t.fn();}},dispose(){port.dispose();shell.dispose();}};}
async function loaded(r,items){r.port.open();r.requests.at(-1).resolve(ok(snapshot(items)));await tick();}
test('Ideas host workspace is signed-in only and is not a WidgetRoute',()=>{const r=rig(false);r.port.open();assert.equal(r.requests.length,0);assert.equal(r.shell.view().workspace,undefined);assert.equal(asPrimaryRoute('shell.ideas'),null);r.session(true);r.port.open();assert.equal(r.requests.length,1);r.dispose();});
test('Ideas lazy load is one-flight; manual refresh never starts background polling',async()=>{const r=rig();assert.equal(r.requests.length,0);r.port.open();await r.port.refresh();r.port.open();assert.equal(r.requests.length,1);r.requests[0].resolve(ok(snapshot()));await tick();r.advance(1000);assert.equal(r.requests.length,1);r.port.close();r.port.open();assert.equal(r.requests.length,2);r.dispose();});
test('Ideas loaded selection requires fresh exact id revision and digest from current list',async()=>{
 for(const patch of [{id:'foreign'},{revision:2},{snapshotHash:'b'.repeat(64)}]){const r=rig();await loaded(r);await r.port.read('foreign');assert.equal(r.requests.length,1);const p=r.port.read('result-one');assert.equal(r.port.view().rows.length,0);r.requests[1].resolve(ok(snapshot([row(patch)])));await p;assert.equal(r.port.view().detail,null);assert.match(r.port.view().notice,/больше недоступен/);r.dispose();}
 const r=rig();await loaded(r);const p=r.port.read('result-one');r.requests[1].resolve(ok(snapshot()));await p;assert.equal(r.port.view().detail.key,'result-one');r.port.back();assert.equal(r.port.view().detail,null);r.dispose();
});
test('Ideas source invalidation stays unavailable, never substituted by a successful old result',async()=>{const r=rig();await loaded(r);const p=r.port.read('result-one');r.requests[1].resolve(ok(snapshot([row({current:false,available:false})])));await p;assert.equal(r.port.view().detail.available,false);assert.equal(r.port.view().detail.current,false);r.dispose();});
test('Ideas missing selected row and denial clear previous details',async()=>{for(const answer of [ok(snapshot([])),{ok:false,failure:{reason:'forbidden'}}]){const r=rig();await loaded(r);const p=r.port.read('result-one');r.requests[1].resolve(answer);await p;assert.equal(r.port.view().detail,null);assert.equal(r.port.view().rows.length,0);assert.ok(r.port.view().notice);r.dispose();}});
test('Ideas late response cannot survive session replacement, close or disposal',async()=>{for(const boundary of ['session','close','dispose']){const r=rig();await loaded(r);const p=r.port.read('result-one');const q=r.requests[1];if(boundary==='session')r.session(true);if(boundary==='close')r.port.close();if(boundary==='dispose')r.port.dispose();q.resolve(ok(snapshot()));await p;assert.equal(r.port.view().detail,null,boundary);assert.deepEqual(r.port.view().rows,[],boundary);assert.equal(q.signal.aborted,true);r.dispose();}});
test('Ideas expiry removes both rows and open detail without any request or renewed validity',async()=>{const r=rig();await loaded(r,[row({expiresAt:'2026-10-14T09:00:01.000Z'})]);const p=r.port.read('result-one');r.requests[1].resolve(ok(snapshot([row({expiresAt:'2026-10-14T09:00:01.000Z'})])));await p;r.advance(1000);assert.equal(r.port.view().detail,null);assert.equal(r.port.view().rows.length,0);await r.port.read('result-one');assert.equal(r.requests.length,2);assert.match(r.port.view().notice,/истёк/);r.dispose();});
test('Ideas already expired response is not displayed as empty success',async()=>{const r=rig();await loaded(r,[row({expiresAt:'2026-10-14T08:59:59.000Z'})]);assert.equal(r.port.view().rows.length,0);assert.match(r.port.view().notice,/истёк/);r.dispose();});
test('Ideas rate limit delays manual retry and never retries automatically',async()=>{const r=rig();r.port.open();r.requests[0].resolve({ok:false,failure:{reason:'rate_limited',retryAfterSec:4}});await tick();await r.port.refresh();assert.equal(r.requests.length,1);r.advance(4000);assert.equal(r.port.view().retryAt,null);assert.equal(r.requests.length,1);const p=r.port.refresh();r.requests[1].resolve(ok(snapshot()));await p;assert.equal(r.port.view().phase,'ready');r.dispose();});

const observed=(patch={}, valuePatch={})=>row({basis:'confirmed_cash',currency:'RUB',rule:{key:'c8.value/cash',version:1},values:[{key:'cash',type:'observed',value:'9007199254740993',unit:'money_minor',basis:'confirmed_cash',currency:'RUB',...valuePatch}],...patch});
const found=x=>snapshot([x]).rows[0].finding;
const policy=(patch={},valuePatch={})=>row({kind:'POLICY_SIGNAL',subject:{kind:'client',id:'PRIVATE'},basis:'proven_attendance_policy',currency:null,rule:{key:'c8.dormancy/cadence',version:1},values:[{key:'cadence',type:'policy',value:false,unit:'boolean',basis:'proven_attendance_policy',currency:null,...valuePatch}],...patch});
const scenario=(patch={},valuePatch={})=>row({kind:'SCENARIO',subject:{kind:'appointment',id:'PRIVATE'},basis:'booked_value',currency:'RUB',rule:{key:'c8.scenario/booked_appointment',version:1},horizonEnd:'2026-10-15T08:00:00.000Z',values:[{key:'conditional_booked_value',type:'scenario',value:'-150',unit:'money_minor',basis:'booked_value',currency:'RUB',...valuePatch}],...patch});
test('Ideas values preserve exact zero negative huge counts and independent currency without private data',()=>{
 for(const value of ['0','-150','9007199254740993','1'.repeat(240)])assert.equal(found(observed({}, {value})).value,value);
 for(const basis of ['confirmed_cash','confirmed_refunds','confirmed_cash_net_linked_refunds','booked_value','provider_reported_gross'])assert.equal(found(observed({basis},{basis})).basis,basis);
 assert.deepEqual(found(observed({basis:'observed_attended_count',currency:null},{basis:'observed_attended_count',currency:null,unit:'count',value:'3'})),{kind:'observation',basis:'observed_attended_count',currency:null,value:'3'});
 assert.equal(found(observed({currency:'JPY'},{currency:'JPY'})).currency,'JPY');
 assert.ok(!/PRIVATE|rule|key|sourceRef/.test(JSON.stringify(found(observed()))));
});
test('Ideas values reject missing duplicate nonintegral unbounded and coerced scalars without inventing zero',()=>{
 for(const value of [null,0,false,'','1.2','01','1e6','NaN','Infinity',' 1','1'.repeat(241)])assert.equal(found(observed({}, {value})).kind,'invalid',String(value));
 for(const values of [[],[{},{}],null,[null],[...observed().values,...observed().values]])assert.equal(found(observed({values})).kind,'invalid');
 for(const patch of [{type:'scenario'},{key:'other'},{unit:'count'},{basis:'booked_value'},{currency:'USD'}])assert.equal(found(observed({},patch)).kind,'invalid');
 assert.equal(found(observed({currency:null},{currency:null})).kind,'invalid');
 assert.equal(found(observed({basis:'observed_attended_count'},{basis:'observed_attended_count',unit:'count'})).kind,'invalid');
});
test('Ideas values require current available qualified covered versioned released meaning',()=>{
 for(const patch of [{available:false},{available:false,current:false},{qualification:'UNQUALIFIED'},{completeness:'UNAVAILABLE'},{completeness:'NOT_MEASURED'}])assert.deepEqual(found(observed(patch)),{kind:'unavailable'});
 assert.equal(found(observed({qualification:'SOURCE_LABELLED'})).kind,'observation');
 for(const patch of [{rule:null},{rule:{key:'c8.value/cash',version:2}},{rule:{key:'forecast',version:1}},{kind:'RANKING'},{kind:'POLICY_SIGNAL'}])assert.equal(found(observed(patch)).kind,'unsupported');
 assert.equal(found(observed({basis:'clv'},{basis:'clv'})).kind,'unsupported');
 assert.equal(found(observed({kind:'PREDICTION',available:false})).kind,'unavailable');
});
test('Ideas policy uses literal boolean and exact verified client dormancy with no inferred threshold',()=>{
 for(const value of [true,false])assert.deepEqual(found(policy({}, {value})),{kind:'policy',met:value,parameters:null});
 for(const patch of [{subject:{kind:'tenant'}},{qualification:'SOURCE_LABELLED'},{basis:'confirmed_cash'},{currency:'RUB'}])assert.equal(found(policy(patch)).kind,'invalid');
 for(const patch of [{value:'false'},{value:0},{type:'observed'},{key:'another'},{unit:'count'},{currency:'RUB'}])assert.equal(found(policy({},patch)).kind,'invalid');
 assert.ok(!/30|threshold|PRIVATE/.test(JSON.stringify(found(policy()))));
});
test('Ideas scenario is exact appointment conditional value with explicit valid horizon',()=>{
 assert.deepEqual(found(scenario()),{kind:'scenario',value:'-150',currency:'RUB',horizonEnd:'2026-10-15T08:00:00.000Z'});
 for(const patch of [{subject:{kind:'client'}},{basis:'confirmed_cash'},{horizonEnd:null},{horizonEnd:'invalid'},{horizonEnd:'2026-10-14T08:00:00.000Z'},{horizonEnd:'2026-10-13T08:00:00.000Z'},{currency:null}])assert.equal(found(scenario(patch)).kind,'invalid');
 for(const patch of [{key:'other'},{type:'observed'},{unit:'count'},{value:'1.50'}])assert.equal(found(scenario({},patch)).kind,'invalid');
 assert.equal(found(scenario({rule:{key:'c8.scenario/future_revenue',version:1}})).kind,'unsupported');
});
test('Ideas value disappears on fresh unavailable response instead of retaining previous amount',async()=>{const r=rig();await loaded(r,[observed()]);assert.equal(r.port.view().rows[0].finding.kind,'observation');const p=r.port.read('result-one');r.requests[1].resolve(ok(snapshot([observed({available:false,current:false})])));await p;assert.deepEqual(r.port.view().detail.finding,{kind:'unavailable'});assert.ok(!JSON.stringify(r.port.view()).includes('9007199254740993'));r.dispose();});

const params=(patch={})=>({elapsed:{unit:'day',count:37},comparison:'gt',evidence:'proven_attendance',minimumCoverage:'PARTIAL',serviceScope:{restricted:false,count:0},timezone:'Europe/Moscow',...patch});
const withParams=(parameters=params(),patch={})=>policy({rule:{key:'c8.dormancy/cadence',version:1,parameters},...patch});
test('Ideas parameters preserve exact day month threshold comparison coverage and finite service scope',()=>{
 for(const unit of ['day','calendar_month'])for(const comparison of ['gt','gte'])for(const minimumCoverage of ['PARTIAL','COMPLETE'])for(const count of [0,1,100]) {
  const p=params({elapsed:{unit,count:37},comparison,minimumCoverage,serviceScope:{restricted:count>0,count}});
  assert.deepEqual(found(withParams(p)),{kind:'policy',met:false,parameters:p});
 }
 const p=params({elapsed:{unit:'day',count:Number.MAX_SAFE_INTEGER}});assert.equal(found(withParams(p)).parameters.elapsed.count,Number.MAX_SAFE_INTEGER);
});
test('Ideas parameters reject missing unknown nested or coercible contract fields without defaults',()=>{
 for(const key of Object.keys(params())){const p=params();delete p[key];assert.equal(found(withParams(p)).parameters,null,key);}
 const bad=[null,[],{},params({extra:'PRIVATE'}),params({elapsed:{unit:'day',count:3,extra:'PRIVATE'}}),params({serviceScope:{restricted:false,count:0,ids:['PRIVATE']}}),params({comparison:'eq'}),params({evidence:'phone_match'}),params({minimumCoverage:'ANY'})];
 for(const unit of ['month','hour','days',null])bad.push(params({elapsed:{unit,count:2}}));
 for(const count of [0,-1,1.2,'37',false,null,Number.MAX_SAFE_INTEGER+1])bad.push(params({elapsed:{unit:'day',count}}));
 for(const p of bad){assert.equal(found(withParams(p)).parameters,null,JSON.stringify(p));assert.equal(found(withParams(p)).met,false);}
});
test('Ideas parameters require consistent bounded service restrictions and exact usable source timezone',()=>{
 for(const scope of [{restricted:true,count:0},{restricted:false,count:1},{restricted:'true',count:1},{restricted:true,count:101},{restricted:false,count:-1},{restricted:true,count:1.2},{restricted:true,count:'1'}])assert.equal(found(withParams(params({serviceScope:scope}))).parameters,null);
 for(const timezone of ['UTC','Europe/NoSuchPlace',' Europe/Moscow ','',null])assert.equal(found(withParams(params({timezone}))).parameters,null);
 const invalidPeriod={...row().period,timezone:'Europe/NoSuchPlace'};assert.equal(found(withParams(params({timezone:invalidPeriod.timezone}),{period:invalidPeriod})).parameters,null);
 assert.equal(found(withParams(params({timezone:'UTC'}),{period:{...row().period,timezone:'UTC'}})).parameters.timezone,'UTC');
});
test('Ideas parameters cannot escape policy validity or appear on other result kinds',()=>{
 for(const patch of [{available:false},{available:false,current:false},{qualification:'UNQUALIFIED'},{qualification:'SOURCE_LABELLED'},{completeness:'UNAVAILABLE'},{subject:{kind:'tenant'}},{rule:{key:'c8.dormancy/cadence',version:2,parameters:params()}}])assert.ok(!JSON.stringify(found(withParams(params(),patch))).includes('37'));
 const x=observed({rule:{key:'c8.value/cash',version:1,parameters:params()}});assert.ok(!JSON.stringify(found(x)).includes('parameters'));
});
test('Ideas parameters are reread with same selected result and never reused after absence invalidation or expiry',async()=>{
 const r=rig();await loaded(r,[withParams()]);let p=r.port.read('result-one');r.requests[1].resolve(ok(snapshot([withParams()])));await p;assert.equal(r.port.view().detail.finding.parameters.elapsed.count,37);
 r.port.back();p=r.port.read('result-one');r.requests[2].resolve(ok(snapshot([withParams(null)])));await p;assert.equal(r.port.view().detail.finding.parameters,null);
 r.port.back();p=r.port.read('result-one');r.requests[3].resolve(ok(snapshot([withParams(params(),{available:false,current:false})])));await p;assert.deepEqual(r.port.view().detail.finding,{kind:'unavailable'});r.dispose();
 const exp=rig();await loaded(exp,[withParams(params(),{expiresAt:'2026-10-14T09:00:01.000Z'})]);exp.advance(1000);assert.deepEqual(exp.port.view().rows,[]);assert.equal(exp.port.view().detail,null);exp.dispose();
});
