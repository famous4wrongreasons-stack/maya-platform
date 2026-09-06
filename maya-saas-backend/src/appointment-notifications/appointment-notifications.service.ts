import { AppointmentReminderOrchestratorService } from './appointment-reminder-orchestrator.service';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CalendarSource, TenantStatus } from '@prisma/client';

import { EntitlementsService } from '../entitlements/entitlements.service';
import { Package5Wave1CanonicalCutoverService } from '../package5-wave1/package5-wave1-canonical-cutover.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

const DEFAULT_LEAD_TIMES_MINUTES = [24 * 60, 2 * 60] as const;
const MIN_LEAD_MINUTES = 30;
const MAX_LEAD_MINUTES = 7 * 24 * 60;
const MAX_LEAD_TIMES = 4;

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
    private readonly reminders: AppointmentReminderOrchestratorService,
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

    return this.reminders.processTenant(tenant.id, now);
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
