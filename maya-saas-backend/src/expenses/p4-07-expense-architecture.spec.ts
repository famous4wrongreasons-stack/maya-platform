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

  it('wires the canonical owner without exposing a raw execution route', () => {
    const module = source('src/expenses/expenses.module.ts');
    const controller = source('src/expenses/expenses.controller.ts');
    const adapter = source(
      'src/expenses/p4-07-expense-canonical-cutover.service.ts',
    );
    expect(module).toContain('P407ExpenseExecutableService');
    expect(module).toContain('P407ExpenseCanonicalCutoverService');
    expect(adapter).toContain('this.ingress.createExecution(request)');
    expect(adapter).toContain('this.executor.execute(request)');
    expect(controller).not.toContain('P407ExpenseExecutableService');
    expect(module).not.toContain('.execute.v1');
  });

  it('reduces the production bypass group and all four legacy mutation subgroups to zero', () => {
    const legacy = source('src/expenses/expenses.service.ts');
    expect(directMutationSubgroups(legacy)).toEqual([]);
    expect(legacy).toContain('this.requireCanonicalCutover().create(');
    expect(legacy).toContain('this.requireCanonicalCutover().remove(');
    expect(legacy).toContain('this.requireCanonicalCutover().declare(');
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

  it('keeps all three completed Shadow entrypoints physically non-executable', () => {
    const shadow = source('src/expenses/expense-canonical-shadow.service.ts');
    expect(shadow).toContain('this.actionEngine.planShadow(');
    expect(shadow).not.toContain('this.executor.execute(');
    expect(shadow).not.toContain('this.prisma.expense.create(');
    expect(shadow).not.toContain('this.prisma.expense.delete(');
  });
});
