// Exact committed-source preparation only; no permit/key/network/owner DB.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { prepareLocalCore } from './core-local-prepare.mjs';
import { CORE_OWNER_READ_PROFILE, CORE_OWNER_HISTORY_PROFILE } from './current-candidate-budget.mjs';
import { coreHash } from './core-conversation-source.mjs';
import { readOwnerChatLaunch } from '../local-owner-chat-launch.mjs';

for (const profile of [CORE_OWNER_READ_PROFILE, CORE_OWNER_HISTORY_PROFILE]) test(profile + ' owner preparation binds retained state and selects only the existing resume launcher; no approval exists', t => {
  const parent=fs.mkdtempSync('/private/tmp/maya-owner-prepare-');
  t.after(()=>fs.rmSync(parent,{recursive:true,force:true}));
  const root=path.join(parent,'run');
  const scope={stateDirectory:'/private/tmp/synthetic-owner-state',initialManifestSha256:'a'.repeat(64),privateStateSha256:'b'.repeat(64),
    restartReceiptPath:'/private/tmp/synthetic-owner-restart/restart.json',restartReceiptSha256:'c'.repeat(64),
    tenantId:'synthetic-tenant',userId:'synthetic-owner',branchId:'synthetic-branch',tenantSlug:'synthetic-salon',companyId:'321'};
  const plan=prepareLocalCore(root,profile,scope);
  assert.deepEqual(plan.ownerScope,scope);
  assert.equal(plan.paidAuthorized,false);
  assert.equal(plan.runnerArgv,null);
  assert.deepEqual(JSON.parse(fs.readFileSync(plan.manifestPath)).ownerScope,scope);
  const command=fs.readFileSync(path.join(root,'launch.command'),'utf8');
  assert.ok(command.includes('scripts/local-yclients-read-resume.mjs'));
  assert.ok(command.includes('--owner-chat-plan'));
  assert.ok(!command.includes('core-conversation-runner.mjs'));
  assert.equal(fs.existsSync(path.join(root,'permit.json')),false);
  const file=path.join(root,'local-plan.json');
  assert.throws(()=>readOwnerChatLaunch(file,coreHash(fs.readFileSync(file)),null),/ENOENT/);
});
