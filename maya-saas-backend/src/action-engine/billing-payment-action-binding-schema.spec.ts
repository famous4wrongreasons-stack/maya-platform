import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCHEMA = join(ROOT, 'prisma', 'schema.prisma');
const MIGRATION = join(
  ROOT,
  'prisma',
  'migrations',
  '20260829180000_billing_payment_action_binding',
  'migration.sql',
);

describe('Cycle 06 Package 4 billing action-binding schema foundation', () => {
  const schema = readFileSync(SCHEMA, 'utf8');
  const migration = readFileSync(MIGRATION, 'utf8');

  it('models one optional tenant-qualified BillingPayment binding', () => {
    expect(schema).toMatch(
      /model BillingPayment \{[\s\S]*actionExecutionId\s+String\?/,
    );
    expect(schema).toContain(
      '@relation("BillingPaymentActionExecution", fields: [actionExecutionId, tenantId], references: [id, tenantId], onDelete: Restrict, onUpdate: Restrict)',
    );
    expect(schema).toMatch(
      /model BillingPayment \{[\s\S]*@@unique\(\[actionExecutionId, tenantId\]\)/,
    );
    expect(schema).toMatch(
      /model ActionExecution \{[\s\S]*billingPayment\s+BillingPayment\?\s+@relation\("BillingPaymentActionExecution"\)/,
    );
  });

  it('keeps historical rows compatible and enforces cross-tenant one-to-one identity', () => {
    expect(migration).toContain('ADD COLUMN "actionExecutionId" TEXT');
    expect(migration).not.toContain(
      'ADD COLUMN "actionExecutionId" TEXT NOT NULL',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "BillingPayment_actionExecutionId_tenantId_key"',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("actionExecutionId", "tenantId")',
    );
    expect(migration).toContain(
      'REFERENCES "ActionExecution"("id", "tenantId")',
    );
    expect(migration).toContain('ON DELETE RESTRICT ON UPDATE RESTRICT');
  });

  it('allows initial binding but makes the established binding immutable', () => {
    expect(migration).toContain(
      'CREATE FUNCTION "guard_billing_payment_action_binding"()',
    );
    expect(migration).toContain('OLD."actionExecutionId" IS NOT NULL');
    expect(migration).toContain(
      'NEW."actionExecutionId" IS DISTINCT FROM OLD."actionExecutionId"',
    );
    expect(migration).toContain(
      'NEW."tenantId" IS DISTINCT FROM OLD."tenantId"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "BillingPayment_action_binding_guard"',
    );
  });

  it('is additive and does not introduce a second financial workflow', () => {
    expect(migration).toMatch(/ALTER TABLE "BillingPayment"/);
    expect(migration).not.toMatch(
      /\b(?:CREATE TABLE|DROP TABLE|TRUNCATE|DELETE FROM|INSERT INTO)\b/,
    );
    expect(migration).not.toMatch(/\bUPDATE\s+"?[A-Za-z]+"?\s+SET\b/);
    expect(migration).not.toMatch(
      /LoyaltyTransaction|Expense|ExpensePeriodDeclaration|CommerceIntegration|TenantCatalogItem|ReferralProgram/,
    );
    expect(migration).not.toMatch(/ALTER TABLE "ActionExecution"/);
  });
});
