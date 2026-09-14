import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');
const REPOSITORY_ROOT = resolve(SRC_ROOT, '..', '..');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('P4-03 legacy loyalty expiry Shadow architecture', () => {
  it('stops canonical expiry at planShadow with no value or provider executor', () => {
    const shadowService = source(
      join(SRC_ROOT, 'loyalty', 'legacy-loyalty-expiry-shadow.service.ts'),
    );
    const registry = source(
      join(SRC_ROOT, 'action-engine', 'action-engine.registry.ts'),
    );

    expect(shadowService).toContain('this.actionEngine.planShadow({');
    expect(shadowService).not.toContain('executeWithReceipt');
    expect(shadowService).not.toContain('loyaltyTransaction.create');
    expect(shadowService).not.toContain('loyaltyTransaction.update');
    expect(shadowService).not.toContain('loyaltyAccount.update');
    expect(shadowService).not.toContain('LoyaltyService');
    expect(shadowService).not.toContain('YClients');
    expect(registry).toMatch(
      /actionClass: 'expire_legacy_loyalty',[\s\S]{0,1100}policyDecision: ActionPolicyDecision\.SHADOW_ONLY,[\s\S]{0,900}autonomyLevel: 'L2_5_SHADOW',[\s\S]{0,900}executorKey: 'shadow\.none'/,
    );
  });

  it('requires canonical mirror completeness before asserting inactivity', () => {
    const shadowService = source(
      join(SRC_ROOT, 'loyalty', 'legacy-loyalty-expiry-shadow.service.ts'),
    );

    expect(shadowService).toContain('this.prisma.reconciliationRun.findFirst');
    expect(shadowService).toContain("completeness: 'complete'");
    expect(shadowService).toContain('windowFrom: { lte: windowStartAt }');
    expect(shadowService).toContain('windowTo: { gte: evaluatedAt }');
    expect(shadowService).toContain("attendance: 'arrived'");
    expect(shadowService).toContain('mayaClientId: clientLink.client.id');
  });

  it('keeps the isolated Python adapter free of identity guessing and mutations', () => {
    const bridge = source(
      join(
        REPOSITORY_ROOT,
        'ai администратор',
        'maya_loyalty_expiry_shadow_bridge.py',
      ),
    );

    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+database\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+loyalty\b/m);
    expect(bridge).not.toContain('find_client_by_phone');
    expect(bridge).not.toContain('YClientsAPI');
    expect(bridge).not.toContain('add_loyalty_transaction');
    expect(bridge).not.toContain('redeem_loyalty_points');
    expect(bridge).toContain('"newPathValueMutations": 0');
    expect(bridge).toContain('"newPathProviderWrites": 0');
  });

  it('does not wire the second fixture Shadow into the production expiry job', () => {
    const loyalty = source(
      join(REPOSITORY_ROOT, 'ai администратор', 'loyalty.py'),
    );
    const expiryJob = loyalty.slice(
      loyalty.indexOf('async def run_expiry_job'),
      loyalty.indexOf('async def run_loyalty_job'),
    );

    expect(expiryJob).not.toContain('maya_loyalty_expiry_shadow_bridge');
    expect(expiryJob).toContain('database.add_loyalty_transaction(');
    expect(expiryJob).toContain('type_="expire"');
  });
});
