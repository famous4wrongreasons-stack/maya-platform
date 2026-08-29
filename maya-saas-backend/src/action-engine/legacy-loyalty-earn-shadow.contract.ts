import { ActionContractError } from './action-engine.errors';

export const LEGACY_LOYALTY_EARN_SHADOW_CAPABILITY =
  'loyalty.legacy-earn.shadow.v1' as const;
export const LEGACY_LOYALTY_EARN_INPUT_CONTRACT =
  'maya.earn_legacy_loyalty-input/1' as const;
export const LEGACY_LOYALTY_EARN_CALCULATION_POLICY =
  'legacy-cashback-5pct-half-even.v1' as const;

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

/** Match Python's round-half-to-even for the legacy integer-ruble 5% rule. */
export function calculateLegacyLoyaltyEarnPoints(
  visitAmountRubles: number,
): number {
  if (!Number.isInteger(visitAmountRubles) || visitAmountRubles < 1) {
    throw new ActionContractError(
      'visitAmountRubles must be a positive integer',
    );
  }
  const quotient = Math.floor(visitAmountRubles / 20);
  const remainder = visitAmountRubles % 20;
  if (remainder < 10) return quotient;
  if (remainder > 10) return quotient + 1;
  return quotient % 2 === 0 ? quotient : quotient + 1;
}

export function legacyLoyaltyEarnShadowNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, [
    'provider',
    'canonicalClientId',
    'providerVisitIdentityHash',
    'visitOccurredOn',
    'visitAmountRubles',
    'intendedDeltaPoints',
    'legacyClaimedPoints',
    'calculationPolicy',
    'divergenceCode',
  ]);

  const visitOccurredOn = source.visitOccurredOn;
  if (
    typeof visitOccurredOn !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(visitOccurredOn)
  ) {
    throw new ActionContractError('visitOccurredOn must be YYYY-MM-DD');
  }
  const visitAmountRubles = integer(
    source,
    'visitAmountRubles',
    1,
    100_000_000,
  );
  const intendedDeltaPoints = integer(
    source,
    'intendedDeltaPoints',
    1,
    5_000_000,
  );
  const legacyClaimedPoints = integer(
    source,
    'legacyClaimedPoints',
    1,
    5_000_000,
  );
  if (source.calculationPolicy !== LEGACY_LOYALTY_EARN_CALCULATION_POLICY) {
    throw new ActionContractError('calculationPolicy is not canonical');
  }
  if (
    intendedDeltaPoints !== calculateLegacyLoyaltyEarnPoints(visitAmountRubles)
  ) {
    throw new ActionContractError('intendedDeltaPoints is not server-derived');
  }
  const expectedDivergence =
    intendedDeltaPoints === legacyClaimedPoints
      ? 'none'
      : 'legacy_points_mismatch';
  if (source.divergenceCode !== expectedDivergence) {
    throw new ActionContractError('divergenceCode does not match the intent');
  }

  return {
    provider: opaque(source, 'provider'),
    canonicalClientId: opaque(source, 'canonicalClientId'),
    providerVisitIdentityHash: opaque(source, 'providerVisitIdentityHash'),
    visitOccurredOn,
    visitAmountRubles,
    intendedDeltaPoints,
    legacyClaimedPoints,
    calculationPolicy: LEGACY_LOYALTY_EARN_CALCULATION_POLICY,
    divergenceCode: expectedDivergence,
  };
}
