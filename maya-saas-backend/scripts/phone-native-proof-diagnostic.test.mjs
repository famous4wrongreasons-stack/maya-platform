import assert from 'node:assert/strict';
import { projectAvailability, PROOF_HASH } from './phone-native-proof-diagnostic.mjs';
const SUBJECT = '961fa196c4b02a8badd2ada94f505f5cb838b78f';
const exactFrame = '    at file:///synthetic/maya-saas-backend/test/widgets-live/support/native-execution-compiled-proof.mjs:1072:10';
const source = {subjectHead:SUBJECT, expectedHead:SUBJECT, proofSha256:PROOF_HASH};
const secret = 'SECRET_SENTINEL_TOKEN_PHONE_NAME';
function failure(status, body) {
  try { assert.equal(status,201,JSON.stringify(body)); }
  catch (e) { return { failure:{name:e.name,message:e.message,stack:exactFrame} }; }
}
const checks=[];
for(const status of [200,400,401,403,409,422,429,500,503]) {
  const result=projectAvailability(failure(status,{statusCode:status,error:{code:'booking_branch_source_unavailable'},token:secret,message:secret}),source);
  assert.equal(result.httpStatus,status);assert.equal(result.machineCode,'booking_branch_source_unavailable');assert(!JSON.stringify(result).includes(secret));checks.push('actual_status_'+status);
}
const original=failure(503,{error:{code:'booking_branch_source_unavailable'}, message:'embedded fake comparison\n\n401 !== 201\n'+secret});
assert.equal(projectAvailability(original,source).httpStatus,503);checks.push('embedded_comparison_does_not_override_actual');
for(const [label,input,ctx] of [
 ['missing_expected_head',original,{...source,expectedHead:undefined}],
 ['wrong_expected_head',original,{...source,expectedHead:'0'.repeat(40)}],
 ['malformed_head',original,{...source,subjectHead:'unknown',expectedHead:'unknown'}],
 ['wrong_source',original,{...source,proofSha256:'0'.repeat(64)}],
 ['wrong_subject',original,{...source,subjectHead:'0'.repeat(40)}],
 ['frame_only',{failure:{name:'AssertionError',stack:exactFrame}},source],
 ['other_line',{failure:{...original.failure,stack:exactFrame.replace(':1072:',':1073:')}},source],
 ['wrong_assertion',{failure:{...original.failure,message:original.failure.message.replace(/!== 201\n$/, '!== 200\n')}},source],
 ['unsupported_format',{failure:{...original.failure,message:'503'}},source],
 ['wrong_error_name',{failure:{...original.failure,name:'Error'}},source],
 ['malformed_json',{failure:{...original.failure,message:'{bad}\n\n503 !== 201\n'}},source],
 ['oversized',{failure:{...original.failure,message:'x'.repeat(131073)}},source],
]) {assert.equal(projectAvailability(input,ctx).httpStatus,null);checks.push(label);}
const hidden=projectAvailability(failure(500,{statusCode:503,error:{code:secret,field:secret},payload:secret}),source);
assert.equal(hidden.machineCode,null);assert.equal(hidden.machineCodeDisposition,'not_allowlisted_redacted');assert.equal(hidden.bodyStatusAgrees,false);assert(!JSON.stringify(hidden).includes(secret));checks.push('unknown_code_and_field_redacted_body_status_not_http_authority');
const server=failure(500,{statusCode:500,error:'Internal Server Error',message:secret});
server.syntheticServerErrors=[{message:'CrmProviderResponseError: YClients request failed with status 403: '+secret,stack:secret},{message:'Error: phone_native_channel_refused'},{message:secret}];
const projected=projectAvailability(server,source);assert.deepEqual(projected.serverErrorSignals,[{tag:'provider_response_error',providerHttpStatus:403},{tag:'native_channel_refused'}]);assert(!JSON.stringify(projected).includes(secret));checks.push('server_errors_finite_tags_only');
const result={status:'PASS',node:process.version,checks,checksCount:checks.length,syntheticOnly:true,compiledProgrammeRerun:false,runtimeOrAssertionsChanged:false};
console.log(JSON.stringify(result));
