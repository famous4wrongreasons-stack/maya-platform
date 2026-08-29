import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCHEMA = join(ROOT, 'prisma', 'schema.prisma');
const MIGRATION = join(
  ROOT,
  'prisma',
  'migrations',
  '20260829230000_expense_period_declaration_action_binding',
  'migration.sql',
);

describe('Cycle 06 Package 4 expense-period action-binding schema foundation', () => {
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
  const declarationModel = modelBlock('ExpensePeriodDeclaration');
  const actionExecutionModel = modelBlock('ActionExecution');

  it('models one optional tenant-qualified declaration binding', () => {
    expect(declarationModel).toMatch(/actionExecutionId\s+String\?/);
    expect(declarationModel).toContain(
      '@relation("ExpensePeriodDeclarationActionExecution", fields: [actionExecutionId, tenantId], references: [id, tenantId], onDelete: Restrict, onUpdate: Restrict)',
    );
    expect(declarationModel).toMatch(
      /@@unique\(\[actionExecutionId, tenantId\]\)/,
    );
    expect(actionExecutionModel).toMatch(
      /expensePeriodDeclaration\s+ExpensePeriodDeclaration\?\s+@relation\("ExpensePeriodDeclarationActionExecution"\)/,
    );
  });

  it('keeps historical rows nullable and enforces cross-tenant one-to-one identity', () => {
    expect(migration).toContain('ADD COLUMN "actionExecutionId" TEXT');
    expect(migration).not.toContain(
      'ADD COLUMN "actionExecutionId" TEXT NOT NULL',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "ExpensePeriodDeclaration_actionExecutionId_tenantId_key"',
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
      'CREATE FUNCTION "guard_expense_period_declaration_action_binding"()',
    );
    expect(migration).toContain('OLD."actionExecutionId" IS NOT NULL');
    expect(migration).toContain(
      'NEW."actionExecutionId" IS DISTINCT FROM OLD."actionExecutionId"',
    );
    expect(migration).toContain(
      'NEW."tenantId" IS DISTINCT FROM OLD."tenantId"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "ExpensePeriodDeclaration_action_binding_guard"',
    );
  });

  it('is additive and does not add delete tombstones or a generic value workflow', () => {
    expect(migration).toMatch(/ALTER TABLE "ExpensePeriodDeclaration"/);
    expect(migration).not.toMatch(
      /\b(?:CREATE TABLE|DROP TABLE|TRUNCATE|DELETE FROM|INSERT INTO)\b/,
    );
    expect(migration).not.toMatch(/\bUPDATE\s+"?[A-Za-z]+"?\s+SET\b/);
    expect(migration).not.toMatch(
      /BillingPayment|LoyaltyTransaction|CommerceIntegration|TenantCatalogItem|ReferralProgram/,
    );
    expect(migration).not.toMatch(/ALTER TABLE "ActionExecution"/);
  });
});
