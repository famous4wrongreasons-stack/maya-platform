// Preserve the existing main/bootstrap, HTTP guards, validation and CORS exactly.
// Hook only construction of this isolated application's restrictive AI adapter.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readPhoneAiScope} from './phone-ai-scope.mjs';
import {installPhoneAi} from './phone-ai-runtime.mjs';
const require=createRequire(import.meta.url),file='/run/maya/phone-ai-scope.json';
try{
  assert.equal(process.cwd(),'/app');
  const pin=process.env.MAYA_PHONE_AI_SCOPE_SHA256;
  const scope=readPhoneAiScope(file,pin);assert.equal(process.env.MAYA_RELEASE,scope.candidate);
  const nativeFetch=globalThis.fetch;
  const {NestFactory}=require('@nestjs/core');const original=NestFactory.create.bind(NestFactory);
  let once=false;
  NestFactory.create=async(...args)=>{
    assert.equal(once,false);once=true;const app=await original(...args);
    const installed=await installPhoneAi({app,require,backend:'/app',scope,assertCurrent:()=>readPhoneAiScope(file,pin),nativeFetch,
      relayFetch:(init)=>nativeFetch('http://model-egress:8081/chat/completions',{method:'POST',body:init.body,signal:init.signal,redirect:'error',headers:{'content-type':'application/json','x-maya-scope':pin,'x-maya-tenant':scope.tenantId,'x-maya-user':scope.userId}})});
    globalThis.fetch=installed.fetch;
    for(const event of ['SIGTERM','SIGINT'])process.once(event,()=>installed.stop());
    return app;
  };
  require('/app/dist/src/main.js');
}catch{console.error('PHONE AI STARTUP REFUSED');process.exitCode=1;}
