import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');
const BACKEND_ROOT = resolve(SRC_ROOT, '..');
const REPOSITORY_ROOT = resolve(SRC_ROOT, '..', '..');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('P4-04 fulfill_referral_reward Shadow architecture', () => {
  it('stops at planShadow with no fulfillment, reward, loyalty, provider, or message executor', () => {
    const service = source(
      join(SRC_ROOT, 'referrals', 'referral-reward-fulfill-shadow.service.ts'),
    );
    const registry = source(
      join(SRC_ROOT, 'action-engine', 'action-engine.registry.ts'),
    );

    expect(service).toContain('this.actionEngine.planShadow({');
    expect(service).not.toContain('executeWithReceipt');
    expect(service).not.toMatch(
      /referralRewardFulfillment\.(?:create|update|upsert|delete)/,
    );
    expect(service).not.toMatch(/referralReward\.(?:create|update|upsert)/);
    expect(service).not.toMatch(
      /loyalty(?:Account|Transaction)\.(?:create|update|upsert)/,
    );
    expect(service).not.toContain('YClients');
    expect(service).not.toContain('sendMessage');
    expect(registry).toMatch(
      /actionClass: 'fulfill_referral_reward',[\s\S]{0,1200}policyDecision: ActionPolicyDecision\.SHADOW_ONLY,[\s\S]{0,1200}autonomyLevel: 'L2_5_SHADOW',[\s\S]{0,1200}executorKey: 'shadow\.none'/,
    );
  });

  it('keeps the raw bearer transient and centralizes issue/fulfill lookup', () => {
    const service = source(
      join(SRC_ROOT, 'referrals', 'referral-reward-fulfill-shadow.service.ts'),
    );
    const lookup = source(
      join(SRC_ROOT, 'referrals', 'referral-reward-claim.contract.ts'),
    );
    const actionRequest = service.slice(
      service.indexOf('const canonicalInput ='),
      service.indexOf("return {\n      outcome: 'planned'"),
    );

    expect(service).toContain('referralRewardClaimLookup(');
    expect(service).not.toContain('createHmac');
    expect(lookup).toContain('referralRewardPresentation');
    expect(lookup).toContain('referralRewardClaimLookup');
    expect(actionRequest).not.toContain('normalizedClaim');
    expect(actionRequest).not.toContain('reward_claim');
    expect(actionRequest).not.toMatch(/\bcodeHash\b/);
    expect(actionRequest).toContain('claimBindingHash');
    expect(actionRequest).toContain('fulfillmentIdentityHash');
  });

  it('relies on tenant-qualified one-time DB uniqueness and immutable fulfillment binding', () => {
    const schema = source(join(BACKEND_ROOT, 'prisma', 'schema.prisma'));
    const migration = source(
      join(
        BACKEND_ROOT,
        'prisma',
        'migrations',
        '20260829234500_referral_reward_fulfillment',
        'migration.sql',
      ),
    );

    expect(schema).toMatch(
      /model ReferralRewardFulfillment[\s\S]*@@unique\(\[rewardId, tenantId\]\)/,
    );
    expect(schema).toMatch(
      /model ReferralRewardFulfillment[\s\S]*@@unique\(\[actionExecutionId, tenantId\]\)/,
    );
    expect(migration).toContain(
      'CREATE TRIGGER "ReferralRewardFulfillment_immutable_guard"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "ReferralRewardFulfillment_rewardId_tenantId_key"',
    );
  });

  it('keeps the bridge disconnected from the legacy owner and exposes only zero side effects', () => {
    const bridge = source(
      join(
        REPOSITORY_ROOT,
        'ai администратор',
        'maya_referral_reward_fulfill_shadow_bridge.py',
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
    expect(bridge).toContain('"newPathFulfillments": 0');
    expect(bridge).toContain('"newPathLoyaltyValueMutations": 0');
    expect(bridge).toContain('"newPathProviderWrites": 0');
    expect(legacyReferral).not.toContain(
      'maya_referral_reward_fulfill_shadow_bridge',
    );
  });
});
