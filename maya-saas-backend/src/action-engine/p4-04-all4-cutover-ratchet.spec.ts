import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ActionCapabilityRegistry } from './action-engine.registry';
import {
  P4_04_EXECUTABLE_CAPABILITIES,
  P4_04_SCHEDULER_ENVELOPE_CAPABILITY,
} from './p4-04-referral-reward-executable.contract';

const ROOT = join(__dirname, '..', '..', '..');
const LEGACY_OWNER = 'ai администратор/referral.py';
const CANONICAL_OWNER =
  'maya-saas-backend/src/referrals/p4-04-referral-reward-executable.service.ts';

type DirectMutationSubgroup =
  | 'referral_relationship_write'
  | 'referral_resolution_write'
  | 'reward_issue_or_fulfillment_write';

const SUBGROUP_PATTERNS: Readonly<
  Record<DirectMutationSubgroup, readonly RegExp[]>
> = {
  referral_relationship_write: [/database\.create_referral\s*\(/u],
  referral_resolution_write: [
    /database\.set_referral_referee_client\s*\(/u,
    /database\.update_referral_status\s*\(/u,
  ],
  reward_issue_or_fulfillment_write: [/database\.save_referral_promo\s*\(/u],
};

function source(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

function directSubgroups(contents: string): DirectMutationSubgroup[] {
  return (
    Object.entries(SUBGROUP_PATTERNS) as Array<
      [DirectMutationSubgroup, readonly RegExp[]]
    >
  )
    .filter(([, patterns]) =>
      patterns.some((pattern) => pattern.test(contents)),
    )
    .map(([subgroup]) => subgroup);
}

describe('P4-04 all-4 cutover ratchet readiness', () => {
  it('registers all four canonical Action Engine owners plus the bounded envelope', () => {
    const registry = new ActionCapabilityRegistry();
    const expected = [
      P4_04_EXECUTABLE_CAPABILITIES.createReferral,
      P4_04_EXECUTABLE_CAPABILITIES.resolveReferral,
      P4_04_EXECUTABLE_CAPABILITIES.issueRewards,
      P4_04_EXECUTABLE_CAPABILITIES.fulfillReward,
    ];
    expect(
      expected.map((capability) => registry.get(capability).executorKey),
    ).toEqual([
      'referrals.customer-referral',
      'referrals.customer-referral',
      'referrals.reward-issuance',
      'referrals.reward-fulfillment',
    ]);
    expect(
      registry.get(P4_04_SCHEDULER_ENVELOPE_CAPABILITY).approvalRequirement,
    ).toBe('REQUIRED');
    expect(
      registry.get(P4_04_EXECUTABLE_CAPABILITIES.issueRewards)
        .approvalRequirement,
    ).toBe('REQUIRED');
  });

  it('keeps the canonical executor behind Action Engine and out of loyalty points', () => {
    const canonical = source(CANONICAL_OWNER);
    const productionModule = source(
      'maya-saas-backend/src/referrals/referrals.module.ts',
    );
    expect(canonical).toContain('this.actionEngine.executeWithReceipt(');
    expect(canonical).toContain('TransactionIsolationLevel.Serializable');
    expect(canonical).toContain('referralRewardFulfillment.create');
    expect(canonical).not.toContain('loyaltyTransaction.create');
    expect(canonical).not.toContain('loyaltyAccount.update');
    expect(canonical).not.toContain('provider.write');
    expect(productionModule).not.toContain(
      'P404ReferralRewardExecutableService',
    );
  });

  it('locks the currently known pre-cutover owner to exactly three mutation subgroups', () => {
    expect(directSubgroups(source(LEGACY_OWNER)).sort()).toEqual([
      'referral_relationship_write',
      'referral_resolution_write',
      'reward_issue_or_fulfillment_write',
    ]);
  });

  it('detects a new direct owner instead of treating canonical isolation as an exception', () => {
    const syntheticDirectOwner = `
      database.create_referral(payload)
      database.update_referral_status(id, "qualified")
      database.save_referral_promo(referral_id=id)
    `;
    expect(directSubgroups(syntheticDirectOwner).sort()).toEqual([
      'referral_relationship_write',
      'referral_resolution_write',
      'reward_issue_or_fulfillment_write',
    ]);
    expect(directSubgroups('canonicalIngress.execute(request)')).toEqual([]);
  });

  it('preserves all four completed Shadow paths as non-executable planners', () => {
    for (const file of [
      'maya-saas-backend/src/referrals/referral-create-shadow.service.ts',
      'maya-saas-backend/src/referrals/referral-resolve-shadow.service.ts',
      'maya-saas-backend/src/referrals/referral-reward-issue-shadow.service.ts',
      'maya-saas-backend/src/referrals/referral-reward-fulfill-shadow.service.ts',
    ]) {
      const contents = source(file);
      expect(contents).toContain('planShadow(');
      expect(contents).not.toContain('executeWithReceipt(');
      expect(directSubgroups(contents)).toEqual([]);
    }
  });
});
