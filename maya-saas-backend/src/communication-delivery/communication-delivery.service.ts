import { ExpenseReminderStore } from '../expense-intake/expense-reminder.store';
import { NativeFeedbackStore } from '../native-feedback/native-feedback.store';
import { TeamMessageStore } from '../team-communications/team-message.store';
import { OwnerReportStore } from '../owner-reports/owner-report.store';
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
import {
  COMMUNICATION_ENVELOPE_CONTRACT,
  type OwnedCommunicationAttemptV1,
} from './communication-delivery.contract';
import { CommunicationDeliveryKernel } from './communication-delivery.kernel';

const NEW_APPOINTMENT_CAPABILITY =
  'communication.transactional-single.new-appointment.execute.v1';
const PRIVACY_TELEGRAM_CAPABILITY =
  'communication.operational-single.privacy.execute.v1';
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
  | 'native_feedback_invitation'
  | 'native_feedback_response'
  | 'team_message'
  | 'weekly_expense_reminder'
  | 'wanted_slot_available'
  | 'new_appointment'
  | 'appointment_deleted'
  | 'appointment_cancelled'
  | 'appointment_rescheduled'
  | 'appointment_reassigned'
  | 'maya_task'
  | 'client_support_request';

type Package2SourceType =
  'authenticated_request' | 'scheduler' | 'webhook' | 'legacy_bridge';

const PACKAGE2_CAPABILITY_BY_TYPE: Record<Package2InboxType, string> = {
  native_feedback_invitation:
    'communication.native-feedback.invitation.execute.v1',
  native_feedback_response: 'communication.native-feedback.response.execute.v1',
  team_message: 'communication.team-message-notification.execute.v1',
  weekly_expense_reminder: 'communication.business-alerts.execute.v1',
  new_appointment: 'communication.business-alerts.execute.v1',
  appointment_deleted: 'communication.business-alerts.execute.v1',
  appointment_cancelled: 'communication.business-alerts.execute.v1',
  appointment_rescheduled: 'communication.business-alerts.execute.v1',
  appointment_reassigned: 'communication.business-alerts.execute.v1',
  maya_task: 'communication.business-alerts.execute.v1',
  client_support_request: 'communication.business-alerts.execute.v1',
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
    @Optional() private readonly ownerReports?: OwnerReportStore,
    @Optional() private readonly nativeFeedback?: NativeFeedbackStore,
    @Optional() private readonly teamMessages?: TeamMessageStore,
    @Optional() private readonly expenseReminders?: ExpenseReminderStore,
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
    const request: Parameters<ActionEngineRuntimeService['preview']>[0] = {
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
    };
    const preview = await this.actionEngine.preview(request);
    const historical = await this.prisma.actionExecution.findFirst({
      where: {
        tenantId: input.tenantId,
        identityFingerprint: preview.identityFingerprint,
        capability: NEW_APPOINTMENT_CAPABILITY,
      },
    });
    if (!historical || !['SUCCEEDED', 'UNKNOWN'].includes(historical.state))
      throw new Error('R06_LEGACY_NEW_APPOINTMENT_ADMISSION_RETIRED');
    const receipt = await this.actionEngine.executeWithReceipt(request, {
      prepare: () =>
        Promise.reject(
          new CommunicationDispatchError(
            'definitive',
            'legacy_admission_retired',
            'canonical_owner_required',
            'R06 legacy new delivery disabled',
          ),
        ),
      dispatch: () =>
        Promise.reject(
          new CommunicationDispatchError(
            'definitive',
            'legacy_admission_retired',
            'canonical_owner_required',
            'R06 legacy new delivery disabled',
          ),
        ),
      reconcile: async (normalized, _preDispatch, context) => {
        if (!context) return { outcome: 'STILL_UNKNOWN' as const };
        const row = await this.findInboxItem(
          context.tenantId,
          requiredString(normalized, 'userId'),
          'new_appointment',
          requiredString(normalized, 'sourceEventId'),
        );
        const resolved = await this.reconcileInboxReceipt(
          context.tenantId,
          context.executionId,
          row?.id,
        );
        return resolved && row
          ? {
              outcome: 'PROVEN_SUCCEEDED' as const,
              safeResult: { deliveryId: row.id, status: 'delivered' },
            }
          : { outcome: 'STILL_UNKNOWN' as const };
      },
      restore: (safeResult) => ({
        actionExecutionId: '',
        deliveryId: requiredString(safeResult, 'deliveryId'),
        status: 'delivered' as const,
      }),
      classifyError: (error, phase) => this.classify(error, phase),
    });
    return {
      ...receipt.value,
      actionExecutionId: receipt.execution.executionId,
    };
  }

  /** Only the durable owner root selects report content, principal and route. */
  async deliverOwnerReportSlot(
    tenantId: string,
    runId: string,
    slotKey: string,
  ) {
    if (!this.ownerReports)
      throw new Error('B36_OWNER_REPORT_FOUNDATION_REQUIRED');
    const dispatch = await this.ownerReports.dispatch(tenantId, runId, slotKey);
    const n = dispatch.request.input as Record<string, unknown>;
    const common = {
      tenantId,
      messageType:
        n.messageType === 'morning_brief'
          ? ('morning_brief' as const)
          : ('daily_report' as const),
      sourceType: 'scheduler' as const,
      sourceEventId: String(n.sourceEventId),
      title: String(n.title),
      bodyText: String(n.bodyText),
      recipientIdentityRef: String(n.recipientIdentityRef),
    };
    if (n.channel === 'telegram')
      return this.deliverPackage2TelegramAccepted(
        { ...common, telegramChatId: String(n.telegramChatId) },
        dispatch,
      );
    if (n.channel !== 'inbox' && n.channel !== 'apns')
      throw new Error('B36_REPORT_ROUTE_INVALID');
    return this.deliverPackage2Single(
      {
        ...common,
        userId: String(n.userId),
        deepLink: String(n.deepLink),
        payload: n.payload as Record<string, unknown>,
        ...(n.channel === 'apns' ? { deviceToken: String(n.deviceToken) } : {}),
      },
      n.channel,
      dispatch,
    );
  }
  async deliverNativeFeedbackSlot(
    tenantId: string,
    requestId: string,
    revisionId: string | null,
    slotKey: string,
  ) {
    if (!this.nativeFeedback)
      throw new Error('R08_NATIVE_FEEDBACK_OWNER_REQUIRED');
    const dispatch = await this.nativeFeedback.dispatch(
      tenantId,
      requestId,
      revisionId,
      slotKey,
    );
    const n = dispatch.request.input as Record<string, unknown>;
    if (n.channel === 'web_push') {
      if (!this.webPush) throw new Error('Canonical Web Push unavailable');
      return this.webPush.deliverNativeFeedback(dispatch);
    }
    const common = {
      tenantId,
      sourceType: 'scheduler' as const,
      sourceEventId: String(n.sourceEventId),
      title: String(n.title),
      bodyText: String(n.bodyText),
      recipientIdentityRef: String(n.recipientIdentityRef),
    };
    if (n.channel === 'telegram')
      return this.deliverPackage2TelegramAccepted(
        {
          ...common,
          messageType: 'native_feedback_invitation',
          telegramChatId: String(n.telegramChatId),
          buttons: telegramButtons(n.buttons),
        },
        dispatch,
      );
    if (n.channel !== 'inbox') throw new Error('R08_FIXED_ROUTE_REQUIRED');
    return this.deliverPackage2Single(
      {
        ...common,
        messageType: 'native_feedback_response',
        userId: String(n.userId),
        deepLink: String(n.deepLink),
        payload: n.payload as Record<string, unknown>,
      },
      'inbox',
      dispatch,
    );
  }
  async deliverTeamMessageSlot(
    tenantId: string,
    messageId: string,
    slotKey: string,
  ) {
    if (!this.teamMessages) throw new Error('R12_TEAM_MESSAGE_OWNER_REQUIRED');
    const dispatch = await this.teamMessages.dispatch(
        tenantId,
        messageId,
        slotKey,
      ),
      n = dispatch.request.input as Record<string, unknown>;
    if (n.channel !== 'inbox' || !dispatch.request.teamMessageSlot)
      throw new Error('R12_FIXED_INBOX_SLOT_REQUIRED');
    return this.deliverPackage2Single(
      {
        tenantId,
        sourceType: 'scheduler',
        sourceEventId: String(n.sourceEventId),
        messageType: 'team_message',
        userId: String(n.userId),
        title: String(n.title),
        bodyText: String(n.bodyText),
        deepLink: String(n.deepLink),
        payload: n.payload as Record<string, unknown>,
        recipientIdentityRef: String(n.recipientIdentityRef),
      },
      'inbox',
      dispatch,
    );
  }
  /** R06 finite root already owns occurrence, audience and atomic A11/A13 slots. */
  async deliverOperationalAlert(dispatch: ReminderDispatch) {
    const request = dispatch.request,
      n = request.input as Record<string, unknown>;
    const binding = request.operationalAlertSlot;
    if (
      !binding ||
      n.channel !== 'inbox' ||
      !['shift_reminder', 'owner_alert'].includes(String(n.messageType))
    )
      throw new Error('R06_OPERATIONAL_ALERT_RUN_REQUIRED');
    const existing = await this.prisma.actionExecution.findFirst({
      where: {
        tenantId: request.tenantId,
        operationalAlertRunId: binding.runId,
        operationalAlertSlotKey: binding.slotKey,
        capability: request.capability,
      },
    });
    if (!existing) throw new Error('R06_DELIVERY_BEFORE_ADMISSION');
    return this.deliverPackage2Single(
      {
        tenantId: request.tenantId,
        userId: String(n.userId),
        messageType: n.messageType as 'shift_reminder' | 'owner_alert',
        sourceType: 'scheduler',
        sourceEventId: String(n.sourceEventId),
        title: String(n.title),
        bodyText: String(n.bodyText),
        deepLink: String(n.deepLink),
        payload: n.payload as Record<string, unknown>,
        recipientIdentityRef: String(n.recipientIdentityRef),
      },
      'inbox',
      dispatch,
    );
  }
  async deliverCanonicalProjection(dispatch: ReminderDispatch) {
    const request = dispatch.request,
      n = request.input as Record<string, unknown>,
      plan = n.producerPlan as Record<string, unknown> | undefined;
    if (
      plan?.contract !== 'maya.canonical-inbox-projection/1' ||
      ![
        'communication.business-alerts.execute.v1',
        NEW_APPOINTMENT_CAPABILITY,
      ].includes(request.capability) ||
      !['inbox', 'apns'].includes(String(n.channel))
    )
      throw new Error('R06_CANONICAL_PRODUCER_REQUIRED');
    const primarySource = request.source.sourceRef?.replace(
      /:apns:[a-f0-9]{64}$/,
      ':inbox',
    );
    const primary = await this.prisma.actionExecution.findFirst({
      where: {
        tenantId: request.tenantId,
        capability:
          n.messageType === 'new_appointment'
            ? NEW_APPOINTMENT_CAPABILITY
            : 'communication.business-alerts.execute.v1',
        sourceRef: primarySource,
      },
    });
    if (!primary || (n.channel === 'apns' && primary.state !== 'SUCCEEDED'))
      throw new Error('R06_CANONICAL_PRIMARY_ADMISSION_REQUIRED');
    return this.deliverPackage2Single(
      {
        tenantId: request.tenantId,
        userId: String(n.userId),
        messageType: n.messageType as Package2InboxType,
        sourceType: 'scheduler',
        sourceEventId: String(n.sourceEventId),
        title: String(n.title),
        bodyText: String(n.bodyText),
        deepLink: String(n.deepLink),
        payload: n.payload as Record<string, unknown>,
        ...(n.channel === 'apns' ? { deviceToken: String(n.deviceToken) } : {}),
      },
      n.channel as 'inbox' | 'apns',
      dispatch,
    );
  }
  private async authorizeSingle(
    dispatch?: ReminderDispatch,
    owned?: OwnedCommunicationAttemptV1,
    authorizeOwner?: () => Promise<void>,
  ) {
    try {
      await authorizeOwner?.();
      await dispatch?.authorize();
    } catch (error) {
      if (
        !dispatch?.request.ownerReportSlot &&
        !dispatch?.request.operationalAlertSlot &&
        !dispatch?.request.nativeFeedbackSlot &&
        !dispatch?.request.teamMessageSlot &&
        !dispatch?.request.expenseReminderSlot &&
        !(dispatch?.request.input as Record<string, unknown> | undefined)
          ?.producerPlan &&
        !authorizeOwner
      )
        throw error;
      if (owned)
        await this.kernel.finalizePreDispatchFailure({
          ...owned,
          outcomeCode: 'owner_report_authority_denied',
          errorCode: 'owner_report_authority_denied',
        });
      throw new CommunicationDispatchError(
        'definitive',
        'owner_report_authority_denied',
        'canonical_report_authority',
        'Report authority/policy could not be verified before delivery',
      );
    }
  }

  async deliverExpenseReminderSlot(
    tenantId: string,
    runId: string,
    slotKey: string,
  ) {
    if (!this.expenseReminders)
      throw new Error('R13_CANONICAL_REMINDER_OWNER_REQUIRED');
    const dispatch = await this.expenseReminders.dispatch(
        tenantId,
        runId,
        slotKey,
      ),
      n = dispatch.request.input as Record<string, unknown>;
    return this.deliverPackage2TelegramAccepted(
      {
        tenantId,
        sourceType: 'scheduler',
        sourceEventId: String(n.sourceEventId),
        messageType: 'weekly_expense_reminder',
        telegramChatId: String(n.telegramChatId),
        title: String(n.title),
        bodyText: String(n.bodyText),
        buttons: telegramButtons(n.buttons),
        recipientIdentityRef: String(n.recipientIdentityRef),
      },
      dispatch,
    );
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

  deliverPackage2Inbox(
    input: Package2SingleInput,
    authorizeOwner?: () => Promise<void>,
  ): Promise<DeliveryResult> {
    if (
      input.messageType !== 'wanted_slot_available' ||
      !authorizeOwner ||
      !input.sourceEventId.startsWith('wanted-slot-delivery:')
    )
      throw new Error('R06_CANONICAL_PRODUCER_REQUIRED');
    return this.deliverPackage2Single(
      input,
      'inbox',
      undefined,
      authorizeOwner,
    );
  }
  deliverPackage2Apns(
    _input: Package2SingleInput & { deviceToken: string },
  ): Promise<DeliveryResult> {
    void _input;
    return Promise.reject(new Error('R06_CANONICAL_PRODUCER_REQUIRED'));
  }
  async deliverPackage2Telegram(
    input: Package2TelegramInput,
    reminder?: ReminderDispatch,
    authorizeOwner?: () => Promise<void>,
  ): Promise<DeliveryResult> {
    if (
      !reminder &&
      (input.messageType !== 'wanted_slot_available' ||
        !authorizeOwner ||
        !input.sourceEventId.startsWith('wanted-slot-delivery:'))
    )
      throw new Error('R06_CANONICAL_PRODUCER_REQUIRED');
    return this.deliverPackage2TelegramAccepted(
      input,
      reminder,
      authorizeOwner,
    );
  }

  private async deliverPackage2TelegramAccepted(
    input: Package2TelegramInput,
    reminder?: ReminderDispatch,
    authorizeOwner?: () => Promise<void>,
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
          await this.authorizeSingle(reminder, undefined, authorizeOwner);
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
            campaignIdempotencyKey: reminder?.request.expenseReminderSlot
              ? `expense-reminder:${sha256(context.tenantId, reminder.request.expenseReminderSlot.runId, reminder.request.expenseReminderSlot.slotKey)}`
              : reminder?.request.teamMessageSlot
                ? `team-message:${sha256(context.tenantId, reminder.request.teamMessageSlot.messageId, reminder.request.teamMessageSlot.slotKey)}`
                : reminder?.request.nativeFeedbackSlot
                  ? `native-feedback:${sha256(context.tenantId, reminder.request.nativeFeedbackSlot.requestId, reminder.request.nativeFeedbackSlot.slotKey)}`
                  : reminder?.request.ownerReportSlot
                    ? `owner-report:${sha256(context.tenantId, reminder.request.ownerReportSlot.runId, reminder.request.ownerReportSlot.slotKey)}`
                    : `package2:${input.messageType}:telegram:${sourceEventId}:${durableRecipientRef}`,
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
          await this.authorizeSingle(reminder, owned, authorizeOwner);
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
    authorizeOwner?: () => Promise<void>,
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
          await this.authorizeSingle(reminder, undefined, authorizeOwner);
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
            campaignIdempotencyKey: reminder?.request.expenseReminderSlot
              ? `expense-reminder:${sha256(context.tenantId, reminder.request.expenseReminderSlot.runId, reminder.request.expenseReminderSlot.slotKey)}`
              : reminder?.request.teamMessageSlot
                ? `team-message:${sha256(context.tenantId, reminder.request.teamMessageSlot.messageId, reminder.request.teamMessageSlot.slotKey)}`
                : reminder?.request.nativeFeedbackSlot
                  ? `native-feedback:${sha256(context.tenantId, reminder.request.nativeFeedbackSlot.requestId, reminder.request.nativeFeedbackSlot.slotKey)}`
                  : reminder?.request.ownerReportSlot
                    ? `owner-report:${sha256(context.tenantId, reminder.request.ownerReportSlot.runId, reminder.request.ownerReportSlot.slotKey)}`
                    : (
                          reminder?.request.input as
                            Record<string, unknown> | undefined
                        )?.producerPlan
                      ? `projection:${sha256(context.tenantId, context.executionId)}`
                      : reminder?.request.operationalAlertSlot
                        ? `operational-alert:${sha256(context.tenantId, reminder.request.operationalAlertSlot.runId, reminder.request.operationalAlertSlot.slotKey)}`
                        : `package2:${messageType}:${channel}:${sourceEventId}:${durableRecipientRef}${deviceIdentity ? `:${deviceIdentity}` : ''}`,
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
          await this.authorizeSingle(reminder, owned, authorizeOwner);
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
                  ...(['maya_task', 'client_support_request'].includes(
                    messageType,
                  ) && normalized.producerPlan
                    ? {
                        operationalWorkItemId: String(
                          payload?.operational_work_item_id,
                        ),
                      }
                    : {}),
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
          const resolved = await this.reconcileInboxReceipt(
            context.tenantId,
            context.executionId,
            row?.id,
          );
          return resolved && row
            ? {
                outcome: 'PROVEN_SUCCEEDED' as const,
                safeResult: { deliveryId: row.id, status: 'delivered' },
              }
            : { outcome: 'STILL_UNKNOWN' as const };
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

  /** A local row proves its exact delivery; absence alone cannot prove that an
   * earlier worker did not commit late. Resolve CD and AE from the same receipt. */
  private async reconcileInboxReceipt(
    tenantId: string,
    executionId: string,
    deliveryId?: string,
  ) {
    const campaign = await this.prisma.marketingCampaign.findFirst({
      where: { tenantId, actionExecutionId: executionId, channel: 'inbox' },
      include: { recipients: true },
    });
    if (!campaign || campaign.recipients.length !== 1) return false;
    const recipient = campaign.recipients[0];
    if (recipient.deliveryState === 'DELIVERED') return !!deliveryId;
    if (
      recipient.deliveryState !== 'UNKNOWN' ||
      recipient.reconciliationState !== 'REQUIRED'
    )
      return false;
    const claim = await this.kernel.claimReconciliation({
      tenantId,
      campaignId: campaign.id,
      recipientId: recipient.id,
      workerId: 'canonical-inbox-reconciliation',
    });
    await this.kernel.finalizeReconciliation({
      tenantId,
      campaignId: campaign.id,
      recipientId: recipient.id,
      attemptId: claim.attempt.id,
      leaseToken: claim.leaseToken,
      recipientRevision: claim.recipient.revision,
      outcome: deliveryId ? 'PROVEN_DELIVERED' : 'STILL_UNKNOWN',
      ...(deliveryId ? { providerReference: deliveryId } : {}),
      outcomeCode: deliveryId
        ? 'canonical_inbox_receipt_found'
        : 'canonical_inbox_receipt_unresolved',
    });
    return !!deliveryId;
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
