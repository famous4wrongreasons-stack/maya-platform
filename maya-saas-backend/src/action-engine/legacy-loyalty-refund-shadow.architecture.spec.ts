import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');
const REPOSITORY_ROOT = resolve(SRC_ROOT, '..', '..');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('P4-03 legacy loyalty refund Shadow architecture', () => {
  it('stops at planShadow with no value, grant, or provider executor', () => {
    const shadowService = source(
      join(SRC_ROOT, 'loyalty', 'legacy-loyalty-refund-shadow.service.ts'),
    );
    const registry = source(
      join(SRC_ROOT, 'action-engine', 'action-engine.registry.ts'),
    );

    expect(shadowService).toContain('this.actionEngine.planShadow({');
    expect(shadowService).not.toContain('executeWithReceipt');
    expect(shadowService).not.toContain('loyaltyTransaction.create');
    expect(shadowService).not.toContain('loyaltyTransaction.update');
    expect(shadowService).not.toContain('loyaltyAccount.update');
    expect(shadowService).not.toContain('loyaltyRedemptionGrant.create');
    expect(shadowService).not.toContain('loyaltyRedemption.create');
    expect(shadowService).not.toContain('YClients');
    expect(registry).toMatch(
      /actionClass: 'refund_legacy_loyalty',[\s\S]{0,1200}policyDecision: ActionPolicyDecision\.SHADOW_ONLY,[\s\S]{0,900}autonomyLevel: 'L2_5_SHADOW',[\s\S]{0,900}executorKey: 'shadow\.none'/,
    );
  });

  it('requires exact original debit and canonical cancellation evidence', () => {
    const shadowService = source(
      join(SRC_ROOT, 'loyalty', 'legacy-loyalty-refund-shadow.service.ts'),
    );

    expect(shadowService).toContain("actionClass: 'redeem_legacy_loyalty'");
    expect(shadowService).toContain('this.prisma.loyaltyTransaction.findMany');
    expect(shadowService).toContain(
      'row.externalRef !== providerRecordIdentityHash',
    );
    expect(shadowService).toContain("actionClass: 'cancel_appointment'");
    expect(shadowService).toContain("type: 'appointment.removed'");
    expect(shadowService).toContain(
      'appointment.mayaClientId !== clientLink.client.id',
    );
  });

  it('keeps the isolated Python adapter free of identity guessing and mutations', () => {
    const bridge = source(
      join(
        REPOSITORY_ROOT,
        'ai администратор',
        'maya_loyalty_refund_shadow_bridge.py',
      ),
    );

    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+database\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+loyalty\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+yclients\b/m);
    expect(bridge).not.toContain('find_client_by_phone');
    expect(bridge).not.toContain('add_loyalty_transaction');
    expect(bridge).not.toContain('refund_for_cancelled_record');
    expect(bridge).not.toContain('cancel_booking');
    expect(bridge).toContain('"newPathValueMutations": 0');
    expect(bridge).toContain('"newPathProviderWrites": 0');
  });

  it('does not wire the fourth fixture Shadow into production refund owners', () => {
    const loyalty = source(
      join(REPOSITORY_ROOT, 'ai администратор', 'loyalty.py'),
    );
    const refund = loyalty.slice(
      loyalty.indexOf('def refund_for_cancelled_record'),
      loyalty.indexOf('def lazy_backfill_for_client'),
    );

    expect(refund).not.toContain('maya_loyalty_refund_shadow_bridge');
    expect(refund).toContain('database.loyalty_redemptions_for_record(');
    expect(refund).toContain('database.add_loyalty_transaction(');
    expect(refund).toContain('type_="refund"');
  });
});
