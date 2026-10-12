import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { assertOwnerHistoryPlan, OWNER_HISTORY_PROFILE } from './local-owner-history-policy.mjs';

// Execute the actual proof's permit construction with a clock that advances
// between reads. No proof process, database, credential or provider is started.
const script = fs.readFileSync(new URL('./local-owner-history-review-proof.mjs', import.meta.url), 'utf8');
const start = script.indexOf('  const permitNow = ');
const end = script.indexOf('  const permitPath = ');
assert.ok(start >= 0 && end > start);
const construction = script.slice(start, end);
const source = { head: 'a'.repeat(40) };
const scope = {
  stateDirectory: '/private/tmp/synthetic-history-clock',
  initialManifestSha256: 'a'.repeat(64), privateStateSha256: 'b'.repeat(64),
  restartReceiptPath: '/private/tmp/synthetic-history-clock/restart.json',
  restartReceiptSha256: 'c'.repeat(64), tenantId: 'synthetic-tenant',
  userId: 'synthetic-user', branchId: 'synthetic-branch',
  tenantSlug: 'synthetic-salon', companyId: '12345',
};
const now = Date.parse('2026-10-12T10:00:00.000Z');
function construct(code) {
  let clock = now;
  class AdvancingDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock++])); }
    static now() { return clock++; }
  }
  return vm.runInNewContext(code + '\npermit;', {
    Date: AdvancingDate, source, scope, OWNER_HISTORY_PROFILE,
    origin: 'http://127.0.0.1:56151',
    hash: value => createHash('sha256').update(value).digest('hex'),
  });
}

test('actual synthetic proof obeys the execution window when clock advances; historical two-read construction is refused', () => {
  const permit = construct(construction);
  assertOwnerHistoryPlan(permit, source, permit.ownerApprovalRef, now + 10);
  assert.equal(Date.parse(permit.expiresAt) - Date.parse(permit.notBefore), 1800000);
  const historical = construct(construction
    .replace('new Date(permitNow)', 'new Date()')
    .replace('new Date(permitNow+1800000)', 'new Date(Date.now()+1800000)'));
  assert.throws(() => assertOwnerHistoryPlan(historical, source, historical.ownerApprovalRef, now + 10), /history_execution_window/);
});
