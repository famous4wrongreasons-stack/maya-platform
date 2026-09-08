import {
  Injectable,
  Optional,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  CommunicationDeliveryService,
} from '../communication-delivery';
import { CommunicationShadowService } from '../communication-shadow';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CanonicalInboxProjectionService } from './canonical-inbox-projection.service';
import type {
  DeliverPrivacyTelegramDto,
  IngestInboxItemDto,
  ObserveLegacyTelegramDto,
  RegisterPushTokenDto,
} from './dto/inbox.dto';

@Injectable()
export class InboxService {

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly bridgeSource: BridgeSourceService,
    @Optional()
    private readonly communicationShadow?: CommunicationShadowService,
    @Optional()
    private readonly communicationDelivery?: CommunicationDeliveryService,
    @Optional() private readonly projections?: CanonicalInboxProjectionService,
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
    void dto;
    throw new BadRequestException('R06_CANONICAL_PRODUCER_ADMISSION_REQUIRED');
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
      operationalWorkItemId?: string;
      shadowSourceType?:
        'authenticated_request' | 'scheduler' | 'webhook' | 'legacy_bridge';
    },
  ) {
    this.tenantContext.assertTenantId(tenantId);
    if (!this.projections) throw new Error('canonical_inbox_projection_unavailable');
    if (input.telegramChatIds?.length || input.shadowSourceType==='legacy_bridge') throw new BadRequestException('R06_RAW_DELIVERY_AUTHORITY_FORBIDDEN');
    if (input.type==='maya_task' || input.type==='client_support_request') {
      if(!input.operationalWorkItemId)throw new BadRequestException('R06_A23_OWNER_REQUIRED');
      return this.projections.work(tenantId,input.operationalWorkItemId);
    }
    const appointmentId=input.payload?.appointment_id;
    if(typeof appointmentId==='string'&&['new_appointment','appointment_cancelled','appointment_deleted','appointment_rescheduled'].includes(input.type))return this.projections.appointmentExecution(tenantId,appointmentId,input.type==='new_appointment'?'create_appointment':input.type==='appointment_rescheduled'?'reschedule_appointment':'cancel_appointment');
    throw new BadRequestException('R06_EXACT_CANONICAL_OWNER_REQUIRED');
  }

  /**
   * Mirrors a committed OperationalWorkItem terminal state into its inbox
   * projection. The work item remains the business authority; this method may
   * be retried after a delivery failure without repeating the business action.
   */
  async projectOperationalWorkItemCompletion(
    tenantId: string,
    userId: string,
    operationalWorkItemId: string,
  ): Promise<void> {
    this.tenantContext.assertTenantId(tenantId);
    const owner=await this.prisma.operationalWorkItem.findFirst({where:{id:operationalWorkItemId,tenantId,assigneeUserId:userId,status:'COMPLETED'},include:{completeExecution:true}});
    if(!owner?.completeExecution || owner.completeExecution.state!=='SUCCEEDED' || owner.completeExecution.dryRun)throw new BadRequestException('R06_COMPLETED_A23_RECEIPT_REQUIRED');
    const rows = await this.prisma.inboxItem.findMany({
      where: {
        tenantId,
        userId,
        operationalWorkItemId,
        type: 'maya_task',
        deletedAt: null,
      },
      select: { id: true, payloadJson: true, readAt: true, archivedAt: true },
    });
    const projectedAt = new Date();
    await this.prisma.$transaction(
      rows.map((row) => {
        const payload =
          row.payloadJson &&
          typeof row.payloadJson === 'object' &&
          !Array.isArray(row.payloadJson)
            ? (row.payloadJson as Record<string, unknown>)
            : {};
        return this.prisma.inboxItem.update({
          where: { id: row.id },
          data: {
            payloadJson: {
              ...payload,
              status: 'completed',
              completed_at: projectedAt.toISOString(),
              operational_work_item_id: operationalWorkItemId,
            },
            readAt: row.readAt ?? projectedAt,
            archivedAt: row.archivedAt ?? projectedAt,
          },
        });
      }),
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
}
