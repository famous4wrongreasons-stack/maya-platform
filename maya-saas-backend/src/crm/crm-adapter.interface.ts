import { CrmProvider } from '../common/domain.enums';

export interface CrmAdapterConfig {
  provider: CrmProvider;
  apiToken: string;
  baseUrl?: string | null;
  settings?: Record<string, unknown>;
}

export interface ServiceItem {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
  currency: string;
  category?: string;
}

export interface StaffMember {
  id: string;
  name: string;
  title?: string;
  specialization?: string;
  avatar_url?: string | null;
  rating?: number | null;
}

export interface AvailableSlot {
  start: string;
  end: string;
  staff_id: string;
  branch_id?: string | null;
}

export interface CreateAppointmentParams {
  tenantId: string;
  clientId: string;
  clientName: string;
  clientPhone?: string | null;
  branchId?: string | null;
  staffId: string;
  serviceIds: string[];
  start: string;
  notes?: string | null;
}

export interface CreatedAppointment {
  external_id: string;
  status: string;
  start: string;
  staff_id: string;
  service_ids: string[];
  branch_id?: string | null;
  raw?: Record<string, unknown>;
}

export interface CancelledAppointment {
  external_id: string;
  status: string;
  raw?: Record<string, unknown>;
}

export interface RescheduledAppointment {
  external_id: string;
  status: string;
  start: string;
  staff_id: string;
  service_ids: string[];
  raw?: Record<string, unknown>;
}

export interface CRMAdapter {
  getServices(tenantId: string): Promise<ServiceItem[]>;
  getStaff(tenantId: string): Promise<StaffMember[]>;
  getAvailableSlots(params: {
    tenantId: string;
    date: string;
    staffId?: string;
    serviceIds?: string[];
    branchId?: string;
  }): Promise<AvailableSlot[]>;
  createAppointment(
    params: CreateAppointmentParams,
  ): Promise<CreatedAppointment>;
  cancelAppointment(params: {
    tenantId: string;
    externalId: string;
  }): Promise<CancelledAppointment>;
  rescheduleAppointment(params: {
    tenantId: string;
    externalId: string;
    start: string;
    staffId?: string;
    serviceIds?: string[];
    notes?: string | null;
  }): Promise<RescheduledAppointment>;
  getClientAppointments(clientId: string): Promise<CreatedAppointment[]>;
  testConnection(tenantId: string): Promise<{
    ok: boolean;
    provider: string;
    message: string;
  }>;
}
