// Only this private sidecar can reach the paid model. Backend has no Internet.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CandidateBudgetGate, candidateReservation, CORE_PHONE_READ_PROFILE, CORE_PHONE_READ_LIMITS} from './conversation-qualification/current-candidate-budget.mjs';
import {checkAbUsage} from './conversation-qualification/core-local-ab-checks.mjs';
import {validatePhoneAiScope, readPhoneAiScope, assertPhoneAiPayload, sha256} from './phone-ai-scope.mjs';
import {readPhoneAiContinuation} from './phone-ai-continuation.mjs';
const endpoint='https://api.deepseek.com/chat/completions';
const refused='{"error":{"code":"phone_ai_egress_refused"}}';
export function phoneAiEgress({scope:input,pin,credential,ledgerPath,assertCurrent,nativeFetch=fetch,testClock,testWait,carryForward}) {
  const clock=testClock??Date.now,scope=validatePhoneAiScope(input,clock());
  assert.match(pin,/^[a-f0-9]{64}$/);assert.match(credential,/^[A-Za-z0-9_-]{16,512}$/);
  assert.equal(typeof assertCurrent,'function');
  let revoked=false,busy=false,completed=0,refusals=0,lastTransport=null;
  const usage={promptTokens:0,completionTokens:0,totalTokens:0},controllers=new Set();
  const current=()=>{assert.ok(!revoked,'phone_ai_revoked');validatePhoneAiScope(scope,clock());assertCurrent();};
  const gate=new CandidateBudgetGate({ledgerPath,manifestSha256:pin,candidateCommit:scope.candidate,profile:CORE_PHONE_READ_PROFILE,
    ...(carryForward?{carryForward}:{}),
    mode:testClock?'OFFLINE_SYNTHETIC_ONLY':'ADMITTED_MODEL_ONLY',
    ...(testClock?{now:testClock,wait:testWait}:{assertAdmission(binding){current();assert.deepEqual(binding,{candidateCommit:scope.candidate,manifestSha256:pin,profile:CORE_PHONE_READ_PROFILE,limitsSha256:sha256(JSON.stringify(CORE_PHONE_READ_LIMITS))});}}),
    transport:async(url,init)=>{
      current();assert.equal(url,endpoint);const reserve=candidateReservation(url,init,CORE_PHONE_READ_PROFILE);
      lastTransport={stage:'dispatch',upstreamStatus:null,finishReason:null};
      const response=await nativeFetch(endpoint,{...init,redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+credential}});
      lastTransport={...lastTransport,stage:'headers',upstreamStatus:response.status};
      assert.ok(!response.redirected&&(!response.url||response.url===endpoint),'phone_ai_redirect');
      const chunks=[];let count=0;
      try{for await(const chunk of response.body??[]){current();count+=chunk.length;assert.ok(count<=CORE_PHONE_READ_LIMITS.responseBytes,'phone_ai_response_limit');chunks.push(chunk);}}
      catch(error){await response.body?.cancel().catch(()=>{});throw error;}
      current();const text=Buffer.concat(chunks).toString('utf8');
      const parsed=JSON.parse(text),finish=parsed.choices?.[0]?.finish_reason;
      lastTransport={...lastTransport,stage:'validate',finishReason:['stop','length','content_filter','tool_calls'].includes(finish)?finish:'unknown'};
      // Canonical AiCore explicitly accepts non-empty `length`, then validates
      // the plan/reply itself. Preserve those bytes; normalize only the separate
      // accounting check, which must still validate all token/cost bounds.
      const accounting=finish==='length'?JSON.stringify({...parsed,choices:parsed.choices.map((c,i)=>i===0?{...c,finish_reason:'stop'}:c)}):text;
      const actual=checkAbUsage(response.status,accounting,reserve);
      for(const key of Object.keys(usage))usage[key]+=actual[key];
      lastTransport={...lastTransport,stage:'validated'};
      return new Response(text,{status:200,headers:{'content-type':'application/json'}});
    }});
  const snapshot=()=>({contract:'maya.phone-ai-status/1',profile:CORE_PHONE_READ_PROFILE,expiresAt:scope.expiresAt,maxCalls:scope.maxCalls,maxSpendNanoUsd:scope.maxSpendNanoUsd,completed,refusals,usage:{...usage},stats:gate.stats,revoked,lastTransport});
  const server=http.createServer({maxHeaderSize:4096,requestTimeout:35000,headersTimeout:5000},async(req,res)=>{
    let controller,active=false;
    const reject=()=>{refusals++;if(!res.headersSent&&!res.destroyed)res.writeHead(403,{'content-type':'application/json','cache-control':'no-store',Connection:'close'}).end(refused);};
    try{
      if(req.method==='GET'&&req.url==='/status'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify(snapshot()));return;}
      current();assert.equal(req.method,'POST');assert.equal(req.url,'/chat/completions');
      assert.equal(req.headers['content-type'],'application/json');assert.equal(req.headers['x-maya-scope'],pin);
      assert.equal(req.headers['x-maya-tenant'],scope.tenantId);assert.equal(req.headers['x-maya-user'],scope.userId);
      assert.equal(req.headers.authorization,undefined);assert.equal(req.headers.cookie,undefined);assert.equal(req.headers.expect,undefined);
      assert.ok(!busy,'phone_ai_busy');busy=true;active=true;
      const chunks=[];let bytes=0;
      for await(const chunk of req){bytes+=chunk.length;assert.ok(bytes<=CORE_PHONE_READ_LIMITS.requestBytes,'phone_ai_request_limit');chunks.push(chunk);current();}
      const body=Buffer.concat(chunks).toString('utf8');const init={method:'POST',body};assertPhoneAiPayload(init);current();
      controller=new AbortController();controllers.add(controller);res.once('close',()=>controller.abort());
      gate.dialog();gate.turn();
      const response=await gate.fetch(endpoint,{...init,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(Math.max(1,Date.parse(scope.expiresAt)-clock()))])});
      const text=await response.text();current();assert.ok(!res.destroyed,'phone_ai_client_gone');
      completed++;res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'}).end(text);
    }catch{controller?.abort();reject();}
    finally{controllers.delete(controller);if(active){try{gate.endTurn();}catch{}busy=false;}}
  });
  server.on('checkContinue',(_req,res)=>res.writeHead(403,{Connection:'close'}).end(refused));
  server.on('checkExpectation',(_req,res)=>res.writeHead(403,{Connection:'close'}).end(refused));
  server.on('connect',(_req,socket)=>socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'));
  server.on('upgrade',(_req,socket)=>socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'));
  server.on('clientError',(_error,socket)=>socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
  const revoke=()=>{revoked=true;for(const c of controllers)c.abort();credential=undefined;};
  return {server,snapshot,revoke,check:current,close(){revoke();gate.close();}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const pin=process.env.MAYA_PHONE_AI_SCOPE_SHA256,file='/run/maya/phone-ai-scope.json';
    const scope=readPhoneAiScope(file,pin),keyFile='/run/maya/deepseek.key',stat=fs.lstatSync(keyFile);
    assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.uid===0&&(stat.mode&0o077)===0&&stat.size<=512,'phone_ai_key_file');
    const continuation=process.env.MAYA_PHONE_AI_CONTINUATION_SHA256;
    const carryForward=continuation?readPhoneAiContinuation(continuation,pin,scope):undefined;
    const app=phoneAiEgress({scope,pin,credential:fs.readFileSync(keyFile,'utf8'),ledgerPath:continuation?'/var/lib/maya-ai/continuation-1.jsonl':'/var/lib/maya-ai/ledger.jsonl',carryForward,assertCurrent:()=>{readPhoneAiScope(file,pin);if(continuation)assert.deepEqual(readPhoneAiContinuation(continuation,pin,scope),carryForward);}});
    const poll=setInterval(()=>{try{app.check();}catch{app.revoke();}},250);poll.unref();
    app.server.listen(8081,'0.0.0.0');
    for(const event of ['SIGTERM','SIGINT'])process.once(event,()=>{app.revoke();app.server.closeAllConnections();app.server.close(()=>{clearInterval(poll);app.close();});});
  }catch{console.error('PHONE AI EGRESS REFUSED');process.exitCode=1;}
}
