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

export interface CrmTeamMember extends StaffMember {
  bookable: boolean;
  suggested_role: 'administrator' | 'staff';
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

export interface StaffScheduleSlot {
  from: string;
  to: string;
}

export interface StaffScheduleDay {
  staff_id: string;
  date: string;
  is_working: boolean;
  slots: StaffScheduleSlot[];
  revision: string;
}

export interface StaffScheduleChangePreview {
  current: StaffScheduleDay;
  proposed: StaffScheduleDay;
  conflict_times: string[];
}

export interface ApplyStaffScheduleDayChangeParams {
  tenantId: string;
  staffId: string;
  date: string;
  slots: StaffScheduleSlot[];
  expectedRevision: string;
  timezone: string;
}

export interface AppliedStaffScheduleDayChange {
  staff_id: string;
  date: string;
  is_working: boolean;
  slots: StaffScheduleSlot[];
  verified: boolean;
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
  /**
   * Админская запись из журнала: разрешить занятое окно и время вне графика.
   * Клиентский путь всегда оставляет это выключенным — иначе клиент запишется
   * на нерабочее время.
   */
  allowBusy?: boolean;
  /**
   * Длительность сеанса, заданная мастером вручную. Без неё длительность
   * считается суммой услуг — так же, как в журнале салона.
   */
  durationMinutes?: number;
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

/**
 * Мастер в журнале дня: кто в смене и с какого по какой час.
 *
 * Без этого сетку расписания рисовать не из чего — колонки строятся по
 * мастерам, а высота столбца по границам смены. Раньше журнал отдавал только
 * записи, поэтому кабинет показывал плоский список вместо сетки.
 */
export interface CrmJournalMaster {
  id: string;
  name: string;
  title?: string | null;
  avatar_url?: string | null;
  /** null — график в CRM не заведён; сетка покажет мастера по факту записей. */
  is_working: boolean | null;
  /** «ЧЧ:ММ» в часовом поясе филиала; null, если смены нет. */
  work_start: string | null;
  work_end: string | null;
  /** Интервалы смены с перерывами — сетка рисует по ним свободные окна. */
  work_slots: Array<{ from: string; to: string }>;
}

/** Карточка визита по тапу в сетке расписания. */
export interface CrmAppointmentDetail extends CrmJournalAppointment {
  client_phone: string | null;
  /** Длительность визита в минутах — её меняют кнопками ±15. */
  duration_minutes: number;
  attendance: number;
  paid: boolean;
  /** Что владельцу разрешено делать с этой записью прямо сейчас. */
  can_edit: boolean;
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
  /** В смене сегодня (или есть записи) — колонки сетки. */
  masters?: CrmJournalMaster[];
  /** Весь активный штат — для переноса записи на мастера вне смены. */
  all_masters?: CrmJournalMaster[];
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

export interface CrmRevenueSummary {
  source: 'external_crm';
  provider: string;
  verified: boolean;
  period: {
    from: string;
    to: string;
    timezone: string;
  };
  revenue: CrmFinancialSummary['revenue'];
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
  getTeamMembers?(tenantId: string): Promise<CrmTeamMember[]>;
  getAvailableSlots(params: {
    tenantId: string;
    date: string;
    staffId?: string;
    serviceIds?: string[];
    branchId?: string;
  }): Promise<AvailableSlot[]>;
  getStaffScheduleDay?(params: {
    tenantId: string;
    staffId: string;
    date: string;
  }): Promise<StaffScheduleDay>;
  previewStaffScheduleDayChange?(params: {
    tenantId: string;
    staffId: string;
    date: string;
    slots: StaffScheduleSlot[];
    timezone: string;
  }): Promise<StaffScheduleChangePreview>;
  applyStaffScheduleDayChange?(
    params: ApplyStaffScheduleDayChangeParams,
  ): Promise<AppliedStaffScheduleDayChange>;
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
  /**
   * Операции над визитом из журнала — то, чем владелец пользуется каждый день.
   * Все опциональные: провайдер, который их не умеет, просто не объявляет метод,
   * и кабинет прячет соответствующую кнопку вместо того, чтобы падать.
   */
  /** Чей визит — для стража доступа, без загрузки полной карточки. */
  getAppointmentStaffId?(params: {
    tenantId: string;
    externalId: string;
  }): Promise<string | null>;
  getAppointmentDetail?(params: {
    tenantId: string;
    externalId: string;
    timezone: string;
  }): Promise<CrmAppointmentDetail>;
  /** «Пришёл» / «не пришёл»: attendance 1 | -1 | 0 (ожидание). */
  markAppointmentAttendance?(params: {
    tenantId: string;
    externalId: string;
    attendance: number;
  }): Promise<{ external_id: string; attendance: number }>;
  /** Стянуть/растянуть визит. Услуги, цены и время начала не трогаются. */
  setAppointmentDuration?(params: {
    tenantId: string;
    externalId: string;
    durationMinutes: number;
  }): Promise<{ external_id: string; duration_minutes: number }>;
  /** Полная замена состава услуг визита с сохранением цен уже стоявших услуг. */
  setAppointmentServices?(params: {
    tenantId: string;
    externalId: string;
    serviceIds: string[];
  }): Promise<{ external_id: string; service_ids: string[] }>;
  /** Подсказка постоянного клиента по хвосту телефона при ручной записи. */
  searchClients?(params: {
    tenantId: string;
    query: string;
  }): Promise<Array<{ id: string; name: string; phone: string | null }>>;
  getFinancialSummary?(params: {
    tenantId: string;
    from: string;
    to: string;
    timezone: string;
  }): Promise<CrmFinancialSummary>;
  getRevenueSummary?(params: {
    tenantId: string;
    from: string;
    to: string;
    timezone: string;
  }): Promise<CrmRevenueSummary>;
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
