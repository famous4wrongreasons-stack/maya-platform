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

export interface CrmCompanyOption {
  id: string;
  title: string;
  address: string | null;
}

export interface CrmCompanyProfile extends CrmCompanyOption {
  logo_url: string | null;
  timezone: string | null;
  schedule: string | null;
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
  end?: string;
  staff_id: string;
  service_ids: string[];
  branch_id?: string | null;
  total_price?: number | null;
  currency?: string;
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

export interface ClientLoyaltySnapshot {
  provider: string;
  external_client_id: string;
  external_card_id: string | null;
  balance: number;
  sold_amount: number | null;
  currency: string;
}

export interface ClientAppointmentsParams {
  tenantId: string;
  phone: string;
  from?: string;
  to?: string;
  timezone?: string;
}

export interface CrmJournalAppointment {
  id: string;
  client: {
    id: string | null;
    name: string;
  };
  provider: {
    id: string;
    name: string;
    title?: string;
    avatar_url?: string | null;
  };
  branch: null;
  service_ids: string[];
  services: ServiceItem[];
  start_at: string;
  end_at: string;
  status: string;
  notes: string | null;
  total_price: number | null;
  currency: string;
}

export interface CrmJournal {
  calendar_source: 'external';
  timezone: string;
  range: {
    from: string;
    to: string;
  };
  provider_id: string | null;
  count: number;
  appointments: CrmJournalAppointment[];
}

export type CrmFinanceStatus = 'available' | 'partial' | 'unavailable';

export interface CrmMoneyAmount {
  currency: string;
  amount_kopecks: number;
}

export interface CrmRevenueBreakdown extends CrmMoneyAmount {
  key: string;
  label: string;
}

export interface CrmRevenueAccountBreakdown extends CrmMoneyAmount {
  name: string;
  is_cash: boolean | null;
}

export interface CrmStaffPayroll {
  staff_id: string;
  name: string;
  status: 'available' | 'unavailable';
  verified: boolean;
  accrued: CrmMoneyAmount | null;
  paid: CrmMoneyAmount | null;
  balance: CrmMoneyAmount | null;
}

export interface CrmFinancialSummary {
  source: 'external_crm';
  provider: string;
  verified: boolean;
  period: {
    from: string;
    to: string;
    timezone: string;
  };
  revenue: {
    status: 'available' | 'unavailable';
    verified: boolean;
    transaction_count: number | null;
    total: CrmMoneyAmount | null;
    by_type: CrmRevenueBreakdown[];
    by_account: CrmRevenueAccountBreakdown[];
  };
  payroll: {
    status: CrmFinanceStatus;
    verified: boolean;
    accrued_total: CrmMoneyAmount | null;
    paid_total: CrmMoneyAmount | null;
    balance_total: CrmMoneyAmount | null;
    staff: CrmStaffPayroll[];
  };
  warnings: Array<{
    code: string;
    message: string;
  }>;
}

export interface CRMAdapter {
  discoverCompanies?(): Promise<CrmCompanyOption[]>;
  getCompanyProfile?(): Promise<CrmCompanyProfile | null>;
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
  getClientAppointments(
    params: ClientAppointmentsParams,
  ): Promise<CreatedAppointment[]>;
  getJournal?(params: {
    tenantId: string;
    from: string;
    to: string;
    timezone: string;
    providerId?: string;
  }): Promise<CrmJournal>;
  getFinancialSummary?(params: {
    tenantId: string;
    from: string;
    to: string;
    timezone: string;
  }): Promise<CrmFinancialSummary>;
  getClientLoyalty(params: {
    tenantId: string;
    phone: string;
  }): Promise<ClientLoyaltySnapshot | null>;
  testConnection(tenantId: string): Promise<{
    ok: boolean;
    provider: string;
    message: string;
  }>;
}
