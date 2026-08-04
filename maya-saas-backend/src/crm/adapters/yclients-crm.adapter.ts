import { InternalServerErrorException } from '@nestjs/common';

import {
  AvailableSlot,
  CancelledAppointment,
  ClientAppointmentsParams,
  ClientLoyaltySnapshot,
  CRMAdapter,
  CrmCompanyOption,
  CrmCompanyProfile,
  CrmFinancialSummary,
  CrmJournal,
  CrmJournalAppointment,
  CrmTeamMember,
  CrmStaffPayroll,
  CreatedAppointment,
  CrmAdapterConfig,
  CreateAppointmentParams,
  RescheduledAppointment,
  ServiceItem,
  StaffMember,
} from '../crm-adapter.interface';
import { localDateMinuteToUtc } from '../../internal-calendar/internal-calendar.utils';
import { normalizePhoneE164 } from '../../common/phone.util';

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
  timezone?: string;
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
  account?: {
    title?: string;
    name?: string;
    is_cash?: boolean | number;
  } | null;
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
          timezone: company.timezone?.trim() || null,
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
      this.fetchServices(),
      this.fetchServiceCategories().catch(() => []),
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

        const response = await this.request<YclientsSlotApiItem[]>(
          `book_times/${this.getCompanyId()}/${staffId}/${date}`,
          {
            query,
          },
        );

        return (response.data || []).map((slot) =>
          this.mapSlot(date, staffId, slot, params.branchId),
        );
      }),
    );

    return resultSets.flat();
  }

  async createAppointment(
    params: CreateAppointmentParams,
  ): Promise<CreatedAppointment> {
    if (!params.clientPhone) {
      throw new Error(
        'YClients appointment creation requires a client phone number',
      );
    }

    const serviceCatalog = await this.fetchServices();
    const selectedServices = serviceCatalog.filter((service) =>
      params.serviceIds.includes(String(service.id)),
    );
    const seanceLengthSeconds =
      selectedServices.reduce(
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
        phone: this.normalizePhone(params.clientPhone),
        name: params.clientName || params.clientPhone,
      },
      datetime: this.toYclientsDateTime(params.start),
      seance_length: seanceLengthSeconds,
      save_if_busy: false,
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
    const seanceLengthSeconds =
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

  async getJournal(params: {
    tenantId: string;
    from: string;
    to: string;
    timezone: string;
    providerId?: string;
  }): Promise<CrmJournal> {
    void params.tenantId;
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
      }),
      this.getStaff(params.tenantId),
      this.getServices(params.tenantId),
    ]);
    const staffById = new Map(staff.map((member) => [member.id, member]));
    const servicesById = new Map(
      services.map((service) => [service.id, service]),
    );
    const appointments = records
      .filter((record) => !record.deleted && record.id !== undefined)
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
    const [transactionsResult, staffResult] = await Promise.allSettled([
      this.fetchFinancialTransactions(from, to),
      this.getPayrollStaff(),
    ]);

    let revenue: CrmFinancialSummary['revenue'];
    if (transactionsResult.status === 'fulfilled') {
      try {
        revenue = this.aggregateRevenue(transactionsResult.value, currency);
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

    const client = await this.findClientByPhone(normalizedPhone);
    if (client?.id === undefined) {
      return null;
    }

    const cardsResponse = await this.request<
      YclientsLoyaltyCard[] | YclientsLoyaltyCard
    >(`loyalty/client_cards/${this.toNumericId(client.id, 'client.id')}`);
    const cards = Array.isArray(cardsResponse.data)
      ? cardsResponse.data
      : cardsResponse.data
        ? [cardsResponse.data]
        : [];
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

  private async fetchRecords(params: {
    startDate: string;
    endDate: string;
    clientId?: number;
    staffId?: number;
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
    let totalKopecks = 0;
    let transactionCount = 0;

    for (const transaction of transactions) {
      const type = String(transaction.sold_item_type || '').trim();
      if (!type) {
        continue;
      }
      const amountKopecks = this.requireMoneyKopecks(transaction.amount);
      if (amountKopecks <= 0) {
        continue;
      }

      totalKopecks += amountKopecks;
      transactionCount += 1;
      byType.set(type, (byType.get(type) ?? 0) + amountKopecks);

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
    };
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
      transaction_count: null,
      total: null,
      by_type: [],
      by_account: [],
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
      id: `crm-${externalId}`,
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

  private recordStatus(record: YclientsRecordApiItem): string {
    if (record.deleted) {
      return 'canceled';
    }
    if (record.attendance === -1 || record.visit_attendance === -1) {
      return 'no_show';
    }
    if (
      record.attendance === 1 ||
      record.visit_attendance === 1 ||
      record.paid_full === true ||
      record.paid_full === 1
    ) {
      return 'completed';
    }
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

    const response = await fetch(url, {
      method: init?.method || 'GET',
      headers: {
        Authorization: `Bearer ${this.partnerToken}, User ${this.config.apiToken}`,
        Accept: 'application/vnd.yclients.v2+json',
        'Content-Type': 'application/json',
      },
      body: init?.body,
    });

    let payload: YclientsResponse<TData> = {};

    if (typeof response.text === 'function') {
      const rawText = await response.text();

      if (rawText.trim().length > 0) {
        payload = JSON.parse(rawText) as YclientsResponse<TData>;
      } else if (response.ok) {
        payload = { success: true };
      }
    } else if (typeof response.json === 'function') {
      payload = (await response.json()) as YclientsResponse<TData>;
    }

    if (!response.ok) {
      const providerMessage = payload.meta?.message?.trim();
      throw new Error(
        providerMessage
          ? `YClients request failed with status ${response.status}: ${providerMessage}`
          : `YClients request failed with status ${response.status}`,
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
      ]).then((response) => response.data || []);
    }

    return this.staffCatalogPromise;
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
