import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCHEMA = join(ROOT, 'prisma', 'schema.prisma');
const MIGRATION = join(
  ROOT,
  'prisma',
  'migrations',
  '20260901130000_p4_04_contract_to_value',
  'migration.sql',
);

describe('P4-04 contract-to-value schema foundation', () => {
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

  const program = modelBlock('ReferralProgram');
  const reward = modelBlock('ReferralReward');
  const fulfillment = modelBlock('ReferralRewardFulfillment');
  const appointment = modelBlock('Appointment');
  const actionExecution = modelBlock('ActionExecution');

  it('represents fixed-money or percentage policy without points conversion', () => {
    expect(program).toMatch(/inviterRewardPercentBasisPoints\s+Int\?/);
    expect(program).toMatch(/inviteeRewardPercentBasisPoints\s+Int\?/);
    expect(program).toMatch(/inviterRewardLiabilityCapKopecks\s+Int\?/);
    expect(program).toMatch(/inviteeRewardLiabilityCapKopecks\s+Int\?/);
    expect(migration).toContain(
      'CONSTRAINT "ReferralProgram_inviter_reward_contract_check"',
    );
    expect(migration).toContain(
      'CONSTRAINT "ReferralProgram_invitee_reward_contract_check"',
    );
    expect(migration).not.toMatch(
      /loyaltyPoints|pointsPerKopeck|kopecksPerPoint/i,
    );
  });

  it('freezes reward liability and presentation key version immutably', () => {
    expect(reward).toMatch(/liabilityCapKopecks\s+Int\?/);
    expect(reward).toMatch(/liabilityCurrency\s+String\?/);
    expect(reward).toMatch(/presentationKeyVersion\s+String\?/);
    expect(migration).toContain(
      'CREATE TRIGGER "ReferralReward_contract_to_value_insert_guard"',
    );
    expect(migration).toContain('"liabilityCapKopecks" = "amountKopecks"');
    expect(migration).not.toMatch(/bearerSecret|rawBearer|plaintextCode/i);
    expect(migration).not.toMatch(
      /DROP TRIGGER "ReferralReward_immutable_guard"/,
    );
  });

  it('binds fulfillment to an exact tenant-qualified appointment and value', () => {
    expect(fulfillment).toMatch(/targetAppointmentId\s+String\?/);
    expect(fulfillment).toMatch(/targetIdentityHash\s+String\?/);
    expect(fulfillment).toMatch(/eligibleAmountKopecks\s+Int\?/);
    expect(fulfillment).toMatch(/appliedAmountKopecks\s+Int\?/);
    expect(fulfillment).toContain(
      'fields: [targetAppointmentId, tenantId], references: [id, tenantId]',
    );
    expect(fulfillment).toContain(
      '@@unique([tenantId, targetIdentityHash], map: "ReferralRewardFulfillment_tenant_target_hash_key")',
    );
    expect(appointment).toContain('@@unique([id, tenantId])');
    expect(migration).toContain(
      'CREATE TRIGGER "ReferralRewardFulfillment_contract_to_value_insert_guard"',
    );
  });

  it('rejects wrong Client, unresolved identity, excess value, and changed target', () => {
    expect(migration).toContain(
      'appointment_row."mayaClientId" IS DISTINCT FROM reward_row."recipientClientId"',
    );
    expect(migration).toContain('FROM "UnresolvedClientIdentityHold"');
    expect(migration).toContain(
      'NEW."appliedAmountKopecks" > reward_row."liabilityCapKopecks"',
    );
    expect(migration).toContain(
      'NEW."targetAppointmentId" IS DISTINCT FROM OLD."targetAppointmentId"',
    );
    expect(migration).toContain(
      'NEW."targetIdentityHash" IS DISTINCT FROM OLD."targetIdentityHash"',
    );
  });

  it('keeps historical rows nullable and performs no fake backfill', () => {
    for (const column of [
      'liabilityCapKopecks',
      'liabilityCurrency',
      'presentationKeyVersion',
      'targetAppointmentId',
      'targetIdentityHash',
      'eligibleAmountKopecks',
      'appliedAmountKopecks',
    ]) {
      expect(migration).toContain(`ADD COLUMN "${column}"`);
      expect(migration).not.toContain(`ADD COLUMN "${column}" TEXT NOT NULL`);
      expect(migration).not.toContain(
        `ADD COLUMN "${column}" INTEGER NOT NULL`,
      );
    }
    expect(migration).not.toMatch(/\bINSERT INTO\b/);
    expect(migration).not.toMatch(/\bUPDATE\s+"?[A-Za-z]+"?\s+SET\b/);
  });

  it('uses existing ActionExecution as the deterministic bounded envelope', () => {
    expect(actionExecution).toMatch(/identityFingerprint\s+String/);
    expect(actionExecution).toMatch(/normalizedInputHash\s+String/);
    expect(actionExecution).toMatch(/policyContextHash\s+String\?/);
    expect(actionExecution).toMatch(/approvalBindingHash\s+String\?/);
    expect(migration).not.toMatch(/CREATE TABLE.*(?:Batch|Envelope)/);
    expect(migration).not.toMatch(/ALTER TABLE "ActionExecution"/);
  });

  it('does not alter runtime, loyalty, payment, hold, or other Package 4 domains', () => {
    expect(migration).not.toMatch(
      /ALTER TABLE "(?:LoyaltyAccount|LoyaltyTransaction|BillingPayment|UnresolvedClientIdentityHold|ActionExecution)"/,
    );
    expect(migration).not.toMatch(/CREATE TABLE/);
    expect(migration).not.toMatch(
      /(?:INSERT|UPDATE|DELETE).*?(?:Provider|Payment|Loyalty)/i,
    );
  });
});
