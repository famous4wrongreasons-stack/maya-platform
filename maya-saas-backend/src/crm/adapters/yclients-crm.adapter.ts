import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';

import {
  CRM_REQUEST_TIMEOUT_MS,
  CrmOutcomeUnknownError,
  CrmRecordGoneError,
  isUnknownOutcomeCause,
} from '../crm-request.errors';
import {
  AvailableSlot,
  AppliedStaffScheduleDayChange,
  ApplyStaffScheduleDayChangeParams,
  CancelledAppointment,
  ClientAppointmentsParams,
  ClientLoyaltySnapshot,
  CRMAdapter,
  CrmAppointmentDetail,
  CrmAppointmentRevenueSnapshot,
  CrmClientRegistrySnapshot,
  CrmClientSearchResult,
  CrmCompanyOption,
  CrmCompanyProfile,
  CrmFinancialSummary,
  CrmRevenueSummary,
  CrmJournal,
  CrmJournalAppointment,
  CrmJournalMaster,
  CrmTeamMember,
  CrmStaffPayroll,
  CreatedAppointment,
  CrmAdapterConfig,
  CreateAppointmentParams,
  RescheduledAppointment,
  ServiceItem,
  StaffMember,
  StaffScheduleChangePreview,
  StaffScheduleDay,
  StaffScheduleSlot,
} from '../crm-adapter.interface';
import { localDateMinuteToUtc } from '../../internal-calendar/internal-calendar.utils';
import { normalizePhoneE164 } from '../../common/phone.util';
import {
  normalizeScheduleSlots,
  scheduleMinutesLabel,
  scheduleSlotsContain,
  staffScheduleRevision,
} from '../staff-schedule.utils';
import { encodeCrmAppointmentKey } from '../../domain';
import type { VisitAttendance } from '../../domain';
import {
  attendanceFromCode,
  attendanceToCode,
  WRITABLE_ATTENDANCE_CODES,
} from '../crm-attendance';

interface YclientsSettings {
  companyId?: number | string;
  activeMasterIds?: Array<number | string>;
  currency?: string;
}

interface YclientsStaffApiItem {
  id: number;
  name?: string;
  specialization?: string;
  avatar?: string;
  photo?: string;
  rating?: number;
  fired?: boolean | number;
  hidden?: boolean | number;
  bookable?: boolean;
  status?: number;
}

interface YclientsCompanyApiItem {
  id?: number | string;
  title?: string;
  public_title?: string;
  address?: string;
  city?: string;
  active?: boolean;
  logo?: string;
  /** Числовое смещение от UTC (например 7 для Новосибирска). */
  timezone?: string | number;
  /** Имя зоны IANA, если YClients его отдал. */
  timezone_name?: string;
  schedule?: string;
}

interface YclientsServiceCategoryApiItem {
  id?: number;
  title?: string;
}

interface YclientsServiceApiItem {
  id: number;
  title?: string;
  price_min?: number;
  price_max?: number;
  duration?: number | null;
  seance_length?: number;
  category_id?: number | null;
  category?: YclientsServiceCategoryApiItem | null;
}

interface YclientsSlotApiItem {
  time?: string;
  datetime?: string;
  seance_length?: number;
}

interface YclientsRecordClientApiItem {
  id?: number | string;
  phone?: string;
  name?: string;
}

interface YclientsRecordStaffApiItem {
  id?: number | string;
  name?: string;
  specialization?: string;
  avatar?: string;
  photo?: string;
}

interface YclientsRecordServiceApiItem {
  id?: number | string;
  title?: string;
  cost?: number | string;
  /** Скидка по услуге в визите — при PUT обязана переноситься, иначе теряется. */
  discount?: number | string;
  /** Цена до скидки. YClients ждёт её вместе с cost при перезаписи состава. */
  first_cost?: number | string;
  price_min?: number | string;
  duration?: number | null;
  seance_length?: number;
}

interface YclientsRecordApiItem {
  id?: number | string;
  date?: string;
  datetime?: string;
  length?: number;
  seance_length?: number;
  attendance?: number;
  visit_attendance?: number;
  paid_full?: boolean | number;
  deleted?: boolean;
  comment?: string;
  staff_id?: number | string;
  client?: YclientsRecordClientApiItem | null;
  staff?: YclientsRecordStaffApiItem | null;
  services?: YclientsRecordServiceApiItem[] | null;
}

interface YclientsResponse<TData> {
  success?: boolean;
  data?: TData;
  meta?: {
    message?: string;
  };
}

interface YclientsClientSearchItem {
  id?: number | string;
  name?: string;
  phone?: string;
  visits_count?: number | string;
  sold_amount?: number | string;
  last_visit_date?: string | null;
}

interface YclientsLoyaltyCard {
  id?: number | string;
  balance?: number | string;
  sold_amount?: number | string;
  type?: { title?: string } | null;
  programs?: Array<{
    loyalty_type?: { is_cashback?: boolean } | null;
  }>;
}

interface YclientsFinanceTransactionApiItem {
  id?: number | string;
  amount?: number | string;
  sold_item_type?: string | null;
  record_id?: number | string | null;
  master_id?: number | string | null;
  staff_id?: number | string | null;
  master?: { id?: number | string; name?: string } | null;
  staff?: { id?: number | string; name?: string } | null;
  account?: {
    title?: string;
    name?: string;
    is_cash?: boolean | number;
  } | null;
}

interface YclientsScheduleApiItem {
  date?: string;
  is_working?: boolean | number;
  slots?: Array<{ from?: string; to?: string }> | null;
}

interface YclientsPayrollApiData {
  total_sum?: {
    income?: number | string;
    expense?: number | string;
    balance?: number | string;
  } | null;
  currency?: {
    symbol?: string;
  } | null;
}

export class YclientsCRMAdapter implements CRMAdapter {
  private readonly baseUrl: string;
  private readonly partnerToken: string;
  private readonly settings: YclientsSettings;
  private staffCatalogPromise: Promise<YclientsStaffApiItem[]> | null = null;
  private serviceCatalogPromise: Promise<YclientsServiceApiItem[]> | null =
    null;
  private serviceCategoryPromise: Promise<
    YclientsServiceCategoryApiItem[]
  > | null = null;

  constructor(private readonly config: CrmAdapterConfig) {
    this.baseUrl = (
      config.baseUrl ||
      process.env.YCLIENTS_BASE_URL ||
      'https://api.yclients.com/api/v1'
    ).replace(/\/+$/, '');

    this.partnerToken = process.env.YCLIENTS_PARTNER_TOKEN || '';
    this.settings = (config.settings as YclientsSettings | undefined) ?? {};

    if (!this.partnerToken) {
      throw new InternalServerErrorException(
        'YCLIENTS_PARTNER_TOKEN is not configured',
      );
    }
  }

  async discoverCompanies(): Promise<CrmCompanyOption[]> {
    const query = new URLSearchParams();
    query.set('my', '1');
    const response = await this.request<YclientsCompanyApiItem[]>('companies', {
      query,
    });

    return (response.data || [])
      .filter(
        (company) =>
          company.active !== false &&
          company.id !== undefined &&
          company.id !== null,
      )
      .slice(0, 200)
      .map((company) => {
        const id = String(company.id);
        const title =
          company.title?.trim() ||
          company.public_title?.trim() ||
          `Филиал ${id}`;
        const address = company.address?.trim() || company.city?.trim() || null;

        return { id, title, address };
      });
  }

  /**
   * Часовой пояс салона из CRM.
   *
   * 🔴 Раньше пояс тенанта никогда не брался из CRM и оставался московским.
   * Для салона в Новосибирске или Калининграде это означало пустую сетку
   * расписания: границы дня уезжали мимо рабочих часов.
   *
   * YClients отдаёт либо имя зоны, либо числовое смещение. Имя предпочтительнее
   * (оно знает про переходы), смещение переводим в Etc/GMT — знак там обратный,
   * это не опечатка, а стандарт POSIX.
   */
  private toIanaTimezone(company: YclientsCompanyApiItem): string | null {
    const name = String(company.timezone_name || '').trim();

    if (/^[A-Za-z]+\/[A-Za-z_+\-/]+$/.test(name)) {
      return name;
    }

    const offset = Number(company.timezone);

    if (Number.isFinite(offset) && offset >= -12 && offset <= 14) {
      const rounded = Math.trunc(offset);
      if (rounded === 0) return 'UTC';
      return rounded > 0
        ? `Etc/GMT-${rounded}`
        : `Etc/GMT+${Math.abs(rounded)}`;
    }

    return null;
  }

  async getCompanyProfile(): Promise<CrmCompanyProfile | null> {
    const companyId = this.getCompanyId();

    try {
      const response = await this.request<YclientsCompanyApiItem>(
        `company/${companyId}`,
      );
      const company = response.data;

      if (company?.id) {
        const id = String(company.id);
        return {
          id,
          title:
            company.title?.trim() ||
            company.public_title?.trim() ||
            `Филиал ${id}`,
          address: company.address?.trim() || company.city?.trim() || null,
          logo_url: company.logo?.trim() || null,
          timezone: this.toIanaTimezone(company),
          schedule: company.schedule?.trim() || null,
        };
      }
    } catch {
      // Company discovery is the authoritative access check and is available
      // even when the optional detailed profile endpoint is restricted.
    }

    const discovered = (await this.discoverCompanies()).find(
      (company) => company.id === String(companyId),
    );
    if (!discovered) {
      return null;
    }

    return {
      ...discovered,
      logo_url: null,
      timezone: null,
      schedule: null,
    };
  }

  async getServices(tenantId: string): Promise<ServiceItem[]> {
    void tenantId;

    const [services, categories] = await Promise.all([
      this.getServiceCatalog(),
      this.getServiceCategoryCatalog().catch(() => []),
    ]);
    const categoryTitlesById = new Map<number, string>();

    for (const category of categories) {
      if (typeof category.id === 'number') {
        categoryTitlesById.set(category.id, category.title || '');
      }
    }

    return services.map((service) => ({
      id: String(service.id),
      name: service.title || '',
      price: service.price_min ?? service.price_max ?? 0,
      duration_minutes: Math.max(
        1,
        Math.round((service.duration || service.seance_length || 0) / 60) || 60,
      ),
      currency: this.settings.currency || 'RUB',
      category:
        service.category?.title ||
        (typeof service.category_id === 'number'
          ? categoryTitlesById.get(service.category_id) || undefined
          : undefined),
    }));
  }

  async getStaff(tenantId: string): Promise<StaffMember[]> {
    void tenantId;

    const catalog = await this.getStaffCatalog();
    const allowedIds = this.getActiveMasterIds();
    const items = catalog.filter((staff) => {
      if (this.isInactiveStaff(staff)) {
        return false;
      }
      return allowedIds ? allowedIds.includes(staff.id) : true;
    });

    return items.map((staff) => this.mapStaffMember(staff));
  }

  async getTeamMembers(tenantId: string): Promise<CrmTeamMember[]> {
    void tenantId;

    const catalog = await this.getStaffCatalog();
    const allowedIds = this.getActiveMasterIds();

    return catalog
      .filter((staff) => !this.isFiredStaff(staff))
      .map((staff) => {
        const bookable =
          staff.hidden !== true &&
          staff.hidden !== 1 &&
          staff.bookable !== false &&
          (!allowedIds || allowedIds.includes(staff.id));
        const member = this.mapStaffMember(staff);

        return {
          ...member,
          bookable,
          suggested_role: this.isAdministrativeStaff(staff, bookable)
            ? 'administrator'
            : 'staff',
        };
      });
  }

  async getAvailableSlots(params: {
    tenantId: string;
    date: string;
    staffId?: string;
    serviceIds?: string[];
    branchId?: string;
  }): Promise<AvailableSlot[]> {
    void params.tenantId;

    const date = this.toYclientsDate(params.date);
    const staffIds = params.staffId
      ? [this.toNumericId(params.staffId, 'staffId')]
      : (await this.getStaff('')).map((staff) =>
          this.toNumericId(staff.id, 'staffId'),
        );

    const resultSets = await Promise.all(
      staffIds.map(async (staffId) => {
        const query = new URLSearchParams();
        query.set('date', date);

        for (const serviceId of params.serviceIds || []) {
          query.append(
            'service_ids[]',
            String(this.toNumericId(serviceId, 'serviceId')),
          );
        }

        try {
          const response = await this.request<YclientsSlotApiItem[]>(
            `book_times/${this.getCompanyId()}/${staffId}/${date}`,
            {
              query,
            },
          );

          return (response.data || []).map((slot) =>
            this.mapSlot(date, staffId, slot, params.branchId),
          );
        } catch (error) {
          // YClients book_times returns 422 "Дата недоступна" for days off /
          // closed schedule. Treat as empty — otherwise available-days fails
          // as soon as it probes the first non-working day.
          if (this.isDateUnavailableError(error)) {
            return [];
          }
          throw error;
        }
      }),
    );

    return resultSets.flat();
  }

  async createAppointment(
    params: CreateAppointmentParams,
  ): Promise<CreatedAppointment> {
    // 🔴 Клиентская запись без телефона невозможна — иначе клиента не с кем
    // связать. Но в журнале телефон вводит только владелец: мастеру поле ПД не
    // показывают, и легаси-кабинет годами создаёт такие записи с пустым
    // телефоном. Поэтому на админском пути требование снимаем.
    if (!params.clientPhone && params.allowBusy !== true) {
      throw new Error(
        'YClients appointment creation requires a client phone number',
      );
    }

    const serviceCatalog = await this.fetchServices();
    const selectedServices = serviceCatalog.filter((service) =>
      params.serviceIds.includes(String(service.id)),
    );
    const manualMinutes = Number(params.durationMinutes);
    const seanceLengthSeconds =
      Number.isFinite(manualMinutes) &&
      manualMinutes >= 5 &&
      manualMinutes <= 720
        ? Math.round(manualMinutes) * 60
        : selectedServices.reduce(
            (total, service) =>
              total + (service.seance_length || service.duration || 0),
            0,
          ) || 3600;

    const payload = {
      staff_id: this.toNumericId(params.staffId, 'staffId'),
      services: params.serviceIds.map((serviceId) => ({
        id: this.toNumericId(serviceId, 'serviceId'),
        amount: 1,
      })),
      client: {
        phone: params.clientPhone
          ? this.normalizePhone(params.clientPhone)
          : '',
        name: params.clientName || params.clientPhone || 'Клиент',
      },
      datetime: this.toYclientsDateTime(params.start),
      seance_length: seanceLengthSeconds,
      // Ручная запись из журнала: мастер сажает клиента поверх занятого окна
      // или вне графика сознательно — это его решение, а не ошибка ввода.
      save_if_busy: params.allowBusy === true,
      send_sms: false,
      comment: params.notes || '',
    };

    const response = await this.request<
      Record<string, unknown> | Array<Record<string, unknown>>
    >(`records/${this.getCompanyId()}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const record = Array.isArray(response.data)
      ? response.data[0]
      : response.data;
    const externalId =
      typeof record?.id === 'number' || typeof record?.id === 'string'
        ? record.id
        : typeof record?.record_id === 'number' ||
            typeof record?.record_id === 'string'
          ? record.record_id
          : null;

    if (!externalId) {
      throw new Error(
        response.meta?.message || 'YClients did not return a created record id',
      );
    }

    return {
      external_id: String(externalId),
      status: 'confirmed',
      start: this.toYclientsDateTime(params.start),
      staff_id: params.staffId,
      service_ids: params.serviceIds,
      branch_id: params.branchId ?? null,
      raw: {
        provider: this.config.provider,
        record,
      },
    };
  }

  async cancelAppointment(params: {
    tenantId: string;
    externalId: string;
  }): Promise<CancelledAppointment> {
    void params.tenantId;

    const externalId = String(
      this.toNumericId(params.externalId, 'externalId'),
    );
    const response = await this.request<Record<string, unknown>>(
      `record/${this.getCompanyId()}/${externalId}`,
      {
        method: 'DELETE',
      },
    );

    return {
      external_id: externalId,
      status: 'canceled',
      raw: {
        provider: this.config.provider,
        response: response.data ?? null,
        success: response.success ?? true,
      },
    };
  }

  async rescheduleAppointment(params: {
    tenantId: string;
    externalId: string;
    start: string;
    staffId?: string;
    serviceIds?: string[];
    notes?: string | null;
  }): Promise<RescheduledAppointment> {
    void params.tenantId;

    const externalId = String(
      this.toNumericId(params.externalId, 'externalId'),
    );
    const currentResponse = await this.request<YclientsRecordApiItem>(
      `record/${this.getCompanyId()}/${externalId}`,
    );
    const record = currentResponse.data;

    if (!record) {
      throw new Error('YClients record was not found');
    }

    const finalStaffId =
      params.staffId ??
      (record.staff?.id !== undefined ? String(record.staff.id) : undefined);
    const finalServiceIds =
      params.serviceIds && params.serviceIds.length > 0
        ? params.serviceIds
        : (record.services || [])
            .map((service) =>
              service.id !== undefined ? String(service.id) : null,
            )
            .filter((serviceId): serviceId is string => Boolean(serviceId));

    if (!finalStaffId) {
      throw new Error('YClients record does not have a staff member to retain');
    }

    if (finalServiceIds.length === 0) {
      throw new Error('YClients record does not have services to retain');
    }

    // Цены и скидки из ТЕКУЩЕЙ записи, а не из каталога: в визите могла стоять
    // ручная цена или скидка, и каталожная стоимость её бы затёрла.
    const pricedServices = new Map<
      string,
      { cost?: number; discount?: number; first_cost?: number }
    >();

    for (const service of record.services || []) {
      if (service?.id === undefined) {
        continue;
      }

      const cost = Number(service.cost);
      const discount = Number(service.discount);
      const firstCost = Number(service.first_cost);
      const kept: { cost?: number; discount?: number; first_cost?: number } =
        {};

      if (Number.isFinite(cost)) {
        kept.cost = cost;
        kept.first_cost = Number.isFinite(firstCost) ? firstCost : cost;
      }

      if (Number.isFinite(discount)) {
        kept.discount = discount;
      }

      if (Object.keys(kept).length > 0) {
        pricedServices.set(String(service.id), kept);
      }
    }

    const serviceCatalog = await this.fetchServices();
    const selectedServices = serviceCatalog.filter((service) =>
      finalServiceIds.includes(String(service.id)),
    );
    // 🔴 Длительность при переносе НЕ пересчитываем, если состав услуг не
    // меняли. На визите может стоять длительность, выставленная мастером —
    // кнопками ±15 в сетке или прямо при ручной записи. Пересчёт по каталогу
    // схлопывал бы её обратно, и визит наезжал бы на следующего клиента.
    const servicesChanged = Boolean(
      params.serviceIds && params.serviceIds.length > 0,
    );
    const currentSeanceLength = Number(record.seance_length);
    const keptSeanceLength =
      !servicesChanged &&
      Number.isFinite(currentSeanceLength) &&
      currentSeanceLength > 0
        ? currentSeanceLength
        : 0;
    const seanceLengthSeconds =
      keptSeanceLength ||
      selectedServices.reduce(
        (total, service) =>
          total + (service.seance_length || service.duration || 0),
        0,
      ) ||
      record.seance_length ||
      3600;
    const client = record.client || {};
    const payload = {
      staff_id: this.toNumericId(finalStaffId, 'staffId'),
      datetime: this.toYclientsDateTime(params.start),
      seance_length: seanceLengthSeconds,
      save_if_busy: false,
      send_sms: false,
      client: {
        ...(client.id !== undefined
          ? { id: this.toNumericId(client.id, 'client.id') }
          : {}),
        phone: client.phone ? this.normalizePhone(client.phone) : '',
        name: client.name || client.phone || '',
      },
      // 🔴 Цены переносим ЯВНО. YClients при PUT перезаписывает состав услуг
      // целиком: услуга, пришедшая без cost/first_cost, теряет свою стоимость.
      // Перенос визита с ручной ценой или скидкой обнулял бы договорённость с
      // клиентом. Легаси-бэкенд во всех неразрушающих PUT шлёт полный набор
      // {id, cost, discount, first_cost} — повторяем то же самое.
      services: finalServiceIds.map((serviceId) => {
        const kept = pricedServices.get(String(serviceId));

        return {
          id: this.toNumericId(serviceId, 'serviceId'),
          amount: 1,
          ...(kept ? kept : {}),
        };
      }),
      attendance: typeof record.attendance === 'number' ? record.attendance : 0,
      comment: params.notes ?? record.comment ?? '',
    };

    const response = await this.request<Record<string, unknown>>(
      `record/${this.getCompanyId()}/${externalId}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    );

    return {
      external_id: externalId,
      status: 'confirmed',
      start: this.toYclientsDateTime(params.start),
      staff_id: finalStaffId,
      service_ids: finalServiceIds,
      raw: {
        provider: this.config.provider,
        response: response.data ?? null,
        success: response.success ?? true,
      },
    };
  }

  async getClientAppointments(
    params: ClientAppointmentsParams,
  ): Promise<CreatedAppointment[]> {
    void params.tenantId;
    const client = await this.findClientByPhone(params.phone);

    if (client?.id === undefined) {
      return [];
    }

    const from =
      params.from ||
      new Date(Date.now() - 730 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
    const to =
      params.to ||
      new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
    const timezone = params.timezone || 'Europe/Moscow';
    const records = await this.fetchRecords({
      startDate: from.slice(0, 10),
      endDate: to.slice(0, 10),
      clientId: this.toNumericId(client.id, 'client.id'),
    });

    return records
      .filter((record) => record.id !== undefined)
      .map((record) => {
        const timing = this.recordTiming(record, timezone);
        const serviceIds = (record.services || [])
          .map((service) =>
            service.id === undefined ? null : String(service.id),
          )
          .filter((serviceId): serviceId is string => Boolean(serviceId));
        const serviceCosts = (record.services || [])
          .map((service) => Number(service.cost ?? service.price_min))
          .filter((cost) => Number.isFinite(cost));

        return {
          external_id: String(record.id),
          status: this.recordStatus(record),
          start: timing.start.toISOString(),
          end: timing.end.toISOString(),
          staff_id: String(record.staff_id ?? record.staff?.id ?? ''),
          service_ids: serviceIds,
          branch_id: null,
          total_price:
            serviceCosts.length > 0
              ? serviceCosts.reduce((total, cost) => total + cost, 0)
              : null,
          currency: this.settings.currency || 'RUB',
          raw: {
            provider: this.config.provider,
            imported: true,
            attendance: record.attendance ?? 0,
          },
        };
      })
      .filter((record) => Boolean(record.staff_id));
  }

  /**
   * Журнал за период.
   *
   * 🔴 `includeCanceled` по умолчанию ВЫКЛЮЧЕН, и это не осторожность ради
   * осторожности. Сетку расписания и карточку визита рисует тот же ответ:
   * начни журнал молча отдавать отменённые визиты — и в сетке появятся
   * карточки на времени, которое салон уже перепродал, поверх живой записи.
   * Поэтому отмены отдаются только тому, кто их явно попросил (аналитика,
   * ответ владельцу «сколько у нас отмен»), а сетка получает ровно то же, что
   * получала раньше.
   *
   * Отмена и неявка — РАЗНЫЕ статусы (`canceled` и `no_show`), потому что это
   * разные события бизнеса: отменённое заранее окно можно было перепродать,
   * неявка — окно, потерянное безвозвратно. Схлопывать их в одно число значит
   * прятать от владельца половину ответа.
   */
  async getJournal(params: {
    tenantId: string;
    from: string;
    to: string;
    timezone: string;
    providerId?: string;
    /** Отдать и отменённые визиты со статусом `canceled`. По умолчанию нет. */
    includeCanceled?: boolean;
  }): Promise<CrmJournal> {
    void params.tenantId;
    const includeCanceled = params.includeCanceled === true;
    const startDate = this.dateKeyInTimezone(params.from, params.timezone);
    const inclusiveEnd = new Date(new Date(params.to).getTime() - 1);
    const endDate = this.dateKeyInTimezone(
      inclusiveEnd.toISOString(),
      params.timezone,
    );
    const [records, staff, services] = await Promise.all([
      this.fetchRecords({
        startDate,
        endDate,
        staffId: params.providerId
          ? this.toNumericId(params.providerId, 'providerId')
          : undefined,
        withDeleted: includeCanceled,
      }),
      this.getStaff(params.tenantId),
      this.getServices(params.tenantId),
    ]);
    const staffById = new Map(staff.map((member) => [member.id, member]));
    const servicesById = new Map(
      services.map((service) => [service.id, service]),
    );
    const appointments = records
      .filter(
        (record) =>
          record.id !== undefined && (includeCanceled || !record.deleted),
      )
      .map((record) =>
        this.mapJournalAppointment(
          record,
          params.timezone,
          staffById,
          servicesById,
        ),
      )
      .filter(
        (appointment): appointment is CrmJournalAppointment =>
          appointment !== null,
      );

    // Мастера со сменами — только для однодневного журнала: смена привязана к
    // дате, и отдавать её для диапазона значило бы соврать. Сетка расписания
    // всегда запрашивает один день.
    let masters: CrmJournalMaster[] | undefined;
    let allMasters: CrmJournalMaster[] | undefined;

    if (startDate === endDate) {
      const schedules = await Promise.all(
        staff.map((member) =>
          this.fetchStaffSchedule(member.id, startDate).then(
            (schedule) => [member.id, schedule] as const,
          ),
        ),
      );
      const scheduleByStaffId = new Map(schedules);
      // Колонку мастеру вне графика открывает только ЖИВАЯ запись. Отменённая
      // ничего не занимает: мастер, у которого весь день состоял из отмен,
      // сегодня не работает, и рисовать ему пустой столбец — врать сетке.
      const staffIdsWithRecords = new Set(
        appointments
          .filter((appointment) => appointment.status !== 'canceled')
          .map((appointment) => appointment.provider.id),
      );

      allMasters = staff.map((member) =>
        this.buildJournalMaster(
          member,
          scheduleByStaffId.get(member.id) ?? null,
        ),
      );
      // В сетку берём тех, кто в смене, плюс тех, у кого есть записи (мастер
      // мог принять клиента вне графика — колонка обязана появиться), плюс тех,
      // по кому график неизвестен: спрятать их значило бы спрятать их записи.
      masters = allMasters.filter(
        (master) =>
          master.is_working !== false || staffIdsWithRecords.has(master.id),
      );
    }

    return {
      calendar_source: 'external',
      timezone: params.timezone,
      range: {
        from: params.from,
        to: params.to,
      },
      provider_id: params.providerId ?? null,
      count: appointments.length,
      appointments,
      ...(masters ? { masters } : {}),
      ...(allMasters ? { all_masters: allMasters } : {}),
    };
  }

  /**
   * НЕРАЗРУШАЮЩЕЕ обновление визита: PUT record/{company}/{id}.
   *
   * 🔴 YClients при PUT перезаписывает запись ЦЕЛИКОМ: всё, что не прислали,
   * теряется. Поэтому сначала читаем текущую запись и собираем полный payload
   * (клиент, мастер, услуги С ЦЕНАМИ и скидками, время, длительность,
   * присутствие, комментарий), и только потом накладываем изменение.
   * Именно так это годами делает легаси-бэкенд; попытка «прислать только то,
   * что меняем» стирает цены и состав услуг.
   */
  private async putRecordPreserving(
    externalId: string,
    overrides: Record<string, unknown>,
    options?: { saveIfBusy?: boolean },
  ): Promise<YclientsRecordApiItem> {
    const numericId = this.toNumericId(externalId, 'externalId');
    const current = await this.request<YclientsRecordApiItem>(
      `record/${this.getCompanyId()}/${numericId}`,
    );
    const record = current.data;

    if (!record) {
      throw new Error('YClients record was not found');
    }

    const client = record.client || {};
    const services = (record.services || [])
      .filter((service) => service?.id !== undefined)
      .map((service) => {
        const cost = Number(service.cost);
        const discount = Number(service.discount);
        const firstCost = Number(service.first_cost);

        return {
          id: this.toNumericId(String(service.id), 'serviceId'),
          amount: 1,
          ...(Number.isFinite(cost)
            ? {
                cost,
                first_cost: Number.isFinite(firstCost) ? firstCost : cost,
              }
            : {}),
          ...(Number.isFinite(discount) ? { discount } : {}),
        };
      });

    const payload: Record<string, unknown> = {
      staff_id: this.toNumericId(
        String(record.staff?.id ?? record.staff_id ?? ''),
        'staffId',
      ),
      datetime: record.datetime || record.date,
      seance_length: record.seance_length ?? record.length ?? 3600,
      save_if_busy: options?.saveIfBusy === true,
      send_sms: false,
      client: {
        ...(client.id !== undefined
          ? { id: this.toNumericId(String(client.id), 'client.id') }
          : {}),
        phone: client.phone ? this.normalizePhone(client.phone) : '',
        name: client.name || client.phone || '',
      },
      services,
      attendance: typeof record.attendance === 'number' ? record.attendance : 0,
      comment: record.comment ?? '',
      ...overrides,
    };

    const response = await this.request<YclientsRecordApiItem>(
      `record/${this.getCompanyId()}/${numericId}`,
      { method: 'PUT', body: JSON.stringify(payload) },
    );

    return response.data ?? record;
  }

  async markAppointmentAttendance(params: {
    tenantId: string;
    externalId: string;
    attendance: VisitAttendance;
  }): Promise<{ external_id: string; attendance: VisitAttendance }> {
    void params.tenantId;
    // Кодировка провайдера появляется ровно здесь и дальше этого метода не идёт.
    const code = attendanceToCode(params.attendance);
    const attendance = WRITABLE_ATTENDANCE_CODES.includes(code) ? code : 0;
    // 🔴 save_if_busy обязателен: время визита мы не двигаем, но слот занят
    // самой же этой записью, а у журнальной записи поверх чужого окна — ещё и
    // соседней. С save_if_busy=false YClients отклонил бы PUT, и кнопки
    // «Пришёл» / «Не пришёл» не работали бы вовсе.
    await this.putRecordPreserving(
      params.externalId,
      { attendance },
      { saveIfBusy: true },
    );

    return {
      external_id: params.externalId,
      attendance: attendanceFromCode(attendance),
    };
  }

  async setAppointmentDuration(params: {
    tenantId: string;
    externalId: string;
    durationMinutes: number;
  }): Promise<{ external_id: string; duration_minutes: number }> {
    void params.tenantId;
    const minutes = Math.round(Number(params.durationMinutes));

    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 720) {
      throw new Error('Длительность визита должна быть от 5 до 720 минут');
    }

    // save_if_busy: растянуть визит поверх соседнего окна разрешаем — в журнале
    // это решает мастер. Время начала при этом не двигается.
    await this.putRecordPreserving(
      params.externalId,
      { seance_length: minutes * 60 },
      { saveIfBusy: true },
    );

    return { external_id: params.externalId, duration_minutes: minutes };
  }

  async setAppointmentServices(params: {
    tenantId: string;
    externalId: string;
    serviceIds: string[];
  }): Promise<{ external_id: string; service_ids: string[] }> {
    void params.tenantId;

    if (!params.serviceIds.length) {
      throw new Error('В визите должна остаться хотя бы одна услуга');
    }

    const numericId = this.toNumericId(params.externalId, 'externalId');
    const current = await this.request<YclientsRecordApiItem>(
      `record/${this.getCompanyId()}/${numericId}`,
    );
    // Цены уже стоявших услуг сохраняем, новым берём каталожную стоимость.
    // 🔴 Вместе с cost переносим и first_cost — цену ДО скидки. Если подставить
    // сюда цену со скидкой, YClients пересчитает визит от неё, и скидка
    // применится второй раз: договорённость с клиентом уедет вниз.
    const keptPrices = new Map<
      string,
      { cost: number; discount: number; firstCost: number }
    >();

    for (const service of current.data?.services || []) {
      const cost = Number(service?.cost);
      if (service?.id !== undefined && Number.isFinite(cost)) {
        const discount = Number(service.discount);
        const firstCost = Number(service.first_cost);
        keptPrices.set(String(service.id), {
          cost,
          discount: Number.isFinite(discount) ? discount : 0,
          firstCost: Number.isFinite(firstCost) ? firstCost : cost,
        });
      }
    }

    const catalog = await this.fetchServices();
    const catalogById = new Map(
      catalog.map((service) => [String(service.id), service]),
    );
    const services = params.serviceIds.map((serviceId) => {
      const kept = keptPrices.get(String(serviceId));
      const cost =
        kept?.cost ??
        catalogById.get(String(serviceId))?.price_min ??
        catalogById.get(String(serviceId))?.price_max ??
        0;

      return {
        id: this.toNumericId(serviceId, 'serviceId'),
        amount: 1,
        cost,
        first_cost: kept?.firstCost ?? cost,
        discount: kept?.discount ?? 0,
      };
    });
    // Длительность визита = сумма длительностей услуг, как в журнале салона.
    const seanceLength =
      params.serviceIds.reduce((total, serviceId) => {
        const service = catalogById.get(String(serviceId));
        return total + (service?.seance_length || service?.duration || 0);
      }, 0) || undefined;

    await this.putRecordPreserving(
      params.externalId,
      {
        services,
        ...(seanceLength ? { seance_length: seanceLength } : {}),
      },
      { saveIfBusy: true },
    );

    return { external_id: params.externalId, service_ids: params.serviceIds };
  }

  /**
   * Чей это визит — одним запросом.
   *
   * Страж доступа вызывается перед КАЖДОЙ операцией мастера, а полная карточка
   * тянет ещё штат и каталог услуг. Для проверки владельца этого не нужно.
   */
  async getAppointmentStaffId(params: {
    tenantId: string;
    externalId: string;
  }): Promise<string | null> {
    void params.tenantId;
    const numericId = this.toNumericId(params.externalId, 'externalId');
    const response = await this.request<YclientsRecordApiItem>(
      `record/${this.getCompanyId()}/${numericId}`,
    );
    const record = response.data;

    if (!record) {
      return null;
    }

    const staffId = String(record.staff_id ?? record.staff?.id ?? '');

    return staffId || null;
  }

  /**
   * Карточка визита по тапу в сетке: то же, что в журнале, плюс телефон
   * клиента, длительность и отметка о приходе — их в списке дня нет.
   */
  async getAppointmentDetail(params: {
    tenantId: string;
    externalId: string;
    timezone: string;
  }): Promise<CrmAppointmentDetail> {
    const numericId = this.toNumericId(params.externalId, 'externalId');
    const [response, staff, services] = await Promise.all([
      this.request<YclientsRecordApiItem>(
        `record/${this.getCompanyId()}/${numericId}`,
      ),
      this.getStaff(params.tenantId),
      this.getServices(params.tenantId),
    ]);
    const record = response.data;

    if (!record) {
      throw new Error('YClients record was not found');
    }

    const appointment = this.mapJournalAppointment(
      record,
      params.timezone,
      new Map(staff.map((member) => [member.id, member])),
      new Map(services.map((service) => [service.id, service])),
    );

    if (!appointment) {
      throw new Error('YClients record is malformed');
    }

    const seconds = Number(record.seance_length ?? record.length);
    const durationMinutes =
      Number.isFinite(seconds) && seconds > 0
        ? Math.round(seconds / 60)
        : Math.max(
            5,
            Math.round(
              (new Date(appointment.end_at).getTime() -
                new Date(appointment.start_at).getTime()) /
                60000,
            ),
          );

    return {
      ...appointment,
      client_phone: record.client?.phone
        ? this.normalizePhone(record.client.phone)
        : null,
      duration_minutes: durationMinutes,
      attendance: attendanceFromCode(record.attendance),
      paid: record.paid_full === true || record.paid_full === 1,
      // Удалённую запись править нечего — кабинет спрячет кнопки.
      can_edit: record.deleted !== true,
    };
  }

  /**
   * Подсказка постоянного клиента при ручной записи.
   *
   * 🔴 Короткий запрос НЕ ищем: YClients на пустой quick_search отдаёт просто
   * первых клиентов подряд — это утечка чужих ПД в подсказку. Тот же порог,
   * что в легаси-бэкенде: 4 цифры телефона или 3 символа имени.
   */
  async searchClients(params: {
    tenantId: string;
    query: string;
  }): Promise<CrmClientSearchResult[]> {
    void params.tenantId;
    const query = String(params.query ?? '').trim();
    const digits = query.replace(/\D/g, '');

    if (digits.length < 4 && query.length < 3) {
      return [];
    }

    // Отказ поиска не должен ронять экран записи — подсказка необязательна.
    try {
      const response = await this.request<YclientsClientSearchItem[]>(
        `company/${this.getCompanyId()}/clients/search`,
        {
          method: 'POST',
          body: JSON.stringify({
            fields: [
              'id',
              'name',
              'phone',
              'visits_count',
              'sold_amount',
              'last_visit_date',
            ],
            filters: [{ type: 'quick_search', state: { value: query } }],
            page: 1,
            page_size: 10,
          }),
        },
      );

      return (response.data || [])
        .filter((candidate) => candidate?.id !== undefined)
        .map((candidate) => ({
          id: String(candidate.id),
          name: String(candidate.name || '').trim(),
          phone: candidate.phone ? this.normalizePhone(candidate.phone) : null,
          visits_count: this.optionalNonNegativeInteger(candidate.visits_count),
          sold_amount: this.optionalNonNegativeNumber(candidate.sold_amount),
          last_visit_date: this.normalizeClientVisitDate(
            candidate.last_visit_date,
          ),
        }));
    } catch {
      return [];
    }
  }

  /**
   * Выгружает весь реестр YClients без персональных полей.
   * Любая ошибка страницы прерывает вызов: частичное число хуже честного
   * отказа, потому что MAYA назовёт его точным.
   */
  async getClientRegistry(params: {
    tenantId: string;
  }): Promise<CrmClientRegistrySnapshot> {
    void params.tenantId;
    const pageSize = 200;
    const maxPages = 500;
    const clients = new Map<
      string,
      CrmClientRegistrySnapshot['clients'][number]
    >();

    for (let page = 1; page <= maxPages; page += 1) {
      const response = await this.request<YclientsClientSearchItem[]>(
        `company/${this.getCompanyId()}/clients/search`,
        {
          method: 'POST',
          body: JSON.stringify({
            // 🔴 name/phone нужны для поимённого списка спящих гостей: владелец
            // должен знать, КОГО возвращать. Наружу, к внешней модели, они не
            // выходят — инструменты статистики отдают псевдонимы, а поимённый
            // список собирает сервер.
            fields: [
              'id',
              'name',
              'phone',
              'visits_count',
              'sold_amount',
              'last_visit_date',
            ],
            filters: [],
            page,
            page_size: pageSize,
          }),
        },
      );
      const batch = response.data || [];
      let added = 0;

      for (const candidate of batch) {
        if (candidate?.id === undefined || candidate.id === null) {
          throw new Error(
            'YClients client registry contains an item without id',
          );
        }
        const externalId = String(candidate.id);
        if (clients.has(externalId)) {
          continue;
        }
        clients.set(externalId, {
          external_id: externalId,
          visits_count:
            this.optionalNonNegativeInteger(candidate.visits_count) ?? 0,
          sold_amount:
            this.optionalNonNegativeNumber(candidate.sold_amount) ?? 0,
          last_visit_date: this.normalizeClientVisitDate(
            candidate.last_visit_date,
          ),
          name:
            typeof candidate.name === 'string' && candidate.name.trim()
              ? candidate.name.trim()
              : null,
          phone:
            typeof candidate.phone === 'string' && candidate.phone.trim()
              ? candidate.phone.trim()
              : null,
        });
        added += 1;
      }

      if (batch.length < pageSize) {
        return {
          provider: this.config.provider,
          clients: [...clients.values()],
          generated_at: new Date().toISOString(),
          complete: true,
        };
      }
      if (added === 0) {
        throw new Error('YClients client registry pagination made no progress');
      }
      if (page === maxPages) {
        throw new Error('YClients client registry exceeds the safe page limit');
      }
    }

    throw new Error('YClients client registry pagination did not complete');
  }

  /**
   * История визитов для AI-досье / апсейла.
   * Берём реально состоявшиеся (attendance=1), как в легаси get_client_history.
   */
  async getClientVisitHistory(params: {
    tenantId: string;
    clientId: string;
    limit?: number;
  }): Promise<
    Array<{
      start: string;
      service_names: string[];
      total_price: number | null;
      attendance: VisitAttendance | null;
    }>
  > {
    void params.tenantId;
    const limit = Math.min(Math.max(params.limit ?? 30, 1), 50);
    const clientId = this.toNumericId(params.clientId, 'client.id');
    const end = new Date();
    const start = new Date(end.getTime() - 730 * 24 * 60 * 60 * 1000);
    const records = await this.fetchRecords({
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      clientId,
    });

    return records
      .filter((record) => this.hasAttendance(record, 1))
      .map((record) => {
        const timing = this.recordTiming(record, 'Europe/Moscow');
        const serviceNames = (record.services || [])
          .map((service) => String(service.title || '').trim())
          .filter(Boolean);
        const serviceCosts = (record.services || [])
          .map((service) => Number(service.cost ?? service.price_min))
          .filter((cost) => Number.isFinite(cost));
        return {
          start: timing.start.toISOString(),
          service_names: serviceNames,
          total_price:
            serviceCosts.length > 0
              ? serviceCosts.reduce((total, cost) => total + cost, 0)
              : null,
          attendance: 'arrived' as const,
        };
      })
      .sort((left, right) => left.start.localeCompare(right.start))
      .slice(-limit);
  }

  async getStaffScheduleDay(params: {
    tenantId: string;
    staffId: string;
    date: string;
  }): Promise<StaffScheduleDay> {
    void params.tenantId;
    return this.readStaffScheduleDay(params.staffId, params.date);
  }

  async previewStaffScheduleDayChange(params: {
    tenantId: string;
    staffId: string;
    date: string;
    slots: StaffScheduleSlot[];
    timezone: string;
  }): Promise<StaffScheduleChangePreview> {
    void params.tenantId;
    const today = this.dateKeyInTimezone(
      new Date().toISOString(),
      params.timezone,
    );
    if (params.date < today) {
      throw new BadRequestException({
        message: 'График за прошедший день менять через MAYA нельзя.',
        error: { code: 'staff_schedule_past_date' },
      });
    }
    const proposedSlots = normalizeScheduleSlots(params.slots);
    const current = await this.readStaffScheduleDay(
      params.staffId,
      params.date,
    );
    const records = await this.fetchRecords({
      startDate: params.date,
      endDate: params.date,
      staffId: this.toNumericId(params.staffId, 'staffId'),
    });
    const conflictTimes = this.staffScheduleConflictTimes(
      records,
      params.date,
      proposedSlots,
      params.timezone,
    );

    return {
      current,
      proposed: this.staffScheduleDay(
        params.staffId,
        params.date,
        proposedSlots,
      ),
      conflict_times: conflictTimes,
    };
  }

  async applyStaffScheduleDayChange(
    params: ApplyStaffScheduleDayChangeParams,
  ): Promise<AppliedStaffScheduleDayChange> {
    const preview = await this.previewStaffScheduleDayChange(params);
    if (preview.current.revision !== params.expectedRevision) {
      throw new ConflictException({
        message: 'График уже изменился. Повторите команду.',
        error: { code: 'staff_schedule_revision_conflict' },
      });
    }
    if (preview.conflict_times.length > 0) {
      throw new ConflictException({
        message: 'Существующие записи не помещаются в новый график.',
        error: {
          code: 'staff_schedule_existing_appointments_conflict',
          conflict_times: preview.conflict_times,
        },
      });
    }

    await this.writeStaffScheduleDay(
      params.staffId,
      params.date,
      preview.proposed.slots,
    );
    const verified = await this.readStaffScheduleDay(
      params.staffId,
      params.date,
    );

    if (verified.revision !== preview.proposed.revision) {
      try {
        await this.writeStaffScheduleDay(
          params.staffId,
          params.date,
          preview.current.slots,
        );
      } catch {
        // The failed verification is reported below; recovery is best effort.
      }
      throw new ConflictException({
        message: 'YClients не подтвердил новый график. Изменение откачено.',
        error: { code: 'staff_schedule_update_unverified' },
      });
    }

    return {
      staff_id: verified.staff_id,
      date: verified.date,
      is_working: verified.is_working,
      slots: verified.slots,
      verified: true,
    };
  }

  private async readStaffScheduleDay(
    staffId: string,
    dateKey: string,
  ): Promise<StaffScheduleDay> {
    const schedule = await this.fetchStaffScheduleStrict(staffId, dateKey);
    const slots = normalizeScheduleSlots(
      (schedule?.slots || [])
        .map((slot) => ({
          from: String(slot?.from || '').trim(),
          to: String(slot?.to || '').trim(),
        }))
        .filter((slot) => slot.from && slot.to),
    );
    return this.staffScheduleDay(staffId, dateKey, slots);
  }

  private staffScheduleDay(
    staffId: string,
    date: string,
    slots: StaffScheduleSlot[],
  ): StaffScheduleDay {
    const normalized = normalizeScheduleSlots(slots);
    return {
      staff_id: String(staffId),
      date,
      is_working: normalized.length > 0,
      slots: normalized,
      revision: staffScheduleRevision(staffId, date, normalized),
    };
  }

  private async writeStaffScheduleDay(
    staffId: string,
    date: string,
    slots: StaffScheduleSlot[],
  ): Promise<void> {
    const normalized = normalizeScheduleSlots(slots);
    const numericStaffId = this.toNumericId(staffId, 'staffId');
    const payload = normalized.length
      ? {
          schedules_to_set: [
            { staff_id: numericStaffId, dates: [date], slots: normalized },
          ],
          schedules_to_delete: [],
        }
      : {
          schedules_to_set: [],
          schedules_to_delete: [{ staff_id: numericStaffId, dates: [date] }],
        };
    const response = await this.request<unknown>(
      `company/${this.getCompanyId()}/staff/schedule`,
      { method: 'PUT', body: JSON.stringify(payload) },
    );
    if (response.success === false) {
      throw new Error('YClients did not accept the staff schedule update');
    }
  }

  private staffScheduleConflictTimes(
    records: YclientsRecordApiItem[],
    date: string,
    slots: StaffScheduleSlot[],
    timezone: string,
  ): string[] {
    const conflicts = new Set<string>();
    const now = new Date();
    for (const record of records) {
      if (
        record.deleted ||
        record.attendance === -1 ||
        record.visit_attendance === -1
      ) {
        continue;
      }
      const timing = this.recordTiming(record, timezone);
      if (timing.end.getTime() <= now.getTime()) {
        continue;
      }
      if (
        this.dateKeyInTimezone(timing.start.toISOString(), timezone) !== date
      ) {
        continue;
      }
      const fromMinutes = this.minuteInTimezone(timing.start, timezone);
      const endDate = this.dateKeyInTimezone(
        timing.end.toISOString(),
        timezone,
      );
      const toMinutes = this.minuteInTimezone(timing.end, timezone);
      if (
        endDate !== date ||
        !scheduleSlotsContain(slots, fromMinutes, toMinutes)
      ) {
        conflicts.add(scheduleMinutesLabel(fromMinutes));
      }
    }
    return [...conflicts].sort();
  }

  private async fetchStaffScheduleStrict(
    staffId: string,
    dateKey: string,
  ): Promise<YclientsScheduleApiItem | null> {
    const numericId = this.toNumericId(staffId, 'staffId');
    const response = await this.request<YclientsScheduleApiItem[]>(
      `schedule/${this.getCompanyId()}/${numericId}/${dateKey}/${dateKey}`,
    );
    const rows = response.data || [];
    return (
      rows.find(
        (row) => row && String(row.date || '').slice(0, 10) === dateKey,
      ) ?? null
    );
  }

  /**
   * График смены мастера на конкретный день: schedule/{company}/{staff}/{from}/{to}.
   *
   * Отказ по одному мастеру НЕ должен ронять весь журнал — у токена может не
   * быть прав на график, и тогда сетка обязана нарисоваться хотя бы по фактам
   * записей. Поэтому здесь null вместо исключения.
   */
  private async fetchStaffSchedule(
    staffId: string,
    dateKey: string,
  ): Promise<YclientsScheduleApiItem | null> {
    try {
      return await this.fetchStaffScheduleStrict(staffId, dateKey);
    } catch {
      return null;
    }
  }

  /** Строка мастера для сетки: смена + факт наличия записей. */
  private buildJournalMaster(
    member: StaffMember,
    schedule: YclientsScheduleApiItem | null,
  ): CrmJournalMaster {
    const slots = (schedule?.slots || [])
      .map((slot) => ({
        from: String(slot?.from || '').trim(),
        to: String(slot?.to || '').trim(),
      }))
      .filter((slot) => slot.from && slot.to);

    return {
      id: member.id,
      name: member.name,
      title: member.specialization ?? null,
      avatar_url: member.avatar_url ?? null,
      // null — график в CRM не отдан (нет прав/не заведён), а не «выходной».
      is_working: schedule
        ? Boolean(schedule.is_working) || slots.length > 0
        : null,
      work_start: slots.length ? slots[0].from : null,
      work_end: slots.length ? slots[slots.length - 1].to : null,
      work_slots: slots,
    };
  }

  async getFinancialSummary(params: {
    tenantId: string;
    from: string;
    to: string;
    timezone: string;
  }): Promise<CrmFinancialSummary> {
    void params.tenantId;
    const from = this.dateKeyInTimezone(params.from, params.timezone);
    const to = this.dateKeyInTimezone(params.to, params.timezone);
    const currency = this.settings.currency || 'RUB';
    const warnings: CrmFinancialSummary['warnings'] = [];
    const [transactionsResult, staffResult, recordsResult] =
      await Promise.allSettled([
        this.fetchFinancialTransactions(from, to),
        this.getPayrollStaff(),
        this.fetchRecords({ startDate: from, endDate: to, withDeleted: true }),
      ]);

    let revenue: CrmFinancialSummary['revenue'];
    if (transactionsResult.status === 'fulfilled') {
      try {
        revenue = this.aggregateRevenue(
          transactionsResult.value,
          currency,
          recordsResult.status === 'fulfilled'
            ? this.recordStaffMap(recordsResult.value)
            : new Map<string, string>(),
          recordsResult.status === 'fulfilled'
            ? this.recordServicesMap(recordsResult.value)
            : new Map<string, Array<{ serviceId: string; name: string }>>(),
        );
        this.appendStaffAttributionWarning(warnings, revenue);
        this.appendServiceAttributionWarning(warnings, revenue);
      } catch {
        revenue = this.unavailableRevenue();
        warnings.push({
          code: 'crm_finance_response_invalid',
          message:
            'YClients вернул некорректные финансовые данные. Суммы скрыты, чтобы не показывать приблизительный результат.',
        });
      }
    } else {
      revenue = this.unavailableRevenue();
      warnings.push({
        code: 'crm_finance_unavailable',
        message:
          'Финансовые операции YClients недоступны для этого токена. Проверьте права доступа к финансам.',
      });
    }

    let payroll: CrmFinancialSummary['payroll'];
    if (staffResult.status === 'fulfilled') {
      const staffPayroll = await this.fetchStaffPayroll(
        staffResult.value,
        from,
        to,
        currency,
      );
      const unavailableCount = staffPayroll.filter(
        (item) => item.status === 'unavailable',
      ).length;
      const status =
        unavailableCount === 0
          ? 'available'
          : unavailableCount === staffPayroll.length
            ? 'unavailable'
            : 'partial';
      const available = staffPayroll.filter(
        (item) => item.status === 'available',
      );
      const allBalancesAvailable = available.every((item) => item.balance);

      payroll = {
        status,
        verified: status === 'available',
        accrued_total:
          status === 'available'
            ? this.money(
                available.reduce(
                  (total, item) => total + (item.accrued?.amount_kopecks ?? 0),
                  0,
                ),
                currency,
              )
            : null,
        paid_total:
          status === 'available'
            ? this.money(
                available.reduce(
                  (total, item) => total + (item.paid?.amount_kopecks ?? 0),
                  0,
                ),
                currency,
              )
            : null,
        balance_total:
          status === 'available' && allBalancesAvailable
            ? this.money(
                available.reduce(
                  (total, item) => total + (item.balance?.amount_kopecks ?? 0),
                  0,
                ),
                currency,
              )
            : null,
        staff: staffPayroll,
      };

      if (status !== 'available') {
        warnings.push({
          code:
            status === 'partial'
              ? 'crm_payroll_partially_unavailable'
              : 'crm_payroll_unavailable',
          message:
            status === 'partial'
              ? 'YClients вернул расчёт не по всем сотрудникам. Общая сумма скрыта, доступны только подтверждённые строки.'
              : 'Расчёт зарплаты YClients недоступен для этого токена. Приблизительный расчёт не выполняется.',
        });
      }
    } else {
      payroll = this.unavailablePayroll();
      warnings.push({
        code: 'crm_staff_unavailable_for_payroll',
        message:
          'Не удалось получить активных сотрудников для расчёта зарплаты. Приблизительный расчёт не выполняется.',
      });
    }

    return {
      source: 'external_crm',
      provider: this.config.provider,
      verified: revenue.verified && payroll.verified,
      period: { from, to, timezone: params.timezone },
      revenue,
      payroll,
      warnings,
    };
  }

  async getRevenueSummary(params: {
    tenantId: string;
    from: string;
    to: string;
    timezone: string;
  }): Promise<CrmRevenueSummary> {
    void params.tenantId;
    const from = this.dateKeyInTimezone(params.from, params.timezone);
    const to = this.dateKeyInTimezone(params.to, params.timezone);
    const currency = this.settings.currency || 'RUB';

    try {
      const [transactionsResult, recordsResult] = await Promise.allSettled([
        this.fetchFinancialTransactions(from, to),
        this.fetchRecords({ startDate: from, endDate: to, withDeleted: true }),
      ]);
      if (transactionsResult.status !== 'fulfilled') {
        throw transactionsResult.reason;
      }
      const revenue = this.aggregateRevenue(
        transactionsResult.value,
        currency,
        recordsResult.status === 'fulfilled'
          ? this.recordStaffMap(recordsResult.value)
          : new Map<string, string>(),
        recordsResult.status === 'fulfilled'
          ? this.recordServicesMap(recordsResult.value)
          : new Map<string, Array<{ serviceId: string; name: string }>>(),
      );
      const warnings: CrmRevenueSummary['warnings'] = [];
      this.appendStaffAttributionWarning(warnings, revenue);
      this.appendServiceAttributionWarning(warnings, revenue);
      return {
        source: 'external_crm',
        provider: this.config.provider,
        verified: revenue.verified,
        period: { from, to, timezone: params.timezone },
        revenue,
        warnings,
      };
    } catch {
      return {
        source: 'external_crm',
        provider: this.config.provider,
        verified: false,
        period: { from, to, timezone: params.timezone },
        revenue: this.unavailableRevenue(),
        warnings: [
          {
            code: 'crm_revenue_unavailable',
            message:
              'YClients не вернул подтверждённые финансовые операции за выбранный период.',
          },
        ],
      };
    }
  }

  async getAppointmentRevenue(params: {
    tenantId: string;
    from: string;
    to: string;
    timezone: string;
    externalIds: string[];
  }): Promise<CrmAppointmentRevenueSnapshot> {
    void params.tenantId;
    const requested = new Set(
      params.externalIds.map((value) => String(value).trim()).filter(Boolean),
    );
    const currency = this.settings.currency || 'RUB';
    if (requested.size === 0) {
      return {
        provider: this.config.provider,
        currency,
        verified: true,
        requested_record_count: 0,
        matched_record_count: 0,
        records: [],
      };
    }

    const from = this.dateKeyInTimezone(params.from, params.timezone);
    const to = this.dateKeyInTimezone(params.to, params.timezone);
    const transactions = await this.fetchFinancialTransactions(from, to);
    const byRecord = new Map<
      string,
      { amountKopecks: number; transactionCount: number }
    >();

    for (const transaction of transactions) {
      if (String(transaction.sold_item_type || '').trim() !== 'service') {
        continue;
      }
      const recordId = this.optionalExternalId(transaction.record_id);
      if (!recordId || !requested.has(recordId)) {
        continue;
      }
      const amountKopecks = this.requireMoneyKopecks(transaction.amount);
      if (amountKopecks <= 0) {
        continue;
      }
      const current = byRecord.get(recordId) ?? {
        amountKopecks: 0,
        transactionCount: 0,
      };
      current.amountKopecks += amountKopecks;
      current.transactionCount += 1;
      byRecord.set(recordId, current);
    }

    return {
      provider: this.config.provider,
      currency,
      verified: true,
      requested_record_count: requested.size,
      matched_record_count: byRecord.size,
      records: [...byRecord.entries()].map(([externalId, row]) => ({
        external_id: externalId,
        amount_kopecks: row.amountKopecks,
        transaction_count: row.transactionCount,
      })),
    };
  }

  async getClientLoyalty(params: {
    tenantId: string;
    phone: string;
  }): Promise<ClientLoyaltySnapshot | null> {
    void params.tenantId;
    const normalizedPhone = this.normalizePhone(params.phone);
    const wantedDigits = normalizedPhone.replace(/\D/g, '').slice(-10);
    if (wantedDigits.length !== 10) {
      return null;
    }

    // Перебираем ВСЕ карточки с этим номером: карта может висеть на дубле.
    const candidates = await this.findAllClientsByPhone(normalizedPhone);
    if (candidates.length === 0) {
      return null;
    }

    for (const client of candidates) {
      const snapshot = await this.readLoyaltyCardFor(client);
      if (snapshot) {
        return snapshot;
      }
    }
    return null;
  }

  /**
   * Карты клиента с переспросом на пустой ответ.
   *
   * Пустой список — законный ответ (у клиента правда нет карты), поэтому
   * переспрашиваем ровно дважды и с короткой паузой: этого хватает на
   * случайный провал и не превращает обычное «карт нет» в тройной поход
   * в CRM на каждом открытии кабинета.
   */
  private async readLoyaltyCardsWithRetry(
    clientId: number,
  ): Promise<YclientsLoyaltyCard[]> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await this.request<
        YclientsLoyaltyCard[] | YclientsLoyaltyCard
      >(`loyalty/client_cards/${clientId}`);
      const cards = Array.isArray(response.data)
        ? response.data
        : response.data
          ? [response.data]
          : [];
      if (cards.length > 0 || attempt === 2) {
        return cards;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return [];
  }

  /** Бонусная карта одной конкретной карточки клиента. */
  private async readLoyaltyCardFor(
    client: YclientsClientSearchItem,
  ): Promise<ClientLoyaltySnapshot | null> {
    if (client?.id === undefined) {
      return null;
    }

    const clientId = this.toNumericId(client.id, 'client.id');
    // Путь к картам клиента — с ОДНИМ номером. Так же его зовёт рабочий бот
    // «Мужской Эстетики», и это единственная известная нам форма, которая
    // где-то точно отдаёт карты. Вариант с номером компании я пробовал: он
    // отвечает пустым массивом и УСПЕХОМ, поэтому запасной путь через
    // requestFirstAvailable не срабатывал бы — откат идёт только по ошибке.
    // 🔴 YClients иногда отдаёт ПУСТОЙ список карт вместо настоящего, с кодом
    // успеха и без всякой ошибки. Проверено вживую: два запроса подряд по
    // одному клиенту вернули ноль карт, третий — карту с номером и типом.
    // Такой провал неотличим от честного «карт нет», и клиент видит нулевой
    // баланс на пустом месте. Поэтому пустой ответ переспрашиваем.
    const cards = await this.readLoyaltyCardsWithRetry(clientId);
    const card = this.selectCashbackCard(cards);
    if (!card) {
      return null;
    }

    return {
      provider: this.config.provider,
      external_client_id: String(client.id),
      external_card_id:
        card.id === undefined || card.id === null ? null : String(card.id),
      balance: Math.max(0, this.toRoundedAmount(card.balance)),
      sold_amount:
        card.sold_amount === undefined || card.sold_amount === null
          ? null
          : Math.max(0, this.toRoundedAmount(card.sold_amount)),
      currency: this.settings.currency || 'RUB',
    };
  }

  async testConnection(tenantId: string) {
    void tenantId;

    const companyId = String(this.getCompanyId());
    const company = (await this.discoverCompanies()).find(
      (candidate) => candidate.id === companyId,
    );
    if (!company) {
      throw new Error('YClients selected company is not available');
    }

    return {
      ok: true,
      provider: this.config.provider,
      message: 'YClients connection and selected company are valid',
    };
  }

  private async fetchServices(): Promise<YclientsServiceApiItem[]> {
    const companyId = this.getCompanyId();

    try {
      const response = await this.request<{
        services?: YclientsServiceApiItem[];
      }>(`book_services/${companyId}`);
      if (Array.isArray(response.data?.services)) {
        return response.data.services;
      }
    } catch {
      // Fall through to the management catalog endpoint.
    }

    const fallback = await this.request<YclientsServiceApiItem[]>(
      `services/${companyId}`,
    );
    return fallback.data || [];
  }

  private async fetchServiceCategories(): Promise<
    YclientsServiceCategoryApiItem[]
  > {
    const response = await this.request<YclientsServiceCategoryApiItem[]>(
      `service_categories/${this.getCompanyId()}`,
    );

    return response.data || [];
  }

  private async findClientByPhone(
    phone: string,
  ): Promise<YclientsClientSearchItem | null> {
    const normalizedPhone = this.normalizePhone(phone);
    const wantedDigits = normalizedPhone.replace(/\D/g, '').slice(-10);

    if (wantedDigits.length !== 10) {
      return null;
    }

    const search = await this.request<YclientsClientSearchItem[]>(
      `company/${this.getCompanyId()}/clients/search`,
      {
        method: 'POST',
        body: JSON.stringify({
          fields: ['id', 'name', 'phone'],
          filters: [
            { type: 'quick_search', state: { value: normalizedPhone } },
          ],
          page: 1,
          page_size: 8,
        }),
      },
    );

    return (
      (search.data || []).find((candidate) => {
        const candidateDigits = String(candidate.phone || '')
          .replace(/\D/g, '')
          .slice(-10);
        return candidateDigits === wantedDigits;
      }) ?? null
    );
  }

  /**
   * ВСЕ карточки клиента с этим номером, а не первая попавшаяся.
   *
   * 🔴 Один человек часто заведён в YClients несколько раз: вручную, через
   * онлайн-запись, через бота. Карта лояльности при этом висит на одном из
   * дублей. Поиск возвращал первое совпадение, и если карта была на другом,
   * владелец видел ноль баллов при заведённой карте — ровно этот случай мы
   * и разбирали.
   */
  private async findAllClientsByPhone(
    phone: string,
  ): Promise<YclientsClientSearchItem[]> {
    const normalizedPhone = this.normalizePhone(phone);
    const wantedDigits = normalizedPhone.replace(/\D/g, '').slice(-10);

    if (wantedDigits.length !== 10) {
      return [];
    }

    const search = await this.request<YclientsClientSearchItem[]>(
      `company/${this.getCompanyId()}/clients/search`,
      {
        method: 'POST',
        body: JSON.stringify({
          fields: ['id', 'name', 'phone'],
          filters: [
            { type: 'quick_search', state: { value: normalizedPhone } },
          ],
          page: 1,
          page_size: 8,
        }),
      },
    );

    return (search.data || []).filter((candidate) => {
      if (candidate?.id === undefined || candidate.id === null) {
        return false;
      }
      const candidateDigits = String(candidate.phone || '')
        .replace(/\D/g, '')
        .slice(-10);
      return candidateDigits === wantedDigits;
    });
  }

  private async fetchRecords(params: {
    startDate: string;
    endDate: string;
    clientId?: number;
    staffId?: number;
    /**
     * Просить YClients отдать и отменённые (удалённые) записи.
     *
     * Флаг едет ПОВЕРХ той же самой постраничной выборки — отдельного запроса
     * за отменами нет, лишних обращений к CRM это не стоит. YClients молча
     * игнорирует незнакомые query-параметры, поэтому на филиале, где
     * `with_deleted` не поддержан, поведение остаётся прежним, а не падает.
     */
    withDeleted?: boolean;
  }): Promise<YclientsRecordApiItem[]> {
    const records: YclientsRecordApiItem[] = [];
    const seen = new Set<string>();
    const count = 200;

    for (let page = 1; page <= 25; page += 1) {
      const query = new URLSearchParams({
        start_date: params.startDate,
        end_date: params.endDate,
        count: String(count),
        page: String(page),
      });

      if (params.clientId) {
        query.set('client_id', String(params.clientId));
      }
      if (params.staffId) {
        query.set('staff_id', String(params.staffId));
      }
      if (params.withDeleted) {
        query.set('with_deleted', '1');
      }

      const response = await this.request<YclientsRecordApiItem[]>(
        `records/${this.getCompanyId()}`,
        { query },
      );
      const batch = response.data || [];
      let appended = 0;

      for (const record of batch) {
        const id =
          record.id === undefined || record.id === null
            ? null
            : String(record.id);
        if (id && seen.has(id)) {
          continue;
        }
        if (id) {
          seen.add(id);
        }
        records.push(record);
        appended += 1;
      }

      if (batch.length < count || appended === 0) {
        break;
      }
    }

    return records;
  }

  private async fetchFinancialTransactions(
    startDate: string,
    endDate: string,
  ): Promise<YclientsFinanceTransactionApiItem[]> {
    const transactions: YclientsFinanceTransactionApiItem[] = [];
    const seen = new Set<string>();
    const count = 200;
    const maxPages = 40;

    for (let page = 1; page <= maxPages; page += 1) {
      const query = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        count: String(count),
        page: String(page),
      });
      const response = await this.request<YclientsFinanceTransactionApiItem[]>(
        `transactions/${this.getCompanyId()}`,
        { query },
      );
      const batch = response.data || [];
      let appended = 0;

      for (const transaction of batch) {
        const id =
          transaction.id === undefined || transaction.id === null
            ? null
            : String(transaction.id);
        if (id && seen.has(id)) {
          continue;
        }
        if (id) {
          seen.add(id);
        }
        transactions.push(transaction);
        appended += 1;
      }

      if (batch.length < count || appended === 0) {
        return transactions;
      }
      if (page === maxPages) {
        throw new Error('YClients finance result exceeds the safe page limit');
      }
    }

    return transactions;
  }

  private async getPayrollStaff(): Promise<StaffMember[]> {
    return (await this.getStaffCatalog())
      .filter((staff) => !this.isFiredStaff(staff))
      .map((staff) => this.mapStaffMember(staff));
  }

  private aggregateRevenue(
    transactions: YclientsFinanceTransactionApiItem[],
    currency: string,
    recordStaff: Map<string, string> = new Map(),
    recordServices: Map<
      string,
      Array<{ serviceId: string; name: string }>
    > = new Map(),
  ): CrmFinancialSummary['revenue'] {
    const labels: Record<string, string> = {
      service: 'Услуги',
      goods_transaction: 'Товары',
      loyalty_abonement: 'Абонементы',
      loyalty_certificate: 'Сертификаты',
    };
    const byType = new Map<string, number>();
    const byAccount = new Map<
      string,
      { name: string; isCash: boolean | null; amountKopecks: number }
    >();
    const byStaff = new Map<
      string,
      { amountKopecks: number; transactionCount: number }
    >();
    const byService = new Map<
      string,
      { name: string; amountKopecks: number; transactionCount: number }
    >();
    let totalKopecks = 0;
    let transactionCount = 0;
    let serviceTotalKopecks = 0;
    let serviceTransactionCount = 0;
    let attributedServiceKopecks = 0;
    let attributedServiceTransactionCount = 0;
    let attributedServiceBreakdownKopecks = 0;
    let attributedServiceBreakdownTransactionCount = 0;

    // 🔴 Отброшенное перестаёт быть невидимым. До P4 отрицательные, нулевые и
    // бестиповые операции выпадали голым `continue`: сумма получалась валовой,
    // и никто снаружи не мог узнать, что часть строк не учтена. Возврат при
    // этом завышал прибыль — ровно в ту сторону, про которую соседний
    // комментарий говорит «ошибаться нельзя».
    //
    // Мы НЕ вычисляем возвраты: контракт провайдера не позволяет доказать их
    // семантику (поля статуса у операции нет). Мы лишь перестаём молчать.
    let discardedNegativeCount = 0;
    let discardedZeroCount = 0;
    let discardedUntypedCount = 0;

    for (const transaction of transactions) {
      const type = String(transaction.sold_item_type || '').trim();
      if (!type) {
        discardedUntypedCount += 1;
        continue;
      }
      const amountKopecks = this.requireMoneyKopecks(transaction.amount);
      if (amountKopecks < 0) {
        discardedNegativeCount += 1;
        continue;
      }
      if (amountKopecks === 0) {
        discardedZeroCount += 1;
        continue;
      }

      totalKopecks += amountKopecks;
      transactionCount += 1;
      byType.set(type, (byType.get(type) ?? 0) + amountKopecks);

      // Выручка мастера — только подтверждённые финансовые операции услуг.
      // Товары, сертификаты и абонементы могут быть проданы администратором и
      // без отдельного правила не относятся к конкретному мастеру.
      if (type === 'service') {
        serviceTotalKopecks += amountKopecks;
        serviceTransactionCount += 1;
        const staffId = this.transactionStaffId(transaction, recordStaff);
        if (staffId) {
          const currentStaff = byStaff.get(staffId) ?? {
            amountKopecks: 0,
            transactionCount: 0,
          };
          currentStaff.amountKopecks += amountKopecks;
          currentStaff.transactionCount += 1;
          byStaff.set(staffId, currentStaff);
          attributedServiceKopecks += amountKopecks;
          attributedServiceTransactionCount += 1;
        }

        const recordId = this.optionalExternalId(transaction.record_id);
        const services = recordId ? recordServices.get(recordId) : undefined;
        if (services?.length === 1) {
          const service = services[0];
          const currentService = byService.get(service.serviceId) ?? {
            name: service.name,
            amountKopecks: 0,
            transactionCount: 0,
          };
          currentService.amountKopecks += amountKopecks;
          currentService.transactionCount += 1;
          byService.set(service.serviceId, currentService);
          attributedServiceBreakdownKopecks += amountKopecks;
          attributedServiceBreakdownTransactionCount += 1;
        }
      }

      const accountName =
        transaction.account?.title?.trim() ||
        transaction.account?.name?.trim() ||
        'Без указания счёта';
      const rawIsCash = transaction.account?.is_cash;
      const isCash =
        rawIsCash === true || rawIsCash === 1
          ? true
          : rawIsCash === false || rawIsCash === 0
            ? false
            : null;
      const accountKey = `${accountName}:${String(isCash)}`;
      const current = byAccount.get(accountKey) ?? {
        name: accountName,
        isCash,
        amountKopecks: 0,
      };
      current.amountKopecks += amountKopecks;
      byAccount.set(accountKey, current);
    }

    return {
      status: 'available',
      verified: true,
      basis: 'provider_transactions' as const,
      discarded: {
        negative_count: discardedNegativeCount,
        zero_count: discardedZeroCount,
        untyped_count: discardedUntypedCount,
      },
      transaction_count: transactionCount,
      total: this.money(totalKopecks, currency),
      by_type: [...byType.entries()]
        .sort((left, right) => right[1] - left[1])
        .map(([key, amountKopecks]) => ({
          key,
          label: labels[key] || key,
          currency,
          amount_kopecks: amountKopecks,
        })),
      by_account: [...byAccount.values()]
        .sort((left, right) => right.amountKopecks - left.amountKopecks)
        .map((account) => ({
          name: account.name,
          is_cash: account.isCash,
          currency,
          amount_kopecks: account.amountKopecks,
        })),
      by_staff: [...byStaff.entries()]
        .sort((left, right) =>
          right[1].amountKopecks !== left[1].amountKopecks
            ? right[1].amountKopecks - left[1].amountKopecks
            : left[0].localeCompare(right[0]),
        )
        .map(([staffId, value]) => ({
          staff_id: staffId,
          transaction_count: value.transactionCount,
          currency,
          amount_kopecks: value.amountKopecks,
        })),
      by_service: [...byService.entries()]
        .sort((left, right) =>
          right[1].amountKopecks !== left[1].amountKopecks
            ? right[1].amountKopecks - left[1].amountKopecks
            : left[1].name.localeCompare(right[1].name),
        )
        .map(([serviceId, value]) => ({
          service_id: serviceId,
          name: value.name,
          transaction_count: value.transactionCount,
          currency,
          amount_kopecks: value.amountKopecks,
        })),
      staff_attribution_status:
        serviceTransactionCount === 0 || attributedServiceTransactionCount === 0
          ? 'unavailable'
          : attributedServiceTransactionCount === serviceTransactionCount
            ? 'available'
            : 'partial',
      staff_attribution_coverage_percent:
        serviceTotalKopecks === 0
          ? null
          : Math.round(
              (attributedServiceKopecks / serviceTotalKopecks) * 1_000,
            ) / 10,
      unattributed_service_total:
        serviceTotalKopecks === 0
          ? null
          : this.money(
              serviceTotalKopecks - attributedServiceKopecks,
              currency,
            ),
      unattributed_service_transaction_count:
        serviceTransactionCount - attributedServiceTransactionCount,
      service_attribution_status:
        serviceTransactionCount === 0 ||
        attributedServiceBreakdownTransactionCount === 0
          ? 'unavailable'
          : attributedServiceBreakdownTransactionCount ===
              serviceTransactionCount
            ? 'available'
            : 'partial',
      service_attribution_coverage_percent:
        serviceTotalKopecks === 0
          ? null
          : Math.round(
              (attributedServiceBreakdownKopecks / serviceTotalKopecks) * 1_000,
            ) / 10,
      unattributed_service_breakdown_total:
        serviceTotalKopecks === 0
          ? null
          : this.money(
              serviceTotalKopecks - attributedServiceBreakdownKopecks,
              currency,
            ),
      unattributed_service_breakdown_transaction_count:
        serviceTransactionCount - attributedServiceBreakdownTransactionCount,
    };
  }

  private recordStaffMap(
    records: YclientsRecordApiItem[],
  ): Map<string, string> {
    const result = new Map<string, string>();
    for (const record of records) {
      const recordId = this.optionalExternalId(record.id);
      const staffId = this.optionalExternalId(
        record.staff_id ?? record.staff?.id,
      );
      if (recordId && staffId) {
        result.set(recordId, staffId);
      }
    }
    return result;
  }

  private recordServicesMap(
    records: YclientsRecordApiItem[],
  ): Map<string, Array<{ serviceId: string; name: string }>> {
    const result = new Map<
      string,
      Array<{ serviceId: string; name: string }>
    >();
    for (const record of records) {
      const recordId = this.optionalExternalId(record.id);
      if (!recordId || !Array.isArray(record.services)) {
        continue;
      }
      const unique = new Map<string, { serviceId: string; name: string }>();
      for (const service of record.services) {
        const serviceId = this.optionalExternalId(service.id);
        if (!serviceId) {
          continue;
        }
        unique.set(serviceId, {
          serviceId,
          name: service.title?.trim() || 'Услуга',
        });
      }
      if (unique.size > 0) {
        result.set(recordId, [...unique.values()]);
      }
    }
    return result;
  }

  private transactionStaffId(
    transaction: YclientsFinanceTransactionApiItem,
    recordStaff: Map<string, string>,
  ): string | null {
    const direct = this.optionalExternalId(
      transaction.master?.id ??
        transaction.staff?.id ??
        transaction.master_id ??
        transaction.staff_id,
    );
    if (direct) {
      return direct;
    }
    const recordId = this.optionalExternalId(transaction.record_id);
    return recordId ? (recordStaff.get(recordId) ?? null) : null;
  }

  private optionalExternalId(value: unknown): string | null {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return null;
    }
    const normalized = String(value).trim();
    return normalized === '' ? null : normalized;
  }

  private appendStaffAttributionWarning(
    warnings: Array<{ code: string; message: string }>,
    revenue: CrmFinancialSummary['revenue'],
  ): void {
    if (revenue.staff_attribution_status === 'available') {
      return;
    }
    warnings.push({
      code:
        revenue.staff_attribution_status === 'partial'
          ? 'crm_staff_revenue_partially_attributed'
          : 'crm_staff_revenue_unavailable',
      message:
        revenue.staff_attribution_status === 'partial'
          ? `YClients связал с мастерами ${revenue.staff_attribution_coverage_percent ?? 0}% подтверждённой кассы услуг. Несвязанный остаток не распределён приблизительно.`
          : 'YClients не связал подтверждённые операции услуг с мастерами. Касса салона доступна, поимённые суммы скрыты.',
    });
  }

  private appendServiceAttributionWarning(
    warnings: Array<{ code: string; message: string }>,
    revenue: CrmFinancialSummary['revenue'],
  ): void {
    if (revenue.service_attribution_status === 'available') {
      return;
    }
    warnings.push({
      code:
        revenue.service_attribution_status === 'partial'
          ? 'crm_service_revenue_partially_attributed'
          : 'crm_service_revenue_unavailable',
      message:
        revenue.service_attribution_status === 'partial'
          ? `YClients однозначно связал с одной услугой ${revenue.service_attribution_coverage_percent ?? 0}% подтверждённой кассы услуг. Многоуслуговые записи не разделены приблизительно.`
          : 'YClients не дал однозначной связи кассовых операций с отдельными услугами. Спрос доступен, но выручка по услугам не подменяется ценами из журнала.',
    });
  }

  private async fetchStaffPayroll(
    staff: StaffMember[],
    from: string,
    to: string,
    currency: string,
  ): Promise<CrmFinancialSummary['payroll']['staff']> {
    const result = new Array<CrmStaffPayroll>(staff.length);
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(4, Math.max(1, staff.length)) },
      async () => {
        while (cursor < staff.length) {
          const index = cursor;
          cursor += 1;
          const member = staff[index];

          try {
            const query = new URLSearchParams({
              date_from: from,
              date_to: to,
            });
            const response = await this.request<YclientsPayrollApiData>(
              `company/${this.getCompanyId()}/salary/calculation/staff/${this.toNumericId(member.id, 'staff.id')}`,
              { query },
            );
            const totals = response.data?.total_sum;
            if (
              !totals ||
              totals.income === undefined ||
              totals.expense === undefined
            ) {
              throw new Error('YClients payroll totals are incomplete');
            }

            result[index] = {
              staff_id: member.id,
              name: member.name,
              status: 'available',
              verified: true,
              accrued: this.money(
                this.requireMoneyKopecks(totals.income),
                currency,
              ),
              paid: this.money(
                this.requireMoneyKopecks(totals.expense),
                currency,
              ),
              // 🔴 YClients отдаёт в `balance` САЛЬДО СЧЁТА сотрудника, а не
              // остаток за выбранный период: у владельца при начислениях
              // 26 050 ₽ поле показывало −16 846 240 ₽. Доверяем ему только
              // если сходится инвариант balance == income − expense
              // (допуск 1 ₽ на округления). Иначе честнее не показать ничего,
              // чем показать заведомо ложное число.
              balance: this.periodBalanceOrNull(totals, currency),
            };
          } catch {
            result[index] = {
              staff_id: member.id,
              name: member.name,
              status: 'unavailable',
              verified: false,
              accrued: null,
              paid: null,
              balance: null,
            };
          }
        }
      },
    );

    await Promise.all(workers);
    return result;
  }

  private unavailableRevenue(): CrmFinancialSummary['revenue'] {
    return {
      status: 'unavailable',
      verified: false,
      basis: 'unavailable',
      discarded: { negative_count: 0, zero_count: 0, untyped_count: 0 },
      transaction_count: null,
      total: null,
      by_type: [],
      by_account: [],
      by_staff: [],
      by_service: [],
      staff_attribution_status: 'unavailable',
      staff_attribution_coverage_percent: null,
      unattributed_service_total: null,
      unattributed_service_transaction_count: 0,
      service_attribution_status: 'unavailable',
      service_attribution_coverage_percent: null,
      unattributed_service_breakdown_total: null,
      unattributed_service_breakdown_transaction_count: 0,
    };
  }

  private unavailablePayroll(): CrmFinancialSummary['payroll'] {
    return {
      status: 'unavailable',
      verified: false,
      accrued_total: null,
      paid_total: null,
      balance_total: null,
      staff: [],
    };
  }

  private money(
    amountKopecks: number,
    currency: string,
  ): { currency: string; amount_kopecks: number } {
    return { currency, amount_kopecks: amountKopecks };
  }

  /**
   * Остаток сотрудника ЗА ПЕРИОД — или null, если YClients прислал не его.
   *
   * Поле `total_sum.balance` в ответе salary/calculation — сальдо счёта
   * сотрудника, накопленное за всё время, а не разница за выбранные даты.
   * Показанное рядом с period-scoped «Начислено» оно даёт абсурд: при
   * начислениях 26 050 ₽ владелец видел остаток −16 846 240 ₽.
   *
   * Доверяем значению, только если сходится инвариант
   * `balance == income − expense` с допуском в 1 ₽ на округления.
   */
  private periodBalanceOrNull(
    totals: { income?: unknown; expense?: unknown; balance?: unknown },
    currency: string,
  ): { currency: string; amount_kopecks: number } | null {
    if (totals.balance === undefined) {
      return null;
    }

    try {
      const balance = this.requireMoneyKopecks(totals.balance);
      const expected =
        this.requireMoneyKopecks(totals.income) -
        this.requireMoneyKopecks(totals.expense);

      return Math.abs(balance - expected) <= 100
        ? this.money(balance, currency)
        : null;
    } catch {
      return null;
    }
  }

  private requireMoneyKopecks(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error('YClients money amount is invalid');
    }
    return Math.round(parsed * 100);
  }

  private mapJournalAppointment(
    record: YclientsRecordApiItem,
    timezone: string,
    staffById: Map<string, StaffMember>,
    servicesById: Map<string, ServiceItem>,
  ): CrmJournalAppointment | null {
    const externalId =
      record.id === undefined || record.id === null ? '' : String(record.id);
    const staffId = String(record.staff_id ?? record.staff?.id ?? '');

    if (!externalId || !staffId) {
      return null;
    }

    const timing = this.recordTiming(record, timezone);
    const provider = staffById.get(staffId);
    const recordServices = (record.services || []).flatMap((rawService) => {
      const serviceId =
        rawService.id === undefined || rawService.id === null
          ? ''
          : String(rawService.id);
      const catalogService = serviceId
        ? servicesById.get(serviceId)
        : undefined;
      const rawPrice = Number(rawService.cost ?? rawService.price_min);
      const price = Number.isFinite(rawPrice)
        ? rawPrice
        : (catalogService?.price ?? 0);
      const durationSeconds =
        rawService.seance_length || rawService.duration || 0;

      if (!serviceId && !rawService.title) {
        return [];
      }

      return [
        {
          id: serviceId || `record-${externalId}-service`,
          name: rawService.title || catalogService?.name || 'Услуга',
          price,
          duration_minutes:
            catalogService?.duration_minutes ??
            Math.max(1, Math.round(durationSeconds / 60) || 60),
          currency: this.settings.currency || 'RUB',
          category: catalogService?.category,
        },
      ];
    });
    const totalPrice =
      recordServices.length > 0
        ? recordServices.reduce((total, service) => total + service.price, 0)
        : null;

    return {
      id: encodeCrmAppointmentKey(externalId),
      client: {
        id:
          record.client?.id === undefined || record.client?.id === null
            ? null
            : String(record.client.id),
        name: record.client?.name?.trim() || 'Клиент',
      },
      provider: {
        id: staffId,
        name: provider?.name || record.staff?.name || 'Специалист',
        title:
          provider?.title ||
          provider?.specialization ||
          record.staff?.specialization ||
          '',
        avatar_url:
          provider?.avatar_url ||
          record.staff?.avatar ||
          record.staff?.photo ||
          null,
      },
      branch: null,
      service_ids: recordServices.map((service) => service.id),
      services: recordServices,
      start_at: timing.start.toISOString(),
      end_at: timing.end.toISOString(),
      status: this.recordStatus(record),
      notes: record.comment?.trim() || null,
      total_price: totalPrice,
      currency: this.settings.currency || 'RUB',
    };
  }

  /**
   * Признак присутствия из записи YClients.
   *
   * Полей два: `attendance` — то, что проставили по записи, `visit_attendance`
   * — то же по визиту целиком. Заполнено может быть любое из них (на части
   * филиалов приходит только второе), и совпадают они не всегда. Поэтому
   * значение засчитывается, если его показывает ХОТЬ ОДНО поле, — ровно так
   * это годами считает легаси-бэкенд. Значения: `-1` — не пришёл,
   * `0` — ожидание, `1` — пришёл, `2` — клиент подтвердил визит.
   */
  private hasAttendance(record: YclientsRecordApiItem, value: number): boolean {
    return record.attendance === value || record.visit_attendance === value;
  }

  /**
   * Статус визита для журнала и аналитики.
   *
   * 🔴 `canceled` и `no_show` — принципиально разные исходы, и порядок проверок
   * тут содержательный, а не случайный. Отменённая запись (`deleted`) — окно,
   * которое клиент освободил заранее: его можно было перепродать, и вопрос к
   * салону «почему не перепродали». Неявка (`attendance = -1`) — окно,
   * потерянное вместе с деньгами: перепродать было уже некому. Если запись и
   * удалена, и помечена неявкой, побеждает отмена: последнее, что с записью
   * сделали, — отменили её.
   */
  private recordStatus(record: YclientsRecordApiItem): string {
    if (record.deleted) {
      return 'canceled';
    }

    if (this.hasAttendance(record, -1)) {
      return 'no_show';
    }
    if (
      this.hasAttendance(record, 1) ||
      record.paid_full === true ||
      record.paid_full === 1
    ) {
      return 'completed';
    }
    // Остаются `2` (клиент подтвердил) и `0` (ждём клиента). Для журнала это
    // одно состояние — визит впереди; отдельного слова для «подтверждена»
    // потребители статуса не знают, а выдумать его здесь значит отдать наружу
    // строку, на которую никто не смотрит.
    return 'confirmed';
  }

  private recordTiming(
    record: YclientsRecordApiItem,
    timezone: string,
  ): { start: Date; end: Date } {
    const raw = String(record.datetime || record.date || '').trim();
    const localMatch = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(raw);
    let start: Date;

    if (localMatch && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
      start = localDateMinuteToUtc(
        localMatch[1],
        Number(localMatch[2]) * 60 + Number(localMatch[3]),
        timezone,
      );
    } else {
      start = new Date(raw);
    }

    if (Number.isNaN(start.getTime())) {
      throw new Error('YClients record has an invalid datetime');
    }

    const durationSeconds = Math.max(
      60,
      Number(record.length || record.seance_length || 3600),
    );

    return {
      start,
      end: new Date(start.getTime() + durationSeconds * 1000),
    };
  }

  private dateKeyInTimezone(value: string, timezone: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new Error('Invalid CRM journal date');
    }

    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private minuteInTimezone(value: Date, timezone: string): number {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(value);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
      throw new Error('Could not resolve CRM record time');
    }
    return hour * 60 + minute;
  }

  private async request<TData>(
    path: string,
    init?: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: string;
      query?: URLSearchParams;
    },
  ): Promise<YclientsResponse<TData>> {
    const url = new URL(`${this.baseUrl}/${path}`);

    if (init?.query) {
      init.query.forEach((value, key) => {
        url.searchParams.append(key, value);
      });
    }

    // 🔴 Запрос уходил вообще без таймаута — ни `signal`, ни
    // `AbortSignal.timeout`, в отличие от биллинга. Потолок давал только undici,
    // около 300 секунд: в двадцать раз больше самого щедрого прикладного
    // таймаута в проекте. Всё это время сокет занят, а вызывающий не знает,
    // дошёл ли запрос.
    let response: Response;

    try {
      response = await fetch(url, {
        method: init?.method || 'GET',
        headers: {
          Authorization: `Bearer ${this.partnerToken}, User ${this.config.apiToken}`,
          Accept: 'application/vnd.yclients.v2+json',
          'Content-Type': 'application/json',
        },
        body: init?.body,
        signal: AbortSignal.timeout(CRM_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (isUnknownOutcomeCause(error)) {
        // Ответа не было. Для чтения это просто отказ, а для записи — исход,
        // который мы НЕ ЗНАЕМ: запрос мог дойти и выполниться.
        throw new CrmOutcomeUnknownError(
          `YClients did not answer in time (${init?.method || 'GET'} ${path})`,
          error,
        );
      }

      throw error;
    }

    let payload: YclientsResponse<TData> = {};

    if (typeof response.text === 'function') {
      const rawText = await response.text();

      if (rawText.trim().length > 0) {
        // 🔴 Тело не всегда JSON. Защитный экран или страница ошибки отдают
        // HTML, и голый JSON.parse бросал невнятный SyntaxError вместо
        // честного «YClients ответил 502». Владелец при подключении CRM видел
        // «Данные не были сохранены» и не понимал, что CRM просто недоступна.
        //
        // Порядок проверок НЕ меняем: код статуса разбирается ниже и берёт
        // providerMessage из payload.meta — это поведение закреплено тестом
        // на 403 «Недостаточно прав».
        try {
          payload = JSON.parse(rawText) as YclientsResponse<TData>;
        } catch {
          payload = {};
        }
      } else if (response.ok) {
        payload = { success: true };
      }
    } else if (typeof response.json === 'function') {
      payload = (await response.json()) as YclientsResponse<TData>;
    }

    if (!response.ok) {
      const providerMessage = payload.meta?.message?.trim();
      const message = providerMessage
        ? `YClients request failed with status ${response.status}: ${providerMessage}`
        : `YClients request failed with status ${response.status}`;

      // 404 — это не сбой, а ОПРЕДЕЛЁННОЕ утверждение провайдера: записи нет.
      // Текст сообщения намеренно тот же, что и раньше, поэтому для всех путей,
      // кроме отмены, поведение не меняется — там это по-прежнему обычная
      // ошибка.
      if (response.status === 404) {
        throw new CrmRecordGoneError(message);
      }

      throw new Error(message);
    }

    // 🔴 YClients отказывает СТАТУСОМ 200. Тело при этом несёт
    // success:false и причину в meta.message — например, когда токену не
    // хватает прав на конкретный раздел. Раньше проверялся только код
    // ответа, и такой отказ молча превращался в «данных нет»: у клиента
    // была бонусная карта, а владелец видел ноль баллов и считал, что
    // карты не существует. Отказ обязан звучать как отказ.
    if (payload.success === false) {
      const providerMessage = payload.meta?.message?.trim();
      throw new Error(
        providerMessage
          ? `YClients rejected the request: ${providerMessage}`
          : 'YClients rejected the request without a reason',
      );
    }

    return payload;
  }

  private async requestFirstAvailable<TData>(
    paths: string[],
  ): Promise<YclientsResponse<TData>> {
    let lastError: unknown;

    for (const path of paths) {
      try {
        return await this.request<TData>(path);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('YClients request failed for every supported endpoint');
  }

  private getCompanyId(): number {
    return this.toNumericId(this.settings.companyId, 'settings.companyId');
  }

  private getActiveMasterIds(): number[] | null {
    if (!Array.isArray(this.settings.activeMasterIds)) {
      return null;
    }

    return this.settings.activeMasterIds.map((id) =>
      this.toNumericId(id, 'settings.activeMasterIds[]'),
    );
  }

  private getStaffCatalog(): Promise<YclientsStaffApiItem[]> {
    if (!this.staffCatalogPromise) {
      const companyId = this.getCompanyId();
      this.staffCatalogPromise = this.requestFirstAvailable<
        YclientsStaffApiItem[]
      >([
        `company/${companyId}/staff`,
        `staff/${companyId}`,
        `book_staff/${companyId}`,
      ])
        .then((response) => response.data || [])
        // 🔴 Кэшируем только УСПЕХ. Отклонённый промис оставался в поле на весь
        // срок жизни адаптера: одна секундная сетевая ошибка — и следующие
        // запросы падали тем же старым отказом, хотя YClients давно отвечает.
        .catch((error) => {
          this.staffCatalogPromise = null;
          throw error;
        });
    }

    return this.staffCatalogPromise;
  }

  private getServiceCatalog(): Promise<YclientsServiceApiItem[]> {
    if (!this.serviceCatalogPromise) {
      // Та же причина, что и у справочника мастеров: сбой не должен залипать.
      this.serviceCatalogPromise = this.fetchServices().catch((error) => {
        this.serviceCatalogPromise = null;
        throw error;
      });
    }
    return this.serviceCatalogPromise;
  }

  private getServiceCategoryCatalog(): Promise<
    YclientsServiceCategoryApiItem[]
  > {
    if (!this.serviceCategoryPromise) {
      // Та же причина, что и у справочника мастеров: сбой не должен залипать.
      this.serviceCategoryPromise = this.fetchServiceCategories().catch(
        (error) => {
          this.serviceCategoryPromise = null;
          throw error;
        },
      );
    }
    return this.serviceCategoryPromise;
  }

  private isInactiveStaff(staff: YclientsStaffApiItem): boolean {
    return (
      this.isFiredStaff(staff) || staff.hidden === true || staff.hidden === 1
    );
  }

  private isFiredStaff(staff: YclientsStaffApiItem): boolean {
    return staff.fired === true || staff.fired === 1;
  }

  private isAdministrativeStaff(
    staff: YclientsStaffApiItem,
    bookable: boolean,
  ): boolean {
    const title = String(staff.specialization || '')
      .trim()
      .toLowerCase()
      .replace(/\u0451/g, '\u0435');

    return (
      !bookable ||
      /\u0430\u0434\u043c\u0438\u043d|\u0443\u043f\u0440\u0430\u0432\u043b\u044f\u044e\u0449|\u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440|administrator|manager/.test(
        title,
      )
    );
  }

  private mapStaffMember(staff: YclientsStaffApiItem): StaffMember {
    return {
      id: String(staff.id),
      name: staff.name || '',
      title: staff.specialization || '',
      specialization: staff.specialization || '',
      avatar_url: staff.avatar || staff.photo || null,
      rating:
        typeof staff.rating === 'number' && Number.isFinite(staff.rating)
          ? staff.rating
          : null,
    };
  }

  private selectCashbackCard(
    cards: YclientsLoyaltyCard[],
  ): YclientsLoyaltyCard | null {
    const cashback = cards.filter((card) => {
      const title = String(card.type?.title || '')
        .toLowerCase()
        .replace(/ё/g, 'е');
      return (
        /к[еэ]шб[еэ]к|cash\s?back|бонус/.test(title) ||
        (card.programs || []).some(
          (program) => program.loyalty_type?.is_cashback === true,
        )
      );
    });
    const positive = cards.filter(
      (card) => this.toRoundedAmount(card.balance) > 0,
    );
    const candidates = cashback.length > 0 ? cashback : positive;

    return (
      candidates.sort(
        (left, right) =>
          this.toRoundedAmount(right.balance) -
          this.toRoundedAmount(left.balance),
      )[0] ?? null
    );
  }

  private toRoundedAmount(value: number | string | undefined): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? Math.round(parsed) : 0;
  }

  private optionalNonNegativeNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  private optionalNonNegativeInteger(value: unknown): number | null {
    const parsed = this.optionalNonNegativeNumber(value);
    return parsed === null ? null : Math.trunc(parsed);
  }

  private normalizeClientVisitDate(value: unknown): string | null {
    const raw = typeof value === 'string' ? value.trim() : '';
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) {
      return null;
    }
    const candidate = `${match[1]}-${match[2]}-${match[3]}`;
    const parsed = new Date(`${candidate}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== candidate
      ? null
      : candidate;
  }

  private toNumericId(
    value: string | number | undefined,
    label: string,
  ): number {
    const numeric = Number(value);

    if (!Number.isFinite(numeric) || numeric <= 0) {
      throw new Error(`Invalid numeric value for ${label}`);
    }

    return numeric;
  }

  // Правила нормализации общие с платформой (common/phone.util). Своя копия
  // расходилась с ней и ломала сверку клиента по номеру.
  private normalizePhone(phone: string): string {
    return (
      normalizePhoneE164(phone) ?? `+${String(phone ?? '').replace(/\D/g, '')}`
    );
  }

  private toYclientsDate(date: string): string {
    return date.slice(0, 10);
  }

  private isDateUnavailableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();
    return (
      message.includes('status 422') &&
      (message.includes('дата недоступна') ||
        message.includes('date is unavailable') ||
        message.includes('date unavailable'))
    );
  }

  private toYclientsDateTime(dateTime: string): string {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(dateTime)) {
      return dateTime.length === 16 ? `${dateTime}:00` : dateTime;
    }

    const parsed = new Date(dateTime);

    if (Number.isNaN(parsed.getTime())) {
      throw new Error('Invalid appointment datetime');
    }

    return parsed.toISOString().replace(/\.\d{3}Z$/, '');
  }

  private mapSlot(
    date: string,
    staffId: number,
    slot: YclientsSlotApiItem,
    branchId?: string,
  ): AvailableSlot {
    const start = slot.datetime || `${date}T${slot.time || '00:00:00'}`;
    const normalizedStart = this.toYclientsDateTime(start);
    const startDate = new Date(`${normalizedStart}Z`);
    const endDate = new Date(
      startDate.getTime() + (slot.seance_length || 3600) * 1000,
    );

    return {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      staff_id: String(staffId),
      branch_id: branchId ?? null,
    };
  }
}
