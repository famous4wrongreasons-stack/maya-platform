import assert from 'node:assert/strict';
import path from 'node:path';
import { readUiLaunch } from './conversation-qualification/core-ui-local.mjs';
import { assertCoreAdmission } from './conversation-qualification/core-conversation-admission.mjs';
import { assertCoreSources } from './conversation-qualification/core-conversation-source.mjs';
import { OWNER_CHAT_PROFILE } from './local-owner-chat-policy.mjs';

export function readOwnerChatLaunch(planPath, planSha256, role = 'runner') {
  const launch = readUiLaunch(planPath, planSha256, OWNER_CHAT_PROFILE);
  assert.deepEqual(launch.plan.ownerScope, launch.manifest.ownerScope, 'owner_chat_scope_binding');
  const common = { manifest: launch.plan.manifestPath, 'manifest-sha256': launch.plan.manifestSha256,
    permit: path.join(launch.root, 'permit.json'), 'permit-sha256': launch.approval.permitSha256,
    'owner-approval-ref': launch.approval.ownerApprovalRef };
  const admission = role === null ? null : assertCoreAdmission({ path: common.permit, sha256: common['permit-sha256'],
    manifest: launch.manifest, claimPath: common.permit + '.claim',
    target: launch.manifest.admissionContext.target,
    credentialSource: launch.manifest.admissionContext.credentialSource,
    ownerApprovalRef: common['owner-approval-ref'], role });
  const binding = { candidateCommit: launch.manifest.candidateCommit, manifestSha256: launch.manifest.manifestSha256,
    profile: OWNER_CHAT_PROFILE, limitsSha256: launch.manifest.limitsSha256 };
  return { ...launch, common, admission, binding,
    assertCurrent() { assert.ok(admission, 'owner_chat_claim_required'); admission(binding); assertCoreSources(launch.manifest); } };
}
