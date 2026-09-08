// Read-only source reconciliation. Actual upstream services; synthetic in-memory
// repositories and an already-authenticated channel precondition. No DB/network.
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {createRequire}=require('node:module');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const repo=resolve(__dirname,'../../..'),snapshot=resolve(process.argv[2]||''),backend=resolve(snapshot,'maya-saas-backend');
assert(snapshot.includes('upstream-b6c53ff9'));
const revision='b6c53ff9ee31bb43d0419f5ce32aa6b0e4999ae0';
const files=['src/crm/maya-user-client-association-issuer.ts','src/crm/client-channel-runtime.service.ts','src/crm/client-profile-read.architecture.ts','src/customers/customers.controller.ts'];
const hashes={};for(const file of files){const actual=readFileSync(resolve(backend,file)),expected=execFileSync('git',['show',`${revision}:maya-saas-backend/${file}`],{cwd:repo});assert.deepEqual(actual,expected);hashes[file]=createHash('sha256').update(actual).digest('hex');}
const req=createRequire(resolve(backend,'package.json'));req('ts-node').register({project:resolve(backend,'tsconfig.json'),transpileOnly:true});req('reflect-metadata');
const {ClientChannelRuntimeService}=req(resolve(backend,'src/crm/client-channel-runtime.service.ts'));
const {scanClientProfileRead}=req(resolve(backend,'src/crm/client-profile-read.architecture.ts'));
const checks=[];
function fixture(profileClientId=null){
 const tenantId='synthetic-tenant',userId='synthetic-user',clientId='synthetic-client',now=new Date(),writes=[];
 const channel={tenantId,userId,provider:'maya_user',providerSubjectHash:'a'.repeat(64),channelControlProofHash:'b'.repeat(64),validUntil:new Date(now.getTime()+600000),deliveryAddress:userId};
 const context={requireTenantId:()=>tenantId,assertTenantId:v=>{assert.equal(v,tenantId);return v;}},channels={authenticate:async()=>channel};
 const client={id:clientId,userId,tenantId,mergedIntoClientId:null,crmLinks:[]};let profiles=[{id:'synthetic-profile',userId,clientId:profileClientId}];
 const tx={$queryRaw:async query=>String(query.sql).includes('clock_timestamp')?[{now}]:[],clientChannelLink:{findMany:async()=>[]},client:{findMany:async()=>[{id:clientId,userId}],findUnique:async()=>client},customerProfile:{findMany:async()=>profiles},clientLinkChallenge:{create:async({data})=>{writes.push(data);return{id:'synthetic-challenge',...data};}}};
 const prisma={$transaction:async work=>work(tx)},encryption={opaqueReference:(domain,value)=>createHash('sha256').update(domain+'\0'+value).digest('hex')};
 const runtime=new ClientChannelRuntimeService(prisma,context,channels,encryption,{}, {}, {});
 return{runtime,tx,writes,channel,profiles:set=>profiles=set};
}
async function main(){
 const nullProfile=fixture(null),result=await nullProfile.runtime.issue('authenticated-maya-session-proof');
 assert.equal(nullProfile.writes.length,1);assert.equal(result.token.length,43);assert.equal(nullProfile.writes[0].clientId,'synthetic-client');
 assert.equal(nullProfile.writes[0].issuanceEvidenceJson.resolver,'a18.maya-user-client-association.v1');
 checks.push({id:'U1_NULL_CLIENT_PROFILE',observation:'CHALLENGE_ISSUED',expectedApprovedContract:'DENY_WITHOUT_PROVEN_CLIENT_AUTHORITY',clientUserFk:true,profileUserFk:true,profileClientFk:null,provenClientAuthorityEvidenceSupplied:false,syntheticChallengeWrites:1});
 const linkedProfile=fixture('synthetic-client');await linkedProfile.runtime.issue('authenticated-maya-session-proof');assert.equal(linkedProfile.writes.length,1);
 checks.push({id:'U1_MATCHING_FKS_NO_PROVENANCE',observation:'CHALLENGE_ISSUED',independentProvenanceSupplied:false});
 const absent=fixture();absent.profiles([]);await assert.rejects(absent.runtime.issue('authenticated-maya-session-proof'));assert.equal(absent.writes.length,0);
 const conflict=fixture('different-client');await assert.rejects(conflict.runtime.issue('authenticated-maya-session-proof'));assert.equal(conflict.writes.length,0);
 const telegram=fixture();telegram.channel.provider='telegram';telegram.channel.userId=null;await assert.rejects(telegram.runtime.issue('authenticated-telegram-proof'));assert.equal(telegram.writes.length,0);
 checks.push({id:'EXISTING_NEGATIVE_CHECKS',missingProfileDenied:true,conflictingProfileDenied:true,telegramBootstrapDenied:true});
 const calls=[];
 const compatibility=Object.assign(Object.create(ClientChannelRuntimeService.prototype),{prisma:{$transaction:async work=>work({})},status:async()=>({linked:true}),resolve:async()=>({tenantId:'synthetic-tenant',clientId:'synthetic-client',linkId:'synthetic-link'}),submitConsent:async(proof,input)=>{calls.push(input);return input;}});
 for(const marketingConsent of [true,false,true])await compatibility.submitLegacyNativeConsent('authenticated-maya-session-proof',{privacyConsent:true,marketingConsent});
 assert.equal(calls[0].idempotencyKey,calls[2].idempotencyKey);assert.notEqual(calls[0].idempotencyKey,calls[1].idempotencyKey);
 checks.push({id:'U2_LEGACY_DECISION_CYCLE',inputSequence:['grant','revoke','new grant'],firstAndThirdKeyEqual:true,distinctLogicalIntentAvailable:false,note:'Key collision reproduced; actual ledger was not invoked in this check. Existing canonical Wave3 planner treats the same source key as replay.'});
 const issuer=readFileSync(resolve(backend,files[0]),'utf8');assert.deepEqual(scanClientProfileRead('crm/maya-user-client-association-issuer.ts',issuer),[]);
 checks.push({id:'UPSTREAM_RATCHET_BLIND_SPOT',upstreamProfileReadGuardAcceptsIssuer:true,guardProvesProvenance:false});
 console.log(JSON.stringify({reviewedRevision:revision,sourceHashes:hashes,result:'CONTRACT_CONFLICT_REPRODUCED',checks,databaseConnections:0,networkCalls:0,productionEffects:0,runtimeFilesChanged:0},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
