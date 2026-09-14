import { ActionContractError } from './action-engine.errors';

export const LEGACY_LOYALTY_BACKFILL_SHADOW_CAPABILITY =
  'loyalty.legacy-backfill.shadow.v1' as const;
export const LEGACY_LOYALTY_BACKFILL_INPUT_CONTRACT =
  'maya.backfill_legacy_loyalty-input/1' as const;
export const LEGACY_LOYALTY_BACKFILL_POLICY =
  'legacy-welcome-ltv-5pct-cap.v1' as const;
export const LEGACY_LOYALTY_BACKFILL_PROGRAM =
  'legacy-welcome-launch.v1' as const;

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
  if (!Array.isArray(value) || value.length > 5) {
    throw new ActionContractError(`${key} must be a bounded string array`);
  }
  if (!value.every((item): item is string => typeof item === 'string')) {
    throw new ActionContractError(`${key} must be a bounded string array`);
  }
  return [...value].sort();
}

/** Match Python round-half-to-even for the legacy integer-ruble 5% rule. */
export function calculateLegacyLoyaltyBackfillPoints(
  soldAmountRubles: number,
): number {
  if (!Number.isInteger(soldAmountRubles) || soldAmountRubles < 0) {
    throw new ActionContractError(
      'providerSoldAmountRubles must be a non-negative integer',
    );
  }
  const quotient = Math.floor(soldAmountRubles / 20);
  const remainder = soldAmountRubles % 20;
  if (remainder < 10) return quotient;
  if (remainder > 10) return quotient + 1;
  return quotient % 2 === 0 ? quotient : quotient + 1;
}

function expectedDivergences(input: {
  providerSoldAmountRubles: number;
  legacyClaimedSoldAmountRubles: number;
  legacyClaimedPoints: number;
  perClientCapPoints: number;
  perRunCapPoints: number;
  existingSourceDecision: string;
}): string[] {
  const canonicalPoints = Math.min(
    calculateLegacyLoyaltyBackfillPoints(input.providerSoldAmountRubles),
    input.perClientCapPoints,
  );
  const divergences: string[] = [];
  if (input.providerSoldAmountRubles !== input.legacyClaimedSoldAmountRubles) {
    divergences.push('legacy_sold_amount_mismatch');
  }
  if (canonicalPoints !== input.legacyClaimedPoints) {
    divergences.push('legacy_points_mismatch');
  }
  if (canonicalPoints > input.perRunCapPoints) {
    divergences.push('per_run_cap_exceeded');
  }
  if (input.existingSourceDecision === 'backfill_already_exists') {
    divergences.push('canonical_backfill_already_exists');
  }
  if (input.existingSourceDecision === 'provider_balance_already_imported') {
    divergences.push('canonical_provider_import_already_exists');
  }
  return divergences.sort();
}

export function legacyLoyaltyBackfillShadowNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, [
    'provider',
    'canonicalClientId',
    'loyaltyAccountIdentityHash',
    'providerClientIdentityHash',
    'providerSoldAmountRubles',
    'legacyClaimedSoldAmountRubles',
    'legacyClaimedPoints',
    'calculatedUncappedPoints',
    'intendedDeltaPoints',
    'backfillDecision',
    'backfillPolicy',
    'programVersion',
    'perClientCapPoints',
    'perRunCapPoints',
    'clientCapDecision',
    'runCapDecision',
    'existingSourceDecision',
    'providerEvidence',
    'divergenceCodes',
  ]);

  const providerSoldAmountRubles = integer(
    source,
    'providerSoldAmountRubles',
    0,
    100_000_000,
  );
  const legacyClaimedSoldAmountRubles = integer(
    source,
    'legacyClaimedSoldAmountRubles',
    0,
    100_000_000,
  );
  const legacyClaimedPoints = integer(
    source,
    'legacyClaimedPoints',
    0,
    5_000_000,
  );
  const perClientCapPoints = integer(
    source,
    'perClientCapPoints',
    1,
    5_000_000,
  );
  const perRunCapPoints = integer(source, 'perRunCapPoints', 1, 5_000_000);
  const existingSourceDecision = source.existingSourceDecision;
  if (
    existingSourceDecision !== 'none' &&
    existingSourceDecision !== 'backfill_already_exists' &&
    existingSourceDecision !== 'provider_balance_already_imported'
  ) {
    throw new ActionContractError('existingSourceDecision is invalid');
  }

  const calculatedUncappedPoints = calculateLegacyLoyaltyBackfillPoints(
    providerSoldAmountRubles,
  );
  const canonicalPoints = Math.min(
    calculatedUncappedPoints,
    perClientCapPoints,
  );
  const eligible =
    canonicalPoints > 0 &&
    canonicalPoints <= perRunCapPoints &&
    existingSourceDecision === 'none';
  const expectedDelta = eligible ? canonicalPoints : 0;
  const expectedDecision = eligible ? 'grant' : 'do_not_grant';
  const expectedClientCapDecision =
    calculatedUncappedPoints > perClientCapPoints ? 'capped' : 'within_cap';
  const expectedRunCapDecision =
    canonicalPoints <= perRunCapPoints ? 'within_cap' : 'exceeds_cap';
  const divergences = expectedDivergences({
    providerSoldAmountRubles,
    legacyClaimedSoldAmountRubles,
    legacyClaimedPoints,
    perClientCapPoints,
    perRunCapPoints,
    existingSourceDecision,
  });

  if (source.backfillPolicy !== LEGACY_LOYALTY_BACKFILL_POLICY) {
    throw new ActionContractError('backfillPolicy is not canonical');
  }
  if (source.programVersion !== LEGACY_LOYALTY_BACKFILL_PROGRAM) {
    throw new ActionContractError('programVersion is not canonical');
  }
  if (source.providerEvidence !== 'exact_client_ltv_snapshot') {
    throw new ActionContractError('provider evidence is not canonical');
  }
  if (source.backfillDecision !== expectedDecision) {
    throw new ActionContractError('backfillDecision is not server-derived');
  }
  if (
    integer(source, 'calculatedUncappedPoints', 0, 5_000_000) !==
    calculatedUncappedPoints
  ) {
    throw new ActionContractError(
      'calculatedUncappedPoints is not server-derived',
    );
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
  if (source.clientCapDecision !== expectedClientCapDecision) {
    throw new ActionContractError('clientCapDecision is not server-derived');
  }
  if (source.runCapDecision !== expectedRunCapDecision) {
    throw new ActionContractError('runCapDecision is not server-derived');
  }
  const suppliedDivergences = stringArray(source, 'divergenceCodes');
  if (JSON.stringify(suppliedDivergences) !== JSON.stringify(divergences)) {
    throw new ActionContractError('divergenceCodes are not server-derived');
  }

  return {
    provider: opaque(source, 'provider'),
    canonicalClientId: opaque(source, 'canonicalClientId'),
    loyaltyAccountIdentityHash: opaque(source, 'loyaltyAccountIdentityHash'),
    providerClientIdentityHash: opaque(source, 'providerClientIdentityHash'),
    providerSoldAmountRubles,
    legacyClaimedSoldAmountRubles,
    legacyClaimedPoints,
    calculatedUncappedPoints,
    intendedDeltaPoints,
    backfillDecision: expectedDecision,
    backfillPolicy: LEGACY_LOYALTY_BACKFILL_POLICY,
    programVersion: LEGACY_LOYALTY_BACKFILL_PROGRAM,
    perClientCapPoints,
    perRunCapPoints,
    clientCapDecision: expectedClientCapDecision,
    runCapDecision: expectedRunCapDecision,
    existingSourceDecision,
    providerEvidence: 'exact_client_ltv_snapshot',
    divergenceCodes: divergences,
  };
}
