// Minimal overlay for the already running isolated Beget phone staging.
import assert from 'node:assert/strict';
export const PHONE_APP_CANDIDATE='7aee28d297cd1d70c2f1cb6ce96740d9fd5948d3';
export const PHONE_AI_FILES=Object.freeze(['phone-ai-entry.mjs','phone-ai-runtime.mjs','phone-ai-scope.mjs','phone-ai-egress.mjs','conversation-qualification/current-candidate-budget.mjs','conversation-qualification/core-local-ab-checks.mjs']);
export function phoneAiPlan(previous,pin){
 assert.match(pin,/^[a-f0-9]{64}$/);assert.equal(previous.name,'maya-phone-staging');
 const root='/srv/maya-phone-staging',image='maya-phone-backend:'+PHONE_APP_CANDIDATE;
 assert.equal(previous.services.backend.image,image);assert.equal(previous.services.backend.environment.MAYA_RELEASE,PHONE_APP_CANDIDATE);
 assert.deepEqual(previous.services.backend.networks,['private','catalog_private']);
 assert.deepEqual(previous.services.backend.volumes,['staging_uploads:/app/uploads']);
 assert.deepEqual(previous.services.backend.env_file,[root+'/private/catalog.env']);
 assert.equal(previous.networks.private.internal,true);assert.equal(previous.networks.catalog_private.internal,true);
 assert.ok(!previous.services['model-egress']&&!previous.networks.model_private);
 const next=structuredClone(previous),base=root+'/preparation/ai-20261015';
 const common=[root+'/private/phone-ai-scope.json:/run/maya/phone-ai-scope.json:ro',...PHONE_AI_FILES.map(f=>base+'/'+f+':/app/scripts/'+f+':ro')];
 Object.assign(next.services.backend,{
  entrypoint:['node','/app/scripts/phone-ai-entry.mjs'],command:[],
  networks:['private','catalog_private','model_private'],
  environment:{...previous.services.backend.environment,MAYA_PHONE_AI_SCOPE_SHA256:pin},
  volumes:[...previous.services.backend.volumes,...common],
 });
 next.services['model-egress']={image,pull_policy:'never',entrypoint:['node','/app/scripts/phone-ai-egress.mjs'],command:[],restart:'no',read_only:true,cap_drop:['ALL'],security_opt:['no-new-privileges:true'],mem_limit:'96m',memswap_limit:'96m',cpus:0.15,pids_limit:32,networks:['model_private','edge'],environment:{MAYA_PHONE_AI_SCOPE_SHA256:pin},volumes:[...common,root+'/private/deepseek.key:/run/maya/deepseek.key:ro',root+'/private/phone-ai-ledger:/var/lib/maya-ai'],logging:{driver:'local',options:{'max-size':'1m','max-file':'2'}}};
 next.networks.model_private={driver:'bridge',internal:true};
 for(const name of ['postgres','catalog-egress','gateway'])assert.deepEqual(next.services[name],previous.services[name]);
 assert.deepEqual(next.volumes,previous.volumes);
 return next;
}
