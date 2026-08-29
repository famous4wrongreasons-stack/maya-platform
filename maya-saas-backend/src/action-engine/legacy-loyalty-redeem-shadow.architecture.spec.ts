import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');
const REPOSITORY_ROOT = resolve(SRC_ROOT, '..', '..');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('P4-03 legacy loyalty redemption Shadow architecture', () => {
  it('stops at planShadow with no value, grant, or provider executor', () => {
    const shadowService = source(
      join(SRC_ROOT, 'loyalty', 'legacy-loyalty-redemption-shadow.service.ts'),
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
      /actionClass: 'redeem_legacy_loyalty',[\s\S]{0,1200}policyDecision: ActionPolicyDecision\.SHADOW_ONLY,[\s\S]{0,900}autonomyLevel: 'L2_5_SHADOW',[\s\S]{0,900}executorKey: 'shadow\.none'/,
    );
  });

  it('requires successful canonical appointment evidence and exact mirror identity', () => {
    const shadowService = source(
      join(SRC_ROOT, 'loyalty', 'legacy-loyalty-redemption-shadow.service.ts'),
    );

    expect(shadowService).toContain('this.prisma.actionExecution.findFirst');
    expect(shadowService).toContain("actionClass: 'create_appointment'");
    expect(shadowService).toContain("state: 'SUCCEEDED'");
    expect(shadowService).toContain('tenantId_crmProvider_crmExternalId');
    expect(shadowService).toContain(
      'appointment.mayaClientId !== clientLink.client.id',
    );
    expect(shadowService).toContain(
      'safeServiceIds?.includes(providerServiceId)',
    );
  });

  it('keeps the isolated Python adapter free of identity guessing and mutation owners', () => {
    const bridge = source(
      join(
        REPOSITORY_ROOT,
        'ai администратор',
        'maya_loyalty_redemption_shadow_bridge.py',
      ),
    );

    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+database\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+loyalty\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+yclients\b/m);
    expect(bridge).not.toContain('find_client_by_phone');
    expect(bridge).not.toContain('reserve_loyalty_points');
    expect(bridge).not.toContain('redeem_loyalty_points');
    expect(bridge).not.toContain('mark_record_loyalty_redemption');
    expect(bridge).toContain('"newPathValueMutations": 0');
    expect(bridge).toContain('"newPathProviderWrites": 0');
  });

  it('does not wire the third fixture Shadow into production redemption', () => {
    const loyalty = source(
      join(REPOSITORY_ROOT, 'ai администратор', 'loyalty.py'),
    );
    const redemption = loyalty.slice(
      loyalty.indexOf('def apply_redemption_for_booking'),
      loyalty.indexOf('def refund_for_cancelled_record'),
    );

    expect(redemption).not.toContain('maya_loyalty_redemption_shadow_bridge');
    expect(redemption).toContain('database.finalize_loyalty_reservation(');
    expect(redemption).toContain('database.redeem_loyalty_points(');
    expect(redemption).toContain('_yc.mark_record_loyalty_redemption(');
  });
});
