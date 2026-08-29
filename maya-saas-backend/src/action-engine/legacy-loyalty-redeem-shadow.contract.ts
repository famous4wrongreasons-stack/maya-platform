import { ActionContractError } from './action-engine.errors';

export const LEGACY_LOYALTY_REDEEM_SHADOW_CAPABILITY =
  'loyalty.legacy-redeem.shadow.v1' as const;
export const LEGACY_LOYALTY_REDEEM_INPUT_CONTRACT =
  'maya.redeem_legacy_loyalty-input/1' as const;
export const LEGACY_LOYALTY_REDEMPTION_POLICY =
  'legacy-booking-one-care-service.v1' as const;

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
  canonicalBalancePoints: number;
  serverDerivedPoints: number;
  legacyClaimedPoints: number;
  perActionCapPoints: number;
}): string[] {
  const divergences: string[] = [];
  if (input.serverDerivedPoints !== input.legacyClaimedPoints) {
    divergences.push('legacy_points_mismatch');
  }
  if (input.canonicalBalancePoints < input.serverDerivedPoints) {
    divergences.push('insufficient_canonical_balance');
  }
  if (input.serverDerivedPoints > input.perActionCapPoints) {
    divergences.push('per_action_cap_exceeded');
  }
  return divergences.sort();
}

export function legacyLoyaltyRedeemShadowNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, [
    'provider',
    'canonicalClientId',
    'canonicalAppointmentId',
    'appointmentActionExecutionId',
    'providerRecordIdentityHash',
    'providerServiceId',
    'redemptionRequestIdentityHash',
    'canonicalBalancePoints',
    'serverDerivedPoints',
    'legacyClaimedPoints',
    'intendedDeltaPoints',
    'resultingBalancePoints',
    'eligibilityDecision',
    'redemptionPolicy',
    'perActionCapPoints',
    'capDecision',
    'appointmentEvidence',
    'providerProjectionDecision',
    'divergenceCodes',
  ]);

  const canonicalBalancePoints = integer(
    source,
    'canonicalBalancePoints',
    0,
    5_000_000,
  );
  const serverDerivedPoints = integer(
    source,
    'serverDerivedPoints',
    1,
    5_000_000,
  );
  const legacyClaimedPoints = integer(
    source,
    'legacyClaimedPoints',
    1,
    5_000_000,
  );
  const perActionCapPoints = integer(
    source,
    'perActionCapPoints',
    1,
    5_000_000,
  );
  const divergences = expectedDivergences({
    canonicalBalancePoints,
    serverDerivedPoints,
    legacyClaimedPoints,
    perActionCapPoints,
  });
  const eligible =
    canonicalBalancePoints >= serverDerivedPoints &&
    serverDerivedPoints <= perActionCapPoints;
  const intendedDeltaPoints = integer(
    source,
    'intendedDeltaPoints',
    -5_000_000,
    0,
  );
  const resultingBalancePoints = integer(
    source,
    'resultingBalancePoints',
    0,
    5_000_000,
  );
  const expectedDelta = eligible ? -serverDerivedPoints : 0;
  const expectedResultingBalance = canonicalBalancePoints + expectedDelta;
  const expectedDecision = eligible ? 'redeem' : 'do_not_redeem';
  const expectedCapDecision =
    serverDerivedPoints <= perActionCapPoints ? 'within_cap' : 'exceeds_cap';

  if (source.redemptionPolicy !== LEGACY_LOYALTY_REDEMPTION_POLICY) {
    throw new ActionContractError('redemptionPolicy is not canonical');
  }
  if (source.appointmentEvidence !== 'canonical_create_succeeded') {
    throw new ActionContractError('appointment evidence is not canonical');
  }
  if (source.providerProjectionDecision !== 'deferred_attempt') {
    throw new ActionContractError('provider projection is not deferred');
  }
  if (source.eligibilityDecision !== expectedDecision) {
    throw new ActionContractError('eligibilityDecision is not server-derived');
  }
  if (intendedDeltaPoints !== expectedDelta) {
    throw new ActionContractError('intendedDeltaPoints is not server-derived');
  }
  if (resultingBalancePoints !== expectedResultingBalance) {
    throw new ActionContractError(
      'resultingBalancePoints is not server-derived',
    );
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
    appointmentActionExecutionId: opaque(
      source,
      'appointmentActionExecutionId',
    ),
    providerRecordIdentityHash: opaque(source, 'providerRecordIdentityHash'),
    providerServiceId: opaque(source, 'providerServiceId'),
    redemptionRequestIdentityHash: opaque(
      source,
      'redemptionRequestIdentityHash',
    ),
    canonicalBalancePoints,
    serverDerivedPoints,
    legacyClaimedPoints,
    intendedDeltaPoints,
    resultingBalancePoints,
    eligibilityDecision: expectedDecision,
    redemptionPolicy: LEGACY_LOYALTY_REDEMPTION_POLICY,
    perActionCapPoints,
    capDecision: expectedCapDecision,
    appointmentEvidence: 'canonical_create_succeeded',
    providerProjectionDecision: 'deferred_attempt',
    divergenceCodes: divergences,
  };
}
