import { staffTelegramEligible } from '../package5-wave1/governed-settings.read';
import { type OwnerReportRun } from '@prisma/client';
import { OwnerReportStore } from './owner-report.store';
import { CommunicationDeliveryService } from '../communication-delivery/communication-delivery.service';
import { ActionConflictError } from '../action-engine/action-engine.errors';
import {
  normalizeOwnerReportPlan,
  normalizeCanonicalOwnerReportPlan,
  MORNING_REPORT_CONTRACT,
  MORNING_STAFF_ROLES,
  type MorningReportPlan,
  type OwnerReportSlot,
  OWNER_REPORT_ACTION,
  OWNER_REPORT_CONTRACT,
  OWNER_REPORT_DAY,
  OWNER_REPORT_ORDER,
  OWNER_REPORT_ROLES,
  type OwnerReportPlan,
} from './owner-report.contract';
import {
  Injectable,
  Logger,
  Optional,
  ForbiddenException,
} from '@nestjs/common';
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
    @Optional() private readonly reportStore?: OwnerReportStore,
    @Optional() private readonly reportDelivery?: CommunicationDeliveryService,
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
        await this.resumePendingDailyReports(tenant.id, now);
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
    if (!this.reportStore || !this.reportDelivery)
      throw new Error('B36_OWNER_REPORT_FOUNDATION_REQUIRED');
    return this.tenantContext.runAsSystemTenant(tenant.id, async () => {
      let facts: Promise<BusinessState> | undefined;
      const read = () =>
        (facts ??= this.readState(
          tenant,
          localCalendarDate(tenant.defaultTimezone, now),
          { financeAllowed: false },
        ));
      const owner = await this.runMorningKind(
        tenant,
        'morning_owner',
        now,
        read,
      );
      const staff = await this.runMorningKind(
        tenant,
        'morning_staff',
        now,
        read,
      );
      return owner === 'sent' || staff === 'sent' ? 'sent' : 'skipped';
    });
  }

  private async frozenSlots(
    tenantId: string,
    userId: string,
    membershipId: string,
  ): Promise<OwnerReportSlot[]> {
    const [identities, devices] = await Promise.all([
      this.prisma.authIdentity.findMany({
        where: { tenantId, userId, provider: 'telegram' },
        select: { id: true, providerUserId: true },
      }),
      this.prisma.devicePushToken.findMany({
        where: { tenantId, userId, platform: 'ios' },
        select: { id: true, token: true },
      }),
    ]);
    return [
      this.reportStore!.slot(tenantId, userId, 'inbox', membershipId, userId),
      ...((await staffTelegramEligible(
        this.prisma,
        tenantId,
        userId,
        membershipId,
      ))
        ? identities
        : []
      ).map((route) =>
        this.reportStore!.slot(
          tenantId,
          userId,
          'telegram',
          route.id,
          route.providerUserId,
        ),
      ),
      ...devices.map((route) =>
        this.reportStore!.slot(tenantId, userId, 'apns', route.id, route.token),
      ),
    ];
  }

  private async runMorningKind(
    tenant: EligibleTenant,
    reportType: MorningReportPlan['reportType'],
    now: Date,
    read: () => Promise<BusinessState>,
  ): Promise<'sent' | 'skipped'> {
    const localDate = localCalendarDate(tenant.defaultTimezone, now);
    const existing = await this.reportStore!.find(
      tenant.id,
      localDate,
      reportType,
    );
    if (existing) return this.resumeDailyReport(existing, now);
    if (
      !this.reportStore!.canAdmitPeriod(
        tenant.defaultTimezone,
        localDate,
        now,
        reportType,
      )
    )
      return 'skipped';
    const staffReport = reportType === 'morning_staff';
    const memberships = await this.prisma.membership.findMany({
      where: {
        tenantId: tenant.id,
        status: 'active',
        user: { status: 'active' },
        role: {
          in: [...(staffReport ? MORNING_STAFF_ROLES : OWNER_REPORT_ROLES)],
        },
      },
      select: { id: true, userId: true, role: true },
    });
    const enabled = new Set(
      await this.dashboardPreferences.filterUsersWithAssistantCapability(
        tenant.id,
        memberships.map((m) => m.userId),
        'daily_brief',
      ),
    );
    const recipients: MorningReportPlan['recipients'] = [];
    for (const member of memberships.filter((m) => enabled.has(m.userId))) {
      const binding = staffReport
        ? await this.reportStore!.staffBinding(tenant.id, member.userId)
        : null;
      if (staffReport && !binding) continue;
      const state = await read();
      const composed = binding
        ? composeMasterMorningBrief({
            facts: masterBriefFacts(state, binding.externalRef, localDate),
          })
        : composeMorningBrief({ facts: businessBriefFacts(state, localDate) });
      recipients.push({
        userId: member.userId,
        membershipId: member.id,
        role: member.role as MorningReportPlan['recipients'][number]['role'],
        staffId: binding?.staffId ?? null,
        staffBindingEvidenceHash: binding?.evidenceHash ?? null,
        content: { ...composed, deepLink: '/app/?panel=chat' },
        slots: await this.frozenSlots(tenant.id, member.userId, member.id),
      });
    }
    if (!recipients.length) return 'skipped';
    const period = dayIsoRange(tenant.defaultTimezone, localDate);
    const periodEnd = new Date(Date.parse(period.to) + 1).toISOString();
    const plan = normalizeCanonicalOwnerReportPlan({
      contract: MORNING_REPORT_CONTRACT,
      tenantId: tenant.id,
      reportType,
      periodLocalDate: localDate,
      reportVersion: 1,
      timezone: tenant.defaultTimezone,
      periodStart: period.from,
      periodEnd,
      expiresAt: new Date(
        Date.parse(periodEnd) + 7 * OWNER_REPORT_DAY,
      ).toISOString(),
      classification: 'operational_single',
      channelOrder: OWNER_REPORT_ORDER,
      policy: {
        action: OWNER_REPORT_ACTION,
        key: 'production.deliver_report_briefing.proven-cutover',
        version: 1,
        preference: 'daily_brief',
      },
      recipients,
    });
    let run: OwnerReportRun;
    try {
      run = await this.reportStore!.admit(plan, now);
    } catch (error) {
      if (!(error instanceof ActionConflictError)) throw error;
      const winner = await this.reportStore!.find(
        tenant.id,
        localDate,
        reportType,
      );
      if (!winner) throw error;
      run = winner;
    }
    return this.resumeDailyReport(run, now);
  }

  private async listMasterMorningRecipients(
    tenantId: string,
  ): Promise<Map<string, string>> {
    if (!this.reportStore)
      throw new Error('B36_OWNER_REPORT_FOUNDATION_REQUIRED');
    const members = await this.prisma.membership.findMany({
      where: {
        tenantId,
        status: 'active',
        user: { status: 'active' },
        role: { in: MASTER_ROLES },
      },
      select: { userId: true },
    });
    const recipients = new Map<string, string>();
    for (const member of members) {
      const binding = await this.reportStore.staffBinding(
        tenantId,
        member.userId,
      );
      if (binding) recipients.set(member.userId, binding.externalRef);
    }
    return recipients;
  }

  async runDailyReport(
    tenant: EligibleTenant,
    now: Date = new Date(),
  ): Promise<'sent' | 'skipped'> {
    if (!this.reportStore || !this.reportDelivery)
      throw new Error('B36_OWNER_REPORT_FOUNDATION_REQUIRED');
    return this.tenantContext.runAsSystemTenant(tenant.id, async () => {
      const localDate = localCalendarDate(tenant.defaultTimezone, now);
      const existing = await this.reportStore!.find(tenant.id, localDate);
      if (existing) return this.resumeDailyReport(existing, now);
      if (
        !this.reportStore!.canAdmitPeriod(
          tenant.defaultTimezone,
          localDate,
          now,
        )
      )
        return 'skipped';
      const memberships = await this.prisma.membership.findMany({
        where: {
          tenantId: tenant.id,
          status: 'active',
          role: { in: [...OWNER_REPORT_ROLES] },
          user: { status: 'active' },
        },
        select: { id: true, userId: true, role: true },
      });
      const enabled = new Set(
        await this.dashboardPreferences.filterUsersWithAssistantCapability(
          tenant.id,
          memberships.map((m) => m.userId),
          'daily_brief',
        ),
      );
      const recipients: OwnerReportPlan['recipients'] = [];
      for (const member of memberships.filter((m) => enabled.has(m.userId))) {
        recipients.push({
          userId: member.userId,
          membershipId: member.id,
          role: member.role as OwnerReportPlan['recipients'][number]['role'],
          slots: await this.frozenSlots(tenant.id, member.userId, member.id),
        });
      }
      if (!recipients.length) return 'skipped';
      // Preserve the existing canonical financial/business facts and composition.
      const state = await this.readState(tenant, localDate, {
        financeAllowed: true,
      });
      const facts = businessBriefFacts(state, localDate);
      if (facts.revenue.basis === 'unavailable')
        this.logger.warn(
          `daily_report finance unavailable tenant=${tenant.slug} date=${localDate}`,
        );
      const composed = composeDailyReport({ facts });
      const period = dayIsoRange(tenant.defaultTimezone, localDate);
      const periodEnd = new Date(Date.parse(period.to) + 1).toISOString();
      const plan = normalizeOwnerReportPlan({
        contract: OWNER_REPORT_CONTRACT,
        tenantId: tenant.id,
        reportType: 'daily_report',
        periodLocalDate: localDate,
        reportVersion: 1,
        timezone: tenant.defaultTimezone,
        periodStart: period.from,
        periodEnd,
        expiresAt: new Date(
          Date.parse(periodEnd) + 7 * OWNER_REPORT_DAY,
        ).toISOString(),
        classification: 'operational_single',
        channelOrder: OWNER_REPORT_ORDER,
        policy: {
          action: OWNER_REPORT_ACTION,
          key: 'production.deliver_report_briefing.proven-cutover',
          version: 1,
          preference: 'daily_brief',
        },
        content: { ...composed, deepLink: '/app/?panel=chat' },
        recipients,
      });
      let run: OwnerReportRun;
      try {
        run = await this.reportStore!.admit(plan, now);
      } catch (error) {
        if (!(error instanceof ActionConflictError)) throw error;
        // A losing scheduler discards its candidate and resumes the committed winner.
        const winner = await this.reportStore!.find(tenant.id, localDate);
        if (!winner) throw error;
        run = winner;
      }
      return this.resumeDailyReport(run, now);
    });
  }

  /** The authenticated integration trigger cannot supply report content, dates or recipients. */
  async triggerDailyReport(tenantId: string, now = new Date()) {
    const tenant = (await this.listEligibleTenants()).find(
      (t) => t.id === tenantId,
    );
    if (!tenant || !this.reportStore)
      throw new ForbiddenException('B36_REPORT_TENANT_NOT_ELIGIBLE');
    return this.tenantContext.runAsSystemTenant(tenant.id, async () => {
      const existing = await this.reportStore!.find(
        tenant.id,
        localCalendarDate(tenant.defaultTimezone, now),
      );
      if (
        !existing &&
        localHour(tenant.defaultTimezone, now) !== this.eveningHour()
      )
        return { status: 'skipped' };
      return { status: await this.runDailyReport(tenant, now) };
    });
  }

  /** The qualified legacy producer selects only a finite kind, never recipients/content/dates. */
  async triggerMorningReport(
    tenantId: string,
    reportType: MorningReportPlan['reportType'],
    now = new Date(),
  ) {
    const tenant = (await this.listEligibleTenants()).find(
      (t) => t.id === tenantId,
    );
    if (!tenant || !this.reportStore)
      throw new ForbiddenException('R05_REPORT_TENANT_NOT_ELIGIBLE');
    return this.tenantContext.runAsSystemTenant(tenantId, async () => ({
      status: await this.runMorningKind(tenant, reportType, now, () =>
        this.readState(tenant, localCalendarDate(tenant.defaultTimezone, now), {
          financeAllowed: false,
        }),
      ),
    }));
  }

  private async resumePendingDailyReports(tenantId: string, now: Date) {
    if (!this.reportStore || !this.reportDelivery)
      throw new Error('B36_OWNER_REPORT_FOUNDATION_REQUIRED');
    await this.tenantContext.runAsSystemTenant(tenantId, async () => {
      await this.reportStore!.purgeExpiredPayloads(tenantId, now);
      const runs = await this.prisma.ownerReportRun.findMany({
        where: {
          tenantId,
          expiresAt: { gt: now },
          payloadRetentionUntil: { gt: now },
          intentEncrypted: { not: null },
          executions: {
            some: { state: { in: ['READY', 'EXECUTING', 'UNKNOWN'] } },
          },
        },
        orderBy: [{ periodLocalDate: 'asc' }, { id: 'asc' }],
      });
      for (const run of runs) await this.resumeDailyReport(run, now);
    });
  }

  private async resumeDailyReport(
    run: OwnerReportRun,
    now: Date,
  ): Promise<'sent' | 'skipped'> {
    if (
      run.expiresAt <= now ||
      run.payloadRetentionUntil <= now ||
      !run.intentEncrypted
    )
      return 'skipped';
    const plan = this.reportStore!.readPlan(run, now);
    const initial = await this.reportStore!.executions(run, plan);
    if (initial.every((e) => e.state === 'SUCCEEDED')) return 'skipped';
    // Each recipient progresses independently; its immutable slots are strictly sequential.
    await Promise.all(
      plan.recipients.map(async (recipient) => {
        for (const slot of recipient.slots) {
          const executions = await this.reportStore!.executions(run, plan);
          const execution = executions.find(
            (e) => e.ownerReportSlotKey === slot.key,
          )!;
          if (execution.state === 'SUCCEEDED') continue;
          if (
            execution.state === 'FAILED' ||
            execution.state === 'NOT_EXECUTED'
          )
            break;
          try {
            await this.reportDelivery!.deliverOwnerReportSlot(
              run.tenantId,
              run.id,
              slot.key,
            );
          } catch {
            // Preserve the engine's UNKNOWN/terminal evidence; never choose another route.
            this.logger.warn(
              `daily_report slot unresolved run=${run.id} slot=${slot.key}`,
            );
            break;
          }
          const after = await this.prisma.actionExecution.findUniqueOrThrow({
            where: {
              id_tenantId: { id: execution.id, tenantId: run.tenantId },
            },
            select: { state: true },
          });
          if (after.state !== 'SUCCEEDED') break;
        }
      }),
    );
    const complete = (await this.reportStore!.executions(run, plan)).every(
      (e) => e.state === 'SUCCEEDED',
    );
    return complete ? 'sent' : 'skipped';
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
          const used = new Map<string, number>();
          for (const row of rows) {
            const name = row.name?.trim();
            if (!name) {
              if (!names.has(row.externalId)) {
                names.set(row.externalId, 'Мастер');
              }
              continue;
            }
            if (names.get(row.externalId) === name) continue;
            /**
             * 🔴 Тёзки обязаны различаться. В денежном списке вечернего отчёта
             * две строки «Илья» неразличимы, а это единственное место, где
             * владелец видит зарплаты смены.
             */
            const seen = (used.get(name) ?? 0) + 1;
            used.set(name, seen);
            names.set(row.externalId, seen > 1 ? `${name} (${seen})` : name);
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
