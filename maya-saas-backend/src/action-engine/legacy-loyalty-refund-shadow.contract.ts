import { createHash } from 'node:crypto';

import { ActionContractError } from './action-engine.errors';

export const LEGACY_LOYALTY_REFUND_SHADOW_CAPABILITY =
  'loyalty.legacy-refund.shadow.v1' as const;
export const LEGACY_LOYALTY_REFUND_INPUT_CONTRACT =
  'maya.refund_legacy_loyalty-input/1' as const;
export const LEGACY_LOYALTY_REFUND_POLICY =
  'legacy-cancel-exact-ledger-compensation.v1' as const;
export const LEGACY_LOYALTY_REDEEM_LEDGER_KIND = 'redeem' as const;
export const LEGACY_LOYALTY_REFUND_LEDGER_KIND = 'refund' as const;

function canonicalLedgerHash(parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\u001f')).digest('hex');
}

export function legacyLoyaltyProviderRecordIdentityHash(input: {
  tenantId: string;
  provider: string;
  providerRecordId: string;
}): string {
  return canonicalLedgerHash([
    input.tenantId,
    input.provider,
    input.providerRecordId,
  ]);
}

export function legacyLoyaltyRefundCorrelationHash(input: {
  tenantId: string;
  originalRedemptionActionExecutionId: string;
  cancellationFactHash: string;
}): string {
  return canonicalLedgerHash([
    input.tenantId,
    input.originalRedemptionActionExecutionId,
    input.cancellationFactHash,
    LEGACY_LOYALTY_REFUND_POLICY,
  ]);
}

const OPAQUE_REF_PATTERN = /^[A-Za-z0-9._:/-]{1,240}$/;

function recordInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ActionContractError('Action input must be a JSON object');
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(
  source: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(source).filter((key) => !allowedSet.has(key));
  if (unexpected.length > 0) {
    throw new ActionContractError(
      `Unexpected action input: ${unexpected.join(', ')}`,
    );
  }
}

function opaque(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || !OPAQUE_REF_PATTERN.test(value)) {
    throw new ActionContractError(`${key} must be an opaque reference`);
  }
  return value;
}

function integer(
  source: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
): number {
  const value = source[key];
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new ActionContractError(
      `${key} must be an integer between ${min} and ${max}`,
    );
  }
  return Number(value);
}

function stringArray(source: Record<string, unknown>, key: string): string[] {
  const value = source[key];
  if (!Array.isArray(value) || value.length > 3) {
    throw new ActionContractError(`${key} must be a bounded string array`);
  }
  if (!value.every((item): item is string => typeof item === 'string')) {
    throw new ActionContractError(`${key} must be a bounded string array`);
  }
  return [...value].sort();
}

function expectedDivergences(input: {
  originalDebitPoints: number;
  legacyClaimedRefundPoints: number;
  perActionCapPoints: number;
  existingRefundDecision: string;
}): string[] {
  const divergences: string[] = [];
  if (input.originalDebitPoints !== input.legacyClaimedRefundPoints) {
    divergences.push('legacy_refund_points_mismatch');
  }
  if (input.originalDebitPoints > input.perActionCapPoints) {
    divergences.push('per_action_cap_exceeded');
  }
  if (input.existingRefundDecision === 'already_refunded') {
    divergences.push('canonical_refund_already_exists');
  }
  return divergences.sort();
}

export function legacyLoyaltyRefundShadowNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, [
    'provider',
    'canonicalClientId',
    'canonicalAppointmentId',
    'originalRedemptionActionExecutionId',
    'providerRecordIdentityHash',
    'cancellationFactHash',
    'originalDebitRowCount',
    'originalDebitPoints',
    'legacyClaimedRefundPoints',
    'intendedDeltaPoints',
    'refundDecision',
    'refundPolicy',
    'perActionCapPoints',
    'capDecision',
    'existingRefundDecision',
    'cancellationEvidence',
    'divergenceCodes',
  ]);

  const originalDebitRowCount = integer(source, 'originalDebitRowCount', 1, 64);
  const originalDebitPoints = integer(
    source,
    'originalDebitPoints',
    1,
    5_000_000,
  );
  const legacyClaimedRefundPoints = integer(
    source,
    'legacyClaimedRefundPoints',
    1,
    5_000_000,
  );
  const perActionCapPoints = integer(
    source,
    'perActionCapPoints',
    1,
    5_000_000,
  );
  const existingRefundDecision = source.existingRefundDecision;
  if (
    existingRefundDecision !== 'none' &&
    existingRefundDecision !== 'already_refunded'
  ) {
    throw new ActionContractError('existingRefundDecision is invalid');
  }
  const eligible =
    originalDebitPoints <= perActionCapPoints &&
    existingRefundDecision === 'none';
  const expectedDelta = eligible ? originalDebitPoints : 0;
  const expectedDecision = eligible ? 'refund' : 'do_not_refund';
  const expectedCapDecision =
    originalDebitPoints <= perActionCapPoints ? 'within_cap' : 'exceeds_cap';
  const divergences = expectedDivergences({
    originalDebitPoints,
    legacyClaimedRefundPoints,
    perActionCapPoints,
    existingRefundDecision,
  });

  if (source.refundPolicy !== LEGACY_LOYALTY_REFUND_POLICY) {
    throw new ActionContractError('refundPolicy is not canonical');
  }
  if (source.cancellationEvidence !== 'proven_removed') {
    throw new ActionContractError('cancellation evidence is not canonical');
  }
  if (source.refundDecision !== expectedDecision) {
    throw new ActionContractError('refundDecision is not server-derived');
  }
  const intendedDeltaPoints = integer(
    source,
    'intendedDeltaPoints',
    0,
    5_000_000,
  );
  if (intendedDeltaPoints !== expectedDelta) {
    throw new ActionContractError('intendedDeltaPoints is not server-derived');
  }
  if (source.capDecision !== expectedCapDecision) {
    throw new ActionContractError('capDecision is not server-derived');
  }
  const suppliedDivergences = stringArray(source, 'divergenceCodes');
  if (JSON.stringify(suppliedDivergences) !== JSON.stringify(divergences)) {
    throw new ActionContractError('divergenceCodes are not server-derived');
  }

  return {
    provider: opaque(source, 'provider'),
    canonicalClientId: opaque(source, 'canonicalClientId'),
    canonicalAppointmentId: opaque(source, 'canonicalAppointmentId'),
    originalRedemptionActionExecutionId: opaque(
      source,
      'originalRedemptionActionExecutionId',
    ),
    providerRecordIdentityHash: opaque(source, 'providerRecordIdentityHash'),
    cancellationFactHash: opaque(source, 'cancellationFactHash'),
    originalDebitRowCount,
    originalDebitPoints,
    legacyClaimedRefundPoints,
    intendedDeltaPoints,
    refundDecision: expectedDecision,
    refundPolicy: LEGACY_LOYALTY_REFUND_POLICY,
    perActionCapPoints,
    capDecision: expectedCapDecision,
    existingRefundDecision,
    cancellationEvidence: 'proven_removed',
    divergenceCodes: divergences,
  };
}
