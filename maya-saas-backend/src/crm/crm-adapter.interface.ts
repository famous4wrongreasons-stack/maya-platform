import { CrmProvider } from '../common/domain.enums';
import type {
  FetchCompleteness,
  FetchTruncationReason,
  RevenueBasis,
} from '../domain';
import type {
  AppliedWorkDayChange,
  BookableSlot,
  Practitioner,
  PractitionerAccessCandidate,
  ServiceOffering,
  WorkDay,
  WorkDayChangePreview,
  WorkInterval,
  VisitAttendance,
} from '../domain';

export interface CrmAdapterConfig {
  provider: CrmProvider;
  apiToken: string;
  baseUrl?: string | null;
  settings?: Record<string, unknown>;
}

/**
 * 🔴 ВРЕМЕННЫЕ АЛИАСЫ (Cycle 02 P3).
 *
 * Каталог и расписание больше не принадлежат границе CRM: их отдают ДВА
 * источника — внешний адаптер и внутренний календарь, — поэтому канон переехал
 * в `src/domain`. Имена ниже оставлены только для того, чтобы потребители
 * мигрировали постепенно, а не одной ревизией.
 *
 * Это НЕ параллельная модель: каждое имя — псевдоним канонического типа, а не
 * второй тип. `domain/boundary.spec.ts` следит, что список только сокращается,
 * и не даёт добавить сюда новое имя.
 */
export type ServiceItem = ServiceOffering;
export type StaffMember = Practitioner;
export type CrmTeamMember = PractitionerAccessCandidate;

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

export type AvailableSlot = BookableSlot;
export type StaffScheduleSlot = WorkInterval;
export type StaffScheduleDay = WorkDay;
export type StaffScheduleChangePreview = WorkDayChangePreview;

export interface ApplyStaffScheduleDayChangeParams {
  tenantId: string;
  staffId: string;
  date: string;
  slots: StaffScheduleSlot[];
  expectedRevision: string;
  timezone: string;
}

export type AppliedStaffScheduleDayChange = AppliedWorkDayChange;

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
   * Provider route used for creation. This is separate from `allowBusy`:
   * legacy admin tools use the admin endpoint while still rejecting a busy
   * slot, whereas the schedule journal deliberately permits one.
   */
  creationMode?: 'client' | 'admin';
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
  /**
   * Напоминание провайдера для клиентской записи. Административный путь это
   * поле игнорирует и не отправляет уведомление автоматически.
   */
  notifyBySmsHours?: number;
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

/**
 * Обезличенная карточка из полного CRM-реестра.
 *
 * Имя, телефон и другие ПД не покидают адаптер. Внешний id нужен
 * только серверу для дедупликации карточек и не должен уходить в LLM.
 */
export interface CrmClientRegistryItem {
  external_id: string;
  visits_count: number;
  sold_amount: number;
  last_visit_date: string | null;
  /**
   * Имя и телефон гостя. Появились ради списка спящих клиентов: владельцу
   * нужно знать, КОГО возвращать, а не «client_7».
   *
   * 🔴 Эти поля НИКОГДА не уходят во внешнюю модель. Инструменты, работающие
   * с реестром на уровне статистики, отдают псевдонимы; поимённый список
   * собирает сервер и помечает инструмент как чувствительный к ПД.
   */
  name: string | null;
  phone: string | null;
}

export interface CrmClientRegistrySnapshot {
  provider: string;
  clients: CrmClientRegistryItem[];
  generated_at: string;
  complete: true;
}

export interface CrmClientSearchResult {
  id: string;
  name: string;
  phone: string | null;
  visits_count: number | null;
  sold_amount: number | null;
  last_visit_date: string | null;
}

/**
 * Till-confirmed service revenue linked to exact CRM appointment ids.
 * This contract is intentionally narrow: it exists for attribution and must
 * not fall back to booked prices when the CRM has no matching transaction.
 */
export interface CrmAppointmentRevenueSnapshot {
  provider: string;
  currency: string;
  verified: true;
  requested_record_count: number;
  matched_record_count: number;
  records: Array<{
    external_id: string;
    amount_kopecks: number;
    transaction_count: number;
  }>;
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
  /**
   * 🔴 Cycle 03 B3.3. Присутствие клиента — доказанное значение либо `null`.
   *
   * До B3.3 присутствие через журнал не проезжало вовсе: оно жило только в
   * карточке одного визита, а здесь было свёрнуто в `status` вместе с оплатой.
   * Из-за этого зеркало не могло отличить «клиент пришёл» от «касса закрыта»,
   * и событие о присутствии было бы утверждением без доказательства.
   *
   * `null` означает «провайдер значения не дал» и НЕ равно `awaiting`:
   * `awaiting` — это утверждение «отметки ещё нет», а `null` — отсутствие
   * утверждения. Различие несёт зеркало и компаратор переходов.
   *
   * Поле необязательное: адаптер без поддержки присутствия его просто не
   * заполняет, и это честнее, чем прислать выдуманное значение.
   */
  attendance?: VisitAttendance | null;
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
  /**
   * Присутствие наследуется от журнала и означает ровно одно: что сказал
   * провайдер. `null` = не сказал ничего.
   *
   * 🔴 Раньше поле переобъявлялось здесь как обязательное и заполнялось
   * `attendanceFromCode`, то есть молчание провайдера превращалось в `awaiting`
   * ещё до выхода из адаптера. Пока значение шло только на экран, это было
   * терпимо; с приходом зеркала — нет: выдуманное `awaiting` осело бы в базе и
   * следующий проход выпустил бы событие о переходе, которого не было.
   *
   * Число для уже выпущенного PWA собирает презентер на HTTP-краю — там же, где
   * живёт остальной провод, и там же подставляется значение по умолчанию.
   */
  paid: boolean;
  /** Что владельцу разрешено делать с этой записью прямо сейчас. */
  can_edit: boolean;
}

export interface CrmJournal {
  calendar_source: 'external';
  /**
   * 🔴 Насколько полно прочитан журнал (B3.0).
   *
   * Без этого поля усечённая выборка выглядела полной и для кабинета, и для
   * сверки — а сверка по такой выборке объявила бы недочитанные записи
   * удалёнными.
   */
  completeness: FetchCompleteness;
  truncation_reason?: FetchTruncationReason;
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

/**
 * Подтверждённая касса услуг, связанная с сотрудником средствами самой CRM.
 *
 * `staff_id` остаётся служебным ключом backend: AI-слой использует его для
 * соединения с безопасным списком мастеров и не публикует наружу.
 */
export interface CrmRevenueStaffBreakdown extends CrmMoneyAmount {
  staff_id: string;
  transaction_count: number;
}

/**
 * Подтверждённая касса, однозначно связанная с одной услугой.
 *
 * YClients связывает финансовую операцию с записью, но не делит её
 * между несколькими услугами. Поэтому в этот срез попадают только
 * транзакции одноуслуговых записей. `service_id` — служебный ключ и
 * наружу из backend не публикуется.
 */
export interface CrmRevenueServiceBreakdown extends CrmMoneyAmount {
  service_id: string;
  name: string;
  transaction_count: number;
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
    /**
     * На чём стоит число. См. `domain/revenue-basis.ts`.
     *
     * 🔴 Не `till_confirmed`: провайдер не даёт признака подтверждения у
     * операции, поэтому обещать фискальную доказательность нельзя.
     */
    basis: RevenueBasis;
    /**
     * Что сознательно отброшено при подсчёте. Сумма ВАЛОВАЯ: возвраты и нули
     * в неё не входят. До P4 эти строки исчезали бесследно.
     */
    discarded: {
      negative_count: number;
      zero_count: number;
      untyped_count: number;
    };
    transaction_count: number | null;
    total: CrmMoneyAmount | null;
    by_type: CrmRevenueBreakdown[];
    by_account: CrmRevenueAccountBreakdown[];
    by_staff: CrmRevenueStaffBreakdown[];
    by_service: CrmRevenueServiceBreakdown[];
    staff_attribution_status: CrmFinanceStatus;
    staff_attribution_coverage_percent: number | null;
    unattributed_service_total: CrmMoneyAmount | null;
    unattributed_service_transaction_count: number;
    service_attribution_status: CrmFinanceStatus;
    service_attribution_coverage_percent: number | null;
    unattributed_service_breakdown_total: CrmMoneyAmount | null;
    unattributed_service_breakdown_transaction_count: number;
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
    /**
     * Отдавать ли отменённые визиты. По умолчанию нет: сетку расписания рисует
     * этот же ответ, и отменённая запись нарисовала бы карточку поверх времени,
     * которое салон уже перепродал. Аналитике отмены нужны — она их запрашивает.
     */
    includeCanceled?: boolean;
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
  /** «Пришёл» / «не пришёл». Кодировку провайдера знает только сам адаптер. */
  markAppointmentAttendance?(params: {
    tenantId: string;
    externalId: string;
    attendance: VisitAttendance;
  }): Promise<{ external_id: string; attendance: VisitAttendance }>;
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
  }): Promise<CrmClientSearchResult[]>;
  /**
   * Полный постраничный реестр для retention-аналитики.
   * Адаптер обязан падать, а не возвращать частичный снимок.
   */
  getClientRegistry?(params: {
    tenantId: string;
  }): Promise<CrmClientRegistrySnapshot>;
  /**
   * История визитов CRM-клиента по id из searchClients.
   * Для AI-досье: имена услуг и даты без телефона/ФИО в ответе адаптера
   * тоже можно отдать — редaction делает AI-слой.
   */
  getClientVisitHistory?(params: {
    tenantId: string;
    clientId: string;
    limit?: number;
    /**
     * 🔴 Cycle 04 P9. Часовой пояс салона обязателен: провайдер отдаёт время
     * записи БЕЗ смещения, и без пояса адаптер вынужден его выдумать. Раньше он
     * выдумывал «Europe/Moscow» — скрытое бизнес-правило, из-за которого визит
     * у салона в другом поясе мог оказаться на сутки не в том дне.
     */
    timezone: string;
  }): Promise<
    Array<{
      start: string;
      service_names: string[];
      total_price: number | null;
      attendance: VisitAttendance | null;
    }>
  >;
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
  getAppointmentRevenue?(params: {
    tenantId: string;
    from: string;
    to: string;
    timezone: string;
    externalIds: string[];
  }): Promise<CrmAppointmentRevenueSnapshot>;
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
