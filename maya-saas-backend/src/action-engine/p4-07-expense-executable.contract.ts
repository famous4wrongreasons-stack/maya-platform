import { ActionContractError } from './action-engine.errors';

export const EXPENSE_CREATE_SHADOW_CAPABILITY =
  'expenses.create.shadow.v1' as const;
export const EXPENSE_DELETE_SHADOW_CAPABILITY =
  'expenses.delete.shadow.v1' as const;
export const EXPENSE_PERIOD_DECLARE_SHADOW_CAPABILITY =
  'expenses.period-declare.shadow.v1' as const;

export const P4_07_EXECUTABLE_CAPABILITIES = Object.freeze({
  create: 'expenses.create.execute.v1',
  delete: 'expenses.delete.execute.v1',
  declare: 'expenses.period-declare.execute.v1',
});

export const EXPENSE_CREATE_INPUT_CONTRACT =
  'maya.create_expense-input/1' as const;
export const EXPENSE_DELETE_INPUT_CONTRACT =
  'maya.delete_expense-input/1' as const;
export const EXPENSE_PERIOD_DECLARE_INPUT_CONTRACT =
  'maya.declare_expense_period_complete-input/2' as const;

export const EXPENSE_CREATE_POLICY_PROFILE =
  'p4-07.expense-create.policy.v1' as const;
export const EXPENSE_DELETE_POLICY_PROFILE =
  'p4-07.expense-delete.policy.v1' as const;
export const EXPENSE_PERIOD_DECLARE_POLICY_PROFILE =
  'p4-07.expense-period-declare.policy.v1' as const;

export type P407ActionClass =
  'create_expense' | 'delete_expense' | 'declare_expense_period_complete';

const OPAQUE = /^[A-Za-z0-9._:/-]{1,240}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;
const CATEGORIES = new Set([
  'rent',
  'utilities',
  'supplies',
  'marketing',
  'taxes',
  'other',
]);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ActionContractError('Expense input must be a JSON object');
  }
  return value as Record<string, unknown>;
}

function only(source: Record<string, unknown>, allowed: readonly string[]) {
  const set = new Set(allowed);
  const extra = Object.keys(source).filter((key) => !set.has(key));
  if (extra.length) {
    throw new ActionContractError(
      `Unexpected expense input: ${extra.join(', ')}`,
    );
  }
}

function text(source: Record<string, unknown>, key: string, max = 240) {
  const value = source[key];
  if (typeof value !== 'string') {
    throw new ActionContractError(`${key} must be a string`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw new ActionContractError(`${key} has an invalid length`);
  }
  return normalized;
}

function opaque(source: Record<string, unknown>, key: string) {
  const value = text(source, key);
  if (!OPAQUE.test(value))
    throw new ActionContractError(`${key} is not opaque`);
  return value;
}

function nullableOpaque(source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (value === null) return null;
  return opaque(source, key);
}

function day(source: Record<string, unknown>, key: string) {
  const value = text(source, key, 10);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !DAY.test(value) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new ActionContractError(`${key} is not a canonical day`);
  }
  return value;
}

function positiveAmount(source: Record<string, unknown>) {
  const value = source.amountKopecks;
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > 1_000_000_000
  ) {
    throw new ActionContractError(
      'amountKopecks exceeds the canonical per-row cap',
    );
  }
  return value as number;
}

function declarationEpoch(source: Record<string, unknown>) {
  const value = source.declarationEpoch;
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > 2_147_483_647
  ) {
    throw new ActionContractError(
      'declarationEpoch must be a non-negative PostgreSQL integer',
    );
  }
  return value as number;
}

function immutableExpenseFacts(
  source: Record<string, unknown>,
  requireManualCategory: boolean,
) {
  const category = text(source, 'category', 80);
  if (requireManualCategory && !CATEGORIES.has(category)) {
    throw new ActionContractError(
      'category is not eligible for manual expense mutation',
    );
  }
  const currency = text(source, 'currency', 3);
  if (!CURRENCY.test(currency))
    throw new ActionContractError('currency is invalid');
  const occurredDay = day(source, 'occurredDay');
  const occurredAtValue = text(source, 'occurredAt', 40);
  const occurredAt = new Date(occurredAtValue);
  if (
    Number.isNaN(occurredAt.getTime()) ||
    occurredAt.toISOString() !== occurredAtValue ||
    occurredAtValue.slice(0, 10) !== occurredDay
  ) {
    throw new ActionContractError(
      'occurredAt is not an exact canonical instant',
    );
  }
  return {
    branchId: nullableOpaque(source, 'branchId'),
    category,
    amountKopecks: positiveAmount(source),
    currency,
    occurredDay,
    occurredAt: occurredAtValue,
    sourceNamespace: opaque(source, 'sourceNamespace'),
    externalRefHash:
      source.externalRefHash === null
        ? null
        : opaque(source, 'externalRefHash'),
  };
}

function commonAuthority(
  source: Record<string, unknown>,
  policyProfile: string,
) {
  if (source.policyProfile !== policyProfile) {
    throw new ActionContractError('policyProfile is not canonical');
  }
  return {
    actorMembershipId: opaque(source, 'actorMembershipId'),
    actorRole: opaque(source, 'actorRole'),
    policyProfile,
    policySnapshotHash: opaque(source, 'policySnapshotHash'),
  };
}

export function expenseCreateNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = record(value);
  only(source, [
    'intentIdentityHash',
    'branchId',
    'category',
    'amountKopecks',
    'currency',
    'occurredDay',
    'occurredAt',
    'sourceNamespace',
    'externalRefHash',
    'encryptedNote',
    'actorMembershipId',
    'actorRole',
    'policyProfile',
    'policySnapshotHash',
    'approvalRequirement',
    'intendedMutation',
    'expenseWritePerformed',
    'declarationInvalidationPerformed',
  ]);
  if (
    source.approvalRequirement !== 'ACTOR_CONFIRMATION_REQUIRED' ||
    source.intendedMutation !==
      'insert_expense_and_invalidate_overlapping_declarations' ||
    source.expenseWritePerformed !== false ||
    source.declarationInvalidationPerformed !== false
  )
    throw new ActionContractError(
      'create expense mutation boundary is not canonical',
    );
  const encryptedNote = source.encryptedNote;
  if (
    encryptedNote !== null &&
    (typeof encryptedNote !== 'string' || encryptedNote.length > 4096)
  ) {
    throw new ActionContractError('encryptedNote is invalid');
  }
  return {
    intentIdentityHash: opaque(source, 'intentIdentityHash'),
    ...immutableExpenseFacts(source, true),
    encryptedNote,
    ...commonAuthority(source, EXPENSE_CREATE_POLICY_PROFILE),
    approvalRequirement: 'ACTOR_CONFIRMATION_REQUIRED',
    intendedMutation: 'insert_expense_and_invalidate_overlapping_declarations',
    expenseWritePerformed: false,
    declarationInvalidationPerformed: false,
  };
}

export function expenseDeleteNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = record(value);
  only(source, [
    'expenseId',
    'creationIdentityHash',
    'deletionIdentityHash',
    'branchId',
    'category',
    'amountKopecks',
    'currency',
    'occurredDay',
    'occurredAt',
    'sourceNamespace',
    'externalRefHash',
    'actorMembershipId',
    'actorRole',
    'policyProfile',
    'policySnapshotHash',
    'reasonCode',
    'approvalRequirement',
    'intendedMutation',
    'expenseDeletePerformed',
    'declarationInvalidationPerformed',
  ]);
  if (
    source.reasonCode !== 'actor_requested_delete' ||
    source.approvalRequirement !== 'ACTOR_CONFIRMATION_REQUIRED' ||
    source.intendedMutation !==
      'delete_exact_expense_and_invalidate_overlapping_declarations' ||
    source.expenseDeletePerformed !== false ||
    source.declarationInvalidationPerformed !== false
  )
    throw new ActionContractError(
      'delete expense mutation boundary is not canonical',
    );
  return {
    expenseId: opaque(source, 'expenseId'),
    creationIdentityHash: opaque(source, 'creationIdentityHash'),
    deletionIdentityHash: opaque(source, 'deletionIdentityHash'),
    ...immutableExpenseFacts(source, false),
    ...commonAuthority(source, EXPENSE_DELETE_POLICY_PROFILE),
    reasonCode: 'actor_requested_delete',
    approvalRequirement: 'ACTOR_CONFIRMATION_REQUIRED',
    intendedMutation:
      'delete_exact_expense_and_invalidate_overlapping_declarations',
    expenseDeletePerformed: false,
    declarationInvalidationPerformed: false,
  };
}

export function expensePeriodDeclareNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = record(value);
  only(source, [
    'periodFromDay',
    'periodToDay',
    'declarationEpoch',
    'ledgerSnapshotHash',
    'declarationIdentityHash',
    'actorMembershipId',
    'actorRole',
    'policyProfile',
    'policySnapshotHash',
    'approvalRequirement',
    'branchScope',
    'intendedMutation',
    'declarationWritePerformed',
  ]);
  const from = day(source, 'periodFromDay');
  const to = day(source, 'periodToDay');
  if (
    from > to ||
    new Date(`${to}T00:00:00Z`).getTime() -
      new Date(`${from}T00:00:00Z`).getTime() >
      365 * 86_400_000
  ) {
    throw new ActionContractError('expense declaration period is invalid');
  }
  if (
    source.actorRole !== 'tenant_owner' &&
    source.actorRole !== 'business_owner'
  )
    throw new ActionContractError(
      'period declaration requires owner authority',
    );
  if (
    source.approvalRequirement !== 'NONE_EXPLICIT_OWNER_ASSERTION' ||
    source.branchScope !== 'whole_tenant' ||
    source.intendedMutation !== 'insert_current_period_declaration' ||
    source.declarationWritePerformed !== false
  )
    throw new ActionContractError(
      'period declaration boundary is not canonical',
    );
  return {
    periodFromDay: from,
    periodToDay: to,
    declarationEpoch: declarationEpoch(source),
    ledgerSnapshotHash: opaque(source, 'ledgerSnapshotHash'),
    declarationIdentityHash: opaque(source, 'declarationIdentityHash'),
    ...commonAuthority(source, EXPENSE_PERIOD_DECLARE_POLICY_PROFILE),
    approvalRequirement: 'NONE_EXPLICIT_OWNER_ASSERTION',
    branchScope: 'whole_tenant',
    intendedMutation: 'insert_current_period_declaration',
    declarationWritePerformed: false,
  };
}

export const P4_07_EXECUTABLE_REGISTRATIONS = [
  {
    capability: P4_07_EXECUTABLE_CAPABILITIES.create,
    actionClass: 'create_expense',
    targetKind: 'expense',
    inputContract: EXPENSE_CREATE_INPUT_CONTRACT,
    approvalRequirement: 'REQUIRED',
    normalizeInput: expenseCreateNormalizer,
  },
  {
    capability: P4_07_EXECUTABLE_CAPABILITIES.delete,
    actionClass: 'delete_expense',
    targetKind: 'expense',
    inputContract: EXPENSE_DELETE_INPUT_CONTRACT,
    approvalRequirement: 'REQUIRED',
    normalizeInput: expenseDeleteNormalizer,
  },
  {
    capability: P4_07_EXECUTABLE_CAPABILITIES.declare,
    actionClass: 'declare_expense_period_complete',
    targetKind: 'expense_period',
    inputContract: EXPENSE_PERIOD_DECLARE_INPUT_CONTRACT,
    approvalRequirement: 'NONE',
    normalizeInput: expensePeriodDeclareNormalizer,
  },
] as const;
