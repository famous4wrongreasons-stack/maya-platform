import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  EXPENSE_PERIOD_DECLARE_INPUT_CONTRACT,
  EXPENSE_PERIOD_DECLARE_POLICY_PROFILE,
  expensePeriodDeclareNormalizer,
} from './p4-07-expense-executable.contract';
import {
  expensePeriodDeclarationIdentityHash,
  p407Hash,
} from '../expenses/expense-canonical-shadow.service';

const root = resolve(__dirname, '..', '..');
const source = (path: string) => readFileSync(resolve(root, path), 'utf8');

function declarationInput(overrides: Record<string, unknown> = {}) {
  const declarationEpoch = 2;
  const ledgerSnapshotHash = p407Hash(['ledger-snapshot']);
  const declarationIdentityHash = expensePeriodDeclarationIdentityHash(
    'tenant-a',
    '2026-08-01',
    '2026-08-31',
    declarationEpoch,
    ledgerSnapshotHash,
  );
  return {
    periodFromDay: '2026-08-01',
    periodToDay: '2026-08-31',
    declarationEpoch,
    ledgerSnapshotHash,
    declarationIdentityHash,
    actorMembershipId: 'membership-a',
    actorRole: 'tenant_owner',
    policyProfile: EXPENSE_PERIOD_DECLARE_POLICY_PROFILE,
    policySnapshotHash: p407Hash(['policy-snapshot']),
    approvalRequirement: 'NONE_EXPLICIT_OWNER_ASSERTION',
    branchScope: 'whole_tenant',
    intendedMutation: 'insert_current_period_declaration',
    declarationWritePerformed: false,
    ...overrides,
  };
}

describe('P4-07 declaration epoch runtime alignment', () => {
  it('binds the versioned executable input to an exact non-negative epoch', () => {
    expect(EXPENSE_PERIOD_DECLARE_INPUT_CONTRACT).toBe(
      'maya.declare_expense_period_complete-input/2',
    );
    expect(expensePeriodDeclareNormalizer(declarationInput())).toMatchObject({
      declarationEpoch: 2,
    });
    for (const invalid of [undefined, -1, 1.5, 2_147_483_648]) {
      expect(() =>
        expensePeriodDeclareNormalizer(
          declarationInput({ declarationEpoch: invalid }),
        ),
      ).toThrow();
    }
  });

  it('rejects caller-shaped previous/next generation fields', () => {
    expect(() =>
      expensePeriodDeclareNormalizer(declarationInput({ previousEpoch: 1 })),
    ).toThrow('Unexpected expense input');
    expect(() =>
      expensePeriodDeclareNormalizer(declarationInput({ nextEpoch: 3 })),
    ).toThrow('Unexpected expense input');
  });

  it('derives epoch in the canonical planner and re-derives under the ledger lock', () => {
    const planner = source('src/expenses/expense-canonical-shadow.service.ts');
    const executor = source('src/expenses/p4-07-expense-executable.service.ts');
    const dto = source('src/expenses/dto/expense-shadow.dto.ts');

    expect(planner).toContain(
      'this.prisma.expensePeriodDeclarationInvalidation.findFirst',
    );
    expect(planner).toContain('expensePeriodDeclarationIdentityHash(');
    expect(executor).toContain('pg_advisory_xact_lock');
    expect(executor).toContain('await this.currentDeclarationEpoch(');
    expect(executor).toContain(
      "'Expense declaration epoch changed after planning'",
    );
    expect(dto).not.toContain('declaration_epoch');
    expect(dto).not.toContain('previous_epoch');
    expect(dto).not.toContain('next_epoch');
  });

  it('records durable invalidation before removing a canonical declaration', () => {
    const executor = source('src/expenses/p4-07-expense-executable.service.ts');
    const invalidation = executor.indexOf(
      'expensePeriodDeclarationInvalidation.create',
    );
    const deletion = executor.indexOf('expensePeriodDeclaration.deleteMany');

    expect(invalidation).toBeGreaterThanOrEqual(0);
    expect(deletion).toBeGreaterThan(invalidation);
    expect(executor).toContain(
      "'Historical expense declaration requires explicit correlation before mutation'",
    );
    expect(executor).toContain(
      'previousDeclarationEpoch: row.declarationEpoch',
    );
    expect(executor).toContain(
      'nextDeclarationEpoch: row.declarationEpoch + 1',
    );
  });
});
