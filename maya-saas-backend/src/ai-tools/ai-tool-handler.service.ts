import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';
import { AppointmentPeriodReader } from '../business-facts/appointment-period.reader';
import type { AnalyticsRangeQueryDto } from '../analytics/dto/analytics-range-query.dto';
import { AppointmentsService } from '../appointments/appointments.service';
import {
  BusinessStateService,
  type PeriodComparisonMode,
  type StaffDisclosure,
  type StaffIdentityRow,
} from '../business-state/business-state.service';
import { AppointmentNotificationsService } from '../appointment-notifications/appointment-notifications.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BusinessContentService } from '../business-content/business-content.service';
import { UserRole } from '../common/domain.enums';
import { CustomersService } from '../customers/customers.service';
import { CrmService } from '../crm/crm.service';
import type {
  CrmClientSearchResult,
  CrmJournalAppointment,
  StaffScheduleSlot,
} from '../crm/crm-adapter.interface';
import {
  findExpenseCategory,
  resolveExpenseCategory,
  rublesToKopecks,
} from '../expenses/expense-category';
import { ExpensesService } from '../expenses/expenses.service';
import {
  ASSISTANT_CAPABILITIES,
  ASSISTANT_CAPABILITY_CATALOG,
  DEFAULT_ASSISTANT_CAPABILITIES,
} from '../dashboard-preferences/assistant-capabilities.constants';
import { DashboardPreferencesService } from '../dashboard-preferences/dashboard-preferences.service';
import {
  DEFAULT_FINANCE_DASHBOARD_WIDGETS,
  FINANCE_DASHBOARD_WIDGETS,
} from '../dashboard-preferences/finance-dashboard.constants';
import { localDateMinuteToUtc } from '../internal-calendar/internal-calendar.utils';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { InboxService } from '../inbox/inbox.service';
import { MarketingService } from '../marketing/marketing.service';
import { PrismaService } from '../prisma/prisma.service';
import { RecoveryService } from '../recovery/recovery.service';
import { StaffService } from '../staff/staff.service';
import type {
  AiToolPrincipal,
  ValidatedAiToolArguments,
} from './ai-tool.types';
import {
  ReportingPeriodResolver,
  type ReportingPeriodToolArgs,
} from './reporting-period.resolver';
import {
  analyzeClientRegistry,
  type ClientRegistryAnalysis,
} from './client-registry-analysis';
import {
  collectUpsellOpportunities,
  computePeriodMoneyMotivation,
  historicalAddonOpportunity,
  toMotivationVisit,
} from './master-money-motivation';
import { parseVisitOutcome, unavailableAuthorityView } from '../domain';
import type { PeriodRead } from '../domain';

const CRM_FINANCE_ROLES = new Set<UserRole>([
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.ACCOUNTANT,
]);
const SCHEDULE_MANAGER_ROLES = new Set<UserRole>([
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.BRANCH_MANAGER,
]);
/**
 * Кому можно показывать именованный разрез ПО ВСЕМ мастерам.
 *
 * Список повторяет BUSINESS_ROLES из каталога инструментов — те же владелец,
 * админ, управляющий и бухгалтер. Дублирование намеренное: каталог решает,
 * кого пускать к инструменту, а это — кого пускать к чужим именам. Если
 * когда-нибудь бизнес-аналитику откроют мастеру, имена коллег не поедут
 * вместе с ней.
 */
/**
 * Кому показывать СТОИМОСТЬ ЗАПИСАННОГО.
 *
 * 🔴 Это не касса и не выручка: сумма цен того, что стоит в журнале. Право на
 * неё совпадает с правом на бизнес-разрез — тот же список, что охраняет
 * `/analytics/business` в кабинете, плюс руководитель филиала, который в
 * разрезе мастеров уже есть.
 *
 * Отдельная константа, а не переиспользование денежного списка: сложить их
 * значило бы снова связать два факта, которые P2 развёл.
 */
const BOOKED_VALUE_ROLES = new Set<UserRole>([
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.BRANCH_MANAGER,
  UserRole.ACCOUNTANT,
]);

const NAMED_STAFF_BREAKDOWN_ROLES = new Set<UserRole>([
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.BRANCH_MANAGER,
  UserRole.ACCOUNTANT,
]);

/**
 * Деньги мастера: что CRM подтверждает поимённо, а что — нет.
 *
 * Подтверждённая выручка мастера публикуется только для тех финансовых
 * операций услуг, которые YClients связал с записью и конкретным
 * мастером. Несвязанная касса не распределяется по ценам записей или
 * другим приблизительным признакам. Зарплата CRM остаётся отдельным показателем.
 *
 * Поэтому начисления и выручка разведены в два разных поля строки мастера:
 * `salary` (что салон должен мастеру) и `confirmed_revenue` (сколько он принёс
 * в кассу по точно связанным операциям). Складывать их в одно поле нельзя:
 * для салона с процентной схемой начисление — это доля от выручки, и подмена
 * одного другим занижает деньги мастера ровно во столько раз, во сколько
 * отличается его процент.
 */

/**
 * Телефон гостя видит только владелец. Мастеру и администратору хватает имени,
 * чтобы узнать своего клиента; база контактов — актив салона, а не сотрудника.
 */
/**
 * Предел размера кэшей фактов периода. Вытеснение меняет скорость, а не правду.
 */
const PERIOD_CACHE_MAX_ENTRIES = 200;

const DORMANT_PHONE_ROLES = new Set<UserRole>([
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
]);

@Injectable()
export class AiToolHandlerService {
  private readonly businessQueryCache = new Map<
    string,
    { expiresAt: number; value: unknown }
  >();
  private readonly employeeQueryCache = new Map<
    string,
    { expiresAt: number; value: unknown }
  >();
  private readonly clientRegistryCache = new Map<
    string,
    { expiresAt: number; value: ClientRegistryAnalysis }
  >();

  constructor(
    private readonly crmService: CrmService,
    private readonly appointmentsService: AppointmentsService,
    private readonly loyaltyService: LoyaltyService,
    private readonly analyticsService: OperationsAnalyticsService,
    private readonly expensesService: ExpensesService,
    private readonly prisma: PrismaService,
    private readonly customersService: CustomersService,
    private readonly staffService: StaffService,
    /**
     * 🔴 Cycle 04 P1. Канонический владелец состояния бизнеса.
     *
     * Направление зависимости одностороннее: слой, который разговаривает,
     * СПРАШИВАЕТ у слоя, который считает. Второй копии вычисления здесь больше
     * нет — храповик границы следит, чтобы она не вернулась.
     */
    private readonly businessState: BusinessStateService,
    /**
     * 🔴 Cycle 04 P6. Единственный читатель записей за бизнес-период.
     *
     * Слой инструментов читал журнал собственной нарезкой окон. Теперь он
     * пользуется тем же читателем, что и канонический владелец фактов: окно,
     * дедупликация и признание источника в полноте живут в одном месте.
     */
    private readonly appointmentPeriodReader: AppointmentPeriodReader,
    private readonly dashboardPreferencesService?: DashboardPreferencesService,
    private readonly inboxService?: InboxService,
    private readonly auditLogService?: AuditLogService,
    private readonly recoveryService?: RecoveryService,
    private readonly marketingService?: MarketingService,
    private readonly appointmentNotificationsService?: AppointmentNotificationsService,
    private readonly businessContentService?: BusinessContentService,
  ) {}

  async execute(
    toolName: string,
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
    idempotencyKey: string,
  ): Promise<unknown> {
    switch (toolName) {
      case 'catalog.staff.read':
        return this.readStaff(principal.tenantId);
      case 'booking.upsell.suggest':
        return this.suggestClientUpsell(principal, args);
      case 'customers.count':
        return this.customersService.countCustomers(principal.tenantId);
      case 'clients.retention.scan':
        return this.scanClientRetention(principal.tenantId);
      case 'clients.dossier.read':
        return this.readClientDossier(principal, args);
      case 'clients.high-value.read':
        return this.readHighValueClients(principal, args);
      case 'clients.dormant.list':
        return this.readDormantClients(principal, args);
      case 'clients.no-show-risk.read':
        return this.readNoShowRiskClients(principal, args);
      case 'catalog.services.read':
        return this.readServices(principal.tenantId);
      case 'booking.availability.read':
        return this.readAvailability(principal.tenantId, args);
      case 'booking.group-availability.read':
        return this.readGroupAvailability(principal.tenantId, args);
      case 'inventory.stock.read':
        return this.requireBusinessContentService().listCatalog(
          principal.tenantId,
          'inventory',
          { lowStockOnly: args.low_stock_only === true },
        );
      case 'commerce.certificates.read':
        return this.requireBusinessContentService().listCatalog(
          principal.tenantId,
          'certificate',
        );
      case 'commerce.memberships.read':
        return this.requireBusinessContentService().listCatalog(
          principal.tenantId,
          'membership',
        );
      case 'referrals.status.read':
        return this.requireBusinessContentService().getReferralProgram(
          principal.tenantId,
        );
      case 'reviews.list.read':
        return this.requireBusinessContentService().listReviews(
          principal.tenantId,
          {
            days: Number(args.days),
            ...(args.rating === undefined
              ? {}
              : { rating: Number(args.rating) }),
            limit: Number(args.limit),
            ...(typeof args.branch_id === 'string'
              ? { branchId: args.branch_id }
              : {}),
          },
        );
      case 'reviews.analyze': {
        const options = {
          days: Number(args.days),
          ...(typeof args.branch_id === 'string'
            ? { branchId: args.branch_id }
            : {}),
        };
        return args.mode === 'trend'
          ? this.requireBusinessContentService().reviewTrend(
              principal.tenantId,
              options,
            )
          : this.requireBusinessContentService().analyzeReviews(
              principal.tenantId,
              options,
            );
      }
      case 'appointments.own.list':
        return this.listOwnAppointments(principal);
      case 'loyalty.own.read':
        return this.readOwnLoyalty(principal);
      case 'analytics.employee.query':
        return this.queryEmployeeAnalytics(principal, args);
      case 'analytics.business.query':
        return this.queryBusinessAnalytics(principal, args);
      case 'analytics.business.profit':
        return this.readBusinessProfit(principal, args);
      case 'analytics.revenue.forecast':
        return this.forecastBusinessRevenue(principal, args);
      case 'analytics.team-kpi.read':
        return this.readTeamKpi(principal, args);
      case 'analytics.branches.compare':
        return this.compareBranches(principal, args);
      case 'reports.recovered':
        return this.readRecoveredReport(principal, args);
      case 'expenses.read':
        return this.readExpenses(principal.tenantId, args);
      case 'expenses.create':
        return this.createExpense(principal, args, idempotencyKey);
      case 'expenses.period.complete':
        return this.declareExpensePeriodComplete(
          principal,
          args,
          idempotencyKey,
        );
      case 'appointments.own.cancel':
        return this.cancelOwnAppointment(principal, args);
      case 'appointments.own.create':
        return this.createOwnAppointment(principal, args);
      case 'appointments.own.reschedule':
        return this.rescheduleOwnAppointment(principal, args);
      case 'staff.schedule.read':
        return this.readStaffScheduleDay(principal, args);
      case 'staff.schedule.own.read':
        return this.readOwnStaffScheduleDay(principal, args);
      case 'operations.journal.read':
        return this.readOperationsJournalDay(principal, args);
      case 'staff.schedule.update':
        return this.applyStaffScheduleDayChange(principal, args);
      case 'loyalty.internal.adjust':
        return this.adjustInternalLoyalty(principal, args, idempotencyKey);
      case 'company.business-hours.read':
        return this.readBusinessHours(principal.tenantId);
      case 'settings.read':
        return this.readSettings(principal);
      case 'settings.update':
        return this.updateSettings(principal, args);
      case 'tasks.list':
        return this.listTasks(principal, args);
      case 'tasks.create':
        return this.createTask(principal, args, idempotencyKey);
      case 'tasks.complete':
        return this.completeTask(principal, args);
      case 'marketing.audience.find':
        return this.requireMarketingService().findAudience({
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          rule: {
            inactive_days: Number(args.inactive_days),
            minimum_visits: Number(args.minimum_visits),
            max_recipients: Number(args.max_recipients),
          },
        });
      case 'marketing.campaign.preview':
        return this.requireMarketingService().previewCampaign({
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          audienceId: String(args.audience_id),
          message: String(args.message),
        });
      case 'marketing.campaign.send':
        return this.requireMarketingService().sendCampaign({
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          campaignId: String(args.campaign_id),
          idempotencyKey,
        });
      case 'notifications.appointments.read':
        return this.requireAppointmentNotificationsService().getSettings(
          principal.tenantId,
        );
      case 'notifications.appointments.update':
        return this.requireAppointmentNotificationsService().updateSettings(
          principal.tenantId,
          principal.userId,
          {
            enabled: args.enabled === true,
            leadTimesMinutes: Array.isArray(args.lead_times_minutes)
              ? args.lead_times_minutes.map(Number)
              : undefined,
          },
        );
      case 'support.integration-status.read':
        return this.readIntegrationStatus(principal.tenantId);
      case 'support.contact-admin.request':
        return this.requestAdministratorContact(
          principal,
          args,
          idempotencyKey,
        );
      default:
        throw new Error('Unreachable AI tool handler');
    }
  }

  private async requestAdministratorContact(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
    idempotencyKey: string,
  ) {
    const recipients = await this.prisma.membership.findMany({
      where: {
        tenantId: principal.tenantId,
        status: 'active',
        role: {
          in: [
            UserRole.TENANT_OWNER,
            UserRole.BUSINESS_OWNER,
            UserRole.TENANT_ADMIN,
            UserRole.ADMINISTRATOR,
          ],
        },
      },
      select: { userId: true },
    });
    const userIds = [...new Set(recipients.map((row) => row.userId))];
    if (userIds.length === 0) {
      return {
        accepted: false,
        reason: 'active_administrator_not_configured',
        next_action: 'business_owner_must_assign_an_active_administrator',
      };
    }

    const reason =
      typeof args.reason === 'string' && args.reason.trim()
        ? args.reason.trim()
        : 'Клиент просит администратора связаться с ним.';
    const sourceEventId = `maya-contact:${idempotencyKey}`.slice(0, 160);
    const published = await this.requireInboxService().publishForTenant(
      principal.tenantId,
      {
        type: 'client_support_request',
        sourceEventId,
        title: 'Клиент просит связаться',
        bodyText: reason,
        payload: {
          channel: 'maya_chat',
          requester_role: principal.role,
        },
        deepLink: '/clients',
        userIds,
        fanoutOwners: false,
      },
    );

    return {
      accepted: published.stored > 0,
      delivered_to_active_administrators: published.stored,
      channel: 'maya_inbox',
      persistent: true,
      push_announcement_requested: true,
    };
  }

  private async scanClientRetention(
    tenantId: string,
  ): Promise<ClientRegistryAnalysis> {
    /**
     * 🔴 Cycle 04 P7. Ключ включает календарный день арендатора.
     *
     * Разбор реестра считается ОТНОСИТЕЛЬНО «сегодня»: группы давности визита
     * меняются вместе с датой. Ключ был только арендаторным, и снимок,
     * посчитанный в 23:58, отдавался в 00:01 следующих суток как сегодняшний —
     * с вчерашней точкой отсчёта.
     */
    const timezone = await this.reportingTimezone(tenantId);
    const asOf = this.localDate(new Date(), timezone);
    const cacheKey = `${tenantId}|${asOf}`;
    const cached = this.clientRegistryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const snapshot = await this.crmService.getClientRegistry(tenantId);
    const value = analyzeClientRegistry(snapshot, asOf);
    this.clientRegistryCache.set(cacheKey, {
      expiresAt: Date.now() + 5 * 60 * 1_000,
      value,
    });
    return value;
  }

  private async readServices(tenantId: string) {
    const services = await this.crmService.getServices(tenantId);
    return {
      services: services.map((service) => ({
        id: service.id,
        name: service.name,
        price: service.price,
        duration_minutes: service.duration_minutes,
        currency: service.currency,
        category: service.category ?? null,
      })),
    };
  }

  private async listOwnAppointments(principal: AiToolPrincipal) {
    const appointments = await this.appointmentsService.listClientAppointments(
      principal.tenantId,
      principal.userId,
    );
    return {
      appointments: appointments.map((item) => this.safeAppointment(item)),
    };
  }

  /**
   * Публичный список мастеров для гостевого чата и записи.
   * Имена на витрине уже публичны — обезличивать specialist_N нельзя,
   * иначе MAYA не может рассказать клиенту о барберах.
   */
  private async readStaff(tenantId: string) {
    const [staff, tenant] = await Promise.all([
      this.staffService.listStaff(tenantId),
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          name: true,
          brandingSettings: {
            select: {
              appName: true,
              contactDetailsJson: true,
              onboardingJson: true,
              storeListingJson: true,
            },
          },
        },
      }),
    ]);
    const branding = tenant?.brandingSettings;
    const contacts = this.record(branding?.contactDetailsJson);
    const onboarding = this.record(branding?.onboardingJson);
    const store = this.record(branding?.storeListingJson);
    const aboutRaw = this.stringList(
      onboarding.about ?? store.about ?? contacts.about,
    );
    const about =
      aboutRaw.length > 0
        ? aboutRaw
        : this.defaultSalonAbout(tenant?.name ?? branding?.appName ?? null);
    return {
      salon: {
        name: branding?.appName ?? tenant?.name ?? null,
        city: typeof contacts.city === 'string' ? contacts.city : null,
        address: typeof contacts.address === 'string' ? contacts.address : null,
        phone: typeof contacts.phone === 'string' ? contacts.phone : null,
        tagline:
          typeof contacts.tagline === 'string'
            ? contacts.tagline
            : typeof store.tagline === 'string'
              ? store.tagline
              : null,
        about,
        founded_hint:
          typeof onboarding.founded_year === 'string' ||
          typeof onboarding.founded_year === 'number'
            ? String(onboarding.founded_year)
            : this.defaultFoundedHint(
                tenant?.name ?? branding?.appName ?? null,
              ),
      },
      staff: staff.map((item) => ({
        id: item.id,
        name: item.name,
        title: item.title ?? null,
        specialization: item.specialization ?? null,
      })),
    };
  }

  private async readClientDossier(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) {
      return {
        found: false,
        error: 'Нужно имя (≥3 букв) или телефон (≥4 цифр).',
      };
    }

    let matches: CrmClientSearchResult[] = [];
    for (const searchQuery of this.clientSearchQueries(query)) {
      try {
        matches = await this.crmService.searchClients(
          principal.tenantId,
          searchQuery,
        );
      } catch {
        return {
          found: false,
          error: 'Поиск клиентов в CRM сейчас недоступен.',
        };
      }
      if (matches.length > 0) {
        break;
      }
    }

    if (!matches.length) {
      return {
        found: false,
        error: 'Клиент не найден. Уточни имя (≥3 букв) или телефон (≥4 цифр).',
      };
    }

    const client = matches[0];
    // 🔴 Владелец баланса спрашивается у границы, а не подразумевается.
    // До P5 досье брало карту провайдера напрямую и выдавало её за баланс —
    // при том что для этого арендатора авторитетен другой источник, и один
    // человек получал в кабинете и в досье два разных числа без объяснения.
    const [history, loyalty, timezone, loyaltyAuthority] = await Promise.all([
      this.crmService
        .getClientVisitHistory(principal.tenantId, client.id, 30)
        .catch(() => []),
      client.phone
        ? this.crmService
            .getClientLoyalty(principal.tenantId, client.phone)
            .catch(() => null)
        : Promise.resolve(null),
      this.reportingTimezone(principal.tenantId).catch(() => 'UTC'),
      // 🔴 Снимок границы, а не собственный вывод. При отказе владелец
      // НЕИЗВЕСТЕН: подставлять `crm` значило бы выдумать его — при внутреннем
      // календаре владелец `maya`, при внешнем журнале `legacy_bot`.
      this.loyaltyService
        .authoritySnapshot(principal.tenantId)
        .catch(() => unavailableAuthorityView()),
    ]);

    const serviceCounter = new Map<string, number>();
    let totalSpent = 0;
    const dates: string[] = [];
    for (const visit of history) {
      for (const name of visit.service_names) {
        serviceCounter.set(name, (serviceCounter.get(name) ?? 0) + 1);
      }
      if (
        typeof visit.total_price === 'number' &&
        Number.isFinite(visit.total_price)
      ) {
        totalSpent += visit.total_price;
      }
      if (visit.start.length >= 10) {
        dates.push(visit.start.slice(0, 10));
      }
    }
    dates.sort();

    let avgCycleDays: number | null = null;
    if (dates.length >= 2) {
      const gaps: number[] = [];
      for (let index = 1; index < dates.length; index += 1) {
        const prev = Date.parse(`${dates[index - 1]}T00:00:00.000Z`);
        const next = Date.parse(`${dates[index]}T00:00:00.000Z`);
        if (!Number.isFinite(prev) || !Number.isFinite(next)) {
          continue;
        }
        const gap = Math.round((next - prev) / (24 * 60 * 60 * 1000));
        if (gap > 0) {
          gaps.push(gap);
        }
      }
      if (gaps.length > 0) {
        avgCycleDays = Math.round(
          gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length,
        );
      }
    }

    const favoriteServices = [...serviceCounter.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)
      .map(([name]) => name);

    const exactVisits = client.visits_count ?? history.length;
    const exactTotalSpent = client.sold_amount ?? Math.round(totalSpent);
    const exactLastVisit =
      client.last_visit_date ??
      (dates.length > 0 ? dates[dates.length - 1] : null);
    const asOf = this.localDate(new Date(), timezone);
    const inactivityDays = exactLastVisit
      ? Math.max(
          0,
          Math.floor(
            (Date.parse(`${asOf}T00:00:00.000Z`) -
              Date.parse(`${exactLastVisit}T00:00:00.000Z`)) /
              (24 * 60 * 60 * 1_000),
          ),
        )
      : null;

    return {
      found: true,
      // 152-ФЗ: реальное ФИО и телефон не уходят во внешнюю модель.
      display_name: 'клиент',
      matches_count: matches.length,
      visits: exactVisits,
      visits_scope:
        client.visits_count === null
          ? 'recent_attended_history_fallback'
          : 'full_crm_card',
      last_visit: exactLastVisit,
      inactivity_days: inactivityDays,
      favorite_services: favoriteServices,
      services_scope: 'last_30_attended_visits',
      avg_cycle_days: avgCycleDays,
      total_spent: exactTotalSpent,
      total_spent_scope:
        client.sold_amount === null
          ? 'recent_attended_history_fallback'
          : 'full_crm_card',
      loyal: exactVisits >= 3,
      loyalty_segment: this.clientLoyaltySegment(exactVisits),
      loyalty_rule: 'Лояльный клиент — не менее 3 визитов по карточке CRM.',
      bonus_balance: loyalty?.balance ?? null,
      bonus_currency: loyalty?.currency ?? null,
      // Число прочитано с карты провайдера — это наблюдение, а не обязательно
      // авторитетный баланс. Если владелец другой, так и сказано.
      bonus_observed_from: 'crm' as const,
      bonus_authority: loyaltyAuthority.authority,
      // Досье к владельцу за КОНКРЕТНЫМ человеком не ходит — это снимок
      // настройки арендатора. Область действия названа, а не подразумевается.
      bonus_authority_scope: loyaltyAuthority.authority_scope,
      bonus_is_authoritative: loyaltyAuthority.authority === 'crm',
      bonus_status: !loyalty
        ? 'unavailable'
        : loyaltyAuthority.authority === 'crm'
          ? 'available'
          : 'observed_not_authoritative',
      note:
        matches.length > 1
          ? 'Найдено несколько совпадений — взято первое. Телефон и имя не показывай; это история и привычки для тёплого приёма.'
          : 'Телефон и имя не показывай. Это история и привычки клиента — для тёплого приёма и совета.',
    };
  }

  /**
   * Рейтинг ценных клиентов без передачи модели имён, телефонов и CRM-id.
   * Позиция в рейтинге становится временным псевдонимом внутри ответа.
   */
  /**
   * Поимённый список гостей, которые давно не приходили.
   *
   * 🔴 Единственный инструмент, который отдаёт ИМЕНА гостей. Поэтому он помечен
   * как чувствительный к персональным данным: ответ по нему собирает сервер, во
   * внешнюю модель имена и телефоны не уходят никогда. Соседние инструменты по
   * той же базе (высокоценные, риск неявки) продолжают отдавать псевдонимы.
   *
   * Телефон видит только владелец: мастеру и администратору хватает имени,
   * чтобы узнать своего гостя, а база контактов — актив салона.
   */
  private async readDormantClients(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const inactiveDays = this.requiredNumber(args.inactive_days);
    const limit = this.requiredNumber(args.limit);
    const [snapshot, timezone] = await Promise.all([
      this.crmService.getClientRegistry(principal.tenantId),
      this.reportingTimezone(principal.tenantId),
    ]);
    const asOf = this.localDate(new Date(), timezone);
    const showPhone = DORMANT_PHONE_ROLES.has(principal.role);

    const dormant = snapshot.clients
      .map((client) => ({
        client,
        days: this.inactivityDays(client.last_visit_date, asOf),
      }))
      // Гость без единого визита — это не «ушедший», а никогда не пришедший.
      .filter(
        (entry) =>
          entry.client.visits_count > 0 &&
          entry.days !== null &&
          entry.days >= inactiveDays,
      )
      .sort(
        (left, right) =>
          (right.days ?? 0) - (left.days ?? 0) ||
          right.client.visits_count - left.client.visits_count,
      );

    return {
      verified: true,
      complete_registry: snapshot.complete,
      source: snapshot.provider,
      generated_at: snapshot.generated_at,
      scope: 'salon',
      inactive_days: inactiveDays,
      total_dormant: dormant.length,
      clients: dormant.slice(0, limit).map((entry) => ({
        name: entry.client.name,
        ...(showPhone ? { phone: entry.client.phone } : {}),
        visits: entry.client.visits_count,
        last_visit_date: entry.client.last_visit_date,
        inactivity_days: entry.days,
        lifetime_spend_amount_major_units: entry.client.sold_amount,
      })),
      contains_personal_data: true,
      phone_visible: showPhone,
    };
  }

  private async readHighValueClients(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const metric = this.requiredString(args.metric);
    const limit = this.requiredNumber(args.limit);
    const [snapshot, timezone] = await Promise.all([
      this.crmService.getClientRegistry(principal.tenantId),
      this.reportingTimezone(principal.tenantId),
    ]);
    const asOf = this.localDate(new Date(), timezone);
    const ranked = [...snapshot.clients].sort((left, right) => {
      const primary =
        metric === 'visits'
          ? right.visits_count - left.visits_count
          : metric === 'recency'
            ? this.clientRecencyScore(right.last_visit_date) -
              this.clientRecencyScore(left.last_visit_date)
            : right.sold_amount - left.sold_amount;
      return (
        primary ||
        right.visits_count - left.visits_count ||
        right.sold_amount - left.sold_amount ||
        left.external_id.localeCompare(right.external_id)
      );
    });

    return {
      verified: true,
      complete_registry: snapshot.complete,
      source: snapshot.provider,
      generated_at: snapshot.generated_at,
      metric,
      currency: 'RUB',
      clients: ranked.slice(0, limit).map((client, index) => ({
        alias: `client_${index + 1}`,
        visits: client.visits_count,
        lifetime_spend_amount_major_units: client.sold_amount,
        last_visit_date: client.last_visit_date,
        inactivity_days: this.inactivityDays(client.last_visit_date, asOf),
        loyalty_segment: this.clientLoyaltySegment(client.visits_count),
      })),
      contains_personal_data: false,
      note: 'Для контакта с конкретным клиентом используйте защищённый CRM-экран: имена и телефоны не передаются модели.',
    };
  }

  /**
   * Клиенты с повторяющимися неявками/отменами. Наружу выходят только
   * агрегаты и псевдонимы, клиентские CRM-id остаются внутри процесса.
   */
  private async readNoShowRiskClients(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const window = await this.reportingWindow(principal.tenantId, args);
    if (window.query.branchId) {
      return {
        available: false,
        reason: 'crm_journal_is_company_scoped',
      };
    }
    const timezone = await this.reportingTimezone(principal.tenantId);
    const read = await this.readJournalRangeInChunks(
      principal.tenantId,
      window.query.from,
      window.query.to,
      timezone,
    );
    const appointments = read.items;
    const clients = new Map<
      string,
      {
        visits: number;
        noShow: number;
        canceled: number;
        arrived: number;
        notObserved: number;
        lastEventAt: string;
      }
    >();
    const statusCounts = {
      canceled: 0,
      other: 0,
    };
    // 🔴 Cycle 04 P0. Присутствие считается по каноническому присутствию, а не
    // по статусу: `completed` у провайдера означает «отмечен приход ИЛИ
    // оплачено», и на боевых данных есть запись `completed / awaiting`.
    // Отсутствие отметки — отдельная корзина, а не ноль в остальных.
    const attendanceCounts = {
      arrived: 0,
      no_show: 0,
      awaiting: 0,
      not_observed: 0,
    };

    for (const appointment of appointments) {
      const clientId = appointment.client.id;
      const outcome = this.normalizedAppointmentStatus(appointment.status);
      const removed = outcome === 'canceled';
      // 🔴 Удалённая запись — только отмена. Отметка о приходе на ней это след
      // прошлого состояния, а не заявление о состоявшемся визите; засчитать её
      // и туда, и туда значило бы посчитать одно событие дважды.
      const attendance = removed ? null : (appointment.attendance ?? null);
      if (removed) {
        statusCounts.canceled += 1;
      } else {
        statusCounts.other += 1;
        if (attendance === 'arrived') attendanceCounts.arrived += 1;
        else if (attendance === 'no_show') attendanceCounts.no_show += 1;
        else if (attendance === null) attendanceCounts.not_observed += 1;
        else attendanceCounts.awaiting += 1;
      }

      if (!clientId) continue;
      const row = clients.get(clientId) ?? {
        visits: 0,
        noShow: 0,
        canceled: 0,
        arrived: 0,
        notObserved: 0,
        lastEventAt: appointment.start_at,
      };
      row.visits += 1;
      row.lastEventAt =
        appointment.start_at > row.lastEventAt
          ? appointment.start_at
          : row.lastEventAt;
      if (attendance === 'no_show') row.noShow += 1;
      if (attendance === 'arrived') row.arrived += 1;
      if (!removed && attendance === null) row.notObserved += 1;
      if (removed) row.canceled += 1;
      clients.set(clientId, row);
    }

    const ranked = [...clients.entries()]
      .filter(([, row]) => row.noShow > 0 || row.canceled > 0)
      .sort(
        (left, right) =>
          right[1].noShow - left[1].noShow ||
          right[1].canceled - left[1].canceled ||
          right[1].visits - left[1].visits ||
          left[0].localeCompare(right[0]),
      )
      .slice(0, 20);

    const complete = read.completeness === 'complete';
    return {
      available: true,
      verified: true,
      source: 'external_crm',
      resolved_period: this.resolvedPeriodPayload(args, window),
      appointments_observed: appointments.length,
      clients_observed: clients.size,
      status_counts: statusCounts,
      /**
       * 🔴 Cycle 04 P6. Это ОТМЕТКИ ПРОВАЙДЕРА по записям, а не канонический
       * факт присутствия за период.
       *
       * Владелец вопроса «сколько человек пришло за период» один — зеркало
       * главы 3 (`AttendanceFactsService`). Здесь считается другое: сколько
       * отметок провайдера пришлось на каждого КЛИЕНТА. Свести это к канону
       * сегодня нельзя: в зеркале идентичности клиента бизнеса нет
       * (`mayaClientId` пуст на всех записях, реестр 3.7), и связать строку
       * зеркала с клиентом провайдера нечем.
       *
       * Поэтому поле переименовано, а не подменено: пользователь должен
       * видеть, на чём оно стоит, и не выбирать между двумя числами.
       */
      provider_attendance_marks: attendanceCounts,
      /**
       * 🔴 Можно ли читать ноль как «ничего не было».
       *
       * Ровно четыре различимых состояния, а не два: измеренный ноль, ноль по
       * неполной выборке, ненаблюдённое присутствие и молчание источника.
       */
      completeness: {
        source: 'provider_journal',
        status: complete ? 'complete' : 'incomplete',
        reason: complete ? null : (read.truncationReason ?? 'unknown'),
        zero_means_none: complete && attendanceCounts.not_observed === 0,
        attendance_not_observed: attendanceCounts.not_observed,
        out_of_period_discarded: read.outOfPeriodDiscarded,
      },
      risk_clients: ranked.map(([, row], index) => ({
        alias: `client_${index + 1}`,
        appointments_observed: row.visits,
        // Те же отметки провайдера, но по клиенту. Каноническим присутствием
        // они не являются и называться им не должны.
        provider_marked_no_show: row.noShow,
        cancellation_count: row.canceled,
        provider_marked_arrived: row.arrived,
        attendance_not_marked: row.notObserved,
        last_event_at: row.lastEventAt,
        risk_level:
          row.noShow >= 2 || row.noShow + row.canceled >= 3
            ? 'high'
            : 'attention',
      })),
      contains_personal_data: false,
      limitations: [
        {
          key: 'attendance_owner',
          reason:
            'these are provider marks per client, not the canonical attendance fact: the period-level question "how many arrived" is answered only by the chapter 3 mirror, and per-client attendance has no canonical owner while business client identity is empty',
        },
        {
          key: 'late_cancellations',
          reason:
            'the CRM journal has no cancellation timestamp, so ordinary and late cancellations cannot be separated',
        },
        {
          key: 'cancellation_reason',
          reason:
            'the provider only reports that a record was removed; who removed it and why is not part of the contract and must not be inferred',
        },
        ...(attendanceCounts.not_observed > 0
          ? [
              {
                key: 'attendance_coverage',
                reason: `attendance was not observed for ${attendanceCounts.not_observed} record(s) of the period, so no_show counts are a lower bound and a zero here does not prove that nobody missed a visit`,
              },
            ]
          : []),
      ],
    };
  }

  private async readOwnStaffScheduleDay(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const date = this.requiredString(args.date);
    const link = await this.prisma.crmStaffAccess.findFirst({
      where: {
        tenantId: principal.tenantId,
        userId: principal.userId,
        status: 'active',
      },
      select: { externalStaffId: true },
    });
    if (!link) {
      return {
        available: false,
        reason: 'employee_is_not_linked_to_active_crm_staff',
        date,
      };
    }
    const schedule = await this.crmService.getStaffScheduleDay(
      principal.tenantId,
      { staffId: link.externalStaffId, date },
    );
    return {
      available: true,
      verified: true,
      source: 'external_crm',
      date: schedule.date,
      is_working: schedule.is_working,
      slots: schedule.slots,
    };
  }

  private async readBusinessHours(tenantId: string) {
    const profile = await this.crmService.getCompanyProfile(tenantId);
    return {
      verified: true,
      source: 'external_crm',
      title: profile.title,
      address: profile.address,
      timezone: profile.timezone,
      schedule: profile.schedule,
      schedule_available:
        typeof profile.schedule === 'string' && profile.schedule.trim() !== '',
    };
  }

  private async readSettings(principal: AiToolPrincipal) {
    const [assistantPreference, financePreference, appointmentNotifications] =
      await Promise.all([
        this.prisma.dashboardPreference.findUnique({
          where: {
            userId_tenantId_section: {
              userId: principal.userId,
              tenantId: principal.tenantId,
              section: 'assistant',
            },
          },
          select: { configJson: true },
        }),
        this.prisma.dashboardPreference.findUnique({
          where: {
            userId_tenantId_section: {
              userId: principal.userId,
              tenantId: principal.tenantId,
              section: 'finance',
            },
          },
          select: { configJson: true },
        }),
        this.appointmentNotificationsService
          ? this.appointmentNotificationsService.getSettings(principal.tenantId)
          : Promise.resolve(null),
      ]);
    const assistantConfig = this.record(assistantPreference?.configJson);
    const financeConfig = this.record(financePreference?.configJson);
    const enabledCapabilities = this.allowedStringValues(
      assistantConfig.enabled_capabilities,
      ASSISTANT_CAPABILITIES,
      DEFAULT_ASSISTANT_CAPABILITIES,
    );
    const enabledWidgets = this.allowedStringValues(
      financeConfig.enabled_widgets,
      FINANCE_DASHBOARD_WIDGETS,
      DEFAULT_FINANCE_DASHBOARD_WIDGETS,
    );
    const staffTargets = this.record(financeConfig.staff_targets_rub);
    const monthlyTarget = this.optionalMetricNumber(
      financeConfig.monthly_target_rub,
    );

    return {
      assistant: {
        enabled_capabilities: enabledCapabilities,
        capabilities: ASSISTANT_CAPABILITY_CATALOG.map((item) => ({
          ...item,
          enabled: enabledCapabilities.includes(item.key),
        })),
      },
      finance_dashboard: {
        enabled_widgets: enabledWidgets,
        available_widgets: [...FINANCE_DASHBOARD_WIDGETS],
        monthly_target_rub: monthlyTarget,
        staff_target_count: Object.values(staffTargets).filter(
          (value) => typeof value === 'number' && Number.isFinite(value),
        ).length,
      },
      appointment_notifications: appointmentNotifications,
      credentials_excluded: true,
      note: 'Токены и секреты никогда не возвращаются в чат. Их наличие проверяется через статус интеграции.',
    };
  }

  private async updateSettings(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    if (!this.dashboardPreferencesService) {
      throw new Error('Dashboard preferences service is unavailable');
    }
    const capability = this.requiredString(args.capability);
    const enabled = args.enabled === true;
    const current = await this.dashboardPreferencesService.getAssistant(
      principal.tenantId,
      principal.userId,
    );
    const currentConfig = this.record(current.config);
    const currentCapabilities = this.allowedStringValues(
      currentConfig.enabled_capabilities,
      ASSISTANT_CAPABILITIES,
      DEFAULT_ASSISTANT_CAPABILITIES,
    );
    const nextCapabilities = enabled
      ? [...new Set([...currentCapabilities, capability])]
      : currentCapabilities.filter((item) => item !== capability);
    const updated = await this.dashboardPreferencesService.updateAssistant(
      principal.tenantId,
      principal.userId,
      { enabledCapabilities: nextCapabilities },
    );
    const updatedConfig = this.record(updated.config);

    return {
      updated: true,
      scope: 'authenticated_user',
      capability,
      enabled,
      enabled_capabilities: this.allowedStringValues(
        updatedConfig.enabled_capabilities,
        ASSISTANT_CAPABILITIES,
        nextCapabilities,
      ),
    };
  }

  private async listTasks(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const rows = await this.prisma.inboxItem.findMany({
      where: {
        tenantId: principal.tenantId,
        userId: principal.userId,
        type: 'maya_task',
        deletedAt: null,
        archivedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const timezone = await this.reportingTimezone(principal.tenantId).catch(
      () => 'UTC',
    );
    const today = this.localDate(new Date(), timezone);
    const statusFilter = this.requiredString(args.status);
    const periodFilter = this.requiredString(args.period);
    const tasks = rows
      .map((row) => {
        const payload = this.record(row.payloadJson);
        const status =
          typeof payload.status === 'string' ? payload.status : 'active';
        const dueDate =
          typeof payload.due_date === 'string' ? payload.due_date : null;
        return {
          id: row.id,
          task: row.bodyText,
          status,
          due_date: dueDate,
          created_at: row.createdAt.toISOString(),
        };
      })
      .filter((task) => statusFilter === 'all' || task.status === 'active')
      .filter((task) => {
        if (periodFilter === 'today') return task.due_date === today;
        if (periodFilter === 'overdue') {
          return task.due_date !== null && task.due_date < today;
        }
        return true;
      });

    return {
      tasks,
      count: tasks.length,
      scope: 'authenticated_user',
      timezone,
      as_of_date: today,
    };
  }

  private async createTask(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
    idempotencyKey: string,
  ) {
    const inboxService = this.requireInboxService();
    const recipient = await this.resolveTaskRecipient(
      principal,
      this.requiredString(args.assignee),
    );
    if (!recipient.userId) {
      return {
        accepted: false,
        reason: recipient.reason,
        next_action: recipient.nextAction,
      };
    }

    const task = this.requiredString(args.task);
    const dueDate =
      typeof args.due_date === 'string' ? args.due_date : undefined;
    const sourceEventId = `maya-task:${idempotencyKey}`.slice(0, 160);
    const published = await inboxService.publishForTenant(principal.tenantId, {
      type: 'maya_task',
      sourceEventId,
      title: 'Поручение MAYA',
      bodyText: task,
      payload: {
        status: 'active',
        due_date: dueDate ?? null,
        source: 'maya_chat',
      },
      deepLink: '/app/?panel=chat',
      userIds: [recipient.userId],
      fanoutOwners: false,
    });
    await this.auditLogService?.log({
      tenantId: principal.tenantId,
      userId: principal.userId,
      action: 'maya.task.created',
      entityType: 'inbox_item',
      entityId: sourceEventId,
      metadata: {
        has_due_date: dueDate !== undefined,
        recipient_is_actor: recipient.userId === principal.userId,
      },
    });

    return {
      accepted: published.stored > 0,
      delivered: published.stored > 0,
      persistent: true,
      push_announcement_requested: true,
      due_date: dueDate ?? null,
    };
  }

  private async completeTask(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const taskId = this.requiredString(args.task_id);
    const task = await this.prisma.inboxItem.findFirst({
      where: {
        id: taskId,
        tenantId: principal.tenantId,
        userId: principal.userId,
        type: 'maya_task',
        deletedAt: null,
      },
    });
    if (!task) {
      return {
        completed: false,
        reason: 'task_not_found_or_not_assigned_to_authenticated_user',
      };
    }

    const payload = this.record(task.payloadJson);
    if (payload.status === 'completed') {
      return {
        completed: true,
        already_completed: true,
        task_id: task.id,
      };
    }

    const completedAt = new Date();
    await this.prisma.inboxItem.update({
      where: { id: task.id },
      data: {
        payloadJson: {
          ...payload,
          status: 'completed',
          completed_at: completedAt.toISOString(),
        },
        readAt: task.readAt ?? completedAt,
        archivedAt: task.archivedAt ?? completedAt,
      },
    });
    await this.auditLogService?.log({
      tenantId: principal.tenantId,
      userId: principal.userId,
      action: 'maya.task.completed',
      entityType: 'inbox_item',
      entityId: task.id,
    });

    return {
      completed: true,
      already_completed: false,
      task_id: task.id,
    };
  }

  private async resolveTaskRecipient(
    principal: AiToolPrincipal,
    assignee: string,
  ): Promise<{
    userId: string | null;
    reason?: string;
    nextAction?: string;
  }> {
    const normalized = this.normalizeHumanLabel(assignee);
    if (['я', 'мне', 'себе', 'self'].includes(normalized)) {
      return { userId: principal.userId };
    }

    const team = await this.crmService.getTeamMembers(principal.tenantId);
    const exact = team.filter(
      (member) => this.normalizeHumanLabel(member.name) === normalized,
    );
    const candidates =
      exact.length > 0
        ? exact
        : normalized.length >= 3
          ? team.filter((member) =>
              this.normalizeHumanLabel(member.name).startsWith(normalized),
            )
          : [];
    if (candidates.length === 0) {
      return {
        userId: null,
        reason: 'assignee_not_found_in_active_crm_team',
        nextAction: 'clarify_assignee_from_current_crm_team',
      };
    }
    if (candidates.length > 1) {
      return {
        userId: null,
        reason: 'assignee_is_ambiguous',
        nextAction: 'clarify_full_crm_display_name',
      };
    }

    const access = await this.prisma.crmStaffAccess.findFirst({
      where: {
        tenantId: principal.tenantId,
        externalStaffId: candidates[0].id,
        status: 'active',
        userId: { not: null },
      },
      select: { userId: true },
    });
    if (!access?.userId) {
      return {
        userId: null,
        reason: 'assignee_has_no_active_maya_account',
        nextAction: 'assignee_must_finish_verified_maya_login',
      };
    }
    return { userId: access.userId };
  }

  private normalizeHumanLabel(value: string): string {
    return value
      .normalize('NFKC')
      .toLocaleLowerCase('ru-RU')
      .replace(/ё/g, 'е')
      .replace(/[^a-zа-я0-9]+/gi, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  private async readIntegrationStatus(tenantId: string) {
    const status = await this.crmService.getIntegrationStatus(tenantId);
    const connection = this.record(status.connection);
    return {
      configured: status.configured,
      calendar_source: status.calendar_source,
      next_action: status.next_action,
      connection: status.connection
        ? {
            provider: connection.provider ?? null,
            status: connection.status ?? null,
            verified: connection.verified === true,
            verified_at: connection.verified_at ?? null,
            last_checked_at: connection.last_checked_at ?? null,
            last_sync_at: connection.last_sync_at ?? null,
            last_error_code: connection.last_error_code ?? null,
            last_error_at: connection.last_error_at ?? null,
          }
        : null,
      credentials_excluded: true,
    };
  }

  /**
   * YClients quick_search не склоняет русские имена: «у Стаса» не
   * находит карточку «Стас». Поэтому после точной формы пробуем
   * несколько узких падежных вариантов. Это локальная операция:
   * имя не уходит в LLM.
   */
  private clientSearchQueries(query: string): string[] {
    if (/\d/.test(query)) {
      return [query];
    }
    const words = query.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return [query];
    }

    const first = this.russianNominativeToken(words[0]);
    const all = words.map((word) => this.russianNominativeToken(word));
    const candidates = [
      query,
      [first, ...words.slice(1)].join(' '),
      all.join(' '),
      first,
    ];
    return [...new Set(candidates)]
      .map((candidate) => candidate.trim())
      .filter((candidate) => candidate.length >= 3 && candidate.length <= 80)
      .slice(0, 4);
  }

  private russianNominativeToken(token: string): string {
    const lower = token.toLocaleLowerCase('ru-RU');
    if (/(?:ея|ая|ия)$/.test(lower)) {
      return `${token.slice(0, -1)}й`;
    }
    if (/(?:ьи|ии)$/.test(lower)) {
      return `${token.slice(0, -1)}я`;
    }
    if (/(?:ги|ки|хи)$/.test(lower)) {
      return `${token.slice(0, -1)}а`;
    }
    if (lower.endsWith('ы')) {
      return `${token.slice(0, -1)}а`;
    }
    if (lower.endsWith('а') || lower.endsWith('у')) {
      return token.slice(0, -1);
    }
    return token;
  }

  private clientLoyaltySegment(visits: number): string {
    if (visits <= 0) return 'without_visits';
    if (visits === 1) return 'new';
    if (visits === 2) return 'repeat';
    if (visits < 6) return 'loyal';
    if (visits < 12) return 'regular';
    return 'core';
  }

  private async suggestClientUpsell(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const currentNames = Array.isArray(args.current_service_names)
      ? args.current_service_names
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
    const [historyRaw, catalog] = await Promise.all([
      this.appointmentsService.listClientAppointments(
        principal.tenantId,
        principal.userId,
      ),
      this.crmService.getServices(principal.tenantId),
    ]);
    const history = historyRaw.map((item) => {
      const row = this.record(item);
      const services = Array.isArray(row.services)
        ? row.services.map((service) => {
            const safe = this.record(service);
            const title = typeof safe.name === 'string' ? safe.name : '';
            return {
              title,
              priceRub: Number(safe.price || 0),
            };
          })
        : [];
      const startAt =
        typeof row.start_at === 'string' || typeof row.start_at === 'number'
          ? row.start_at
          : Date.now();
      const status = typeof row.status === 'string' ? row.status : '';
      return {
        clientId: null,
        startAt: new Date(startAt),
        status,
        grossRub: Number(row.total_price || 0),
        services,
      };
    });
    const currentServices = currentNames.map((title) => ({
      title,
      priceRub: 0,
    }));
    const opportunity = historicalAddonOpportunity(history, currentServices);
    const suggestions = opportunity
      ? [
          {
            service: opportunity.title,
            price: opportunity.price_rub,
            times_bought: opportunity.times_bought,
            last_date: opportunity.last_date,
            reason: 'historical',
          },
        ]
      : [];
    const currentKeys = new Set(
      currentNames.map((name) => name.toLowerCase().replace(/ё/g, 'е')),
    );
    const menu_addons = catalog
      .filter((service) => {
        const key = String(service.name || '')
          .toLowerCase()
          .replace(/ё/g, 'е');
        if (!key || currentKeys.has(key)) return false;
        if (
          /уклад|стайлинг|styling/.test(key) &&
          /стрижк/.test([...currentKeys].join(' '))
        ) {
          return false;
        }
        return /бород|тонир|камуфляж|уход|брить/.test(key);
      })
      .slice(0, 6)
      .map((service) => ({
        service: service.name,
        price: service.price,
        id: service.id,
      }));
    return {
      suggestions,
      menu_addons,
      instruction: suggestions.length
        ? 'Мягко предложи ОДНО дополнение из suggestions («как в прошлый раз»). После отказа больше не предлагай.'
        : menu_addons.length
          ? 'Можно один раз мягко предложить одно совместимое дополнение из menu_addons. Укладку к стрижке не предлагай.'
          : 'Ничего не предлагай — продолжай оформление основной услуги.',
    };
  }

  private stringList(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  private isMeSalonName(name: string | null | undefined): boolean {
    const key = String(name || '')
      .toLowerCase()
      .replace(/ё/g, 'е');
    return /мужская\s*эстетик|malesthetic|muzhskaya/.test(key);
  }

  private defaultSalonAbout(name: string | null): string[] {
    if (!this.isMeSalonName(name)) {
      return [];
    }
    return [
      'Мы не просто стрижём. Мы создаём пространство, где каждая деталь продумана — от инструментов до атмосферы.',
      'Стабильная команда мастеров, премиальный интерьер и широкий спектр услуг — всё это Мужская Эстетика.',
      'Барбершоп в Ставрополе на ул. Лермонтова, 343. Работаем уже больше шести лет.',
    ];
  }

  private defaultFoundedHint(name: string | null): string | null {
    if (!this.isMeSalonName(name)) {
      return null;
    }
    return 'около 2020 (более 6 лет)';
  }

  private async readAvailability(
    tenantId: string,
    args: ValidatedAiToolArguments,
  ) {
    const slots = await this.appointmentsService.getAvailableSlots(tenantId, {
      date: this.requiredString(args.date),
      ...(typeof args.staff_id === 'string' ? { staffId: args.staff_id } : {}),
      ...(Array.isArray(args.service_ids)
        ? { serviceIds: this.stringArray(args.service_ids) }
        : {}),
      ...(typeof args.branch_id === 'string'
        ? { branchId: args.branch_id }
        : {}),
    });
    return {
      slots: slots.map((slot) => ({
        start: slot.start,
        end: slot.end,
        staff_id: slot.staff_id,
        branch_id: slot.branch_id ?? null,
      })),
    };
  }

  private async readGroupAvailability(
    tenantId: string,
    args: ValidatedAiToolArguments,
  ) {
    const slots = await this.appointmentsService.getAvailableSlots(tenantId, {
      date: this.requiredString(args.date),
      ...(Array.isArray(args.service_ids)
        ? { serviceIds: this.stringArray(args.service_ids) }
        : {}),
      ...(typeof args.branch_id === 'string'
        ? { branchId: args.branch_id }
        : {}),
    });
    const partySize = Number(args.party_size);
    const mode = args.mode === 'nearby' ? 'nearby' : 'simultaneous';
    const maxGapMinutes = Number(args.max_gap_minutes ?? 30);
    const normalized = slots
      .filter(
        (slot) =>
          Number.isFinite(Date.parse(slot.start)) &&
          Number.isFinite(Date.parse(slot.end)),
      )
      .map((slot) => ({
        start: slot.start,
        end: slot.end,
        staff_id: slot.staff_id,
        branch_id: slot.branch_id ?? null,
      }));

    const groups =
      mode === 'simultaneous'
        ? this.simultaneousSlotGroups(normalized, partySize)
        : this.nearbySlotGroups(normalized, partySize, maxGapMinutes * 60_000);

    return {
      mode,
      party_size: partySize,
      max_gap_minutes: mode === 'nearby' ? maxGapMinutes : 0,
      group_count: groups.length,
      groups,
      atomic_booking_available: false,
      booking_instruction:
        'After explicit confirmation, create one appointment per person, rechecking availability before every write. Never claim the group is reserved atomically.',
    };
  }

  private simultaneousSlotGroups(
    slots: Array<{
      start: string;
      end: string;
      staff_id: string;
      branch_id: string | null;
    }>,
    partySize: number,
  ) {
    const buckets = new Map<string, typeof slots>();
    for (const slot of slots) {
      const key = `${slot.branch_id ?? ''}|${slot.start}`;
      buckets.set(key, [...(buckets.get(key) ?? []), slot]);
    }
    return [...buckets.values()]
      .map((bucket) => this.distinctStaffSlots(bucket).slice(0, partySize))
      .filter((group) => group.length === partySize)
      .slice(0, 20)
      .map((group) => ({
        starts_at: group[0].start,
        ends_at: group.reduce(
          (latest, slot) =>
            Date.parse(slot.end) > Date.parse(latest) ? slot.end : latest,
          group[0].end,
        ),
        branch_id: group[0].branch_id,
        slots: group,
      }));
  }

  private nearbySlotGroups(
    slots: Array<{
      start: string;
      end: string;
      staff_id: string;
      branch_id: string | null;
    }>,
    partySize: number,
    maxGapMs: number,
  ) {
    const byBranch = new Map<string, typeof slots>();
    for (const slot of slots) {
      const key = slot.branch_id ?? '';
      byBranch.set(key, [...(byBranch.get(key) ?? []), slot]);
    }
    const result: Array<{
      starts_at: string;
      ends_at: string;
      branch_id: string | null;
      slots: typeof slots;
    }> = [];
    const signatures = new Set<string>();
    for (const branchSlots of byBranch.values()) {
      const sorted = [...branchSlots].sort(
        (left, right) => Date.parse(left.start) - Date.parse(right.start),
      );
      for (const seed of sorted) {
        const seedMs = Date.parse(seed.start);
        const candidates = this.distinctStaffSlots(
          sorted.filter((slot) => {
            const delta = Date.parse(slot.start) - seedMs;
            return delta >= 0 && delta <= maxGapMs;
          }),
        ).slice(0, partySize);
        if (candidates.length !== partySize) continue;
        const signature = candidates
          .map((slot) => `${slot.staff_id}:${slot.start}`)
          .sort()
          .join('|');
        if (signatures.has(signature)) continue;
        signatures.add(signature);
        result.push({
          starts_at: candidates[0].start,
          ends_at: candidates.reduce(
            (latest, slot) =>
              Date.parse(slot.end) > Date.parse(latest) ? slot.end : latest,
            candidates[0].end,
          ),
          branch_id: candidates[0].branch_id,
          slots: candidates,
        });
        if (result.length >= 20) return result;
      }
    }
    return result;
  }

  private distinctStaffSlots<T extends { staff_id: string }>(slots: T[]): T[] {
    const seen = new Set<string>();
    return slots.filter((slot) => {
      if (seen.has(slot.staff_id)) return false;
      seen.add(slot.staff_id);
      return true;
    });
  }

  private async readOwnLoyalty(principal: AiToolPrincipal) {
    const loyalty = await this.loyaltyService.getForUser(
      principal.tenantId,
      principal.userId,
    );
    return this.safeLoyalty(loyalty);
  }

  private async applyStaffScheduleDayChange(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    if (!SCHEDULE_MANAGER_ROLES.has(principal.role)) {
      throw new ForbiddenException({
        message: 'Staff schedule management is not available to this role.',
        error: { code: 'staff_schedule_forbidden' },
      });
    }
    const result = await this.crmService.applyStaffScheduleDayChange(
      principal.tenantId,
      {
        staffId: this.requiredString(args.staff_id),
        date: this.requiredString(args.date),
        slots: this.scheduleSlots(args.slots),
        expectedRevision: this.requiredString(args.current_revision),
      },
    );
    return {
      status: 'applied',
      date: result.date,
      is_working: result.is_working,
      slots: result.slots,
      verified: result.verified,
      existing_appointments_preserved: true,
    };
  }

  private async readStaffScheduleDay(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    if (!SCHEDULE_MANAGER_ROLES.has(principal.role)) {
      throw new ForbiddenException({
        message: 'Staff schedule is not available to this role.',
        error: { code: 'staff_schedule_forbidden' },
      });
    }
    const date = this.requiredString(args.date);
    const requestedStaffId =
      typeof args.staff_id === 'string' ? args.staff_id : null;
    const activeStaff = await this.crmService.getStaff(principal.tenantId);
    const selectedStaff = requestedStaffId
      ? activeStaff.filter((member) => member.id === requestedStaffId)
      : activeStaff;
    if (requestedStaffId && selectedStaff.length === 0) {
      throw new BadRequestException({
        message: 'The requested active staff member was not found in CRM.',
        error: { code: 'staff_not_found' },
      });
    }

    const staff = await Promise.all(
      selectedStaff.slice(0, 50).map(async (member) => {
        const schedule = await this.crmService.getStaffScheduleDay(
          principal.tenantId,
          { staffId: member.id, date },
        );
        return {
          id: member.id,
          name: member.name,
          title: member.title ?? null,
          is_working: schedule.is_working,
          slots: schedule.slots,
        };
      }),
    );
    return {
      verified: true,
      source: 'crm',
      date,
      staff,
    };
  }

  /**
   * Точный операционный срез одного дня без персональных данных клиентов.
   *
   * Журнал CRM содержит имена, телефоны, заметки и внешние id. В LLM и аудит
   * инструмента они попадать не должны, поэтому здесь строится новый контракт,
   * а не санитизируется исходный объект по отдельным ключам.
   */
  private async readOperationsJournalDay(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    if (!SCHEDULE_MANAGER_ROLES.has(principal.role)) {
      throw new ForbiddenException({
        message: 'The business journal is not available to this role.',
        error: { code: 'operations_journal_forbidden' },
      });
    }

    const date = this.requiredString(args.date);
    const requestedStaffId =
      typeof args.staff_id === 'string' ? args.staff_id : null;
    /**
     * 🔴 Cycle 04 P6. Часовой пояс дня инструмент больше не разрешает сам:
     * границы суток строит канонический владелец дневного среза, и он же
     * возвращает пояс, в котором они построены. Две лестницы резолюции на
     * один вопрос — это два разных дня на границе полуночи.
     */
    const activeStaff = await this.crmService.getStaff(principal.tenantId);
    const selectedStaff = requestedStaffId
      ? activeStaff.find((member) => member.id === requestedStaffId)
      : null;
    if (requestedStaffId && !selectedStaff) {
      throw new BadRequestException({
        message: 'The requested active staff member was not found in CRM.',
        error: { code: 'staff_not_found' },
      });
    }

    /**
     * 🔴 Cycle 04 P6. Дневной срез СПРАШИВАЕТ, а не считает.
     *
     * Здесь жили собственные счётчики статусов, собственные минуты,
     * собственная стоимость записанного и собственное присутствие — взятое из
     * поля журнала. В бою это давало владельцу два ответа на один вопрос:
     * журнал говорил «пришли 13», зеркало главы 3 — «пришли 12 и одна запись
     * ожидает отметки». Теперь ответ один, и его владелец — слой аналитики.
     *
     * Журнал остаётся ВХОДОМ (список визитов дня приезжает оттуда же, одним
     * чтением), но вторым вычислителем быть перестал.
     */
    const day = await this.analyticsService.getDayOperations(
      principal.tenantId,
      { date, staffExternalId: requestedStaffId },
    );

    const staffById = new Map(activeStaff.map((member) => [member.id, member]));
    const canonicalRows = new Map(
      day.staff.map((row) => [row.staff_external_id, row]),
    );

    /**
     * Расписание приезжает ТЕМ ЖЕ ответом провайдера, что и записи: канон
     * везёт его транспортом, не выводя из него ничего. Отдельный запрос
     * расписания на каждого мастера означал бы платить за консолидацию
     * лишними обращениями к провайдеру — ровно то, чего пакет избегает.
     */
    const scheduleByStaff = new Map(
      (day.masters ?? []).map((master) => [master.id, master]),
    );
    const staffIds = [
      ...new Set([
        ...canonicalRows.keys(),
        ...staffById.keys(),
        ...scheduleByStaff.keys(),
      ]),
    ].filter((id) => !requestedStaffId || id === requestedStaffId);

    const staff = staffIds
      .map((staffId) => {
        const row = canonicalRows.get(staffId);
        const member = staffById.get(staffId);
        const schedule = scheduleByStaff.get(staffId);
        const workingMinutes = (schedule?.work_slots ?? []).reduce(
          (sum: number, slot) =>
            sum +
            Math.max(
              0,
              this.clockMinutes(slot.to) - this.clockMinutes(slot.from),
            ),
          0,
        );
        const bookedMinutes =
          this.optionalMetricNumber(row?.booked_minutes) ?? 0;
        return {
          name: row?.name ?? member?.name ?? 'Мастер',
          title: member?.title?.trim() || null,
          is_working: schedule?.is_working ?? null,
          working_hours: (schedule?.work_slots ?? []).map((slot) => ({
            from: slot.from,
            to: slot.to,
          })),
          appointments: {
            total: this.optionalMetricNumber(row?.total) ?? 0,
            active: this.optionalMetricNumber(row?.appointments) ?? 0,
            confirmed: this.optionalMetricNumber(row?.scheduled) ?? 0,
            completed: this.optionalMetricNumber(row?.completed) ?? 0,
            canceled: this.optionalMetricNumber(row?.cancelled) ?? 0,
            no_show: this.optionalMetricNumber(row?.no_show) ?? 0,
          },
          booked_minutes: bookedMinutes,
          working_minutes: workingMinutes,
          /**
           * Утилизация кресла — производная ДВУХ фактов: записанных минут
           * (канон) и рабочего времени (расписание). Собственного владельца у
           * неё пока нет, и без расписания она остаётся `null`, а не нулём.
           */
          load_percent:
            workingMinutes > 0
              ? Math.round((bookedMinutes / workingMinutes) * 1_000) / 10
              : null,
          booked_service_value: Array.isArray(row?.revenue) ? row.revenue : [],
        };
      })
      .sort(
        (left, right) =>
          right.appointments.active - left.appointments.active ||
          left.name.localeCompare(right.name, 'ru'),
      );

    const records = day.records.map((appointment) => {
      const startAt = new Date(appointment.startAt);
      const endAt = new Date(
        startAt.getTime() + appointment.durationMinutes * 60_000,
      );
      return {
        time: this.localTime(startAt.toISOString(), day.timezone),
        end_time: this.localTime(endAt.toISOString(), day.timezone),
        status: appointment.status,
        staff_name: appointment.staffName,
        services: appointment.services.map((service) => service.name),
        duration_minutes: appointment.durationMinutes,
        booked_value:
          appointment.totalPriceKopecks === null
            ? null
            : {
                currency: appointment.currency,
                amount_kopecks: appointment.totalPriceKopecks,
                amount_major_units: appointment.totalPriceKopecks / 100,
              },
      };
    });

    const attendance = this.record(day.attendance);
    const completeness = this.record(day.completeness);
    const appointmentsCompleteness = this.record(completeness.appointments);
    const notObserved = this.optionalMetricNumber(attendance.not_observed);

    return {
      verified: true,
      source: 'yclients',
      pii_redacted: true,
      date,
      timezone: day.timezone,
      staff_scope: selectedStaff
        ? { name: selectedStaff.name, title: selectedStaff.title ?? null }
        : null,
      summary: {
        total: this.optionalMetricNumber(this.record(day.summary).total) ?? 0,
        active: this.optionalMetricNumber(this.record(day.summary).active) ?? 0,
        confirmed:
          this.optionalMetricNumber(this.record(day.summary).scheduled) ?? 0,
        completed:
          this.optionalMetricNumber(this.record(day.summary).completed) ?? 0,
        canceled:
          this.optionalMetricNumber(this.record(day.summary).cancelled) ?? 0,
        no_show:
          this.optionalMetricNumber(this.record(day.summary).no_show) ?? 0,
        booked_minutes:
          this.optionalMetricNumber(this.record(day.summary).booked_minutes) ??
          0,
      },
      /**
       * 🔴 Присутствие приходит из зеркала главы 3, а не из поля журнала.
       *
       * `completed` в блоке выше — слово ПРОВАЙДЕРА и означает «отмечен приход
       * ИЛИ оплачено». Сколько человек действительно пришло, отвечает только
       * этот блок, и у него один владелец на всю систему.
       */
      attendance: {
        state: attendance.state ?? 'unavailable',
        /**
         * 🔴 Числа появляются ТОЛЬКО у измеренного наблюдения. При
         * `measured_incomplete` и `unavailable` зеркало не даёт права
         * называть цифры: ноль там означал бы «никто не пришёл», хотя верное
         * утверждение — «мы этого не видели».
         */
        ...(attendance.state === 'measured'
          ? {
              arrived: this.optionalMetricNumber(attendance.arrived),
              no_show: this.optionalMetricNumber(attendance.no_show),
              awaiting: this.optionalMetricNumber(attendance.awaiting),
            }
          : { arrived: null, no_show: null, awaiting: null }),
        not_observed: notObserved,
        source: 'canonical_mirror',
      },
      completeness: {
        source: appointmentsCompleteness.source ?? 'provider_journal',
        status: appointmentsCompleteness.status ?? 'complete',
        reason: appointmentsCompleteness.reason ?? null,
        zero_means_none:
          appointmentsCompleteness.status === 'complete' && notObserved === 0,
        attendance_not_observed: notObserved,
        // Столько записей провайдер прислал мимо запрошенных суток.
        out_of_period_discarded:
          this.optionalMetricNumber(
            appointmentsCompleteness.out_of_period_discarded,
          ) ?? 0,
      },
      staff,
      appointments: records.slice(0, 100),
      appointments_returned: Math.min(records.length, 100),
      appointments_truncated: records.length > 100,
    };
  }

  private async readExpenses(tenantId: string, args: ValidatedAiToolArguments) {
    const window = await this.reportingWindow(tenantId, args);
    const result = await this.expensesService.list(tenantId, window.query);
    const resolved = this.resolvedPeriodPayload(args, window);
    return {
      resolved_period: resolved,
      period: {
        ...resolved,
        truncated_to_today: window.truncatedToToday,
      },
      // 🔴 Cycle 04 P8. Разрез по статьям больше не считается здесь. Раньше он
      // складывался ВТОРОЙ раз поверх уже обрезанного перечня, и «сколько ушло
      // на расходники» отвечалось суммой первых пятисот записей. Теперь и
      // разрез, и итоги приходят от канонического сумматора расходов.
      by_category: result.by_category.map((row) => ({
        ...row,
        amount_major_units: this.majorUnits(row.amount_kopecks),
      })),
      items: result.items.map((item) => ({
        id: item.id,
        branch_id: item.branch_id,
        category: item.category,
        // Постоянная или переменная — без этого маржу не разложить.
        category_kind: item.category_kind,
        // Записи со старой свободной категорией читаются как `other`,
        // но то, что там было написано, не прячем.
        category_raw: item.category_raw,
        amount_kopecks: item.amount_kopecks,
        amount_major_units: this.majorUnits(item.amount_kopecks),
        currency: item.currency,
        occurred_at: item.occurred_at,
        source: item.source,
      })),
      totals: this.safeMoneyEntries(result.totals),
      /**
       * 🔴 Обрезан ПЕРЕЧЕНЬ операций, а не деньги. Раньше `truncated` означал
       * «числа ниже настоящих», и карточка честно говорила «нижняя граница».
       * Теперь суммы посчитаны по всем записям периода, поэтому неполнота
       * называется своим именем: список короче, чем было на самом деле.
       */
      truncated: result.truncated,
      items_returned: result.items.length,
      expense_count: result.expense_count,
      totals_basis: result.totals_basis,
      totals_unavailable_reason: result.totals_unavailable_reason,
      // Охват сумм: филиал или весь салон. Одно и то же имя над разными
      // числами — это тот же дубль, только в подписи.
      scope: result.scope,
    };
  }

  /**
   * Прибыль, структура расходов и стоимость нового клиента.
   *
   * 🔴 Единственный путь из прода к движку прибыли. Пока его не было, движок
   * существовал только в собственном спеке: владелец спрашивал «прибыль
   * какая», а отвечать было нечем — вопрос уходил в операционный обзор, где
   * прибыли нет по построению.
   *
   * Обзор и финсводка загружаются здесь один раз и передаются движку
   * контекстом: без этого один вопрос стоил бы двойного прохода журнала CRM.
   */
  private async readBusinessProfit(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const window = await this.reportingWindow(principal.tenantId, args);
    const profitability = await this.analyticsService.getBusinessProfitability(
      principal.tenantId,
      window.query,
    );
    const data = this.record(profitability);
    const period = this.record(data.period);
    const resolved = this.resolvedPeriodPayload(args, window);
    return {
      ...data,
      resolved_period: resolved,
      period: {
        ...period,
        ...resolved,
        // Месяц ещё не кончился — сказать это обязаны мы, а не владелец,
        // который сам заметит расхождение с бухгалтерией.
        truncated_to_today: window.truncatedToToday,
      },
    };
  }

  /**
   * Записать расход из чата — уже после подтверждения человеком.
   *
   * Сумма приходит в рублях: модель повторяет то, что сказал человек, и не
   * пересчитывает разряды. В копейки её переводит сервер — единственным
   * помощником `rublesToKopecks`, чтобы «60 тысяч» не превратились в 600.
   */
  private async createExpense(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
    idempotencyKey: string,
  ) {
    const category = this.requiredString(args.category);
    const amountKopecks = rublesToKopecks(args.amount_rubles);
    if (amountKopecks === null) {
      throw new BadRequestException({
        message: 'AI tool arguments are invalid.',
        error: {
          code: 'ai_tool_arguments_invalid',
          detail: 'amount_rubles is not a valid ruble amount',
        },
      });
    }

    const timezone = await this.reportingTimezone(principal.tenantId);
    // Дата к этому моменту уже проставлена: её подставляет `normalizeArguments`
    // ДО того, как карточка ушла человеку, — иначе он подтверждал бы расход, не
    // видя числа, за которое тот пишется.
    const occurredOn =
      typeof args.occurred_on === 'string'
        ? args.occurred_on
        : this.localDate(new Date(), timezone);
    // Полдень по часовому поясу салона: любой сдвиг ±14 часов оставляет
    // отметку внутри того же местного дня, поэтому расход не переезжает
    // в соседний месяц на границе периода.
    const occurredAt = localDateMinuteToUtc(occurredOn, 12 * 60, timezone);
    const note = typeof args.note === 'string' ? args.note : undefined;

    const expense = await this.expensesService.create(
      principal.tenantId,
      principal.userId,
      {
        category,
        amountKopecks,
        currency: 'RUB',
        occurredAt: occurredAt.toISOString(),
        ...(note ? { note } : {}),
      },
      // Повторное подтверждение той же карточки вернёт уже созданный расход.
      { source: 'manual', idempotencyKey },
    );

    const resolved = resolveExpenseCategory(expense.category);
    return {
      recorded: true,
      expense_id: expense.id,
      category: resolved.slug,
      category_label: resolved.label,
      category_kind: resolved.kind,
      amount_kopecks: expense.amount_kopecks,
      amount_major_units: this.majorUnits(expense.amount_kopecks),
      currency: expense.currency,
      occurred_at: expense.occurred_at,
      // Местная дата берётся из сохранённой записи, а не из аргументов: при
      // повторном подтверждении вернётся дата уже существующего расхода.
      occurred_on: this.localDate(new Date(expense.occurred_at), timezone),
      source: expense.source,
      // Тот же платёж мог приехать из CRM. Не блокируем — владелец может знать
      // лучше, — но говорим вслух, чтобы дубль не жил молча.
      possible_duplicate: expense.possible_duplicate ?? null,
    };
  }

  /** Подтвердить полноту расходов и сразу вернуть пересчитанную прибыль. */
  private async declareExpensePeriodComplete(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
    idempotencyKey: string,
  ) {
    if (typeof args.branch_id === 'string') {
      throw new BadRequestException(
        'Expense completeness is confirmed only for the whole company period',
      );
    }
    const window = await this.reportingWindow(principal.tenantId, args);
    const timezone = await this.reportingTimezone(principal.tenantId);
    const periodFromDay = this.localDate(new Date(window.query.from), timezone);
    const periodToDay = this.localDate(new Date(window.query.to), timezone);
    const declaration = await this.expensesService.declarePeriodComplete(
      principal.tenantId,
      principal.userId,
      periodFromDay,
      periodToDay,
      idempotencyKey,
    );
    const profitability = await this.analyticsService.getBusinessProfitability(
      principal.tenantId,
      window.query,
    );
    const data = this.record(profitability);
    const period = this.record(data.period);
    const resolved = this.resolvedPeriodPayload(args, window);
    return {
      ...data,
      expense_period_declaration: declaration,
      resolved_period: resolved,
      period: {
        ...period,
        ...resolved,
        truncated_to_today: window.truncatedToToday,
      },
    };
  }

  /**
   * Доводка аргументов ДО подписи и показа карточки.
   *
   * 🔴 Почему не в реестре: там нет ни тенанта, ни его часового пояса, а
   * «сегодня» — понятие местное. И почему до хеша: карточка подтверждения
   * обязана показывать ту самую дату, которая будет записана. Если оставить
   * «сегодня» неразрешённым до момента исполнения, человек подтверждает одно,
   * а сервер пишет другое — на границе суток буквально другое число.
   *
   * Для всех остальных инструментов это тождественное преобразование.
   */
  async normalizeArguments(
    toolName: string,
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ): Promise<ValidatedAiToolArguments> {
    if (
      toolName !== 'expenses.create' ||
      typeof args.occurred_on === 'string'
    ) {
      return args;
    }
    const timezone = await this.reportingTimezone(principal.tenantId);
    return { ...args, occurred_on: this.localDate(new Date(), timezone) };
  }

  /**
   * Дописать в карточку подтверждения то, что видно только из базы.
   *
   * Пока что это одно: похоже ли расход на дубль уже записанного платежа из
   * другого источника. Предупреждение встаёт сразу после даты — то есть в
   * пределах тех шести полей, которые карточка вообще показывает.
   */
  async enrichApprovalPreview(
    toolName: string,
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (toolName === 'marketing.campaign.send') {
      const preview = await this.requireMarketingService().approvalPreview(
        principal.tenantId,
        String(args.campaign_id),
      );
      return { ...payload, ...preview };
    }
    if (toolName !== 'expenses.create') {
      return payload;
    }
    const amountKopecks = rublesToKopecks(args.amount_rubles);
    const category = findExpenseCategory(args.category);
    if (amountKopecks === null || !category) {
      return payload;
    }
    const timezone = await this.reportingTimezone(principal.tenantId);
    const occurredOn =
      typeof args.occurred_on === 'string'
        ? args.occurred_on
        : this.localDate(new Date(), timezone);
    // Подсказка о дубле — украшение карточки. Если её не удалось собрать,
    // расход всё равно должен дойти до подтверждения: потерять запись из-за
    // необязательной проверки хуже, чем не предупредить.
    const duplicates = await this.expensesService
      .findProbableDuplicates(principal.tenantId, {
        category: category.slug,
        amountKopecks,
        currency: 'RUB',
        occurredAt: localDateMinuteToUtc(occurredOn, 12 * 60, timezone),
        source: 'manual',
      })
      .catch(() => []);
    if (duplicates.length === 0) {
      return payload;
    }
    const first = duplicates[0];
    const enriched: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      enriched[key] = value;
      if (key === 'date') {
        enriched.alert = `Похоже на дубль: такой же расход уже записан ${this.humanDay(
          this.localDate(new Date(first.occurred_at), timezone),
        )}${first.source === 'crm' ? ' (пришёл из CRM)' : ''}. Записать всё равно?`;
      }
    }
    return enriched;
  }

  private requireMarketingService(): MarketingService {
    if (!this.marketingService) {
      throw new Error('MarketingService is unavailable');
    }
    return this.marketingService;
  }

  private requireBusinessContentService(): BusinessContentService {
    if (!this.businessContentService) {
      throw new Error('BusinessContentService is unavailable');
    }
    return this.businessContentService;
  }

  private requireAppointmentNotificationsService(): AppointmentNotificationsService {
    if (!this.appointmentNotificationsService) {
      throw new Error('Appointment notifications service is unavailable');
    }
    return this.appointmentNotificationsService;
  }

  private requireInboxService(): InboxService {
    if (!this.inboxService) {
      throw new Error('InboxService is unavailable');
    }
    return this.inboxService;
  }

  private humanDay(localDate: string): string {
    const [year, month, day] = localDate.split('-');
    return `${day}.${month}.${year}`;
  }

  private async forecastBusinessRevenue(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const analytics = this.record(
      await this.queryBusinessAnalytics(principal, {
        ...args,
        comparison: 'none',
      }),
    );
    const metrics = this.record(analytics.metrics);
    const actualKopecks = this.optionalMetricNumber(
      metrics.revenue_amount_kopecks,
    );
    if (actualKopecks === null || analytics.finance_verified !== true) {
      return {
        available: false,
        reason: 'verified_crm_revenue_is_unavailable',
        resolved_period: analytics.resolved_period,
      };
    }

    const timezone = await this.reportingTimezone(principal.tenantId);
    const horizon = this.revenueForecastHorizon(
      this.requiredString(args.period),
      typeof args.month === 'string' ? args.month : null,
      timezone,
    );
    const factor =
      horizon.elapsed_units > 0
        ? horizon.total_units / horizon.elapsed_units
        : 1;
    const projectedKopecks = Math.max(
      actualKopecks,
      Math.round(actualKopecks * factor),
    );
    const amount = (value: number) => ({
      currency: 'RUB',
      amount_kopecks: value,
      amount_major_units: this.majorUnits(value),
    });

    return {
      available: true,
      verified_actual: true,
      source: analytics.source,
      resolved_period: analytics.resolved_period,
      horizon,
      actual_revenue: amount(actualKopecks),
      projection: {
        method:
          factor === 1 ? 'closed_or_fixed_period' : 'linear_daily_run_rate',
        base: amount(projectedKopecks),
        conservative: amount(Math.round(projectedKopecks * 0.9)),
        optimistic: amount(Math.round(projectedKopecks * 1.1)),
        confidence:
          factor === 1
            ? 'actual'
            : horizon.elapsed_units >= 14
              ? 'medium'
              : 'low',
      },
      assumptions: [
        'only verified CRM revenue is used',
        'future seasonality, cancellations and capacity changes are not modelled',
        'the range is a scenario, not a guaranteed accounting forecast',
      ],
    };
  }

  /** KPI команды с личными планами из настроек владельца. */
  /** KPI команды с личными планами из настроек владельца. */
  private async readTeamKpi(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const window = await this.reportingWindow(principal.tenantId, args);
    const [state, financePreference] = await Promise.all([
      this.businessState.business({
        tenantId: principal.tenantId,
        period: window.query,
        comparisonMode: 'none',
        comparisonPeriod: null,
        financeAllowed: CRM_FINANCE_ROLES.has(principal.role),
        bookedValueAllowed: BOOKED_VALUE_ROLES.has(principal.role),
        disclose: (rows) => this.businessDisclosure(principal, rows),
      }),
      this.prisma.dashboardPreference.findUnique({
        where: {
          userId_tenantId_section: {
            userId: principal.userId,
            tenantId: principal.tenantId,
            section: 'finance',
          },
        },
        select: { configJson: true },
      }),
    ]);
    const financeConfig = this.record(financePreference?.configJson);
    const staffTargets = this.record(financeConfig.staff_targets_rub);
    const monthlyTarget = this.optionalMetricNumber(
      financeConfig.monthly_target_rub,
    );
    const businessRevenueKopecks = this.optionalMetricNumber(
      state.metrics.revenue_amount_kopecks,
    );
    const period = this.requiredString(args.period);
    const monthlyTargetComparable =
      period === 'month_to_date' || period === 'named_month';

    /**
     * 🔴 Планы — не бизнес-факт канонического слоя, а настройка владельца, и
     * живут они под внешним ключом мастера. Поэтому соединение делает этот
     * слой, а числа мастера берутся уже посчитанными: своей копии вычисления
     * здесь не осталось.
     */
    const staff = state.staffJoin
      .map(({ externalId, published }) => {
        const target = this.optionalMetricNumber(staffTargets[externalId]);
        const revenue = this.record(published.confirmed_revenue);
        const revenueAmount = this.safeMoneyAmount(revenue.amount);
        return {
          name:
            typeof published.name === 'string' && published.name !== ''
              ? published.name
              : 'Мастер',
          appointments: this.optionalMetricNumber(published.appointments) ?? 0,
          scheduled: this.optionalMetricNumber(published.scheduled) ?? 0,
          completed: this.optionalMetricNumber(published.completed) ?? 0,
          booked_minutes:
            this.optionalMetricNumber(published.booked_minutes) ?? 0,
          confirmed_revenue: published.confirmed_revenue,
          accrued_salary: published.salary,
          monthly_target_rub: target,
          target_progress_percent:
            monthlyTargetComparable && target && revenueAmount
              ? Math.round(
                  ((revenueAmount.amount_major_units ?? 0) / target) * 1_000,
                ) / 10
              : null,
        };
      })
      .sort(
        (left, right) =>
          (this.record(right.confirmed_revenue).status === 'available'
            ? 1
            : 0) -
            (this.record(left.confirmed_revenue).status === 'available'
              ? 1
              : 0) ||
          right.appointments - left.appointments ||
          left.name.localeCompare(right.name),
      );

    return {
      verified: state.verified,
      finance_verified: state.financeVerified,
      source: state.source,
      resolved_period: this.resolvedPeriodPayload(args, window),
      target_basis: 'calendar_month',
      monthly_target_comparable: monthlyTargetComparable,
      team_monthly_target_rub: monthlyTarget,
      team_confirmed_revenue:
        businessRevenueKopecks === null
          ? null
          : {
              currency: 'RUB',
              amount_kopecks: businessRevenueKopecks,
              amount_major_units: this.majorUnits(businessRevenueKopecks),
            },
      team_target_progress_percent:
        monthlyTargetComparable && monthlyTarget && businessRevenueKopecks
          ? Math.round((businessRevenueKopecks / 100 / monthlyTarget) * 1_000) /
            10
          : null,
      staff,
      /**
       * 🔴 Конверт KPI команды оставлен ПРЕЖНИМ: тот же состав и тот же
       * порядок, что работали в бою. Утверждения «маржа и окупаемость рекламы
       * недоступны» и разрез когорт сюда не входили — добавить их значило бы
       * поменять ответ под видом переноса.
       */
      limitations: [
        ...state.unavailableParts.staffMoney,
        ...state.unavailableParts.attendance,
        ...state.limitations,
      ],
    };
  }
  private async compareBranches(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const allBranches = await this.prisma.branch.findMany({
      where: { tenantId: principal.tenantId },
      select: { id: true, name: true, address: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 9,
    });
    const requestedIds = Array.isArray(args.branch_ids)
      ? new Set(
          args.branch_ids
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean),
        )
      : null;
    const branches = allBranches.filter(
      (branch) => !requestedIds || requestedIds.has(branch.id),
    );

    if (requestedIds) {
      const availableIds = new Set(branches.map((branch) => branch.id));
      const unknownIds = [...requestedIds].filter(
        (id) => !availableIds.has(id),
      );
      if (unknownIds.length > 0) {
        throw new BadRequestException('Unknown tenant branch id');
      }
    }
    if (branches.length < 2) {
      return {
        available: false,
        reason: 'at_least_two_tenant_branches_are_required',
        branch_count: branches.length,
      };
    }
    if (branches.length > 8 || (!requestedIds && allBranches.length > 8)) {
      return {
        available: false,
        reason: 'select_between_two_and_eight_branches',
        branch_count: allBranches.length,
      };
    }

    const metric =
      typeof args.metric === 'string' ? args.metric : 'appointments_completed';
    const rows = await Promise.all(
      branches.map(async (branch) => {
        const result = this.record(
          await this.queryBusinessAnalytics(principal, {
            ...args,
            branch_id: branch.id,
            comparison: 'none',
          }),
        );
        const metrics = this.record(result.metrics);
        return {
          branch: {
            id: branch.id,
            name: branch.name,
            address: branch.address,
          },
          verified: result.verified === true,
          source: result.source ?? null,
          resolved_period: result.resolved_period ?? null,
          // 🔴 Полнота у каждого филиала своя: журнал читается для каждого
          // отдельно, и один может прийти усечённым, а другой полным. Ранжировать
          // их как равные, не сказав об этом, значит сравнивать качество чтения.
          completeness: this.record(
            this.record(result.completeness).appointments,
          ),
          limitations: Array.isArray(result.limitations)
            ? result.limitations
            : [],
          metrics: {
            appointments_total: this.optionalMetricNumber(
              metrics.appointments_total,
            ),
            appointments_active: this.optionalMetricNumber(
              metrics.appointments_active,
            ),
            appointments_completed: this.optionalMetricNumber(
              metrics.appointments_completed,
            ),
            appointments_cancelled: this.optionalMetricNumber(
              metrics.appointments_cancelled,
            ),
            appointments_no_show: this.optionalMetricNumber(
              metrics.appointments_no_show,
            ),
            unique_clients: this.optionalMetricNumber(metrics.unique_clients),
            booked_minutes: this.optionalMetricNumber(metrics.booked_minutes),
          },
        };
      }),
    );
    const ranked = rows
      .map((row) => ({
        ...row,
        selected_metric_value: this.optionalMetricNumber(
          row.metrics[metric as keyof typeof row.metrics],
        ),
      }))
      .sort(
        (left, right) =>
          (right.selected_metric_value ?? -1) -
            (left.selected_metric_value ?? -1) ||
          left.branch.name.localeCompare(right.branch.name),
      );

    return {
      available: true,
      verified: ranked.every((row) => row.verified),
      metric,
      branch_count: ranked.length,
      branches: ranked,
      limitations: [
        {
          key: 'branch_confirmed_revenue',
          reason: 'yclients_finance_is_company_scoped',
        },
        ...(ranked.some((row) => row.completeness.status === 'incomplete')
          ? [
              {
                key: 'branch_completeness',
                reason:
                  'at least one branch was read incompletely, so its counters are a lower bound and the ranking may reflect how much was read rather than what happened',
              },
            ]
          : []),
      ],
    };
  }

  private async queryBusinessAnalytics(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const comparison = this.requiredString(args.comparison);
    if (
      !['none', 'previous_period', 'previous_year_same_period'].includes(
        comparison,
      )
    ) {
      throw new Error('Invalid business analytics comparison');
    }
    /**
     * 🔴 Cycle 04 P7. Окно разрешается ДО обращения к кэшу.
     *
     * Ключ строился из фразы запроса («today», «month»), а не из окна, которое
     * из неё получилось. Из-за этого «как сегодня» в 23:58 и то же «как
     * сегодня» в 00:01 следующих суток попадали в ОДНУ запись: срок жизни пять
     * минут, и владелец получал вчерашний день как сегодняшний. Часовой пояс в
     * ключ не входил вовсе.
     */
    const window = await this.reportingWindow(principal.tenantId, args);
    const cacheKey = this.periodCacheKey(
      [principal.tenantId, principal.role],
      window,
      comparison,
    );
    const cached = this.businessQueryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    if (cached) {
      this.businessQueryCache.delete(cacheKey);
    }

    const previousQuery =
      comparison === 'none'
        ? null
        : await this.comparisonReportingQuery(
            principal.tenantId,
            window.query,
            comparison as 'previous_period' | 'previous_year_same_period',
          );

    // 🔴 Вычисления здесь больше нет. Роль превращается в РЕШЕНИЕ (можно ли
    // читать деньги, кого называть по имени) и уезжает в канонический слой
    // готовым — обратной зависимости не возникает.
    const state = await this.businessState.business({
      tenantId: principal.tenantId,
      period: window.query,
      comparisonMode: comparison as PeriodComparisonMode,
      comparisonPeriod: previousQuery,
      financeAllowed: CRM_FINANCE_ROLES.has(principal.role),
      /**
       * 🔴 Стоимость записанного — ОПЕРАЦИОННЫЙ факт, и право на неё шире
       * права на кассу: это сумма цен того, что стоит в журнале, а не деньги
       * салона. Решение принимается здесь, по той же роли, по которой уже
       * решается доступ к бизнес-разрезу; канонический слой ролей не знает.
       */
      bookedValueAllowed: BOOKED_VALUE_ROLES.has(principal.role),
      disclose: (rows) => this.businessDisclosure(principal, rows),
    });

    const resolved = this.resolvedPeriodPayload(args, window);
    const result = {
      verified: state.verified,
      finance_verified: state.financeVerified,
      source: state.source,
      resolved_period: resolved,
      period: {
        ...this.record(state.period),
        ...resolved,
      },
      comparison: {
        mode: comparison,
        period: state.comparison.period,
        completeness: state.comparison.completeness,
      },
      current: state.current,
      previous: state.previous,
      metrics: state.metrics,
      changes: state.changes,
      service_changes: state.serviceChanges,
      staff_changes: state.staffChanges,
      available_metrics: state.availableMetrics,
      limitations: state.limitations,
      unavailable_metrics: state.unavailableMetrics,
      /**
       * 🔴 Cycle 04 P7. Момент вычисления едет вместе с ответом.
       *
       * Кэш живёт пять минут и до этого пакета никак не признавался в своём
       * возрасте: попадание выглядело как свежее измерение источника. Теперь
       * штамп ставится в момент РАСЧЁТА и переживает попадание — по нему видно,
       * насколько ответ стар.
       */
      calculated_at: new Date(Date.now()).toISOString(),
    };
    /**
     * 🔴 Неполный ответ НЕ кэшируется: держать деградировавший ответ пять
     * минут значит продлевать состояние, в котором ноль ничего не доказывает.
     *
     * Cycle 04 P7 расширил условие двумя случаями, которые раньше проходили
     * гейт: неполно прочитанный ПРОШЛЫЙ период (сравнение построено на нижней
     * границе) и молчащий денежный контур (деньги недоступны не потому, что их
     * нет, а потому, что источник не ответил). Оба — деградация, и закреплять
     * её на пять минут нельзя.
     */
    /**
     * 🔴 Молчание ДЕНЕЖНОГО контура кэширование НЕ отменяет — и это прежнее
     * решение, а не упущение.
     *
     * Соблазн был: не кэшировать ответ, где касса недоступна. Но записи в нём
     * прочитаны целиком, а недоступность денег записана В САМОМ ответе
     * (`revenue_basis: 'unavailable'` и причина словами). Существующая спека
     * закрепляет это поведение с прежних пакетов, и менять его заодно с
     * границами кэша значило бы протащить продуктовое решение под видом
     * технической правки. Возраст ответа теперь виден по `calculated_at`.
     */
    if (
      result.verified &&
      state.comparison.completeness.current !== 'incomplete' &&
      state.comparison.completeness.previous !== 'incomplete'
    ) {
      this.rememberPeriodAnswer(this.businessQueryCache, cacheKey, result);
    }
    return result;
  }

  /**
   * Кого называть по имени в бизнес-разрезе — решение по роли.
   *
   * Каталог инструментов решает, кого пускать к инструменту; имена коллег —
   * отдельная граница, и она проходит здесь.
   */
  private businessDisclosure(
    principal: AiToolPrincipal,
    rows: StaffIdentityRow[],
  ): StaffDisclosure {
    if (!NAMED_STAFF_BREAKDOWN_ROLES.has(principal.role)) {
      return { names: new Map(), allowedExternalIds: new Set<string>() };
    }
    return { names: this.staffDisplayNames(rows), allowedExternalIds: null };
  }
  private async queryEmployeeAnalytics(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const comparison = this.requiredString(args.comparison);
    if (
      !['none', 'previous_period', 'previous_year_same_period'].includes(
        comparison,
      )
    ) {
      throw new Error('Invalid employee analytics comparison');
    }
    // 🔴 Cycle 04 P7. То же самое для личного среза: ключ по РАЗРЕШЁННОМУ окну.
    const window = await this.reportingWindow(principal.tenantId, args);
    const cacheKey = this.periodCacheKey(
      [principal.tenantId, principal.userId, principal.role],
      window,
      comparison,
    );
    const cached = this.employeeQueryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    if (cached) {
      this.employeeQueryCache.delete(cacheKey);
    }

    const previousQuery =
      comparison === 'none'
        ? null
        : await this.comparisonReportingQuery(
            principal.tenantId,
            window.query,
            comparison as 'previous_period' | 'previous_year_same_period',
          );

    const state = await this.businessState.employee({
      tenantId: principal.tenantId,
      userId: principal.userId,
      period: window.query,
      comparisonMode: comparison as PeriodComparisonMode,
      comparisonPeriod: previousQuery,
      nameRows: (rows) => this.staffDisplayNames(rows),
    });

    const resolved = this.resolvedPeriodPayload(args, window);
    /**
     * 🔴 Конверт личного среза оставлен ПРЕЖНИМ. Соседний бизнес-срез отдаёт
     * `finance_verified`, здесь его нет и не было: касса конкретного мастера
     * провайдером не подтверждается, и добавить сюда флаг «деньги проверены»
     * значило бы завести новое утверждение под видом переноса.
     *
     * Единственное добавленное поле — полнота обеих сторон сравнения: то же
     * требование, что и в бизнес-срезе, и по той же причине.
     */
    const result = {
      verified: state.verified,
      source: state.source,
      resolved_period: resolved,
      period: {
        ...this.record(state.period),
        ...resolved,
      },
      comparison: {
        mode: comparison,
        period: state.comparison.period,
        completeness: state.comparison.completeness,
      },
      current: state.current,
      previous: state.previous,
      metrics: state.metrics,
      changes: state.changes,
      service_changes: state.serviceChanges,
      staff_changes: state.staffChanges,
      available_metrics: state.availableMetrics,
      limitations: state.limitations,
      unavailable_metrics: state.unavailableMetrics,
    };
    const motivation = await this.employeeMoneyMotivation(
      principal,
      window.query,
    );
    const enriched = {
      ...(motivation
        ? {
            ...result,
            limitations: [...result.limitations, ...motivation.limitations],
            money_motivation: motivation.money_motivation,
            upsell_opportunities: motivation.upsell_opportunities,
          }
        : result),
      // 🔴 Cycle 04 P7. Тот же штамп момента расчёта, что и у среза салона.
      calculated_at: new Date(Date.now()).toISOString(),
    };
    // Неполный ответ не кэшируется — та же причина, что и у бизнес-среза.
    if (
      enriched.verified &&
      state.comparison.completeness.current !== 'incomplete' &&
      state.comparison.completeness.previous !== 'incomplete'
    ) {
      this.rememberPeriodAnswer(this.employeeQueryCache, cacheKey, enriched);
    }
    return enriched;
  }
  /**
   * Денежная мотивация мастера.
   *
   * 🔴 Опубликованный срез сюда больше не передаётся: начисление здесь не
   * читается (см. комментарий ниже), а всё остальное берётся из визитов. Оставь
   * я аргумент «на будущее» — он бы намекал, что состояние тут используется.
   */
  private async employeeMoneyMotivation(
    principal: AiToolPrincipal,
    query: AnalyticsRangeQueryDto,
  ): Promise<{
    money_motivation: ReturnType<typeof computePeriodMoneyMotivation>;
    upsell_opportunities: ReturnType<typeof collectUpsellOpportunities>;
    /** Оговорки об источнике, если история прочитана не целиком. */
    limitations: Array<{ key: string; reason: string }>;
  } | null> {
    try {
      const bundle = await this.analyticsService.getEmployeeMotivationVisits(
        principal.tenantId,
        principal.userId,
        query,
        60,
      );
      if (!bundle) return null;
      const mapVisit = (appointment: {
        clientId: string | null;
        startAt: Date;
        status: string;
        totalPriceKopecks: number | null;
        services: Array<{ name: string; amountKopecks: number }>;
      }) =>
        toMotivationVisit({
          clientId: appointment.clientId,
          startAt: appointment.startAt,
          status: appointment.status,
          totalPriceKopecks: appointment.totalPriceKopecks,
          services: appointment.services,
        });
      const periodVisits = bundle.period.map(mapVisit);
      const historyVisits = bundle.history.map(mapVisit);
      /**
       * 🔴 Начисление здесь НЕ читается — и это сохранение боевого поведения,
       * а не упущение.
       *
       * Боевой код доставал строку мастера через обёртку `staffRows`, у которой
       * начисление лежит уровнем глубже. Поэтому `earned_rub` в бою был ВСЕГДА
       * `null`, доля мастера — всегда `0.5`, а «потенциал» считался от неё.
       * Это латентный дефект, а не задумка: числа мотивации годами стояли не на
       * том, на чём должны.
       *
       * P1 — перенос, а не исправление. Починить его здесь значит поменять
       * числа, которые видит мастер, под видом переезда: `potential_rub` и
       * `upside_rub` меняются в разы, а доля прыгает с 0.5 на настоящую.
       * Дефект зарегистрирован (реестр 4.22) и ждёт отдельного решения.
       */
      const earnedRub: number | null = null;
      const money_motivation = computePeriodMoneyMotivation({
        periodVisits,
        historyVisits,
        earnedRub,
        lookbackDays: 60,
      });
      const upsell_opportunities = collectUpsellOpportunities({
        periodVisits,
        historyVisits: [...historyVisits, ...periodVisits],
        salaryShare: money_motivation.salary_share ?? 0.5,
        limit: 3,
      });
      return {
        money_motivation,
        upsell_opportunities,
        // 🔴 Целевой чек берётся из верхних 40 % истории. Неполная история
        // сдвигает этот квартиль вниз, а «потенциал» при этом остаётся точным
        // на вид числом. Молчать об этом нельзя.
        limitations: bundle.complete
          ? []
          : [
              {
                key: 'motivation_history',
                reason:
                  'the visit history behind the target check was read incompletely, so target_check_rub and potential_rub rest on a partial sample',
              },
            ],
      };
    } catch {
      return null;
    }
  }

  private async comparisonReportingQuery(
    tenantId: string,
    current: AnalyticsRangeQueryDto,
    comparison: 'previous_period' | 'previous_year_same_period',
  ): Promise<AnalyticsRangeQueryDto> {
    const from = new Date(current.from);
    const to = new Date(current.to);
    if (comparison === 'previous_period') {
      const duration = to.getTime() - from.getTime();
      const previousTo = new Date(from.getTime() - 1);
      return {
        from: new Date(previousTo.getTime() - duration).toISOString(),
        to: previousTo.toISOString(),
        ...(current.branchId ? { branchId: current.branchId } : {}),
      };
    }

    const timezone = await this.reportingTimezone(tenantId, current.branchId);
    const shift = (value: Date) => {
      const local = this.localDateTime(value, timezone);
      const year = Number(local.date.slice(0, 4)) - 1;
      const date = this.sameLocalDateInYear(local.date, year);
      return new Date(
        localDateMinuteToUtc(
          date,
          local.hour * 60 + local.minute,
          timezone,
        ).getTime() +
          local.second * 1_000 +
          value.getUTCMilliseconds(),
      );
    };
    return {
      from: shift(from).toISOString(),
      to: shift(to).toISOString(),
      ...(current.branchId ? { branchId: current.branchId } : {}),
    };
  }

  private localDateTime(value: Date, timezone: string) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(value)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );
    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      hour: Number(parts.hour),
      minute: Number(parts.minute),
      second: Number(parts.second),
    };
  }

  private sameLocalDateInYear(value: string, year: number): string {
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
  }

  private optionalMetricNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private staffDisplayNames(rows: StaffIdentityRow[]): Map<string, string> {
    const names = new Map<string, string | null>();
    for (const row of rows) {
      if (!row.externalId) continue;
      if (!names.get(row.externalId)) {
        names.set(row.externalId, row.name);
      }
    }
    const display = new Map<string, string>();
    const taken = new Set<string>();
    [...names.keys()]
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
      .forEach((externalId, index) => {
        const base = names.get(externalId) ?? `Мастер ${index + 1}`;
        let candidate = base;
        let suffix = 1;
        while (taken.has(candidate)) {
          suffix += 1;
          candidate = `${base} (${suffix})`;
        }
        taken.add(candidate);
        display.set(externalId, candidate);
      });
    return display;
  }

  private async cancelOwnAppointment(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const result = await this.appointmentsService.cancelForClient(
      principal.tenantId,
      principal.userId,
      this.requiredString(args.appointment_id),
    );
    return this.safeAppointmentOutput(result);
  }

  private async createOwnAppointment(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const result = await this.appointmentsService.createForClient(
      principal.tenantId,
      principal.userId,
      this.bookingDto(args),
    );
    return this.safeAppointmentOutput(result);
  }

  private async rescheduleOwnAppointment(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const result = await this.appointmentsService.rescheduleForClient(
      principal.tenantId,
      principal.userId,
      this.requiredString(args.appointment_id),
      {
        start: this.requiredString(args.start),
        ...(typeof args.staff_id === 'string'
          ? { staffId: args.staff_id }
          : {}),
        ...(Array.isArray(args.service_ids)
          ? { serviceIds: this.stringArray(args.service_ids) }
          : {}),
        ...(typeof args.branch_id === 'string'
          ? { branchId: args.branch_id }
          : {}),
      },
    );
    return this.safeAppointmentOutput(result);
  }

  private async adjustInternalLoyalty(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
    idempotencyKey: string,
  ) {
    const result = await this.loyaltyService.adjustInternalBalance({
      tenantId: principal.tenantId,
      targetUserId: this.requiredString(args.target_user_id),
      actorUserId: principal.userId,
      dto: {
        delta: this.requiredNumber(args.delta),
        reason: this.requiredString(args.reason),
        idempotencyKey,
      },
    });
    return this.safeLoyalty(result);
  }

  private async reportingQuery(
    tenantId: string,
    args: ValidatedAiToolArguments,
  ) {
    return (await this.reportingWindow(tenantId, args)).query;
  }

  private async readRecoveredReport(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    if (!this.recoveryService) {
      throw new Error('Recovery attribution service is unavailable');
    }
    const query = await this.reportingQuery(principal.tenantId, args);
    return this.recoveryService.report(
      principal.tenantId,
      new Date(query.from),
      new Date(query.to),
    );
  }

  /**
   * Окно отчёта вместе с тем, что о нём нужно сказать вслух.
   *
   * `truncatedToToday` относится только к названному месяцу: спросили про
   * текущий месяц по имени — считаем по сегодня, и это обязано прозвучать в
   * ответе, иначе «июль» и «июль по седьмое» выглядят одинаково.
   * `named_day` / `named_range` — ровно названные локальные дни, без подмены месяцем.
   */
  /**
   * Ключ кэша факта периода.
   *
   * 🔴 Cycle 04 P7. Тождество периода — это РАЗРЕШЁННОЕ окно и часовой пояс, а
   * не фраза, из которой оно получилось. Ключ содержит:
   *   • арендатора и решение о видимости (роль/пользователь) — иначе кэш
   *     отдал бы привилегированный ответ тому, кому он не положен;
   *   • границы окна и пояс — иначе смена пояса или другой филиал попали бы в
   *     одну запись;
   *   • календарный день арендатора — но ТОЛЬКО для окон, обрезанных «по
   *     сейчас»: у них ответ законно другой в другие сутки, а у закрытых
   *     периодов день не влияет ни на что и в ключ не идёт.
   */
  /**
   * Положить ответ периода в кэш с ограничением размера.
   *
   * 🔴 Cycle 04 P7 (B4.8). У кэшей не было предела: словарь рос по числу
   * различных ключей и очищался только при обращении к просроченному ключу.
   * При одном арендаторе это незаметно, но предел — часть границы, а не
   * оптимизация: без него память растёт по числу ролей × периодов × суток.
   *
   * Сначала выбрасывается просроченное, потом — самое старое. Вытеснение
   * влияет на скорость, а не на правду: промах ведёт к владельцу факта.
   */
  private rememberPeriodAnswer(
    cache: Map<string, { expiresAt: number; value: unknown }>,
    key: string,
    value: unknown,
  ): void {
    const now = Date.now();
    if (cache.size >= PERIOD_CACHE_MAX_ENTRIES) {
      for (const [existingKey, entry] of cache) {
        if (entry.expiresAt <= now) cache.delete(existingKey);
      }
    }
    while (cache.size >= PERIOD_CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next();
      if (oldest.done) break;
      cache.delete(oldest.value);
    }
    cache.set(key, { expiresAt: now + 5 * 60 * 1_000, value });
  }

  private periodCacheKey(
    identity: string[],
    window: {
      query: AnalyticsRangeQueryDto;
      truncatedToToday: boolean;
      timezone: string | null;
      endTracksNow: boolean;
    },
    comparison: string,
  ): string {
    /**
     * 🔴 У окна, обрезанного «по сейчас», конец — это текущий момент, и класть
     * его в ключ значило бы не иметь кэша вовсе: ключ менялся бы каждую
     * миллисекунду. Тождество такого окна — начало плюс календарный день
     * арендатора: внутри суток ответ законно переиспользуется, а на границе
     * полуночи ключ меняется сам.
     *
     * У закрытого периода конец стабилен и в ключ входит.
     */
    const movingEnd =
      (window.truncatedToToday || window.endTracksNow) && window.timezone;
    const end = movingEnd
      ? `today:${this.localDate(new Date(Date.now()), window.timezone as string)}`
      : window.query.to;
    return [
      ...identity,
      window.query.from,
      end,
      window.timezone ?? '',
      window.query.branchId ?? '',
      comparison,
    ].join('|');
  }

  private async reportingWindow(
    tenantId: string,
    args: ValidatedAiToolArguments,
  ): Promise<{
    query: AnalyticsRangeQueryDto;
    truncatedToToday: boolean;
    namedMonth: string | null;
    namedDay: string | null;
    fromDay: string | null;
    toDay: string | null;
    /**
     * 🔴 Cycle 04 P7. Пояс, в котором построено окно.
     *
     * Нужен ключу кэша: без него один и тот же период в разных поясах попадал
     * бы в одну запись, а «сегодня» на границе суток — в чужие сутки.
     */
    timezone: string | null;
    /**
     * 🔴 Конец окна — это «сейчас», а не фиксированная граница.
     *
     * Так устроены `week_to_date`, `month_to_date`, `year_to_date`,
     * `last_7_days`, `last_30_days`: их правая граница движется с точностью до
     * миллисекунды. Ключу кэша такой конец класть НЕЛЬЗЯ — он менялся бы на
     * каждом вызове, и кэша не было бы вовсе.
     */
    endTracksNow: boolean;
  }> {
    const period = this.requiredString(args.period);
    const branchId =
      typeof args.branch_id === 'string' ? args.branch_id : undefined;
    if (period === 'custom') {
      return {
        query: {
          from: this.requiredString(args.from),
          to: this.requiredString(args.to),
          ...(branchId ? { branchId } : {}),
        },
        truncatedToToday: false,
        namedMonth: null,
        namedDay: null,
        fromDay: null,
        toDay: null,
        // Явные границы пояса не требуют: они уже абсолютные.
        timezone: null,
        endTracksNow: false,
      };
    }

    const timezone = await this.reportingTimezone(tenantId, branchId);
    const now = new Date();
    const today = this.localDate(now, timezone);
    const todayStart = localDateMinuteToUtc(today, 0, timezone);
    let from: Date;
    let to = now;
    let truncatedToToday = false;
    let namedMonth: string | null = null;
    let namedDay: string | null = null;
    let fromDay: string | null = null;
    let toDay: string | null = null;

    switch (period) {
      case 'today':
        from = todayStart;
        // Calendar questions about "today" must include appointments later
        // in the same local day. Finance remains sourced from completed CRM
        // operations, so extending this read window cannot invent revenue.
        to = new Date(
          localDateMinuteToUtc(
            this.shiftLocalDate(today, 1),
            0,
            timezone,
          ).getTime() - 1,
        );
        break;
      case 'yesterday': {
        const yesterday = this.shiftLocalDate(today, -1);
        from = localDateMinuteToUtc(yesterday, 0, timezone);
        to = new Date(todayStart.getTime() - 1);
        break;
      }
      case 'week_to_date': {
        const weekday = this.localWeekday(today);
        const monday = this.shiftLocalDate(today, -((weekday + 6) % 7));
        from = localDateMinuteToUtc(monday, 0, timezone);
        break;
      }
      case 'month_to_date':
        from = localDateMinuteToUtc(`${today.slice(0, 7)}-01`, 0, timezone);
        break;
      case 'year_to_date':
        from = localDateMinuteToUtc(`${today.slice(0, 4)}-01-01`, 0, timezone);
        break;
      case 'last_7_days':
        from = localDateMinuteToUtc(
          this.shiftLocalDate(today, -6),
          0,
          timezone,
        );
        break;
      case 'last_30_days':
        from = localDateMinuteToUtc(
          this.shiftLocalDate(today, -29),
          0,
          timezone,
        );
        break;
      case 'last_week': {
        // Прошлая календарная неделя пн–вс в TZ салона — не «последние 7 дней».
        const weekday = this.localWeekday(today);
        const thisMonday = this.shiftLocalDate(today, -((weekday + 6) % 7));
        const lastMonday = this.shiftLocalDate(thisMonday, -7);
        const thisMondayStart = localDateMinuteToUtc(thisMonday, 0, timezone);
        from = localDateMinuteToUtc(lastMonday, 0, timezone);
        to = new Date(thisMondayStart.getTime() - 1);
        break;
      }
      case 'last_month': {
        const currentMonth = `${today.slice(0, 7)}-01`;
        const previousMonth = this.shiftLocalMonth(currentMonth, -1);
        from = localDateMinuteToUtc(previousMonth, 0, timezone);
        to = new Date(
          localDateMinuteToUtc(currentMonth, 0, timezone).getTime() - 1,
        );
        break;
      }
      case 'named_day': {
        // Один названный день — ровно этот локальный день. «Отчёт за 7 августа»
        // нельзя подменять суммой за август: это и была жалоба владельца.
        namedDay = this.requiredString(args.day);
        from = localDateMinuteToUtc(namedDay, 0, timezone);
        const nextDay = this.shiftLocalDate(namedDay, 1);
        to = new Date(localDateMinuteToUtc(nextDay, 0, timezone).getTime() - 1);
        break;
      }
      case 'named_range': {
        fromDay = this.requiredString(args.from_day);
        toDay = this.requiredString(args.to_day);
        from = localDateMinuteToUtc(fromDay, 0, timezone);
        const dayAfter = this.shiftLocalDate(toDay, 1);
        to = new Date(
          localDateMinuteToUtc(dayAfter, 0, timezone).getTime() - 1,
        );
        if (to.getTime() > now.getTime()) {
          to = now;
          truncatedToToday = true;
        }
        break;
      }
      case 'named_month': {
        // Названный месяц — это КАЛЕНДАРНЫЙ месяц целиком, от первого числа до
        // последней миллисекунды последнего. Отвечать на «прибыль в июле»
        // цифрами текущего месяца по сегодня — самая незаметная ложь из
        // возможных: числа настоящие, период чужой.
        namedMonth = this.requiredString(args.month);
        const firstDay = `${namedMonth}-01`;
        from = localDateMinuteToUtc(firstDay, 0, timezone);
        const monthEnd = new Date(
          localDateMinuteToUtc(
            this.shiftLocalMonth(firstDay, 1),
            0,
            timezone,
          ).getTime() - 1,
        );
        if (monthEnd.getTime() > now.getTime()) {
          // Месяц ещё идёт: считаем по сегодня и обязаны это сказать.
          to = now;
          truncatedToToday = true;
        } else {
          to = monthEnd;
        }
        break;
      }
      default:
        throw new Error('Validated AI reporting period is invalid');
    }

    return {
      query: {
        from: from.toISOString(),
        to: to.toISOString(),
        ...(branchId ? { branchId } : {}),
      },
      truncatedToToday,
      namedMonth,
      namedDay,
      fromDay,
      toDay,
      timezone,
      // Ветки, оставившие правую границу нетронутой, отдают «сейчас».
      endTracksNow: to === now,
    };
  }

  private periodArgsFromValidated(
    args: ValidatedAiToolArguments,
  ): ReportingPeriodToolArgs {
    return {
      period: this.requiredString(args.period),
      ...(typeof args.day === 'string' ? { day: args.day } : {}),
      ...(typeof args.month === 'string' ? { month: args.month } : {}),
      ...(typeof args.from_day === 'string' ? { from_day: args.from_day } : {}),
      ...(typeof args.to_day === 'string' ? { to_day: args.to_day } : {}),
    };
  }

  private resolvedPeriodPayload(
    args: ValidatedAiToolArguments,
    window: {
      query: AnalyticsRangeQueryDto;
      truncatedToToday: boolean;
    },
  ) {
    return ReportingPeriodResolver.resolvedPeriodMeta(
      this.periodArgsFromValidated(args),
      { from: window.query.from, to: window.query.to },
      { truncatedToToday: window.truncatedToToday },
    );
  }

  private async reportingTimezone(
    tenantId: string,
    branchId?: string,
  ): Promise<string> {
    if (branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, tenantId },
        select: { timezone: true },
      });
      if (!branch) {
        throw new Error('AI reporting branch is unavailable');
      }
      if (branch.timezone) {
        return branch.timezone;
      }
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { defaultTimezone: true },
    });
    if (!tenant) {
      throw new Error('AI reporting tenant is unavailable');
    }
    return tenant.defaultTimezone;
  }

  private localDate(value: Date, timezone: string): string {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .formatToParts(value)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  private localTime(value: string, timezone: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date);
  }

  private clockMinutes(value: string): number {
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match) {
      return 0;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours * 60 + minutes;
  }

  private shiftLocalDate(value: string, days: number): string {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  private clientRecencyScore(value: string | null): number {
    if (!value) return 0;
    const timestamp = Date.parse(`${value.slice(0, 10)}T00:00:00.000Z`);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  private inactivityDays(lastVisitDate: string | null, asOf: string) {
    if (!lastVisitDate) return null;
    const last = this.clientRecencyScore(lastVisitDate);
    const current = this.clientRecencyScore(asOf);
    return last > 0 && current >= last
      ? Math.floor((current - last) / (24 * 60 * 60 * 1_000))
      : null;
  }

  private normalizedAppointmentStatus(
    value: string,
  ): 'no_show' | 'canceled' | 'completed' | 'other' {
    // Разбор принадлежит домену. Здесь остаётся только проекция канона на те
    // четыре ответа, которых ждут вызывающие: «впереди» и «не разобрано» для
    // этой статистики одинаково безразличны и оба означают `other`.
    const outcome = parseVisitOutcome(value);
    return outcome === 'scheduled' || outcome === 'unknown' ? 'other' : outcome;
  }

  /**
   * Чтение журнала за период — через канонического читателя.
   *
   * 🔴 Cycle 04 P6. Здесь жила ВТОРАЯ нарезка периода на окна провайдера: своя
   * арифметика курсора, свой запас в сутки, без параллельных волн и без
   * фильтра по мастеру. Ревизия остатка доказала, что обе реализации обходят
   * одно ограничение, обслуживают одно намерение (бизнес-период) и сходятся в
   * одну и ту же чистую функцию — то есть это была копия, а не вторая задача.
   *
   * У копии вдобавок был доказуемый дефект: при периоде, кратном длине окна,
   * последний кусок получался нулевой длины, и граница CRM отвечала отказом.
   */
  private async readJournalRangeInChunks(
    tenantId: string,
    fromIso: string,
    toIso: string,
    timezone: string,
  ): Promise<PeriodRead<CrmJournalAppointment>> {
    return this.appointmentPeriodReader.readProviderJournal(tenantId, {
      from: fromIso,
      to: toIso,
      timezone,
    });
  }
  private shiftLocalMonth(value: string, months: number): string {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCMonth(date.getUTCMonth() + months);
    return date.toISOString().slice(0, 10);
  }

  private localWeekday(value: string): number {
    return new Date(`${value}T00:00:00.000Z`).getUTCDay();
  }

  private revenueForecastHorizon(
    period: string,
    namedMonth: string | null,
    timezone: string,
  ) {
    const today = this.localDate(new Date(), timezone);
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7));
    const day = Number(today.slice(8, 10));
    if (period === 'week_to_date') {
      return {
        status: 'open',
        unit: 'day',
        elapsed_units: ((this.localWeekday(today) + 6) % 7) + 1,
        total_units: 7,
      };
    }
    if (
      period === 'month_to_date' ||
      (period === 'named_month' && namedMonth === today.slice(0, 7))
    ) {
      return {
        status: 'open',
        unit: 'day',
        elapsed_units: day,
        total_units: new Date(Date.UTC(year, month, 0)).getUTCDate(),
      };
    }
    if (period === 'year_to_date') {
      const start = Date.UTC(year, 0, 1);
      const current = Date.UTC(year, month - 1, day);
      return {
        status: 'open',
        unit: 'day',
        elapsed_units: Math.floor((current - start) / 86_400_000) + 1,
        total_units: Math.floor(
          (Date.UTC(year + 1, 0, 1) - start) / 86_400_000,
        ),
      };
    }
    return {
      status: 'closed_or_fixed',
      unit: 'period',
      elapsed_units: 1,
      total_units: 1,
    };
  }

  private safeAppointment(value: unknown) {
    const item = this.record(value);
    const branch = this.recordOrNull(item.branch);
    const staff = this.recordOrNull(item.staff);
    const services = Array.isArray(item.services)
      ? item.services.map((service) => {
          const safe = this.record(service);
          return {
            id: safe.id ?? null,
            name: safe.name ?? null,
            price: safe.price ?? null,
            duration_minutes: safe.duration_minutes ?? null,
            currency: safe.currency ?? null,
            category: safe.category ?? null,
          };
        })
      : [];

    return {
      id: item.id ?? null,
      status: item.status ?? null,
      start_at: item.start_at ?? null,
      end_at: item.end_at ?? null,
      is_upcoming: item.is_upcoming ?? null,
      timeline: item.timeline ?? null,
      branch: branch
        ? { id: branch.id ?? null, name: branch.name ?? null }
        : null,
      staff: staff
        ? {
            title: staff.title ?? null,
            specialization: staff.specialization ?? null,
          }
        : null,
      services,
      total_price: item.total_price ?? null,
      duration_minutes: item.duration_minutes ?? null,
      currency: item.currency ?? null,
    };
  }

  private safeAppointmentOutput(value: unknown) {
    const result = this.record(value);
    const appointment = this.recordOrNull(result.appointment);
    return this.safeAppointment(appointment ?? result);
  }

  private bookingDto(args: ValidatedAiToolArguments) {
    return {
      staffId: this.requiredString(args.staff_id),
      serviceIds: this.stringArray(args.service_ids),
      start: this.requiredString(args.start),
      ...(typeof args.branch_id === 'string'
        ? { branchId: args.branch_id }
        : {}),
    };
  }

  private safeLoyalty(value: unknown) {
    const loyalty = this.record(value);
    const spend = this.record(loyalty.spend_options);
    const items = Array.isArray(spend.items)
      ? spend.items.slice(0, 6).map((item) => {
          const service = this.record(item);
          return {
            id: service.id ?? null,
            name: service.name ?? null,
            price: service.price ?? null,
            points_required: service.points_required ?? null,
            currency: service.currency ?? loyalty.currency ?? 'RUB',
            category: service.category ?? null,
          };
        })
      : [];
    return {
      balance: loyalty.balance ?? null,
      currency: loyalty.currency ?? 'RUB',
      source: loyalty.source ?? null,
      /** Канонический владелец. Раньше наружу уходил только старый алиас. */
      authority: loyalty.authority ?? null,
      authority_scope: loyalty.authority_scope ?? null,
      authoritative: loyalty.authoritative ?? null,
      sync_status: loyalty.sync_status ?? null,
      stale: loyalty.stale ?? null,
      // 🔴 Без этого поля поверхность чата произносила число без единой
      // оговорки — даже когда оно отдано из кэша, потому что владелец молчит.
      verification_required: loyalty.verification_required ?? true,
      synced_at: loyalty.synced_at ?? null,
      spend_options: {
        status: spend.status ?? null,
        basis: spend.basis ?? null,
        verification_required: spend.verification_required ?? true,
        items,
        best_service: spend.best_service ?? null,
        next_service: spend.next_service ?? null,
      },
    };
  }

  private safeMoneyEntries(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((entry) => {
      const item = this.record(entry);
      return {
        currency: item.currency ?? null,
        amount_kopecks: item.amount_kopecks ?? null,
        amount_major_units: this.majorUnits(item.amount_kopecks),
      };
    });
  }

  private safeMoneyAmount(value: unknown) {
    const item = this.record(value);
    if (
      typeof item.amount_kopecks !== 'number' ||
      !Number.isFinite(item.amount_kopecks)
    ) {
      return null;
    }
    return {
      currency: typeof item.currency === 'string' ? item.currency : null,
      amount_kopecks: item.amount_kopecks,
      amount_major_units: this.majorUnits(item.amount_kopecks),
    };
  }

  private safeWarningCodes(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((warning) => this.record(warning).code)
      .filter(
        (code): code is string =>
          typeof code === 'string' && /^[a-z0-9_:-]{1,80}$/i.test(code),
      );
  }

  private majorUnits(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value)
      ? value / 100
      : null;
  }

  private record(value: unknown): Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private allowedStringValues<T extends string>(
    value: unknown,
    allowed: readonly T[],
    fallback: readonly T[],
  ): T[] {
    if (!Array.isArray(value)) return [...fallback];
    const accepted = value.filter(
      (item): item is T =>
        typeof item === 'string' && allowed.includes(item as T),
    );
    return accepted.length > 0 ? [...new Set(accepted)] : [...fallback];
  }

  private recordOrNull(value: unknown): Record<string, unknown> | null {
    const result = this.record(value);
    return Object.keys(result).length > 0 ? result : null;
  }

  private requiredString(value: unknown): string {
    if (typeof value !== 'string') {
      throw new Error('Validated AI tool string is missing');
    }
    return value;
  }

  private requiredNumber(value: unknown): number {
    if (typeof value !== 'number') {
      throw new Error('Validated AI tool number is missing');
    }
    return value;
  }

  private scheduleSlots(value: unknown): StaffScheduleSlot[] {
    if (!Array.isArray(value)) {
      throw new Error('Validated AI tool schedule slots are missing');
    }
    return value.map((item) => {
      const slot = this.record(item);
      return {
        from: this.requiredString(slot.from),
        to: this.requiredString(slot.to),
      };
    });
  }

  private stringArray(value: unknown): string[] {
    if (
      !Array.isArray(value) ||
      value.some((item) => typeof item !== 'string')
    ) {
      throw new Error('Validated AI tool string array is missing');
    }
    return value as string[];
  }
}
