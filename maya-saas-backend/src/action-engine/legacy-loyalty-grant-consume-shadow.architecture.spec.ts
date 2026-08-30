import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');
const REPOSITORY_ROOT = resolve(SRC_ROOT, '..', '..');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('P4-03 loyalty grant consume Shadow architecture', () => {
  it('stops at planShadow with no redemption, ledger, balance, grant, or provider write', () => {
    const shadowService = source(
      join(
        SRC_ROOT,
        'loyalty',
        'legacy-loyalty-grant-consume-shadow.service.ts',
      ),
    );
    const registry = source(
      join(SRC_ROOT, 'action-engine', 'action-engine.registry.ts'),
    );

    expect(shadowService).toContain('this.actionEngine.planShadow({');
    expect(shadowService).not.toContain('executeWithReceipt');
    expect(shadowService).not.toContain('loyaltyRedemption.create');
    expect(shadowService).not.toContain('loyaltyRedemption.update');
    expect(shadowService).not.toContain('loyaltyTransaction.create');
    expect(shadowService).not.toContain('loyaltyAccount.update');
    expect(shadowService).not.toContain('loyaltyRedemptionGrant.update');
    expect(shadowService).not.toContain('this.crm.');
    expect(shadowService).not.toContain('$transaction');
    expect(shadowService).toContain('writesPerformed: false');
    expect(registry).toMatch(
      /actionClass: 'consume_loyalty_redemption_grant',[\s\S]{0,1700}policyDecision: ActionPolicyDecision\.SHADOW_ONLY,[\s\S]{0,900}autonomyLevel: 'L2_5_SHADOW',[\s\S]{0,900}executorKey: 'shadow\.none'/,
    );
  });

  it('derives tenant, requester authority, grant claim, cap, and actor server-side', () => {
    const shadowService = source(
      join(
        SRC_ROOT,
        'loyalty',
        'legacy-loyalty-grant-consume-shadow.service.ts',
      ),
    );

    expect(shadowService).toContain('this.prisma.authIdentity.findUnique({');
    expect(shadowService).toContain('tenantId_provider_providerUserId');
    expect(shadowService).toContain("createHmac('sha256', codePepper)");
    expect(shadowService).toContain('tenantId_codeHash');
    expect(shadowService).toContain(
      'MAYA_LEGACY_LOYALTY_GRANT_CONSUME_CASHIER_USER_IDS',
    );
    expect(shadowService).toContain(
      'MAYA_LEGACY_LOYALTY_GRANT_CONSUME_MAX_POINTS',
    );
    expect(shadowService).toContain(
      "grant.issueExecution.state !== 'SUCCEEDED'",
    );
    expect(shadowService).toContain('actorUserId: requester.user.id');
    expect(shadowService).toContain(
      "providerProjectionDecision: 'not_evaluated_in_shadow'",
    );
  });

  it('keeps the transient bearer out of ActionExecution input and evidence', () => {
    const shadowService = source(
      join(
        SRC_ROOT,
        'loyalty',
        'legacy-loyalty-grant-consume-shadow.service.ts',
      ),
    );
    const actionRequestStart = shadowService.indexOf(
      'this.actionEngine.planShadow({',
    );
    const actionRequest = shadowService.slice(
      actionRequestStart,
      shadowService.indexOf('\n    return {', actionRequestStart),
    );

    expect(actionRequest).not.toContain('normalizedCode');
    expect(actionRequest).not.toContain('codeHash,');
    expect(actionRequest).not.toContain('dto.redemption_code');
    expect(actionRequest).toContain('grantIdentityHash');
    expect(actionRequest).toContain('requesterIdentityHash');
  });

  it('keeps the isolated Python adapter free of legacy and provider mutations', () => {
    const bridge = source(
      join(
        REPOSITORY_ROOT,
        'ai администратор',
        'maya_loyalty_grant_consume_shadow_bridge.py',
      ),
    );

    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+database\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+loyalty\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+yclients\b/m);
    expect(bridge).not.toContain('consume_redeem_code');
    expect(bridge).not.toContain('claim_loyalty_code');
    expect(bridge).not.toContain('add_loyalty_transaction');
    expect(bridge).not.toContain('mark_record_loyalty_redemption');
    expect(bridge).toContain('"newPathValueMutations": 0');
    expect(bridge).toContain('"newPathProviderWrites": 0');
  });

  it('does not wire the eighth fixture Shadow into production grant consumption', () => {
    const loyalty = source(
      join(REPOSITORY_ROOT, 'ai администратор', 'loyalty.py'),
    );
    const consume = loyalty.slice(
      loyalty.indexOf('def consume_redeem_code'),
      loyalty.indexOf('\ndef ', loyalty.indexOf('def consume_redeem_code') + 5),
    );

    expect(consume).not.toContain('maya_loyalty_grant_consume_shadow_bridge');
    expect(consume).toContain('database.claim_loyalty_code(');
    expect(consume).toContain('database.add_loyalty_transaction(');
    expect(consume).toContain('_yc.mark_record_loyalty_redemption(');
  });
});
