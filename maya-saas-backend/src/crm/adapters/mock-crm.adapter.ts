import {
  AvailableSlot,
  CancelledAppointment,
  CRMAdapter,
  CreatedAppointment,
  CrmAdapterConfig,
  CreateAppointmentParams,
  ServiceItem,
  StaffMember,
} from '../crm-adapter.interface';

const MOCK_SERVICES: ServiceItem[] = [
  {
    id: 'svc-haircut',
    name: 'Signature Haircut',
    price: 2500,
    duration_minutes: 60,
    currency: 'RUB',
    category: 'Haircuts',
  },
  {
    id: 'svc-beard',
    name: 'Beard Sculpting',
    price: 1400,
    duration_minutes: 30,
    currency: 'RUB',
    category: 'Beard',
  },
  {
    id: 'svc-premium',
    name: 'Premium Grooming',
    price: 4200,
    duration_minutes: 90,
    currency: 'RUB',
    category: 'Premium',
  },
];

const MOCK_STAFF: StaffMember[] = [
  {
    id: 'staff-anton',
    name: 'Anton Sokolov',
    title: 'Senior Barber',
    specialization: 'Senior Barber',
    avatar_url: null,
    rating: 4.9,
  },
  {
    id: 'staff-nikita',
    name: 'Nikita Volkov',
    title: 'Top Master',
    specialization: 'Top Master',
    avatar_url: null,
    rating: 4.8,
  },
];

export class MockCRMAdapter implements CRMAdapter {
  constructor(private readonly config: CrmAdapterConfig) {}

  getServices(tenantId: string): Promise<ServiceItem[]> {
    void tenantId;
    return Promise.resolve(MOCK_SERVICES);
  }

  getStaff(tenantId: string): Promise<StaffMember[]> {
    void tenantId;
    return Promise.resolve(MOCK_STAFF);
  }

  getAvailableSlots(params: {
    tenantId: string;
    date: string;
    staffId?: string;
    serviceIds?: string[];
    branchId?: string;
  }): Promise<AvailableSlot[]> {
    void params.tenantId;
    void params.serviceIds;

    const parsedDate = new Date(params.date);
    const day = new Date(
      Date.UTC(
        parsedDate.getUTCFullYear(),
        parsedDate.getUTCMonth(),
        parsedDate.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
    const staffIds = params.staffId
      ? [params.staffId]
      : MOCK_STAFF.map((staff) => staff.id);
    const slots: AvailableSlot[] = [];

    for (const staffId of staffIds) {
      for (const hour of [9, 11, 13, 15, 17]) {
        const start = new Date(day);
        start.setUTCHours(hour, 0, 0, 0);

        const end = new Date(start);
        end.setUTCMinutes(end.getUTCMinutes() + 60);

        slots.push({
          start: start.toISOString(),
          end: end.toISOString(),
          staff_id: staffId,
          branch_id: params.branchId ?? null,
        });
      }
    }

    return Promise.resolve(slots);
  }

  createAppointment(
    params: CreateAppointmentParams,
  ): Promise<CreatedAppointment> {
    void params.clientId;
    void params.clientPhone;
    void params.notes;

    return Promise.resolve({
      external_id: `mock-${Date.now()}`,
      status: 'confirmed',
      start: params.start,
      staff_id: params.staffId,
      service_ids: params.serviceIds,
      branch_id: params.branchId ?? null,
      raw: {
        provider: this.config.provider,
        client_name: params.clientName,
      },
    });
  }

  cancelAppointment(params: {
    tenantId: string;
    externalId: string;
  }): Promise<CancelledAppointment> {
    void params.tenantId;

    return Promise.resolve({
      external_id: params.externalId,
      status: 'canceled',
      raw: {
        provider: this.config.provider,
        cancelled: true,
      },
    });
  }

  getClientAppointments(clientId: string): Promise<CreatedAppointment[]> {
    void clientId;
    return Promise.resolve([]);
  }

  testConnection(tenantId: string) {
    void tenantId;
    return Promise.resolve({
      ok: true,
      provider: this.config.provider,
      message: 'Mock CRM adapter is available',
    });
  }
}
