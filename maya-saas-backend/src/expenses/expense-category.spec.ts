import {
  EXPENSE_CATEGORY_SLUGS,
  MANUAL_EXPENSE_CATEGORY_SLUGS,
  findExpenseCategory,
  isManualExpenseCategory,
  resolveExpenseCategory,
  rublesToKopecks,
} from './expense-category';

describe('expense categories', () => {
  it('keeps the dictionary closed and splits fixed from variable costs', () => {
    expect(EXPENSE_CATEGORY_SLUGS).toEqual(
      expect.arrayContaining([
        'rent',
        'payroll',
        'supplies',
        'marketing',
        'taxes',
        'other',
      ]),
    );
    expect(findExpenseCategory('rent')?.kind).toBe('fixed');
    expect(findExpenseCategory('supplies')?.kind).toBe('variable');
    expect(findExpenseCategory('arenda')).toBeNull();
    expect(findExpenseCategory('arenda-avgust')).toBeNull();
  });

  it('never offers payroll for manual entry', () => {
    expect(isManualExpenseCategory('payroll')).toBe(false);
    expect(MANUAL_EXPENSE_CATEGORY_SLUGS).not.toContain('payroll');
    expect(MANUAL_EXPENSE_CATEGORY_SLUGS).toContain('rent');
  });

  it('reads a legacy free-text category as other without losing it', () => {
    expect(resolveExpenseCategory('arenda-avgust')).toEqual({
      slug: 'other',
      label: 'Прочее',
      kind: 'variable',
      known: false,
      raw: 'arenda-avgust',
    });
    expect(resolveExpenseCategory('rent')).toMatchObject({
      slug: 'rent',
      known: true,
      raw: 'rent',
    });
  });

  it('converts rubles to kopecks and refuses what is not money', () => {
    expect(rublesToKopecks(60_000)).toBe(6_000_000);
    expect(rublesToKopecks(1_234.56)).toBe(123_456);
    expect(rublesToKopecks(0.5)).toBe(50);
    expect(rublesToKopecks(0)).toBeNull();
    expect(rublesToKopecks(-100)).toBeNull();
    expect(rublesToKopecks(100.005)).toBeNull();
    expect(rublesToKopecks(Number.NaN)).toBeNull();
    expect(rublesToKopecks('60000')).toBeNull();
    expect(rublesToKopecks(20_000_000)).toBeNull();
  });
});
