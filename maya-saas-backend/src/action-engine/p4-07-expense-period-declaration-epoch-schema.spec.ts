import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCHEMA = join(ROOT, 'prisma', 'schema.prisma');
const MIGRATION = join(
  ROOT,
  'prisma',
  'migrations',
  '20260902200000_expense_period_declaration_epoch',
  'migration.sql',
);

describe('P4-07 expense period declaration epoch foundation', () => {
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

  const declaration = modelBlock('ExpensePeriodDeclaration');
  const invalidation = modelBlock('ExpensePeriodDeclarationInvalidation');

  it('adds only a nullable historical-compatible declaration epoch', () => {
    expect(declaration).toMatch(/declarationEpoch\s+Int\?/);
    expect(migration).toContain('ADD COLUMN "declarationEpoch" INTEGER');
    expect(migration).not.toContain(
      'ADD COLUMN "declarationEpoch" INTEGER NOT NULL',
    );
    expect(migration).toContain(
      '"declarationEpoch" IS NULL OR "declarationEpoch" >= 0',
    );
    expect(migration).toContain(
      "RAISE EXCEPTION 'New canonical ExpensePeriodDeclaration requires declarationEpoch'",
    );
    expect(migration).toContain('NEW."actionExecutionId" IS NOT NULL');
  });

  it('records exact append-only contiguous invalidation generations', () => {
    expect(invalidation).toContain('previousDeclarationEpoch');
    expect(invalidation).toContain('nextDeclarationEpoch');
    expect(invalidation).toContain(
      '@@unique([tenantId, periodFromDay, periodToDay, nextDeclarationEpoch]',
    );
    expect(migration).toContain(
      '"nextDeclarationEpoch" = "previousDeclarationEpoch" + 1',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "ExpensePeriodInvalidation_append_only_guard"',
    );
    expect(migration).toContain(
      "RAISE EXCEPTION 'ExpensePeriodDeclarationInvalidation is append-only'",
    );
  });

  it('keeps both ActionExecution bindings tenant-qualified and immutable', () => {
    expect(invalidation).toContain(
      'fields: [invalidatedDeclarationActionExecutionId, tenantId]',
    );
    expect(invalidation).toContain(
      'fields: [invalidationActionExecutionId, tenantId]',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("invalidatedDeclarationActionExecutionId", "tenantId")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("invalidationActionExecutionId", "tenantId")',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "ExpensePeriodInvalidation_append_only_guard"',
    );
    expect(migration).toContain(
      'NEW."actionExecutionId" IS DISTINCT FROM OLD."actionExecutionId"',
    );
  });

  it('derives the exact epoch under the tenant expense-ledger lock', () => {
    expect(migration).toContain(
      'hashtextextended(NEW."tenantId" || \':expense-ledger\', 0)',
    );
    expect(migration).toContain(
      'SELECT COALESCE(MAX("nextDeclarationEpoch"), 0)',
    );
    expect(migration).toContain(
      "RAISE EXCEPTION 'ExpensePeriodDeclaration epoch is stale or forged'",
    );
    expect(migration).toContain(
      "execution_action_class <> 'declare_expense_period_complete'",
    );
    expect(migration).toContain("execution_target_kind <> 'expense_period'");
  });

  it('requires invalidation and deletion to commit atomically', () => {
    expect(migration).toContain(
      'CREATE TRIGGER "ExpensePeriodDeclaration_invalidation_delete_guard"',
    );
    expect(migration).toContain(
      'CREATE CONSTRAINT TRIGGER "ExpensePeriodInvalidation_consumed_guard"',
    );
    expect(migration).toContain('DEFERRABLE INITIALLY DEFERRED');
    expect(migration).toContain(
      "RAISE EXCEPTION 'Canonical ExpensePeriodDeclaration delete requires durable invalidation'",
    );
  });

  it('preserves whole-tenant period scope instead of inventing a branch epoch', () => {
    expect(declaration).not.toMatch(/\n\s+branchId\s/);
    expect(invalidation).not.toMatch(/\n\s+branchId\s/);
    expect(migration).toContain('"tenantId" = NEW."tenantId"');
    expect(migration).toContain('"periodFromDay" = NEW."periodFromDay"');
    expect(migration).toContain('"periodToDay" = NEW."periodToDay"');
  });

  it('does not backfill history or mutate expense value', () => {
    expect(migration).not.toMatch(
      /UPDATE\s+"ExpensePeriodDeclaration"\s+SET\s+"declarationEpoch"/i,
    );
    expect(migration).not.toMatch(
      /INSERT\s+INTO\s+"ExpensePeriodDeclarationInvalidation"/i,
    );
    expect(migration).not.toMatch(/ALTER TABLE "Expense"/);
    expect(migration).not.toMatch(
      /LoyaltyAccount|LoyaltyTransaction|BillingPayment|GiftCertificate|ReferralReward|CustomerSubscription/,
    );
  });
});
