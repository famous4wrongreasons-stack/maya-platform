import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');
const REPOSITORY_ROOT = resolve(SRC_ROOT, '..', '..');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('P4-03 legacy loyalty backfill Shadow architecture', () => {
  it('stops at planShadow with no value or provider executor', () => {
    const shadowService = source(
      join(SRC_ROOT, 'loyalty', 'legacy-loyalty-backfill-shadow.service.ts'),
    );
    const registry = source(
      join(SRC_ROOT, 'action-engine', 'action-engine.registry.ts'),
    );

    expect(shadowService).toContain('this.actionEngine.planShadow({');
    expect(shadowService).toContain('this.crm.searchClients(');
    expect(shadowService).not.toContain('executeWithReceipt');
    expect(shadowService).not.toContain('loyaltyTransaction.create');
    expect(shadowService).not.toContain('loyaltyTransaction.update');
    expect(shadowService).not.toContain('loyaltyAccount.update');
    expect(shadowService).not.toContain('getClientRegistry');
    expect(shadowService).not.toContain('updateClientLoyalty');
    expect(shadowService).not.toContain('YClients');
    expect(registry).toMatch(
      /actionClass: 'backfill_legacy_loyalty',[\s\S]{0,1400}policyDecision: ActionPolicyDecision\.SHADOW_ONLY,[\s\S]{0,900}autonomyLevel: 'L2_5_SHADOW',[\s\S]{0,900}executorKey: 'shadow\.none'/,
    );
  });

  it('derives exact client LTV, points, identity, and caps server-side', () => {
    const shadowService = source(
      join(SRC_ROOT, 'loyalty', 'legacy-loyalty-backfill-shadow.service.ts'),
    );

    expect(shadowService).toContain(
      '(candidate) => candidate.id === externalClientId',
    );
    expect(shadowService).toContain('calculateLegacyLoyaltyBackfillPoints(');
    expect(shadowService).toContain(
      'MAYA_LEGACY_LOYALTY_BACKFILL_PER_CLIENT_CAP_POINTS',
    );
    expect(shadowService).toContain(
      'MAYA_LEGACY_LOYALTY_BACKFILL_PER_RUN_CAP_POINTS',
    );
    expect(shadowService).toContain("kind: { in: ['backfill', 'yc_import'] }");
    expect(shadowService).toContain('row.actionExecutionId === null');
  });

  it('keeps the isolated Python adapter free of identity guessing and mutations', () => {
    const bridge = source(
      join(
        REPOSITORY_ROOT,
        'ai администратор',
        'maya_loyalty_backfill_shadow_bridge.py',
      ),
    );

    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+database\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+loyalty\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+yclients\b/m);
    expect(bridge).not.toContain('find_client_by_phone');
    expect(bridge).not.toContain('add_loyalty_transaction');
    expect(bridge).not.toContain('_yc_search_sold_amount');
    expect(bridge).not.toContain('"phone"');
    expect(bridge).toContain('"newPathValueMutations": 0');
    expect(bridge).toContain('"newPathProviderWrites": 0');
  });

  it('does not wire the sixth fixture Shadow into production backfill owners', () => {
    const loyalty = source(
      join(REPOSITORY_ROOT, 'ai администратор', 'loyalty.py'),
    );
    const backfill = loyalty.slice(
      loyalty.indexOf('def lazy_backfill_for_client'),
      loyalty.indexOf('# ─── UI: карточка с балансом'),
    );

    expect(backfill).not.toContain('maya_loyalty_backfill_shadow_bridge');
    expect(backfill).toContain('_yc_search_sold_amount(phone)');
    expect(backfill).toContain('database.add_loyalty_transaction(');
    expect(backfill).toContain('type_="backfill"');
    expect(backfill).toContain('async def run_backfill_job');
  });
});
