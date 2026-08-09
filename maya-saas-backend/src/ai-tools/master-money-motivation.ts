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

export type UpsellOpportunity = {
  addon_title: string;
  price_rub: number;
  times_bought: number;
  usual_gross_rub: number;
  usual_salary_rub: number;
  addon_salary_rub: number;
  potential_salary_rub: number;
  month_delta_rub: number;
  year_delta_rub: number;
  visits_per_month: number;
  tip: string;
};

const ADDON_KW = [
  'бород',
  'тонирован',
  'окантов',
  'гладкое бритье',
  'spa',
  'спа',
  'массаж',
  'патчи',
  'эпиляц',
  'скраб',
  'маск',
  'уход за кож',
  'камуфляж',
  'воск',
  'восков',
];
const PRIO_KW = ['бород', 'тонирован'];
const MAIN_KW = ['стрижка', 'фейд', 'бритье головы', 'детск'];

const SERVICE_KEYWORDS: Array<[string, RegExp[]]> = [
  [
    'моделирование бороды',
    [/моделирование/i, /моделировать/i, /оформ\w* бород/i],
  ],
  ['окантовка бороды', [/окантовк\w*/i, /окантовать/i]],
  ['тонирование', [/тонирован\w*/i, /тонировать/i]],
  ['камуфляж', [/камуфляж\w*/i]],
  ['гладкое бритье', [/гладк\w+ брить?/i, /побрить/i]],
  ['бритье головы', [/брить[её] голов\w*/i, /побрить голов/i]],
  ['воск', [/воск\w*/i, /восков\w+/i]],
  ['стрижка машинкой', [/машинк\w*/i]],
  ['укладка', [/уклад\w*/i]],
];

const IMPLIED_BY_SERVICE: Array<[RegExp, RegExp[]]> = [
  [/стрижк/i, [/окантовк/i, /мыть/i, /укладк/i, /уклад/i]],
  [/фейд/i, [/окантовк/i]],
  [/машинк/i, [/окантовк/i]],
  [
    /моделирование бород/i,
    [/окантовк бород/i, /окантовк/i, /оформ\w* контур/i, /оформ\w* бород/i],
  ],
];

function serviceKey(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

function isCancelled(status: string): boolean {
  const value = String(status || '').toLowerCase();
  return value.includes('cancel') || value.includes('отмен');
}

function currentBlocksAddon(
  addonTitle: string,
  currentTitles: Set<string>,
): boolean {
  const addonKey = serviceKey(addonTitle);
  const today = [...currentTitles].sort().join(' ');
  if (!addonKey) return true;
  if (currentTitles.has(addonKey)) return true;
  for (const title of currentTitles) {
    if (title.length < 5) continue;
    if (
      addonKey === title ||
      addonKey.includes(title) ||
      title.includes(addonKey)
    ) {
      return true;
    }
  }
  for (const [, patterns] of SERVICE_KEYWORDS) {
    if (!patterns.some((pattern) => pattern.test(addonKey))) continue;
    if (patterns.some((pattern) => pattern.test(today))) return true;
  }
  for (const [parent, implied] of IMPLIED_BY_SERVICE) {
    if (!parent.test(today)) continue;
    if (implied.some((pattern) => pattern.test(addonKey))) return true;
  }
  return false;
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

export function historicalAddonOpportunity(
  history: MotivationVisit[],
  currentServices: Array<{ title: string; priceRub: number }>,
): {
  title: string;
  price_rub: number;
  times_bought: number;
  last_date: string;
} | null {
  const currentTitles = new Set(
    currentServices.map((service) => serviceKey(service.title)).filter(Boolean),
  );
  const grouped = new Map<
    string,
    {
      title: string;
      times_bought: number;
      last_date: string;
      last_price_rub: number;
    }
  >();

  for (const visit of history) {
    if (isCancelled(visit.status)) continue;
    const visitDate = visit.startAt.toISOString().slice(0, 10);
    for (const service of visit.services) {
      const key = serviceKey(service.title);
      if (!key || MAIN_KW.some((token) => key.includes(token))) continue;
      if (!ADDON_KW.some((token) => key.includes(token))) continue;
      if (currentBlocksAddon(key, currentTitles)) continue;
      const row = grouped.get(key) ?? {
        title: service.title.trim(),
        times_bought: 0,
        last_date: '',
        last_price_rub: 0,
      };
      row.times_bought += 1;
      if (visitDate >= row.last_date) {
        row.last_date = visitDate;
        row.title = service.title.trim() || row.title;
        row.last_price_rub = Math.max(0, Math.round(service.priceRub || 0));
      }
      grouped.set(key, row);
    }
  }

  const candidates = [...grouped.entries()]
    .map(([key, row]) => ({
      key,
      title: row.title || 'Дополнительная услуга',
      price_rub: row.last_price_rub,
      times_bought: row.times_bought,
      last_date: row.last_date,
    }))
    .filter((row) => row.price_rub > 0);

  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    if (b.times_bought !== a.times_bought)
      return b.times_bought - a.times_bought;
    if (b.last_date !== a.last_date)
      return b.last_date.localeCompare(a.last_date);
    const aPrio = PRIO_KW.some((token) => serviceKey(a.title).includes(token))
      ? 1
      : 0;
    const bPrio = PRIO_KW.some((token) => serviceKey(b.title).includes(token))
      ? 1
      : 0;
    if (bPrio !== aPrio) return bPrio - aPrio;
    return b.price_rub - a.price_rub;
  });
  return candidates[0] ?? null;
}

function visitsPerMonth(visits: MotivationVisit[]): number {
  const dates = visits
    .map((visit) => visit.startAt)
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  let vpm = 1;
  if (dates.length >= 2) {
    const spanDays =
      (dates[dates.length - 1].getTime() - dates[0].getTime()) /
      (24 * 60 * 60 * 1000);
    if (spanDays > 0) {
      const cycle = spanDays / (dates.length - 1);
      if (cycle >= 7 && cycle <= 120) {
        vpm = 30 / cycle;
      }
    }
  }
  return Math.max(0.5, Math.min(vpm, 4));
}

function freqWord(vpm: number): string {
  const n = Math.round(vpm);
  if (vpm < 0.85) return 'примерно раз в 5–6 недель';
  if (n <= 1) return 'примерно раз в месяц';
  return `~${n} раза в месяц`;
}

/**
 * Денежный питч по одному клиенту (порт `money_pitch`).
 * Без имён — только услуги и суммы.
 */
export function moneyPitchForClient(input: {
  historyWithMaster: MotivationVisit[];
  currentVisit: MotivationVisit;
  salaryShare: number;
}): UpsellOpportunity | null {
  const share = input.salaryShare;
  if (!(share > 0) || share >= 1) {
    return null;
  }
  const mine = input.historyWithMaster.filter(
    (visit) => !isCancelled(visit.status) && visit.grossRub > 0,
  );
  const grosses = mine.map((visit) => visit.grossRub);
  const usualGross = grosses.length
    ? Math.round(
        grosses.reduce((sum, value) => sum + value, 0) / grosses.length,
      )
    : Math.round(input.currentVisit.grossRub || 0);
  if (usualGross <= 0) return null;

  const opportunity = historicalAddonOpportunity(
    mine,
    input.currentVisit.services,
  );
  if (!opportunity) return null;

  const vpm = visitsPerMonth(mine);
  const usualSalary = Math.round(usualGross * share);
  const addonSalary = Math.round(opportunity.price_rub * share);
  const potentialSalary = usualSalary + addonSalary;
  const monthDelta = Math.round(addonSalary * vpm);
  const yearDelta = Math.round(addonSalary * vpm * 12);

  return {
    addon_title: opportunity.title,
    price_rub: opportunity.price_rub,
    times_bought: opportunity.times_bought,
    usual_gross_rub: usualGross,
    usual_salary_rub: usualSalary,
    addon_salary_rub: addonSalary,
    potential_salary_rub: potentialSalary,
    month_delta_rub: monthDelta,
    year_delta_rub: yearDelta,
    visits_per_month: Math.round(vpm * 100) / 100,
    tip: `Раньше гость брал «${opportunity.title}» (${opportunity.price_rub.toLocaleString('ru-RU')} ₽). Если снова возьмёт — +${addonSalary.toLocaleString('ru-RU')} ₽ тебе за визит (~${yearDelta.toLocaleString('ru-RU')} ₽/год, ходит ${freqWord(vpm)}).`,
  };
}

/**
 * Собрать лучшие апселл-возможности по визитам периода, глядя в историю
 * того же мастера (журнал ~60 дней уже содержит нужные визиты).
 */
export function collectUpsellOpportunities(input: {
  periodVisits: MotivationVisit[];
  historyVisits: MotivationVisit[];
  salaryShare: number;
  limit?: number;
}): UpsellOpportunity[] {
  const limit = input.limit ?? 3;
  if (!(input.salaryShare > 0) || input.salaryShare >= 1) {
    return [];
  }
  const byClient = new Map<string, MotivationVisit[]>();
  for (const visit of input.historyVisits) {
    if (!visit.clientId || isCancelled(visit.status)) continue;
    const list = byClient.get(visit.clientId) ?? [];
    list.push(visit);
    byClient.set(visit.clientId, list);
  }

  const scored: UpsellOpportunity[] = [];
  const seenAddons = new Set<string>();
  for (const visit of input.periodVisits) {
    if (!visit.clientId || isCancelled(visit.status)) continue;
    const history = (byClient.get(visit.clientId) ?? []).filter(
      (item) => item.startAt.getTime() < visit.startAt.getTime(),
    );
    const pitch = moneyPitchForClient({
      historyWithMaster: history,
      currentVisit: visit,
      salaryShare: input.salaryShare,
    });
    if (!pitch) continue;
    const key = serviceKey(pitch.addon_title);
    if (seenAddons.has(key)) continue;
    seenAddons.add(key);
    scored.push(pitch);
  }

  scored.sort(
    (a, b) =>
      b.year_delta_rub - a.year_delta_rub ||
      b.addon_salary_rub - a.addon_salary_rub,
  );
  return scored.slice(0, limit);
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
  const fromServices = services.reduce(
    (sum, service) => sum + service.priceRub,
    0,
  );
  const fromTotal =
    input.totalPriceKopecks != null
      ? Math.round(input.totalPriceKopecks / 100)
      : 0;
  return {
    clientId: input.clientId,
    startAt: input.startAt,
    status: input.status,
    grossRub: fromTotal > 0 ? fromTotal : fromServices,
    services,
  };
}
