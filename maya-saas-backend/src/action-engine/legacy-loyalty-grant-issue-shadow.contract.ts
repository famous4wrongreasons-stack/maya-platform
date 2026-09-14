import { ActionContractError } from './action-engine.errors';

export const LEGACY_LOYALTY_GRANT_ISSUE_SHADOW_CAPABILITY =
  'loyalty.redemption-grant.issue.shadow.v1' as const;
export const LEGACY_LOYALTY_GRANT_ISSUE_INPUT_CONTRACT =
  'maya.issue_loyalty_redemption_grant-input/1' as const;
export const LEGACY_LOYALTY_GRANT_ISSUE_POLICY =
  'legacy-one-time-service-grant.v1' as const;
export const LEGACY_LOYALTY_GRANT_CATALOG_POLICY =
  'server-redeemable-service-allowlist.v1' as const;

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
  if (!Array.isArray(value) || value.length > 6) {
    throw new ActionContractError(`${key} must be a bounded string array`);
  }
  if (!value.every((item): item is string => typeof item === 'string')) {
    throw new ActionContractError(`${key} must be a bounded string array`);
  }
  return [...value].sort();
}

function expectedDivergences(input: {
  serviceTitleIdentityHash: string;
  legacyClaimedServiceTitleIdentityHash: string;
  servicePoints: number;
  legacyClaimedPoints: number;
  availableBalancePoints: number;
  perGrantCapPoints: number;
  serviceEligibility: string;
  existingGrantDecision: string;
}): string[] {
  const divergences: string[] = [];
  if (
    input.serviceTitleIdentityHash !==
    input.legacyClaimedServiceTitleIdentityHash
  ) {
    divergences.push('legacy_service_title_mismatch');
  }
  if (input.servicePoints !== input.legacyClaimedPoints) {
    divergences.push('legacy_points_mismatch');
  }
  if (input.availableBalancePoints < input.servicePoints) {
    divergences.push('insufficient_canonical_balance');
  }
  if (input.servicePoints > input.perGrantCapPoints) {
    divergences.push('per_grant_cap_exceeded');
  }
  if (input.serviceEligibility === 'not_allowed') {
    divergences.push('service_not_allowed');
  }
  if (input.existingGrantDecision === 'already_issued') {
    divergences.push('canonical_grant_already_exists');
  }
  return divergences.sort();
}

export function legacyLoyaltyGrantIssueShadowNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, [
    'provider',
    'canonicalClientId',
    'requestIdentityHash',
    'loyaltyAccountIdentityHash',
    'serviceRef',
    'serviceIdentityHash',
    'serviceTitleIdentityHash',
    'legacyClaimedServiceTitleIdentityHash',
    'servicePoints',
    'legacyClaimedPoints',
    'availableBalancePoints',
    'grantDecision',
    'grantPolicy',
    'catalogPolicyVersion',
    'ttlDays',
    'perGrantCapPoints',
    'serviceEligibility',
    'balanceDecision',
    'capDecision',
    'existingGrantDecision',
    'authorizationEvidence',
    'divergenceCodes',
  ]);

  const servicePoints = integer(source, 'servicePoints', 1, 5_000_000);
  const legacyClaimedPoints = integer(
    source,
    'legacyClaimedPoints',
    1,
    5_000_000,
  );
  const availableBalancePoints = integer(
    source,
    'availableBalancePoints',
    0,
    5_000_000,
  );
  const perGrantCapPoints = integer(source, 'perGrantCapPoints', 1, 5_000_000);
  const ttlDays = integer(source, 'ttlDays', 1, 365);
  const serviceEligibility = source.serviceEligibility;
  if (
    serviceEligibility !== 'allowed' &&
    serviceEligibility !== 'not_allowed'
  ) {
    throw new ActionContractError('serviceEligibility is invalid');
  }
  const existingGrantDecision = source.existingGrantDecision;
  if (
    existingGrantDecision !== 'none' &&
    existingGrantDecision !== 'already_issued'
  ) {
    throw new ActionContractError('existingGrantDecision is invalid');
  }

  const expectedBalanceDecision =
    availableBalancePoints >= servicePoints ? 'sufficient' : 'insufficient';
  const expectedCapDecision =
    servicePoints <= perGrantCapPoints ? 'within_cap' : 'exceeds_cap';
  const eligible =
    serviceEligibility === 'allowed' &&
    expectedBalanceDecision === 'sufficient' &&
    expectedCapDecision === 'within_cap' &&
    existingGrantDecision === 'none';
  const expectedGrantDecision = eligible ? 'issue' : 'do_not_issue';
  const serviceTitleIdentityHash = opaque(source, 'serviceTitleIdentityHash');
  const legacyClaimedServiceTitleIdentityHash = opaque(
    source,
    'legacyClaimedServiceTitleIdentityHash',
  );
  const divergences = expectedDivergences({
    serviceTitleIdentityHash,
    legacyClaimedServiceTitleIdentityHash,
    servicePoints,
    legacyClaimedPoints,
    availableBalancePoints,
    perGrantCapPoints,
    serviceEligibility,
    existingGrantDecision,
  });

  if (source.grantPolicy !== LEGACY_LOYALTY_GRANT_ISSUE_POLICY) {
    throw new ActionContractError('grantPolicy is not canonical');
  }
  if (source.catalogPolicyVersion !== LEGACY_LOYALTY_GRANT_CATALOG_POLICY) {
    throw new ActionContractError('catalogPolicyVersion is not canonical');
  }
  if (source.authorizationEvidence !== 'trusted_shadow_candidate_only') {
    throw new ActionContractError('authorizationEvidence is not canonical');
  }
  if (source.grantDecision !== expectedGrantDecision) {
    throw new ActionContractError('grantDecision is not server-derived');
  }
  if (source.balanceDecision !== expectedBalanceDecision) {
    throw new ActionContractError('balanceDecision is not server-derived');
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
    requestIdentityHash: opaque(source, 'requestIdentityHash'),
    loyaltyAccountIdentityHash: opaque(source, 'loyaltyAccountIdentityHash'),
    serviceRef: opaque(source, 'serviceRef'),
    serviceIdentityHash: opaque(source, 'serviceIdentityHash'),
    serviceTitleIdentityHash,
    legacyClaimedServiceTitleIdentityHash,
    servicePoints,
    legacyClaimedPoints,
    availableBalancePoints,
    grantDecision: expectedGrantDecision,
    grantPolicy: LEGACY_LOYALTY_GRANT_ISSUE_POLICY,
    catalogPolicyVersion: LEGACY_LOYALTY_GRANT_CATALOG_POLICY,
    ttlDays,
    perGrantCapPoints,
    serviceEligibility,
    balanceDecision: expectedBalanceDecision,
    capDecision: expectedCapDecision,
    existingGrantDecision,
    authorizationEvidence: 'trusted_shadow_candidate_only',
    divergenceCodes: divergences,
  };
}
