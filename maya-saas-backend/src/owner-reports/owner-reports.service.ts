import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantStatus, UserRole, CalendarSource } from '@prisma/client';

import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';
import { InboxService } from '../inbox/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  composeDailyReport,
  composeMorningBrief,
} from './owner-reports.composers';
import {
  dayIsoRange,
  localCalendarDate,
  localHour,
} from './owner-reports.time';

const OWNER_ROLES: UserRole[] = [
  UserRole.tenant_owner,
  UserRole.business_owner,
  UserRole.tenant_admin,
  UserRole.administrator,
  UserRole.platform_owner,
];

type EligibleTenant = {
  id: string;
  slug: string;
  name: string | null;
  defaultTimezone: string;
};

@Injectable()
export class OwnerReportsService {
  private readonly logger = new Logger(OwnerReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: OperationsAnalyticsService,
    private readonly inbox: InboxService,
    private readonly tenantContext: TenantContextService,
    private readonly configService: ConfigService,
  ) {}

  async tick(now: Date = new Date()): Promise<{
    morning: number;
    evening: number;
    skipped: number;
    failed: number;
  }> {
    const tenants = await this.listEligibleTenants();
    let morning = 0;
    let evening = 0;
    let skipped = 0;
    let failed = 0;

    for (const tenant of tenants) {
      const hour = localHour(tenant.defaultTimezone, now);
      try {
        if (hour === this.morningHour()) {
          const result = await this.runMorningBrief(tenant, now);
          if (result === 'sent') morning += 1;
          else skipped += 1;
        } else if (hour === this.eveningHour()) {
          const result = await this.runDailyReport(tenant, now);
          if (result === 'sent') evening += 1;
          else skipped += 1;
        }
      } catch (error) {
        failed += 1;
        this.logger.warn(
          `owner report failed tenant=${tenant.slug}: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      }
    }

    return { morning, evening, skipped, failed };
  }

  async runMorningBrief(
    tenant: EligibleTenant,
    now: Date = new Date(),
  ): Promise<'sent' | 'skipped'> {
    const localDate = localCalendarDate(tenant.defaultTimezone, now);
    const sourceEventId = `nest:morning_brief:${localDate}`;
    if (await this.inbox.hasSourceEvent(tenant.id, 'morning_brief', sourceEventId)) {
      return 'skipped';
    }

    const range = dayIsoRange(tenant.defaultTimezone, localDate);
    const overview = await this.tenantContext.runAsSystemTenant(tenant.id, () =>
      this.analytics.getBusinessOverview(tenant.id, range),
    );
    const composed = composeMorningBrief({ localDate, overview });
    const published = await this.inbox.publishForTenant(tenant.id, {
      type: 'morning_brief',
      sourceEventId,
      title: composed.title,
      bodyText: composed.bodyText,
      payload: composed.payload,
      deepLink: '/app/?panel=chat',
      fanoutOwners: true,
    });
    if (published.stored === 0) return 'skipped';
    this.logger.log(
      `morning_brief sent tenant=${tenant.slug} recipients=${published.stored}`,
    );
    return 'sent';
  }

  async runDailyReport(
    tenant: EligibleTenant,
    now: Date = new Date(),
  ): Promise<'sent' | 'skipped'> {
    const localDate = localCalendarDate(tenant.defaultTimezone, now);
    const sourceEventId = `nest:daily_report:${localDate}`;
    if (await this.inbox.hasSourceEvent(tenant.id, 'daily_report', sourceEventId)) {
      return 'skipped';
    }

    const range = dayIsoRange(tenant.defaultTimezone, localDate);
    const overview = await this.tenantContext.runAsSystemTenant(tenant.id, () =>
      this.analytics.getBusinessOverview(tenant.id, range),
    );
    let finance = null as Awaited<
      ReturnType<OperationsAnalyticsService['getBusinessFinance']>
    > | null;
    try {
      finance = await this.tenantContext.runAsSystemTenant(tenant.id, () =>
        this.analytics.getBusinessFinance(tenant.id, range),
      );
    } catch (error) {
      this.logger.warn(
        `daily_report finance unavailable tenant=${tenant.slug}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }

    const composed = composeDailyReport({ localDate, overview, finance });
    const published = await this.inbox.publishForTenant(tenant.id, {
      type: 'daily_report',
      sourceEventId,
      title: composed.title,
      bodyText: composed.bodyText,
      payload: composed.payload,
      deepLink: '/app/?panel=chat',
      fanoutOwners: true,
    });
    if (published.stored === 0) return 'skipped';
    this.logger.log(
      `daily_report sent tenant=${tenant.slug} recipients=${published.stored}`,
    );
    return 'sent';
  }

  async listEligibleTenants(): Promise<EligibleTenant[]> {
    const allow = this.slugAllowlist();
    const tenants = await this.prisma.tenant.findMany({
      where: {
        status: {
          in: [TenantStatus.active, TenantStatus.trial, TenantStatus.past_due],
        },
        ...(allow.length ? { slug: { in: allow } } : {}),
        memberships: {
          some: {
            status: 'active',
            role: { in: OWNER_ROLES },
          },
        },
        OR: [
          { crmIntegration: { status: 'active' } },
          { calendarSource: CalendarSource.internal },
        ],
      },
      select: {
        id: true,
        slug: true,
        name: true,
        defaultTimezone: true,
      },
      take: 500,
    });
    return tenants;
  }

  private morningHour(): number {
    return this.readHour('OWNER_REPORTS_MORNING_HOUR', 10);
  }

  private eveningHour(): number {
    return this.readHour('OWNER_REPORTS_EVENING_HOUR', 21);
  }

  private readHour(name: string, fallback: number): number {
    const raw = Number(this.configService.get<string>(name));
    if (!Number.isFinite(raw) || raw < 0 || raw > 23) return fallback;
    return Math.trunc(raw);
  }

  private slugAllowlist(): string[] {
    const raw = String(
      this.configService.get<string>('OWNER_REPORTS_TENANT_SLUGS') || '',
    ).trim();
    if (!raw) return [];
    return raw
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
  }
}
