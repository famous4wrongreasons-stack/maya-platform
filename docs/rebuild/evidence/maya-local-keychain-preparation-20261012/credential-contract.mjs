// Preparation only: no Security.framework binding, OS credential access or network.
import assert from 'node:assert/strict';
export const ITEMS = Object.freeze({
  deepseek: Object.freeze({service:'ru.mayaos.dev.local-model.deepseek.v1',consumer:'local-model-broker',purpose:'bounded-model'}),
  yclientsPartner: Object.freeze({service:'ru.mayaos.dev.local-read.yclients-partner.v1',consumer:'local-yclients-read-runtime',purpose:'bounded-catalog-read'}),
});
export const HELPER = 'ru.mayaos.local.credentials';
export function descriptor(kind,uid){
  assert(Object.hasOwn(ITEMS,kind),'unknown_credential');
  assert(Number.isSafeInteger(uid)&&uid>0,'owner_required');
  return Object.freeze({class:'generic-password',service:ITEMS[kind].service,account:`local-owner-${uid}`,keychain:'explicit-owner-login-file',synchronizable:false});
}
function authorize(input,kind,now){
  assert(input&&input.admissionValidated===true,'admission_required');
  assert(input.helperIdentityVerified===true&&input.helperId===HELPER,'helper_identity_required');
  assert(input.candidate===input.permitCandidate&&/^[a-f0-9]{40}$/.test(input.candidate),'candidate_mismatch');
  assert(input.ownerUid===input.readerUid&&Number.isSafeInteger(input.ownerUid)&&input.ownerUid>0,'owner_mismatch');
  assert(input.consumer===ITEMS[kind].consumer&&input.purpose===ITEMS[kind].purpose,'consumer_mismatch');
  assert(input.environment==='local'&&input.revoked===false,'local_unrevoked_required');
  assert(Number.isFinite(input.notBefore)&&Number.isFinite(input.expiresAt)&&now>=input.notBefore&&now<input.expiresAt,'window_refused');
  assert(input.explicitCredentialApproval===true,'credential_access_not_approved');
}
// Production integration must derive admissionValidated and code identity from
// the existing verifier, never from caller-authored JSON or these test booleans.
export async function deliverCredential({kind,admission,store,sink,signal,now=Date.now}){
  const item=descriptor(kind,admission.ownerUid);
  authorize(admission,kind,now());signal?.throwIfAborted();
  assert(sink?.inheritedPrivatePipe===true&&sink.consumer===ITEMS[kind].consumer,'private_sink_required');
  let bytes;
  try{
    bytes=await store.readExact(item,{interactive:false,signal});
    assert(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=4096,'invalid_credential');
    signal?.throwIfAborted();authorize(admission,kind,now());
    await sink.write(bytes,{signal});
    return Object.freeze({delivered:true,kind});
  }finally{if(Buffer.isBuffer(bytes))bytes.fill(0);}
}
