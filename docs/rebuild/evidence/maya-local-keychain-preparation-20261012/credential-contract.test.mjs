import test from 'node:test';
import assert from 'node:assert/strict';
import {ITEMS,HELPER,descriptor,deliverCredential} from './credential-contract.mjs';
function fixture(kind='deepseek'){
  const data=Buffer.from('SYNTHETIC_NOT_A_PROVIDER_CREDENTIAL');
  let reads=0,writes=0,clock=100;
  const controller=new AbortController();
  const admission={admissionValidated:true,helperIdentityVerified:true,helperId:HELPER,candidate:'a'.repeat(40),permitCandidate:'a'.repeat(40),ownerUid:501,readerUid:501,consumer:ITEMS[kind].consumer,purpose:ITEMS[kind].purpose,environment:'local',revoked:false,notBefore:90,expiresAt:110,explicitCredentialApproval:true};
  const store={async readExact(item,options){reads++;assert.deepEqual(item,descriptor(kind,501));assert.equal(options.interactive,false);return data;}};
  const sink={inheritedPrivatePipe:true,consumer:ITEMS[kind].consumer,async write(value){writes++;assert.equal(value.toString(),'SYNTHETIC_NOT_A_PROVIDER_CREDENTIAL');}};
  return {data,admission,store,sink,controller,run:()=>deliverCredential({kind,admission,store,sink,signal:controller.signal,now:()=>clock}),reads:()=>reads,writes:()=>writes,time:v=>{clock=v;}};
}
for(const kind of Object.keys(ITEMS))test(`${kind}: exact item, fixed consumer, no interactive read, buffer cleared`,async()=>{const f=fixture(kind);assert.deepEqual(await f.run(),{delivered:true,kind});assert.equal(f.reads(),1);assert.equal(f.writes(),1);assert(f.data.every(x=>x===0));});
for(const [name,mutate] of [
 ['missing admission',f=>{f.admission.admissionValidated=false;}],
 ['unsigned/substituted helper',f=>{f.admission.helperIdentityVerified=false;}],
 ['wrong helper',f=>{f.admission.helperId='node';}],
 ['changed candidate',f=>{f.admission.candidate='b'.repeat(40);}],
 ['foreign user',f=>{f.admission.readerUid=502;}],
 ['wrong consumer',f=>{f.admission.consumer='arbitrary-process';}],
 ['wrong purpose',f=>{f.admission.purpose='booking-write';}],
 ['production',f=>{f.admission.environment='production';}],
 ['revoked permit',f=>{f.admission.revoked=true;}],
 ['expired permit',f=>{f.time(110);}],
 ['not-yet-valid permit',f=>{f.time(89);}],
 ['storage/read not approved',f=>{f.admission.explicitCredentialApproval=false;}],
 ['stdout sink',f=>{f.sink.inheritedPrivatePipe=false;}],
 ['cancel before read',f=>{f.controller.abort();}],
])test(name,async()=>{const f=fixture();mutate(f);await assert.rejects(f.run);assert.equal(f.reads(),0);assert.equal(f.writes(),0);});
for(const code of ['locked','denied','missing-item','interaction-required'])test(`${code}: refuse without fallback`,async()=>{const f=fixture();f.store.readExact=async()=>{throw Error(code);};await assert.rejects(f.run,{message:code});assert.equal(f.writes(),0);});
test('expiry during retrieval refuses delivery and clears bytes',async()=>{const f=fixture();const read=f.store.readExact;f.store.readExact=async(...args)=>{const b=await read(...args);f.time(111);return b;};await assert.rejects(f.run);assert.equal(f.writes(),0);assert(f.data.every(x=>x===0));});
test('revoke during retrieval refuses delivery',async()=>{const f=fixture();const read=f.store.readExact;f.store.readExact=async(...args)=>{const b=await read(...args);f.admission.revoked=true;return b;};await assert.rejects(f.run);assert.equal(f.writes(),0);assert(f.data.every(x=>x===0));});
test('pipe failure clears bytes, never returns credential',async()=>{const f=fixture();f.sink.write=async()=>{throw Error('pipe_closed');};await assert.rejects(f.run,{message:'pipe_closed'});assert(f.data.every(x=>x===0));});
test('unknown item cannot trigger a search',()=>assert.throws(()=>descriptor('telegram',501)));
test('items cannot synchronize or use an arbitrary namespace',()=>{assert.equal(descriptor('deepseek',501).synchronizable,false);assert.equal(descriptor('yclientsPartner',501).account,'local-owner-501');assert(Object.isFrozen(ITEMS.deepseek));});
