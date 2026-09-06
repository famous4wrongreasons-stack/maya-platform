import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');
const REPOSITORY_ROOT = resolve(SRC_ROOT, '..', '..');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('P4-03 legacy loyalty import Shadow architecture', () => {
  it('stops at planShadow with no value or provider executor', () => {
    const shadowService = source(
      join(SRC_ROOT, 'loyalty', 'legacy-loyalty-import-shadow.service.ts'),
    );
    const registry = source(
      join(SRC_ROOT, 'action-engine', 'action-engine.registry.ts'),
    );

    expect(shadowService).toContain('this.actionEngine.planShadow({');
    expect(shadowService).toContain(
      'this.crm.getClientLoyaltyEvidenceByExternalIdReadOnly(',
    );
    expect(shadowService).not.toContain('executeWithReceipt');
    expect(shadowService).not.toContain('loyaltyTransaction.create');
    expect(shadowService).not.toContain('loyaltyTransaction.update');
    expect(shadowService).not.toContain('loyaltyAccount.create');
    expect(shadowService).not.toContain('loyaltyAccount.update');
    expect(shadowService).not.toContain('updateClientLoyalty');
    expect(shadowService).not.toContain('YClients');
    expect(registry).toMatch(
      /actionClass: 'import_legacy_loyalty_balance',[\s\S]{0,1200}policyDecision: ActionPolicyDecision\.SHADOW_ONLY,[\s\S]{0,900}autonomyLevel: 'L2_5_SHADOW',[\s\S]{0,900}executorKey: 'shadow\.none'/,
    );
  });

  it('derives provider/card evidence and exact delta server-side', () => {
    const shadowService = source(
      join(SRC_ROOT, 'loyalty', 'legacy-loyalty-import-shadow.service.ts'),
    );

    expect(shadowService).toContain(
      'providerSnapshot.external_client_id !== externalClientId',
    );
    expect(shadowService).toContain('!providerSnapshot.external_card_id');
    expect(shadowService).toContain(
      'providerSnapshot.balance - account.balance',
    );
    expect(shadowService).toContain("kind: 'yc_import'");
    expect(shadowService).toContain('row.actionExecutionId === null');
    expect(shadowService).toContain(
      'row.externalRef !== providerCardIdentityHash',
    );
  });

  it('uses a provider evidence read that cannot register an ambiguous identity', () => {
    const crmService = source(join(SRC_ROOT, 'crm', 'crm.service.ts'));
    const readOnlyStart = crmService.indexOf(
      'async getClientLoyaltyEvidenceByExternalIdReadOnly',
    );
    const mutatingStart = crmService.indexOf(
      'getClientLoyalty(tenantId:',
      readOnlyStart,
    );
    const readOnlyMethod = crmService.slice(readOnlyStart, mutatingStart);

    expect(readOnlyStart).toBeGreaterThan(0);
    expect(mutatingStart).toBeGreaterThan(readOnlyStart);
    expect(readOnlyMethod).toContain('this.getClientRegistry(scopedTenantId)');
    expect(readOnlyMethod).toContain(
      '(candidate) => candidate.external_id === exactExternalId',
    );
    expect(readOnlyMethod).toContain(
      'loyalty.external_client_id === exactExternalId',
    );
    expect(readOnlyMethod).not.toContain('tryRegisterCrmClient');
    expect(readOnlyMethod).not.toContain('.create(');
    expect(readOnlyMethod).not.toContain('.update(');
  });

  it('keeps the isolated Python adapter free of identity guessing and mutations', () => {
    const bridge = source(
      join(
        REPOSITORY_ROOT,
        'ai администратор',
        'maya_loyalty_import_shadow_bridge.py',
      ),
    );

    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+database\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+loyalty\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+yclients\b/m);
    expect(bridge).not.toContain('find_client_by_phone');
    expect(bridge).not.toContain('add_loyalty_transaction');
    expect(bridge).not.toContain('import_yclients_loyalty_balance');
    expect(bridge).not.toContain('provider_card_id');
    expect(bridge).not.toContain('"phone"');
    expect(bridge).toContain('"newPathValueMutations": 0');
    expect(bridge).toContain('"newPathProviderWrites": 0');
  });

  it('does not wire the fifth fixture Shadow into production import owners', () => {
    const loyalty = source(
      join(REPOSITORY_ROOT, 'ai администратор', 'loyalty.py'),
    );
    const importPath = loyalty.slice(
      loyalty.indexOf('def import_yclients_loyalty_balance'),
      loyalty.indexOf('def lazy_backfill_for_client'),
    );

    expect(importPath).not.toContain('maya_loyalty_import_shadow_bridge');
    expect(importPath).toContain('_yc_loyalty_card(phone)');
    expect(importPath).toContain('database.add_loyalty_transaction(');
    expect(importPath).toContain('type_="yc_import"');
  });
});
