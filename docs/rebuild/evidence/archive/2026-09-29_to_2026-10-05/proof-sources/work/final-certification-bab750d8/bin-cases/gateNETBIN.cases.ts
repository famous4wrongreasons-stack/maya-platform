import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import { CalendarSource, UserRole } from '/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/work/maya-controlled-integration/maya-saas-backend/src/common/domain.enums';
export const cases=[{id:'FBE2E-CANONICAL-NET-BIN',gate:'integration',proofClass:'INTEGRATION',async run(ctx:any){
 const observations=[];
 for(const mode of ['personal','journal']){
  const tenant=await ctx.fixtures.tenant('Canonical network BIN source',CalendarSource.INTERNAL);
  const user=await ctx.fixtures.user(tenant,mode==='personal'?UserRole.CLIENT:UserRole.TENANT_OWNER);
  if(mode==='personal')await ctx.fixtures.bookingSource(tenant,user);
  for(const feature of ['widgets.runtime','ai.consultant','ai.owner','booking','booking.customer_app','crm.integration'])await ctx.fixtures.grantFeature(tenant,feature);
  const login=await ctx.request('/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tenantSlug:tenant.slug,email:user.email,password:user.password})});
  assert.equal(login.status,201);
  const accessToken=login.body.access_token;
  const initial=await ctx.request('/ai/tools/'+(mode==='personal'?'catalog.services.read':'operations.journal.read')+'/execute',{method:'POST',headers:{'content-type':'application/json',authorization:'[REDACTED]'+accessToken,'x-request-id':randomUUID()},body:JSON.stringify({surface:'web',arguments:mode==='personal'?{}:{date:'2026-09-24'}})});
  assert.equal(initial.status,201);
  const observed:any=await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,['/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/work/final-certification-bab750d8/probes/source-net-return.mjs'],{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
   child.stdout.on('data',v=>stdout+=v.toString());child.stderr.on('data',v=>stderr+=v.toString());child.once('error',reject);child.once('close',code=>code===0?resolve(JSON.parse(stdout)):reject(new Error(stderr)));
   child.stdin.end(JSON.stringify({mode,baseUrl:ctx.apiBase.replace(/\/api$/,''),accessToken,tenantName:tenant.slug,login:{business:tenant.slug,email:user.email,password:user.password},envelope:initial.body.resolution.receipt.envelope}));
  });
  assert.equal(observed.realCanonicalNet,true);
  if(mode==='personal'){
   assert.equal(observed.createRescheduleCancel,true);assert.equal(observed.allCommitsRan14Gates,true);
   const state=await ctx.fixtures.bookingProofState(tenant);assert.equal(state.appointments.length,1);assert.equal(state.appointments[0].status,'canceled');assert.equal(state.executions.length,3);
  }else assert.equal(observed.roundTripPassed,true);
  observations.push(observed);
 }
 fs.writeFileSync(process.env.GITHUB_SOURCE_PROBE_OUT!,JSON.stringify({contract:'maya.canonical-net-bin-integration/1',observations},null,2)+'\n');
}}];
