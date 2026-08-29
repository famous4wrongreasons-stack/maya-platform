import { ActionContractError } from './action-engine.errors';

export const LEGACY_LOYALTY_IMPORT_SHADOW_CAPABILITY =
  'loyalty.legacy-import.shadow.v1' as const;
export const LEGACY_LOYALTY_IMPORT_INPUT_CONTRACT =
  'maya.import_legacy_loyalty_balance-input/1' as const;
export const LEGACY_LOYALTY_IMPORT_POLICY =
  'legacy-one-time-provider-card-alignment.v1' as const;

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

function expectedDivergences(input: {
  providerBalancePoints: number;
  canonicalCurrentBalancePoints: number;
  legacyClaimedProviderBalancePoints: number;
  legacyClaimedCurrentBalancePoints: number;
  legacyClaimedDeltaPoints: number;
  perActionCapPoints: number;
  existingImportDecision: string;
}): string[] {
  const canonicalDelta =
    input.providerBalancePoints - input.canonicalCurrentBalancePoints;
  const divergences: string[] = [];
  if (
    input.providerBalancePoints !== input.legacyClaimedProviderBalancePoints
  ) {
    divergences.push('legacy_provider_balance_mismatch');
  }
  if (
    input.canonicalCurrentBalancePoints !==
    input.legacyClaimedCurrentBalancePoints
  ) {
    divergences.push('legacy_current_balance_mismatch');
  }
  if (canonicalDelta !== input.legacyClaimedDeltaPoints) {
    divergences.push('legacy_delta_mismatch');
  }
  if (Math.abs(canonicalDelta) > input.perActionCapPoints) {
    divergences.push('per_action_cap_exceeded');
  }
  if (input.existingImportDecision === 'already_imported') {
    divergences.push('canonical_import_already_exists');
  }
  return divergences.sort();
}

export function legacyLoyaltyImportShadowNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, [
    'provider',
    'canonicalClientId',
    'loyaltyAccountIdentityHash',
    'providerCardIdentityHash',
    'providerBalancePoints',
    'canonicalCurrentBalancePoints',
    'legacyClaimedProviderBalancePoints',
    'legacyClaimedCurrentBalancePoints',
    'legacyClaimedDeltaPoints',
    'intendedDeltaPoints',
    'importDecision',
    'importPolicy',
    'perActionCapPoints',
    'capDecision',
    'existingImportDecision',
    'providerEvidence',
    'divergenceCodes',
  ]);

  const providerBalancePoints = integer(
    source,
    'providerBalancePoints',
    0,
    5_000_000,
  );
  const canonicalCurrentBalancePoints = integer(
    source,
    'canonicalCurrentBalancePoints',
    0,
    5_000_000,
  );
  const legacyClaimedProviderBalancePoints = integer(
    source,
    'legacyClaimedProviderBalancePoints',
    0,
    5_000_000,
  );
  const legacyClaimedCurrentBalancePoints = integer(
    source,
    'legacyClaimedCurrentBalancePoints',
    0,
    5_000_000,
  );
  const legacyClaimedDeltaPoints = integer(
    source,
    'legacyClaimedDeltaPoints',
    -5_000_000,
    5_000_000,
  );
  const perActionCapPoints = integer(
    source,
    'perActionCapPoints',
    1,
    5_000_000,
  );
  const existingImportDecision = source.existingImportDecision;
  if (
    existingImportDecision !== 'none' &&
    existingImportDecision !== 'already_imported'
  ) {
    throw new ActionContractError('existingImportDecision is invalid');
  }

  const canonicalDelta = providerBalancePoints - canonicalCurrentBalancePoints;
  const eligible =
    Math.abs(canonicalDelta) <= perActionCapPoints &&
    existingImportDecision === 'none';
  const expectedDelta = eligible ? canonicalDelta : 0;
  const expectedDecision = eligible ? 'import' : 'do_not_import';
  const expectedCapDecision =
    Math.abs(canonicalDelta) <= perActionCapPoints
      ? 'within_cap'
      : 'exceeds_cap';
  const divergences = expectedDivergences({
    providerBalancePoints,
    canonicalCurrentBalancePoints,
    legacyClaimedProviderBalancePoints,
    legacyClaimedCurrentBalancePoints,
    legacyClaimedDeltaPoints,
    perActionCapPoints,
    existingImportDecision,
  });

  if (source.importPolicy !== LEGACY_LOYALTY_IMPORT_POLICY) {
    throw new ActionContractError('importPolicy is not canonical');
  }
  if (source.providerEvidence !== 'exact_card_snapshot') {
    throw new ActionContractError('provider evidence is not canonical');
  }
  if (source.importDecision !== expectedDecision) {
    throw new ActionContractError('importDecision is not server-derived');
  }
  const intendedDeltaPoints = integer(
    source,
    'intendedDeltaPoints',
    -5_000_000,
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
    loyaltyAccountIdentityHash: opaque(source, 'loyaltyAccountIdentityHash'),
    providerCardIdentityHash: opaque(source, 'providerCardIdentityHash'),
    providerBalancePoints,
    canonicalCurrentBalancePoints,
    legacyClaimedProviderBalancePoints,
    legacyClaimedCurrentBalancePoints,
    legacyClaimedDeltaPoints,
    intendedDeltaPoints,
    importDecision: expectedDecision,
    importPolicy: LEGACY_LOYALTY_IMPORT_POLICY,
    perActionCapPoints,
    capDecision: expectedCapDecision,
    existingImportDecision,
    providerEvidence: 'exact_card_snapshot',
    divergenceCodes: divergences,
  };
}
