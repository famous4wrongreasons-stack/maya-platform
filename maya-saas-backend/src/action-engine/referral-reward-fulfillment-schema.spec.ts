import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCHEMA = join(ROOT, 'prisma', 'schema.prisma');
const MIGRATION = join(
  ROOT,
  'prisma',
  'migrations',
  '20260829234500_referral_reward_fulfillment',
  'migration.sql',
);

describe('Cycle 06 Package 4 referral reward schema foundation', () => {
  const schema = readFileSync(SCHEMA, 'utf8');
  const migration = readFileSync(MIGRATION, 'utf8');
  const modelBlock = (name: string) => {
    const start = schema.indexOf(`model ${name} {`);
    const block = schema.slice(start);
    const end = block.indexOf('\n}');

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThanOrEqual(0);
    return block.slice(0, end + 2);
  };
  const referral = modelBlock('CustomerReferral');
  const issuance = modelBlock('ReferralRewardIssuance');
  const reward = modelBlock('ReferralReward');
  const fulfillment = modelBlock('ReferralRewardFulfillment');

  it('keeps referral creation and qualification as separate bindings', () => {
    expect(referral).toMatch(/createExecutionId\s+String\?/);
    expect(referral).toMatch(/resolutionExecutionId\s+String\?/);
    expect(referral).toMatch(/@@unique\(\[createExecutionId, tenantId\]\)/);
    expect(referral).toMatch(/@@unique\(\[resolutionExecutionId, tenantId\]\)/);
  });

  it('models one issuance operation with one-to-many reward value rows', () => {
    expect(issuance).toMatch(/actionExecutionId\s+String\?/);
    expect(issuance).toMatch(/@@unique\(\[referralId, tenantId\]\)/);
    expect(issuance).toMatch(/@@unique\(\[actionExecutionId, tenantId\]\)/);
    expect(issuance).toMatch(/rewards\s+ReferralReward\[\]/);
    expect(reward).toMatch(/@@unique\(\[issuanceId, tenantId, rewardSlot\]\)/);
  });

  it('makes fulfillment a separate one-time execution claim', () => {
    expect(reward).toMatch(/fulfillment\s+ReferralRewardFulfillment\?/);
    expect(fulfillment).toMatch(/actionExecutionId\s+String\?/);
    expect(fulfillment).toMatch(/@@unique\(\[rewardId, tenantId\]\)/);
    expect(fulfillment).toMatch(/@@unique\(\[actionExecutionId, tenantId\]\)/);
  });

  it('uses tenant-qualified relations and stores only code hashes', () => {
    expect(referral).toContain(
      'fields: [createExecutionId, tenantId], references: [id, tenantId]',
    );
    expect(referral).toContain(
      'fields: [resolutionExecutionId, tenantId], references: [id, tenantId]',
    );
    expect(issuance).toContain(
      'fields: [referralId, tenantId], references: [id, tenantId]',
    );
    expect(reward).toContain(
      'fields: [recipientClientId, tenantId], references: [id, tenantId]',
    );
    expect(fulfillment).toContain(
      'fields: [rewardId, tenantId], references: [id, tenantId]',
    );
    expect(referral).toMatch(/referralCodeHash\s+String/);
    expect(reward).toMatch(/codeHash\s+String/);
    expect(referral).not.toMatch(/\n\s+referralCode\s+String/);
    expect(reward).not.toMatch(/\n\s+code\s+String/);
  });

  it('keeps historical action bindings nullable and performs no backfill', () => {
    for (const field of [
      'createExecutionId',
      'resolutionExecutionId',
      'actionExecutionId',
    ]) {
      expect(migration).toContain(`"${field}" TEXT`);
      expect(migration).not.toContain(`"${field}" TEXT NOT NULL`);
    }
    expect(migration).not.toMatch(/\bINSERT INTO\b/);
    expect(migration).not.toMatch(/\bUPDATE\s+"?[A-Za-z]+"?\s+SET\b/);
  });

  it('enforces immutable bindings, reward facts, and fulfillment', () => {
    expect(migration).toContain(
      'CREATE TRIGGER "ReferralRewardIssuance_qualification_guard"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "CustomerReferral_binding_and_resolution_guard"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "ReferralRewardIssuance_immutable_guard"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "ReferralReward_immutable_guard"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "ReferralRewardFulfillment_immutable_guard"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "ReferralRewardFulfillment_rewardId_tenantId_key"',
    );
  });

  it('creates only the referral/reward aggregate models', () => {
    const createdTables = [
      ...migration.matchAll(/CREATE TABLE "([^"]+)"/g),
    ].map(([, name]) => name);
    expect(createdTables).toEqual([
      'CustomerReferral',
      'ReferralRewardIssuance',
      'ReferralReward',
      'ReferralRewardFulfillment',
    ]);
    expect(migration).not.toMatch(
      /BillingPayment|ExpensePeriodDeclaration|CustomerSubscription|GiftCertificate/,
    );
    expect(migration).not.toMatch(/ALTER TABLE "ActionExecution"/);
  });
});
