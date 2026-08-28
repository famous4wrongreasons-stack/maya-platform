import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';

import {
  CommunicationDeliveryService,
  type Package2InboxType,
} from '../communication-delivery';
import { CommunicationShadowService } from '../communication-shadow';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { sendInboxApns } from './apns-push';
import type {
  DeliverPrivacyTelegramDto,
  IngestInboxItemDto,
  ObserveLegacyTelegramDto,
  RegisterPushTokenDto,
} from './dto/inbox.dto';

/**
 * Арендаторы, которым мост имеет право писать.
 *
 * Тот же набор, что у штатного резолвера: приостановленный и отменённый салон
 * не должен получать ни карточек, ни пушей.
 */
const OWNER_ROLES: UserRole[] = [
  UserRole.tenant_owner,
  UserRole.business_owner,
  UserRole.tenant_admin,
  UserRole.administrator,
  UserRole.platform_owner,
];

/** Appointment ops that belong to a specific master chair. */
const STAFF_SCOPED_INBOX_TYPES = new Set<string>([
  'new_appointment',
  'appointment_deleted',
  'appointment_cancelled',
  'appointment_rescheduled',
  'appointment_reassigned',
  'shift_reminder',
]);

const PACKAGE2_SINGLE_TYPES = new Set<IngestInboxItemDto['type']>([
  'appointment_reminder',
  'shift_reminder',
  'daily_report',
  'morning_brief',
  'growth_plan',
  'hanging_lead',
  'owner_alert',
  'birthday_alert',
  'review_alert',
]);

function isPackage2SingleType(
  type: IngestInboxItemDto['type'],
): type is Package2InboxType {
  return PACKAGE2_SINGLE_TYPES.has(type);
}

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly bridgeSource: BridgeSourceService,
    @Optional()
    private readonly communicationShadow?: CommunicationShadowService,
    @Optional()
    private readonly communicationDelivery?: CommunicationDeliveryService,
  ) {}

  assertBridgeToken(header: string | undefined): void {
    // Сравнение за постоянное время — общее для обоих мостов. Раньше здесь
    // стояло `!==`, а у соседнего входа с ТЕМ ЖЕ секретом — timingSafeEqual.
    this.bridgeSource.assertBridgeSecret(header, 'MAYA_INBOX_BRIDGE_TOKEN', {
      disabled: 'inbox_bridge_disabled',
      unauthorized: 'inbox_bridge_unauthorized',
    });
  }

  async ingest(dto: IngestInboxItemDto) {
    // 🔴 Арендатор приходит из ТЕЛА запроса под общим платформенным токеном, и
    // статус здесь не проверялся — в отличие от штатного резолвера. Держатель
    // токена мог писать карточки и слать пуши в приостановленного или
    // отменённого арендатора. Пер-арендный токен — это модель самого моста к
    // старому боту, она относится к главе 2/7; здесь закрываем ровно то, что
    // отличает этот путь от штатного.
    const tenant = await this.bridgeSource.resolveTenant(
      {
        provider: dto.provider,
        externalCompanyId: dto.external_company_id,
        tenantSlug: dto.tenant_slug,
      },
      'inbox_tenant_not_found',
    );

    // Публикация идёт в контексте найденного арендатора: раньше вся ветка
    // работала вне контекста вообще, и любой сервис, который начнёт сверять
    // принадлежность, молча получил бы отказ на ночном мосту.
    return this.tenantContext.runAsSystemTenant(tenant.tenantId, () =>
      this.publishForTenant(tenant.tenantId, {
        type: dto.type,
        sourceEventId: dto.source_event_id,
        title: dto.title,
        bodyText: dto.body_text,
        payload: dto.payload,
        deepLink: dto.deep_link,
        userIds: dto.user_ids,
        telegramChatIds: dto.telegram_chat_ids,
        telegramParseMode: dto.telegram_parse_mode,
        telegramButtons: dto.telegram_buttons,
        fanoutOwners: dto.fanout_owners,
        shadowSourceType: 'legacy_bridge',
      }),
    );
  }

  async observeLegacyTelegram(dto: ObserveLegacyTelegramDto) {
    const tenant = await this.bridgeSource.resolveTenant(
      {
        provider: dto.provider,
        externalCompanyId: dto.external_company_id,
        tenantSlug: dto.tenant_slug,
      },
      'inbox_tenant_not_found',
    );
    return this.tenantContext.runAsSystemTenant(tenant.tenantId, async () => {
      if (!this.communicationShadow) {
        return { planned: false, external_messages_sent: 0 };
      }
      const identity = await this.prisma.authIdentity.findFirst({
        where: {
          tenantId: tenant.tenantId,
          provider: 'telegram',
          providerUserId: dto.telegram_chat_id,
          user: { status: 'active' },
        },
        select: { userId: true },
      });
      const result = await this.communicationShadow.plan({
        tenantId: tenant.tenantId,
        sourceType: 'legacy_bridge',
        producerRef: 'legacy.python.telegram.send_message',
        logicalRef: dto.source_event_id,
        taxonomy: 'operational_single',
        channel: 'telegram',
        templateRef: dto.template_ref || 'legacy.telegram.text',
        contentIdentityParts: [dto.body_text],
        recipients: [
          {
            recipientRef: dto.telegram_chat_id,
            recipientKind: 'telegram_chat',
            internalUserId: identity?.userId,
            eligibility: {
              basis: 'legacy_executor_selected_recipient',
              decision: 'ALLOW',
              policyVersion: 1,
              evidenceRef: `legacy:${dto.source_event_id}`,
              evidenceIdentityParts: [
                tenant.tenantId,
                dto.source_event_id,
                dto.telegram_chat_id,
              ],
            },
          },
        ],
        eligibilityPolicyRef: 'legacy.telegram.production-recipient.v1',
        legacyApprovalRequirement: 'SYSTEM_POLICY',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
      });
      return {
        planned: true,
        action_execution_id: result.actionExecutionId,
        delivery_id: result.recipientIds[0],
        external_messages_sent: 0,
      };
    });
  }

  async deliverPrivacyTelegram(dto: DeliverPrivacyTelegramDto) {
    const tenant = await this.bridgeSource.resolveTenant(
      {
        provider: dto.provider,
        externalCompanyId: dto.external_company_id,
        tenantSlug: dto.tenant_slug,
      },
      'inbox_tenant_not_found',
    );
    if (!this.communicationDelivery) {
      throw new Error('communication_delivery_unavailable');
    }
    return this.tenantContext.runAsSystemTenant(tenant.tenantId, async () => {
      const result = await this.communicationDelivery!.deliverPrivacyTelegram({
        tenantId: tenant.tenantId,
        telegramChatId: dto.telegram_chat_id,
        sourceEventId: dto.source_event_id,
      });
      return {
        delivered: true,
        action_execution_id: result.actionExecutionId,
        delivery_id: result.deliveryId,
        status: result.status,
      };
    });
  }

  /**
   * In-process publish for Nest schedulers (no bridge token / slug required).
   * Message of record for Maya OS chat; APNs announces when tokens exist.
   */
  async publishForTenant(
    tenantId: string,
    input: {
      type: IngestInboxItemDto['type'];
      sourceEventId: string;
      title: string;
      bodyText: string;
      payload?: Record<string, unknown>;
      deepLink?: string | null;
      userIds?: string[];
      telegramChatIds?: string[];
      telegramParseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
      telegramButtons?: Array<{
        text: string;
        callback_data?: string;
        url?: string;
      }>;
      fanoutOwners?: boolean;
      shadowSourceType?:
        'authenticated_request' | 'scheduler' | 'webhook' | 'legacy_bridge';
    },
  ) {
    const dto: IngestInboxItemDto = {
      tenant_slug: '_internal',
      type: input.type,
      source_event_id: input.sourceEventId,
      title: input.title,
      body_text: input.bodyText,
      payload: input.payload,
      deep_link: input.deepLink ?? undefined,
      user_ids: input.userIds,
      telegram_chat_ids: input.telegramChatIds,
      telegram_parse_mode: input.telegramParseMode,
      telegram_buttons: input.telegramButtons,
      fanout_owners: input.fanoutOwners,
    };

    const userIds = await this.resolveRecipients(tenantId, dto);
    const telegramChatIds = [
      ...new Set(
        (input.telegramChatIds ?? [])
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    if (userIds.length === 0 && telegramChatIds.length === 0) {
      this.logger.warn(
        `inbox publish skipped: no recipients for ${input.type}/${input.sourceEventId} tenant=${tenantId}`,
      );
      return { stored: 0, user_ids: [] as string[] };
    }

    const provenNewAppointment =
      input.type === 'new_appointment' &&
      input.shadowSourceType === 'legacy_bridge';
    const package2MessageType = isPackage2SingleType(input.type)
      ? input.type
      : null;
    const package2OwnsDelivery = package2MessageType !== null;
    const actionEngineOwnsInbox = provenNewAppointment || package2OwnsDelivery;

    if (actionEngineOwnsInbox && !this.communicationDelivery) {
      throw new Error('communication_delivery_unavailable');
    }

    if (input.type !== 'marketing_campaign' && !actionEngineOwnsInbox) {
      await Promise.all(
        userIds.map((userId) =>
          this.planSingleSafely({
            tenantId,
            sourceType:
              input.shadowSourceType ?? this.shadowSourceForType(input.type),
            producerRef: `inbox.${input.type}`,
            logicalRef: `${input.type}:${input.sourceEventId}:inbox:${userId}`,
            taxonomy: this.shadowTaxonomyForType(input.type),
            channel: 'inbox',
            templateRef: `inbox.${input.type}`,
            contentIdentityParts: [
              input.type,
              input.title,
              input.bodyText,
              input.deepLink ?? '',
            ],
            recipientRef: userId,
            recipientKind: 'internal_user',
            internalUserId: userId,
            eligibilityPolicyRef: 'inbox.server-recipient-resolution.v1',
            legacyApprovalRequirement:
              input.type === 'maya_task' ? 'OWNER_CONFIRMED' : 'SYSTEM_POLICY',
          }),
        ),
      );
    }

    const package2Tokens = package2OwnsDelivery
      ? await this.prisma.devicePushToken.findMany({
          where: { tenantId, userId: { in: userIds } },
          select: { userId: true, token: true },
        })
      : [];
    const tokensByUser = new Map<string, string[]>();
    for (const token of package2Tokens) {
      const current = tokensByUser.get(token.userId) ?? [];
      current.push(token.token);
      tokensByUser.set(token.userId, current);
    }

    let telegramDelivered = 0;
    if (package2OwnsDelivery) {
      const telegramButtons = (input.telegramButtons ?? []).map((button) => {
        const callbackData = button.callback_data?.trim();
        const url = button.url?.trim();
        if (Boolean(callbackData) === Boolean(url)) {
          throw new Error('invalid_telegram_button_action');
        }
        return {
          text: button.text.trim(),
          ...(callbackData ? { callbackData } : {}),
          ...(url ? { url } : {}),
        };
      });
      for (const telegramChatId of telegramChatIds) {
        await this.communicationDelivery!.deliverPackage2Telegram({
          tenantId,
          telegramChatId,
          messageType: package2MessageType,
          sourceType:
            input.shadowSourceType ?? this.shadowSourceForType(input.type),
          sourceEventId: input.sourceEventId,
          title: input.title,
          bodyText: input.bodyText,
          ...(input.telegramParseMode
            ? { parseMode: input.telegramParseMode }
            : {}),
          ...(telegramButtons.length ? { buttons: telegramButtons } : {}),
        });
        telegramDelivered += 1;
      }
    }

    let stored = 0;
    for (const userId of userIds) {
      if (provenNewAppointment) {
        await this.communicationDelivery!.deliverNewAppointmentInbox({
          tenantId,
          userId,
          sourceEventId: input.sourceEventId,
          title: input.title,
          bodyText: input.bodyText,
          deepLink: input.deepLink,
          payload: input.payload,
        });
        stored += 1;
        continue;
      }
      if (package2OwnsDelivery) {
        const deliveryInput = {
          tenantId,
          userId,
          messageType: package2MessageType,
          sourceType:
            input.shadowSourceType ?? this.shadowSourceForType(input.type),
          sourceEventId: input.sourceEventId,
          title: input.title,
          bodyText: input.bodyText,
          deepLink: input.deepLink,
          payload: input.payload,
        };
        await this.communicationDelivery!.deliverPackage2Inbox(deliveryInput);
        for (const deviceToken of tokensByUser.get(userId) ?? []) {
          await this.communicationDelivery!.deliverPackage2Apns({
            ...deliveryInput,
            deviceToken,
          });
        }
        stored += 1;
        continue;
      }
      const row = await this.prisma.inboxItem.upsert({
        where: {
          tenantId_userId_type_sourceEventId: {
            tenantId,
            userId,
            type: input.type,
            sourceEventId: input.sourceEventId,
          },
        },
        create: {
          tenantId,
          userId,
          type: input.type,
          sourceEventId: input.sourceEventId,
          title: input.title.slice(0, 160),
          bodyText: input.bodyText.slice(0, 12000),
          payloadJson:
            input.payload === undefined
              ? undefined
              : (input.payload as Prisma.InputJsonValue),
          deepLink: input.deepLink?.slice(0, 400) || null,
        },
        update: {
          title: input.title.slice(0, 160),
          bodyText: input.bodyText.slice(0, 12000),
          payloadJson:
            input.payload === undefined
              ? undefined
              : (input.payload as Prisma.InputJsonValue),
          deepLink: input.deepLink?.slice(0, 400) || null,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (row.id) stored += 1;
    }

    if (
      input.type === 'appointment_cancelled' ||
      input.type === 'appointment_deleted'
    ) {
      await this.softDeleteRelatedAppointmentCards(tenantId, input.payload);
    }

    if (!package2OwnsDelivery) {
      void this.announcePush(tenantId, userIds, dto).catch((error) => {
        this.logger.warn(
          `inbox push announce failed: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      });
    }

    return {
      stored,
      user_ids: userIds,
      telegram_delivered: telegramDelivered,
    };
  }

  /**
   * When a booking is cancelled, hide the earlier «Новая запись» card for the
   * same YClients/Nest record so the chat does not keep a live booking ghost.
   */
  private async softDeleteRelatedAppointmentCards(
    tenantId: string,
    payload: Record<string, unknown> | undefined,
  ): Promise<void> {
    const recordId = payload?.record_id ?? payload?.appointment_id;
    const recordKey = this.scalarIdentifier(recordId);
    if (!recordKey) return;
    const related = await this.prisma.inboxItem.findMany({
      where: {
        tenantId,
        deletedAt: null,
        type: {
          in: [
            'new_appointment',
            'appointment_rescheduled',
            'appointment_reassigned',
          ],
        },
      },
      select: { id: true, payloadJson: true },
      take: 200,
    });
    const ids = related
      .filter((row) => {
        const data =
          row.payloadJson &&
          typeof row.payloadJson === 'object' &&
          !Array.isArray(row.payloadJson)
            ? (row.payloadJson as Record<string, unknown>)
            : {};
        const candidates = [data.record_id, data.appointment_id];
        return candidates.some(
          (value) => this.scalarIdentifier(value) === recordKey,
        );
      })
      .map((row) => row.id);
    if (!ids.length) return;
    await this.prisma.inboxItem.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: new Date() },
    });
    this.logger.log(
      `inbox soft-deleted ${ids.length} related card(s) for cancelled record=${recordKey}`,
    );
  }

  async hasSourceEvent(
    tenantId: string,
    type: string,
    sourceEventId: string,
  ): Promise<boolean> {
    const row = await this.prisma.inboxItem.findFirst({
      where: { tenantId, type, sourceEventId, deletedAt: null },
      select: { id: true },
    });
    return Boolean(row);
  }

  async listForUser(tenantId: string, userId: string, limit = 50) {
    const take = Math.min(100, Math.max(1, limit));
    const rows = await this.prisma.inboxItem.findMany({
      where: {
        tenantId,
        userId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        type: row.type,
        source_event_id: row.sourceEventId,
        title: row.title,
        body_text: row.bodyText,
        payload: row.payloadJson,
        deep_link: row.deepLink,
        created_at: row.createdAt.toISOString(),
        read_at: row.readAt?.toISOString() ?? null,
      })),
    };
  }

  async markRead(tenantId: string, userId: string, itemId: string) {
    await this.prisma.inboxItem.updateMany({
      where: { id: itemId, tenantId, userId, deletedAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async registerDevice(
    tenantId: string,
    userId: string,
    dto: RegisterPushTokenDto,
  ) {
    await this.prisma.devicePushToken.upsert({
      where: {
        tenantId_token: {
          tenantId,
          token: dto.token,
        },
      },
      create: {
        tenantId,
        userId,
        platform: dto.platform,
        token: dto.token,
      },
      update: {
        userId,
        platform: dto.platform,
      },
    });
    return { ok: true };
  }

  private eventStaffIds(payload?: Record<string, unknown>): string[] {
    if (!payload) return [];
    const ids = new Set<string>();
    for (const key of [
      'staff_id',
      'staff_external_id',
      'new_staff_id',
      'old_staff_id',
    ]) {
      const value = this.scalarIdentifier(payload[key]);
      if (value) ids.add(value);
    }
    return [...ids].filter(Boolean);
  }

  private scalarIdentifier(value: unknown): string | null {
    if (typeof value === 'string') {
      return value.trim() || null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return null;
  }

  private isStaffScopedType(
    type: string,
    payload?: Record<string, unknown>,
  ): boolean {
    if (STAFF_SCOPED_INBOX_TYPES.has(type)) return true;
    // Service-change alerts carry staff_id and should not spam owner-masters
    // on other chairs.
    return type === 'owner_alert' && this.eventStaffIds(payload).length > 0;
  }

  private async resolveRecipients(
    tenantId: string,
    dto: IngestInboxItemDto,
  ): Promise<string[]> {
    const ids = new Set<string>();
    for (const raw of dto.user_ids || []) {
      if (typeof raw === 'string' && raw.trim()) ids.add(raw.trim());
    }

    const telegramIds = (dto.telegram_chat_ids || [])
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    if (telegramIds.length > 0) {
      const identities = await this.prisma.authIdentity.findMany({
        where: {
          tenantId,
          provider: 'telegram',
          providerUserId: { in: telegramIds },
        },
        select: { userId: true },
      });
      for (const identity of identities) ids.add(identity.userId);
    }

    const staffIds = this.eventStaffIds(dto.payload);
    const staffScoped = this.isStaffScopedType(dto.type, dto.payload);

    // Always deliver to the linked Nest user for the event's CRM staff chair(s).
    // This is how owner-master gets «мои записи» without salon-wide spam.
    if (staffScoped && staffIds.length > 0) {
      const staffLinks = await this.prisma.crmStaffAccess.findMany({
        where: {
          tenantId,
          externalStaffId: { in: staffIds },
          userId: { not: null },
          status: 'active',
        },
        select: { userId: true },
      });
      for (const link of staffLinks) {
        if (link.userId) ids.add(link.userId);
      }
    }

    // fanout_owners !== false (default): include owners/admins.
    // Owner who is also a CRM master only gets staff-scoped events for THEIR chair.
    // Pure owners (no CrmStaffAccess) still see salon-wide ops.
    const fanout = dto.fanout_owners !== false;
    if (fanout) {
      const owners = await this.prisma.membership.findMany({
        where: {
          tenantId,
          status: 'active',
          role: { in: OWNER_ROLES },
        },
        select: { userId: true },
      });

      if (staffScoped && staffIds.length > 0) {
        const ownerIds = owners.map((owner) => owner.userId);
        const ownerStaff = ownerIds.length
          ? await this.prisma.crmStaffAccess.findMany({
              where: {
                tenantId,
                userId: { in: ownerIds },
                status: 'active',
              },
              select: { userId: true, externalStaffId: true },
            })
          : [];
        const staffByUser = new Map(
          ownerStaff
            .filter((row) => row.userId)
            .map((row) => [row.userId!, String(row.externalStaffId)]),
        );
        const staffSet = new Set(staffIds);
        for (const owner of owners) {
          const linkedStaffId = staffByUser.get(owner.userId);
          if (!linkedStaffId || staffSet.has(linkedStaffId)) {
            ids.add(owner.userId);
          }
        }
      } else {
        for (const owner of owners) ids.add(owner.userId);
      }
    }

    return [...ids];
  }

  private async announcePush(
    tenantId: string,
    userIds: string[],
    dto: IngestInboxItemDto,
  ): Promise<void> {
    const tokens = await this.prisma.devicePushToken.findMany({
      where: { tenantId, userId: { in: userIds } },
      select: { userId: true, platform: true, token: true },
    });
    if (tokens.length === 0) {
      this.logger.log(
        `inbox stored type=${dto.type} but no device tokens yet title=${dto.title.slice(0, 40)}`,
      );
      return;
    }
    if (dto.type !== 'marketing_campaign') {
      await Promise.all(
        tokens.map((token) =>
          this.planSingleSafely({
            tenantId,
            sourceType: this.shadowSourceForType(dto.type),
            producerRef: `apns.${dto.type}`,
            logicalRef: `${dto.type}:${dto.source_event_id}:apns:${token.userId}:${token.token}`,
            taxonomy: this.shadowTaxonomyForType(dto.type),
            channel: 'apns',
            templateRef: `apns.${dto.type}`,
            contentIdentityParts: [
              dto.type,
              dto.title,
              dto.body_text,
              dto.deep_link ?? '',
            ],
            recipientRef: token.token,
            recipientKind: 'apns_device_token',
            internalUserId: token.userId,
            eligibilityPolicyRef: 'apns.active-device-token.v1',
            legacyApprovalRequirement:
              dto.type === 'maya_task' ? 'OWNER_CONFIRMED' : 'SYSTEM_POLICY',
          }),
        ),
      );
    }
    await sendInboxApns({
      tokens,
      title: dto.title,
      body: dto.body_text,
      deepLink: dto.deep_link,
      type: dto.type,
      logger: this.logger,
    });
  }

  private shadowTaxonomyForType(
    type: IngestInboxItemDto['type'],
  ): 'transactional_single' | 'operational_single' {
    return new Set<IngestInboxItemDto['type']>([
      'new_appointment',
      'appointment_cancelled',
      'appointment_deleted',
      'appointment_rescheduled',
      'appointment_reassigned',
      'client_support_request',
    ]).has(type)
      ? 'transactional_single'
      : 'operational_single';
  }

  private shadowSourceForType(
    type: IngestInboxItemDto['type'],
  ): 'authenticated_request' | 'scheduler' | 'webhook' | 'legacy_bridge' {
    if (
      new Set<IngestInboxItemDto['type']>([
        'appointment_reminder',
        'shift_reminder',
        'daily_report',
        'morning_brief',
        'growth_plan',
        'hanging_lead',
      ]).has(type)
    ) {
      return 'scheduler';
    }
    if (
      new Set<IngestInboxItemDto['type']>([
        'new_appointment',
        'appointment_cancelled',
        'appointment_deleted',
        'appointment_rescheduled',
        'appointment_reassigned',
      ]).has(type)
    ) {
      return 'webhook';
    }
    return 'authenticated_request';
  }

  private async planSingleSafely(input: {
    tenantId: string;
    sourceType:
      'authenticated_request' | 'scheduler' | 'webhook' | 'legacy_bridge';
    producerRef: string;
    logicalRef: string;
    taxonomy: 'transactional_single' | 'operational_single';
    channel: 'inbox' | 'apns';
    templateRef: string;
    contentIdentityParts: readonly string[];
    recipientRef: string;
    recipientKind: string;
    internalUserId: string;
    eligibilityPolicyRef: string;
    legacyApprovalRequirement: 'NONE' | 'OWNER_CONFIRMED' | 'SYSTEM_POLICY';
  }): Promise<void> {
    if (!this.communicationShadow) return;
    try {
      await this.communicationShadow.plan({
        tenantId: input.tenantId,
        sourceType: input.sourceType,
        producerRef: input.producerRef,
        logicalRef: input.logicalRef,
        taxonomy: input.taxonomy,
        channel: input.channel,
        templateRef: input.templateRef,
        contentIdentityParts: input.contentIdentityParts,
        recipients: [
          {
            recipientRef: input.recipientRef,
            recipientKind: input.recipientKind,
            internalUserId: input.internalUserId,
            eligibility: {
              basis: 'server_authorized_recipient',
              decision: 'ALLOW',
              policyVersion: 1,
              evidenceRef: `recipient:${input.internalUserId}`,
              evidenceIdentityParts: [
                input.tenantId,
                input.internalUserId,
                input.channel,
              ],
            },
          },
        ],
        eligibilityPolicyRef: input.eligibilityPolicyRef,
        legacyApprovalRequirement: input.legacyApprovalRequirement,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
      });
    } catch (error) {
      this.logger.warn(
        `communication shadow planning failed without affecting legacy delivery: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }
}
