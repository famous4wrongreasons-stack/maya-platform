import test from 'node:test';import assert from 'node:assert/strict';
import {phoneAiPlan,PHONE_APP_CANDIDATE} from './phone-ai-plan.mjs';
const base=()=>({name:'maya-phone-staging',services:{backend:{image:'maya-phone-backend:'+PHONE_APP_CANDIDATE,environment:{MAYA_RELEASE:PHONE_APP_CANDIDATE},env_file:['/srv/maya-phone-staging/private/catalog.env'],networks:['private','catalog_private'],volumes:['staging_uploads:/app/uploads']},postgres:{unchanged:'db'},gateway:{unchanged:'web'},'catalog-egress':{unchanged:'catalogue-budget'}},networks:{private:{internal:true},catalog_private:{internal:true},edge:{}},volumes:{data:null}});
test('overlay keeps app, database, catalogue budget and carrier bytes; only relay can reach model',()=>{
 const old=base(),next=phoneAiPlan(old,'a'.repeat(64)),b=next.services.backend,m=next.services['model-egress'];
 for(const n of ['postgres','gateway','catalog-egress'])assert.deepEqual(next.services[n],old.services[n]);
 assert.equal(b.image,old.services.backend.image);assert.deepEqual(b.command,[]);assert.deepEqual(m.command,[]);
 assert.ok(b.networks.every(n=>next.networks[n].internal));assert.equal(next.networks.model_private.internal,true);
 assert.deepEqual(m.networks,['model_private','edge']);assert.equal(m.ports,undefined);assert.equal(m.env_file,undefined);
 assert.ok(!b.volumes.some(v=>v.includes('deepseek.key')));assert.ok(m.volumes.some(v=>v.endsWith('/run/maya/deepseek.key:ro')));
 assert.equal(m.restart,'no');assert.deepEqual(next.volumes,old.volumes);assert.equal(old.services['model-egress'],undefined);
});
test('unexpected candidate, external backend network, credential file or reused overlay refused',()=>{
 const changes=[b=>b.services.backend.image='other',b=>b.services.backend.environment.MAYA_RELEASE='f'.repeat(40),b=>b.services.backend.networks.push('edge'),b=>b.services.backend.env_file.push('secret'),b=>b.networks.private.internal=false,b=>b.services['model-egress']={}];
 for(const change of changes){const b=base();change(b);assert.throws(()=>phoneAiPlan(b,'a'.repeat(64)));}
});
