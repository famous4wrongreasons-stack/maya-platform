import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');
const REPOSITORY_ROOT = resolve(SRC_ROOT, '..', '..');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('P4-03 legacy loyalty earn Shadow architecture', () => {
  it('stops the canonical path at planShadow with no value or provider executor', () => {
    const shadowService = source(
      join(SRC_ROOT, 'loyalty', 'legacy-loyalty-shadow.service.ts'),
    );
    const shadowController = source(
      join(SRC_ROOT, 'loyalty', 'legacy-loyalty-shadow.controller.ts'),
    );
    const registry = source(
      join(SRC_ROOT, 'action-engine', 'action-engine.registry.ts'),
    );

    expect(shadowService).toContain('this.actionEngine.planShadow({');
    expect(shadowService).not.toContain('executeWithReceipt');
    expect(shadowService).not.toContain('loyaltyTransaction.create');
    expect(shadowService).not.toContain('loyaltyAccount.update');
    expect(shadowService).not.toContain('LoyaltyService');
    expect(shadowController).not.toContain('LoyaltyService');
    expect(registry).toMatch(
      /actionClass: 'earn_legacy_loyalty',[\s\S]{0,900}policyDecision: ActionPolicyDecision\.SHADOW_ONLY,[\s\S]{0,900}autonomyLevel: 'L2_5_SHADOW',[\s\S]{0,900}executorKey: 'shadow\.none'/,
    );
  });

  it('keeps the new Python bridge free of database and YClients mutation authority', () => {
    const bridge = source(
      join(
        REPOSITORY_ROOT,
        'ai администратор',
        'maya_loyalty_shadow_bridge.py',
      ),
    );

    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+database\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+loyalty\b/m);
    expect(bridge).not.toContain('YClientsAPI');
    expect(bridge).not.toContain('add_loyalty_transaction');
    expect(bridge).not.toContain('redeem_loyalty_points');
    expect(bridge).toContain('"newPathValueMutations": 0');
    expect(bridge).toContain('"newPathProviderWrites": 0');
  });

  it('does not wire the fixture Shadow into the unchanged production scheduler', () => {
    const loyalty = source(
      join(REPOSITORY_ROOT, 'ai администратор', 'loyalty.py'),
    );
    const earningJob = loyalty.slice(
      loyalty.indexOf('async def run_earning_job'),
      loyalty.indexOf('async def run_expiry_job'),
    );
    expect(earningJob).not.toContain('maya_loyalty_shadow_bridge');
    expect(
      earningJob.match(/database\.add_loyalty_transaction\(/g),
    ).toHaveLength(1);
    expect(earningJob).toContain('points = round(amount * CASHBACK_PCT / 100)');
    expect(earningJob).toContain('visit_record_id=int(record_id)');
  });
});
