import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createReadTrace, traceHttpRequest, projectReadTrace } from './local-yclients-read-status.mjs';
const nativeRequire = createRequire(import.meta.url);
const express = nativeRequire('express');
const codes = ['crm_credentials_rejected','crm_company_not_found','crm_provider_unreachable','crm_platform_configuration_error','crm_connection_failed'];
const req = route => ({ method: route === 'operation' ? 'GET' : 'POST', originalUrl: '/api/integrations/crm/' + route });
function fixture(route='connect', status=400, refusal=null) {
 const events=[]; const response=new EventEmitter(); response.statusCode=status;
 response.app={get:()=>undefined}; response.get=()=>null; response.set=()=>response;
 response.json=express.response.json;
 let wire;
 response.send=function(body){wire=body;this.emit('finish');return this;};
 traceHttpRequest(req(route),response,createReadTrace(event=>events.push(event)),refusal);
 return {events,response,wire:()=>wire};
}
test('actual Express JSON emits each canonical code without retaining other response fields',()=>{
 for(const route of ['connect','activate']) for(const code of codes){
  const f=fixture(route);const body={error:{code,provider:'yclients',private:'PRIVATE_SECRET'},message:'PRIVATE_PROVIDER_MESSAGE',id:'PRIVATE_ID'};
  assert.equal(f.response.json(body),f.response);
  assert.equal(f.wire(),JSON.stringify(body));
  assert.equal(f.events[1].code,code);assert.equal(f.events[1].status,400);
  assert.equal(JSON.stringify(f.events).includes('PRIVATE'),false);
  assert.deepEqual(projectReadTrace(f.events[1]),f.events[1]);
 }
});
test('unknown, malformed, inherited and accessor fields are not diagnostics',()=>{
 let reads=0;
 const accessor={get error(){reads++;return {code:codes[0]};}};
 for(const body of [null,[], 'PRIVATE_RAW', {error:{code:'PRIVATE_CODE'}}, {error:{code:codes[0]+'PRIVATE'}}, Object.create({error:{code:codes[0]}}), {error:Object.create({code:codes[0]})}, accessor, {error:{get code(){reads++;return codes[0];}}}]){
  const response=new EventEmitter();response.statusCode=400;response.json=function(value){this.emit('finish');return value;};
  const events=[];traceHttpRequest(req('connect'),response,createReadTrace(e=>events.push(e)));
  assert.equal(response.json(body),body);assert.equal(events[1].code,null);
 }
 assert.equal(reads,0);
});
test('success, unrelated status routes, refusal precedence and closed responses retain original semantics',()=>{
 for(const [route,status,refusal,expected] of [['connect',200,null,null],['operation',400,null,null],['connect',403,'local_yclients_read_route_disabled','local_yclients_read_route_disabled']]){
  const f=fixture(route,status,refusal);f.response.json({error:{code:codes[0]}});assert.equal(f.events[1].code,expected);
 }
 const f=fixture();f.response.emit('close');f.response.json({error:{code:codes[0]}});assert.equal(f.events.length,2);assert.equal(f.events[1].code,'response_closed');
});
test('wrapper preserves receiver, all arguments, return value and thrown application error',()=>{
 const response=new EventEmitter();response.statusCode=400;
 const body={error:{code:codes[0]}};const sentinel={};const appError=new Error('PRIVATE_APP_ERROR');let seen;
 response.json=function(...args){seen={receiver:this,args};return sentinel;};
 traceHttpRequest(req('connect'),response,createReadTrace(()=>{}));
 assert.equal(response.json(body,'second'),sentinel);assert.equal(seen.receiver,response);assert.deepEqual(seen.args,[body,'second']);
 const broken=new EventEmitter();broken.statusCode=400;broken.json=()=>{throw appError;};
 traceHttpRequest(req('connect'),broken,createReadTrace(()=>{}));assert.throws(()=>broken.json(body),e=>e===appError);
});
test('closed observer failure cannot change Express response result',()=>{
 const response=new EventEmitter();response.statusCode=400;response.json=()=>response;
 traceHttpRequest(req('connect'),response,createReadTrace(()=>{throw Error('PRIVATE_OBSERVER');}));
 assert.equal(response.json({error:{code:codes[0]}}),response);assert.doesNotThrow(()=>response.emit('finish'));
});
