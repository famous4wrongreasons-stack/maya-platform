// One operator-authorized staging acceptance window. This adds restrictions;
// it is not Telegram verification, Client authority or a release entitlement.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
export const PHONE_TELEGRAM_CONTRACT = 'maya.phone-owner-telegram/1';
export const PHONE_TELEGRAM_ORIGIN = 'https://phone-test.mayaos.ru';
export const PHONE_TELEGRAM_CLIENT_ID = '8941349983';
export const PHONE_TELEGRAM_SENTINEL = 'PHONE_TELEGRAM_RELAY_NOT_A_CREDENTIAL';
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function validatePhoneTelegramScope(s, now = Date.now()) {
  const keys = [
    'contract',
    'approvalRef',
    'candidate',
    'tenantId',
    'userId',
    'branchId',
    'tenantSlug',
    'companyId',
    'notBefore',
    'expiresAt',
  ];
  assert.ok(
    s && Object.keys(s).sort().join(',') === keys.sort().join(','),
    'phone_telegram_scope_shape',
  );
  assert.equal(s.contract, PHONE_TELEGRAM_CONTRACT);
  assert.equal(s.approvalRef, 'owner-20261015-phone-telegram-30m-3logins');
  assert.equal(s.candidate, '7aee28d297cd1d70c2f1cb6ce96740d9fd5948d3');
  for (const key of ['tenantId', 'userId', 'branchId'])
    assert.match(s[key], /^[A-Za-z0-9_-]{1,128}$/);
  assert.equal(s.tenantSlug, 'malestheticstavropol');
  assert.equal(s.companyId, '503759');
  const start = Date.parse(s.notBefore),
    end = Date.parse(s.expiresAt);
  assert.ok(
    Number.isFinite(start) &&
      Number.isFinite(end) &&
      start <= now &&
      now < end &&
      end - start <= 1800000,
    'phone_telegram_window',
  );
  return Object.freeze({ ...s });
}
export function readPhoneTelegramScope(file, pin) {
  assert.match(pin, /^[a-f0-9]{64}$/);
  const stat = fs.lstatSync(file);
  assert.ok(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.uid === 0 &&
      !(stat.mode & 0o077) &&
      stat.size <= 4096,
    'phone_telegram_scope_file',
  );
  const bytes = fs.readFileSync(file);
  assert.equal(hash(bytes), pin, 'phone_telegram_scope_changed');
  assert.equal(
    fs.existsSync(file + '.revoked'),
    false,
    'phone_telegram_revoked',
  );
  return validatePhoneTelegramScope(JSON.parse(bytes));
}
// Exclusive durable process claim: neither backend nor relay can restart and
// reset counters. Removal/renewal requires a separately reviewed operator step.
export function claimPhoneTelegramProcess(directory, kind, pin) {
  assert.ok(['backend', 'egress'].includes(kind));
  assert.match(pin, /^[a-f0-9]{64}$/);
  const fd = fs.openSync(directory + '/' + kind + '.consumed', 'wx', 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify({ pin, kind }));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
export function assertPhoneTelegramActor(user, s) {
  assert.ok(
    user?.userId === s.userId &&
      user.tenantId === s.tenantId &&
      user.role === 'tenant_owner' &&
      user.membershipStatus === 'active',
    'phone_telegram_actor',
  );
}
