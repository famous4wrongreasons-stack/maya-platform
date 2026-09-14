import { ActionContractError } from './action-engine.errors';

export const LEGACY_LOYALTY_EXPIRE_SHADOW_CAPABILITY =
  'loyalty.legacy-expire.shadow.v1' as const;
export const LEGACY_LOYALTY_EXPIRE_INPUT_CONTRACT =
  'maya.expire_legacy_loyalty-input/1' as const;
export const LEGACY_LOYALTY_EXPIRY_POLICY =
  'legacy-inactivity-360d-full-balance.v1' as const;
export const LEGACY_LOYALTY_EXPIRY_WINDOW_DAYS = 360 as const;

const OPAQUE_REF_PATTERN = /^[A-Za-z0-9._:/-]{1,240}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

function isoDate(
  source: Record<string, unknown>,
  key: string,
  nullable = false,
): string | null {
  const value = source[key];
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) {
    throw new ActionContractError(`${key} must be YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new ActionContractError(`${key} must be a real calendar date`);
  }
  return value;
}

function stringArray(source: Record<string, unknown>, key: string): string[] {
  const value = source[key];
  if (!Array.isArray(value)) {
    throw new ActionContractError(`${key} must be a string array`);
  }
  const items = value as unknown[];
  if (!items.every((item): item is string => typeof item === 'string')) {
    throw new ActionContractError(`${key} must be a string array`);
  }
  return [...items].sort();
}

function expectedDivergences(input: {
  evaluationWindowStart: string;
  evaluationWindowEnd: string;
  policyEffectiveOn: string;
  canonicalBalancePoints: number;
  legacyClaimedBalancePoints: number;
  canonicalRecentAttendedOn: string | null;
  perClientCapPoints: number;
}): string[] {
  const divergences: string[] = [];
  if (input.canonicalBalancePoints !== input.legacyClaimedBalancePoints) {
    divergences.push('legacy_balance_mismatch');
  }
  if (input.policyEffectiveOn > input.evaluationWindowStart) {
    divergences.push('policy_grace_active');
  }
  if (
    input.canonicalRecentAttendedOn !== null &&
    input.canonicalRecentAttendedOn >= input.evaluationWindowStart &&
    input.canonicalRecentAttendedOn <= input.evaluationWindowEnd
  ) {
    divergences.push('canonical_recent_attendance');
  }
  if (input.canonicalBalancePoints > input.perClientCapPoints) {
    divergences.push('per_client_cap_exceeded');
  }
  return divergences.sort();
}

export function legacyLoyaltyExpireShadowNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, [
    'provider',
    'canonicalClientId',
    'evaluationWindowStart',
    'evaluationWindowEnd',
    'policyEffectiveOn',
    'canonicalBalancePoints',
    'legacyClaimedBalancePoints',
    'canonicalRecentAttendedOn',
    'intendedDeltaPoints',
    'eligibilityDecision',
    'expiryPolicy',
    'perClientCapPoints',
    'perRunCapPoints',
    'capDecision',
    'evidenceCoverage',
    'divergenceCodes',
  ]);

  const evaluationWindowStart = isoDate(source, 'evaluationWindowStart')!;
  const evaluationWindowEnd = isoDate(source, 'evaluationWindowEnd')!;
  const policyEffectiveOn = isoDate(source, 'policyEffectiveOn')!;
  if (evaluationWindowStart > evaluationWindowEnd) {
    throw new ActionContractError('expiry evaluation window is invalid');
  }
  const canonicalBalancePoints = integer(
    source,
    'canonicalBalancePoints',
    0,
    5_000_000,
  );
  const legacyClaimedBalancePoints = integer(
    source,
    'legacyClaimedBalancePoints',
    1,
    5_000_000,
  );
  const canonicalRecentAttendedOn = isoDate(
    source,
    'canonicalRecentAttendedOn',
    true,
  );
  const intendedDeltaPoints = integer(
    source,
    'intendedDeltaPoints',
    -5_000_000,
    0,
  );
  const perClientCapPoints = integer(
    source,
    'perClientCapPoints',
    1,
    5_000_000,
  );
  const perRunCapPoints = integer(source, 'perRunCapPoints', 1, 100_000_000);
  if (source.expiryPolicy !== LEGACY_LOYALTY_EXPIRY_POLICY) {
    throw new ActionContractError('expiryPolicy is not canonical');
  }
  if (source.evidenceCoverage !== 'complete') {
    throw new ActionContractError('expiry evidence coverage must be complete');
  }

  const divergences = expectedDivergences({
    evaluationWindowStart,
    evaluationWindowEnd,
    policyEffectiveOn,
    canonicalBalancePoints,
    legacyClaimedBalancePoints,
    canonicalRecentAttendedOn,
    perClientCapPoints,
  });
  const eligible =
    canonicalBalancePoints > 0 &&
    divergences.every((code) => code === 'legacy_balance_mismatch');
  const eligibilityDecision = eligible ? 'expire' : 'do_not_expire';
  const expectedDelta = eligible ? -canonicalBalancePoints : 0;
  const capDecision =
    canonicalBalancePoints <= perClientCapPoints ? 'within_cap' : 'exceeds_cap';
  const suppliedDivergences = stringArray(source, 'divergenceCodes');
  if (source.eligibilityDecision !== eligibilityDecision) {
    throw new ActionContractError('eligibilityDecision is not server-derived');
  }
  if (intendedDeltaPoints !== expectedDelta) {
    throw new ActionContractError('intendedDeltaPoints is not server-derived');
  }
  if (source.capDecision !== capDecision) {
    throw new ActionContractError('capDecision is not server-derived');
  }
  if (JSON.stringify(suppliedDivergences) !== JSON.stringify(divergences)) {
    throw new ActionContractError('divergenceCodes are not server-derived');
  }

  return {
    provider: opaque(source, 'provider'),
    canonicalClientId: opaque(source, 'canonicalClientId'),
    evaluationWindowStart,
    evaluationWindowEnd,
    policyEffectiveOn,
    canonicalBalancePoints,
    legacyClaimedBalancePoints,
    canonicalRecentAttendedOn,
    intendedDeltaPoints,
    eligibilityDecision,
    expiryPolicy: LEGACY_LOYALTY_EXPIRY_POLICY,
    perClientCapPoints,
    perRunCapPoints,
    capDecision,
    evidenceCoverage: 'complete',
    divergenceCodes: divergences,
  };
}
