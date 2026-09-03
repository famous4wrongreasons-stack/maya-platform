import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CalendarSource, TenantStatus, UserRole } from '@prisma/client';

import { phoneMatchKey } from '../common/phone.util';
import { CrmService } from '../crm/crm.service';
import type { CrmJournalAppointment } from '../crm/crm-adapter.interface';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { InboxService } from '../inbox/inbox.service';
import { Package5Wave1CanonicalCutoverService } from '../package5-wave1/package5-wave1-canonical-cutover.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { decodeCrmAppointmentKey } from '../domain';

const DEFAULT_LEAD_TIMES_MINUTES = [24 * 60, 2 * 60] as const;
const MIN_LEAD_MINUTES = 30;
const MAX_LEAD_MINUTES = 7 * 24 * 60;
const MAX_LEAD_TIMES = 4;
const MATCH_TOLERANCE_MINUTES = 20;

const CLIENT_ROLES: UserRole[] = [UserRole.client, UserRole.customer];

type EligibleTenant = {
  id: string;
  slug: string;
  defaultTimezone: string;
};

export type AppointmentNotificationSettings = {
  enabled: boolean;
  lead_times_minutes: number[];
  channel: 'maya_inbox_push';
  transactional: true;
};

@Injectable()
export class AppointmentNotificationsService {
  private readonly logger = new Logger(AppointmentNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: CrmService,
    private readonly inbox: InboxService,
    private readonly tenantContext: TenantContextService,
    private readonly entitlements: EntitlementsService,
    private readonly canonicalWave1: Package5Wave1CanonicalCutoverService,
  ) {}

  async getSettings(
    tenantId: string,
  ): Promise<AppointmentNotificationSettings> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const row = await this.prisma.appointmentNotificationSetting.findUnique({
      where: { tenantId: scopedTenantId },
      select: { enabled: true, leadTimesMinutes: true },
    });

    return this.toPublicSettings(
      row?.enabled ?? true,
      row?.leadTimesMinutes ?? [...DEFAULT_LEAD_TIMES_MINUTES],
    );
  }

  async updateSettings(
    tenantId: string,
    actorUserId: string,
    input: { enabled: boolean; leadTimesMinutes?: number[] },
    idempotencyKey?: string,
  ): Promise<AppointmentNotificationSettings> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const current = await this.prisma.appointmentNotificationSetting.findUnique(
      {
        where: { tenantId: scopedTenantId },
        select: { leadTimesMinutes: true },
      },
    );
    const leadTimes = this.normalizeLeadTimes(
      input.leadTimesMinutes ??
        current?.leadTimesMinutes ??
        DEFAULT_LEAD_TIMES_MINUTES,
    );
    return this.canonicalWave1.updateAppointmentNotifications(
      scopedTenantId,
      actorUserId,
      { enabled: input.enabled, leadTimesMinutes: leadTimes },
      idempotencyKey,
    );
  }

  async tick(now: Date = new Date()): Promise<{
    tenants: number;
    sent: number;
    skipped: number;
    failed: number;
  }> {
    const tenants = await this.listEligibleTenants();
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const tenant of tenants) {
      try {
        const result = await this.tenantContext.runAsSystemTenant(
          tenant.id,
          () => this.processTenant(tenant, now),
        );
        sent += result.sent;
        skipped += result.skipped;
      } catch (error) {
        failed += 1;
        this.logger.warn(
          `appointment reminders failed tenant=${tenant.slug}: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      }
    }

    return { tenants: tenants.length, sent, skipped, failed };
  }

  private async processTenant(
    tenant: EligibleTenant,
    now: Date,
  ): Promise<{ sent: number; skipped: number }> {
    if (
      !(await this.entitlements.hasFeature(tenant.id, 'notifications.core'))
    ) {
      return { sent: 0, skipped: 1 };
    }

    const settings = await this.getSettings(tenant.id);
    if (!settings.enabled) return { sent: 0, skipped: 1 };

    const recipientsByPhone = await this.clientRecipientsByPhone(tenant.id);
    if (recipientsByPhone.size === 0) return { sent: 0, skipped: 1 };

    const leadTimes = settings.lead_times_minutes;
    const minLead = Math.min(...leadTimes);
    const maxLead = Math.max(...leadTimes);
    const from = new Date(
      now.getTime() + (minLead - MATCH_TOLERANCE_MINUTES) * 60_000,
    );
    const to = new Date(
      now.getTime() + (maxLead + MATCH_TOLERANCE_MINUTES) * 60_000,
    );
    const journal = await this.crm.getJournal(tenant.id, {
      from: from.toISOString(),
      to: to.toISOString(),
    });
    const candidates = journal.appointments
      .map((appointment) => ({
        appointment,
        leadTime: this.matchingLeadTime(appointment, leadTimes, now),
      }))
      .filter(
        (
          row,
        ): row is { appointment: CrmJournalAppointment; leadTime: number } =>
          row.leadTime !== null && row.appointment.status === 'confirmed',
      );

    let sent = 0;
    let skipped = 0;
    for (const { appointment, leadTime } of candidates) {
      const sourceEventId = this.sourceEventId(appointment.id, leadTime);
      if (
        await this.inbox.hasSourceEvent(
          tenant.id,
          'appointment_reminder',
          sourceEventId,
        )
      ) {
        skipped += 1;
        continue;
      }

      const externalId = this.externalAppointmentId(appointment.id);
      const detail = await this.crm.getAppointmentDetailForSystem(
        tenant.id,
        externalId,
      );
      const phoneKey = phoneMatchKey(detail.client_phone);
      const userIds = phoneKey ? (recipientsByPhone.get(phoneKey) ?? []) : [];
      if (userIds.length === 0) {
        skipped += 1;
        continue;
      }

      const published = await this.inbox.publishForTenant(tenant.id, {
        type: 'appointment_reminder',
        sourceEventId,
        title: leadTime >= 24 * 60 ? 'Запись завтра' : 'Скоро ваша запись',
        bodyText: this.reminderText(detail, tenant.defaultTimezone, leadTime),
        payload: {
          event: 'appointment.reminder',
          appointment_id: appointment.id,
          record_id: externalId,
          staff_id: appointment.provider.id,
          start_at: appointment.start_at,
          end_at: appointment.end_at,
          lead_time_minutes: leadTime,
        },
        deepLink: '/app/?panel=records',
        userIds,
        fanoutOwners: false,
      });
      sent += published.stored;
    }

    return { sent, skipped };
  }

  private async listEligibleTenants(): Promise<EligibleTenant[]> {
    return this.prisma.tenant.findMany({
      where: {
        status: {
          in: [TenantStatus.active, TenantStatus.trial, TenantStatus.past_due],
        },
        calendarSource: CalendarSource.external,
        crmIntegration: { status: 'active' },
      },
      select: {
        id: true,
        slug: true,
        defaultTimezone: true,
      },
      take: 500,
    });
  }

  private async clientRecipientsByPhone(
    tenantId: string,
  ): Promise<Map<string, string[]>> {
    const memberships = await this.prisma.membership.findMany({
      where: {
        tenantId,
        status: 'active',
        role: { in: CLIENT_ROLES },
        user: { status: 'active', phone: { not: null } },
      },
      select: {
        userId: true,
        user: { select: { phone: true } },
      },
    });
    const result = new Map<string, string[]>();
    for (const membership of memberships) {
      const key = phoneMatchKey(membership.user.phone);
      if (!key) continue;
      const ids = result.get(key) ?? [];
      if (!ids.includes(membership.userId)) ids.push(membership.userId);
      result.set(key, ids);
    }
    return result;
  }

  private matchingLeadTime(
    appointment: CrmJournalAppointment,
    leadTimes: number[],
    now: Date,
  ): number | null {
    const start = new Date(appointment.start_at).getTime();
    if (!Number.isFinite(start) || start <= now.getTime()) return null;
    const minutesUntil = (start - now.getTime()) / 60_000;
    const matches = leadTimes.filter(
      (lead) => Math.abs(minutesUntil - lead) <= MATCH_TOLERANCE_MINUTES,
    );
    if (matches.length === 0) return null;
    return matches.sort(
      (left, right) =>
        Math.abs(minutesUntil - left) - Math.abs(minutesUntil - right),
    )[0];
  }

  private reminderText(
    appointment: CrmJournalAppointment,
    timezone: string,
    leadTime: number,
  ): string {
    const start = new Date(appointment.start_at);
    const date = new Intl.DateTimeFormat('ru-RU', {
      timeZone: timezone,
      day: 'numeric',
      month: 'long',
    }).format(start);
    const time = new Intl.DateTimeFormat('ru-RU', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
    }).format(start);
    const services = appointment.services
      .map((service) => service.name.trim())
      .filter(Boolean)
      .join(', ');
    const prefix =
      leadTime >= 24 * 60 ? 'Напоминаем о записи' : 'Ваша запись скоро';
    return `${prefix}: ${date} в ${time}${
      services ? `, ${services}` : ''
    }, мастер ${appointment.provider.name}. Открыть запись можно в MAYA.`;
  }

  private sourceEventId(appointmentId: string, leadTime: number): string {
    return `appointment_reminder:${appointmentId}:${leadTime}`.slice(0, 160);
  }

  private externalAppointmentId(appointmentId: string): string {
    // Формат ключа принадлежит домену: собирал его адаптер, а разбирал этот
    // модуль — договорённость жила в двух местах без владельца.
    return decodeCrmAppointmentKey(appointmentId);
  }

  private toPublicSettings(
    enabled: boolean,
    leadTimes: unknown,
  ): AppointmentNotificationSettings {
    return {
      enabled,
      lead_times_minutes: this.normalizeLeadTimes(leadTimes),
      channel: 'maya_inbox_push',
      transactional: true,
    };
  }

  private normalizeLeadTimes(value: unknown): number[] {
    if (!Array.isArray(value)) {
      return [...DEFAULT_LEAD_TIMES_MINUTES];
    }
    const normalized = [
      ...new Set(
        value
          .filter((item): item is number => Number.isInteger(item))
          .map((item) => Number(item)),
      ),
    ].sort((left, right) => right - left);
    if (
      normalized.length === 0 ||
      normalized.length > MAX_LEAD_TIMES ||
      normalized.some(
        (item) => item < MIN_LEAD_MINUTES || item > MAX_LEAD_MINUTES,
      )
    ) {
      throw new BadRequestException({
        message: 'Appointment reminder lead times are invalid.',
        error: {
          code: 'appointment_reminder_lead_times_invalid',
          minimum_minutes: MIN_LEAD_MINUTES,
          maximum_minutes: MAX_LEAD_MINUTES,
          maximum_count: MAX_LEAD_TIMES,
        },
      });
    }
    return normalized;
  }
}
