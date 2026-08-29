import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCHEMA = join(ROOT, 'prisma', 'schema.prisma');
const MIGRATION = join(
  ROOT,
  'prisma',
  'migrations',
  '20260829200000_loyalty_transaction_action_binding',
  'migration.sql',
);

describe('Cycle 06 Package 4 loyalty action-binding schema foundation', () => {
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
  const loyaltyTransactionModel = modelBlock('LoyaltyTransaction');
  const actionExecutionModel = modelBlock('ActionExecution');

  it('models an optional tenant-qualified one-to-many loyalty binding', () => {
    expect(loyaltyTransactionModel).toMatch(/actionExecutionId\s+String\?/);
    expect(loyaltyTransactionModel).toContain(
      '@relation("LoyaltyTransactionActionExecution", fields: [actionExecutionId, tenantId], references: [id, tenantId], onDelete: Restrict, onUpdate: Restrict)',
    );
    expect(actionExecutionModel).toMatch(
      /loyaltyTransactions\s+LoyaltyTransaction\[\]\s+@relation\("LoyaltyTransactionActionExecution"\)/,
    );
    expect(loyaltyTransactionModel).toMatch(
      /@@index\(\[tenantId, actionExecutionId\]\)/,
    );
  });

  it('does not falsely constrain one execution to one ledger row', () => {
    expect(loyaltyTransactionModel).not.toMatch(
      /@@unique\(\[(?:tenantId, actionExecutionId|actionExecutionId, tenantId)\]\)/,
    );
    expect(migration).not.toMatch(
      /CREATE UNIQUE INDEX\s+"LoyaltyTransaction_[^"]*actionExecutionId/,
    );
  });

  it('keeps historical rows compatible and rejects cross-tenant bindings', () => {
    expect(migration).toContain('ADD COLUMN "actionExecutionId" TEXT');
    expect(migration).not.toContain(
      'ADD COLUMN "actionExecutionId" TEXT NOT NULL',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("actionExecutionId", "tenantId")',
    );
    expect(migration).toContain(
      'REFERENCES "ActionExecution"("id", "tenantId")',
    );
    expect(migration).toContain('ON DELETE RESTRICT ON UPDATE RESTRICT');
  });

  it('allows initial binding but makes each row binding immutable', () => {
    expect(migration).toContain(
      'CREATE FUNCTION "guard_loyalty_transaction_action_binding"()',
    );
    expect(migration).toContain('OLD."actionExecutionId" IS NOT NULL');
    expect(migration).toContain(
      'NEW."actionExecutionId" IS DISTINCT FROM OLD."actionExecutionId"',
    );
    expect(migration).toContain(
      'NEW."tenantId" IS DISTINCT FROM OLD."tenantId"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "LoyaltyTransaction_action_binding_guard"',
    );
  });

  it('is additive and does not introduce a generic value workflow', () => {
    expect(migration).toMatch(/ALTER TABLE "LoyaltyTransaction"/);
    expect(migration).not.toMatch(
      /\b(?:CREATE TABLE|DROP TABLE|TRUNCATE|DELETE FROM|INSERT INTO)\b/,
    );
    expect(migration).not.toMatch(/\bUPDATE\s+"?[A-Za-z]+"?\s+SET\b/);
    expect(migration).not.toMatch(
      /BillingPayment|Expense|ExpensePeriodDeclaration|CommerceIntegration|TenantCatalogItem|ReferralProgram/,
    );
    expect(migration).not.toMatch(/ALTER TABLE "ActionExecution"/);
  });
});
