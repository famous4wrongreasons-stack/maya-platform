import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');
const REPOSITORY_ROOT = resolve(SRC_ROOT, '..', '..');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('P4-04 issue_referral_rewards Shadow architecture', () => {
  it('stops at planShadow with no issuance, reward, value, provider, or message executor', () => {
    const service = source(
      join(SRC_ROOT, 'referrals', 'referral-reward-issue-shadow.service.ts'),
    );
    const controller = source(
      join(SRC_ROOT, 'referrals', 'referral-reward-issue-shadow.controller.ts'),
    );
    const registry = source(
      join(SRC_ROOT, 'action-engine', 'action-engine.registry.ts'),
    );

    expect(service).toContain('this.actionEngine.planShadow({');
    expect(service).not.toContain('executeWithReceipt');
    expect(service).not.toMatch(
      /referralRewardIssuance\.(?:create|update|upsert)/,
    );
    expect(service).not.toMatch(/referralReward\.(?:create|update|upsert)/);
    expect(service).not.toMatch(
      /loyalty(?:Account|Transaction)\.(?:create|update|upsert)/,
    );
    expect(service).not.toContain('YClients');
    expect(service).not.toContain('sendMessage');
    expect(service).not.toContain('createHmac');
    expect(controller).not.toContain('Legacy');
    expect(registry).toMatch(
      /actionClass: 'issue_referral_rewards',[\s\S]{0,1100}policyDecision: ActionPolicyDecision\.SHADOW_ONLY,[\s\S]{0,1100}autonomyLevel: 'L2_5_SHADOW',[\s\S]{0,1100}executorKey: 'shadow\.none'/,
    );
  });

  it('binds one issuance and at most two immutable reward slots without a bearer', () => {
    const service = source(
      join(SRC_ROOT, 'referrals', 'referral-reward-issue-shadow.service.ts'),
    );
    const contract = source(
      join(
        SRC_ROOT,
        'action-engine',
        'referral-reward-issue-shadow.contract.ts',
      ),
    );

    expect(service).toContain("referral.status !== 'qualified'");
    expect(service).toContain("state !== 'SUCCEEDED'");
    expect(service).toContain('referral?.rewardIssuance');
    expect(contract).toContain('maxRecipients: 2');
    expect(contract).toContain('maxRewardLiabilityKopecks: 50_000');
    expect(contract).toContain('maxIssuanceLiabilityKopecks: 100_000');
    expect(contract).toContain('approvalThresholdKopecks: 1');
    expect(contract).not.toContain('rawBearer');
    expect(contract).not.toContain('plaintext');
    expect(service).toContain('presentationReference');
    expect(service).not.toMatch(/randomBytes|bearer\s*:/);
  });

  it('keeps the bridge local and disconnected from the production legacy owner', () => {
    const bridge = source(
      join(
        REPOSITORY_ROOT,
        'ai администратор',
        'maya_referral_reward_issue_shadow_bridge.py',
      ),
    );
    const legacyReferral = source(
      join(REPOSITORY_ROOT, 'ai администратор', 'referral.py'),
    );

    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+database\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+referral\b/m);
    expect(bridge).not.toContain('YClientsAPI');
    expect(bridge).not.toContain('save_referral_promo');
    expect(bridge).not.toContain('send_message');
    expect(bridge).toContain('"newPathRewardIssuances": 0');
    expect(bridge).toContain('"newPathRewards": 0');
    expect(bridge).toContain('"newPathLoyaltyValueMutations": 0');
    expect(bridge).toContain('"newPathProviderWrites": 0');
    expect(legacyReferral).not.toContain(
      'maya_referral_reward_issue_shadow_bridge',
    );
    expect(legacyReferral).toContain('database.save_referral_promo(');
  });
});
