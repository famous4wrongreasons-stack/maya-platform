import { ActionContractError } from './action-engine.errors';

export const LEGACY_LOYALTY_GRANT_CONSUME_SHADOW_CAPABILITY =
  'loyalty.redemption-grant.consume.shadow.v1' as const;
export const LEGACY_LOYALTY_GRANT_CONSUME_INPUT_CONTRACT =
  'maya.consume_loyalty_redemption_grant-input/1' as const;
export const LEGACY_LOYALTY_GRANT_CONSUME_POLICY =
  'legacy-one-time-grant-consume.v1' as const;
export const LOYALTY_REDEMPTION_CODE_HASH_CONTRACT =
  'hmac-sha256-normalized-bearer.v1' as const;

const OPAQUE_REF_PATTERN = /^[A-Za-z0-9._:/-]{1,240}$/;
const REQUESTER_ROLES = new Set([
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
  'manager',
  'branch_manager',
  'provider',
  'employee',
  'staff',
]);

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
  if (!Array.isArray(value) || value.length > 8) {
    throw new ActionContractError(`${key} must be a bounded string array`);
  }
  if (!value.every((item): item is string => typeof item === 'string')) {
    throw new ActionContractError(`${key} must be a bounded string array`);
  }
  return [...value].sort();
}

function expectedDivergences(input: {
  grantPoints: number;
  legacyClaimedPoints: number;
  availableBalancePoints: number;
  legacyClaimedBalancePoints: number;
  perRedemptionCapPoints: number;
  expiryDecision: string;
  legacyClaimedExpiredDecision: string;
  existingRedemptionDecision: string;
  legacyClaimedUsedDecision: string;
}): string[] {
  const divergences: string[] = [];
  if (input.grantPoints !== input.legacyClaimedPoints) {
    divergences.push('legacy_points_mismatch');
  }
  if (input.availableBalancePoints !== input.legacyClaimedBalancePoints) {
    divergences.push('legacy_balance_mismatch');
  }
  if (input.grantPoints > input.perRedemptionCapPoints) {
    divergences.push('per_redemption_cap_exceeded');
  }
  if (input.availableBalancePoints < input.grantPoints) {
    divergences.push('insufficient_canonical_balance');
  }
  if (input.expiryDecision === 'expired') {
    divergences.push('canonical_grant_expired');
  }
  if (input.expiryDecision !== input.legacyClaimedExpiredDecision) {
    divergences.push('legacy_expiry_mismatch');
  }
  if (input.existingRedemptionDecision === 'already_redeemed') {
    divergences.push('canonical_grant_already_redeemed');
  }
  if (input.existingRedemptionDecision !== input.legacyClaimedUsedDecision) {
    divergences.push('legacy_used_state_mismatch');
  }
  return divergences.sort();
}

export function legacyLoyaltyGrantConsumeShadowNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, [
    'provider',
    'canonicalGrantId',
    'grantIdentityHash',
    'issueExecutionIdentityHash',
    'canonicalClientId',
    'requesterIdentityHash',
    'requesterRole',
    'requesterAuthority',
    'loyaltyAccountIdentityHash',
    'serviceRef',
    'serviceIdentityHash',
    'grantPoints',
    'availableBalancePoints',
    'consumeDecision',
    'consumePolicy',
    'codeHashContract',
    'perRedemptionCapPoints',
    'expiryDecision',
    'balanceDecision',
    'capDecision',
    'existingRedemptionDecision',
    'providerProjectionDecision',
    'authorizationEvidence',
    'legacyClaimedPoints',
    'legacyClaimedBalancePoints',
    'legacyClaimedUsedDecision',
    'legacyClaimedExpiredDecision',
    'divergenceCodes',
  ]);

  const grantPoints = integer(source, 'grantPoints', 1, 5_000_000);
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
  const legacyClaimedBalancePoints = integer(
    source,
    'legacyClaimedBalancePoints',
    0,
    5_000_000,
  );
  const perRedemptionCapPoints = integer(
    source,
    'perRedemptionCapPoints',
    1,
    5_000_000,
  );
  const expiryDecision = source.expiryDecision;
  if (expiryDecision !== 'unexpired' && expiryDecision !== 'expired') {
    throw new ActionContractError('expiryDecision is invalid');
  }
  const existingRedemptionDecision = source.existingRedemptionDecision;
  if (
    existingRedemptionDecision !== 'none' &&
    existingRedemptionDecision !== 'already_redeemed'
  ) {
    throw new ActionContractError('existingRedemptionDecision is invalid');
  }
  const legacyClaimedUsedDecision = source.legacyClaimedUsedDecision;
  if (
    legacyClaimedUsedDecision !== 'none' &&
    legacyClaimedUsedDecision !== 'already_redeemed'
  ) {
    throw new ActionContractError('legacyClaimedUsedDecision is invalid');
  }
  const legacyClaimedExpiredDecision = source.legacyClaimedExpiredDecision;
  if (
    legacyClaimedExpiredDecision !== 'unexpired' &&
    legacyClaimedExpiredDecision !== 'expired'
  ) {
    throw new ActionContractError('legacyClaimedExpiredDecision is invalid');
  }

  const expectedBalanceDecision =
    availableBalancePoints >= grantPoints ? 'sufficient' : 'insufficient';
  const expectedCapDecision =
    grantPoints <= perRedemptionCapPoints ? 'within_cap' : 'exceeds_cap';
  const eligible =
    expiryDecision === 'unexpired' &&
    expectedBalanceDecision === 'sufficient' &&
    expectedCapDecision === 'within_cap' &&
    existingRedemptionDecision === 'none';
  const expectedConsumeDecision = eligible ? 'consume' : 'do_not_consume';
  const requesterRole = opaque(source, 'requesterRole');
  if (!REQUESTER_ROLES.has(requesterRole)) {
    throw new ActionContractError('requesterRole is not canonical');
  }
  const requesterAuthority = source.requesterAuthority;
  if (
    requesterAuthority !== 'administrative_role' &&
    requesterAuthority !== 'server_cashier_allowlist'
  ) {
    throw new ActionContractError('requesterAuthority is not canonical');
  }
  const divergences = expectedDivergences({
    grantPoints,
    legacyClaimedPoints,
    availableBalancePoints,
    legacyClaimedBalancePoints,
    perRedemptionCapPoints,
    expiryDecision,
    legacyClaimedExpiredDecision,
    existingRedemptionDecision,
    legacyClaimedUsedDecision,
  });

  if (source.consumePolicy !== LEGACY_LOYALTY_GRANT_CONSUME_POLICY) {
    throw new ActionContractError('consumePolicy is not canonical');
  }
  if (source.codeHashContract !== LOYALTY_REDEMPTION_CODE_HASH_CONTRACT) {
    throw new ActionContractError('codeHashContract is not canonical');
  }
  if (source.providerProjectionDecision !== 'not_evaluated_in_shadow') {
    throw new ActionContractError(
      'providerProjectionDecision is not canonical',
    );
  }
  if (source.authorizationEvidence !== 'server_resolved_cashier_or_admin') {
    throw new ActionContractError('authorizationEvidence is not canonical');
  }
  if (source.consumeDecision !== expectedConsumeDecision) {
    throw new ActionContractError('consumeDecision is not server-derived');
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
    canonicalGrantId: opaque(source, 'canonicalGrantId'),
    grantIdentityHash: opaque(source, 'grantIdentityHash'),
    issueExecutionIdentityHash: opaque(source, 'issueExecutionIdentityHash'),
    canonicalClientId: opaque(source, 'canonicalClientId'),
    requesterIdentityHash: opaque(source, 'requesterIdentityHash'),
    requesterRole,
    requesterAuthority,
    loyaltyAccountIdentityHash: opaque(source, 'loyaltyAccountIdentityHash'),
    serviceRef: opaque(source, 'serviceRef'),
    serviceIdentityHash: opaque(source, 'serviceIdentityHash'),
    grantPoints,
    availableBalancePoints,
    consumeDecision: expectedConsumeDecision,
    consumePolicy: LEGACY_LOYALTY_GRANT_CONSUME_POLICY,
    codeHashContract: LOYALTY_REDEMPTION_CODE_HASH_CONTRACT,
    perRedemptionCapPoints,
    expiryDecision,
    balanceDecision: expectedBalanceDecision,
    capDecision: expectedCapDecision,
    existingRedemptionDecision,
    providerProjectionDecision: 'not_evaluated_in_shadow',
    authorizationEvidence: 'server_resolved_cashier_or_admin',
    legacyClaimedPoints,
    legacyClaimedBalancePoints,
    legacyClaimedUsedDecision,
    legacyClaimedExpiredDecision,
    divergenceCodes: divergences,
  };
}
