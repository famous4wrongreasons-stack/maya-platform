import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const source = (...parts: string[]): string =>
  readFileSync(join(ROOT, ...parts), 'utf8');

describe('P4-04 contract-to-value runtime alignment ratchet', () => {
  const issueContract = source(
    'src',
    'action-engine',
    'referral-reward-issue-shadow.contract.ts',
  );
  const issueService = source(
    'src',
    'referrals',
    'referral-reward-issue-shadow.service.ts',
  );
  const fulfillContract = source(
    'src',
    'action-engine',
    'referral-reward-fulfill-shadow.contract.ts',
  );
  const fulfillDto = source(
    'src',
    'referrals',
    'dto',
    'referral-reward-fulfill-shadow.dto.ts',
  );
  const fulfillService = source(
    'src',
    'referrals',
    'referral-reward-fulfill-shadow.service.ts',
  );
  const presentation = source(
    'src',
    'referrals',
    'referral-reward-claim.contract.ts',
  );
  const presentationService = source(
    'src',
    'referrals',
    'referral-reward-presentation.service.ts',
  );
  const envelope = source(
    'src',
    'action-engine',
    'referral-reward-scheduler-envelope.contract.ts',
  );
  const envelopeService = source(
    'src',
    'referrals',
    'referral-reward-scheduler-envelope.service.ts',
  );

  it('freezes native discount denominations and never converts them to points', () => {
    expect(issueContract).toContain(
      "'FIXED_MONEY_DISCOUNT' | 'PERCENT_DISCOUNT'",
    );
    expect(issueService).toContain('liabilityCapKopecks');
    expect(issueService).toContain('REFERRAL_REWARD_VALUE_CONTRACT');
    expect(fulfillService).toContain(
      "valueApplication: 'EXACT_TARGET_DISCOUNT_ENTITLEMENT'",
    );
    for (const text of [
      issueContract,
      issueService,
      fulfillContract,
      fulfillService,
    ]) {
      expect(text).not.toMatch(
        /pointsPerKopeck|kopecksPerPoint|LoyaltyTransaction/,
      );
    }
  });

  it('requires an exact server-derived appointment/visit/service target', () => {
    expect(fulfillDto).toContain('target_external_record_id');
    expect(fulfillContract).toContain('appointment_visit_payment.v1');
    expect(fulfillContract).toContain('targetIdentityHash');
    expect(fulfillService).toContain('tenantId_crmProvider_crmExternalId');
    expect(fulfillService).toContain('serviceIds');
    expect(fulfillService).not.toContain('loyaltyAccount.findUnique');
  });

  it('centralizes crash-safe deterministic presentation without raw persistence', () => {
    expect(presentation).toContain('referralRewardPresentation');
    expect(presentation).toContain('referralRewardClaimLookup');
    expect(presentation).toContain('presentationKeyVersion');
    expect(issueService).toContain('presentationReference');
    expect(issueService).toContain('codeHash');
    expect(issueService).not.toMatch(/randomBytes|bearer\s*:/);
    expect(presentation).not.toMatch(/prisma|\.create\(\s*\{|\.update\(\s*\{/);
    expect(presentationService).toContain('config.presentationKeys.get');
    expect(presentationService).toContain(
      'material.codeHash !== reward.codeHash',
    );
    expect(presentationService).not.toMatch(/\.create\(|\.update\(|\.upsert\(/);
  });

  it('enforces deterministic scheduler envelope, bounded fan-out, caps, and resume', () => {
    expect(envelope).toContain('maxReferralsPerEnvelope');
    expect(envelope).toContain('maxRecipientsPerEnvelope');
    expect(envelope).toContain('maxAggregateEnvelopeLiabilityKopecks');
    expect(envelope).toContain('OWNER_APPROVAL_REQUIRED');
    expect(envelope).toContain('BOUNDED_PER_REFERRAL_EXECUTIONS');
    expect(envelope).toContain('remainingReferralRewardSchedulerChildren');
    expect(envelopeService).toContain('this.actionEngine.planShadow({');
    expect(envelopeService).toContain("type: 'scheduler'");
    expect(envelopeService).toContain('valueMutations: 0');
  });

  it('keeps all aligned capabilities physically Shadow-only', () => {
    const registry = source(
      'src',
      'action-engine',
      'action-engine.registry.ts',
    );
    expect(registry).toContain(
      'policyDecision: ActionPolicyDecision.SHADOW_ONLY',
    );
    expect(registry).toContain("autonomyLevel: 'L2_5_SHADOW'");
    expect(registry).toContain("executorKey: 'shadow.none'");
  });
});
