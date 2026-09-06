import { evaluateTenantAccessState } from '../tenants/tenant-access-state';
import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  ActionEngineKernel,
  CanonicalActionIngressService,
} from '../action-engine';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { EncryptionService } from '../encryption/encryption.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { ClientChannelRuntimeService } from '../crm/client-channel-runtime.service';
import { ClientWebPushService } from '../crm/client-web-push.service';
import { CommunicationDeliveryService } from '../communication-delivery/communication-delivery.service';
import { CommunicationWebPushService } from '../communication-delivery/communication-web-push.service';
import {
  REMINDER_ACTION,
  reminderRequest,
  type ReminderPlan,
} from '../communication-delivery/appointment-reminder.contract';
import {
  effectiveReminderSchedule,
  reminderChannelAllowed,
  REMINDER_POLICY_V1,
} from './appointment-reminder-policy';

/** B25 scheduler initiator. Existing ActionExecution fixes the primary route and
 * device snapshot before any delivery effect; Communication Delivery owns sends. */
@Injectable()
export class AppointmentReminderOrchestratorService {
  private now = () => new Date();
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly encryption: EncryptionService,
    private readonly entitlements: EntitlementsService,
    private readonly channels: ClientChannelRuntimeService,
    private readonly devices: ClientWebPushService,
    private readonly ingress: CanonicalActionIngressService,
    private readonly kernel: ActionEngineKernel,
    private readonly communication: CommunicationDeliveryService,
    private readonly webPush: CommunicationWebPushService,
  ) {}

  async processTenant(tenantId: string, now: Date) {
    this.context.assertTenantId(tenantId);
    let sent = 0,
      skipped = 0;
    for await (const a of this.candidates(tenantId, now)) {
      const authority = await this.authority(tenantId, a.id, now);
      if (!authority) {
        skipped++;
        continue;
      }
      const { appointment, leads, scheduleHash, clientId } = authority;
      const minutes = (appointment.startAt.getTime() - now.getTime()) / 60000;
      // Distinct policy occurrences have distinct stable identities, even if
      // their twenty-minute dispatch windows overlap.
      for (const leadMinutes of leads.filter(
        (lead) =>
          Math.abs(minutes - lead) <= REMINDER_POLICY_V1.toleranceMinutes,
      )) {
        const occurrence = this.hash([scheduleHash, leadMinutes]);
        let normalized = await this.existing(tenantId, occurrence);
        if (!normalized) {
          normalized = await this.plan(
            tenantId,
            authority,
            leadMinutes,
            occurrence,
            now,
          );
          if (!normalized) {
            skipped++;
            continue;
          }
          try {
            await this.ingress.createExecution(
              reminderRequest(tenantId, normalized),
            );
          } catch (error) {
            // A competing worker may have selected just before revocation.
            // Its durable route wins, never the losing worker's newer route.
            const winner = await this.existing(tenantId, occurrence);
            if (!winner) throw error;
            normalized = winner;
          }
          normalized = await this.existing(tenantId, occurrence);
          if (!normalized) throw new Error('REMINDER_PLAN_NOT_DURABLE');
        }
        const value = normalized;
        const p = value.reminderPlan as ReminderPlan;
        if (
          p.clientId !== clientId ||
          p.appointmentId !== appointment.id ||
          p.occurrence !== occurrence
        )
          throw new ForbiddenException('REMINDER_IDENTITY_MISMATCH');
        const dispatch = {
          request: reminderRequest(tenantId, value),
          authorize: () => this.authorize(tenantId, value),
        };
        try {
          if (value.channel === 'web_push')
            await this.webPush.deliverReminder(dispatch, true);
          else {
            await this.communication.deliverAppointmentReminder(dispatch);
            // Accompanies proven primary acceptance, never fallback on failure
            // or UNKNOWN. The immutable device snapshot belongs to this reminder.
            for (const device of p.apnsDevices) {
              const token = await this.prisma.devicePushToken.findFirst({
                where: {
                  id: device.id,
                  tenantId,
                  userId: String(value.userId),
                },
              });
              if (!token || this.hash(token.token) !== device.tokenHash)
                continue;
              await this.communication.deliverReminderApns(
                dispatch,
                token.token,
                async () => {
                  await dispatch.authorize();
                  const current = await this.prisma.devicePushToken.findFirst({
                    where: {
                      id: device.id,
                      tenantId,
                      userId: String(value.userId),
                    },
                  });
                  if (!current || this.hash(current.token) !== device.tokenHash)
                    throw new ForbiddenException('REMINDER_DEVICE_REVOKED');
                },
              );
            }
            if (p.endpointIds.length)
              await this.webPush.deliverReminder(dispatch, false);
          }
          sent++;
        } catch {
          skipped++;
        } // Outcomes stay durable; no alternate route.
      }
    }
    return { sent, skipped };
  }

  private async *candidates(tenantId: string, now: Date) {
    let cursor: string | undefined;
    while (true) {
      const batch = await this.prisma.appointment.findMany({
        where: {
          tenantId,
          mayaClientId: { not: null },
          status: 'confirmed',
          startAt: {
            gt: now,
            lte: new Date(now.getTime() + (10080 + 20) * 60000),
          },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 250,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!batch.length) return;
      for (const row of batch) yield row;
      cursor = batch[batch.length - 1].id;
      if (batch.length < 250) return;
    }
  }

  private async existing(tenantId: string, occurrence: string) {
    const rows = await this.prisma.actionExecution.findMany({
      where: {
        tenantId,
        capability: REMINDER_ACTION,
        sourceRef: `b25.reminder:${occurrence}`,
      },
      take: 2,
    });
    if (rows.length > 1) throw new ForbiddenException('AMBIGUOUS_REMINDER');
    return rows[0]
      ? this.kernel.readTrustedNormalizedInput(tenantId, rows[0].id)
      : null;
  }

  private async authority(tenantId: string, appointmentId: string, now: Date) {
    this.context.assertTenantId(tenantId);
    const [appointment, tenant, settings] = await Promise.all([
      this.prisma.appointment.findFirst({
        where: { id: appointmentId, tenantId },
      }),
      this.prisma.tenant.findUnique({ where: { id: tenantId } }),
      this.prisma.appointmentNotificationSetting.findUnique({
        where: { tenantId },
      }),
    ]);
    if (
      !appointment?.mayaClientId ||
      !tenant ||
      !['active', 'trial_active', 'past_due_grace'].includes(
        evaluateTenantAccessState(tenant, now).accessState,
      ) ||
      appointment.status !== 'confirmed' ||
      appointment.startAt <= now
    )
      return null;
    // Appointment.clientId is a User association. Only mayaClientId is Client authority.
    const clientId = appointment.mayaClientId;
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId, mergedIntoClientId: null },
    });
    if (!client) return null;
    const profile = await this.prisma.customerProfile.findUnique({
      where: { tenantId_clientId: { tenantId, clientId } },
    });
    if (
      !profile?.privacyConsentAt ||
      !(await this.entitlements.hasFeature(tenantId, 'notifications.core')) ||
      !reminderChannelAllowed(
        profile.notificationPreferencesJson,
        tenant.defaultTimezone,
        now,
      )
    )
      return null;
    const leads = effectiveReminderSchedule(
      settings?.enabled ?? true,
      settings?.leadTimesMinutes ?? [1440, 120],
      profile.notificationPreferencesJson,
    );
    if (!leads.length) return null;
    const scheduleHash = this.hash([
      tenantId,
      appointment.id,
      clientId,
      appointment.startAt.toISOString(),
      appointment.endAt.toISOString(),
      settings?.updatedAt.toISOString() ?? 'default-v1',
      leads,
    ]);
    return {
      appointment,
      clientId,
      leads,
      scheduleHash,
      timezone: tenant.defaultTimezone,
    };
  }

  private async plan(
    tenantId: string,
    a: NonNullable<
      Awaited<ReturnType<AppointmentReminderOrchestratorService['authority']>>
    >,
    leadMinutes: number,
    occurrence: string,
    now: Date,
  ) {
    const rows = await this.prisma.clientChannelLink.findMany({
      where: {
        tenantId,
        clientId: a.clientId,
        revokedAt: null,
        verificationVersion: 1,
        subjectHashVersion: 1,
      },
      orderBy: [{ verifiedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    let route: 'inbox' | 'telegram' | 'web_push' = 'web_push';
    let linkId: string | null = null;
    let endpoint: Awaited<
      ReturnType<ClientChannelRuntimeService['resolveVerifiedDeliveryEndpoint']>
    > = null;
    for (const provider of ['maya_user', 'telegram']) {
      for (const row of rows.filter((r) => r.provider === provider)) {
        endpoint = await this.channels.resolveVerifiedDeliveryEndpoint(
          a.clientId,
          row.id,
        );
        if (endpoint) {
          linkId = row.id;
          route = provider === 'maya_user' ? 'inbox' : 'telegram';
          break;
        }
      }
      if (linkId) break;
    }
    const ids = await this.devices.eligibleIds(tenantId, a.clientId, now);
    const endpointIds: string[] = [];
    for (const id of ids.slice(0, 5))
      if (await this.devices.resolveForDelivery(tenantId, a.clientId, id))
        endpointIds.push(id);
    if (!linkId && !endpointIds.length) return null;
    // Recipient proof precedes construction of private appointment content.
    const apnsRows =
      route === 'inbox' && endpoint
        ? await this.prisma.devicePushToken.findMany({
            where: { tenantId, userId: endpoint.address },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          })
        : [];
    const apnsDevices = apnsRows.map((d) => ({
      id: d.id,
      tokenHash: this.hash(d.token),
    }));
    const p: ReminderPlan = {
      version: 1,
      appointmentId: a.appointment.id,
      clientId: a.clientId,
      occurrence,
      scheduleHash: a.scheduleHash,
      leadMinutes,
      linkId,
      endpointIds,
      apnsDevices,
      issuedAt: now.toISOString(),
      expiresAt: a.appointment.startAt.toISOString(),
    };
    const title = leadMinutes >= 1440 ? 'Запись завтра' : 'Скоро ваша запись';
    const time = new Intl.DateTimeFormat('ru-RU', {
      timeZone: a.timezone,
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(a.appointment.startAt);
    const shared = {
      channel: route,
      messageType: 'appointment_reminder',
      sourceEventId: `appointment-reminder:${occurrence}`,
      title,
      bodyText: `Ваша запись — ${time}. Подробности доступны в разделе записей.`,
      reminderPlan: p,
    };
    if (route === 'web_push')
      return {
        ...shared,
        clientId: a.clientId,
        endpointIds,
        expiresAt: p.expiresAt,
      };
    if (!endpoint) return null;
    return {
      ...shared,
      recipientIdentityRef: endpoint.identityRef,
      ...(route === 'inbox'
        ? {
            userId: endpoint.address,
            deepLink: '/app/?panel=records',
            payload: {
              event: 'appointment.reminder',
              appointment_id: a.appointment.id,
              start_at: a.appointment.startAt.toISOString(),
              end_at: a.appointment.endAt.toISOString(),
              lead_time_minutes: leadMinutes,
            },
          }
        : { telegramChatId: endpoint.address }),
    };
  }

  private async authorize(tenantId: string, value: Record<string, unknown>) {
    const p = value.reminderPlan as ReminderPlan;
    const a = await this.authority(tenantId, p.appointmentId, this.now());
    if (
      !a ||
      a.clientId !== p.clientId ||
      a.scheduleHash !== p.scheduleHash ||
      !a.leads.includes(p.leadMinutes) ||
      new Date(p.expiresAt) <= this.now() ||
      Math.abs(
        (a.appointment.startAt.getTime() - this.now().getTime()) / 60000 -
          p.leadMinutes,
      ) > REMINDER_POLICY_V1.toleranceMinutes
    )
      throw new ForbiddenException('REMINDER_STALE_OR_FORBIDDEN');
    if (value.channel === 'web_push') return; // Each fixed device is checked again by Communication Delivery.
    if (!p.linkId) throw new ForbiddenException('REMINDER_LINK_MISSING');
    const endpoint = await this.channels.resolveVerifiedDeliveryEndpoint(
      p.clientId,
      p.linkId,
    );
    if (
      !endpoint ||
      endpoint.identityRef !== value.recipientIdentityRef ||
      (value.channel === 'inbox'
        ? endpoint.provider !== 'maya_user' || endpoint.address !== value.userId
        : endpoint.provider !== 'telegram' ||
          endpoint.address !== value.telegramChatId)
    )
      throw new ForbiddenException('REMINDER_PRIMARY_REVOKED');
  }
  private hash(value: unknown) {
    return this.encryption.opaqueReference(
      'b25.reminder.policy.v1',
      JSON.stringify(value),
    );
  }
}
