import { type ReminderDispatch } from './appointment-reminder.contract';
import { CommunicationWebPushService } from './communication-web-push.service';
import { createHash } from 'node:crypto';

import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  type ActionFailureClassification,
  type ActionRuntimePhase,
} from '../action-engine';
import { prepareInboxApnsCanonical } from '../inbox/apns-push';
import { PrismaService } from '../prisma/prisma.service';
import { COMMUNICATION_ENVELOPE_CONTRACT } from './communication-delivery.contract';
import { CommunicationDeliveryKernel } from './communication-delivery.kernel';

const NEW_APPOINTMENT_CAPABILITY =
  'communication.transactional-single.new-appointment.execute.v1';
const PRIVACY_TELEGRAM_CAPABILITY =
  'communication.operational-single.privacy.execute.v1';
const INBOX_DELIVERY_CAPABILITY =
  'communication.production.inbox.new-appointment';
const PRIVACY_DELIVERY_CAPABILITY = 'communication.production.telegram.privacy';
const PACKAGE2_INBOX_DELIVERY_CAPABILITY =
  'communication.production.inbox.package2-single';
const PACKAGE2_APNS_DELIVERY_CAPABILITY =
  'communication.production.apns.package2-single';
const PACKAGE2_TELEGRAM_DELIVERY_CAPABILITY =
  'communication.production.telegram.package2-single';
const DAY = 24 * 60 * 60 * 1_000;

export type Package2InboxType =
  | 'appointment_reminder'
  | 'shift_reminder'
  | 'daily_report'
  | 'morning_brief'
  | 'growth_plan'
  | 'hanging_lead'
  | 'owner_alert'
  | 'birthday_alert'
  | 'review_alert'
  | 'wanted_slot_available';

type Package2SourceType =
  'authenticated_request' | 'scheduler' | 'webhook' | 'legacy_bridge';

const PACKAGE2_CAPABILITY_BY_TYPE: Record<Package2InboxType, string> = {
  appointment_reminder: 'communication.appointment-reminders.execute.v1',
  shift_reminder: 'communication.appointment-reminders.execute.v1',
  daily_report: 'communication.reports-briefings.execute.v1',
  morning_brief: 'communication.reports-briefings.execute.v1',
  growth_plan: 'communication.reports-briefings.execute.v1',
  hanging_lead: 'communication.business-alerts.execute.v1',
  owner_alert: 'communication.business-alerts.execute.v1',
  birthday_alert: 'communication.business-alerts.execute.v1',
  review_alert: 'communication.business-alerts.execute.v1',
  wanted_slot_available: 'communication.appointment-reminders.execute.v1',
};

interface InboxDeliveryInput {
  tenantId: string;
  userId: string;
  sourceEventId: string;
  title: string;
  bodyText: string;
  deepLink?: string | null;
  payload?: Record<string, unknown>;
}

interface PrivacyTelegramInput {
  tenantId: string;
  telegramChatId: string;
  sourceEventId: string;
}

interface Package2SingleInput extends InboxDeliveryInput {
  messageType: Package2InboxType;
  sourceType: Package2SourceType;
  deviceToken?: string;
  /** HMAC comparison identity for a verified ClientChannelLink recipient. */
  recipientIdentityRef?: string;
}

export interface Package2TelegramButton {
  text: string;
  callbackData?: string;
  url?: string;
}

interface Package2TelegramInput {
  tenantId: string;
  telegramChatId: string;
  messageType: Package2InboxType;
  sourceType: Package2SourceType;
  sourceEventId: string;
  title: string;
  bodyText: string;
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  buttons?: Package2TelegramButton[];
  /** HMAC comparison identity for a verified ClientChannelLink recipient. */
  recipientIdentityRef?: string;
}

interface BulkCampaignDeliveryInput {
  tenantId: string;
  actorUserId: string;
  campaignId: string;
  audienceId: string;
  audienceSnapshotHash: string;
  messageSnapshotHash: string;
  title: string;
  bodyText: string;
  expiresAt: Date;
  idempotencyKey: string;
}

interface DeliveryResult {
  actionExecutionId: string;
  deliveryId: string;
  status: 'delivered' | 'accepted';
  providerReference?: string;
}

export interface BulkDeliveryResult extends DeliveryResult {
  deliveredUserIds: string[];
}

class CommunicationDispatchError extends Error {
  constructor(
    readonly classification: 'definitive' | 'unknown',
    readonly outcomeCode: string,
    readonly errorClass: string,
    message: string,
  ) {
    super(message);
  }
}

function sha256(...parts: string[]): string {
  return createHash('sha256').update(parts.join('\u001f')).digest('hex');
}

function requiredString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new CommunicationDispatchError(
      'definitive',
      'invalid_normalized_input',
      'communication_contract',
      `${key} is required`,
    );
  }
  return value.trim();
}

function telegramButtons(value: unknown): Package2TelegramButton[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new CommunicationDispatchError(
        'definitive',
        'invalid_telegram_button',
        'communication_contract',
        'Telegram button is invalid',
      );
    }
    const source = item as Record<string, unknown>;
    const text = requiredString(source, 'text');
    const callbackData =
      typeof source.callbackData === 'string' ? source.callbackData.trim() : '';
    const url = typeof source.url === 'string' ? source.url.trim() : '';
    if (Boolean(callbackData) === Boolean(url)) {
      throw new CommunicationDispatchError(
        'definitive',
        'invalid_telegram_button_action',
        'communication_contract',
        'Telegram button must have exactly one action',
      );
    }
    return {
      text,
      ...(callbackData ? { callbackData } : {}),
      ...(url ? { url } : {}),
    };
  });
}

@Injectable()
export class CommunicationDeliveryService {
  private readonly kernel: CommunicationDeliveryKernel;
  private readonly privacyExecutorUrl: string;
  private readonly package2TelegramExecutorUrl: string;
  private readonly bridgeToken: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly actionEngine: ActionEngineRuntimeService,
    config: ConfigService,
    @Optional() private readonly webPush?: CommunicationWebPushService,
  ) {
    const compatibilitySecret = config.get<string>('CRM_ENCRYPTION_KEY');
    const identitySecret =
      config.get<string>('ACTION_ENGINE_IDENTITY_SECRET') ??
      compatibilitySecret;
    const payloadEncryptionSecret =
      config.get<string>('ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET') ??
      compatibilitySecret;
    if (!identitySecret || !payloadEncryptionSecret) {
      throw new Error('Communication Delivery secrets are not configured');
    }
    this.kernel = new CommunicationDeliveryKernel(prisma, {
      identitySecret,
      payloadEncryptionSecret,
    });
    this.privacyExecutorUrl =
      config.get<string>('MAYA_PRIVACY_TELEGRAM_EXECUTOR_URL') ??
      'http://127.0.0.1:8080/api/internal/action-engine/privacy-telegram';
    this.package2TelegramExecutorUrl =
      config.get<string>('MAYA_PACKAGE2_TELEGRAM_EXECUTOR_URL') ??
      'http://127.0.0.1:8080/api/internal/action-engine/package2-telegram';
    this.bridgeToken =
      config.get<string>('MAYA_INBOX_BRIDGE_TOKEN')?.trim() ?? '';
  }

  async deliverNewAppointmentInbox(
    input: InboxDeliveryInput,
  ): Promise<DeliveryResult> {
    const requestInput = {
      userId: input.userId,
      sourceEventId: input.sourceEventId,
      title: input.title,
      bodyText: input.bodyText,
      ...(input.deepLink ? { deepLink: input.deepLink } : {}),
      ...(input.payload ? { payload: input.payload } : {}),
    };
    const receipt = await this.actionEngine.executeWithReceipt(
      {
        contract: ACTION_EXECUTION_REQUEST_CONTRACT,
        tenantId: input.tenantId,
        capability: NEW_APPOINTMENT_CAPABILITY,
        source: {
          type: 'legacy_bridge',
          occurrenceScope: `inbox:new-appointment:${input.sourceEventId}:${input.userId}`,
          sourceRef: 'legacy.python.inbox.new-appointment',
        },
        targetRef: `user:${input.userId}`,
        input: requestInput,
        evidenceRefs: [`legacy-event:${input.sourceEventId}`],
        intentExpiresAt: new Date(Date.now() + 7 * DAY),
        callerIdempotency: {
          scope: 'communication:new-appointment:inbox',
          key: `${input.sourceEventId}:${input.userId}`,
        },
      },
      {
        prepare: async (normalized, context) => {
          const userId = requiredString(normalized, 'userId');
          const sourceEventId = requiredString(normalized, 'sourceEventId');
          const envelope = await this.kernel.createEnvelope({
            contract: COMMUNICATION_ENVELOPE_CONTRACT,
            tenantId: context.tenantId,
            actionExecutionId: context.executionId,
            scope: 'SINGLE',
            channel: 'inbox',
            capabilityKey: INBOX_DELIVERY_CAPABILITY,
            campaignIdempotencyKey: `new-appointment:${sourceEventId}:${userId}`,
            contentRef: 'template:inbox.new-appointment.v1',
            contentIdentityHash: sha256(
              'inbox.new-appointment.v1',
              requiredString(normalized, 'title'),
              requiredString(normalized, 'bodyText'),
              typeof normalized.deepLink === 'string'
                ? normalized.deepLink
                : '',
            ),
            expiresAt: new Date(Date.now() + 7 * DAY),
            recipients: [
              {
                recipientRef: userId,
                recipientKind: 'internal_user',
                internalUserId: userId,
                eligibility: {
                  basis: 'server_recipient_resolution',
                  decision: 'ALLOW',
                  policyVersion: 1,
                  evidenceRef: `legacy:${sourceEventId}`,
                  evidenceHash: sha256(context.tenantId, sourceEventId, userId),
                  checkedAt: new Date(),
                },
              },
            ],
          });
          return { campaignId: envelope.id };
        },
        dispatch: async (normalized, _transportKey, context) => {
          const userId = requiredString(normalized, 'userId');
          const sourceEventId = requiredString(normalized, 'sourceEventId');
          const existing = await this.findInboxItem(
            context.tenantId,
            userId,
            'new_appointment',
            sourceEventId,
          );
          const campaign = await this.requireCampaign(
            context.tenantId,
            context.executionId,
          );
          if (existing) {
            return {
              value: {
                actionExecutionId: context.executionId,
                deliveryId: existing.id,
                status: 'delivered' as const,
              },
              safeResult: {
                deliveryId: existing.id,
                status: 'delivered',
              },
            };
          }
          const claim = await this.kernel.claimNext({
            tenantId: context.tenantId,
            workerId: `inbox:${context.executionId}`,
            campaignId: campaign.id,
          });
          if (!claim) {
            throw new CommunicationDispatchError(
              'unknown',
              'delivery_claim_unavailable',
              'communication_state_unknown',
              'Communication recipient could not be claimed',
            );
          }
          const owned = {
            tenantId: context.tenantId,
            campaignId: claim.campaign.id,
            recipientId: claim.recipient.id,
            attemptId: claim.attempt.id,
            leaseToken: claim.leaseToken,
            recipientRevision: claim.recipient.revision,
          };
          await this.kernel.markDispatchBoundary(owned);
          try {
            const payload =
              normalized.payload &&
              typeof normalized.payload === 'object' &&
              !Array.isArray(normalized.payload)
                ? (normalized.payload as Record<string, unknown>)
                : undefined;
            const row = await this.prisma.inboxItem.upsert({
              where: {
                tenantId_userId_type_sourceEventId: {
                  tenantId: context.tenantId,
                  userId,
                  type: 'new_appointment',
                  sourceEventId,
                },
              },
              create: {
                tenantId: context.tenantId,
                userId,
                type: 'new_appointment',
                sourceEventId,
                title: requiredString(normalized, 'title').slice(0, 160),
                bodyText: requiredString(normalized, 'bodyText').slice(
                  0,
                  12000,
                ),
                payloadJson: payload as Prisma.InputJsonValue | undefined,
                deepLink:
                  typeof normalized.deepLink === 'string'
                    ? normalized.deepLink.slice(0, 400)
                    : null,
              },
              update: {
                title: requiredString(normalized, 'title').slice(0, 160),
                bodyText: requiredString(normalized, 'bodyText').slice(
                  0,
                  12000,
                ),
                payloadJson: payload as Prisma.InputJsonValue | undefined,
                deepLink:
                  typeof normalized.deepLink === 'string'
                    ? normalized.deepLink.slice(0, 400)
                    : null,
                deletedAt: null,
              },
              select: { id: true },
            });
            await this.kernel.finalizeDelivered({
              ...owned,
              recipientRevision: owned.recipientRevision + 1,
              outcomeCode: 'inbox_item_persisted',
              providerReference: row.id,
            });
            return {
              value: {
                actionExecutionId: context.executionId,
                deliveryId: row.id,
                status: 'delivered' as const,
              },
              safeResult: { deliveryId: row.id, status: 'delivered' },
            };
          } catch (error) {
            await this.markUnknownSafely(owned, 'inbox_persistence_uncertain');
            if (error instanceof CommunicationDispatchError) throw error;
            throw new CommunicationDispatchError(
              'unknown',
              'inbox_persistence_uncertain',
              'communication_outcome_unknown',
              'Inbox delivery outcome is unknown',
            );
          }
        },
        reconcile: async (normalized, _preDispatch, context) => {
          if (!context) return { outcome: 'STILL_UNKNOWN' as const };
          const row = await this.findInboxItem(
            context.tenantId,
            requiredString(normalized, 'userId'),
            'new_appointment',
            requiredString(normalized, 'sourceEventId'),
          );
          return row
            ? {
                outcome: 'PROVEN_SUCCEEDED' as const,
                safeResult: { deliveryId: row.id, status: 'delivered' },
              }
            : { outcome: 'PROVEN_NOT_EXECUTED' as const };
        },
        restore: (safeResult) => ({
          actionExecutionId: '',
          deliveryId: requiredString(safeResult, 'deliveryId'),
          status: 'delivered' as const,
        }),
        classifyError: (error, phase) => this.classify(error, phase),
      },
    );
    return {
      ...receipt.value,
      actionExecutionId: receipt.execution.executionId,
    };
  }

  async deliverAppointmentReminder(dispatch: ReminderDispatch) {
    await dispatch.authorize();
    const n = dispatch.request.input as Record<string, unknown>;
    if (n.messageType !== 'appointment_reminder' || !n.reminderPlan)
      throw new Error('REMINDER_PLAN_REQUIRED');
    const common = {
      tenantId: dispatch.request.tenantId,
      messageType: 'appointment_reminder' as const,
      sourceType: 'scheduler' as const,
      sourceEventId: String(n.sourceEventId),
      title: String(n.title),
      bodyText: String(n.bodyText),
      recipientIdentityRef: String(n.recipientIdentityRef),
    };
    if (n.channel === 'telegram')
      return this.deliverPackage2Telegram(
        { ...common, telegramChatId: String(n.telegramChatId) },
        dispatch,
      );
    if (n.channel === 'inbox')
      return this.deliverPackage2Single(
        {
          ...common,
          userId: String(n.userId),
          deepLink: String(n.deepLink),
          payload: n.payload as Record<string, unknown>,
        },
        'inbox',
        dispatch,
      );
    throw new Error('REMINDER_PRIMARY_ROUTE_INVALID');
  }

  async deliverReminderApns(
    parent: ReminderDispatch,
    deviceToken: string,
    authorize: () => Promise<void>,
  ) {
    const n = parent.request.input as Record<string, unknown>;
    if (
      n.channel !== 'inbox' ||
      n.messageType !== 'appointment_reminder' ||
      !n.reminderPlan
    )
      throw new Error('REMINDER_INBOX_REQUIRED');
    if (
      !(await this.prisma.actionExecution.findFirst({
        where: {
          tenantId: parent.request.tenantId,
          capability: 'communication.appointment-reminders.execute.v1',
          sourceRef: parent.request.source.sourceRef,
          state: 'SUCCEEDED',
          dryRun: false,
        },
      }))
    )
      throw new Error('REMINDER_PRIMARY_NOT_ACCEPTED');
    const child: Record<string, unknown> = {
      ...n,
      channel: 'apns',
      deviceToken,
    };
    delete child.reminderPlan;
    const identity = sha256('apns-device', deviceToken);
    return this.deliverPackage2Single(
      {
        tenantId: parent.request.tenantId,
        userId: String(n.userId),
        sourceEventId: String(n.sourceEventId),
        title: String(n.title),
        bodyText: String(n.bodyText),
        messageType: 'appointment_reminder',
        sourceType: 'scheduler',
        recipientIdentityRef: String(n.recipientIdentityRef),
        deviceToken,
      },
      'apns',
      {
        authorize,
        request: {
          ...parent.request,
          input: child,
          source: {
            ...parent.request.source,
            sourceRef: `b25.reminder.apns:${identity}`,
            occurrenceScope: `${parent.request.source.occurrenceScope}:apns:${identity}`,
          },
          targetRef: `device:${identity}`,
          callerIdempotency: {
            scope: 'communication:appointment:apns:v1',
            key: `${String(n.sourceEventId)}:${identity}`,
          },
        },
      },
    );
  }

  deliverPackage2Inbox(input: Package2SingleInput): Promise<DeliveryResult> {
    return this.deliverPackage2Single(input, 'inbox');
  }

  deliverPackage2Apns(
    input: Package2SingleInput & { deviceToken: string },
  ): Promise<DeliveryResult> {
    return this.deliverPackage2Single(input, 'apns');
  }

  async deliverPackage2Telegram(
    input: Package2TelegramInput,
    reminder?: ReminderDispatch,
  ): Promise<DeliveryResult> {
    const recipientRef = this.recipientIdentity(
      input.recipientIdentityRef,
      input.telegramChatId,
    );
    const requestInput = {
      channel: 'telegram',
      messageType: input.messageType,
      telegramChatId: input.telegramChatId,
      sourceEventId: input.sourceEventId,
      title: input.title,
      bodyText: input.bodyText,
      ...(input.parseMode ? { parseMode: input.parseMode } : {}),
      ...(input.buttons?.length ? { buttons: input.buttons } : {}),
      ...(input.recipientIdentityRef
        ? { recipientIdentityRef: recipientRef }
        : {}),
    };
    const receipt = await this.actionEngine.executeWithReceipt(
      reminder?.request ?? {
        contract: ACTION_EXECUTION_REQUEST_CONTRACT,
        tenantId: input.tenantId,
        capability: PACKAGE2_CAPABILITY_BY_TYPE[input.messageType],
        source: {
          type: input.sourceType,
          occurrenceScope: `package2:${input.messageType}:telegram:${input.sourceEventId}:${recipientRef}`,
          sourceRef: `legacy.package2.${input.messageType}`,
        },
        targetRef: `telegram:${recipientRef}`,
        input: requestInput,
        evidenceRefs: [`source-event:${input.sourceEventId}`],
        intentExpiresAt: new Date(Date.now() + 7 * DAY),
        callerIdempotency: {
          scope: `communication:package2:${input.messageType}:telegram`,
          key: `${input.sourceEventId}:${recipientRef}`,
        },
      },
      {
        prepare: async (normalized, context) => {
          await reminder?.authorize();
          if (!this.bridgeToken || this.bridgeToken.length < 24) {
            throw new CommunicationDispatchError(
              'definitive',
              'package2_telegram_executor_not_configured',
              'configuration_error',
              'Package 2 Telegram executor is not configured',
            );
          }
          if (
            requiredString(normalized, 'channel') !== 'telegram' ||
            requiredString(normalized, 'messageType') !== input.messageType
          ) {
            throw new CommunicationDispatchError(
              'definitive',
              'package2_delivery_contract_mismatch',
              'communication_contract',
              'Package 2 Telegram contract does not match the executor',
            );
          }
          const telegramChatId = requiredString(normalized, 'telegramChatId');
          const durableRecipientRef =
            typeof normalized.recipientIdentityRef === 'string'
              ? requiredString(normalized, 'recipientIdentityRef')
              : telegramChatId;
          const sourceEventId = requiredString(normalized, 'sourceEventId');
          const buttons = telegramButtons(normalized.buttons);
          const parseMode =
            typeof normalized.parseMode === 'string'
              ? normalized.parseMode
              : '';
          const envelope = await this.kernel.createEnvelope({
            contract: COMMUNICATION_ENVELOPE_CONTRACT,
            tenantId: context.tenantId,
            actionExecutionId: context.executionId,
            scope: 'SINGLE',
            channel: 'telegram',
            capabilityKey: PACKAGE2_TELEGRAM_DELIVERY_CAPABILITY,
            campaignIdempotencyKey: `package2:${input.messageType}:telegram:${sourceEventId}:${durableRecipientRef}`,
            contentRef: `template:telegram.${input.messageType}.v1`,
            contentIdentityHash: sha256(
              `telegram.${input.messageType}.v1`,
              requiredString(normalized, 'title'),
              requiredString(normalized, 'bodyText'),
              parseMode,
              JSON.stringify(buttons),
            ),
            expiresAt:
              reminder?.request.intentExpiresAt ??
              new Date(Date.now() + 7 * DAY),
            recipients: [
              {
                recipientRef: durableRecipientRef,
                recipientKind: 'telegram_chat',
                eligibility: {
                  basis: 'server_recipient_resolution',
                  decision: 'ALLOW',
                  policyVersion: 1,
                  evidenceRef: `source-event:${sourceEventId}`,
                  evidenceHash: sha256(
                    context.tenantId,
                    input.messageType,
                    sourceEventId,
                    durableRecipientRef,
                  ),
                  checkedAt: new Date(),
                },
              },
            ],
          });
          return { campaignId: envelope.id };
        },
        dispatch: async (normalized, _transportKey, context) => {
          const campaign = await this.requireCampaign(
            context.tenantId,
            context.executionId,
          );
          const existing =
            await this.prisma.marketingCampaignRecipient.findFirst({
              where: {
                tenantId: context.tenantId,
                campaignId: campaign.id,
                deliveryState: { in: ['ACCEPTED', 'DELIVERED'] },
              },
              select: { id: true, providerMessageId: true },
            });
          if (existing) {
            return {
              value: {
                actionExecutionId: context.executionId,
                deliveryId: existing.id,
                status: 'accepted' as const,
                providerReference: existing.providerMessageId ?? undefined,
              },
              safeResult: {
                deliveryId: existing.id,
                status: 'accepted',
                ...(existing.providerMessageId
                  ? { providerReference: existing.providerMessageId }
                  : {}),
              },
            };
          }
          const claim = await this.kernel.claimNext({
            tenantId: context.tenantId,
            workerId: `package2:telegram:${context.executionId}`,
            campaignId: campaign.id,
          });
          if (!claim) {
            throw new CommunicationDispatchError(
              'unknown',
              'delivery_claim_unavailable',
              'communication_state_unknown',
              'Communication recipient could not be claimed',
            );
          }
          const owned = {
            tenantId: context.tenantId,
            campaignId: claim.campaign.id,
            recipientId: claim.recipient.id,
            attemptId: claim.attempt.id,
            leaseToken: claim.leaseToken,
            recipientRevision: claim.recipient.revision,
          };
          await reminder?.authorize();
          await this.kernel.markDispatchBoundary(owned);
          let response: Response;
          try {
            response = await fetch(this.package2TelegramExecutorUrl, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'x-maya-inbox-bridge': this.bridgeToken,
              },
              body: JSON.stringify({
                telegram_chat_id: requiredString(normalized, 'telegramChatId'),
                message_type: requiredString(normalized, 'messageType'),
                source_event_id: requiredString(normalized, 'sourceEventId'),
                title: requiredString(normalized, 'title'),
                body_text: requiredString(normalized, 'bodyText'),
                ...(typeof normalized.parseMode === 'string'
                  ? { parse_mode: normalized.parseMode }
                  : {}),
                ...(telegramButtons(normalized.buttons).length
                  ? {
                      buttons: telegramButtons(normalized.buttons).map(
                        (button) => ({
                          text: button.text,
                          ...(button.callbackData
                            ? { callback_data: button.callbackData }
                            : {}),
                          ...(button.url ? { url: button.url } : {}),
                        }),
                      ),
                    }
                  : {}),
              }),
              signal: AbortSignal.timeout(4_000),
            });
          } catch {
            await this.markUnknownSafely(owned, 'telegram_dispatch_uncertain');
            throw new CommunicationDispatchError(
              'unknown',
              'telegram_dispatch_uncertain',
              'provider_outcome_unknown',
              'Telegram delivery outcome is unknown',
            );
          }
          const responseBody = await this.safeJson(response);
          if (response.status >= 400 && response.status < 500) {
            await this.kernel.finalizeDeterministicReject({
              ...owned,
              recipientRevision: owned.recipientRevision + 1,
              outcomeCode: `executor_http_${response.status}`,
              errorCode: 'telegram_executor_rejected',
            });
            throw new CommunicationDispatchError(
              'definitive',
              'telegram_executor_rejected',
              'provider_rejected',
              'Telegram executor rejected the request',
            );
          }
          if (!response.ok) {
            await this.markUnknownSafely(owned, 'telegram_dispatch_uncertain');
            throw new CommunicationDispatchError(
              'unknown',
              'telegram_dispatch_uncertain',
              'provider_outcome_unknown',
              'Telegram delivery outcome is unknown',
            );
          }
          const messageId =
            typeof responseBody.message_id === 'string' ||
            typeof responseBody.message_id === 'number'
              ? String(responseBody.message_id)
              : '';
          if (!messageId) {
            await this.markUnknownSafely(owned, 'provider_reference_missing');
            throw new CommunicationDispatchError(
              'unknown',
              'provider_reference_missing',
              'provider_outcome_unknown',
              'Telegram provider reference is missing',
            );
          }
          try {
            await this.kernel.finalizeAccepted({
              ...owned,
              recipientRevision: owned.recipientRevision + 1,
              outcomeCode: 'telegram_provider_accepted',
              providerReference: messageId,
            });
          } catch {
            throw new CommunicationDispatchError(
              'unknown',
              'telegram_acceptance_persistence_uncertain',
              'communication_outcome_unknown',
              'Telegram delivery was accepted but persistence is uncertain',
            );
          }
          return {
            value: {
              actionExecutionId: context.executionId,
              deliveryId: claim.recipient.id,
              status: 'accepted' as const,
              providerReference: messageId,
            },
            safeResult: {
              deliveryId: claim.recipient.id,
              status: 'accepted',
              providerReference: messageId,
            },
          };
        },
        reconcile: () => Promise.resolve({ outcome: 'STILL_UNKNOWN' as const }),
        restore: (safeResult) => ({
          actionExecutionId: '',
          deliveryId: requiredString(safeResult, 'deliveryId'),
          status: 'accepted' as const,
          ...(typeof safeResult.providerReference === 'string'
            ? { providerReference: safeResult.providerReference }
            : {}),
        }),
        classifyError: (error, phase) => this.classify(error, phase),
      },
    );
    if (this.webPush && !reminder) {
      // Primary acceptance is durable. A supplemental device's UNKNOWN outcome
      // stays in Communication Delivery and cannot undo/resend that acceptance.
      await this.webPush
        .deliverFromAcceptedReceipt(
          input.tenantId,
          receipt.execution.executionId,
        )
        .catch(() => undefined);
    }
    return {
      ...receipt.value,
      actionExecutionId: receipt.execution.executionId,
    };
  }

  private async deliverPackage2Single(
    input: Package2SingleInput,
    channel: 'inbox' | 'apns',
    reminder?: ReminderDispatch,
  ): Promise<DeliveryResult> {
    const deviceToken = channel === 'apns' ? input.deviceToken?.trim() : '';
    const deviceIdentity = deviceToken
      ? sha256('apns-device', deviceToken)
      : '';
    const recipientRef = this.recipientIdentity(
      input.recipientIdentityRef,
      input.userId,
    );
    const requestInput = {
      channel,
      messageType: input.messageType,
      userId: input.userId,
      ...(deviceToken ? { deviceToken } : {}),
      sourceEventId: input.sourceEventId,
      title: input.title,
      bodyText: input.bodyText,
      ...(input.deepLink ? { deepLink: input.deepLink } : {}),
      ...(input.payload ? { payload: input.payload } : {}),
      ...(input.recipientIdentityRef
        ? { recipientIdentityRef: recipientRef }
        : {}),
    };
    let preparedApnsSender: ReturnType<
      typeof prepareInboxApnsCanonical
    > | null = null;
    const receipt = await this.actionEngine.executeWithReceipt(
      reminder?.request ?? {
        contract: ACTION_EXECUTION_REQUEST_CONTRACT,
        tenantId: input.tenantId,
        capability: PACKAGE2_CAPABILITY_BY_TYPE[input.messageType],
        source: {
          type: input.sourceType,
          occurrenceScope: `package2:${input.messageType}:${channel}:${input.sourceEventId}:${recipientRef}${deviceIdentity ? `:${deviceIdentity}` : ''}`,
          sourceRef: `legacy.package2.${input.messageType}`,
        },
        targetRef:
          channel === 'inbox'
            ? `user:${recipientRef}`
            : `device:${deviceIdentity}`,
        input: requestInput,
        evidenceRefs: [`source-event:${input.sourceEventId}`],
        intentExpiresAt: new Date(Date.now() + 7 * DAY),
        callerIdempotency: {
          scope: `communication:package2:${input.messageType}:${channel}`,
          key: `${input.sourceEventId}:${recipientRef}${deviceIdentity ? `:${deviceIdentity}` : ''}`,
        },
      },
      {
        prepare: async (normalized, context) => {
          await reminder?.authorize();
          const normalizedChannel = requiredString(normalized, 'channel');
          const messageType = requiredString(normalized, 'messageType');
          const userId = requiredString(normalized, 'userId');
          const durableRecipientRef =
            typeof normalized.recipientIdentityRef === 'string'
              ? requiredString(normalized, 'recipientIdentityRef')
              : userId;
          const sourceEventId = requiredString(normalized, 'sourceEventId');
          if (
            normalizedChannel !== channel ||
            messageType !== input.messageType
          ) {
            throw new CommunicationDispatchError(
              'definitive',
              'package2_delivery_contract_mismatch',
              'communication_contract',
              'Package 2 delivery contract does not match the executor',
            );
          }
          if (channel === 'apns') {
            requiredString(normalized, 'deviceToken');
            preparedApnsSender = prepareInboxApnsCanonical();
          }
          const envelope = await this.kernel.createEnvelope({
            contract: COMMUNICATION_ENVELOPE_CONTRACT,
            tenantId: context.tenantId,
            actionExecutionId: context.executionId,
            scope: 'SINGLE',
            channel,
            capabilityKey:
              channel === 'inbox'
                ? PACKAGE2_INBOX_DELIVERY_CAPABILITY
                : PACKAGE2_APNS_DELIVERY_CAPABILITY,
            campaignIdempotencyKey: `package2:${messageType}:${channel}:${sourceEventId}:${durableRecipientRef}${deviceIdentity ? `:${deviceIdentity}` : ''}`,
            contentRef: `template:inbox.${messageType}.v1`,
            contentIdentityHash: sha256(
              `inbox.${messageType}.v1`,
              requiredString(normalized, 'title'),
              requiredString(normalized, 'bodyText'),
              typeof normalized.deepLink === 'string'
                ? normalized.deepLink
                : '',
            ),
            expiresAt:
              reminder?.request.intentExpiresAt ??
              new Date(Date.now() + 7 * DAY),
            recipients: [
              {
                recipientRef:
                  channel === 'inbox'
                    ? durableRecipientRef
                    : requiredString(normalized, 'deviceToken'),
                recipientKind:
                  channel === 'inbox' ? 'internal_user' : 'device_token',
                internalUserId: userId,
                eligibility: {
                  basis: 'server_recipient_resolution',
                  decision: 'ALLOW',
                  policyVersion: 1,
                  evidenceRef: `source-event:${sourceEventId}`,
                  evidenceHash: sha256(
                    context.tenantId,
                    messageType,
                    sourceEventId,
                    durableRecipientRef,
                    deviceIdentity,
                  ),
                  checkedAt: new Date(),
                },
              },
            ],
          });
          return { campaignId: envelope.id };
        },
        dispatch: async (normalized, _transportKey, context) => {
          const messageType = requiredString(normalized, 'messageType');
          const userId = requiredString(normalized, 'userId');
          const sourceEventId = requiredString(normalized, 'sourceEventId');
          const campaign = await this.requireCampaign(
            context.tenantId,
            context.executionId,
          );
          if (channel === 'inbox') {
            const existing = await this.findInboxItem(
              context.tenantId,
              userId,
              messageType,
              sourceEventId,
            );
            if (existing) {
              return {
                value: {
                  actionExecutionId: context.executionId,
                  deliveryId: existing.id,
                  status: 'delivered' as const,
                },
                safeResult: {
                  deliveryId: existing.id,
                  status: 'delivered',
                },
              };
            }
          }
          const claim = await this.kernel.claimNext({
            tenantId: context.tenantId,
            workerId: `package2:${channel}:${context.executionId}`,
            campaignId: campaign.id,
          });
          if (!claim) {
            throw new CommunicationDispatchError(
              'unknown',
              'delivery_claim_unavailable',
              'communication_state_unknown',
              'Communication recipient could not be claimed',
            );
          }
          const owned = {
            tenantId: context.tenantId,
            campaignId: claim.campaign.id,
            recipientId: claim.recipient.id,
            attemptId: claim.attempt.id,
            leaseToken: claim.leaseToken,
            recipientRevision: claim.recipient.revision,
          };
          await reminder?.authorize();
          await this.kernel.markDispatchBoundary(owned);
          if (channel === 'inbox') {
            try {
              const payload =
                normalized.payload &&
                typeof normalized.payload === 'object' &&
                !Array.isArray(normalized.payload)
                  ? (normalized.payload as Record<string, unknown>)
                  : undefined;
              const row = await this.prisma.inboxItem.upsert({
                where: {
                  tenantId_userId_type_sourceEventId: {
                    tenantId: context.tenantId,
                    userId,
                    type: messageType,
                    sourceEventId,
                  },
                },
                create: {
                  tenantId: context.tenantId,
                  userId,
                  type: messageType,
                  sourceEventId,
                  title: requiredString(normalized, 'title').slice(0, 160),
                  bodyText: requiredString(normalized, 'bodyText').slice(
                    0,
                    12_000,
                  ),
                  payloadJson: payload as Prisma.InputJsonValue | undefined,
                  deepLink:
                    typeof normalized.deepLink === 'string'
                      ? normalized.deepLink.slice(0, 400)
                      : null,
                },
                update: {
                  title: requiredString(normalized, 'title').slice(0, 160),
                  bodyText: requiredString(normalized, 'bodyText').slice(
                    0,
                    12_000,
                  ),
                  payloadJson: payload as Prisma.InputJsonValue | undefined,
                  deepLink:
                    typeof normalized.deepLink === 'string'
                      ? normalized.deepLink.slice(0, 400)
                      : null,
                  deletedAt: null,
                },
                select: { id: true },
              });
              await this.kernel.finalizeDelivered({
                ...owned,
                recipientRevision: owned.recipientRevision + 1,
                outcomeCode: 'inbox_item_persisted',
                providerReference: row.id,
              });
              return {
                value: {
                  actionExecutionId: context.executionId,
                  deliveryId: row.id,
                  status: 'delivered' as const,
                },
                safeResult: { deliveryId: row.id, status: 'delivered' },
              };
            } catch (error) {
              await this.markUnknownSafely(
                owned,
                'inbox_persistence_uncertain',
              );
              if (error instanceof CommunicationDispatchError) throw error;
              throw new CommunicationDispatchError(
                'unknown',
                'inbox_persistence_uncertain',
                'communication_outcome_unknown',
                'Inbox delivery outcome is unknown',
              );
            }
          }
          const sender = preparedApnsSender;
          if (!sender) {
            await this.markUnknownSafely(owned, 'apns_sender_unavailable');
            throw new CommunicationDispatchError(
              'unknown',
              'apns_sender_unavailable',
              'communication_outcome_unknown',
              'APNs sender is unavailable after the dispatch boundary',
            );
          }
          const providerResult = await sender.send({
            deviceToken: requiredString(normalized, 'deviceToken'),
            title: requiredString(normalized, 'title'),
            body: requiredString(normalized, 'bodyText'),
            deepLink:
              typeof normalized.deepLink === 'string'
                ? normalized.deepLink
                : null,
            type: messageType,
          });
          if (providerResult.outcome === 'rejected') {
            await this.kernel.finalizeDeterministicReject({
              ...owned,
              recipientRevision: owned.recipientRevision + 1,
              outcomeCode: 'apns_provider_rejected',
              errorCode: 'apns_provider_rejected',
            });
            throw new CommunicationDispatchError(
              'definitive',
              'apns_provider_rejected',
              'provider_rejected',
              'APNs rejected the notification',
            );
          }
          if (providerResult.outcome === 'unknown') {
            await this.markUnknownSafely(owned, 'apns_dispatch_uncertain');
            throw new CommunicationDispatchError(
              'unknown',
              'apns_dispatch_uncertain',
              'provider_outcome_unknown',
              'APNs delivery outcome is unknown',
            );
          }
          try {
            await this.kernel.finalizeAccepted({
              ...owned,
              recipientRevision: owned.recipientRevision + 1,
              outcomeCode: 'apns_provider_accepted',
              providerReference: providerResult.providerReference,
            });
          } catch {
            throw new CommunicationDispatchError(
              'unknown',
              'apns_acceptance_persistence_uncertain',
              'communication_outcome_unknown',
              'APNs accepted the notification but persistence is uncertain',
            );
          }
          return {
            value: {
              actionExecutionId: context.executionId,
              deliveryId: claim.recipient.id,
              status: 'accepted' as const,
              providerReference: providerResult.providerReference,
            },
            safeResult: {
              deliveryId: claim.recipient.id,
              status: 'accepted',
              providerReference: providerResult.providerReference,
            },
          };
        },
        reconcile: async (normalized, _preDispatch, context) => {
          if (!context || channel === 'apns') {
            return { outcome: 'STILL_UNKNOWN' as const };
          }
          const row = await this.findInboxItem(
            context.tenantId,
            requiredString(normalized, 'userId'),
            requiredString(normalized, 'messageType'),
            requiredString(normalized, 'sourceEventId'),
          );
          return row
            ? {
                outcome: 'PROVEN_SUCCEEDED' as const,
                safeResult: { deliveryId: row.id, status: 'delivered' },
              }
            : { outcome: 'PROVEN_NOT_EXECUTED' as const };
        },
        restore: (safeResult) => ({
          actionExecutionId: '',
          deliveryId: requiredString(safeResult, 'deliveryId'),
          status:
            safeResult.status === 'accepted'
              ? ('accepted' as const)
              : ('delivered' as const),
          ...(typeof safeResult.providerReference === 'string'
            ? { providerReference: safeResult.providerReference }
            : {}),
        }),
        classifyError: (error, phase) => this.classify(error, phase),
      },
    );
    if (this.webPush && !reminder) {
      // Primary acceptance is durable. A supplemental device's UNKNOWN outcome
      // stays in Communication Delivery and cannot undo/resend that acceptance.
      await this.webPush
        .deliverFromAcceptedReceipt(
          input.tenantId,
          receipt.execution.executionId,
        )
        .catch(() => undefined);
    }
    return {
      ...receipt.value,
      actionExecutionId: receipt.execution.executionId,
    };
  }

  private recipientIdentity(candidate: string | undefined, fallback: string) {
    if (candidate === undefined) return fallback;
    if (!/^[a-f0-9]{64}$/.test(candidate)) {
      throw new CommunicationDispatchError(
        'definitive',
        'invalid_verified_recipient_identity',
        'communication_contract',
        'Verified recipient identity must be an HMAC digest',
      );
    }
    return candidate;
  }

  /** Historical v1 receipts remain stored; only B35 may admit a new bulk. */
  deliverBulkCampaign(
    _input: BulkCampaignDeliveryInput,
  ): Promise<BulkDeliveryResult> {
    void _input;
    return Promise.reject(
      new CommunicationDispatchError(
        'definitive',
        'B35_CANONICAL_OWNER_REQUIRED',
        'communication_contract',
        'Use the immutable canonical Client bulk owner',
      ),
    );
  }

  async deliverPrivacyTelegram(
    input: PrivacyTelegramInput,
  ): Promise<DeliveryResult> {
    const receipt = await this.actionEngine.executeWithReceipt(
      {
        contract: ACTION_EXECUTION_REQUEST_CONTRACT,
        tenantId: input.tenantId,
        capability: PRIVACY_TELEGRAM_CAPABILITY,
        source: {
          type: 'legacy_bridge',
          occurrenceScope: `telegram:privacy:${input.sourceEventId}`,
          sourceRef: 'legacy.python.bot.command.privacy',
        },
        targetRef: `telegram:${input.telegramChatId}`,
        input: {
          telegramChatId: input.telegramChatId,
          sourceEventId: input.sourceEventId,
        },
        evidenceRefs: [`legacy-event:${input.sourceEventId}`],
        intentExpiresAt: new Date(Date.now() + DAY),
        callerIdempotency: {
          scope: 'communication:privacy:telegram',
          key: input.sourceEventId,
        },
      },
      {
        prepare: async (normalized, context) => {
          if (!this.bridgeToken || this.bridgeToken.length < 24) {
            throw new CommunicationDispatchError(
              'definitive',
              'privacy_executor_not_configured',
              'configuration_error',
              'Privacy executor is not configured',
            );
          }
          const telegramChatId = requiredString(normalized, 'telegramChatId');
          const sourceEventId = requiredString(normalized, 'sourceEventId');
          const envelope = await this.kernel.createEnvelope({
            contract: COMMUNICATION_ENVELOPE_CONTRACT,
            tenantId: context.tenantId,
            actionExecutionId: context.executionId,
            scope: 'SINGLE',
            channel: 'telegram',
            capabilityKey: PRIVACY_DELIVERY_CAPABILITY,
            campaignIdempotencyKey: `privacy:${sourceEventId}`,
            contentRef: 'template:privacy-policy.v1',
            contentIdentityHash: sha256('privacy-policy.v1'),
            expiresAt: new Date(Date.now() + DAY),
            recipients: [
              {
                recipientRef: telegramChatId,
                recipientKind: 'telegram_chat',
                eligibility: {
                  basis: 'explicit_privacy_command',
                  decision: 'ALLOW',
                  policyVersion: 1,
                  evidenceRef: `legacy:${sourceEventId}`,
                  evidenceHash: sha256(
                    context.tenantId,
                    sourceEventId,
                    telegramChatId,
                  ),
                  checkedAt: new Date(),
                },
              },
            ],
          });
          return { campaignId: envelope.id };
        },
        dispatch: async (normalized, _transportKey, context) => {
          const campaign = await this.requireCampaign(
            context.tenantId,
            context.executionId,
          );
          const existing =
            await this.prisma.marketingCampaignRecipient.findFirst({
              where: {
                tenantId: context.tenantId,
                campaignId: campaign.id,
                deliveryState: { in: ['ACCEPTED', 'DELIVERED'] },
              },
              select: { id: true, providerMessageId: true },
            });
          if (existing) {
            return {
              value: {
                actionExecutionId: context.executionId,
                deliveryId: existing.id,
                status: 'accepted' as const,
                providerReference: existing.providerMessageId ?? undefined,
              },
              safeResult: {
                deliveryId: existing.id,
                status: 'accepted',
                ...(existing.providerMessageId
                  ? { providerReference: existing.providerMessageId }
                  : {}),
              },
            };
          }
          const claim = await this.kernel.claimNext({
            tenantId: context.tenantId,
            workerId: `telegram:${context.executionId}`,
            campaignId: campaign.id,
          });
          if (!claim) {
            throw new CommunicationDispatchError(
              'unknown',
              'delivery_claim_unavailable',
              'communication_state_unknown',
              'Communication recipient could not be claimed',
            );
          }
          const owned = {
            tenantId: context.tenantId,
            campaignId: claim.campaign.id,
            recipientId: claim.recipient.id,
            attemptId: claim.attempt.id,
            leaseToken: claim.leaseToken,
            recipientRevision: claim.recipient.revision,
          };
          await this.kernel.markDispatchBoundary(owned);
          let response: Response;
          try {
            response = await fetch(this.privacyExecutorUrl, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'x-maya-inbox-bridge': this.bridgeToken,
              },
              body: JSON.stringify({
                telegram_chat_id: requiredString(normalized, 'telegramChatId'),
                source_event_id: requiredString(normalized, 'sourceEventId'),
              }),
              signal: AbortSignal.timeout(4_000),
            });
          } catch {
            await this.markUnknownSafely(owned, 'telegram_dispatch_uncertain');
            throw new CommunicationDispatchError(
              'unknown',
              'telegram_dispatch_uncertain',
              'provider_outcome_unknown',
              'Telegram delivery outcome is unknown',
            );
          }
          const responseBody = await this.safeJson(response);
          if (response.status >= 400 && response.status < 500) {
            await this.kernel.finalizeDeterministicReject({
              ...owned,
              recipientRevision: owned.recipientRevision + 1,
              outcomeCode: `executor_http_${response.status}`,
              errorCode: 'telegram_executor_rejected',
            });
            throw new CommunicationDispatchError(
              'definitive',
              'telegram_executor_rejected',
              'provider_rejected',
              'Telegram executor rejected the request',
            );
          }
          if (!response.ok) {
            await this.markUnknownSafely(owned, 'telegram_dispatch_uncertain');
            throw new CommunicationDispatchError(
              'unknown',
              'telegram_dispatch_uncertain',
              'provider_outcome_unknown',
              'Telegram delivery outcome is unknown',
            );
          }
          const messageId =
            typeof responseBody.message_id === 'string' ||
            typeof responseBody.message_id === 'number'
              ? String(responseBody.message_id)
              : '';
          if (!messageId) {
            await this.markUnknownSafely(owned, 'provider_reference_missing');
            throw new CommunicationDispatchError(
              'unknown',
              'provider_reference_missing',
              'provider_outcome_unknown',
              'Telegram provider reference is missing',
            );
          }
          try {
            await this.kernel.finalizeAccepted({
              ...owned,
              recipientRevision: owned.recipientRevision + 1,
              outcomeCode: 'telegram_provider_accepted',
              providerReference: messageId,
            });
          } catch {
            throw new CommunicationDispatchError(
              'unknown',
              'telegram_acceptance_persistence_uncertain',
              'communication_outcome_unknown',
              'Telegram delivery was accepted but persistence is uncertain',
            );
          }
          return {
            value: {
              actionExecutionId: context.executionId,
              deliveryId: claim.recipient.id,
              status: 'accepted' as const,
              providerReference: messageId,
            },
            safeResult: {
              deliveryId: claim.recipient.id,
              status: 'accepted',
              providerReference: messageId,
            },
          };
        },
        reconcile: () => Promise.resolve({ outcome: 'STILL_UNKNOWN' as const }),
        restore: (safeResult) => ({
          actionExecutionId: '',
          deliveryId: requiredString(safeResult, 'deliveryId'),
          status: 'accepted' as const,
          ...(typeof safeResult.providerReference === 'string'
            ? { providerReference: safeResult.providerReference }
            : {}),
        }),
        classifyError: (error, phase) => this.classify(error, phase),
      },
    );
    return {
      ...receipt.value,
      actionExecutionId: receipt.execution.executionId,
    };
  }

  private classify(
    error: unknown,
    phase: ActionRuntimePhase,
  ): ActionFailureClassification {
    if (error instanceof CommunicationDispatchError) {
      return {
        kind: error.classification,
        outcomeCode: error.outcomeCode,
        errorClass: error.errorClass,
      };
    }
    return {
      kind: phase === 'prepare' ? 'definitive' : 'unknown',
      outcomeCode:
        phase === 'prepare'
          ? 'communication_prepare_failed'
          : 'communication_dispatch_uncertain',
      errorClass:
        phase === 'prepare'
          ? 'communication_contract'
          : 'provider_outcome_unknown',
    };
  }

  private async requireCampaign(tenantId: string, executionId: string) {
    const campaign = await this.prisma.marketingCampaign.findFirst({
      where: { tenantId, actionExecutionId: executionId },
      select: { id: true },
    });
    if (!campaign) {
      throw new CommunicationDispatchError(
        'definitive',
        'communication_envelope_missing',
        'communication_contract',
        'Communication envelope is missing',
      );
    }
    return campaign;
  }

  private findInboxItem(
    tenantId: string,
    userId: string,
    messageType: string,
    sourceEventId: string,
  ) {
    return this.prisma.inboxItem.findUnique({
      where: {
        tenantId_userId_type_sourceEventId: {
          tenantId,
          userId,
          type: messageType,
          sourceEventId,
        },
      },
      select: { id: true },
    });
  }

  private async markUnknownSafely(
    owned: {
      tenantId: string;
      campaignId: string;
      recipientId: string;
      attemptId: string;
      leaseToken: string;
      recipientRevision: number;
    },
    errorCode: string,
  ): Promise<void> {
    try {
      await this.kernel.finalizeUnknown({
        ...owned,
        recipientRevision: owned.recipientRevision + 1,
        outcomeCode: 'provider_outcome_unknown',
        errorCode,
      });
    } catch {
      // The outer ActionExecution still becomes UNKNOWN. Never retry a send.
    }
  }

  private async safeJson(response: Response): Promise<Record<string, unknown>> {
    try {
      const value = (await response.json()) as unknown;
      return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
}
