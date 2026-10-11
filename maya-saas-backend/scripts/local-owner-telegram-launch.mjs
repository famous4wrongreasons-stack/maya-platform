// Execution bounds for the existing retained-database launcher, not a release
// grant or an authentication credential. Canonical app auth remains mandatory.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { assertPrivateCwd } from './local-onboarding-profile.mjs';
import { assertOwnerChatScope } from './local-owner-scope.mjs';
import { OWNER_TELEGRAM_PROFILE, assertTelegramOrigin, exactObject } from './local-owner-telegram-policy.mjs';

const digest = b => createHash('sha256').update(b).digest('hex');
const sha = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export function assertOwnerTelegramPlan(plan, source, approvalRef, now = Date.now()) {
  assert.ok(exactObject(plan, ['contract', 'candidateCommit', 'sourceSha256', 'scope', 'origin', 'clientId', 'notBefore', 'expiresAt', 'ownerApprovalRef']), 'local_telegram_plan_shape');
  assert.ok(plan.contract === OWNER_TELEGRAM_PROFILE && /^[a-f0-9]{40}$/.test(plan.candidateCommit)
    && plan.candidateCommit === source.head && sha(plan.sourceSha256)
    && plan.sourceSha256 === digest(JSON.stringify(source)), 'local_telegram_source_pin');
  assertOwnerChatScope(plan.scope); assertTelegramOrigin(plan.origin);
  assert.ok(typeof plan.clientId === 'string' && /^[1-9][0-9]{5,14}$/.test(plan.clientId), 'local_telegram_client_pin');
  assert.ok(typeof approvalRef === 'string' && /^[A-Za-z0-9_.:/-]{8,200}$/.test(approvalRef)
    && plan.ownerApprovalRef === approvalRef, 'local_telegram_owner_approval_required');
  const start = Date.parse(plan.notBefore), end = Date.parse(plan.expiresAt);
  assert.ok(Number.isFinite(start) && Number.isFinite(end) && end > start && end - start <= 1800000
    && start <= now && now < end, 'local_telegram_execution_window');
}
function readPlan(filename, hash) {
  assert.ok(path.isAbsolute(filename) && fs.realpathSync(filename) === filename && sha(hash), 'local_telegram_private_plan');
  assertPrivateCwd(path.dirname(filename));
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const relative = path.relative(repo, filename);
  assert.ok(relative.startsWith('..' + path.sep) || path.isAbsolute(relative), 'local_telegram_plan_inside_repository');
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const s = fs.fstatSync(fd);
    assert.ok(s.isFile() && s.uid === process.getuid() && (s.mode & 0o777) === 0o600 && s.nlink === 1 && s.size > 0 && s.size <= 16384, 'local_telegram_private_plan');
    const bytes = fs.readFileSync(fd); assert.ok(digest(bytes) === hash, 'local_telegram_plan_pin');
    try { return JSON.parse(bytes.toString()); } finally { bytes.fill(0); }
  } finally { fs.closeSync(fd); }
}
export function readOwnerTelegramLaunch(filename, hash, approvalRef, readSource, role = 'inspect') {
  assert.ok(['inspect', 'claim', 'child'].includes(role), 'local_telegram_plan_role');
  const plan = readPlan(filename, hash), source = readSource();
  assertOwnerTelegramPlan(plan, source, approvalRef);
  const used = filename + '.consumed';
  const expected = JSON.stringify({ contract: OWNER_TELEGRAM_PROFILE, planSha256: hash, ownerApprovalRef: approvalRef });
  const assertClaim = () => {
    const fd = fs.openSync(used, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
      const stat = fs.fstatSync(fd);
      assert.ok(stat.isFile() && stat.uid === process.getuid() && stat.nlink === 1 && (stat.mode & 0o777) === 0o600 && stat.size <= 1024, 'local_telegram_claim');
      assert.ok(fs.readFileSync(fd, 'utf8') === expected, 'local_telegram_claim');
    } finally { fs.closeSync(fd); }
  };
  if (role === 'inspect') assert.ok(!fs.existsSync(used), 'local_telegram_already_consumed');
  if (role === 'claim') {
    const fd = fs.openSync(used, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    try { fs.writeFileSync(fd, expected); } finally { fs.closeSync(fd); }
  }
  if (role !== 'inspect') assertClaim();
  if (role === 'child') {
    const fd = fs.openSync(used + '.child', fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    try { fs.writeFileSync(fd, expected); } finally { fs.closeSync(fd); }
  }
  return { plan, assertCurrent() {
    assert.ok(role !== 'inspect', 'local_telegram_claim_required'); assertClaim();
    assert.ok(digest(JSON.stringify(readPlan(filename, hash))) === digest(JSON.stringify(plan)), 'local_telegram_plan_changed');
    assertOwnerTelegramPlan(plan, readSource(), approvalRef);
  } };
}
