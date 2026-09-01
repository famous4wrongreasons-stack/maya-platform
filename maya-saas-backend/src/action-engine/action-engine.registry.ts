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
  ]);
  const channel = requiredText(source, 'channel', 40);
  if (channel !== 'inbox' && channel !== 'apns' && channel !== 'telegram') {
    throw new ActionContractError('channel must be inbox, apns or telegram');
  }
  const userId = optionalText(source, 'userId', 160);
  const telegramChatId = optionalText(source, 'telegramChatId', 160);
  const deviceToken = optionalText(source, 'deviceToken', 512);
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
