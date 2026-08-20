/**
 * Бизнес-факт — канонический контракт главы 4.
 *
 * 🔴 Зачем это понадобилось. Аудит Phase A нашёл восемь независимых мест, где
 * рождается денежное число за период, и ни одного места, где было бы сказано,
 * ЧТО именно означает ноль. «Отмен 0» и «отмены не измерены» приезжали
 * владельцу одной и той же строкой; когорты уже однажды соврали ровно так —
 * нулём вместо неизвестности.
 *
 * Контракт минимален по построению: каждое поле здесь стоит потому, что его
 * отсутствие УЖЕ приводило к неверному ответу, а не потому, что «пригодится».
 * Чего здесь нет намеренно: вероятности (в главе 4 нет ни одного
 * вероятностного факта, а поле пригласило бы прогноз), отдельного `verified`
 * (это `basis`, названный вторым именем) и провенанса целиком (он живёт в
 * `DomainEvent`, и второй его экземпляр стал бы вторым источником истории).
 *
 * Файл ПУСТОЙ от инфраструктуры: ни Nest, ни Prisma, ни времени «сейчас».
 * Момент расчёта передаётся снаружи — иначе факт нельзя было бы проверить.
 */

/** Окно, за которое факт посчитан. Обе границы включительно. */
export interface BusinessPeriod {
  /** ISO-момент начала. Включительно. */
  from: string;
  /** ISO-момент конца. Включительно. */
  to: string;
  /**
   * Часовой пояс салона. Без него «месяц» — не период: «прибыль в июле»
   * однажды уже отвечали цифрами текущего месяца, и числа были настоящими.
   */
  timezone: string;
}

export type BusinessFactUnit = 'count' | 'minutes' | 'percent' | 'kopecks';

/**
 * Откуда число прочитано. Не «чем доказано» — именно откуда.
 *
 * 🔴 Phase A: аналитика для внешнего арендатора ходит в журнал по сети, а
 * зеркало главы 3 не читает никто. Пока оба источника живы, факт обязан
 * называть свой источник вслух: иначе один и тот же вопрос будет отвечаться
 * то так, то иначе, и заметить это будет нечем.
 */
export type BusinessFactSource =
  /** Журнал записей провайдера, прочитанный через границу CRM. */
  | 'provider_journal'
  /** Каноническое зеркало визитов Maya (глава 3). */
  | 'canonical_mirror'
  /** Кассовые операции провайдера. */
  | 'provider_transactions'
  /** Книга расходов самого салона в Maya. */
  | 'owner_ledger';

/**
 * На чём стоит число.
 *
 * Денежные основания повторяют `RevenueBasis` намеренно: это тот же вопрос
 * «чем доказано», заданный шире. Расхождение двух словарей стоило бы дороже,
 * чем небольшое пересечение.
 */
export type BusinessFactBasis =
  /** Записи журнала, отфильтрованные по самому периоду. */
  | 'provider_journal_records'
  /** Строки зеркала, отфильтрованные по самому периоду. */
  | 'canonical_mirror_records'
  /**
   * 🔴 Доказанное присутствие клиента, а НЕ статус визита.
   *
   * `completed` у провайдера выводится из «отмечен приход ИЛИ оплачено» —
   * это два разных бизнес-факта в одном слове. Присутствие имеет собственный
   * канон с главы 3, и факты о приходе стоят только на нём.
   */
  | 'observed_attendance'
  /** Кассовые операции провайдера. Валовая сумма. */
  | 'provider_transactions'
  /** Сумма цен из журнала. Стоимость записанного, а не деньги. */
  | 'booked_prices'
  /** Расходы, внесённые владельцем. */
  | 'recorded_expenses';

/** Почему выборка, из которой посчитан факт, неполна. Машинные коды. */
export const FACT_INCOMPLETE_REASON = {
  /** Источник признал, что отдал не всё (`FetchCompleteness = truncated`). */
  sourceReadTruncated: 'source_read_truncated',
  /**
   * 🔴 Не у каждой записи периода присутствие вообще наблюдалось.
   *
   * Это не сбой: `NULL` означает «Maya не получала значения», и глава 3
   * специально запретила превращать его в `awaiting`. Но пока такие записи
   * есть, «пришло N человек» — нижняя граница, а не измерение.
   */
  attendanceNotObservedForEveryRecord:
    'attendance_was_not_observed_for_every_record_of_the_period',
  /**
   * Период не покрыт ни одним завершённым и полным прогоном сверки: зеркало
   * за него никто не перечитывал.
   */
  periodOutsideObservedRange: 'period_is_outside_the_observed_range',
  /**
   * 🔴 Cycle 04 closure A. Период ещё не наблюдался до конца.
   *
   * Прогон сверки записывает ЗАПРОШЕННОЕ окно (ближний контур берёт ±7 суток
   * от «сейчас»), поэтому строка покрытия честно накрывает завтрашний день —
   * но наблюдение закончилось в момент `finishedAt`. Без этой проверки
   * «пришли 0» за завтра публиковалось как доказанный ноль.
   */
  periodExtendsPastObservation: 'period_extends_past_the_moment_of_observation',
} as const;

export type BusinessFactIncompleteReason =
  (typeof FACT_INCOMPLETE_REASON)[keyof typeof FACT_INCOMPLETE_REASON];

/** Почему числа нет вовсе. Машинные коды. */
export const FACT_UNAVAILABLE_REASON = {
  /** Источник такого не измеряет в этом разрезе. */
  notMeasuredBySource: 'source_does_not_measure_this_value_here',
  /** Источник не ответил за этот период. */
  sourceDidNotAnswer: 'source_did_not_answer_for_this_period',
  /** Значение нельзя свести к запрошенному разрезу (например, к филиалу). */
  scopeNotSupported: 'source_cannot_scope_this_value_to_the_request',
} as const;

export type BusinessFactUnavailableReason =
  (typeof FACT_UNAVAILABLE_REASON)[keyof typeof FACT_UNAVAILABLE_REASON];

/**
 * 🔴 ЧЕТЫРЕ РАЗНЫХ СОСТОЯНИЯ, а не два.
 *
 * Требование владельца дословно: `0` ≠ `not measured` ≠ `incomplete` ≠
 * `unavailable`. Здесь они и разделены — не производным вычислением, которое
 * можно забыть выполнить, а самим типом, который нельзя не заполнить.
 */
export type BusinessFactState =
  /** Число измерено, выборка полна. **Только здесь ноль означает «ноль».** */
  | 'measured'
  /** Число измерено, но выборка неполна: ноль не доказывает отсутствия. */
  | 'measured_incomplete'
  /** Источник этого здесь не измеряет. Числа нет и быть не может. */
  | 'not_measured'
  /** Источник не ответил. Числа нет — но оно существует. */
  | 'unavailable';

/** Насколько полно прочитан источник, из которого посчитан факт. */
export interface FactObservation {
  source: BusinessFactSource;
  completeness: 'complete' | 'incomplete';
  incompleteReason: BusinessFactIncompleteReason | null;
  /**
   * До какого момента источник реально прочитан.
   *
   * 🔴 Phase A: 1330 из 1950 визитов зеркала лежат вне контуров сверки и не
   * перечитывались ни разу. «Свежесть» без такой границы — обещание, а не
   * измерение.
   */
  observedThrough: string | null;
  /**
   * Сколько записей источник вернул МИМО запрошенного окна.
   *
   * 🔴 Реестр 3.8: провайдер отдаёт записи вне запрошенного диапазона —
   * измерено, 17 записей 2024–2025 годов в окне 2026 года. Ответ источника
   * окном не является, и это число делает факт видимым, а не гипотетическим.
   */
  outOfPeriodDiscarded: number;
}

export interface BusinessFact {
  /** Что измерено: `appointments.total`, `attendance.arrived`, … */
  key: string;
  tenantId: string;
  period: BusinessPeriod;
  state: BusinessFactState;
  /** Заполнено ⟺ `state` начинается с `measured`. */
  value: number | null;
  unit: BusinessFactUnit;
  /** Заполнено только при `unit = 'kopecks'`. */
  currency: string | null;
  basis: BusinessFactBasis | null;
  observation: FactObservation;
  reason: BusinessFactUnavailableReason | BusinessFactIncompleteReason | null;
  /** Когда посчитано. Кэш уже существует и уже невидим — больше не будет. */
  calculatedAt: string;
}

export interface MeasuredFactInput {
  key: string;
  tenantId: string;
  period: BusinessPeriod;
  value: number;
  unit: BusinessFactUnit;
  currency?: string | null;
  basis: BusinessFactBasis;
  observation: FactObservation;
  calculatedAt: Date;
}

export interface MissingFactInput {
  key: string;
  tenantId: string;
  period: BusinessPeriod;
  unit: BusinessFactUnit;
  currency?: string | null;
  basis?: BusinessFactBasis | null;
  observation: FactObservation;
  reason: BusinessFactUnavailableReason;
  calculatedAt: Date;
}

/**
 * Измеренный факт.
 *
 * Полнота НЕ передаётся отдельным аргументом: она берётся из наблюдения, из
 * которого факт и посчитан. Разъехаться им негде.
 */
export function measuredFact(input: MeasuredFactInput): BusinessFact {
  const incomplete = input.observation.completeness === 'incomplete';
  return {
    key: input.key,
    tenantId: input.tenantId,
    period: input.period,
    state: incomplete ? 'measured_incomplete' : 'measured',
    value: input.value,
    unit: input.unit,
    currency: input.unit === 'kopecks' ? (input.currency ?? null) : null,
    basis: input.basis,
    observation: input.observation,
    reason: incomplete ? input.observation.incompleteReason : null,
    calculatedAt: input.calculatedAt.toISOString(),
  };
}

/** Источник этого здесь не измеряет. Не ошибка — свойство источника. */
export function notMeasuredFact(input: MissingFactInput): BusinessFact {
  return {
    ...missingFact(input),
    state: 'not_measured',
  };
}

/** Источник не ответил. Значение существует, но его у нас нет. */
export function unavailableFact(input: MissingFactInput): BusinessFact {
  return {
    ...missingFact(input),
    state: 'unavailable',
  };
}

function missingFact(input: MissingFactInput): BusinessFact {
  return {
    key: input.key,
    tenantId: input.tenantId,
    period: input.period,
    state: 'unavailable',
    value: null,
    unit: input.unit,
    currency: input.unit === 'kopecks' ? (input.currency ?? null) : null,
    basis: input.basis ?? null,
    observation: input.observation,
    reason: input.reason,
    calculatedAt: input.calculatedAt.toISOString(),
  };
}

/**
 * Можно ли по этому факту заключить, что чего-то НЕТ.
 *
 * 🔴 Единственный владелец этого вопроса — ровно как `allowsAbsenceInference`
 * для выборки. Вызывающий не должен сравнивать состояния сам: именно так
 * неполнота и превращается незаметно в доказанный ноль.
 */
export function allowsAbsenceConclusion(fact: BusinessFact): boolean {
  return fact.state === 'measured';
}

/**
 * Ноль этого факта означает «ничего не было»?
 *
 * Отдельно от предыдущей функции, потому что вопрос задаётся о конкретном
 * числе: «отмен 0» законно произносить вслух только здесь.
 */
export function meansProvenNone(fact: BusinessFact): boolean {
  return allowsAbsenceConclusion(fact) && fact.value === 0;
}

/** Полное наблюдение — включая честно пустое. */
export function completeObservation(input: {
  source: BusinessFactSource;
  observedThrough?: string | null;
  outOfPeriodDiscarded?: number;
}): FactObservation {
  return {
    source: input.source,
    completeness: 'complete',
    incompleteReason: null,
    observedThrough: input.observedThrough ?? null,
    outOfPeriodDiscarded: input.outOfPeriodDiscarded ?? 0,
  };
}

/** Неполное наблюдение: причина обязательна. */
export function incompleteObservation(input: {
  source: BusinessFactSource;
  reason: BusinessFactIncompleteReason;
  observedThrough?: string | null;
  outOfPeriodDiscarded?: number;
}): FactObservation {
  return {
    source: input.source,
    completeness: 'incomplete',
    incompleteReason: input.reason,
    observedThrough: input.observedThrough ?? null,
    outOfPeriodDiscarded: input.outOfPeriodDiscarded ?? 0,
  };
}

/** Сериализация факта наружу: ни одного поля с персональными данными. */
export function serializeBusinessFact(fact: BusinessFact) {
  return {
    key: fact.key,
    state: fact.state,
    value: fact.value,
    unit: fact.unit,
    ...(fact.unit === 'kopecks' ? { currency: fact.currency } : {}),
    basis: fact.basis,
    source: fact.observation.source,
    completeness: fact.observation.completeness,
    reason: fact.reason,
    observed_through: fact.observation.observedThrough,
    out_of_period_discarded: fact.observation.outOfPeriodDiscarded,
    calculated_at: fact.calculatedAt,
  };
}
