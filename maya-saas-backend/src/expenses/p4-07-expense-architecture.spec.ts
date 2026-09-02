import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ActionPolicyDecision } from '@prisma/client';

import {
  ActionCapabilityRegistry,
  P4_07_EXECUTABLE_CAPABILITIES,
} from '../action-engine';

const root = resolve(__dirname, '..', '..');
const source = (path: string) => readFileSync(resolve(root, path), 'utf8');

function directMutationSubgroups(expensesService: string): string[] {
  const rules = [
    ['expense.create', /this\.prisma\.expense\.create\(/],
    ['expense.delete', /this\.prisma\.expense\.delete\(/],
    ['declaration.upsert', /expensePeriodDeclaration\.upsert\(/],
    ['declaration.deleteMany', /expensePeriodDeclaration\.deleteMany\(/],
  ] as const;
  return rules
    .filter(([, pattern]) => pattern.test(expensesService))
    .map(([name]) => name);
}

describe('P4-07 expense convergence architecture', () => {
  it('registers three Shadow-only and three local executable contracts', () => {
    const registry = new ActionCapabilityRegistry();
    const shadows = [
      'expenses.create.shadow.v1',
      'expenses.delete.shadow.v1',
      'expenses.period-declare.shadow.v1',
    ].map((key) => registry.get(key));
    expect(shadows.map((item) => item.policyDecision)).toEqual([
      ActionPolicyDecision.SHADOW_ONLY,
      ActionPolicyDecision.SHADOW_ONLY,
      ActionPolicyDecision.SHADOW_ONLY,
    ]);
    expect(shadows.every((item) => item.executorKey === 'shadow.none')).toBe(
      true,
    );
    const executable = Object.values(P4_07_EXECUTABLE_CAPABILITIES).map((key) =>
      registry.get(key),
    );
    expect(executable.map((item) => item.actionClass)).toEqual([
      'create_expense',
      'delete_expense',
      'declare_expense_period_complete',
    ]);
    expect(
      executable.every(
        (item) => item.executorKey === 'expenses.canonical-ledger',
      ),
    ).toBe(true);
    expect(
      executable.every((item) =>
        item.reconciliation.key.endsWith('.not-required'),
      ),
    ).toBe(true);
  });

  it('keeps executable proof owner isolated from production mutation routes before cutover', () => {
    const module = source('src/expenses/expenses.module.ts');
    const controller = source('src/expenses/expenses.controller.ts');
    expect(module).not.toContain('P407ExpenseExecutableService');
    expect(controller).not.toContain('P407ExpenseExecutableService');
    expect(source('scripts/p4-07-all3-executable-proof.ts')).toContain(
      'proof refuses non-disposable databases',
    );
  });

  it('locks the accepted pre-cutover baseline at one bypass group and four subgroups', () => {
    const legacy = source('src/expenses/expenses.service.ts');
    expect(directMutationSubgroups(legacy)).toEqual([
      'expense.create',
      'expense.delete',
      'declaration.upsert',
      'declaration.deleteMany',
    ]);
  });

  it('detects a real direct mutation bypass instead of broadly excluding expense code', () => {
    const clean = 'class ReadOnlyExpenseProjection { list() { return []; } }';
    const bypass = `${clean}\nclass RogueOwner { run() { return this.prisma.expense.create({data:{}}); } }`;
    expect(directMutationSubgroups(clean)).toEqual([]);
    expect(directMutationSubgroups(bypass)).toEqual(['expense.create']);
  });

  it('requires the canonical executor to keep ledger mutation, audit and execution finalization in one transaction', () => {
    const executable = source(
      'src/expenses/p4-07-expense-executable.service.ts',
    );
    expect(executable).toContain('pg_advisory_xact_lock');
    expect(executable).toContain(
      'Prisma.TransactionIsolationLevel.Serializable',
    );
    expect(executable).toContain(
      'externalDispatchState: ExternalDispatchState.NOT_CROSSED',
    );
    expect(executable).not.toContain('ActionExecutionState.UNKNOWN');
    expect(executable).not.toContain('provider.create');
  });
});
