import { InternalServerErrorException } from '@nestjs/common';

import {
  AvailableSlot,
  CancelledAppointment,
  CRMAdapter,
  CreatedAppointment,
  CrmAdapterConfig,
  CreateAppointmentParams,
  RescheduledAppointment,
  ServiceItem,
  StaffMember,
} from '../crm-adapter.interface';

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
}

interface YclientsRecordServiceApiItem {
  id?: number | string;
}

interface YclientsRecordApiItem {
  id?: number | string;
  datetime?: string;
  seance_length?: number;
  attendance?: number;
  comment?: string;
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

export class YclientsCRMAdapter implements CRMAdapter {
  private readonly baseUrl: string;
  private readonly partnerToken: string;
  private readonly settings: YclientsSettings;

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

    const response = await this.request<YclientsStaffApiItem[]>(
      `company/${this.getCompanyId()}/staff`,
    );
    const allowedIds = this.getActiveMasterIds();
    const items = (response.data || []).filter((staff) =>
      allowedIds ? allowedIds.includes(staff.id) : true,
    );

    return items.map((staff) => ({
      id: String(staff.id),
      name: staff.name || '',
      title: staff.specialization || '',
      specialization: staff.specialization || '',
      avatar_url: staff.avatar || staff.photo || null,
      rating:
        typeof staff.rating === 'number' && Number.isFinite(staff.rating)
          ? staff.rating
          : null,
    }));
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
      services: finalServiceIds.map((serviceId) => ({
        id: this.toNumericId(serviceId, 'serviceId'),
        amount: 1,
      })),
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

  getClientAppointments(clientId: string): Promise<CreatedAppointment[]> {
    void clientId;
    return Promise.resolve([]);
  }

  async testConnection(tenantId: string) {
    void tenantId;

    const staff = await this.getStaff('');
    return {
      ok: true,
      provider: this.config.provider,
      message: `YClients connection is valid. Staff loaded: ${staff.length}`,
    };
  }

  private async fetchServices(): Promise<YclientsServiceApiItem[]> {
    const response = await this.request<{
      services?: YclientsServiceApiItem[];
    }>(`book_services/${this.getCompanyId()}`);

    return response.data?.services || [];
  }

  private async fetchServiceCategories(): Promise<
    YclientsServiceCategoryApiItem[]
  > {
    const response = await this.request<YclientsServiceCategoryApiItem[]>(
      `service_categories/${this.getCompanyId()}`,
    );

    return response.data || [];
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
      throw new Error(
        payload.meta?.message ||
          `YClients request failed with status ${response.status}`,
      );
    }

    return payload;
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

  private normalizePhone(phone: string): string {
    let digits = phone.replace(/\D/g, '');

    if (digits.length === 11 && digits.startsWith('8')) {
      digits = `7${digits.slice(1)}`;
    } else if (digits.length === 10) {
      digits = `7${digits}`;
    }

    return `+${digits}`;
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
