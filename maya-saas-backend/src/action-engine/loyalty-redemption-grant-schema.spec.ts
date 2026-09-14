import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCHEMA = join(ROOT, 'prisma', 'schema.prisma');
const MIGRATION = join(
  ROOT,
  'prisma',
  'migrations',
  '20260829233000_loyalty_redemption_grant',
  'migration.sql',
);

describe('Cycle 06 Package 4 loyalty redemption grant schema foundation', () => {
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
  const redemption = modelBlock('LoyaltyRedemption');

  it('separates one-to-one issuance from one-time redemption', () => {
    expect(grant).toMatch(/issueExecutionId\s+String\?/);
    expect(grant).toMatch(/@@unique\(\[issueExecutionId, tenantId\]\)/);
    expect(grant).toMatch(/redemption\s+LoyaltyRedemption\?/);
    expect(redemption).toMatch(/actionExecutionId\s+String\?/);
    expect(redemption).toMatch(/@@unique\(\[grantId, tenantId\]\)/);
    expect(redemption).toMatch(/@@unique\(\[actionExecutionId, tenantId\]\)/);
  });

  it('uses tenant-qualified grant, client, and execution relations', () => {
    expect(grant).toContain(
      'fields: [clientId, tenantId], references: [id, tenantId]',
    );
    expect(grant).toContain(
      'fields: [issueExecutionId, tenantId], references: [id, tenantId]',
    );
    expect(redemption).toContain(
      'fields: [grantId, tenantId], references: [id, tenantId]',
    );
    expect(redemption).toContain(
      'fields: [actionExecutionId, tenantId], references: [id, tenantId]',
    );
  });

  it('stores no raw bearer code and keeps historical action bindings nullable', () => {
    expect(grant).toMatch(/codeHash\s+String/);
    expect(grant).not.toMatch(/\n\s+code\s+String/);
    expect(migration).toContain('"issueExecutionId" TEXT');
    expect(migration).toContain('"actionExecutionId" TEXT');
    expect(migration).not.toContain('"issueExecutionId" TEXT NOT NULL');
    expect(migration).not.toContain('"actionExecutionId" TEXT NOT NULL');
    expect(migration).not.toMatch(/\bINSERT INTO\b/);
    expect(migration).not.toMatch(/\bUPDATE\s+"?[A-Za-z]+"?\s+SET\b/);
  });

  it('enforces one-time claims and immutable established bindings', () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "LoyaltyRedemption_grantId_tenantId_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "LoyaltyRedemption_actionExecutionId_tenantId_key"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "LoyaltyRedemptionGrant_immutable_guard"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "LoyaltyRedemption_immutable_guard"',
    );
    expect(migration).toContain('OLD."issueExecutionId" IS NOT NULL');
    expect(migration).toContain('OLD."actionExecutionId" IS NOT NULL');
  });

  it('creates only the domain-specific grant and claim models', () => {
    const createdTables = [
      ...migration.matchAll(/CREATE TABLE "([^"]+)"/g),
    ].map(([, name]) => name);
    expect(createdTables).toEqual([
      'LoyaltyRedemptionGrant',
      'LoyaltyRedemption',
    ]);
    expect(migration).not.toMatch(
      /BillingPayment|ExpensePeriodDeclaration|CustomerSubscription|GiftCertificate|ReferralReward/,
    );
    expect(migration).not.toMatch(/ALTER TABLE "ActionExecution"/);
  });
});
