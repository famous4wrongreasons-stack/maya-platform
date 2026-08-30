import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');
const REPOSITORY_ROOT = resolve(SRC_ROOT, '..', '..');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('P4-03 loyalty grant issue Shadow architecture', () => {
  it('stops at planShadow with no grant, code, ledger, or provider executor', () => {
    const shadowService = source(
      join(SRC_ROOT, 'loyalty', 'legacy-loyalty-grant-issue-shadow.service.ts'),
    );
    const registry = source(
      join(SRC_ROOT, 'action-engine', 'action-engine.registry.ts'),
    );

    expect(shadowService).toContain('this.actionEngine.planShadow({');
    expect(shadowService).toContain('this.crm.getServices(');
    expect(shadowService).not.toContain('executeWithReceipt');
    expect(shadowService).not.toContain('loyaltyRedemptionGrant.create');
    expect(shadowService).not.toContain('loyaltyRedemption.create');
    expect(shadowService).not.toContain('loyaltyTransaction.create');
    expect(shadowService).not.toContain('loyaltyAccount.update');
    expect(shadowService).not.toContain('randomUUID');
    expect(shadowService).not.toContain('randomBytes');
    expect(shadowService).not.toContain('generate_redeem_code');
    expect(shadowService).toContain('codeMaterialGenerated: false');
    expect(registry).toMatch(
      /actionClass: 'issue_loyalty_redemption_grant',[\s\S]{0,1500}policyDecision: ActionPolicyDecision\.SHADOW_ONLY,[\s\S]{0,900}autonomyLevel: 'L2_5_SHADOW',[\s\S]{0,900}executorKey: 'shadow\.none'/,
    );
  });

  it('derives client, service, value, allowlist, TTL, and request identity server-side', () => {
    const shadowService = source(
      join(SRC_ROOT, 'loyalty', 'legacy-loyalty-grant-issue-shadow.service.ts'),
    );

    expect(shadowService).toContain('this.crm.getExternalProviderKey(');
    expect(shadowService).toContain(
      '(service) => service.id === requestedServiceId',
    );
    expect(shadowService).toContain(
      'MAYA_LEGACY_LOYALTY_GRANT_ALLOWED_SERVICE_IDS',
    );
    expect(shadowService).toContain(
      'MAYA_LEGACY_LOYALTY_GRANT_PER_GRANT_CAP_POINTS',
    );
    expect(shadowService).toContain('MAYA_LEGACY_LOYALTY_GRANT_TTL_DAYS');
    expect(shadowService).toContain("membership.status !== 'active'");
    expect(shadowService).toContain('legacySourceRef: requestIdentityHash');
    expect(shadowService).toContain('grant.issueExecutionId === null');
  });

  it('keeps the isolated Python adapter free of code generation and mutations', () => {
    const bridge = source(
      join(
        REPOSITORY_ROOT,
        'ai администратор',
        'maya_loyalty_grant_issue_shadow_bridge.py',
      ),
    );

    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+database\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+loyalty\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+yclients\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+secrets\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+qrcode\b/m);
    expect(bridge).not.toContain('generate_redeem_code');
    expect(bridge).not.toContain('create_loyalty_code');
    expect(bridge).not.toContain('"code"');
    expect(bridge).not.toContain('"codeHash"');
    expect(bridge).toContain('"newPathValueMutations": 0');
    expect(bridge).toContain('"newPathProviderWrites": 0');
  });

  it('does not wire the seventh fixture Shadow into production grant issuance', () => {
    const loyalty = source(
      join(REPOSITORY_ROOT, 'ai администратор', 'loyalty.py'),
    );
    const issue = loyalty.slice(
      loyalty.indexOf('def generate_redeem_code'),
      loyalty.indexOf('def consume_redeem_code'),
    );

    expect(issue).not.toContain('maya_loyalty_grant_issue_shadow_bridge');
    expect(issue).toContain('database.loyalty_balance(client_id)');
    expect(issue).toContain('database.loyalty_code_is_free(code)');
    expect(issue).toContain('database.create_loyalty_code(');
  });
});
