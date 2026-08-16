import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, TenantStatus, UserRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { sendInboxApns } from './apns-push';
import type { IngestInboxItemDto, RegisterPushTokenDto } from './dto/inbox.dto';

/**
 * Арендаторы, которым мост имеет право писать.
 *
 * Тот же набор, что у штатного резолвера: приостановленный и отменённый салон
 * не должен получать ни карточек, ни пушей.
 */
const PUBLIC_TENANT_STATUSES: TenantStatus[] = ['trial', 'active', 'past_due'];

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

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  assertBridgeToken(header: string | undefined): void {
    const expected = String(process.env.MAYA_INBOX_BRIDGE_TOKEN || '').trim();
    if (!expected || expected.length < 24) {
      throw new UnauthorizedException({
        message: 'Inbox bridge is not configured.',
        error: { code: 'inbox_bridge_disabled' },
      });
    }
    if (String(header || '').trim() !== expected) {
      throw new UnauthorizedException({
        message: 'Invalid inbox bridge token.',
        error: { code: 'inbox_bridge_unauthorized' },
      });
    }
  }

  async ingest(dto: IngestInboxItemDto) {
    // 🔴 Арендатор приходит из ТЕЛА запроса под общим платформенным токеном, и
    // статус здесь не проверялся — в отличие от штатного резолвера. Держатель
    // токена мог писать карточки и слать пуши в приостановленного или
    // отменённого арендатора. Пер-арендный токен — это модель самого моста к
    // старому боту, она относится к главе 2/7; здесь закрываем ровно то, что
    // отличает этот путь от штатного.
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        slug: dto.tenant_slug.trim().toLowerCase(),
        status: { in: PUBLIC_TENANT_STATUSES },
      },
      select: { id: true, slug: true },
    });
    if (!tenant) {
      throw new ForbiddenException({
        message: 'Tenant not found for inbox ingest.',
        error: { code: 'inbox_tenant_not_found' },
      });
    }

    // Публикация идёт в контексте найденного арендатора: раньше вся ветка
    // работала вне контекста вообще, и любой сервис, который начнёт сверять
    // принадлежность, молча получил бы отказ на ночном мосту.
    return this.tenantContext.runAsSystemTenant(tenant.id, () =>
      this.publishForTenant(tenant.id, {
        type: dto.type,
        sourceEventId: dto.source_event_id,
        title: dto.title,
        bodyText: dto.body_text,
        payload: dto.payload,
        deepLink: dto.deep_link,
        userIds: dto.user_ids,
        telegramChatIds: dto.telegram_chat_ids,
        fanoutOwners: dto.fanout_owners,
      }),
    );
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
      fanoutOwners?: boolean;
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
      fanout_owners: input.fanoutOwners,
    };

    const userIds = await this.resolveRecipients(tenantId, dto);
    if (userIds.length === 0) {
      this.logger.warn(
        `inbox publish skipped: no recipients for ${input.type}/${input.sourceEventId} tenant=${tenantId}`,
      );
      return { stored: 0, user_ids: [] as string[] };
    }

    let stored = 0;
    for (const userId of userIds) {
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

    void this.announcePush(tenantId, userIds, dto).catch((error) => {
      this.logger.warn(
        `inbox push announce failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    });

    return { stored, user_ids: userIds };
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
      select: { platform: true, token: true },
    });
    if (tokens.length === 0) {
      this.logger.log(
        `inbox stored type=${dto.type} but no device tokens yet title=${dto.title.slice(0, 40)}`,
      );
      return;
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
}
