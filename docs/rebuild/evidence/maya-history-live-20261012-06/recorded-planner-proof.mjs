import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const root='/private/tmp/maya-owner-history-review-20261012-06';
const backend='/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-local-crm-setup-20261010/maya-saas-backend';
globalThis.fetch=()=>{throw Error('offline_proof_external_request_forbidden');};
const require=createRequire(backend+'/package.json');
const {AiCoreModelService}=require('./dist/src/ai-tools/ai-core-model.service.js');
const {AiToolRegistryService}=require('./dist/src/ai-tools/ai-tool-registry.service.js');
const {UserRole}=require('./dist/src/common/domain.enums.js');
const registry=new AiToolRegistryService();
const model=new AiCoreModelService({get:()=>undefined});
const bytes=fs.readFileSync(root+'/broker/model-responses.jsonl');
const rows=bytes.toString().trim().split('\n').map(JSON.parse);
assert.equal(rows.length,2);
const def=registry.get('appointments.own.list');
const tool={name:def.name,description:def.description,input_schema:def.inputSchema,risk_tier:def.riskTier,approval_policy:def.approvalPolicy};
const input={surface:'web',persona:'director',principalRole:UserRole.CLIENT,messages:[],tools:[tool],toolResults:[],allowToolCall:true,requiredToolNames:[tool.name]};
const results=[];
for(const row of rows){
 const parsed=model.validatePlanningResponse(row.content,input);
 let admitted=false,code=null;
 try{registry.validateArguments(parsed.toolCall.name,parsed.toolCall.arguments);admitted=true;}
 catch(e){code=e.getResponse?.()?.error?.code??e.message;}
 results.push({caseId:row.caseId,semanticValidated:true,period:parsed.semanticPlan.tasks[0].entities.period,argumentKeys:Object.keys(parsed.toolCall.arguments),registryAdmitted:admitted,errorCode:code});
 input.conversationPlan=parsed.semanticPlan;
}
assert.equal(results[0].registryAdmitted,true);
assert.equal(results[1].registryAdmitted,false);
assert.equal(results[1].period,'last_visit');
// Counterfactual changes only the invalid tool arguments in an in-memory copy.
// This is a diagnosis, never a product repair or live-response substitution.
const corrected=JSON.parse(rows[1].content);corrected.tool_call.arguments_json='{}';
const parsed=model.validatePlanningResponse(JSON.stringify(corrected),input);
assert.deepEqual(registry.validateArguments(parsed.toolCall.name,parsed.toolCall.arguments),{});
assert.equal(parsed.semanticPlan.tasks[0].entities.period,'last_visit');
const summary={qualification:'OFFLINE_RECORDED_RESPONSE_DIAGNOSIS_NOT_LIVE_ACCEPTANCE',candidate:'8c6aff11c2bdcc7f205c61f75214f00bc41d5eb9',recordedSourceSha256:createHash('sha256').update(bytes).digest('hex'),results,onlyToolArgumentsCorrected:'PASS',semanticPeriodPreserved:true,networkCalls:0,credentialsLoaded:0,productSourceChanged:false};
fs.writeFileSync(root+'/recorded-planner-proof.json',JSON.stringify(summary,null,2)+'\n',{mode:0o600,flag:'wx'});
console.log(JSON.stringify(summary));
