import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCHEMA = join(ROOT, 'prisma', 'schema.prisma');
const MIGRATION = join(
  ROOT,
  'prisma',
  'migrations',
  '20260829220000_expense_action_binding',
  'migration.sql',
);

describe('Cycle 06 Package 4 expense action-binding schema foundation', () => {
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
  const expenseModel = modelBlock('Expense');
  const actionExecutionModel = modelBlock('ActionExecution');

  it('models one optional tenant-qualified Expense creation binding', () => {
    expect(expenseModel).toMatch(/actionExecutionId\s+String\?/);
    expect(expenseModel).toContain(
      '@relation("ExpenseActionExecution", fields: [actionExecutionId, tenantId], references: [id, tenantId], onDelete: Restrict, onUpdate: Restrict)',
    );
    expect(expenseModel).toMatch(/@@unique\(\[actionExecutionId, tenantId\]\)/);
    expect(actionExecutionModel).toMatch(
      /expense\s+Expense\?\s+@relation\("ExpenseActionExecution"\)/,
    );
  });

  it('keeps historical rows nullable and enforces cross-tenant one-to-one identity', () => {
    expect(migration).toContain('ADD COLUMN "actionExecutionId" TEXT');
    expect(migration).not.toContain(
      'ADD COLUMN "actionExecutionId" TEXT NOT NULL',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "Expense_actionExecutionId_tenantId_key"',
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
      'CREATE FUNCTION "guard_expense_action_binding"()',
    );
    expect(migration).toContain('OLD."actionExecutionId" IS NOT NULL');
    expect(migration).toContain(
      'NEW."actionExecutionId" IS DISTINCT FROM OLD."actionExecutionId"',
    );
    expect(migration).toContain(
      'NEW."tenantId" IS DISTINCT FROM OLD."tenantId"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "Expense_action_binding_guard"',
    );
  });

  it('is additive and does not introduce a generic financial workflow', () => {
    expect(migration).toMatch(/ALTER TABLE "Expense"/);
    expect(migration).not.toMatch(
      /\b(?:CREATE TABLE|DROP TABLE|TRUNCATE|DELETE FROM|INSERT INTO)\b/,
    );
    expect(migration).not.toMatch(/\bUPDATE\s+"?[A-Za-z]+"?\s+SET\b/);
    expect(migration).not.toMatch(
      /BillingPayment|LoyaltyTransaction|ExpensePeriodDeclaration|CommerceIntegration|TenantCatalogItem|ReferralProgram/,
    );
    expect(migration).not.toMatch(/ALTER TABLE "ActionExecution"/);
  });
});
