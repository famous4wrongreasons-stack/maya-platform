import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');
const REPOSITORY_ROOT = resolve(SRC_ROOT, '..', '..');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('P4-04 resolve_customer_referral Shadow architecture', () => {
  it('stops at planShadow with no referral, reward, provider, or message executor', () => {
    const service = source(
      join(SRC_ROOT, 'referrals', 'referral-resolve-shadow.service.ts'),
    );
    const controller = source(
      join(SRC_ROOT, 'referrals', 'referral-resolve-shadow.controller.ts'),
    );
    const registry = source(
      join(SRC_ROOT, 'action-engine', 'action-engine.registry.ts'),
    );

    expect(service).toContain('this.actionEngine.planShadow({');
    expect(service).not.toContain('executeWithReceipt');
    expect(service).not.toMatch(/customerReferral\.(?:create|update|upsert)/);
    expect(service).not.toMatch(
      /referralReward(?:Issuance|Fulfillment)?\.(?:create|update|upsert)/,
    );
    expect(service).not.toContain('YClients');
    expect(service).not.toContain('sendMessage');
    expect(controller).not.toContain('Legacy');
    expect(registry).toMatch(
      /actionClass: 'resolve_customer_referral',[\s\S]{0,900}policyDecision: ActionPolicyDecision\.SHADOW_ONLY,[\s\S]{0,900}autonomyLevel: 'L2_5_SHADOW',[\s\S]{0,900}executorKey: 'shadow\.none'/,
    );
  });

  it('keeps the bridge free of business and external mutation authority', () => {
    const bridge = source(
      join(
        REPOSITORY_ROOT,
        'ai администратор',
        'maya_referral_resolve_shadow_bridge.py',
      ),
    );

    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+database\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+referral\b/m);
    expect(bridge).not.toContain('YClientsAPI');
    expect(bridge).not.toContain('update_referral_status');
    expect(bridge).not.toContain('save_referral_promo');
    expect(bridge).not.toContain('send_message');
    expect(bridge).toContain('"newPathReferralMutations": 0');
    expect(bridge).toContain('"newPathRewardValueMutations": 0');
    expect(bridge).toContain('"newPathProviderWrites": 0');
    expect(bridge).toContain('"newPathMessages": 0');
  });

  it('does not wire the local Shadow fixture into the production legacy owner', () => {
    const legacyReferral = source(
      join(REPOSITORY_ROOT, 'ai администратор', 'referral.py'),
    );

    expect(legacyReferral).not.toContain('maya_referral_resolve_shadow_bridge');
    expect(legacyReferral).toContain('database.update_referral_status(');
    expect(legacyReferral).toContain('database.save_referral_promo(');
  });
});
