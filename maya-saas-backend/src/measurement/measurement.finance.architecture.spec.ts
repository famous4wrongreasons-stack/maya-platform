import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
const dir = resolve(__dirname);
const sources = () =>
  readdirSync(dir)
    .filter(
      (name) =>
        /^measurement\.(finance|period|value).*\.ts$/.test(name) &&
        !name.endsWith('.spec.ts'),
    )
    .map((name) => [name, readFileSync(join(dir, name), 'utf8')] as const);
function effects(source: string): string[] {
  const ast = ts.createSourceFile(
    'reader.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const found: string[] = [];
  function walk(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const call = node.expression.getText(ast);
      if (
        /\.(create|createMany|update|updateMany|upsert|delete|deleteMany|execute|dispatch|publish|send)\b/.test(
          call,
        )
      )
        found.push(call);
    }
    ts.forEachChild(node, walk);
  }
  walk(ast);
  if (
    /\b(INSERT\s+INTO|UPDATE\s+"|DELETE\s+FROM|TRUNCATE|DISABLE\s+TRIGGER)\b/i.test(
      source,
    )
  )
    found.push('sql_mutation');
  return found;
}
describe('C7 P02 permanent read-only finance boundaries', () => {
  it('all package classes are source/read-only and retain the sole shared publisher', () => {
    for (const [, source] of sources()) {
      expect(effects(source)).toEqual([]);
      expect(source).not.toMatch(
        /from ['"].*(?:action-engine|ai-tools|openai|anthropic|communication-delivery|yclients)[^'"]*['"]/,
      );
      expect(source).not.toMatch(
        /measurementRevision\.|encryptedNote|encryptedReason|encryptedApiToken|providerPayload|findClientByPhone|phoneHash|userId_tenantId/,
      );
    }
  });
  it('ratchet detects a new source write, parallel publisher and raw-SQL mutation', () => {
    for (const source of [
      'db.expense.create({})',
      'db.loyaltyAccount.update({})',
      'writer.publish({})',
      'db.$executeRaw`UPDATE "Expense" SET category=1`',
    ])
      expect(effects(source).length).toBeGreaterThan(0);
  });
  it('only canonical CRM financial and exact external-ID evidence methods are reachable', () => {
    const source = readFileSync(join(dir, 'measurement.finance.ts'), 'utf8');
    expect(
      [...source.matchAll(/this\.crm\.(\w+)\(/g)].map((m) => m[1]).sort(),
    ).toEqual([
      'getClientLoyaltyEvidenceByExternalIdReadOnly',
      'getFinancialSummary',
    ]);
    expect(source).toContain('take: MEASUREMENT_EXPENSE_READ_LIMIT + 1');
    expect(source).toContain(
      "unavailableExpenses('expense_query_row_limit_exceeded')",
    );
    expect(source).toContain('window.wholeLocalDays');
    expect(source).toContain('measurement_prepared_authority_changed');
    expect(source).toContain('measurement_prepared_value_changed');
    expect(source).toContain('FOR SHARE');
  });
  it('expense arithmetic/category aliases reuse the canonical fold without fuzzy overlap matching', () => {
    const source = readFileSync(
      join(dir, 'measurement.finance.facts.ts'),
      'utf8',
    );
    expect(source).toContain('foldExpenseRows(rows)');
    expect(source).toContain('resolveExpenseCategory(group.raw).raw');
    expect(source).not.toMatch(
      /Math\.abs\([^)]*occurred|findProbableDuplicates|possible_duplicate|toLowerCase\(/,
    );
  });
});
