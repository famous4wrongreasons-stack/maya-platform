import {
  AvailableSlot,
  CancelledAppointment,
  ClientLoyaltySnapshot,
  CRMAdapter,
  CreatedAppointment,
  CrmAdapterConfig,
  CreateAppointmentParams,
  RescheduledAppointment,
  ServiceItem,
  StaffMember,
} from '../crm-adapter.interface';

export class SalonOnlineCRMAdapter implements CRMAdapter {
  constructor(private readonly config: CrmAdapterConfig) {}

  getServices(tenantId: string): Promise<ServiceItem[]> {
    void tenantId;
    return Promise.reject(
      new Error('Salon Online adapter is scaffolded but not implemented yet'),
    );
  }

  getStaff(tenantId: string): Promise<StaffMember[]> {
    void tenantId;
    return Promise.reject(
      new Error('Salon Online adapter is scaffolded but not implemented yet'),
    );
  }

  getAvailableSlots(params: {
    tenantId: string;
    date: string;
    staffId?: string;
    serviceIds?: string[];
    branchId?: string;
  }): Promise<AvailableSlot[]> {
    void params;
    return Promise.reject(
      new Error('Salon Online adapter is scaffolded but not implemented yet'),
    );
  }

  createAppointment(
    params: CreateAppointmentParams,
  ): Promise<CreatedAppointment> {
    void params;
    return Promise.reject(
      new Error('Salon Online adapter is scaffolded but not implemented yet'),
    );
  }

  cancelAppointment(params: {
    tenantId: string;
    externalId: string;
  }): Promise<CancelledAppointment> {
    void params;
    return Promise.reject(
      new Error('Salon Online adapter is scaffolded but not implemented yet'),
    );
  }

  rescheduleAppointment(params: {
    tenantId: string;
    externalId: string;
    start: string;
    staffId?: string;
    serviceIds?: string[];
    notes?: string | null;
  }): Promise<RescheduledAppointment> {
    void params;
    return Promise.reject(
      new Error('Salon Online adapter is scaffolded but not implemented yet'),
    );
  }

  getClientAppointments(clientId: string): Promise<CreatedAppointment[]> {
    void clientId;
    return Promise.resolve([]);
  }

  getClientLoyalty(params: {
    tenantId: string;
    phone: string;
  }): Promise<ClientLoyaltySnapshot | null> {
    void params;
    return Promise.reject(
      new Error('Salon Online adapter is scaffolded but not implemented yet'),
    );
  }

  testConnection(tenantId: string) {
    void tenantId;
    return Promise.resolve({
      ok: false,
      provider: this.config.provider,
      message:
        'Salon Online adapter placeholder is present but real API calls are not implemented yet',
    });
  }
}
