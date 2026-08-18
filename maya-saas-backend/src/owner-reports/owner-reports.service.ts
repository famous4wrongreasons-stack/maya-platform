import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantStatus, UserRole, CalendarSource } from '@prisma/client';

import {
  BusinessStateService,
  type BusinessState,
  type StaffIdentityRow,
} from '../business-state/business-state.service';
import { DashboardPreferencesService } from '../dashboard-preferences/dashboard-preferences.service';
import { InboxService } from '../inbox/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  composeDailyReport,
  composeMasterMorningBrief,
  composeMorningBrief,
} from './owner-reports.composers';
import { businessBriefFacts, masterBriefFacts } from './owner-reports.facts';
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
    /**
     * 🔴 Cycle 04 P4. Отчёты СПРАШИВАЮТ факты, а не считают их.
     *
     * Раньше здесь стоял сервис аналитики, и бриф собирал числа из сырого
     * обзора сам: `?? 0` по дороге к тексту стирал разницу между «отмен не
     * было» и «журнал прочитан не целиком», а вечерний отчёт складывал строки
     * счетов и печатал «касса пустая или недоступна» одной фразой.
     */
    private readonly businessState: BusinessStateService,
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

    const state = await this.readState(tenant, localDate, {
      financeAllowed: false,
    });
    let stored = 0;
    if (!ownerAlreadySent && ownerRecipients.length > 0) {
      const composed = composeMorningBrief({
        facts: businessBriefFacts(state, localDate),
      });
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
      state,
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
    state: BusinessState,
    recipients: Map<string, string>,
  ): Promise<number> {
    let stored = 0;
    for (const [userId, externalId] of recipients) {
      const sourceEventId = this.masterMorningSourceEventId(localDate, userId);
      const composed = composeMasterMorningBrief({
        facts: masterBriefFacts(state, externalId || null, localDate),
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
        select: { userId: true, externalStaffId: true },
      }),
      this.prisma.internalProvider.findMany({
        where: { tenantId, active: true, userId: { not: null } },
        select: { userId: true, id: true },
      }),
    ]);
    /**
     * 🔴 Ключ сопоставления — ВНЕШНИЙ идентификатор календаря, тот самый, по
     * которому канонический слой отдаёт строки мастеров.
     *
     * До Cycle 04 P4 здесь лежала идентичность Maya (`staffId`), а строку
     * искали в срезе по полю `staff_id`. У арендатора на СОБСТВЕННОМ календаре
     * это поле всегда пустое: оно берётся из `staffProviderLink`, а внутренним
     * мастерам такую связь никто не создаёт. Совпадения не было никогда, и
     * каждый внутренний мастер получал бриф с нулями вместо своего дня —
     * молча, потому что нули выглядят как пустой день.
     *
     * У внешней CRM внешний идентификатор лежит прямо в доступе мастера, у
     * внутреннего календаря им является сам идентификатор провайдера — тот же,
     * что стоит в записях. Одно пространство, никаких переходов.
     */
    const recipients = new Map<string, string>();
    for (const link of crmLinks) {
      if (link.userId && link.externalStaffId)
        recipients.set(link.userId, link.externalStaffId);
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

    /**
     * 🔴 Денежная зависимость сохранена, но она ОДНА.
     *
     * Вечерний отчёт по-прежнему показывает деньги только там, где финансовый
     * контур ответил, — это свойство capability, а не отчёта. Но читает его
     * теперь канонический владелец: раньше отчёт звал финансы сам, складывал
     * строки счетов в наличные и безнал и печатал итог рядом с выручкой,
     * посчитанной другим путём.
     */
    const state = await this.readState(tenant, localDate, {
      financeAllowed: true,
    });

    const composed = composeDailyReport({
      facts: businessBriefFacts(state, localDate),
    });
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

  /**
   * Собрать сводки БЕЗ доставки.
   *
   * 🔴 Нужен для проверки в бою: убедиться, что бриф считает то же, что AI и
   * кабинет, можно только на настоящих данных — но отправлять владельцу лишний
   * бриф ради проверки нельзя. Здесь тот же путь, что и у планировщика, ровно
   * до момента публикации.
   */
  async renderBriefs(
    tenant: EligibleTenant,
    localDate: string,
    options?: { masterExternalIds?: string[] },
  ): Promise<{
    morning: ReturnType<typeof composeMorningBrief>;
    evening: ReturnType<typeof composeDailyReport>;
    masters: Array<{
      externalId: string;
      brief: ReturnType<typeof composeMasterMorningBrief>;
    }>;
    facts: ReturnType<typeof businessBriefFacts>;
  }> {
    const [morningState, eveningState] = await Promise.all([
      this.readState(tenant, localDate, { financeAllowed: false }),
      this.readState(tenant, localDate, { financeAllowed: true }),
    ]);
    const morningFacts = businessBriefFacts(morningState, localDate);
    const eveningFacts = businessBriefFacts(eveningState, localDate);
    const masterIds = options?.masterExternalIds ?? [
      ...(await this.listMasterMorningRecipients(tenant.id)).values(),
    ];
    return {
      morning: composeMorningBrief({ facts: morningFacts }),
      evening: composeDailyReport({ facts: eveningFacts }),
      masters: masterIds.map((externalId) => ({
        externalId,
        brief: composeMasterMorningBrief({
          facts: masterBriefFacts(morningState, externalId || null, localDate),
        }),
      })),
      facts: eveningFacts,
    };
  }

  /**
   * Состояние бизнеса за календарный день арендатора.
   *
   * 🔴 Одно чтение на все сводки этого запуска: и владелец, и каждый мастер
   * получают факты из ОДНОГО состояния. Иначе утренний бриф владельца и бриф
   * мастера могли бы разойтись между собой — два чтения одного дня в разные
   * секунды это уже разные числа.
   *
   * Повтора чтения нет: его не было и до миграции, а планировщик ходит по
   * всем арендаторам подряд.
   */
  private async readState(
    tenant: EligibleTenant,
    localDate: string,
    options: { financeAllowed: boolean },
  ): Promise<BusinessState> {
    const range = dayIsoRange(tenant.defaultTimezone, localDate);
    return this.tenantContext.runAsSystemTenant(tenant.id, () =>
      this.businessState.business({
        tenantId: tenant.id,
        period: range,
        comparisonMode: 'none',
        comparisonPeriod: null,
        financeAllowed: options.financeAllowed,
        // Стоимость записанного — операционный факт владельца салона (P2.1).
        bookedValueAllowed: true,
        operationalDetail: false,
        retryOnFailure: false,
        /**
         * Имена мастеров нужны обеим сводкам: владелец видит недозагруженных
         * поимённо, мастер — собственное имя в приветствии. Решение принимает
         * вызывающий, и здесь оно принято явно: это серверная сборка сводок
         * для тех, кому эти имена и так открыты.
         */
        disclose: (rows: StaffIdentityRow[]) => {
          /**
           * 🔴 Именованная строка сильнее безымянной.
           *
           * В список идентичностей приходят и мастера периода (у них имя есть),
           * и строки расчёта зарплаты (имени в них нет намеренно: как человека
           * зовут в чужой системе — не основание называть его так владельцу).
           * Простая сборка карты «последний выигрывает» стирала бы имя мастера
           * его же безымянной зарплатной строкой.
           */
          const names = new Map<string, string>();
          for (const row of rows) {
            const name = row.name?.trim();
            if (name) names.set(row.externalId, name);
            else if (!names.has(row.externalId)) {
              names.set(row.externalId, 'Мастер');
            }
          }
          return { names, allowedExternalIds: null };
        },
      }),
    );
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
