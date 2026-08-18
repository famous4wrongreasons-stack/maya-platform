import type { BusinessState } from '../business-state/business-state.service';

/**
 * Факты брифа — то, что отчёт ИМЕЕТ ПРАВО напечатать.
 *
 * 🔴 Cycle 04 P4. Между каноническим состоянием и текстом отчёта нужен один
 * слой, и он занимается ровно двумя вещами: достаёт уже посчитанное и
 * сохраняет разницу между «ноль» и «не знаю». Ни одной новой величины здесь не
 * появляется — ни суммы, ни доли, ни среднего.
 *
 * Зачем отдельный файл. До миграции композиторы получали СЫРОЙ операционный
 * обзор и добирали из него числа через `?? 0`. Из-за этого бриф не мог
 * отличить «отмен не было» от «журнал прочитан не целиком», а «кассы нет» от
 * «касса не ответила»: и то и другое превращалось в ноль по дороге к тексту.
 * Теперь неизвестное остаётся `null` до самого текста, и текст обязан назвать
 * его словами.
 */

/** Число, которое может быть не измерено. `null` — не ноль. */
export type BriefCount = number | null;

export type BriefFacts = {
  localDate: string;
  /** Откуда факты: внешняя CRM или собственный календарь. */
  source: string | null;
  /** Прочитан ли источник записей целиком. */
  sourceComplete: boolean;
  /** Причина неполноты — словами источника, если он признался. */
  incompleteReason: string | null;
  counts: {
    total: BriefCount;
    scheduled: BriefCount;
    completed: BriefCount;
    cancelled: BriefCount;
    bookedMinutes: BriefCount;
  };
  /**
   * Присутствие — только из канонического зеркала главы 3.
   *
   * 🔴 Провайдерский статус сюда не попадает ни при каких условиях: `completed`
   * означает «отмечен приход ИЛИ оплачен счёт», а `no_show` — статус записи, а
   * не наблюдение за визитом. Пока присутствие не сверено, чисел нет и бриф
   * обязан это сказать.
   */
  attendance: {
    arrived: BriefCount;
    noShow: BriefCount;
    measured: boolean;
    unavailableReason: string | null;
  };
  /** Стоимость записанного: цены журнала. Никогда не выручка. */
  bookedValue: {
    amountKopecks: BriefCount;
    averageKopecks: BriefCount;
    basis: string | null;
    unavailableReason: string | null;
  };
  /**
   * Подтверждённая касса и её разбивка.
   *
   * `amountKopecks === 0` при основании `provider_transactions` — это
   * измеренный ноль: касса за день пустая. `null` — касса не измерена, и
   * сказать «пусто» нельзя.
   */
  revenue: {
    amountKopecks: BriefCount;
    basis: string | null;
    cashKopecks: BriefCount;
    cashlessKopecks: BriefCount;
    unclassifiedKopecks: BriefCount;
  };
  /** Начисления смены: строки мастеров и итог. Только для тех, кому открыты деньги. */
  payroll: {
    status: string | null;
    accruedTotalKopecks: BriefCount;
    rows: Array<{ name: string; accruedKopecks: number }>;
  };
  /** Разрез по мастерам — уже с применённым раскрытием имён. */
  staff: Array<{
    name: string | null;
    appointments: BriefCount;
    bookedMinutes: BriefCount;
  }>;
};

/** Личный срез мастера. Отдельный тип, потому что отдельный вопрос. */
export type MasterBriefFacts = {
  localDate: string;
  masterName: string | null;
  /**
   * 🔴 Найден ли мастер в срезе периода.
   *
   * `identity_unresolved` означает, что календарь не сопоставлен с профилем: о
   * его дне НЕ ИЗВЕСТНО НИЧЕГО. До миграции этот случай печатался как
   * «Записей: 0, календарь пока свободен» — то есть промах сопоставления
   * выдавался мастеру за пустой день.
   */
  presence: 'in_period' | 'no_records' | 'identity_unresolved';
  sourceComplete: boolean;
  incompleteReason: string | null;
  counts: {
    total: BriefCount;
    scheduled: BriefCount;
    completed: BriefCount;
    cancelled: BriefCount;
    bookedMinutes: BriefCount;
  };
  attendance: {
    noShow: BriefCount;
    measured: boolean;
    unavailableReason: string | null;
  };
};

type Rec = Record<string, unknown>;

const rec = (value: unknown): Rec =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Rec)
    : {};

const num = (value: unknown): BriefCount =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const money = (value: unknown): BriefCount => num(rec(value).amount_kopecks);

const str = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

function unavailableReason(state: BusinessState, key: string): string | null {
  const row = state.unavailableMetrics.find((entry) => entry.key === key);
  return row ? row.reason : null;
}

function completeness(state: BusinessState): {
  complete: boolean;
  reason: string | null;
} {
  const appointments = rec(rec(state.current).completeness).appointments;
  const status = str(rec(appointments).status);
  // Молчание источника «полнотой» не считается только там, где блок обязан
  // быть; здесь его отсутствие означает старый ответ без диагностики.
  if (status === null) return { complete: true, reason: null };
  return {
    complete: status !== 'incomplete',
    reason: status === 'incomplete' ? str(rec(appointments).reason) : null,
  };
}

/** Факты салона за день. Всё уже посчитано каноническим владельцем. */
export function businessBriefFacts(
  state: BusinessState,
  localDate: string,
): BriefFacts {
  const metrics = state.metrics;
  const source = completeness(state);
  const finance = rec(rec(rec(state.current).finance).revenue);
  const payroll = rec(rec(rec(state.current).finance).payroll);
  const staffRows = Array.isArray(rec(state.current).staff_summary)
    ? (rec(state.current).staff_summary as unknown[])
    : [];
  const attendanceMeasured =
    num(metrics.attended_appointments) !== null ||
    num(metrics.attendance_no_show) !== null;

  return {
    localDate,
    source: str(state.source),
    sourceComplete: source.complete,
    incompleteReason: source.reason,
    counts: {
      total: num(metrics.appointments_total),
      scheduled: num(metrics.appointments_scheduled),
      completed: num(metrics.appointments_completed),
      cancelled: num(metrics.appointments_cancelled),
      bookedMinutes: num(metrics.booked_minutes),
    },
    attendance: {
      arrived: num(metrics.attended_appointments),
      noShow: num(metrics.attendance_no_show),
      measured: attendanceMeasured,
      unavailableReason: attendanceMeasured
        ? null
        : unavailableReason(state, 'attendance'),
    },
    bookedValue: {
      amountKopecks: num(metrics.booked_value_amount_kopecks),
      averageKopecks: num(metrics.average_booked_value_amount_kopecks),
      basis: str(metrics.booked_value_basis),
      unavailableReason:
        num(metrics.booked_value_amount_kopecks) === null
          ? unavailableReason(state, 'booked_value')
          : null,
    },
    revenue: {
      amountKopecks: num(metrics.revenue_amount_kopecks),
      basis: str(metrics.revenue_basis),
      cashKopecks: money(finance.cash_total),
      cashlessKopecks: money(finance.cashless_total),
      unclassifiedKopecks: money(finance.unclassified_total),
    },
    payroll: {
      status: str(payroll.status),
      accruedTotalKopecks: money(payroll.accrued_total),
      /**
       * 🔴 Строки берутся из расчёта зарплаты ЦЕЛИКОМ, а не из разреза мастеров
       * периода: мастеру могло быть начислено в день, когда у него нет ни
       * одной записи, и его строка обязана остаться. Имя в них уже раскрыто
       * решением вызывающего — из чужой системы оно не приходит.
       */
      rows: (Array.isArray(payroll.staff) ? payroll.staff : []).flatMap(
        (entry) => {
          const row = rec(entry);
          const accrued = money(row.accrued);
          if (row.status !== 'available' || accrued === null || accrued <= 0) {
            return [];
          }
          return [{ name: str(row.name) ?? 'Мастер', accruedKopecks: accrued }];
        },
      ),
    },
    staff: staffRows.map((entry) => {
      const row = rec(entry);
      return {
        name: str(row.name),
        appointments: num(row.appointments),
        bookedMinutes: num(row.booked_minutes),
      };
    }),
  };
}

/**
 * Факты одного мастера за день.
 *
 * `externalId === null` означает, что сопоставление календаря с профилем не
 * удалось. Это НЕ пустой день, и подменять одно другим нельзя.
 */
export function masterBriefFacts(
  state: BusinessState,
  externalId: string | null,
  localDate: string,
): MasterBriefFacts {
  const source = completeness(state);
  const row = externalId
    ? state.staffJoin.find((entry) => entry.externalId === externalId)
    : undefined;
  const published = rec(row?.published);
  const empty = {
    total: null,
    scheduled: null,
    completed: null,
    cancelled: null,
    bookedMinutes: null,
  };

  if (externalId === null) {
    return {
      localDate,
      masterName: null,
      presence: 'identity_unresolved',
      sourceComplete: source.complete,
      incompleteReason: source.reason,
      counts: empty,
      attendance: { noShow: null, measured: false, unavailableReason: null },
    };
  }

  if (!row) {
    /**
     * Мастер сопоставлен, но строк за период нет.
     *
     * Это измеренный ноль ровно тогда, когда источник прочитан целиком: если
     * чтение оборвалось, отсутствие строки означает «не видел», а не «не было».
     */
    return {
      localDate,
      masterName: null,
      presence: 'no_records',
      sourceComplete: source.complete,
      incompleteReason: source.reason,
      counts: source.complete
        ? {
            total: 0,
            scheduled: 0,
            completed: 0,
            cancelled: 0,
            bookedMinutes: 0,
          }
        : empty,
      attendance: { noShow: null, measured: false, unavailableReason: null },
    };
  }

  return {
    localDate,
    masterName: str(published.name),
    presence: 'in_period',
    sourceComplete: source.complete,
    incompleteReason: source.reason,
    counts: {
      total: num(published.total),
      scheduled: num(published.scheduled),
      completed: num(published.completed),
      cancelled: num(published.cancelled),
      bookedMinutes: num(published.booked_minutes),
    },
    /**
     * 🔴 Присутствие по мастеру канонический слой не считает: зеркало главы 3
     * сверяется по периоду салона, а не по строке человека. Пока такого факта
     * нет, личный бриф о неявках молчит — вместо того чтобы взять
     * провайдерский статус и назвать его наблюдением.
     */
    attendance: { noShow: null, measured: false, unavailableReason: null },
  };
}
