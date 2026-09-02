import type { ActionSourceType } from './action-engine.contract';
import { ActionContractError } from './action-engine.errors';

export const P4_09_ACTION_CLASSES = [
  'create_gift_certificate_offer',
  'update_gift_certificate_offer',
  'delete_gift_certificate_offer',
  'create_customer_membership_offer',
  'update_customer_membership_offer',
  'delete_customer_membership_offer',
  'update_referral_reward_policy',
] as const;

export type P409ActionClass = (typeof P4_09_ACTION_CLASSES)[number];
export type P409OfferKind = 'certificate' | 'membership';

export const P4_09_POLICY_VERSION =
  'p4-09.owner-approved-value-configuration.v1' as const;
export const P4_09_INPUT_CONTRACT =
  'maya.p4-09-value-configuration-input/1' as const;

export const P4_09_SAFETY_LIMITS = Object.freeze({
  oneTargetPerMutation: 1,
  bulkMutationAllowed: false,
  membershipCapKopecks: 600_000,
  certificateCapKopecks: 500_000,
  referralCapPerSlotKopecks: 50_000,
  referralAggregateCapKopecks: 100_000,
  referralMaxRecipients: 2,
});

export const P4_09_MEMBERSHIP_TEMPLATES = Object.freeze([
  'haircut.senior',
  'haircut.top',
  'complex.senior',
  'complex.top',
  'beard.senior',
  'beard.top',
] as const);

export const P4_09_CERTIFICATE_TEMPLATES = Object.freeze([
  'gift-certificate.2000',
  'gift-certificate.3000',
  'gift-certificate.5000',
] as const);

export const P4_09_SHADOW_CAPABILITIES = Object.freeze({
  createCertificate: 'value-configuration.certificate.create.shadow.v1',
  updateCertificate: 'value-configuration.certificate.update.shadow.v1',
  deleteCertificate: 'value-configuration.certificate.delete.shadow.v1',
  createMembership: 'value-configuration.membership.create.shadow.v1',
  updateMembership: 'value-configuration.membership.update.shadow.v1',
  deleteMembership: 'value-configuration.membership.delete.shadow.v1',
  updateReferral: 'value-configuration.referral.update.shadow.v1',
});

export const P4_09_EXECUTABLE_CAPABILITIES = Object.freeze({
  createCertificate: 'value-configuration.certificate.create.execute.v1',
  updateCertificate: 'value-configuration.certificate.update.execute.v1',
  deleteCertificate: 'value-configuration.certificate.delete.execute.v1',
  createMembership: 'value-configuration.membership.create.execute.v1',
  updateMembership: 'value-configuration.membership.update.execute.v1',
  deleteMembership: 'value-configuration.membership.delete.execute.v1',
  updateReferral: 'value-configuration.referral.update.execute.v1',
});

export interface P409Registration {
  shadowCapability: string;
  executableCapability: string;
  actionClass: P409ActionClass;
  targetKind: 'tenant_catalog_item' | 'referral_program';
  allowedSourceTypes: readonly ActionSourceType[];
  normalizeInput(value: unknown): Record<string, unknown>;
}

const OPAQUE = /^[A-Za-z0-9._:/-]{1,240}$/;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ActionContractError('P4-09 input must be an object');
  }
  return value as Record<string, unknown>;
}

function only(source: Record<string, unknown>, keys: readonly string[]): void {
  const allowed = new Set(keys);
  const extras = Object.keys(source).filter((key) => !allowed.has(key));
  if (extras.length) {
    throw new ActionContractError(
      `Unexpected P4-09 input: ${extras.join(', ')}`,
    );
  }
}

function opaque(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || !OPAQUE.test(value)) {
    throw new ActionContractError(`${key} must be an opaque reference`);
  }
  return value;
}

function nullableOpaque(
  source: Record<string, unknown>,
  key: string,
): string | null {
  return source[key] === null ? null : opaque(source, key);
}

function displayText(
  source: Record<string, unknown>,
  key: string,
  maximum: number,
  nullable = false,
): string | null {
  const value = source[key];
  if (nullable && value === null) return null;
  if (typeof value !== 'string') {
    throw new ActionContractError(`${key} must be a string`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new ActionContractError(`${key} is outside the approved length`);
  }
  return normalized;
}

function integer(
  source: Record<string, unknown>,
  key: string,
  minimum: number,
  maximum: number,
): number {
  const value = source[key];
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < minimum ||
    Number(value) > maximum
  ) {
    throw new ActionContractError(`${key} is outside the approved cap`);
  }
  return Number(value);
}

function nullableInteger(
  source: Record<string, unknown>,
  key: string,
  minimum: number,
  maximum: number,
): number | null {
  return source[key] === null ? null : integer(source, key, minimum, maximum);
}

function authority(source: Record<string, unknown>) {
  if (
    source.policyVersion !== P4_09_POLICY_VERSION ||
    source.ownerApprovalRequired !== true ||
    source.oneTargetCount !== P4_09_SAFETY_LIMITS.oneTargetPerMutation ||
    source.bulkMutation !== false ||
    source.configWritePerformed !== false ||
    source.providerWrites !== 0
  ) {
    throw new ActionContractError(
      'P4-09 authority or mutation boundary is invalid',
    );
  }
  return {
    actorMembershipId: opaque(source, 'actorMembershipId'),
    actorRole: opaque(source, 'actorRole'),
    policyVersion: P4_09_POLICY_VERSION,
    policySnapshotHash: opaque(source, 'policySnapshotHash'),
    ownerApprovalRequired: true,
    oneTargetCount: 1,
    bulkMutation: false,
    configWritePerformed: false,
    providerWrites: 0,
  };
}

const OFFER_KEYS = [
  'offerId',
  'offerKind',
  'templateKey',
  'supersedesOfferId',
  'previousVersionId',
  'nextVersion',
  'versionId',
  'name',
  'description',
  'priceKopecks',
  'currency',
  'availabilityState',
  'externalRef',
  'valueSnapshotHash',
  'actorMembershipId',
  'actorRole',
  'policyVersion',
  'policySnapshotHash',
  'ownerApprovalRequired',
  'oneTargetCount',
  'bulkMutation',
  'intendedMutation',
  'configWritePerformed',
  'providerWrites',
] as const;

function expectedOfferAction(
  kind: P409OfferKind,
  operation: 'create' | 'update' | 'delete',
): P409ActionClass {
  if (kind === 'certificate') {
    return `${operation}_gift_certificate_offer` as P409ActionClass;
  }
  return `${operation}_customer_membership_offer` as P409ActionClass;
}

function offerNormalizer(
  kind: P409OfferKind,
  operation: 'create' | 'update' | 'delete',
) {
  return (value: unknown): Record<string, unknown> => {
    const source = record(value);
    only(source, OFFER_KEYS);
    if (source.offerKind !== kind) {
      throw new ActionContractError('offerKind is not canonical');
    }
    const templateKey = opaque(source, 'templateKey');
    const templates: readonly string[] =
      kind === 'membership'
        ? P4_09_MEMBERSHIP_TEMPLATES
        : P4_09_CERTIFICATE_TEMPLATES;
    if (!templates.includes(templateKey)) {
      throw new ActionContractError(
        'templateKey is not a server-owned template',
      );
    }
    const previousVersionId = nullableOpaque(source, 'previousVersionId');
    const nextVersion = integer(source, 'nextVersion', 1, 2_147_483_647);
    const availabilityState = source.availabilityState;
    const expectedState = operation === 'delete' ? 'RETIRED' : undefined;
    if (
      (operation === 'create' &&
        (previousVersionId !== null || nextVersion !== 1)) ||
      (operation !== 'create' &&
        (previousVersionId === null || nextVersion < 2)) ||
      (expectedState && availabilityState !== expectedState) ||
      (operation !== 'delete' &&
        availabilityState !== 'ACTIVE' &&
        availabilityState !== 'INACTIVE') ||
      source.intendedMutation !==
        `${operation}_immutable_${kind}_offer_value_version`
    ) {
      throw new ActionContractError('Offer transition is not canonical');
    }
    const cap =
      kind === 'membership'
        ? P4_09_SAFETY_LIMITS.membershipCapKopecks
        : P4_09_SAFETY_LIMITS.certificateCapKopecks;
    const currency = source.currency;
    if (currency !== 'RUB') {
      throw new ActionContractError('Only approved RUB offers are supported');
    }
    return {
      offerId: opaque(source, 'offerId'),
      offerKind: kind,
      templateKey,
      supersedesOfferId: nullableOpaque(source, 'supersedesOfferId'),
      previousVersionId,
      nextVersion,
      versionId: opaque(source, 'versionId'),
      name: displayText(source, 'name', 160),
      description: displayText(source, 'description', 1000, true),
      priceKopecks: integer(source, 'priceKopecks', 1, cap),
      currency: 'RUB',
      availabilityState,
      externalRef: displayText(source, 'externalRef', 160, true),
      valueSnapshotHash: opaque(source, 'valueSnapshotHash'),
      ...authority(source),
      intendedMutation: `${operation}_immutable_${kind}_offer_value_version`,
    };
  };
}

const REFERRAL_KEYS = [
  'programId',
  'previousVersionId',
  'nextVersion',
  'versionId',
  'enabled',
  'inviterRewardKopecks',
  'inviteeRewardKopecks',
  'inviterRewardPercentBasisPoints',
  'inviteeRewardPercentBasisPoints',
  'inviterRewardLiabilityCapKopecks',
  'inviteeRewardLiabilityCapKopecks',
  'currency',
  'terms',
  'codePrefix',
  'valueSnapshotHash',
  'actorMembershipId',
  'actorRole',
  'policyVersion',
  'policySnapshotHash',
  'ownerApprovalRequired',
  'oneTargetCount',
  'bulkMutation',
  'intendedMutation',
  'configWritePerformed',
  'providerWrites',
] as const;

function rewardSlot(
  source: Record<string, unknown>,
  prefix: 'inviter' | 'invitee',
) {
  const money = nullableInteger(
    source,
    `${prefix}RewardKopecks`,
    1,
    P4_09_SAFETY_LIMITS.referralCapPerSlotKopecks,
  );
  const percent = nullableInteger(
    source,
    `${prefix}RewardPercentBasisPoints`,
    1,
    10_000,
  );
  const liability = nullableInteger(
    source,
    `${prefix}RewardLiabilityCapKopecks`,
    1,
    P4_09_SAFETY_LIMITS.referralCapPerSlotKopecks,
  );
  if (!(
    (money === null && percent === null && liability === null) ||
    (money !== null && percent === null && liability === null) ||
    (money === null && percent !== null && liability !== null)
  )) {
    throw new ActionContractError(`${prefix} reward denomination is ambiguous`);
  }
  return { money, percent, liability };
}

export function p409ReferralPolicyNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = record(value);
  only(source, REFERRAL_KEYS);
  if (
    typeof source.enabled !== 'boolean' ||
    source.currency !== 'RUB' ||
    source.intendedMutation !== 'append_referral_reward_policy_version'
  ) {
    throw new ActionContractError(
      'Referral policy transition is not canonical',
    );
  }
  const inviter = rewardSlot(source, 'inviter');
  const invitee = rewardSlot(source, 'invitee');
  const recipients =
    Number(inviter.money !== null || inviter.percent !== null) +
    Number(invitee.money !== null || invitee.percent !== null);
  const aggregate =
    (inviter.money ?? inviter.liability ?? 0) +
    (invitee.money ?? invitee.liability ?? 0);
  if (
    recipients > P4_09_SAFETY_LIMITS.referralMaxRecipients ||
    aggregate > P4_09_SAFETY_LIMITS.referralAggregateCapKopecks
  ) {
    throw new ActionContractError(
      'Referral policy exceeds approved blast radius',
    );
  }
  return {
    programId: opaque(source, 'programId'),
    previousVersionId: nullableOpaque(source, 'previousVersionId'),
    nextVersion: integer(source, 'nextVersion', 1, 2_147_483_647),
    versionId: opaque(source, 'versionId'),
    enabled: source.enabled,
    inviterRewardKopecks: inviter.money,
    inviteeRewardKopecks: invitee.money,
    inviterRewardPercentBasisPoints: inviter.percent,
    inviteeRewardPercentBasisPoints: invitee.percent,
    inviterRewardLiabilityCapKopecks: inviter.liability,
    inviteeRewardLiabilityCapKopecks: invitee.liability,
    currency: 'RUB',
    terms: displayText(source, 'terms', 1000, true),
    codePrefix: displayText(source, 'codePrefix', 16, true),
    valueSnapshotHash: opaque(source, 'valueSnapshotHash'),
    ...authority(source),
    intendedMutation: 'append_referral_reward_policy_version',
  };
}

const OFFER_REGISTRATIONS: Array<Omit<P409Registration, 'allowedSourceTypes'>> =
  [
    [
      'createCertificate',
      'create_gift_certificate_offer',
      'certificate',
      'create',
    ],
    [
      'updateCertificate',
      'update_gift_certificate_offer',
      'certificate',
      'update',
    ],
    [
      'deleteCertificate',
      'delete_gift_certificate_offer',
      'certificate',
      'delete',
    ],
    [
      'createMembership',
      'create_customer_membership_offer',
      'membership',
      'create',
    ],
    [
      'updateMembership',
      'update_customer_membership_offer',
      'membership',
      'update',
    ],
    [
      'deleteMembership',
      'delete_customer_membership_offer',
      'membership',
      'delete',
    ],
  ].map(([key, actionClass, kind, operation]) => ({
    shadowCapability:
      P4_09_SHADOW_CAPABILITIES[key as keyof typeof P4_09_SHADOW_CAPABILITIES],
    executableCapability:
      P4_09_EXECUTABLE_CAPABILITIES[
        key as keyof typeof P4_09_EXECUTABLE_CAPABILITIES
      ],
    actionClass: actionClass as P409ActionClass,
    targetKind: 'tenant_catalog_item' as const,
    normalizeInput: offerNormalizer(
      kind as P409OfferKind,
      operation as 'create' | 'update' | 'delete',
    ),
  }));

export const P4_09_REGISTRATIONS: readonly P409Registration[] = Object.freeze([
  ...OFFER_REGISTRATIONS.map((registration) => ({
    ...registration,
    allowedSourceTypes: ['authenticated_request', 'legacy_bridge'] as const,
  })),
  {
    shadowCapability: P4_09_SHADOW_CAPABILITIES.updateReferral,
    executableCapability: P4_09_EXECUTABLE_CAPABILITIES.updateReferral,
    actionClass: 'update_referral_reward_policy',
    targetKind: 'referral_program',
    allowedSourceTypes: ['authenticated_request', 'legacy_bridge'],
    normalizeInput: p409ReferralPolicyNormalizer,
  },
]);

export function p409ExpectedActionForOffer(
  kind: P409OfferKind,
  operation: 'create' | 'update' | 'delete',
): P409ActionClass {
  return expectedOfferAction(kind, operation);
}
