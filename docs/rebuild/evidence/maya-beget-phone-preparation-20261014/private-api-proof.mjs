import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import net from 'node:net';
const checks=[];const check=(name,value)=>{assert.ok(value,name);checks.push(name)};
const request=async(route,body,token,method=body?'POST':'GET',origin='capacitor://localhost')=>{
 const r=await fetch('http://127.0.0.1:3000/api'+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(method==='OPTIONS'?{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Authorization,Content-Type'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
 let data;try{data=await r.json()}catch{}return {status:r.status,data,headers:r.headers};
};
try{
 check('exact candidate',(await request('/health')).data.release===process.env.MAYA_RELEASE);
 check('database readiness',(await request('/health/ready')).data.checks.database==='ready');
 check('anonymous access refused',(await request('/branches')).status===401);
 const cors=await request('/auth/login',undefined,undefined,'OPTIONS');
 check('native CORS',cors.status===204&&cors.headers.get('access-control-allow-origin')==='capacitor://localhost');
 check('foreign origin refused',!(await request('/health',undefined,undefined,'GET','https://foreign.invalid')).headers.get('access-control-allow-origin'));
 const denied=await new Promise(resolve=>{const s=net.connect({host:'192.0.2.1',port:443});s.on('connect',()=>{s.destroy();resolve('CONNECTED')});s.on('error',e=>resolve(e.code));setTimeout(()=>{s.destroy();resolve('TIMEOUT')},3000).unref()});
 check('external network route refused',['ENETUNREACH','EHOSTUNREACH'].includes(denied));
 const accounts=[];
 for(const name of ['a','b']){
  const slug='phone-beget-'+name+'-'+randomBytes(6).toString('hex');const email=slug+'@example.invalid',password=randomBytes(24).toString('hex');
  const activation=await request('/onboarding/trial-activations',{source:'web'});check('normal trial activation '+name,activation.status===201);
  const signup=await request('/onboarding/trial',{trialActivationToken:activation.data.activation_token,name:'Synthetic phone test '+name,slug,ownerEmail:email,password,branchName:'Synthetic branch',branchTimezone:'Europe/Moscow',calendarSource:'external'});
  check('normal trial signup '+name,signup.status===201&&signup.data.trial_activation.status==='completed');
  const login=await request('/auth/login',{tenantSlug:slug,email,password});check('password login '+name,[200,201].includes(login.status)&&typeof login.data.access_token==='string');
  const token=login.data.access_token;const branches=await request('/branches',undefined,token);check('one own branch '+name,branches.status===200&&branches.data.length===1);
  for(const route of ['/ai/conversation','/inbox','/owner-reports','/operational-work'])check('read '+name+route,(await request(route,undefined,token)).status===200);
  const ideas=await request('/analytics/valuations',undefined,token);check('trial Ideas stays refused '+name,ideas.status===403&&ideas.data.message==='measurement_membership_revoked');
  check('tenant owner has no platform authority '+name,(await request('/health/metrics',undefined,token)).status===403);
  accounts.push({slug,email,password,token,refresh:login.data.refresh_token,branch:branches.data[0]});
 }
 const [a,b]=accounts;check('independent tenants',a.branch.tenant_id!==b.branch.tenant_id);
 check('cross-tenant login refused',[401,403].includes((await request('/auth/login',{tenantSlug:b.slug,email:a.email,password:a.password})).status));
 const turn=await request('/ai/chat',{surface:'web',requestId:'phone-'+randomBytes(12).toString('hex'),messages:[{role:'user',content:'Стоп, ничего не делай'}]},a.token);
 check('safe canonical chat',[200,201].includes(turn.status));
 const ha=await request('/ai/conversation',undefined,a.token),hb=await request('/ai/conversation',undefined,b.token);
 check('tenant conversation isolated',ha.data.turns.length===2&&hb.data.turns.length===0);
 const substituted=await request('/ai/chat',{surface:'web',requestId:'foreign-'+randomBytes(12).toString('hex'),conversationId:ha.data.conversationId,messages:[{role:'user',content:'Стоп, ничего не делай'}]},b.token);
 check('foreign conversation refused',[400,403,404,409].includes(substituted.status));
 const refreshed=await request('/auth/refresh',{refreshToken:a.refresh});check('refresh',[200,201].includes(refreshed.status)&&typeof refreshed.data.access_token==='string');
 check('logout',[200,201].includes((await request('/auth/logout',{},refreshed.data.access_token)).status));
 check('revoked access refused',(await request('/branches',undefined,refreshed.data.access_token)).status===401);
 check('revoked refresh refused',[401,403].includes((await request('/auth/refresh',{refreshToken:refreshed.data.refresh_token})).status));
 console.log(JSON.stringify({status:'PASS',candidate:process.env.MAYA_RELEASE,checks,outboundRefusal:denied,realProviderCalls:0,syntheticAccounts:2,widgetGrant:false}));
}catch(e){console.log(JSON.stringify({status:'FAIL',checks,failure:e.message}));process.exitCode=1}
