// Additional staging restrictions around the unchanged compiled AppModule.
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { PHONE_AI_TOOLS, assertPhoneAiActor, assertPhoneAiPayload } from './phone-ai-scope.mjs';
export async function installPhoneAi({app,require,backend,scope,assertCurrent,relayFetch,nativeFetch}) {
  const load=file=>require(path.join(backend,'dist/src',file));
  const {ConfigService}=require('@nestjs/config');const {ForbiddenException}=require('@nestjs/common');
  const p=app.get(load('prisma/prisma.service.js').PrismaService);
  const core=app.get(load('ai-tools/ai-core.service.js').AiCoreService);
  const tools=app.get(load('ai-tools/ai-tool-runtime.service.js').AiToolRuntimeService);
  const engine=app.get(load('action-engine/action-engine.runtime.js').ActionEngineRuntimeService);
  const config=app.get(ConfigService), context=new AsyncLocalStorage();let busy=false,stopped=false;
  const refuse=()=>{throw new ForbiddenException({error:{code:'phone_ai_scope_refused'}});};
  const current=async user=>{
    assert.ok(!stopped,'phone_ai_stopped');assertCurrent();assertPhoneAiActor(user,scope);
    const [tenant,owner,membership,branch]=await Promise.all([
      p.tenant.findUnique({where:{id:scope.tenantId},select:{slug:true,status:true}}),
      p.user.findUnique({where:{id:scope.userId},select:{tenantId:true,role:true,status:true}}),
      p.membership.findFirst({where:{tenantId:scope.tenantId,userId:scope.userId,role:'tenant_owner',status:'active'},select:{id:true}}),
      p.branch.findUnique({where:{id:scope.branchId},select:{tenantId:true}}),
    ]);
    assert.ok(tenant?.slug===scope.tenantSlug&&['trial','active'].includes(tenant.status)&&owner?.tenantId===scope.tenantId&&owner.role==='tenant_owner'&&owner.status==='active'&&membership&&branch?.tenantId===scope.tenantId,'phone_ai_current_owner');
  };
  const chat=core.chat.bind(core);
  core.chat=async(user,body)=>{
    try{await current(user);assert.ok(!busy&&['web','native'].includes(body.surface),'phone_ai_busy');}catch{return refuse();}
    busy=true;const turn={user,active:true};
    try{return await context.run(turn,()=>chat(user,body));}finally{turn.active=false;busy=false;}
  };
  const list=tools.listTools.bind(tools);
  tools.listTools=async(...args)=>{await current(args[0]);const out=await list(...args);return {...out,tools:out.tools.filter(t=>PHONE_AI_TOOLS.includes(t.name))};};
  for(const method of ['execute','replayCompletedRead']){
    const original=tools[method].bind(tools);
    tools[method]=async(...args)=>{
      const turn=context.getStore();if(!turn?.active||!PHONE_AI_TOOLS.includes(args[1]))return refuse();
      assertPhoneAiActor(args[0],scope);await current(turn.user);return original(...args);
    };
  }
  // Provider catalogue-only transport is the second, independent write refusal.
  for(const name of ['execute','executeWithReceipt']){assert.equal(typeof engine[name],'function');engine[name]=refuse;}
  for(const [key,value]of Object.entries({AI_CORE_PROVIDER:'deepseek',DEEPSEEK_API_KEY:'PHONE_RELAY_NOT_A_PROVIDER_CREDENTIAL',DEEPSEEK_AI_CORE_MODEL:'deepseek-v4-pro',DEEPSEEK_BASE_URL:'https://api.deepseek.com',AI_CORE_MAX_OUTPUT_TOKENS:'2048'}))config.set(key,value);
  return {stop(){stopped=true;config.set('AI_CORE_PROVIDER','safe');},async fetch(raw,init){
    const url=String(raw);
    if(!['https://api.deepseek.com/chat/completions','https://api.deepseek.com/v1/chat/completions'].includes(url))return nativeFetch(raw,init);
    const turn=context.getStore();assert.ok(turn?.active,'phone_ai_model_context');await current(turn.user);assertPhoneAiPayload(init);
    const response=await relayFetch(init,scope);await current(turn.user);return response;
  }};
}
