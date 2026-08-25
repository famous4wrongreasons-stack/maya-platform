import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  type ActionFailureClassification,
  type ActionRuntimePhase,
} from '../action-engine';
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
const DAY = 24 * 60 * 60 * 1_000;

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

interface DeliveryResult {
  actionExecutionId: string;
  deliveryId: string;
  status: 'delivered' | 'accepted';
  providerReference?: string;
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

@Injectable()
export class CommunicationDeliveryService {
  private readonly kernel: CommunicationDeliveryKernel;
  private readonly privacyExecutorUrl: string;
  private readonly bridgeToken: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly actionEngine: ActionEngineRuntimeService,
    config: ConfigService,
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
    sourceEventId: string,
  ) {
    return this.prisma.inboxItem.findUnique({
      where: {
        tenantId_userId_type_sourceEventId: {
          tenantId,
          userId,
          type: 'new_appointment',
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
