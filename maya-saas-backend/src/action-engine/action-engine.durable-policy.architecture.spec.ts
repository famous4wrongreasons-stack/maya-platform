import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ActionExecution } from '@prisma/client';
import ts from 'typescript';
import {
  RC_DURABLE_COMMANDS,
  expenseReminderPreferenceTransition,
  rcPolicyResumeCandidate,
} from './action-engine.durable-policy';

function method(source: string, name: string) {
  const file = ts.createSourceFile(
    'kernel.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  let found = '';
  const walk = (node: ts.Node) => {
    if (ts.isMethodDeclaration(node) && node.name.getText(file) === name)
      found = node.getText(file);
    ts.forEachChild(node, walk);
  };
  walk(file);
  if (!found) throw Error('Missing kernel boundary ' + name);
  return found;
}
const read = (name: string) => readFileSync(join(__dirname, name), 'utf8');
const compact = (text: string) => text.replace(/\s+/g, '');
describe('R-C permanent durable intent / current policy boundary', () => {
  it('has exactly the approved 13 command capabilities and excludes other approval lifetimes', () => {
    expect([...RC_DURABLE_COMMANDS].sort()).toEqual(
      [
        'native-feedback.request.execute.v1',
        'native-feedback.response.execute.v1',
        'native-feedback.withdraw.execute.v1',
        'public-community.moderate.execute.v1',
        'public-community.reply.execute.v1',
        'package5.settings.tenant-business.execute.v1',
        'package5.settings.staff-notifications.execute.v1',
        'team.message.send.execute.v1',
        'team.message.withdraw.execute.v1',
        'team.attachment.reserve.execute.v1',
        'team.attachment.finalize.execute.v1',
        'cash-declaration.declare.execute.v1',
        'cash-declaration.correct.execute.v1',
      ].sort(),
    );
    const allowed = {
      capability: 'team.message.send.execute.v1',
      capabilityVersion: 1,
      approvalRequirement: 'NONE',
      approvalDecision: 'NOT_REQUIRED',
      policyDecision: 'ALLOW',
      dryRun: false,
    } as ActionExecution;
    expect(rcPolicyResumeCandidate(allowed)).toBe(true);
    for (const change of [
      { approvalRequirement: 'REQUIRED' },
      { approvalDecision: 'REJECTED' },
      { policyDecision: 'DENY' },
      { dryRun: true },
      { capabilityVersion: 2 },
      ...[
        'crm.appointment.create.v1',
        'client-channel.link.verify.execute.v1',
        'communication.bulk-campaign.execute.v1',
        'package5.settings.finance.execute.v1',
        'team.unapproved.execute.v1',
      ].map((capability) => ({ capability })),
    ])
      expect(
        rcPolicyResumeCandidate({ ...allowed, ...change } as ActionExecution),
      ).toBe(false);
  });
  it('keeps original evidence immutable and claims the audit in the same locked transaction', () => {
    const source = read('action-engine.kernel.ts'),
      claim = compact(method(source, 'claimExecution'));
    expect(claim.indexOf('awaitthis.lockExecution(')).toBeLessThan(
      claim.indexOf('awaitthis.assertCanonicalClaim('),
    );
    expect(claim.indexOf('awaittx.actionAttempt.create(')).toBeLessThan(
      claim.indexOf('awaitthis.recordClaimPolicy('),
    );
    expect(claim).not.toMatch(
      /policyEvidenceJson:|policyValidUntil:|approvalBindingHash:|policyContextHash:/,
    );
    const audit = compact(method(source, 'recordClaimPolicy'));
    expect(audit).toContain('awaitthis.claimEvidence.audit.log(');
    expect(audit).toMatch(/},tx,?\)/);
    expect(audit).not.toMatch(/tryLog|\.auditLog\.(create|update)|catch\(/);
    expect(audit).toContain(
      'originalPolicyContextHash:execution.policyContextHash',
    );
    expect(audit).toContain('attemptId:attempt.id');
  });
  it('routes the finite A22 / R13 transition through the same canonical claim owner', () => {
    const a22 = readFileSync(
      join(__dirname, '../package5-wave1/package5-wave1.service.ts'),
      'utf8',
    );
    const begin = compact(method(a22, 'begin'));
    expect(begin).toContain('RC_DURABLE_COMMANDS.has(execution.capability)');
    expect(begin).toContain(
      'expenseReminderPreferenceTransition(before,input.configJson)',
    );
    expect(begin).toContain('this.kernel.claimExecution(');
    expect(begin.indexOf('this.kernel.claimExecution(')).toBeLessThan(
      begin.indexOf('tx.actionAttempt.create('),
    );
    const before = { enabled_capabilities: ['other-existing'] };
    expect(
      expenseReminderPreferenceTransition(before, {
        enabled_capabilities: ['weekly_expense_reminders', 'other-existing'],
      }),
    ).toBe(true);
    expect(
      expenseReminderPreferenceTransition(
        {
          enabled_capabilities: ['weekly_expense_reminders', 'other-existing'],
        },
        before,
      ),
    ).toBe(true);
    for (const next of [
      before,
      {},
      { enabled_capabilities: ['weekly_expense_reminders'] },
      { enabled_capabilities: ['different', 'weekly_expense_reminders'] },
    ])
      expect(expenseReminderPreferenceTransition(before, next)).toBe(false);
  });
  it('cannot use a missing/stale claim audit or UNKNOWN to cross dispatch', () => {
    const source = read('action-engine.kernel.ts'),
      dispatch = compact(method(source, 'updateDispatch'));
    for (const guard of [
      'DURABLE_POLICY_AUDIT_REQUIRED',
      'DURABLE_CLAIM_POLICY_EXPIRED',
      'DURABLE_CLAIM_POLICY_INVALID',
      'ExternalDispatchState.NOT_CROSSED',
      'awaitthis.assertCanonicalClaim(',
    ])
      expect(dispatch).toContain(guard);
    const claim = compact(method(source, 'claimExecution'));
    expect(claim).toContain('execution.state!==ActionExecutionState.READY');
    expect(read('action-engine.policy-registry.ts')).toContain(
      'validityMs: 60_000',
    );
    const binding = compact(read('action-engine.approval-binding.ts'));
    expect(binding).toContain("execution.approvalRequirement==='NONE'");
    expect(binding).toContain('policy.policyValidUntil<=now');
    expect(binding).toContain('!this.policyResolver.verifyApprovalBinding(');
    expect(binding).not.toMatch(
      /execution\.(policyValidUntil|policyEvidenceJson|policyContextHash)\s*=/,
    );
  });
});
