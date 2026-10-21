// Read-only, post-run projection. No response values, fixtures or assertions change.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
export const PROOF_HASH = 'd9b7363339e0bb62afaa3fd025c305a917cba4c6d7f11658f0681952738e6c27';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const codes = new Set([
  'validation', 'ai_tool_arguments_invalid', 'ai_tool_forbidden',
  'ai_tool_not_found', 'subscription_required', 'ai_tool_idempotency_conflict',
  'ai_tool_availability_source_changed', 'booking_preview_stale',
  'booking_branch_source_unavailable', 'crm_integration_not_active',
  'service_catalog_source_unavailable', 'phone_native_create_egress_refused',
  'phone_native_channel_refused', 'ai_tool_execution_failed',
]);
const classes = new Set([
  'Bad Request', 'Unauthorized', 'Forbidden', 'Not Found', 'Conflict',
  'Too Many Requests', 'Internal Server Error', 'Service Unavailable',
]);
const fields = new Set(['date', 'arguments', 'branch_id', 'staff_id', 'service_ids', 'surface']);
const status = n => Number.isInteger(n) && n >= 100 && n <= 599;
const frame = /^\s+at file:\/\/[^\r\n]*\/test\/widgets-live\/support\/native-execution-compiled-proof\.mjs:1072:10$/m;

export function projectAvailability(manifest, source) {
  const out = {
    contract: 'maya.native-availability-diagnostic-safe/1',
    diagnosticOnly: true,
    admissibleForCertification: false,
    subjectHead: /^[a-f0-9]{40}$/.test(source.subjectHead ?? '') && source.subjectHead === source.expectedHead ? source.subjectHead : null,
    proofSha256: source.proofSha256 === PROOF_HASH ? PROOF_HASH : null,
    classification: 'UNCLASSIFIED',
    httpStatus: null,
    machineCode: null,
  };
  if (!out.subjectHead || source.proofSha256 !== PROOF_HASH) {
    out.reason = 'unpinned_subject_or_proof';
    return out;
  }
  const failure = record(manifest) && record(manifest.failure) ? manifest.failure : null;
  if (!failure || failure.name !== 'AssertionError' || typeof failure.stack !== 'string' || !frame.test(failure.stack)) {
    out.reason = 'not_exact_availability_status_assertion';
    return out;
  }
  if (typeof failure.message !== 'string' || Buffer.byteLength(failure.message) > 131072) {
    out.reason = 'missing_or_oversized_assertion_message';
    return out;
  }
  // Node22.23.3 custom assert.equal message is JSON.stringify(response.body)
  // plus the actual/expected numeric comparison. Never infer status from stack alone.
  const match = /^(\{[^\r\n]*\})\n\n([1-5][0-9]{2}) !== 201\n$/.exec(failure.message);
  if (!match || Number(match[2]) === 201) {
    out.reason = 'unknown_assertion_message_format';
    return out;
  }
  let body;
  try { body = JSON.parse(match[1]); } catch {
    out.reason = 'invalid_response_body_json';
    return out;
  }
  if (!record(body)) {
    out.reason = 'response_body_not_object';
    return out;
  }
  out.classification = 'EXACT_ASSERTION_RESPONSE_STATUS_RECOVERED';
  out.httpStatus = Number(match[2]);
  out.statusEvidence = 'actual availability.status encoded by pinned Node assert.equal; not inferred from frame or body.statusCode';
  const code = record(body.error) ? body.error.code : body.error;
  const candidate = typeof code === 'string' ? code : body.code;
  out.machineCode = codes.has(candidate) ? candidate : null;
  out.machineCodeDisposition = candidate == null ? 'absent' : out.machineCode === null ? 'not_allowlisted_redacted' : 'allowlisted';
  out.frameworkError = classes.has(body.error) ? body.error : null;
  out.bodyStatusCode = status(body.statusCode) ? body.statusCode : null;
  out.bodyStatusAgrees = out.bodyStatusCode === null ? null : out.bodyStatusCode === out.httpStatus;
  out.validationField = record(body.error) && fields.has(body.error.field) ? body.error.field : null;
  out.serverErrorSignals = [];
  // A generic500 may hide the class upstream. Only fixed tags/numeric status
  // survive; no raw server message, stack, route, ID or model/provider payload.
  for (const item of Array.isArray(manifest.syntheticServerErrors) ? manifest.syntheticServerErrors.slice(0, 32) : []) {
    if (!record(item) || typeof item.message !== 'string') continue;
    const message = item.message;
    let signal;
    const provider = /^(?:CrmProviderResponseError|Error): YClients request failed with status ([1-5][0-9]{2})(?::[^\r\n]*)?$/.exec(message);
    if (provider) signal = { tag: 'provider_response_error', providerHttpStatus: Number(provider[1]) };
    else if (/^(?:(?:CrmOutcomeUnknownError|Error): )?YClients (?:did not answer in time|response body was interrupted) \((?:GET|POST|PUT|DELETE) [^\r\n]*\)$/.test(message)) signal = { tag: 'provider_transport_incomplete' };
    else if (/^(?:Error: )?phone_native_channel_refused$/.test(message)) signal = { tag: 'native_channel_refused' };
    else if (/^(?:Error: )?booking_slot_facts_unavailable$/.test(message)) signal = { tag: 'slot_facts_unavailable' };
    else if (/^(?:AssertionError[^:]*: )?unexpected synthetic catalogue route$/.test(message)) signal = { tag: 'unexpected_synthetic_catalogue_route' };
    if (signal && !out.serverErrorSignals.some(x => JSON.stringify(x) === JSON.stringify(signal))) out.serverErrorSignals.push(signal);
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [proofRoot, proofFile, outputFile] = process.argv.slice(2);
  if (![proofRoot, proofFile, outputFile].every(p => typeof p === 'string' && path.isAbsolute(p)) || fs.existsSync(outputFile)) throw Error('three absolute paths and a fresh output are required');
  const subjectHead = execFileSync('git', ['-C', path.dirname(proofFile), 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
  const proofSha256 = digest(fs.readFileSync(proofFile));
  const expectedHead = process.env.GITHUB_SHA;
  if (!/^[a-f0-9]{40}$/.test(expectedHead ?? '') || subjectHead !== expectedHead) throw Error('current CI checkout must match GITHUB_SHA');
  const report = {contract:'maya.native-compiled-diagnostic-safe/1', diagnosticOnly:true, admissibleForCertification:false, subjectHead, proofSha256, receipts:{}};
  for (const relative of ['manifest.json', 'lifecycle/manifest.json', 'lost-response/manifest.json']) {
    const file = path.join(proofRoot, relative);
    if (!fs.existsSync(file)) { report.receipts[relative] = {present:false}; continue; }
    const bytes = fs.readFileSync(file);
    const manifest = JSON.parse(bytes);
    const row = {present:true,sha256:digest(bytes),status:['running','passed','failed'].includes(manifest.status) ? manifest.status : null};
    for (const key of ['clusterStopped','applicationStopped','syntheticOnly'])
      if (typeof manifest[key] === 'boolean') row[key] = manifest[key];
    for (const key of ['realProviderEffects','realModelCalls','externalEffects'])
      if (Number.isSafeInteger(manifest[key]) && manifest[key] >= 0) row[key] = manifest[key];
    if (relative !== 'manifest.json') row.availabilityFailure = projectAvailability(manifest, {subjectHead,expectedHead,proofSha256});
    report.receipts[relative] = row;
  }
  report.projectionEnvironment = {node:process.version,icu:process.versions.icu,platform:process.platform,arch:process.arch,dateIsIso:/^\d{4}-\d{2}-\d{2}$/.test(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+86400000)))};
  fs.writeFileSync(outputFile, JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
}
