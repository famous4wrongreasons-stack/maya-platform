import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

function source(...parts: string[]): string {
  return readFileSync(join(ROOT, ...parts), 'utf8');
}

function modelBlock(schema: string, model: string): string {
  const match = schema.match(new RegExp(`model ${model} \\{[\\s\\S]*?\\n\\}`));
  if (!match) throw new Error(`Missing Prisma model ${model}`);
  return match[0];
}

describe('P4-04 all-4 executable proof contract gaps', () => {
  const schema = source('prisma', 'schema.prisma');
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
  const claimLookup = source(
    'src',
    'referrals',
    'referral-reward-claim.contract.ts',
  );

  it('does not invent a kopeck/percentage to loyalty-point conversion', () => {
    const reward = modelBlock(schema, 'ReferralReward');
    const ledger = modelBlock(schema, 'LoyaltyTransaction');

    expect(issueContract).toContain(
      "source.rewardRepresentation !== 'fixed_money_kopecks'",
    );
    expect(reward).toContain('amountKopecks');
    expect(reward).toContain('percentBasisPoints');
    expect(reward).not.toContain('loyaltyPoints');
    expect(ledger).toMatch(/delta\s+Int/);
    expect(ledger).not.toMatch(/currency|amountKopecks|percentBasisPoints/);
    expect(fulfillService).toContain(
      "valueApplication: 'REFERRAL_REWARD_CLAIM_ONLY'",
    );
    expect(fulfillService).not.toMatch(/pointsPerKopeck|kopecksPerPoint/);
  });

  it('has no accepted exact purchase, visit, or service application target', () => {
    const fulfillment = modelBlock(schema, 'ReferralRewardFulfillment');

    expect(fulfillDto).not.toMatch(
      /(?:purchase|visit|service)(?:_|)(?:id|ref|identity)/i,
    );
    expect(fulfillContract).not.toMatch(
      /fulfillmentTarget|purchaseIdentity|visitIdentity|serviceIdentity/,
    );
    expect(fulfillService).not.toMatch(
      /fulfillmentTarget|purchaseIdentity|visitIdentity|serviceIdentity/,
    );
    expect(fulfillment).not.toMatch(
      /targetRef|purchaseId|visitId|serviceRef|applicationIdentityHash/,
    );
  });

  it('has claim lookup but no crash-safe issue output/re-presentation contract', () => {
    expect(claimLookup).toContain('referralRewardClaimLookup');
    expect(claimLookup).not.toMatch(/issueReferralRewardClaim|randomBytes/);
    expect(issueService).not.toMatch(
      /issueReferralRewardClaim|referralRewardClaimLookup|randomBytes/,
    );
    expect(issueService).not.toContain('codeHash:');
    expect(issueService).not.toContain('claimArtifact');
  });

  it('has per-issuance caps but no accepted scheduler fan-out envelope', () => {
    const registry = source(
      'src',
      'action-engine',
      'action-engine.registry.ts',
    );

    expect(issueContract).toContain('maxRecipients: 2');
    expect(issueContract).toContain('maxIssuanceKopecks: 100_000');
    expect(issueContract).toContain('approvalThresholdKopecks: 1');
    expect(issueContract).not.toMatch(
      /maxReferralsPerRun|maxAggregateRunKopecks|approvalTtlMs|audienceHash/,
    );
    expect(registry).not.toMatch(
      /p4-04\.referral-bulk-envelope|P4_04_BULK_ENVELOPE/,
    );
  });

  it('preserves the prepared one-time claim and immutable binding foundation', () => {
    const fulfillment = modelBlock(schema, 'ReferralRewardFulfillment');
    const migration = source(
      'prisma',
      'migrations',
      '20260829234500_referral_reward_fulfillment',
      'migration.sql',
    );

    expect(fulfillment).toContain('@@unique([rewardId, tenantId])');
    expect(fulfillment).toContain('@@unique([actionExecutionId, tenantId])');
    expect(migration).toContain(
      'CREATE TRIGGER "ReferralRewardFulfillment_immutable_guard"',
    );
  });
});
