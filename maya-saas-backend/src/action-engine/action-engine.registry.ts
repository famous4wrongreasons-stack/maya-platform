import { clientHabitsCapability } from './client-habits.contract';
import { clientPreferenceCapabilities } from './client-preferences.contract';
import { clientWantedSlotCapabilities } from './client-wanted-slot.contract';
import { ActionPolicyDecision } from '@prisma/client';

import { ActionContractError } from './action-engine.errors';
import type {
  ActionSourceType,
  RegisteredActionCapabilityV1,
} from './action-engine.contract';
import {
  LEGACY_LOYALTY_EARN_INPUT_CONTRACT,
  LEGACY_LOYALTY_EARN_SHADOW_CAPABILITY,
  legacyLoyaltyEarnShadowNormalizer,
} from './legacy-loyalty-earn-shadow.contract';
import {
  LEGACY_LOYALTY_EXPIRE_INPUT_CONTRACT,
  LEGACY_LOYALTY_EXPIRE_SHADOW_CAPABILITY,
  legacyLoyaltyExpireShadowNormalizer,
} from './legacy-loyalty-expire-shadow.contract';
import {
  LEGACY_LOYALTY_REDEEM_INPUT_CONTRACT,
  LEGACY_LOYALTY_REDEEM_SHADOW_CAPABILITY,
  legacyLoyaltyRedeemShadowNormalizer,
} from './legacy-loyalty-redeem-shadow.contract';
import {
  LEGACY_LOYALTY_REFUND_INPUT_CONTRACT,
  LEGACY_LOYALTY_REFUND_SHADOW_CAPABILITY,
  legacyLoyaltyRefundShadowNormalizer,
} from './legacy-loyalty-refund-shadow.contract';
import {
  LEGACY_LOYALTY_IMPORT_INPUT_CONTRACT,
  LEGACY_LOYALTY_IMPORT_SHADOW_CAPABILITY,
  legacyLoyaltyImportShadowNormalizer,
} from './legacy-loyalty-import-shadow.contract';
import {
  LEGACY_LOYALTY_BACKFILL_INPUT_CONTRACT,
  LEGACY_LOYALTY_BACKFILL_SHADOW_CAPABILITY,
  legacyLoyaltyBackfillShadowNormalizer,
} from './legacy-loyalty-backfill-shadow.contract';
import {
  LEGACY_LOYALTY_GRANT_ISSUE_INPUT_CONTRACT,
  LEGACY_LOYALTY_GRANT_ISSUE_SHADOW_CAPABILITY,
  legacyLoyaltyGrantIssueShadowNormalizer,
} from './legacy-loyalty-grant-issue-shadow.contract';
import {
  LEGACY_LOYALTY_GRANT_CONSUME_INPUT_CONTRACT,
  LEGACY_LOYALTY_GRANT_CONSUME_SHADOW_CAPABILITY,
  legacyLoyaltyGrantConsumeShadowNormalizer,
} from './legacy-loyalty-grant-consume-shadow.contract';
import {
  P4_03_BULK_ENVELOPE_CAPABILITIES,
  P4_03_BULK_POLICY_PROFILES,
  P4_03_EXECUTABLE_CAPABILITIES,
  p403BackfillExecutableNormalizer,
  p403BulkEnvelopeNormalizer,
  p403EarnExecutableNormalizer,
  p403ExpireExecutableNormalizer,
  p403GrantConsumeExecutableNormalizer,
  p403GrantIssueExecutableNormalizer,
  p403ImportExecutableNormalizer,
  p403RedeemExecutableNormalizer,
  p403RefundExecutableNormalizer,
  type P403BulkActionClass,
  type P403ExecutableActionClass,
} from './p4-03-legacy-loyalty-executable.contract';
import {
  P4_04_EXECUTABLE_REGISTRATIONS,
  P4_04_SCHEDULER_ENVELOPE_CAPABILITY,
  p404SchedulerEnvelopeExecutableNormalizer,
  type P404ExecutableRegistration,
} from './p4-04-referral-reward-executable.contract';
import {
  CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_CAPABILITY,
  CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_INPUT_CONTRACT,
  customerSubscriptionPurchaseShadowNormalizer,
} from './customer-subscription-purchase-shadow.contract';
import {
  CUSTOMER_SUBSCRIPTION_ACTIVATION_SHADOW_CAPABILITY,
  CUSTOMER_SUBSCRIPTION_ACTIVATION_SHADOW_INPUT_CONTRACT,
  customerSubscriptionActivationShadowNormalizer,
} from './customer-subscription-activation-shadow.contract';
import {
  CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_CAPABILITY,
  CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_INPUT_CONTRACT,
  customerSubscriptionRenewalShadowNormalizer,
} from './customer-subscription-renewal-shadow.contract';
import {
  CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_CAPABILITY,
  CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_INPUT_CONTRACT,
  customerSubscriptionRenewalActivationShadowNormalizer,
} from './customer-subscription-renewal-activation-shadow.contract';
import {
  CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_CAPABILITY,
  CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_INPUT_CONTRACT,
  customerSubscriptionUsageShadowNormalizer,
} from './customer-subscription-usage-shadow.contract';
import {
  CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_CAPABILITY,
  CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_INPUT_CONTRACT,
  customerSubscriptionExpiryShadowNormalizer,
} from './customer-subscription-expiry-shadow.contract';
import {
  CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_CAPABILITY,
  CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_INPUT_CONTRACT,
  customerSubscriptionCancellationShadowNormalizer,
} from './customer-subscription-cancellation-shadow.contract';
import {
  CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_CAPABILITY,
  CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_INPUT_CONTRACT,
  customerSubscriptionRevocationShadowNormalizer,
} from './customer-subscription-revocation-shadow.contract';
import {
  P4_05_EXECUTABLE_REGISTRATIONS,
  P4_05_SCHEDULER_ENVELOPE_CAPABILITY,
  P4_05_SCHEDULER_ENVELOPE_CONTRACT,
  customerSubscriptionSchedulerEnvelopeNormalizer,
  type P405ExecutableRegistration,
} from './p4-05-customer-subscription-executable.contract';
import {
  GIFT_CERTIFICATE_PURCHASE_SHADOW_CAPABILITY,
  GIFT_CERTIFICATE_PURCHASE_SHADOW_INPUT_CONTRACT,
  giftCertificatePurchaseShadowNormalizer,
} from './gift-certificate-purchase-shadow.contract';
import {
  GIFT_CERTIFICATE_ACTIVATION_SHADOW_CAPABILITY,
  GIFT_CERTIFICATE_ACTIVATION_SHADOW_INPUT_CONTRACT,
  giftCertificateActivationShadowNormalizer,
} from './gift-certificate-activation-shadow.contract';
import {
  GIFT_CERTIFICATE_REDEMPTION_SHADOW_CAPABILITY,
  GIFT_CERTIFICATE_REDEMPTION_SHADOW_INPUT_CONTRACT,
  giftCertificateRedemptionShadowNormalizer,
} from './gift-certificate-redemption-shadow.contract';
import {
  P4_06_EXECUTABLE_REGISTRATIONS,
  type P406ExecutableRegistration,
} from './p4-06-gift-certificate-executable.contract';
import {
  EXPENSE_CREATE_INPUT_CONTRACT,
  EXPENSE_CREATE_SHADOW_CAPABILITY,
  EXPENSE_DELETE_INPUT_CONTRACT,
  EXPENSE_DELETE_SHADOW_CAPABILITY,
  EXPENSE_PERIOD_DECLARE_INPUT_CONTRACT,
  EXPENSE_PERIOD_DECLARE_SHADOW_CAPABILITY,
  P4_07_EXECUTABLE_REGISTRATIONS,
  expenseCreateNormalizer,
  expenseDeleteNormalizer,
  expensePeriodDeclareNormalizer,
} from './p4-07-expense-executable.contract';
import {
  P4_08_EXECUTABLE_CAPABILITIES,
  P4_08_REGISTRATIONS,
  P4_08_SCHEDULER_ENVELOPE_CAPABILITY,
  P4_08_SCHEDULER_ENVELOPE_CONTRACT,
  P4_08_SHADOW_CAPABILITIES,
  tenantBillingSchedulerEnvelopeNormalizer,
  type P408Registration,
} from './p4-08-tenant-billing-executable.contract';
import {
  P4_09_INPUT_CONTRACT,
  P4_09_REGISTRATIONS,
  type P409Registration,
} from './p4-09-value-configuration-executable.contract';
import {
  P4_10_INPUT_CONTRACT,
  P4_10_REGISTRATIONS,
  type P410Registration,
} from './p4-10-commerce-credential-executable.contract';
import {
  PACKAGE5_WAVE1_INPUT_CONTRACT,
  PACKAGE5_WAVE1_REGISTRATIONS,
  normalizePackage5Wave1Input,
  type Package5Wave1Registration,
} from './package5-wave1-executable.contract';
import {
  PACKAGE5_WAVE2_INPUT_CONTRACT,
  PACKAGE5_WAVE2_REGISTRATIONS,
  normalizePackage5Wave2Input,
  type Package5Wave2Registration,
} from './package5-wave2-executable.contract';
import {
  PACKAGE5_WAVE3_INPUT_CONTRACT,
  PACKAGE5_WAVE3_REGISTRATIONS,
  normalizePackage5Wave3Input,
  type Package5Wave3Registration,
} from './package5-wave3-executable.contract';
import {
  PACKAGE5_WAVE4_INPUT_CONTRACT,
  PACKAGE5_WAVE4_REGISTRATIONS,
  normalizePackage5Wave4Input,
  type Package5Wave4Registration,
} from './package5-wave4-executable.contract';
import {
  PACKAGE5_WAVE5_INPUT_CONTRACT,
  PACKAGE5_WAVE5_REGISTRATIONS,
  normalizePackage5Wave5Input,
  type Package5Wave5Registration,
} from './package5-wave5-executable.contract';
import {
  REFERRAL_CREATE_SHADOW_CAPABILITY,
  REFERRAL_CREATE_SHADOW_INPUT_CONTRACT,
  referralCreateShadowNormalizer,
} from './referral-create-shadow.contract';
import {
  REFERRAL_RESOLVE_SHADOW_CAPABILITY,
  REFERRAL_RESOLVE_SHADOW_INPUT_CONTRACT,
  referralResolveShadowNormalizer,
} from './referral-resolve-shadow.contract';
import {
  REFERRAL_REWARD_ISSUE_SHADOW_CAPABILITY,
  REFERRAL_REWARD_ISSUE_SHADOW_INPUT_CONTRACT,
  REFERRAL_REWARD_POLICY_LIMITS,
  referralRewardIssueShadowNormalizer,
} from './referral-reward-issue-shadow.contract';
import {
  REFERRAL_REWARD_FULFILL_SHADOW_CAPABILITY,
  REFERRAL_REWARD_FULFILL_SHADOW_INPUT_CONTRACT,
  referralRewardFulfillShadowNormalizer,
} from './referral-reward-fulfill-shadow.contract';
import {
  REFERRAL_REWARD_SCHEDULER_ENVELOPE_INPUT_CONTRACT,
  REFERRAL_REWARD_SCHEDULER_ENVELOPE_SHADOW_CAPABILITY,
  referralRewardSchedulerEnvelopeNormalizer,
} from './referral-reward-scheduler-envelope.contract';

const OPAQUE_REF_PATTERN = /^[A-Za-z0-9._:/-]{1,240}$/;

function recordInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ActionContractError('Action input must be a JSON object');
  }
  return value as Record<string, unknown>;
}

export function normalizeOpaqueRef(value: unknown, label: string): string {
  if (typeof value !== 'string' || !OPAQUE_REF_PATTERN.test(value)) {
    throw new ActionContractError(`${label} must be an opaque reference`);
  }
  return value;
}

function optionalOpaqueField(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = source[key];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return normalizeOpaqueRef(value, key);
}

function oneRefNormalizer(key: string) {
  return (value: unknown): Record<string, unknown> => {
    const source = recordInput(value);
    const normalized = optionalOpaqueField(source, key);
    return normalized ? { [key]: normalized } : {};
  };
}

function syntheticNormalizer(value: unknown): Record<string, unknown> {
  const source = recordInput(value);
  return {
    valueRef: normalizeOpaqueRef(source.valueRef, 'valueRef'),
  };
}

function requiredText(
  source: Record<string, unknown>,
  key: string,
  maxLength: number,
): string {
  const value = source[key];
  if (typeof value !== 'string') {
    throw new ActionContractError(`${key} must be a string`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new ActionContractError(`${key} has an invalid length`);
  }
  return normalized;
}

function optionalText(
  source: Record<string, unknown>,
  key: string,
  maxLength: number,
): string | undefined {
  const value = source[key];
  if (value === undefined || value === null || value === '') return undefined;
  return requiredText(source, key, maxLength);
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

function boundedJsonObject(
  source: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = source[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ActionContractError(`${key} must be a JSON object`);
  }
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new ActionContractError(`${key} must be JSON serializable`);
  }
  if (encoded.length > 8_000) {
    throw new ActionContractError(`${key} exceeds the safe size limit`);
  }
  return value as Record<string, unknown>;
}

function newAppointmentDeliveryNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, [
    'userId',
    'sourceEventId',
    'title',
    'bodyText',
    'deepLink',
    'payload',
  ]);
  const deepLink = optionalText(source, 'deepLink', 400);
  const payload = boundedJsonObject(source, 'payload');
  return {
    userId: normalizeOpaqueRef(source.userId, 'userId'),
    sourceEventId: normalizeOpaqueRef(source.sourceEventId, 'sourceEventId'),
    title: requiredText(source, 'title', 160),
    bodyText: requiredText(source, 'bodyText', 12_000),
    ...(deepLink ? { deepLink } : {}),
    ...(payload ? { payload } : {}),
  };
}

function privacyTelegramDeliveryNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, ['telegramChatId', 'sourceEventId']);
  return {
    telegramChatId: normalizeOpaqueRef(source.telegramChatId, 'telegramChatId'),
    sourceEventId: normalizeOpaqueRef(source.sourceEventId, 'sourceEventId'),
  };
}

function package2SingleDeliveryNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, [
    'channel',
    'messageType',
    'userId',
    'telegramChatId',
    'deviceToken',
    'sourceEventId',
    'title',
    'bodyText',
    'deepLink',
    'payload',
    'parseMode',
    'buttons',
    'recipientIdentityRef',
  ]);
  const channel = requiredText(source, 'channel', 40);
  if (channel !== 'inbox' && channel !== 'apns' && channel !== 'telegram') {
    throw new ActionContractError('channel must be inbox, apns or telegram');
  }
  const userId = optionalText(source, 'userId', 160);
  const telegramChatId = optionalText(source, 'telegramChatId', 160);
  const deviceToken = optionalText(source, 'deviceToken', 512);
  const recipientIdentityRef = optionalText(source, 'recipientIdentityRef', 64);
  if (recipientIdentityRef && !/^[a-f0-9]{64}$/.test(recipientIdentityRef)) {
    throw new ActionContractError('recipientIdentityRef must be a HMAC digest');
  }
  if ((channel === 'inbox' || channel === 'apns') && !userId) {
    throw new ActionContractError('userId is required for inbox and apns');
  }
  if (channel === 'apns' && !deviceToken) {
    throw new ActionContractError('deviceToken is required for apns');
  }
  if (channel !== 'apns' && deviceToken) {
    throw new ActionContractError('deviceToken is forbidden outside apns');
  }
  if (channel === 'telegram' && !telegramChatId) {
    throw new ActionContractError('telegramChatId is required for telegram');
  }
  if (channel !== 'telegram' && telegramChatId) {
    throw new ActionContractError(
      'telegramChatId is forbidden outside telegram',
    );
  }
  const parseMode = optionalText(source, 'parseMode', 20);
  if (
    parseMode &&
    parseMode !== 'Markdown' &&
    parseMode !== 'MarkdownV2' &&
    parseMode !== 'HTML'
  ) {
    throw new ActionContractError('parseMode is unsupported');
  }
  if (channel !== 'telegram' && parseMode) {
    throw new ActionContractError('parseMode is forbidden outside telegram');
  }
  const rawButtons = source.buttons;
  if (channel !== 'telegram' && rawButtons !== undefined) {
    throw new ActionContractError('buttons are forbidden outside telegram');
  }
  if (rawButtons !== undefined && !Array.isArray(rawButtons)) {
    throw new ActionContractError('buttons must be an array');
  }
  if (Array.isArray(rawButtons) && rawButtons.length > 4) {
    throw new ActionContractError('buttons may contain at most 4 items');
  }
  const buttons = Array.isArray(rawButtons)
    ? rawButtons.map((item, index) => {
        const button = recordInput(item);
        assertOnlyKeys(button, ['text', 'callbackData', 'url']);
        const callbackData = optionalText(button, 'callbackData', 64);
        const url = optionalText(button, 'url', 400);
        if (Boolean(callbackData) === Boolean(url)) {
          throw new ActionContractError(
            `buttons[${index}] must contain exactly one action`,
          );
        }
        return {
          text: requiredText(button, 'text', 80),
          ...(callbackData ? { callbackData } : {}),
          ...(url ? { url } : {}),
        };
      })
    : [];
  const deepLink = optionalText(source, 'deepLink', 400);
  const payload = boundedJsonObject(source, 'payload');
  return {
    channel,
    messageType: normalizeOpaqueRef(source.messageType, 'messageType'),
    ...(userId ? { userId: normalizeOpaqueRef(userId, 'userId') } : {}),
    ...(telegramChatId
      ? {
          telegramChatId: normalizeOpaqueRef(telegramChatId, 'telegramChatId'),
        }
      : {}),
    sourceEventId: normalizeOpaqueRef(source.sourceEventId, 'sourceEventId'),
    title: requiredText(source, 'title', 160),
    bodyText: requiredText(source, 'bodyText', 12_000),
    ...(deviceToken ? { deviceToken } : {}),
    ...(deepLink ? { deepLink } : {}),
    ...(payload ? { payload } : {}),
    ...(parseMode ? { parseMode } : {}),
    ...(buttons.length ? { buttons } : {}),
    ...(recipientIdentityRef ? { recipientIdentityRef } : {}),
  };
}

function bulkCampaignDeliveryNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, [
    'campaignId',
    'audienceId',
    'audienceSnapshotHash',
    'messageSnapshotHash',
    'title',
    'bodyText',
  ]);
  return {
    campaignId: normalizeOpaqueRef(source.campaignId, 'campaignId'),
    audienceId: normalizeOpaqueRef(source.audienceId, 'audienceId'),
    audienceSnapshotHash: normalizeOpaqueRef(
      source.audienceSnapshotHash,
      'audienceSnapshotHash',
    ),
    messageSnapshotHash: normalizeOpaqueRef(
      source.messageSnapshotHash,
      'messageSnapshotHash',
    ),
    title: requiredText(source, 'title', 160),
    bodyText: requiredText(source, 'bodyText', 12_000),
  };
}

function isoTimestamp(source: Record<string, unknown>, key: string): string {
  const value = requiredText(source, key, 80);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new ActionContractError(`${key} must be an ISO timestamp`);
  }
  return parsed.toISOString();
}

function serviceIds(source: Record<string, unknown>): string[] {
  const value = source.serviceIds;
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) {
    throw new ActionContractError('serviceIds must be a non-empty array');
  }
  const normalized = value.map((item) => normalizeOpaqueRef(item, 'serviceId'));
  return [...new Set(normalized)].sort();
}

function optionalServiceIds(
  source: Record<string, unknown>,
): string[] | undefined {
  if (source.serviceIds === undefined || source.serviceIds === null) {
    return undefined;
  }
  return serviceIds(source);
}

const COMMUNICATION_CHANNELS = new Set([
  'inbox',
  'apns',
  'telegram',
  'sms',
  'email',
]);
const LEGACY_APPROVAL_REQUIREMENTS = new Set([
  'NONE',
  'OWNER_CONFIRMED',
  'SYSTEM_POLICY',
]);
const COMMUNICATION_RISK_CLASSES = new Set([
  'transactional',
  'operational',
  'bulk',
]);

function communicationShadowNormalizer(
  scope: 'SINGLE' | 'BULK',
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  const channel = requiredText(source, 'channel', 32);
  const legacyApprovalRequirement = requiredText(
    source,
    'legacyApprovalRequirement',
    32,
  );
  const riskClass = requiredText(source, 'riskClass', 32);
  if (!COMMUNICATION_CHANNELS.has(channel)) {
    throw new ActionContractError(
      'channel is not registered for communication',
    );
  }
  if (!LEGACY_APPROVAL_REQUIREMENTS.has(legacyApprovalRequirement)) {
    throw new ActionContractError('legacyApprovalRequirement is invalid');
  }
  if (!COMMUNICATION_RISK_CLASSES.has(riskClass)) {
    throw new ActionContractError('riskClass is invalid');
  }
  const recipientIdentityHash = optionalOpaqueField(
    source,
    'recipientIdentityHash',
  );
  const audienceSnapshotHash = optionalOpaqueField(
    source,
    'audienceSnapshotHash',
  );
  if (scope === 'SINGLE' && (!recipientIdentityHash || audienceSnapshotHash)) {
    throw new ActionContractError(
      'single communication requires only recipientIdentityHash',
    );
  }
  if (scope === 'BULK' && (!audienceSnapshotHash || recipientIdentityHash)) {
    throw new ActionContractError(
      'bulk communication requires only audienceSnapshotHash',
    );
  }
  const recipientCount = source.recipientCount;
  if (
    !Number.isInteger(recipientCount) ||
    Number(recipientCount) < 1 ||
    Number(recipientCount) > 100_000
  ) {
    throw new ActionContractError('recipientCount must be a positive integer');
  }
  return {
    logicalCommunicationRef: normalizeOpaqueRef(
      source.logicalCommunicationRef,
      'logicalCommunicationRef',
    ),
    channel,
    contentIdentityHash: normalizeOpaqueRef(
      source.contentIdentityHash,
      'contentIdentityHash',
    ),
    ...(recipientIdentityHash ? { recipientIdentityHash } : {}),
    ...(audienceSnapshotHash ? { audienceSnapshotHash } : {}),
    eligibilityPolicyRef: normalizeOpaqueRef(
      source.eligibilityPolicyRef,
      'eligibilityPolicyRef',
    ),
    legacyApprovalRequirement,
    riskClass,
    templateRef: normalizeOpaqueRef(source.templateRef, 'templateRef'),
    recipientCount: Number(recipientCount),
  };
}

function createAppointmentNormalizer(value: unknown): Record<string, unknown> {
  const source = recordInput(value);
  const branchId = optionalOpaqueField(source, 'branchId');
  const clientPhone = optionalText(source, 'clientPhone', 40);
  const notes = optionalText(source, 'notes', 2_000);
  const duration = source.durationMinutes;
  const notifyBySmsHours = source.notifyBySmsHours;
  const creationMode = source.creationMode;
  if (
    duration !== undefined &&
    (!Number.isInteger(duration) ||
      Number(duration) < 1 ||
      Number(duration) > 1440)
  ) {
    throw new ActionContractError(
      'durationMinutes must be an integer between 1 and 1440',
    );
  }
  if (source.allowBusy !== undefined && typeof source.allowBusy !== 'boolean') {
    throw new ActionContractError('allowBusy must be a boolean');
  }
  if (
    creationMode !== undefined &&
    creationMode !== 'client' &&
    creationMode !== 'admin'
  ) {
    throw new ActionContractError('creationMode must be client or admin');
  }
  if (
    notifyBySmsHours !== undefined &&
    (!Number.isInteger(notifyBySmsHours) ||
      Number(notifyBySmsHours) < 0 ||
      Number(notifyBySmsHours) > 48)
  ) {
    throw new ActionContractError(
      'notifyBySmsHours must be an integer between 0 and 48',
    );
  }
  return {
    clientId: normalizeOpaqueRef(source.clientId, 'clientId'),
    clientName: requiredText(source, 'clientName', 160),
    ...(clientPhone ? { clientPhone } : {}),
    ...(branchId ? { branchId } : {}),
    staffId: normalizeOpaqueRef(source.staffId, 'staffId'),
    serviceIds: serviceIds(source),
    start: isoTimestamp(source, 'start'),
    ...(notes ? { notes } : {}),
    creationMode: creationMode === 'admin' ? 'admin' : 'client',
    allowBusy: source.allowBusy === true,
    ...(duration !== undefined ? { durationMinutes: Number(duration) } : {}),
    ...(notifyBySmsHours !== undefined
      ? { notifyBySmsHours: Number(notifyBySmsHours) }
      : {}),
  };
}

function cancelAppointmentNormalizer(value: unknown): Record<string, unknown> {
  const source = recordInput(value);
  return {
    externalId: normalizeOpaqueRef(source.externalId, 'externalId'),
  };
}

function rescheduleAppointmentNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  const staffId = optionalOpaqueField(source, 'staffId');
  const selectedServiceIds = optionalServiceIds(source);
  const notes = optionalText(source, 'notes', 2_000);
  return {
    externalId: normalizeOpaqueRef(source.externalId, 'externalId'),
    start: isoTimestamp(source, 'start'),
    ...(staffId ? { staffId } : {}),
    ...(selectedServiceIds ? { serviceIds: selectedServiceIds } : {}),
    ...(notes ? { notes } : {}),
  };
}

const RESIDUAL_APPOINTMENT_FIELD_KINDS = new Set([
  'comment',
  'client_name',
  'sms_flag',
]);
function requiredInteger(
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

function loyaltyInternalAdjustmentNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, ['delta', 'reason']);
  return {
    delta: requiredInteger(source, 'delta', -1_000_000, 1_000_000),
    reason: requiredText(source, 'reason', 160),
  };
}

function visitPaymentNormalizer(value: unknown): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, ['externalId', 'amountKopecks', 'paymentMethod']);
  const paymentMethod = requiredText(source, 'paymentMethod', 16);
  if (paymentMethod !== 'cash' && paymentMethod !== 'card') {
    throw new ActionContractError('paymentMethod must be cash or card');
  }
  return {
    externalId: normalizeOpaqueRef(source.externalId, 'externalId'),
    amountKopecks: requiredInteger(source, 'amountKopecks', 1, 1_000_000_000),
    paymentMethod,
  };
}

function attendanceShadowNormalizer(value: unknown): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, ['attendanceCode']);
  const attendanceCode = requiredInteger(source, 'attendanceCode', -1, 2);
  if (![-1, 0, 1, 2].includes(attendanceCode)) {
    throw new ActionContractError('attendanceCode is not writable');
  }
  return { attendanceCode };
}

function durationShadowNormalizer(value: unknown): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, ['durationSeconds']);
  return {
    durationSeconds: requiredInteger(source, 'durationSeconds', 60, 86_400),
  };
}

function servicesShadowNormalizer(value: unknown): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, ['serviceIds']);
  return { serviceIds: serviceIds(source) };
}

function servicesNormalizer(value: unknown): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, ['serviceIds', 'durationSeconds']);
  const durationSeconds = source.durationSeconds;
  return {
    serviceIds: serviceIds(source),
    ...(durationSeconds === undefined || durationSeconds === null
      ? {}
      : {
          durationSeconds: requiredInteger(
            source,
            'durationSeconds',
            60,
            86_400,
          ),
        }),
  };
}

function fieldsShadowNormalizer(value: unknown): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, ['fieldKind', 'valueRef']);
  const fieldKind = requiredText(source, 'fieldKind', 32);
  if (!RESIDUAL_APPOINTMENT_FIELD_KINDS.has(fieldKind)) {
    throw new ActionContractError('fieldKind is not registered');
  }
  return {
    fieldKind,
    valueRef: normalizeOpaqueRef(source.valueRef, 'valueRef'),
  };
}

function fieldsNormalizer(value: unknown): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, ['fieldKind', 'value']);
  const fieldKind = requiredText(source, 'fieldKind', 32);
  if (!RESIDUAL_APPOINTMENT_FIELD_KINDS.has(fieldKind)) {
    throw new ActionContractError('fieldKind is not registered');
  }

  if (fieldKind === 'comment') {
    if (typeof source.value !== 'string' || source.value.length > 2_000) {
      throw new ActionContractError('comment value is invalid');
    }
    return { fieldKind, value: source.value };
  }

  if (fieldKind === 'sms_flag') {
    if (!Number.isInteger(source.value)) {
      throw new ActionContractError('sms_flag value must be an integer');
    }
    return {
      fieldKind,
      value: requiredInteger(source, 'value', 0, 48),
    };
  }

  const client = recordInput(source.value);
  assertOnlyKeys(client, ['name', 'phone']);
  const phone = optionalText(client, 'phone', 40);
  return {
    fieldKind,
    value: {
      name: requiredText(client, 'name', 200),
      ...(phone ? { phone } : {}),
    },
  };
}

const DAY = 24 * 60 * 60 * 1_000;

function shadowCapability(input: {
  capability: string;
  actionClass: string;
  targetKind: string;
  inputKey: string;
}): RegisteredActionCapabilityV1 {
  return {
    capability: input.capability,
    capabilityVersion: 1,
    actionClass: input.actionClass,
    normalizedInputContract: `maya.${input.actionClass}-input/1`,
    targetKind: input.targetKind,
    allowedSourceTypes: ['agent_task'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: ['local', 'reversible'],
    policyKey: 'chapter5.l2_5-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 90 * DAY,
    normalizeInput: oneRefNormalizer(input.inputKey),
  };
}

function communicationShadowCapability(input: {
  capability: string;
  actionClass: string;
  scope: 'SINGLE' | 'BULK';
}): RegisteredActionCapabilityV1 {
  return {
    capability: input.capability,
    capabilityVersion: 1,
    actionClass: input.actionClass,
    normalizedInputContract: `maya.${input.actionClass}-input/1`,
    targetKind:
      input.scope === 'SINGLE' ? 'communication_recipient' : 'audience',
    allowedSourceTypes: [
      'authenticated_request',
      'scheduler',
      'webhook',
      'legacy_bridge',
    ],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: ['external', 'customer_visible', 'shadow_only'],
    policyKey: 'chapter6.communication-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'communication-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'communication-shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: (value) =>
      communicationShadowNormalizer(input.scope, value),
  };
}

function residualAppointmentShadowCapability(input: {
  capability: string;
  actionClass: string;
  normalizeInput: (value: unknown) => Record<string, unknown>;
}): RegisteredActionCapabilityV1 {
  return {
    capability: input.capability,
    capabilityVersion: 1,
    actionClass: input.actionClass,
    normalizedInputContract: `maya.${input.actionClass}-input/1`,
    targetKind: 'appointment',
    allowedSourceTypes: ['authenticated_request', 'legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: ['external', 'customer_visible', 'shadow_only'],
    policyKey: 'chapter6.residual-appointment-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'residual-appointment-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'residual-appointment-shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: input.normalizeInput,
  };
}

function loyaltyInternalAdjustmentShadowCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: 'loyalty.internal-adjust.shadow.v1',
    capabilityVersion: 1,
    actionClass: 'adjust_internal_loyalty',
    normalizedInputContract: 'maya.adjust_internal_loyalty-input/1',
    targetKind: 'loyalty_account',
    allowedSourceTypes: ['authenticated_request'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: ['local', 'financial', 'customer_value', 'shadow_only'],
    policyKey: 'chapter6.package4.loyalty-adjustment-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.loyalty-adjustment-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.loyalty-adjustment-shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: loyaltyInternalAdjustmentNormalizer,
  };
}

function legacyLoyaltyEarnShadowCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: LEGACY_LOYALTY_EARN_SHADOW_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'earn_legacy_loyalty',
    normalizedInputContract: LEGACY_LOYALTY_EARN_INPUT_CONTRACT,
    targetKind: 'loyalty_client',
    allowedSourceTypes: ['legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'local',
      'financial_equivalent',
      'customer_value',
      'bulk',
      'provider_evidence',
      'shadow_only',
    ],
    policyKey: 'chapter6.package4.legacy-loyalty-earn-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.legacy-loyalty-earn-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.legacy-loyalty-earn-shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: legacyLoyaltyEarnShadowNormalizer,
  };
}

function referralCreateShadowCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: REFERRAL_CREATE_SHADOW_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'create_customer_referral',
    normalizedInputContract: REFERRAL_CREATE_SHADOW_INPUT_CONTRACT,
    targetKind: 'customer_referral',
    allowedSourceTypes: ['legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'local',
      'customer_identity',
      'referral_relationship',
      'shadow_only',
    ],
    policyKey: 'chapter6.package4.referral-create-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.referral-create-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.referral-create-shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: referralCreateShadowNormalizer,
  };
}

function customerSubscriptionPurchaseShadowCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'initiate_customer_subscription_purchase',
    normalizedInputContract:
      CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_INPUT_CONTRACT,
    targetKind: 'customer_subscription_checkout',
    allowedSourceTypes: ['legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'financial',
      'provider_dispatch',
      'customer_subscription',
      'checkout_intent',
      'shadow_only',
    ],
    policyKey: 'chapter6.package4.customer-subscription-purchase-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.customer-subscription-purchase-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.customer-subscription-purchase-shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: customerSubscriptionPurchaseShadowNormalizer,
  };
}

function giftCertificatePurchaseShadowCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: GIFT_CERTIFICATE_PURCHASE_SHADOW_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'initiate_gift_certificate_purchase',
    normalizedInputContract: GIFT_CERTIFICATE_PURCHASE_SHADOW_INPUT_CONTRACT,
    targetKind: 'gift_certificate_checkout',
    allowedSourceTypes: ['legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'financial',
      'provider_dispatch',
      'gift_certificate',
      'checkout_intent',
      'shadow_only',
    ],
    policyKey: 'chapter6.package4.gift-certificate-purchase-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.gift-certificate-purchase-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.gift-certificate-purchase-shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: giftCertificatePurchaseShadowNormalizer,
  };
}

function giftCertificateActivationShadowCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: GIFT_CERTIFICATE_ACTIVATION_SHADOW_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'activate_gift_certificate',
    normalizedInputContract: GIFT_CERTIFICATE_ACTIVATION_SHADOW_INPUT_CONTRACT,
    targetKind: 'gift_certificate',
    allowedSourceTypes: ['legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'financial_equivalent',
      'customer_value',
      'gift_certificate',
      'payment_evidence',
      'bearer_presentation',
      'one_time',
      'shadow_only',
    ],
    policyKey: 'chapter6.package4.gift-certificate-activation-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.gift-certificate-activation-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.gift-certificate-activation-shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: giftCertificateActivationShadowNormalizer,
  };
}

function giftCertificateRedemptionShadowCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: GIFT_CERTIFICATE_REDEMPTION_SHADOW_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'redeem_gift_certificate',
    normalizedInputContract: GIFT_CERTIFICATE_REDEMPTION_SHADOW_INPUT_CONTRACT,
    targetKind: 'gift_certificate',
    allowedSourceTypes: ['legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'financial_equivalent',
      'customer_value',
      'gift_certificate',
      'bearer_claim',
      'exact_business_target',
      'one_time',
      'shadow_only',
    ],
    policyKey: 'chapter6.package4.gift-certificate-redemption-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.gift-certificate-redemption-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.gift-certificate-redemption-shadow.local-only',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: giftCertificateRedemptionShadowNormalizer,
  };
}

function expenseShadowCapability(input: {
  capability: string;
  actionClass: string;
  targetKind: string;
  inputContract: string;
  normalizeInput: (value: unknown) => Record<string, unknown>;
}): RegisteredActionCapabilityV1 {
  return {
    capability: input.capability,
    capabilityVersion: 1,
    actionClass: input.actionClass,
    normalizedInputContract: input.inputContract,
    targetKind: input.targetKind,
    allowedSourceTypes: ['authenticated_request', 'legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: ['local', 'financial', 'expense_ledger', 'shadow_only'],
    policyKey: `chapter6.package4.${input.actionClass}.shadow`,
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.expense-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.expense-shadow.local-not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: input.normalizeInput,
  };
}

function p407ExecutableCapability(
  registration: (typeof P4_07_EXECUTABLE_REGISTRATIONS)[number],
): RegisteredActionCapabilityV1 {
  return {
    capability: registration.capability,
    capabilityVersion: 1,
    actionClass: registration.actionClass,
    normalizedInputContract: registration.inputContract,
    targetKind: registration.targetKind,
    allowedSourceTypes: ['authenticated_request', 'legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: ['local', 'financial', 'expense_ledger', 'atomic'],
    policyKey: `chapter6.package4.${registration.actionClass}.execute`,
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.ALLOW,
    autonomyLevel: 'L2_SERVER_POLICY',
    approvalRequirement: registration.approvalRequirement,
    ...(registration.approvalRequirement === 'REQUIRED'
      ? { approvalTtlMs: 15 * 60 * 1_000 }
      : {}),
    retry: {
      key: 'package4.expense-local-transaction.no-blind-retry',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.expense-local-transaction.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'expenses.canonical-ledger',
    executorVersion: 1,
    payloadRetentionMs: 30 * DAY,
    auditRetentionMs: 7 * 365 * DAY,
    normalizeInput: registration.normalizeInput,
  };
}

function p409Capability(
  registration: P409Registration,
  shadow: boolean,
): RegisteredActionCapabilityV1 {
  return {
    capability: shadow
      ? registration.shadowCapability
      : registration.executableCapability,
    capabilityVersion: 1,
    actionClass: registration.actionClass,
    normalizedInputContract: P4_09_INPUT_CONTRACT,
    targetKind: registration.targetKind,
    allowedSourceTypes: registration.allowedSourceTypes,
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'financial_equivalent',
      'value_configuration',
      'one_target',
      'owner_approval',
      'future_issuance_only',
      ...(shadow ? ['shadow_only'] : ['local_atomic']),
    ],
    policyKey: `chapter6.package4.${registration.actionClass}.${shadow ? 'shadow' : 'execute'}`,
    policyVersion: 1,
    policyDecision: shadow
      ? ActionPolicyDecision.SHADOW_ONLY
      : ActionPolicyDecision.ALLOW,
    autonomyLevel: shadow ? 'L2_5_SHADOW' : 'L3_OWNER_APPROVED',
    approvalRequirement: shadow ? 'NONE' : 'REQUIRED',
    ...(shadow ? {} : { approvalTtlMs: 15 * 60 * 1_000 }),
    retry: {
      key: 'package4.value-configuration.local-transaction',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.value-configuration.local-not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: shadow ? 'shadow.none' : 'business-content.canonical-value',
    executorVersion: 1,
    payloadRetentionMs: shadow ? 7 * DAY : 30 * DAY,
    auditRetentionMs: 7 * 365 * DAY,
    normalizeInput: (value) => registration.normalizeInput(value),
  };
}

function p410Capability(
  registration: P410Registration,
  shadow: boolean,
): RegisteredActionCapabilityV1 {
  return {
    capability: shadow
      ? registration.shadowCapability
      : registration.executableCapability,
    capabilityVersion: 1,
    actionClass: registration.actionClass,
    normalizedInputContract: P4_10_INPUT_CONTRACT,
    targetKind: 'commerce_integration',
    allowedSourceTypes: registration.allowedSourceTypes,
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'credential_authority',
      'tenant_wide',
      'one_provider',
      'encrypted_at_rest',
      ...(registration.operation === 'disconnect' ? ['destructive'] : []),
      ...(shadow ? ['shadow_only'] : ['local_atomic']),
    ],
    policyKey: `chapter6.package4.${registration.actionClass}.${shadow ? 'shadow' : 'execute'}`,
    policyVersion: 1,
    policyDecision: shadow
      ? ActionPolicyDecision.SHADOW_ONLY
      : ActionPolicyDecision.ALLOW,
    autonomyLevel: shadow ? 'L2_5_SHADOW' : 'L2_SERVER_POLICY',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.commerce-credentials.read-verify-then-local-transaction',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.commerce-credentials.provider-read-not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: shadow ? 'shadow.none' : 'commerce.canonical-credentials',
    executorVersion: 1,
    payloadRetentionMs: shadow ? 7 * DAY : 30 * DAY,
    auditRetentionMs: 7 * 365 * DAY,
    normalizeInput: (value) => registration.normalizeInput(value),
  };
}

function package5Wave1Capability(
  registration: Package5Wave1Registration,
  shadow: boolean,
): RegisteredActionCapabilityV1 {
  return {
    capability: shadow
      ? registration.shadowCapability
      : registration.executableCapability,
    capabilityVersion: 1,
    actionClass: registration.actionClass,
    normalizedInputContract: PACKAGE5_WAVE1_INPUT_CONTRACT,
    targetKind: registration.targetKind,
    allowedSourceTypes: registration.allowedSourceTypes,
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'local',
      'one_target',
      'server_derived_authority',
      ...(registration.targetKind === 'setting'
        ? ['configuration']
        : ['operational_work']),
      ...(shadow ? ['shadow_only'] : ['local_atomic']),
    ],
    policyKey: `chapter6.package5.wave1.${registration.actionClass}.${shadow ? 'shadow' : 'execute'}`,
    policyVersion: 1,
    policyDecision: shadow
      ? ActionPolicyDecision.SHADOW_ONLY
      : ActionPolicyDecision.ALLOW,
    autonomyLevel: shadow ? 'L2_5_SHADOW' : 'L2_SERVER_POLICY',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package5.wave1.local-transaction',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package5.wave1.local-not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: shadow ? 'shadow.none' : 'package5.wave1.local-command',
    executorVersion: 1,
    payloadRetentionMs: shadow ? 7 * DAY : 30 * DAY,
    auditRetentionMs: 7 * 365 * DAY,
    normalizeInput: (value) =>
      normalizePackage5Wave1Input(registration.operation, value),
  };
}

function package5Wave2Capability(
  registration: Package5Wave2Registration,
  shadow: boolean,
): RegisteredActionCapabilityV1 {
  const external = registration.authorityClass === 'AC2';
  return {
    capability: shadow
      ? registration.shadowCapability
      : registration.executableCapability,
    capabilityVersion: 1,
    actionClass: registration.actionClass,
    normalizedInputContract: PACKAGE5_WAVE2_INPUT_CONTRACT,
    targetKind: registration.targetKind,
    allowedSourceTypes: [
      'authenticated_request',
      'legacy_bridge',
      'synthetic_shadow',
    ],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      registration.family.toLowerCase(),
      registration.authorityClass.toLowerCase(),
      'one_target',
      'server_derived_authority',
      'no_raw_secrets_or_pii',
      ...(external ? ['external_object_write'] : ['local_atomic']),
      ...(shadow ? ['shadow_only'] : []),
    ],
    policyKey: `chapter6.package5.wave2.${registration.actionClass}.${shadow ? 'shadow' : 'execute'}`,
    policyVersion: 1,
    policyDecision: shadow
      ? ActionPolicyDecision.SHADOW_ONLY
      : ActionPolicyDecision.ALLOW,
    autonomyLevel: shadow ? 'L2_5_SHADOW' : 'L2_SERVER_POLICY',
    approvalRequirement: 'NONE',
    retry: {
      key: external
        ? 'package5.wave2.object-write'
        : 'package5.wave2.local-transaction',
      version: 1,
      maxExecutionAttempts: external ? 1 : 3,
      retryablePreDispatchErrors: new Set(
        external ? ['object_store_not_crossed'] : ['local_serialization'],
      ),
      backoffMs: external ? [0] : [0, 25, 100],
    },
    reconciliation: {
      key: external
        ? 'package5.wave2.object-head-by-request-identity'
        : 'package5.wave2.not-required',
      version: 1,
      maxInconclusiveAttempts: external ? 8 : 1,
      retryAfterProvenNonExecution: external,
    },
    transportIdentityVersion: 1,
    executorKey: shadow
      ? 'shadow.none'
      : external
        ? 'package5.wave2.object-command'
        : 'package5.wave2.local-command',
    executorVersion: 1,
    payloadRetentionMs: shadow ? 7 * DAY : 30 * DAY,
    auditRetentionMs: 7 * 365 * DAY,
    normalizeInput: (value) =>
      normalizePackage5Wave2Input(registration.operation, value),
  };
}

function package5Wave3Capability(
  registration: Package5Wave3Registration,
  shadow: boolean,
): RegisteredActionCapabilityV1 {
  const external = registration.authorityClass === 'AC2';
  return {
    capability: shadow
      ? registration.shadowCapability
      : registration.executableCapability,
    capabilityVersion: 1,
    actionClass: registration.actionClass,
    normalizedInputContract: PACKAGE5_WAVE3_INPUT_CONTRACT,
    targetKind: registration.targetKind,
    allowedSourceTypes: [
      'authenticated_request',
      'legacy_bridge',
      'synthetic_shadow',
    ],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      registration.family.toLowerCase(),
      registration.authorityClass.toLowerCase(),
      'one_target',
      'server_derived_authority',
      'no_raw_credentials_or_pii',
      ...(external ? ['external_staff_day_write'] : ['local_atomic']),
      ...(shadow ? ['shadow_only'] : []),
    ],
    policyKey: `chapter6.package5.wave3.${registration.actionClass}.${shadow ? 'shadow' : 'execute'}`,
    policyVersion: 1,
    policyDecision: shadow
      ? ActionPolicyDecision.SHADOW_ONLY
      : ActionPolicyDecision.ALLOW,
    autonomyLevel: shadow ? 'L2_5_SHADOW' : 'L2_SERVER_POLICY',
    approvalRequirement: 'NONE',
    retry: {
      key: external
        ? 'package5.wave3.staff-day-provider-write'
        : 'package5.wave3.local-transaction',
      version: 1,
      maxExecutionAttempts: external ? 1 : 3,
      retryablePreDispatchErrors: new Set(
        external ? ['provider_dispatch_not_crossed'] : ['local_serialization'],
      ),
      backoffMs: external ? [0] : [0, 25, 100],
    },
    reconciliation: {
      key: external
        ? 'package5.wave3.staff-day-exact-reread'
        : 'package5.wave3.not-required',
      version: 1,
      maxInconclusiveAttempts: external ? 8 : 1,
      retryAfterProvenNonExecution: external,
    },
    transportIdentityVersion: 1,
    executorKey: shadow
      ? 'shadow.none'
      : external
        ? 'package5.wave3.staff-day-command'
        : 'package5.wave3.local-command',
    executorVersion: 1,
    payloadRetentionMs: shadow ? 7 * DAY : 30 * DAY,
    auditRetentionMs: 7 * 365 * DAY,
    normalizeInput: (value) =>
      normalizePackage5Wave3Input(registration.operation, value),
  };
}

function package5Wave4Capability(
  registration: Package5Wave4Registration,
  shadow: boolean,
): RegisteredActionCapabilityV1 {
  const external = registration.authorityClass === 'AC2';
  return {
    capability: shadow
      ? registration.shadowCapability
      : registration.executableCapability,
    capabilityVersion: 1,
    actionClass: registration.actionClass,
    normalizedInputContract: PACKAGE5_WAVE4_INPUT_CONTRACT,
    targetKind: registration.targetKind,
    allowedSourceTypes: [
      'authenticated_request',
      'legacy_bridge',
      'synthetic_shadow',
    ],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      registration.family.toLowerCase(),
      registration.authorityClass.toLowerCase(),
      'one_target',
      'server_derived_authority',
      'prospective_only',
      ...(external ? ['content_bound_object_write'] : ['local_atomic']),
      ...(shadow ? ['shadow_only'] : []),
    ],
    policyKey: `chapter6.package5.wave4.${registration.actionClass}.${shadow ? 'shadow' : 'execute'}`,
    policyVersion: 1,
    policyDecision: shadow
      ? ActionPolicyDecision.SHADOW_ONLY
      : ActionPolicyDecision.ALLOW,
    autonomyLevel: shadow ? 'L2_5_SHADOW' : 'L2_SERVER_POLICY',
    approvalRequirement: 'NONE',
    retry: {
      key: external
        ? 'package5.wave4.object-write'
        : 'package5.wave4.local-transaction',
      version: 1,
      maxExecutionAttempts: external ? 1 : 3,
      retryablePreDispatchErrors: new Set(
        external ? ['object_store_not_crossed'] : ['local_serialization'],
      ),
      backoffMs: external ? [0] : [0, 25, 100],
    },
    reconciliation: {
      key: external
        ? 'package5.wave4.object-head-by-request-identity'
        : 'package5.wave4.not-required',
      version: 1,
      maxInconclusiveAttempts: external ? 8 : 1,
      retryAfterProvenNonExecution: external,
    },
    transportIdentityVersion: 1,
    executorKey: shadow
      ? 'shadow.none'
      : external
        ? 'package5.wave4.object-command'
        : 'package5.wave4.local-command',
    executorVersion: 1,
    payloadRetentionMs: shadow ? 7 * DAY : 30 * DAY,
    auditRetentionMs: 7 * 365 * DAY,
    normalizeInput: (value) =>
      normalizePackage5Wave4Input(registration.operation, value),
  };
}

function package5Wave5Capability(
  registration: Package5Wave5Registration,
  shadow: boolean,
): RegisteredActionCapabilityV1 {
  return {
    capability: shadow
      ? registration.shadowCapability
      : registration.executableCapability,
    capabilityVersion: 1,
    actionClass: registration.actionClass,
    normalizedInputContract: PACKAGE5_WAVE5_INPUT_CONTRACT,
    targetKind: registration.targetKind,
    allowedSourceTypes: ['authenticated_request', 'synthetic_shadow'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'a29',
      'ac1',
      'one_target',
      'owner_approval',
      'immutable_source_evidence',
      'local_atomic',
      ...(shadow ? ['shadow_only'] : []),
    ],
    policyKey: `chapter6.package5.wave5.${registration.actionClass}.${shadow ? 'shadow' : 'execute'}`,
    policyVersion: 1,
    policyDecision: shadow
      ? ActionPolicyDecision.SHADOW_ONLY
      : ActionPolicyDecision.ALLOW,
    autonomyLevel: shadow ? 'L2_5_SHADOW' : 'L3_OWNER_APPROVED',
    approvalRequirement: 'REQUIRED',
    approvalTtlMs: 30 * 60 * 1_000,
    retry: {
      key: 'package5.wave5.local-transaction',
      version: 1,
      maxExecutionAttempts: 3,
      retryablePreDispatchErrors: new Set(['local_serialization']),
      backoffMs: [0, 25, 100],
    },
    reconciliation: {
      key: 'package5.wave5.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: shadow ? 'shadow.none' : 'package5.wave5.local-correction',
    executorVersion: 1,
    payloadRetentionMs: shadow ? 7 * DAY : 30 * DAY,
    auditRetentionMs: 7 * 365 * DAY,
    normalizeInput: normalizePackage5Wave5Input,
  };
}

function customerSubscriptionActivationShadowCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: CUSTOMER_SUBSCRIPTION_ACTIVATION_SHADOW_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'activate_customer_subscription',
    normalizedInputContract:
      CUSTOMER_SUBSCRIPTION_ACTIVATION_SHADOW_INPUT_CONTRACT,
    targetKind: 'customer_subscription_term',
    allowedSourceTypes: ['legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'financial_equivalent',
      'customer_value',
      'payment_evidence',
      'one_time',
      'shadow_only',
    ],
    policyKey: 'chapter6.package4.customer-subscription-activation-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.customer-subscription-activation-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.customer-subscription-activation-shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: customerSubscriptionActivationShadowNormalizer,
  };
}

function customerSubscriptionRenewalShadowCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'initiate_customer_subscription_renewal',
    normalizedInputContract:
      CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_INPUT_CONTRACT,
    targetKind: 'customer_subscription_renewal_checkout',
    allowedSourceTypes: ['legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'financial',
      'provider_dispatch',
      'customer_subscription',
      'renewal_intent',
      'shadow_only',
    ],
    policyKey: 'chapter6.package4.customer-subscription-renewal-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.customer-subscription-renewal-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.customer-subscription-renewal-shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: customerSubscriptionRenewalShadowNormalizer,
  };
}

function customerSubscriptionRenewalActivationShadowCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'activate_customer_subscription_renewal',
    normalizedInputContract:
      CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_INPUT_CONTRACT,
    targetKind: 'customer_subscription_term',
    allowedSourceTypes: ['legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'financial_equivalent',
      'customer_value',
      'payment_evidence',
      'renewal',
      'one_time',
      'shadow_only',
    ],
    policyKey:
      'chapter6.package4.customer-subscription-renewal-activation-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.customer-subscription-renewal-activation-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.customer-subscription-renewal-activation-shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: customerSubscriptionRenewalActivationShadowNormalizer,
  };
}

function customerSubscriptionUsageShadowCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'sync_customer_subscription_usage',
    normalizedInputContract: CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_INPUT_CONTRACT,
    targetKind: 'customer_subscription_usage',
    allowedSourceTypes: ['legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'local',
      'customer_value',
      'provider_evidence',
      'one_time_claim',
      'bounded_usage',
      'shadow_only',
    ],
    policyKey: 'chapter6.package4.customer-subscription-usage-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.customer-subscription-usage-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.customer-subscription-usage-shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: customerSubscriptionUsageShadowNormalizer,
  };
}

function customerSubscriptionExpiryShadowCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'expire_customer_subscription',
    normalizedInputContract: CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_INPUT_CONTRACT,
    targetKind: 'customer_subscription_term',
    allowedSourceTypes: ['legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'local',
      'customer_value',
      'terminal_transition',
      'time_evidence',
      'one_time_claim',
      'shadow_only',
    ],
    policyKey: 'chapter6.package4.customer-subscription-expiry-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.customer-subscription-expiry-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.customer-subscription-expiry-shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: customerSubscriptionExpiryShadowNormalizer,
  };
}

function customerSubscriptionCancellationShadowCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'cancel_customer_subscription',
    normalizedInputContract:
      CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_INPUT_CONTRACT,
    targetKind: 'customer_subscription_term',
    allowedSourceTypes: ['legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'local',
      'customer_value',
      'terminal_transition',
      'actor_authority',
      'one_time_claim',
      'shadow_only',
    ],
    policyKey: 'chapter6.package4.customer-subscription-cancellation-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.customer-subscription-cancellation-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.customer-subscription-cancellation-shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: customerSubscriptionCancellationShadowNormalizer,
  };
}

function customerSubscriptionRevocationShadowCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'revoke_customer_subscription',
    normalizedInputContract:
      CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_INPUT_CONTRACT,
    targetKind: 'customer_subscription_term',
    allowedSourceTypes: ['legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'local',
      'customer_value',
      'terminal_transition',
      'owner_or_admin_authority',
      'approval_bound',
      'one_time_claim',
      'shadow_only',
    ],
    policyKey: 'chapter6.package4.customer-subscription-revocation-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'REQUIRED',
    approvalTtlMs: 30 * 60 * 1_000,
    retry: {
      key: 'package4.customer-subscription-revocation-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.customer-subscription-revocation-shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: customerSubscriptionRevocationShadowNormalizer,
  };
}

function referralResolveShadowCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: REFERRAL_RESOLVE_SHADOW_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'resolve_customer_referral',
    normalizedInputContract: REFERRAL_RESOLVE_SHADOW_INPUT_CONTRACT,
    targetKind: 'customer_referral',
    allowedSourceTypes: ['legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'local',
      'customer_identity',
      'referral_relationship',
      'provider_evidence',
      'shadow_only',
    ],
    policyKey: 'chapter6.package4.referral-resolve-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.referral-resolve-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.referral-resolve-shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: referralResolveShadowNormalizer,
  };
}

function referralRewardIssueShadowCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: REFERRAL_REWARD_ISSUE_SHADOW_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'issue_referral_rewards',
    normalizedInputContract: REFERRAL_REWARD_ISSUE_SHADOW_INPUT_CONTRACT,
    targetKind: 'referral_reward_issuance',
    allowedSourceTypes: ['legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'local',
      'financial_equivalent',
      'customer_value',
      'referral_reward',
      'approval_bound',
      'shadow_only',
    ],
    policyKey: 'chapter6.package4.referral-reward-issue-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.referral-reward-issue-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.referral-reward-issue-shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: referralRewardIssueShadowNormalizer,
  };
}

function referralRewardFulfillShadowCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: REFERRAL_REWARD_FULFILL_SHADOW_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'fulfill_referral_reward',
    normalizedInputContract: REFERRAL_REWARD_FULFILL_SHADOW_INPUT_CONTRACT,
    targetKind: 'referral_reward',
    allowedSourceTypes: ['legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'local',
      'financial_equivalent',
      'customer_value',
      'referral_reward',
      'one_time_claim',
      'actor_authorized',
      'shadow_only',
    ],
    policyKey: 'chapter6.package4.referral-reward-fulfill-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.referral-reward-fulfill-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.referral-reward-fulfill-shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: referralRewardFulfillShadowNormalizer,
  };
}

function referralRewardSchedulerEnvelopeShadowCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: REFERRAL_REWARD_SCHEDULER_ENVELOPE_SHADOW_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'issue_referral_rewards',
    normalizedInputContract: REFERRAL_REWARD_SCHEDULER_ENVELOPE_INPUT_CONTRACT,
    targetKind: 'referral_reward_batch',
    allowedSourceTypes: ['scheduler'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'local',
      'financial_equivalent',
      'customer_value',
      'referral_reward',
      'bounded_fan_out',
      'approval_bound',
      'shadow_only',
    ],
    policyKey: 'chapter6.package4.referral-reward-scheduler-envelope-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.referral-reward-scheduler-envelope-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.referral-reward-scheduler-envelope-shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: referralRewardSchedulerEnvelopeNormalizer,
  };
}

function legacyLoyaltyExpireShadowCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: LEGACY_LOYALTY_EXPIRE_SHADOW_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'expire_legacy_loyalty',
    normalizedInputContract: LEGACY_LOYALTY_EXPIRE_INPUT_CONTRACT,
    targetKind: 'loyalty_client',
    allowedSourceTypes: ['legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'local',
      'financial_equivalent',
      'customer_value',
      'destructive',
      'bulk',
      'mirror_evidence',
      'shadow_only',
    ],
    policyKey: 'chapter6.package4.legacy-loyalty-expire-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.legacy-loyalty-expire-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.legacy-loyalty-expire-shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: legacyLoyaltyExpireShadowNormalizer,
  };
}

function legacyLoyaltyRedeemShadowCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: LEGACY_LOYALTY_REDEEM_SHADOW_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'redeem_legacy_loyalty',
    normalizedInputContract: LEGACY_LOYALTY_REDEEM_INPUT_CONTRACT,
    targetKind: 'loyalty_redemption',
    allowedSourceTypes: ['legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'local',
      'financial_equivalent',
      'customer_value',
      'destructive',
      'external_crm',
      'appointment_evidence',
      'shadow_only',
    ],
    policyKey: 'chapter6.package4.legacy-loyalty-redeem-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.legacy-loyalty-redeem-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.legacy-loyalty-redeem-shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: legacyLoyaltyRedeemShadowNormalizer,
  };
}

function legacyLoyaltyRefundShadowCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: LEGACY_LOYALTY_REFUND_SHADOW_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'refund_legacy_loyalty',
    normalizedInputContract: LEGACY_LOYALTY_REFUND_INPUT_CONTRACT,
    targetKind: 'loyalty_redemption',
    allowedSourceTypes: ['legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'local',
      'financial_equivalent',
      'customer_value',
      'compensating',
      'provider_evidence',
      'shadow_only',
    ],
    policyKey: 'chapter6.package4.legacy-loyalty-refund-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.legacy-loyalty-refund-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.legacy-loyalty-refund-shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: legacyLoyaltyRefundShadowNormalizer,
  };
}

function legacyLoyaltyImportShadowCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: LEGACY_LOYALTY_IMPORT_SHADOW_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'import_legacy_loyalty_balance',
    normalizedInputContract: LEGACY_LOYALTY_IMPORT_INPUT_CONTRACT,
    targetKind: 'loyalty_account',
    allowedSourceTypes: ['legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'local',
      'financial_equivalent',
      'customer_value',
      'provider_evidence',
      'one_time',
      'shadow_only',
    ],
    policyKey: 'chapter6.package4.legacy-loyalty-import-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.legacy-loyalty-import-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.legacy-loyalty-import-shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: legacyLoyaltyImportShadowNormalizer,
  };
}

function legacyLoyaltyBackfillShadowCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: LEGACY_LOYALTY_BACKFILL_SHADOW_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'backfill_legacy_loyalty',
    normalizedInputContract: LEGACY_LOYALTY_BACKFILL_INPUT_CONTRACT,
    targetKind: 'loyalty_client',
    allowedSourceTypes: ['legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'local',
      'financial_equivalent',
      'customer_value',
      'bulk',
      'provider_evidence',
      'one_time',
      'shadow_only',
    ],
    policyKey: 'chapter6.package4.legacy-loyalty-backfill-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.legacy-loyalty-backfill-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.legacy-loyalty-backfill-shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: legacyLoyaltyBackfillShadowNormalizer,
  };
}

function legacyLoyaltyGrantIssueShadowCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: LEGACY_LOYALTY_GRANT_ISSUE_SHADOW_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'issue_loyalty_redemption_grant',
    normalizedInputContract: LEGACY_LOYALTY_GRANT_ISSUE_INPUT_CONTRACT,
    targetKind: 'loyalty_redemption_grant',
    allowedSourceTypes: ['legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'local',
      'financial_equivalent',
      'customer_value',
      'one_time',
      'bearer_secret',
      'provider_evidence',
      'shadow_only',
    ],
    policyKey: 'chapter6.package4.legacy-loyalty-grant-issue-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.legacy-loyalty-grant-issue-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.legacy-loyalty-grant-issue-shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: legacyLoyaltyGrantIssueShadowNormalizer,
  };
}

function legacyLoyaltyGrantConsumeShadowCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: LEGACY_LOYALTY_GRANT_CONSUME_SHADOW_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'consume_loyalty_redemption_grant',
    normalizedInputContract: LEGACY_LOYALTY_GRANT_CONSUME_INPUT_CONTRACT,
    targetKind: 'loyalty_redemption',
    allowedSourceTypes: ['legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'local',
      'financial_equivalent',
      'customer_value',
      'one_time',
      'bearer_secret',
      'destructive',
      'external_crm',
      'shadow_only',
    ],
    policyKey: 'chapter6.package4.legacy-loyalty-grant-consume-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.legacy-loyalty-grant-consume-shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.legacy-loyalty-grant-consume-shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: legacyLoyaltyGrantConsumeShadowNormalizer,
  };
}

function loyaltyInternalAdjustmentCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: 'loyalty.internal-adjust.execute.v1',
    capabilityVersion: 1,
    actionClass: 'adjust_internal_loyalty',
    normalizedInputContract: 'maya.adjust_internal_loyalty-input/1',
    targetKind: 'loyalty_account',
    allowedSourceTypes: ['authenticated_request'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: ['local', 'financial', 'customer_value'],
    policyKey: 'chapter6.package4.loyalty-adjustment-executable',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.ALLOW,
    autonomyLevel: 'L2_CONFIRMED_REQUEST',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.loyalty-adjustment.pre-dispatch-only',
      version: 1,
      maxExecutionAttempts: 2,
      retryablePreDispatchErrors: new Set<string>([
        'loyalty_preparation_transient',
      ]),
      backoffMs: [0],
    },
    reconciliation: {
      key: 'package4.loyalty-adjustment.bound-ledger-read',
      version: 1,
      maxInconclusiveAttempts: 3,
      retryAfterProvenNonExecution: true,
    },
    transportIdentityVersion: 1,
    executorKey: 'loyalty.internal-adjust',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: loyaltyInternalAdjustmentNormalizer,
  };
}

function p403ExecutableCapability(input: {
  capability: string;
  actionClass: P403ExecutableActionClass;
  targetKind: string;
  executorKey: string;
  normalizeInput: (value: unknown) => Record<string, unknown>;
  allowedSourceTypes?: readonly ActionSourceType[];
  riskFacets: readonly string[];
}): RegisteredActionCapabilityV1 {
  return {
    capability: input.capability,
    capabilityVersion: 1,
    actionClass: input.actionClass,
    normalizedInputContract: `maya.${input.actionClass}-executable-input/1`,
    targetKind: input.targetKind,
    allowedSourceTypes: input.allowedSourceTypes ?? [
      'scheduler',
      'legacy_bridge',
      'authenticated_request',
    ],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'local',
      'financial_equivalent',
      'customer_value',
      ...input.riskFacets,
    ],
    policyKey: `chapter6.package4.${input.actionClass}-executable`,
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.ALLOW,
    autonomyLevel: 'L3_CANONICAL',
    approvalRequirement: 'NONE',
    retry: {
      key: `package4.${input.actionClass}.reconcile-before-retry`,
      version: 1,
      maxExecutionAttempts: 2,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [0],
    },
    reconciliation: {
      key: `package4.${input.actionClass}.bound-local-facts`,
      version: 1,
      maxInconclusiveAttempts: 2,
      retryAfterProvenNonExecution: true,
    },
    transportIdentityVersion: 1,
    executorKey: input.executorKey,
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: input.normalizeInput,
  };
}

function p403BulkEnvelopeCapability(input: {
  capability: string;
  actionClass: P403BulkActionClass;
}): RegisteredActionCapabilityV1 {
  const profile = P4_03_BULK_POLICY_PROFILES[input.actionClass];
  return {
    capability: input.capability,
    capabilityVersion: 1,
    actionClass: input.actionClass,
    normalizedInputContract: `maya.${input.actionClass}-batch-envelope/1`,
    targetKind: 'loyalty_bulk_batch',
    allowedSourceTypes: ['scheduler', 'legacy_bridge', 'authenticated_request'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'local',
      'financial_equivalent',
      'customer_value',
      'bulk',
      'approval_bound',
      'non_value_envelope',
    ],
    policyKey: `chapter6.package4.${input.actionClass}-batch`,
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.ALLOW,
    autonomyLevel: 'L3_OWNER_APPROVED',
    approvalRequirement: 'REQUIRED',
    approvalTtlMs: profile.approvalTtlMs,
    retry: {
      key: `package4.${input.actionClass}-batch.pre-dispatch-only`,
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: `package4.${input.actionClass}-batch.no-value`,
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'loyalty.legacy-bulk-envelope',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: (value) =>
      p403BulkEnvelopeNormalizer(input.actionClass, value),
  };
}

function p404ExecutableCapability(
  input: P404ExecutableRegistration,
): RegisteredActionCapabilityV1 {
  return {
    capability: input.capability,
    capabilityVersion: 1,
    actionClass: input.actionClass,
    normalizedInputContract: `maya.${input.actionClass}-executable-input/1`,
    targetKind: input.targetKind,
    allowedSourceTypes: input.allowedSourceTypes,
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: ['local', 'referral_reward', ...input.riskFacets],
    policyKey: `chapter6.package4.${input.actionClass}-executable`,
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.ALLOW,
    autonomyLevel: input.approvalRequired
      ? 'L3_OWNER_APPROVED'
      : 'L3_CANONICAL',
    approvalRequirement: input.approvalRequired ? 'REQUIRED' : 'NONE',
    ...(input.approvalRequired
      ? { approvalTtlMs: REFERRAL_REWARD_POLICY_LIMITS.approvalWindowMs }
      : {}),
    retry: {
      key: `package4.${input.actionClass}.reconcile-before-retry`,
      version: 1,
      maxExecutionAttempts: 2,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [0],
    },
    reconciliation: {
      key: `package4.${input.actionClass}.bound-local-facts`,
      version: 1,
      maxInconclusiveAttempts: 2,
      retryAfterProvenNonExecution: true,
    },
    transportIdentityVersion: 1,
    executorKey: input.executorKey,
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: (inputValue) => input.normalizeInput(inputValue),
  };
}

function p404SchedulerEnvelopeCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: P4_04_SCHEDULER_ENVELOPE_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'issue_referral_rewards',
    normalizedInputContract: 'maya.referral-reward-scheduler-envelope/1',
    targetKind: 'referral_reward_batch',
    allowedSourceTypes: ['scheduler', 'authenticated_request'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'local',
      'financial_equivalent',
      'customer_value',
      'bounded_fan_out',
      'approval_bound',
      'non_value_envelope',
    ],
    policyKey: 'chapter6.package4.referral-reward-scheduler-envelope',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.ALLOW,
    autonomyLevel: 'L3_OWNER_APPROVED',
    approvalRequirement: 'REQUIRED',
    approvalTtlMs: REFERRAL_REWARD_POLICY_LIMITS.approvalWindowMs,
    retry: {
      key: 'package4.referral-reward-envelope.pre-dispatch-only',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.referral-reward-envelope.no-value',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'referrals.reward-scheduler-envelope',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: p404SchedulerEnvelopeExecutableNormalizer,
  };
}

function p405ExecutableCapability(
  input: P405ExecutableRegistration,
): RegisteredActionCapabilityV1 {
  return {
    capability: input.capability,
    capabilityVersion: 1,
    actionClass: input.actionClass,
    normalizedInputContract: `maya.${input.actionClass}-executable-input/1`,
    targetKind: input.targetKind,
    allowedSourceTypes: input.allowedSourceTypes,
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      input.providerDispatch ? 'external' : 'local',
      'customer_subscription',
      ...input.riskFacets,
    ],
    policyKey: `chapter6.package4.${input.actionClass}-executable`,
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.ALLOW,
    autonomyLevel: input.approvalRequired
      ? 'L3_OWNER_APPROVED'
      : 'L3_CANONICAL',
    approvalRequirement: input.approvalRequired ? 'REQUIRED' : 'NONE',
    ...(input.approvalRequired ? { approvalTtlMs: 30 * 60 * 1_000 } : {}),
    retry: {
      key: `package4.${input.actionClass}.reconcile-before-retry`,
      version: 1,
      maxExecutionAttempts: 2,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [0],
    },
    reconciliation: {
      key: input.providerDispatch
        ? `package4.${input.actionClass}.provider-status`
        : `package4.${input.actionClass}.bound-local-facts`,
      version: 1,
      maxInconclusiveAttempts: 2,
      retryAfterProvenNonExecution: true,
    },
    transportIdentityVersion: 1,
    executorKey: input.executorKey,
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: input.normalizeInput,
  };
}

function p406ExecutableCapability(
  input: P406ExecutableRegistration,
): RegisteredActionCapabilityV1 {
  return {
    capability: input.capability,
    capabilityVersion: 1,
    actionClass: input.actionClass,
    normalizedInputContract: `maya.${input.actionClass}-executable-input/1`,
    targetKind: input.targetKind,
    allowedSourceTypes: input.allowedSourceTypes,
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      input.providerDispatch ? 'external' : 'local',
      'gift_certificate',
      ...input.riskFacets,
    ],
    policyKey: `chapter6.package4.${input.actionClass}-executable`,
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.ALLOW,
    autonomyLevel: 'L3_CANONICAL',
    approvalRequirement: 'NONE',
    retry: {
      key: `package4.${input.actionClass}.reconcile-before-retry`,
      version: 1,
      maxExecutionAttempts: 2,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [0],
    },
    reconciliation: {
      key: input.providerDispatch
        ? `package4.${input.actionClass}.provider-status`
        : `package4.${input.actionClass}.bound-local-facts`,
      version: 1,
      maxInconclusiveAttempts: 2,
      retryAfterProvenNonExecution: true,
    },
    transportIdentityVersion: 1,
    executorKey: input.executorKey,
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: input.normalizeInput,
  };
}

function p405SchedulerEnvelopeCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: P4_05_SCHEDULER_ENVELOPE_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'sync_customer_subscription_usage',
    normalizedInputContract: P4_05_SCHEDULER_ENVELOPE_CONTRACT,
    targetKind: 'customer_subscription_scheduler_batch',
    allowedSourceTypes: ['scheduler'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'local',
      'customer_subscription',
      'bounded_fan_out',
      'non_value_envelope',
    ],
    policyKey: 'chapter6.package4.customer-subscription-scheduler-envelope',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.ALLOW,
    autonomyLevel: 'L3_CANONICAL',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.customer-subscription-envelope.pre-dispatch-only',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.customer-subscription-envelope.no-value',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'customer-subscriptions.scheduler-envelope',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: customerSubscriptionSchedulerEnvelopeNormalizer,
  };
}

function p408Capability(
  input: P408Registration,
  shadow: boolean,
): RegisteredActionCapabilityV1 {
  return {
    capability: shadow
      ? P4_08_SHADOW_CAPABILITIES[
          input.capability === P4_08_EXECUTABLE_CAPABILITIES.checkout
            ? 'checkout'
            : input.capability === P4_08_EXECUTABLE_CAPABILITIES.recurring
              ? 'recurring'
              : input.capability === P4_08_EXECUTABLE_CAPABILITIES.outcome
                ? 'outcome'
                : 'pastDue'
        ]
      : input.capability,
    capabilityVersion: 1,
    actionClass: input.actionClass,
    normalizedInputContract: `maya.${input.actionClass}-input/1`,
    targetKind: input.targetKind,
    allowedSourceTypes: input.allowedSourceTypes,
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      input.providerDispatch ? 'external' : 'local',
      'tenant_billing',
      ...(shadow ? ['shadow_only'] : ['payment_value']),
    ],
    policyKey: `chapter6.package4.${input.actionClass}.${shadow ? 'shadow' : 'executable'}`,
    policyVersion: 1,
    policyDecision: shadow
      ? ActionPolicyDecision.SHADOW_ONLY
      : ActionPolicyDecision.ALLOW,
    autonomyLevel: shadow ? 'L2_5_SHADOW' : 'L3_CANONICAL',
    approvalRequirement: 'NONE',
    retry: {
      key: shadow
        ? 'package4.tenant-billing-shadow.no-execution'
        : `package4.${input.actionClass}.reconcile-before-retry`,
      version: 1,
      maxExecutionAttempts: shadow ? 1 : 2,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: shadow ? [] : [0],
    },
    reconciliation: {
      key: shadow
        ? 'package4.tenant-billing-shadow.not-required'
        : input.providerDispatch
          ? `package4.${input.actionClass}.provider-status`
          : `package4.${input.actionClass}.bound-local-facts`,
      version: 1,
      maxInconclusiveAttempts: shadow ? 1 : 2,
      retryAfterProvenNonExecution: !shadow,
    },
    transportIdentityVersion: 1,
    executorKey: shadow ? 'shadow.none' : input.executorKey,
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: (value) => input.normalizeInput(value),
  };
}

function p408SchedulerEnvelopeCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: P4_08_SCHEDULER_ENVELOPE_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'charge_tenant_billing_recurring',
    normalizedInputContract: P4_08_SCHEDULER_ENVELOPE_CONTRACT,
    targetKind: 'tenant_billing_scheduler_envelope',
    allowedSourceTypes: ['scheduler'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'local',
      'tenant_billing',
      'bounded_fan_out',
      'non_value_envelope',
    ],
    policyKey: 'chapter6.package4.tenant-billing-scheduler-envelope',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.ALLOW,
    autonomyLevel: 'L3_CANONICAL',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package4.tenant-billing-envelope.pre-dispatch-only',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'package4.tenant-billing-envelope.no-value',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'tenant-billing.scheduler-envelope',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: tenantBillingSchedulerEnvelopeNormalizer,
  };
}

function syntheticCapability(input: {
  capability: string;
  actionClass: string;
  policyDecision?: ActionPolicyDecision;
  approvalRequired?: boolean;
  maxExecutionAttempts: number;
  retryablePreDispatchErrors?: readonly string[];
  retryAfterProvenNonExecution: boolean;
  maxInconclusiveAttempts?: number;
}): RegisteredActionCapabilityV1 {
  return {
    capability: input.capability,
    capabilityVersion: 1,
    actionClass: input.actionClass,
    normalizedInputContract: 'maya.kernel-synthetic-input/1',
    targetKind: 'synthetic_target',
    allowedSourceTypes: ['synthetic_shadow'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: ['local', 'reversible'],
    policyKey: `kernel.synthetic.${input.actionClass}`,
    policyVersion: 1,
    policyDecision: input.policyDecision ?? ActionPolicyDecision.ALLOW,
    autonomyLevel: 'KERNEL_TEST_ONLY',
    approvalRequirement: input.approvalRequired ? 'REQUIRED' : 'NONE',
    approvalTtlMs: input.approvalRequired ? 15 * 60 * 1_000 : undefined,
    retry: {
      key: `kernel.${input.actionClass}.retry`,
      version: 1,
      maxExecutionAttempts: input.maxExecutionAttempts,
      retryablePreDispatchErrors: new Set(
        input.retryablePreDispatchErrors ?? [],
      ),
      backoffMs: [0],
    },
    reconciliation: {
      key: `kernel.${input.actionClass}.reconcile`,
      version: 1,
      maxInconclusiveAttempts: input.maxInconclusiveAttempts ?? 2,
      retryAfterProvenNonExecution: input.retryAfterProvenNonExecution,
    },
    transportIdentityVersion: 1,
    executorKey: `synthetic.${input.actionClass}`,
    executorVersion: 1,
    payloadRetentionMs: DAY,
    auditRetentionMs: 30 * DAY,
    normalizeInput: syntheticNormalizer,
  };
}

function appointmentCapability(input: {
  capability: string;
  actionClass: string;
  executorKey: string;
  normalizeInput(value: unknown): Record<string, unknown>;
}): RegisteredActionCapabilityV1 {
  return {
    capability: input.capability,
    capabilityVersion: 1,
    actionClass: input.actionClass,
    normalizedInputContract: `maya.${input.actionClass}-input/1`,
    targetKind: 'appointment',
    allowedSourceTypes: [
      'authenticated_request',
      'agent_task',
      'legacy_bridge',
    ],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: ['external', 'customer_visible'],
    policyKey: `production.${input.actionClass}.confirmed-request`,
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.ALLOW,
    autonomyLevel: 'L2_CONFIRMED_REQUEST',
    approvalRequirement: 'NONE',
    retry: {
      key: `production.${input.actionClass}.safe-retry`,
      version: 1,
      maxExecutionAttempts: 2,
      retryablePreDispatchErrors: new Set([
        'crm_rate_limited_before_dispatch',
        'crm_transient_before_dispatch',
      ]),
      backoffMs: [0, 500],
    },
    reconciliation: {
      key: `production.${input.actionClass}.canonical-read`,
      version: 1,
      maxInconclusiveAttempts: 3,
      retryAfterProvenNonExecution: true,
    },
    transportIdentityVersion: 1,
    executorKey: input.executorKey,
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: (value) => input.normalizeInput(value),
  };
}

function visitPaymentCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: 'crm.visit.payment.v1',
    capabilityVersion: 1,
    actionClass: 'pay_visit',
    normalizedInputContract: 'maya.pay_visit-input/1',
    targetKind: 'appointment',
    allowedSourceTypes: ['authenticated_request', 'legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: ['external', 'customer_visible', 'financial'],
    policyKey: 'provider.yclients.pay_visit.deferred-unsafe',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.DENY,
    autonomyLevel: 'L0_PROVIDER_DEFERRED',
    approvalRequirement: 'NONE',
    retry: {
      key: 'production.pay_visit.no-blind-retry',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'production.pay_visit.canonical-read',
      version: 1,
      maxInconclusiveAttempts: 3,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'crm.visit.payment',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: visitPaymentNormalizer,
  };
}

function provenCommunicationCapability(input: {
  capability: string;
  actionClass: string;
  targetKind: string;
  executorKey: string;
  allowedSourceTypes?: readonly ActionSourceType[];
  normalizeInput(value: unknown): Record<string, unknown>;
}): RegisteredActionCapabilityV1 {
  return {
    capability: input.capability,
    capabilityVersion: 1,
    actionClass: input.actionClass,
    normalizedInputContract: `maya.${input.actionClass}-input/1`,
    targetKind: input.targetKind,
    allowedSourceTypes: input.allowedSourceTypes ?? ['legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: ['external', 'customer_visible'],
    policyKey: `production.${input.actionClass}.proven-cutover`,
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.ALLOW,
    autonomyLevel: 'L2_CONFIRMED_REQUEST',
    approvalRequirement: 'NONE',
    retry: {
      key: `production.${input.actionClass}.no-blind-retry`,
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set(),
      backoffMs: [],
    },
    reconciliation: {
      key: `production.${input.actionClass}.canonical-reconciliation`,
      version: 1,
      maxInconclusiveAttempts: 2,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: input.executorKey,
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
    normalizeInput: (raw) => input.normalizeInput(raw),
  };
}

const CAPABILITIES: readonly RegisteredActionCapabilityV1[] = [
  shadowCapability({
    capability: 'client-lifecycle.reactivation-review.prepare',
    actionClass: 'prepare_reactivation_review',
    targetKind: 'client',
    inputKey: 'clientRef',
  }),
  shadowCapability({
    capability: 'occupancy.recovery-options.prepare',
    actionClass: 'prepare_recovery_options',
    targetKind: 'appointment',
    inputKey: 'intervalRef',
  }),
  shadowCapability({
    capability: 'admin.response-draft.prepare',
    actionClass: 'prepare_response_draft',
    targetKind: 'request',
    inputKey: 'requestRef',
  }),
  communicationShadowCapability({
    capability: 'communication.transactional-single.shadow.v1',
    actionClass: 'send_transactional_single',
    scope: 'SINGLE',
  }),
  provenCommunicationCapability({
    capability: 'communication.transactional-single.new-appointment.execute.v1',
    actionClass: 'deliver_new_appointment_inbox',
    targetKind: 'internal_user',
    executorKey: 'communication.inbox.new-appointment',
    normalizeInput: newAppointmentDeliveryNormalizer,
  }),
  provenCommunicationCapability({
    capability: 'communication.appointment-reminders.execute.v1',
    actionClass: 'deliver_appointment_reminder',
    targetKind: 'communication_recipient',
    executorKey: 'communication.package2.single',
    allowedSourceTypes: ['scheduler', 'legacy_bridge'],
    normalizeInput: package2SingleDeliveryNormalizer,
  }),
  provenCommunicationCapability({
    capability: 'communication.reports-briefings.execute.v1',
    actionClass: 'deliver_report_briefing',
    targetKind: 'communication_recipient',
    executorKey: 'communication.package2.single',
    allowedSourceTypes: ['scheduler', 'legacy_bridge'],
    normalizeInput: package2SingleDeliveryNormalizer,
  }),
  provenCommunicationCapability({
    capability: 'communication.business-alerts.execute.v1',
    actionClass: 'deliver_business_alert',
    targetKind: 'communication_recipient',
    executorKey: 'communication.package2.single',
    allowedSourceTypes: [
      'scheduler',
      'webhook',
      'authenticated_request',
      'legacy_bridge',
    ],
    normalizeInput: package2SingleDeliveryNormalizer,
  }),
  provenCommunicationCapability({
    capability: 'communication.bulk-campaign.execute.v1',
    actionClass: 'deliver_bulk_campaign',
    targetKind: 'marketing_campaign',
    executorKey: 'communication.package2.bulk',
    allowedSourceTypes: ['authenticated_request', 'legacy_bridge'],
    normalizeInput: bulkCampaignDeliveryNormalizer,
  }),
  provenCommunicationCapability({
    capability: 'communication.operational-single.privacy.execute.v1',
    actionClass: 'deliver_privacy_telegram',
    targetKind: 'telegram_chat',
    executorKey: 'communication.telegram.privacy',
    normalizeInput: privacyTelegramDeliveryNormalizer,
  }),
  communicationShadowCapability({
    capability: 'communication.operational-single.shadow.v1',
    actionClass: 'send_operational_single',
    scope: 'SINGLE',
  }),
  communicationShadowCapability({
    capability: 'communication.bulk-campaign.shadow.v1',
    actionClass: 'send_bulk_campaign',
    scope: 'BULK',
  }),
  appointmentCapability({
    capability: 'crm.appointment.create.v1',
    actionClass: 'create_appointment',
    executorKey: 'crm.appointment.create',
    normalizeInput: createAppointmentNormalizer,
  }),
  appointmentCapability({
    capability: 'crm.appointment.reschedule.v1',
    actionClass: 'reschedule_appointment',
    executorKey: 'crm.appointment.reschedule',
    normalizeInput: rescheduleAppointmentNormalizer,
  }),
  appointmentCapability({
    capability: 'crm.appointment.cancel.v1',
    actionClass: 'cancel_appointment',
    executorKey: 'crm.appointment.cancel',
    normalizeInput: cancelAppointmentNormalizer,
  }),
  visitPaymentCapability(),
  loyaltyInternalAdjustmentCapability(),
  loyaltyInternalAdjustmentShadowCapability(),
  legacyLoyaltyEarnShadowCapability(),
  legacyLoyaltyExpireShadowCapability(),
  legacyLoyaltyRedeemShadowCapability(),
  legacyLoyaltyRefundShadowCapability(),
  legacyLoyaltyImportShadowCapability(),
  legacyLoyaltyBackfillShadowCapability(),
  legacyLoyaltyGrantIssueShadowCapability(),
  legacyLoyaltyGrantConsumeShadowCapability(),
  referralCreateShadowCapability(),
  referralResolveShadowCapability(),
  referralRewardIssueShadowCapability(),
  referralRewardFulfillShadowCapability(),
  referralRewardSchedulerEnvelopeShadowCapability(),
  customerSubscriptionPurchaseShadowCapability(),
  customerSubscriptionActivationShadowCapability(),
  customerSubscriptionRenewalShadowCapability(),
  customerSubscriptionRenewalActivationShadowCapability(),
  customerSubscriptionUsageShadowCapability(),
  customerSubscriptionExpiryShadowCapability(),
  customerSubscriptionCancellationShadowCapability(),
  customerSubscriptionRevocationShadowCapability(),
  giftCertificatePurchaseShadowCapability(),
  giftCertificateActivationShadowCapability(),
  giftCertificateRedemptionShadowCapability(),
  expenseShadowCapability({
    capability: EXPENSE_CREATE_SHADOW_CAPABILITY,
    actionClass: 'create_expense',
    targetKind: 'expense',
    inputContract: EXPENSE_CREATE_INPUT_CONTRACT,
    normalizeInput: expenseCreateNormalizer,
  }),
  expenseShadowCapability({
    capability: EXPENSE_DELETE_SHADOW_CAPABILITY,
    actionClass: 'delete_expense',
    targetKind: 'expense',
    inputContract: EXPENSE_DELETE_INPUT_CONTRACT,
    normalizeInput: expenseDeleteNormalizer,
  }),
  expenseShadowCapability({
    capability: EXPENSE_PERIOD_DECLARE_SHADOW_CAPABILITY,
    actionClass: 'declare_expense_period_complete',
    targetKind: 'expense_period',
    inputContract: EXPENSE_PERIOD_DECLARE_INPUT_CONTRACT,
    normalizeInput: expensePeriodDeclareNormalizer,
  }),
  ...P4_07_EXECUTABLE_REGISTRATIONS.map(p407ExecutableCapability),
  ...P4_08_REGISTRATIONS.map((registration) =>
    p408Capability(registration, true),
  ),
  p408SchedulerEnvelopeCapability(),
  ...P4_08_REGISTRATIONS.map((registration) =>
    p408Capability(registration, false),
  ),
  ...P4_09_REGISTRATIONS.map((registration) =>
    p409Capability(registration, true),
  ),
  ...P4_09_REGISTRATIONS.map((registration) =>
    p409Capability(registration, false),
  ),
  ...P4_10_REGISTRATIONS.map((registration) =>
    p410Capability(registration, true),
  ),
  ...P4_10_REGISTRATIONS.map((registration) =>
    p410Capability(registration, false),
  ),
  ...PACKAGE5_WAVE1_REGISTRATIONS.map((registration) =>
    package5Wave1Capability(registration, true),
  ),
  ...PACKAGE5_WAVE1_REGISTRATIONS.map((registration) =>
    package5Wave1Capability(registration, false),
  ),
  ...PACKAGE5_WAVE2_REGISTRATIONS.map((registration) =>
    package5Wave2Capability(registration, true),
  ),
  ...PACKAGE5_WAVE2_REGISTRATIONS.map((registration) =>
    package5Wave2Capability(registration, false),
  ),
  ...PACKAGE5_WAVE3_REGISTRATIONS.map((registration) =>
    package5Wave3Capability(registration, true),
  ),
  ...PACKAGE5_WAVE3_REGISTRATIONS.map((registration) =>
    package5Wave3Capability(registration, false),
  ),
  ...PACKAGE5_WAVE4_REGISTRATIONS.map((registration) =>
    package5Wave4Capability(registration, true),
  ),
  ...PACKAGE5_WAVE4_REGISTRATIONS.map((registration) =>
    package5Wave4Capability(registration, false),
  ),
  ...clientPreferenceCapabilities(),
  clientHabitsCapability(),
  ...clientWantedSlotCapabilities(),
  ...PACKAGE5_WAVE5_REGISTRATIONS.map((registration) =>
    package5Wave5Capability(registration, true),
  ),
  ...PACKAGE5_WAVE5_REGISTRATIONS.map((registration) =>
    package5Wave5Capability(registration, false),
  ),
  ...P4_06_EXECUTABLE_REGISTRATIONS.map(p406ExecutableCapability),
  p405SchedulerEnvelopeCapability(),
  ...P4_05_EXECUTABLE_REGISTRATIONS.map(p405ExecutableCapability),
  p404SchedulerEnvelopeCapability(),
  ...P4_04_EXECUTABLE_REGISTRATIONS.map(p404ExecutableCapability),
  p403BulkEnvelopeCapability({
    capability: P4_03_BULK_ENVELOPE_CAPABILITIES.expire,
    actionClass: 'expire_legacy_loyalty',
  }),
  p403BulkEnvelopeCapability({
    capability: P4_03_BULK_ENVELOPE_CAPABILITIES.backfill,
    actionClass: 'backfill_legacy_loyalty',
  }),
  p403BulkEnvelopeCapability({
    capability: P4_03_BULK_ENVELOPE_CAPABILITIES.import,
    actionClass: 'import_legacy_loyalty_balance',
  }),
  p403ExecutableCapability({
    capability: P4_03_EXECUTABLE_CAPABILITIES.earn,
    actionClass: 'earn_legacy_loyalty',
    targetKind: 'loyalty_client',
    executorKey: 'loyalty.legacy-ledger',
    allowedSourceTypes: ['scheduler', 'legacy_bridge'],
    riskFacets: ['provider_evidence'],
    normalizeInput: p403EarnExecutableNormalizer,
  }),
  p403ExecutableCapability({
    capability: P4_03_EXECUTABLE_CAPABILITIES.expire,
    actionClass: 'expire_legacy_loyalty',
    targetKind: 'loyalty_client',
    executorKey: 'loyalty.legacy-ledger',
    allowedSourceTypes: ['scheduler', 'legacy_bridge'],
    riskFacets: ['destructive', 'bulk_child', 'approval_bound'],
    normalizeInput: p403ExpireExecutableNormalizer,
  }),
  p403ExecutableCapability({
    capability: P4_03_EXECUTABLE_CAPABILITIES.redeem,
    actionClass: 'redeem_legacy_loyalty',
    targetKind: 'loyalty_redemption',
    executorKey: 'loyalty.legacy-ledger',
    allowedSourceTypes: ['legacy_bridge', 'authenticated_request'],
    riskFacets: ['destructive', 'appointment_evidence'],
    normalizeInput: p403RedeemExecutableNormalizer,
  }),
  p403ExecutableCapability({
    capability: P4_03_EXECUTABLE_CAPABILITIES.refund,
    actionClass: 'refund_legacy_loyalty',
    targetKind: 'loyalty_redemption',
    executorKey: 'loyalty.legacy-ledger',
    allowedSourceTypes: ['webhook', 'legacy_bridge', 'authenticated_request'],
    riskFacets: ['compensating', 'provider_evidence'],
    normalizeInput: p403RefundExecutableNormalizer,
  }),
  p403ExecutableCapability({
    capability: P4_03_EXECUTABLE_CAPABILITIES.import,
    actionClass: 'import_legacy_loyalty_balance',
    targetKind: 'loyalty_account',
    executorKey: 'loyalty.legacy-ledger',
    allowedSourceTypes: ['legacy_bridge', 'authenticated_request'],
    riskFacets: ['provider_evidence', 'one_time', 'bulk_child'],
    normalizeInput: p403ImportExecutableNormalizer,
  }),
  p403ExecutableCapability({
    capability: P4_03_EXECUTABLE_CAPABILITIES.backfill,
    actionClass: 'backfill_legacy_loyalty',
    targetKind: 'loyalty_client',
    executorKey: 'loyalty.legacy-ledger',
    allowedSourceTypes: ['scheduler', 'legacy_bridge', 'authenticated_request'],
    riskFacets: ['provider_evidence', 'one_time', 'bulk_child'],
    normalizeInput: p403BackfillExecutableNormalizer,
  }),
  p403ExecutableCapability({
    capability: P4_03_EXECUTABLE_CAPABILITIES.issueGrant,
    actionClass: 'issue_loyalty_redemption_grant',
    targetKind: 'loyalty_redemption_grant',
    executorKey: 'loyalty.redemption-grant.issue',
    allowedSourceTypes: ['legacy_bridge', 'authenticated_request'],
    riskFacets: ['one_time', 'bearer_secret'],
    normalizeInput: p403GrantIssueExecutableNormalizer,
  }),
  p403ExecutableCapability({
    capability: P4_03_EXECUTABLE_CAPABILITIES.consumeGrant,
    actionClass: 'consume_loyalty_redemption_grant',
    targetKind: 'loyalty_redemption',
    executorKey: 'loyalty.redemption-grant.consume',
    allowedSourceTypes: ['legacy_bridge', 'authenticated_request'],
    riskFacets: ['one_time', 'bearer_secret', 'destructive', 'local_only'],
    normalizeInput: p403GrantConsumeExecutableNormalizer,
  }),
  appointmentCapability({
    capability: 'crm.appointment.attendance.v1',
    actionClass: 'set_appointment_attendance',
    executorKey: 'crm.appointment.attendance',
    normalizeInput: attendanceShadowNormalizer,
  }),
  appointmentCapability({
    capability: 'crm.appointment.duration.v1',
    actionClass: 'set_appointment_duration',
    executorKey: 'crm.appointment.duration',
    normalizeInput: durationShadowNormalizer,
  }),
  appointmentCapability({
    capability: 'crm.appointment.services.v1',
    actionClass: 'set_appointment_services',
    executorKey: 'crm.appointment.services',
    normalizeInput: servicesNormalizer,
  }),
  appointmentCapability({
    capability: 'crm.appointment.fields.v1',
    actionClass: 'set_appointment_fields',
    executorKey: 'crm.appointment.fields',
    normalizeInput: fieldsNormalizer,
  }),
  residualAppointmentShadowCapability({
    capability: 'crm.appointment.attendance.shadow.v1',
    actionClass: 'set_appointment_attendance',
    normalizeInput: attendanceShadowNormalizer,
  }),
  residualAppointmentShadowCapability({
    capability: 'crm.appointment.duration.shadow.v1',
    actionClass: 'set_appointment_duration',
    normalizeInput: durationShadowNormalizer,
  }),
  residualAppointmentShadowCapability({
    capability: 'crm.appointment.services.shadow.v1',
    actionClass: 'set_appointment_services',
    normalizeInput: servicesShadowNormalizer,
  }),
  residualAppointmentShadowCapability({
    capability: 'crm.appointment.fields.shadow.v1',
    actionClass: 'set_appointment_fields',
    normalizeInput: fieldsShadowNormalizer,
  }),
  syntheticCapability({
    capability: 'kernel.test.safe-retry',
    actionClass: 'kernel_safe_retry',
    maxExecutionAttempts: 2,
    retryablePreDispatchErrors: ['synthetic_transient_predispatch'],
    retryAfterProvenNonExecution: true,
  }),
  syntheticCapability({
    capability: 'kernel.test.no-retry',
    actionClass: 'kernel_no_retry',
    maxExecutionAttempts: 1,
    retryAfterProvenNonExecution: false,
  }),
  syntheticCapability({
    capability: 'kernel.test.reconcile-before-retry',
    actionClass: 'kernel_reconcile_before_retry',
    maxExecutionAttempts: 2,
    retryAfterProvenNonExecution: true,
  }),
  syntheticCapability({
    capability: 'kernel.test.approval',
    actionClass: 'kernel_approval',
    approvalRequired: true,
    maxExecutionAttempts: 1,
    retryAfterProvenNonExecution: false,
  }),
  syntheticCapability({
    capability: 'kernel.test.denied',
    actionClass: 'kernel_denied',
    policyDecision: ActionPolicyDecision.DENY,
    maxExecutionAttempts: 1,
    retryAfterProvenNonExecution: false,
  }),
];

export class ActionCapabilityRegistry {
  private readonly capabilities = new Map(
    CAPABILITIES.map((capability) => [capability.capability, capability]),
  );

  get(capabilityKey: string): RegisteredActionCapabilityV1 {
    const capability = this.capabilities.get(capabilityKey);
    if (!capability) {
      throw new ActionContractError(
        `Capability is not registered for the Phase B1 kernel: ${capabilityKey}`,
      );
    }
    return capability;
  }

  assertActionClass(capabilityKey: string, actionClass: string): void {
    const capability = this.get(capabilityKey);
    if (capability.actionClass !== actionClass) {
      throw new ActionContractError(
        'Action class does not match the trusted capability registry',
      );
    }
  }

  list(): readonly RegisteredActionCapabilityV1[] {
    return [...this.capabilities.values()];
  }
}
