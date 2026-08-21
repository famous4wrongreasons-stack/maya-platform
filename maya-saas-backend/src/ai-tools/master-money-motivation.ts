import { isCanceledOutcome, parseVisitOutcome } from '../domain/visit-outcome';

/**
 * Денежная мотивация мастера — порт логики из `masters_ai.money_pitch`
 * и `_today_earn_from_records` (webhook_server).
 *
 * Считаем детерминированно: LLM арифметику с деньгами не доверяем.
 * Клиентские имена/телефоны сюда не входят — только id, услуги, суммы.
 */

export type MotivationVisit = {
  clientId: string | null;
  startAt: Date;
  status: string;
  /** Валовая стоимость визита в рублях (услуги журнала). */
  grossRub: number;
  services: Array<{ title: string; priceRub: number }>;
};

export type PeriodMoneyMotivation = {
  method: 'historical_top_check';
  lookback_days: number;
  visits: number;
  earned_rub: number | null;
  booked_rub: number;
  target_check_rub: number;
  potential_rub: number;
  upside_rub: number;
  salary_share: number | null;
  footnote: string;
};

/**
 * 🔴 Cycle 04 P6. Отмена — из канонического словаря домена.
 *
 * Здесь стояло подстрочное сравнение (`includes('cancel')`), пятый словарь
 * отмены в системе. На сегодняшних данных он с доменом не расходился, но
 * первое же новое написание статуса развело бы их молча.
 */
function isCancelled(status: string): boolean {
  return isCanceledOutcome(parseVisitOutcome(status));
}

/**
 * Потенциал периода: визиты × целевой чек (топ-40% исторических) × доля ЗП.
 * Порт `_today_earn_from_records`.
 */
export function computePeriodMoneyMotivation(input: {
  periodVisits: MotivationVisit[];
  historyVisits: MotivationVisit[];
  /** Начисление мастеру за период, ₽. */
  earnedRub: number | null;
  lookbackDays?: number;
}): PeriodMoneyMotivation {
  const lookbackDays = input.lookbackDays ?? 60;
  const periodActive = input.periodVisits.filter(
    (visit) => !isCancelled(visit.status) && visit.grossRub > 0,
  );
  const historyActive = input.historyVisits.filter(
    (visit) => !isCancelled(visit.status) && visit.grossRub > 0,
  );
  const visits = periodActive.length;
  const bookedRub = Math.round(
    periodActive.reduce((sum, visit) => sum + visit.grossRub, 0),
  );
  const periodAvg = visits > 0 ? bookedRub / visits : 0;
  const histGrosses = historyActive
    .map((visit) => visit.grossRub)
    .filter((value) => value > 0)
    .sort((a, b) => b - a);
  let targetCheck =
    histGrosses.length > 0
      ? histGrosses
          .slice(0, Math.max(1, Math.round(histGrosses.length * 0.4)))
          .reduce((sum, value) => sum + value, 0) /
        Math.max(1, Math.round(histGrosses.length * 0.4))
      : periodAvg * 1.3;
  targetCheck = Math.max(targetCheck, periodAvg);
  targetCheck = Math.round(targetCheck);

  let salaryShare: number | null = null;
  if (
    input.earnedRub != null &&
    input.earnedRub > 0 &&
    bookedRub > 0 &&
    input.earnedRub < bookedRub
  ) {
    salaryShare = Math.min(0.95, Math.max(0.2, input.earnedRub / bookedRub));
  } else if (
    input.earnedRub != null &&
    bookedRub > 0 &&
    input.earnedRub >= bookedRub
  ) {
    // Владелец / 100% — мотивацию «долей» не крутим: потенциал = валовой ориентир.
    salaryShare = 1;
  } else {
    salaryShare = 0.5;
  }

  const earnedRub =
    input.earnedRub != null && Number.isFinite(input.earnedRub)
      ? Math.round(input.earnedRub)
      : null;
  let potentialRub = Math.round(visits * targetCheck * (salaryShare ?? 0.5));
  if (earnedRub != null && potentialRub < earnedRub) {
    potentialRub = earnedRub;
  }
  if (earnedRub == null && potentialRub < bookedRub) {
    // Без начисления показываем валовой потенциал относительно записанного.
    potentialRub = Math.round(visits * targetCheck);
  }
  const base = earnedRub ?? bookedRub;
  const upsideRub = Math.max(0, potentialRub - base);

  return {
    method: 'historical_top_check',
    lookback_days: lookbackDays,
    visits,
    earned_rub: earnedRub,
    booked_rub: bookedRub,
    target_check_rub: targetCheck,
    potential_rub: potentialRub,
    upside_rub: upsideRub,
    salary_share: salaryShare,
    footnote:
      'Потенциал = визиты × целевой чек (топ-40% твоих чеков за ~60 дней) × твоя доля. Это ориентир MAYA по допродажам, не касса.',
  };
}

export function toMotivationVisit(input: {
  clientId: string | null;
  startAt: Date;
  status: string;
  totalPriceKopecks: number | null;
  services: Array<{ name: string; amountKopecks: number }>;
}): MotivationVisit {
  const services = input.services.map((service) => ({
    title: service.name,
    priceRub: Math.round((service.amountKopecks || 0) / 100),
  }));
  /**
   * 🔴 Cycle 04 P6. Стоимость записи — по тому же правилу, что и у владельца.
   *
   * Здесь стояло `fromTotal > 0 ? fromTotal : fromServices`: запись без цены
   * добирала сумму услуг, и то же самое число за тот же период у владельца
   * фактов получалось другим — он такие записи в стоимость записанного просто
   * не берёт и отдельно публикует долю записей без цены. Два ответа на один
   * вопрос отличались тем сильнее, чем хуже заполнен журнал.
   *
   * Сумма услуг остаётся ТОЛЬКО как содержимое визита (для советов по
   * допродажам), но стоимостью записанного больше не притворяется.
   */
  const grossRub =
    input.totalPriceKopecks != null
      ? Math.round(input.totalPriceKopecks / 100)
      : 0;
  return {
    clientId: input.clientId,
    startAt: input.startAt,
    status: input.status,
    grossRub,
    services,
  };
}
