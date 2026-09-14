import {
  DEFAULT_INDUSTRY_PRESET_ID,
  IndustryPresetId,
  isIndustryPresetId,
} from '../../common/industry-presets';
import {
  AvailableSlot,
  CancelledAppointment,
  ClientAppointmentsParams,
  ClientLoyaltySnapshot,
  CRMAdapter,
  CreatedAppointment,
  CrmAdapterConfig,
  CreateAppointmentParams,
  RescheduledAppointment,
  ServiceItem,
  StaffMember,
} from '../crm-adapter.interface';

interface MockDataset {
  services: ServiceItem[];
  staff: StaffMember[];
}

function service(
  id: string,
  name: string,
  price: number,
  durationMinutes: number,
  category: string,
): ServiceItem {
  return {
    id,
    name,
    price,
    duration_minutes: durationMinutes,
    currency: 'RUB',
    category,
  };
}

function provider(id: string, name: string, title: string): StaffMember {
  return {
    id,
    name,
    title,
    specialization: title,
    avatar_url: null,
    rating: 4.9,
  };
}

const MOCK_DATASETS: Record<IndustryPresetId, MockDataset> = {
  general_service: {
    services: [
      service('svc-consultation', 'Консультация', 1500, 45, 'Основные услуги'),
      service(
        'svc-standard',
        'Стандартная услуга',
        2500,
        60,
        'Основные услуги',
      ),
      service('svc-extended', 'Расширенная услуга', 4200, 90, 'Дополнительно'),
    ],
    staff: [
      provider('provider-alex', 'Алексей Орлов', 'Специалист'),
      provider('provider-maria', 'Мария Волкова', 'Ведущий специалист'),
    ],
  },
  solo_specialist: {
    services: [
      service('svc-intro', 'Первая консультация', 1800, 60, 'Консультации'),
      service('svc-session', 'Индивидуальная сессия', 3000, 60, 'Сессии'),
    ],
    staff: [provider('provider-owner', 'Алексей Орлов', 'Специалист')],
  },
  beauty_salon: {
    services: [
      service('svc-style', 'Укладка', 2200, 60, 'Красота'),
      service('svc-care', 'Комплексный уход', 3900, 90, 'Уход'),
    ],
    staff: [
      provider('provider-anna', 'Анна Смирнова', 'Мастер'),
      provider('provider-elena', 'Елена Орлова', 'Старший мастер'),
    ],
  },
  barbershop: {
    services: [
      service('svc-haircut', 'Мужская стрижка', 2500, 60, 'Стрижки'),
      service('svc-beard', 'Оформление бороды', 1400, 30, 'Борода'),
    ],
    staff: [
      provider('provider-anton', 'Антон Соколов', 'Барбер'),
      provider('provider-nikita', 'Никита Волков', 'Старший барбер'),
    ],
  },
  dental_clinic: {
    services: [
      service('svc-dental-check', 'Первичный приём', 2000, 60, 'Диагностика'),
      service('svc-hygiene', 'Профессиональная гигиена', 5500, 90, 'Гигиена'),
    ],
    staff: [
      provider('provider-doctor-1', 'Анна Белова', 'Врач'),
      provider('provider-doctor-2', 'Илья Морозов', 'Врач-стоматолог'),
    ],
  },
  auto_detailing: {
    services: [
      service('svc-diagnostics', 'Диагностика', 2500, 60, 'Диагностика'),
      service(
        'svc-detailing',
        'Комплексный детейлинг',
        18000,
        180,
        'Детейлинг',
      ),
    ],
    staff: [
      provider('provider-auto-1', 'Максим Орлов', 'Специалист'),
      provider('provider-auto-2', 'Денис Волков', 'Ведущий специалист'),
    ],
  },
  education: {
    services: [
      service('svc-trial-lesson', 'Пробное занятие', 1000, 45, 'Занятия'),
      service('svc-lesson', 'Индивидуальное занятие', 2500, 60, 'Занятия'),
    ],
    staff: [
      provider('provider-teacher-1', 'Ольга Миронова', 'Преподаватель'),
      provider('provider-teacher-2', 'Иван Крылов', 'Старший преподаватель'),
    ],
  },
};

export class MockCRMAdapter implements CRMAdapter {
  constructor(private readonly config: CrmAdapterConfig) {}

  private getDataset(): MockDataset {
    const requestedPreset = this.config.settings?.industryPresetId;
    const presetId = isIndustryPresetId(requestedPreset)
      ? requestedPreset
      : DEFAULT_INDUSTRY_PRESET_ID;

    return MOCK_DATASETS[presetId];
  }

  getServices(tenantId: string): Promise<ServiceItem[]> {
    void tenantId;
    return Promise.resolve(this.getDataset().services);
  }

  getStaff(tenantId: string): Promise<StaffMember[]> {
    void tenantId;
    return Promise.resolve(this.getDataset().staff);
  }

  getAvailableSlots(params: {
    tenantId: string;
    timezone: string;
    date: string;
    staffId?: string;
    serviceIds?: string[];
    branchId?: string;
  }): Promise<AvailableSlot[]> {
    void params.tenantId;
    void params.timezone;
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
      : this.getDataset().staff.map((staff) => staff.id);
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
    });
  }

  rescheduleAppointment(params: {
    tenantId: string;
    timezone: string;
    externalId: string;
    start: string;
    staffId?: string;
    serviceIds?: string[];
    notes?: string | null;
  }): Promise<RescheduledAppointment> {
    void params.tenantId;
    void params.timezone;
    void params.notes;
    const dataset = this.getDataset();

    return Promise.resolve({
      external_id: params.externalId,
      status: 'confirmed',
      start: params.start,
      staff_id: params.staffId ?? dataset.staff[0]?.id ?? 'provider-default',
      service_ids:
        params.serviceIds && params.serviceIds.length > 0
          ? params.serviceIds
          : [dataset.services[0]?.id ?? 'svc-standard'],
    });
  }

  getClientAppointments(
    params: ClientAppointmentsParams,
  ): Promise<CreatedAppointment[]> {
    void params;
    return Promise.resolve([]);
  }

  getClientLoyalty(params: {
    tenantId: string;
    phone: string;
  }): Promise<ClientLoyaltySnapshot | null> {
    void params.tenantId;
    const configured = Number(this.config.settings?.loyaltyBalance ?? 0);
    return Promise.resolve({
      provider: this.config.provider,
      external_client_id: `mock-${params.phone.replace(/\D/g, '').slice(-4)}`,
      // 🔴 Карты у mock-провайдера нет. Раньше здесь стояло 'mock-card' —
      // выдумка, существовавшая только потому, что так выглядит ответ YCLIENTS.
      // Канон допускает null, и это честнее: поля нет, а не «есть, но фиктивное».
      external_card_id: null,
      balance: Number.isFinite(configured)
        ? Math.max(0, Math.round(configured))
        : 0,
      sold_amount: null,
      currency: 'RUB',
    });
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
