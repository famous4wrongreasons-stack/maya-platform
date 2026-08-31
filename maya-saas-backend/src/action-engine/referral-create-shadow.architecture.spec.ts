import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');
const REPOSITORY_ROOT = resolve(SRC_ROOT, '..', '..');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('P4-04 create_customer_referral Shadow architecture', () => {
  it('stops at planShadow with no referral, reward, provider, or message executor', () => {
    const service = source(
      join(SRC_ROOT, 'referrals', 'referral-create-shadow.service.ts'),
    );
    const controller = source(
      join(SRC_ROOT, 'referrals', 'referral-create-shadow.controller.ts'),
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
      /actionClass: 'create_customer_referral',[\s\S]{0,900}policyDecision: ActionPolicyDecision\.SHADOW_ONLY,[\s\S]{0,900}autonomyLevel: 'L2_5_SHADOW',[\s\S]{0,900}executorKey: 'shadow\.none'/,
    );
  });

  it('keeps the Python bridge free of business and external mutation authority', () => {
    const bridge = source(
      join(
        REPOSITORY_ROOT,
        'ai администратор',
        'maya_referral_create_shadow_bridge.py',
      ),
    );

    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+database\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+referral\b/m);
    expect(bridge).not.toContain('YClientsAPI');
    expect(bridge).not.toContain('create_referral');
    expect(bridge).not.toContain('save_referral_promo');
    expect(bridge).not.toContain('send_message');
    expect(bridge).toContain('"newPathReferralRelationships": 0');
    expect(bridge).toContain('"newPathRewardValueMutations": 0');
    expect(bridge).toContain('"newPathProviderWrites": 0');
    expect(bridge).toContain('"newPathMessages": 0');
  });

  it('does not wire the local Shadow fixture into the unchanged production legacy owner', () => {
    const legacyReferral = source(
      join(REPOSITORY_ROOT, 'ai администратор', 'referral.py'),
    );
    const appModule = source(join(SRC_ROOT, 'app.module.ts'));

    expect(legacyReferral).not.toContain('maya_referral_create_shadow_bridge');
    expect(legacyReferral).toContain('database.create_referral(');
    expect(legacyReferral).toContain('database.save_referral_promo(');
    expect(appModule).toContain('ReferralsModule');
  });
});
