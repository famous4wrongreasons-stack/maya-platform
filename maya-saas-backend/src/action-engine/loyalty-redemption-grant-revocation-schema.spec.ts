import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCHEMA = join(ROOT, 'prisma', 'schema.prisma');
const MIGRATION = join(
  ROOT,
  'prisma',
  'migrations',
  '20260830100000_loyalty_redemption_grant_revocation',
  'migration.sql',
);

describe('Cycle 06 Package 4 P4-03 loyalty grant revocation foundation', () => {
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
  const grant = modelBlock('LoyaltyRedemptionGrant');
  const revocation = modelBlock('LoyaltyRedemptionGrantRevocation');

  it('represents revocation as a separate append-only fact', () => {
    expect(grant).toMatch(/revocation\s+LoyaltyRedemptionGrantRevocation\?/);
    expect(grant).not.toMatch(/revoked\s+Boolean/);
    expect(grant).not.toMatch(/revocationStatus\s+String/);
    expect(migration).toContain(
      'CREATE TABLE "LoyaltyRedemptionGrantRevocation"',
    );
    expect(migration).toContain(
      'BEFORE UPDATE OR DELETE ON "LoyaltyRedemptionGrantRevocation"',
    );
  });

  it('requires one tenant-qualified grant and execution binding', () => {
    expect(revocation).toMatch(/grantId\s+String\n/);
    expect(revocation).toMatch(/actionExecutionId\s+String\n/);
    expect(revocation).not.toMatch(/actionExecutionId\s+String\?/);
    expect(revocation).toContain(
      'fields: [grantId, tenantId], references: [id, tenantId]',
    );
    expect(revocation).toContain(
      'fields: [actionExecutionId, tenantId], references: [id, tenantId]',
    );
    expect(revocation).toMatch(/@@unique\(\[grantId, tenantId\]\)/);
    expect(revocation).toMatch(/@@unique\(\[actionExecutionId, tenantId\]\)/);
  });

  it('allows only the accepted server-derived reason codes', () => {
    for (const reason of [
      'client_request',
      'owner_or_admin_request',
      'service_withdrawn',
      'suspected_compromise',
      'policy_invalidated',
    ]) {
      expect(migration).toContain(`'${reason}'`);
    }
    expect(migration).toContain(
      'CONSTRAINT "LoyaltyRedemptionGrantRevocation_reason_check"',
    );
  });

  it('serializes revoke and consume through the same parent grant', () => {
    expect(migration).toContain(
      'CREATE TRIGGER "LoyaltyRedemptionGrantRevocation_active_claim_guard"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "LoyaltyRedemption_non_revoked_claim_guard"',
    );
    expect(migration.match(/FOR UPDATE;/g)).toHaveLength(2);
    expect(migration).toContain(
      'Consumed LoyaltyRedemptionGrant cannot be revoked',
    );
    expect(migration).toContain(
      'Revoked LoyaltyRedemptionGrant cannot be consumed',
    );
  });

  it('keeps expired and revoked terminal states distinct', () => {
    expect(migration).toContain('CURRENT_TIMESTAMP >= grant_expires_at');
    expect(migration).toContain(
      'LoyaltyRedemptionGrantRevocation requires an active grant',
    );
    expect(migration).toContain(
      'LoyaltyRedemption requires an unexpired grant',
    );
    expect(revocation).not.toContain('expiresAt');
  });

  it('does not invent historical revocations or alter runtime schema', () => {
    expect(migration).not.toMatch(/\bINSERT INTO\b/);
    expect(migration).not.toMatch(/\bUPDATE\s+"?[A-Za-z]+"?\s+SET\b/);
    expect(migration).not.toMatch(/\bDELETE FROM\b/);
    expect(migration).not.toMatch(/ALTER TABLE "ActionExecution"/);

    const createdTables = [
      ...migration.matchAll(/CREATE TABLE "([^"]+)"/g),
    ].map(([, name]) => name);
    expect(createdTables).toEqual(['LoyaltyRedemptionGrantRevocation']);
  });

  it('adds only the accepted grant/redemption terminal-state guards', () => {
    expect(migration).not.toMatch(
      /BillingPayment|Expense|ReferralReward|CustomerSubscription|GiftCertificate/,
    );
    expect(migration).toContain('FOREIGN KEY ("grantId", "tenantId")');
    expect(migration).toContain(
      'FOREIGN KEY ("actionExecutionId", "tenantId")',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "LoyaltyRedemptionGrantRevocation_grantId_tenantId_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "LoyaltyRedemptionGrantRevocation_actionExecutionId_tenantId_key"',
    );
  });
});
