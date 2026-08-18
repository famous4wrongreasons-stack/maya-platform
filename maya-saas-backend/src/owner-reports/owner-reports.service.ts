import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantStatus, UserRole, CalendarSource } from '@prisma/client';

import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';
import { DashboardPreferencesService } from '../dashboard-preferences/dashboard-preferences.service';
import { InboxService } from '../inbox/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  composeDailyReport,
  composeMasterMorningBrief,
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

const MASTER_ROLES: UserRole[] = [
  UserRole.tenant_owner,
  UserRole.business_owner,
  UserRole.provider,
  UserRole.employee,
  UserRole.staff,
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
    private readonly dashboardPreferences: DashboardPreferencesService,
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
    const [ownerAlreadySent, rawOwnerRecipients, rawMasterRecipients] =
      await Promise.all([
        this.inbox.hasSourceEvent(tenant.id, 'morning_brief', sourceEventId),
        this.listOwnerRecipients(tenant.id),
        this.listMasterMorningRecipients(tenant.id),
      ]);
    const enabledUserIds = new Set(
      await this.tenantContext.runAsSystemTenant(tenant.id, () =>
        this.dashboardPreferences.filterUsersWithAssistantCapability(
          tenant.id,
          [...rawOwnerRecipients, ...rawMasterRecipients.keys()],
          'daily_brief',
        ),
      ),
    );
    const ownerRecipients = rawOwnerRecipients.filter((userId) =>
      enabledUserIds.has(userId),
    );
    const masterRecipients = new Map(
      [...rawMasterRecipients].filter(([userId]) => enabledUserIds.has(userId)),
    );
    const masterDeliveryState = await Promise.all(
      [...masterRecipients].map(async ([userId, externalStaffId]) => ({
        userId,
        externalStaffId,
        alreadySent: await this.inbox.hasSourceEvent(
          tenant.id,
          'morning_brief',
          this.masterMorningSourceEventId(localDate, userId),
        ),
      })),
    );
    const pendingMasterRecipients = new Map(
      masterDeliveryState
        .filter((recipient) => !recipient.alreadySent)
        .map((recipient) => [recipient.userId, recipient.externalStaffId]),
    );
    if (
      (ownerAlreadySent || ownerRecipients.length === 0) &&
      pendingMasterRecipients.size === 0
    ) {
      return 'skipped';
    }

    const range = dayIsoRange(tenant.defaultTimezone, localDate);
    const overview = await this.tenantContext.runAsSystemTenant(tenant.id, () =>
      this.analytics.getBusinessOperationalOverview(tenant.id, range),
    );
    let stored = 0;
    if (!ownerAlreadySent && ownerRecipients.length > 0) {
      const composed = composeMorningBrief({ localDate, overview });
      const published = await this.inbox.publishForTenant(tenant.id, {
        type: 'morning_brief',
        sourceEventId,
        title: composed.title,
        bodyText: composed.bodyText,
        payload: composed.payload,
        deepLink: '/app/?panel=chat',
        userIds: ownerRecipients,
        fanoutOwners: false,
      });
      stored += published.stored;
    }

    stored += await this.publishMasterMorningBriefs(
      tenant,
      localDate,
      overview,
      pendingMasterRecipients,
    );
    if (stored === 0) return 'skipped';
    this.logger.log(
      `morning_brief sent tenant=${tenant.slug} recipients=${stored}`,
    );
    return 'sent';
  }

  private async publishMasterMorningBriefs(
    tenant: EligibleTenant,
    localDate: string,
    overview: Awaited<
      ReturnType<OperationsAnalyticsService['getBusinessOperationalOverview']>
    >,
    recipients: Map<string, string>,
  ): Promise<number> {
    let stored = 0;
    for (const [userId, staffId] of recipients) {
      const sourceEventId = this.masterMorningSourceEventId(localDate, userId);
      const staff = overview.staff.find((row) => row.staff_id === staffId);
      const composed = composeMasterMorningBrief({
        localDate,
        masterName: staff?.name,
        overview: {
          appointments: {
            total: staff?.total ?? 0,
            active: staff?.appointments ?? 0,
            scheduled: staff?.scheduled ?? 0,
            completed: staff?.completed ?? 0,
            cancelled: staff?.cancelled ?? 0,
            no_show: staff?.no_show ?? 0,
            booked_minutes: staff?.booked_minutes ?? 0,
          },
          // Полнота относится к чтению журнала целиком, а не к строке мастера:
          // если прочитано не всё, неполон и личный срез.
          completeness: overview.completeness,
        },
      });
      try {
        const published = await this.inbox.publishForTenant(tenant.id, {
          type: 'morning_brief',
          sourceEventId,
          title: composed.title,
          bodyText: composed.bodyText,
          payload: composed.payload,
          deepLink: '/app/?panel=chat',
          userIds: [userId],
          fanoutOwners: false,
        });
        stored += published.stored;
      } catch (error) {
        this.logger.warn(
          `master morning brief failed tenant=${tenant.slug} user=${userId}: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      }
    }
    return stored;
  }

  private async listMasterMorningRecipients(
    tenantId: string,
  ): Promise<Map<string, string>> {
    const [crmLinks, internalLinks] = await Promise.all([
      this.prisma.crmStaffAccess.findMany({
        where: {
          tenantId,
          status: 'active',
          userId: { not: null },
          role: { in: MASTER_ROLES },
        },
        select: { userId: true, staffId: true },
      }),
      this.prisma.internalProvider.findMany({
        where: { tenantId, active: true, userId: { not: null } },
        select: { userId: true, id: true },
      }),
    ]);
    // 🔴 Одно пространство идентификаторов. До cutover в это же значение
    // клали ЛИБО внешний id провайдера, ЛИБО cuid внутреннего мастера, и
    // промах при сопоставлении давал не ошибку, а бриф с нулями.
    const recipients = new Map<string, string>();
    for (const link of crmLinks) {
      if (link.userId && link.staffId)
        recipients.set(link.userId, link.staffId);
    }
    for (const link of internalLinks) {
      if (link.userId && !recipients.has(link.userId)) {
        recipients.set(link.userId, link.id);
      }
    }

    return recipients;
  }

  private async listOwnerRecipients(tenantId: string): Promise<string[]> {
    const memberships = await this.prisma.membership.findMany({
      where: {
        tenantId,
        status: 'active',
        role: { in: OWNER_ROLES },
      },
      select: { userId: true },
    });
    return [...new Set(memberships.map((membership) => membership.userId))];
  }

  private masterMorningSourceEventId(
    localDate: string,
    userId: string,
  ): string {
    return `nest:master_morning_brief:${localDate}:${userId}`;
  }

  async runDailyReport(
    tenant: EligibleTenant,
    now: Date = new Date(),
  ): Promise<'sent' | 'skipped'> {
    const localDate = localCalendarDate(tenant.defaultTimezone, now);
    const sourceEventId = `nest:daily_report:${localDate}`;
    const [alreadySent, rawRecipients] = await Promise.all([
      this.inbox.hasSourceEvent(tenant.id, 'daily_report', sourceEventId),
      this.listOwnerRecipients(tenant.id),
    ]);
    if (alreadySent) {
      return 'skipped';
    }
    const recipients = await this.tenantContext.runAsSystemTenant(
      tenant.id,
      () =>
        this.dashboardPreferences.filterUsersWithAssistantCapability(
          tenant.id,
          rawRecipients,
          'daily_brief',
        ),
    );
    if (recipients.length === 0) return 'skipped';

    const range = dayIsoRange(tenant.defaultTimezone, localDate);
    const overview = await this.tenantContext.runAsSystemTenant(tenant.id, () =>
      this.analytics.getBusinessOperationalOverview(tenant.id, range),
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
      userIds: recipients,
      fanoutOwners: false,
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
    return this.readHour('OWNER_REPORTS_MORNING_HOUR', 8);
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
