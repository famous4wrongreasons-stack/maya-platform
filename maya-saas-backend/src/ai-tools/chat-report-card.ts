/**
 * Всплывающие карточки в чате MAYA (владелец / мастер).
 *
 * Текст ответа остаётся, карточка — структурированный срез тех же tool_results.
 * Без выдуманных цифр: только то, что уже посчитал сервер.
 */

export type ChatReportWidget =
  'business_report' | 'master_earn' | 'master_upsell';

export type ChatReportCard = {
  widget: ChatReportWidget;
  widget_data: Record<string, unknown>;
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function moneyRubFromKopecks(kopecks: unknown): number | null {
  if (typeof kopecks !== 'number' || !Number.isFinite(kopecks)) {
    return null;
  }
  return Math.round(kopecks / 100);
}

function metricNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function operationsCaption(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  const absolute = Math.abs(Math.trunc(value));
  const lastTwo = absolute % 100;
  const last = absolute % 10;
  const noun =
    lastTwo >= 11 && lastTwo <= 14
      ? 'операций'
      : last === 1
        ? 'операция'
        : last >= 2 && last <= 4
          ? 'операции'
          : 'операций';
  return `${absolute} ${noun}`;
}

/**
 * Карточка из последнего релевантного tool result.
 */
export function buildChatReportCard(
  toolResults: Array<{ name: string; result: unknown }>,
  options: { personal: boolean; userText: string },
): ChatReportCard | null {
  const latest = [...toolResults]
    .reverse()
    .find((item) =>
      [
        'analytics.business.query',
        'analytics.employee.query',
        'analytics.business.profit',
        'expenses.read',
        'expenses.period.complete',
      ].includes(item.name),
    );
  if (!latest) {
    return null;
  }
  if (
    latest.name === 'analytics.business.profit' ||
    latest.name === 'expenses.period.complete'
  ) {
    return buildProfitCard(latest.result);
  }
  if (latest.name === 'expenses.read') {
    return buildExpensesCard(latest.result);
  }
  if (latest.name === 'analytics.employee.query' || options.personal) {
    return buildMasterCard(latest.result, options.userText);
  }
  if (latest.name === 'analytics.business.query') {
    return buildBusinessCard(latest.result);
  }
  return null;
}

function buildExpensesCard(evidence: unknown): ChatReportCard {
  const data = record(evidence);
  const resolved = record(data.resolved_period);
  const period = record(data.period);
  const label =
    (typeof resolved.label_ru === 'string' && resolved.label_ru) ||
    (typeof period.label_ru === 'string' && period.label_ru) ||
    'выбранный период';
  const rows = Array.isArray(data.by_category)
    ? (data.by_category as unknown[])
        .map((entry) => record(entry))
        .filter((entry) => entry.currency === 'RUB')
        .map((entry) => ({
          label:
            typeof entry.label === 'string' && entry.label.trim()
              ? entry.label.trim()
              : 'Другой расход',
          value_rub: moneyRubFromKopecks(entry.amount_kopecks),
          caption: operationsCaption(entry.expense_count),
        }))
    : [];
  const total = Array.isArray(data.totals)
    ? (data.totals as unknown[])
        .map((entry) => record(entry))
        .find((entry) => entry.currency === 'RUB')
    : null;
  // Признание источника в неполноте приезжает в том же ответе инструмента.
  const truncated = data.truncated === true;
  return {
    widget: 'business_report',
    widget_data: {
      title: 'Расходы',
      period_label: label,
      primary_rub: moneyRubFromKopecks(total?.amount_kopecks),
      primary_label: 'Всего расходов',
      secondary_value: rows.length,
      secondary_label: 'Статей',
      rows_title: rows.length > 0 ? 'По статьям' : null,
      rows,
      /**
       * 🔴 Cycle 04 P5. Ноль строк — это «нечего показать», а не «ничего не
       * было». Список обрывается на пятистах записях (`truncated` приезжает в
       * том же ответе), и строки в другой валюте сюда не попадают вовсе.
       */
      status_text: truncated
        ? 'Список расходов пришёл не целиком — числа выше нижняя граница.'
        : rows.length === 0
          ? 'Расходов за этот период я не вижу — внесённых записей нет.'
          : null,
      source_complete: truncated === false,
    },
  };
}

function buildBusinessCard(evidence: unknown): ChatReportCard {
  const data = record(evidence);
  const metrics = record(data.metrics);
  const resolved = record(data.resolved_period);
  const period = record(data.period);
  const label =
    (typeof resolved.label_ru === 'string' && resolved.label_ru) ||
    (typeof period.label_ru === 'string' && period.label_ru) ||
    'выбранный период';
  /**
   * 🔴 Касса и стоимость записанного — разные числа, и подпись обязана
   * различать их. Раньше карточка показывала одно поле «выручка», в которое при
   * недоступной кассе молча уезжали цены журнала.
   */
  const confirmedRevenue = moneyRubFromKopecks(metrics.revenue_amount_kopecks);
  const bookedValue = moneyRubFromKopecks(metrics.booked_value_amount_kopecks);
  /**
   * 🔴 Cycle 04 P5. Поле выручки содержит выручку или не содержит ничего.
   *
   * Здесь стоял запасной путь: нет кассы — положить в `revenue_rub` стоимость
   * записанного и подписать, что это не касса. Подпись честная, поле — нет:
   * в эталонах видно `revenue_rub: 2500` при `revenue_basis: 'unavailable'`,
   * то есть число выручки там, где канон сказал «выручки нет». Роль без права
   * на деньги получала его так же, как владелец.
   *
   * Стоимость записанного и без того едет своим полем ниже (P2.1).
   */
  const revenue = confirmedRevenue;
  const revenueCaption =
    confirmedRevenue === null && bookedValue !== null
      ? 'Подтверждённой кассы за период нет — ниже стоимость записанного'
      : null;
  const ticket = moneyRubFromKopecks(metrics.average_ticket_amount_kopecks);
  const current = record(data.current);
  const financeRevenue = record(record(current.finance).revenue);
  const staff = Array.isArray(current.staff_summary)
    ? (current.staff_summary as unknown[])
    : [];
  const staffRows = staff.flatMap((entry) => {
    const row = record(entry);
    const confirmed = record(row.confirmed_revenue);
    const amount = moneyRubFromKopecks(record(confirmed.amount).amount_kopecks);
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!name) return [];
    return [
      {
        label: name,
        value_rub: confirmed.status === 'available' ? amount : null,
        caption:
          confirmed.status !== 'available'
            ? 'Нет точной привязки кассы CRM'
            : metricNumber(confirmed.transaction_count) === null
              ? 'Касса связана с мастером, число операций источник не назвал'
              : `${metricNumber(confirmed.transaction_count)} финансовых операций`,
      },
    ];
  });
  const attributionStatus = financeRevenue.staff_attribution_status;
  const coverage = metricNumber(
    financeRevenue.staff_attribution_coverage_percent,
  );
  const staffStatusText =
    attributionStatus === 'partial'
      ? coverage === null
        ? 'YClients связал с мастерами часть кассы услуг, а долю не назвал. Остаток не распределён приблизительно.'
        : `YClients точно связал с мастерами ${coverage}% кассы услуг. Остаток не распределён приблизительно.`
      : attributionStatus === 'unavailable' && staff.length > 0
        ? 'YClients не передал точную привязку кассы к мастерам. Общая касса остаётся доступна.'
        : null;
  return {
    widget: 'business_report',
    widget_data: {
      title: 'Сводка салона',
      period_label: label,
      revenue_rub: revenue,
      revenue_basis:
        typeof metrics.revenue_basis === 'string'
          ? metrics.revenue_basis
          : null,
      revenue_caption: revenueCaption,
      /**
       * 🔴 Cycle 04 P2.1. Стоимость записанного — СВОЁ поле и СВОЯ подпись.
       *
       * Запасной путь выше остаётся ради арендатора на внутреннем календаре, у
       * которого другого понятия денег нет, — но подпись там прямо говорит,
       * что это не касса. Здесь величина названа своим именем и не претендует
       * ни на «выручку», ни на «получено», ни на «заработано».
       */
      booked_value_rub: bookedValue,
      booked_value_caption:
        bookedValue === null ? null : 'Стоимость записанного',
      booked_value_basis:
        typeof metrics.booked_value_basis === 'string'
          ? metrics.booked_value_basis
          : null,
      appointments: metricNumber(metrics.appointments_total),
      unique_clients: metricNumber(metrics.unique_clients),
      clients_new: metricNumber(metrics.clients_new),
      clients_returning: metricNumber(metrics.clients_returning),
      average_ticket_rub: ticket,
      cancellations: metricNumber(metrics.appointments_cancelled),
      rows_title: staffRows.length > 0 ? 'Касса по мастерам' : null,
      rows: staffRows,
      // 🔴 Неполнота источника вытесняет остальные подписи: если журнал
      // прочитан не целиком, это главное, что нужно знать о числах выше.
      status_text: incompleteReadNote(evidence) ?? staffStatusText,
      source_complete: incompleteReadNote(evidence) === null,
      insight:
        typeof data.verified === 'boolean' && data.verified === false
          ? 'Часть цифр могла прийти из запасного снимка — сверьте при необходимости.'
          : null,
    },
  };
}

function buildProfitCard(evidence: unknown): ChatReportCard {
  const data = record(evidence);
  const net = record(data.net_profit);
  const revenue = record(data.confirmed_revenue);
  const expenses = record(data.expenses);
  const completeness = record(data.completeness);
  const resolved = record(data.resolved_period);
  const period = record(data.period);
  const label =
    (typeof resolved.label_ru === 'string' && resolved.label_ru) ||
    (typeof period.label_ru === 'string' && period.label_ru) ||
    'выбранный период';
  const netTotal = moneyRubFromKopecks(
    record(net.total).amount_kopecks ?? net.amount_kopecks,
  );
  // confirmed_revenue.total may be money object
  const revTotal = moneyRubFromKopecks(
    record(revenue.total).amount_kopecks ?? revenue.amount_kopecks,
  );
  const expenseRows = Array.isArray(expenses.by_category)
    ? (expenses.by_category as unknown[])
        .map((entry) => record(entry))
        .filter((entry) => entry.currency === 'RUB')
    : [];
  const rows = expenseRows.map((entry) => ({
    label:
      typeof entry.label === 'string' && entry.label.trim()
        ? entry.label.trim()
        : 'Другой расход',
    value_rub: moneyRubFromKopecks(entry.amount_kopecks),
    caption:
      entry.source === 'crm_payroll'
        ? 'Начислено YClients'
        : 'Внесено владельцем',
  }));
  /**
   * 🔴 Cycle 04 P5. Карточка больше не складывает деньги.
   *
   * Здесь стояли два собственных `reduce` по строкам расходов: фонд оплаты
   * труда и «прочее». Оба с `: 0` на нечисло, то есть строка, сумму которой
   * источник не назвал, тихо считалась нулевой и уменьшала итог.
   *
   * Строки уже сложены владельцем расходов по каждой статье — здесь остаётся
   * ВЫБОР строки, а не сложение. Если статей больше одной, ни одна из них не
   * выдаётся за итог: показывается список, а итог берётся из `totals`.
   */
  const payrollRows = expenseRows.filter(
    (entry) => entry.category === 'salary',
  );
  const payrollKopecks =
    payrollRows.length === 1
      ? (metricNumber(payrollRows[0].amount_kopecks) ?? null)
      : null;
  const additionalRows = expenseRows.filter(
    (entry) => entry.category !== 'salary',
  );
  const additionalKopecks =
    additionalRows.length === 1
      ? (metricNumber(additionalRows[0].amount_kopecks) ?? null)
      : null;
  const totalExpenses = Array.isArray(expenses.totals)
    ? (expenses.totals as unknown[])
        .map((entry) => record(entry))
        .find((entry) => entry.currency === 'RUB')
    : null;
  const ownerConfirmationRequired =
    completeness.owner_confirmation_required === true;
  const assumesUnrecordedExpensesAreZero =
    completeness.unrecorded_additional_expenses_assumed_zero === true;
  return {
    widget: 'business_report',
    widget_data: {
      title: 'Прибыль',
      period_label: label,
      revenue_rub: revTotal,
      net_profit_rub: net.status === 'available' ? netTotal : null,
      payroll_rub: moneyRubFromKopecks(payrollKopecks),
      /**
       * 🔴 Ноль здесь остаётся ТОЛЬКО как измеренный ноль: строк «прочего» нет,
       * и движок прибыли при этом не требует подтверждения владельца. Во всех
       * остальных случаях — `null`, потому что сумму никто не считал.
       */
      additional_expenses_rub:
        additionalRows.length > 0
          ? moneyRubFromKopecks(additionalKopecks)
          : ownerConfirmationRequired && net.status !== 'available'
            ? null
            : 0,
      /** Сколько строк расходов стоит за числами выше. */
      expense_rows_count: rows.length,
      total_expenses_rub: moneyRubFromKopecks(totalExpenses?.amount_kopecks),
      profit_status:
        typeof net.status === 'string' ? net.status : 'unavailable',
      rows_title: rows.length > 0 ? 'Расходы' : null,
      rows,
      // 🔴 Оговорка о неполноте ЧТЕНИЯ вытесняет остальные подписи — так же,
      // как в сводке салона. Прибыль на неполном журнале это прибыль, про
      // которую неизвестно, вся ли она.
      status_text: incompleteReadNote(evidence)
        ? incompleteReadNote(evidence)
        : net.status === 'available' && assumesUnrecordedExpensesAreZero
          ? 'Не внесённые дополнительные расходы сейчас учтены как 0 ₽. Добавьте их в чат в любой момент — прибыль пересчитается.'
          : ownerConfirmationRequired
            ? 'Есть ли за этот период дополнительные расходы помимо зарплаты? Если нет, так и напишите.'
            : net.status === 'available'
              ? 'Дополнительные расходы за период подтверждены.'
              : null,
      insight:
        net.status === 'available'
          ? null
          : ownerConfirmationRequired
            ? null
            : typeof net.unavailable_reason === 'string'
              ? 'Прибыль пока не посчитана — смотри текст MAYA выше.'
              : 'Прибыль пока недоступна.',
    },
  };
}

/**
 * Пометка о неполноте источника для карточки.
 *
 * 🔴 Cycle 04 P0. Карточка рисует те же числа, что и текст, но крупнее — и
 * именно её видят вместо чтения ответа. Печатать в ней «отмен 0», когда
 * журнал прочитан не целиком, значит подписывать нижнюю границу как итог.
 */
function incompleteReadNote(evidence: unknown): string | null {
  const data = record(evidence);
  // 🔴 Полнота лежит внутри опубликованного среза (`current`), а не в корне
  // ответа инструмента. Первая версия этой проверки смотрела в корень и не
  // срабатывала никогда — дефект нашёл скептик при проверке пакета, и это
  // ровно тот случай, когда «оговорка есть в коде» ≠ «оговорка доходит».
  const fromCurrent = record(
    record(record(data.current).completeness).appointments,
  ).status;
  const fromRoot = record(record(data.completeness).appointments).status;
  /**
   * 🔴 Cycle 04 P5. Конверт прибыли называет полноту ИНАЧЕ.
   *
   * `getBusinessProfitability` кладёт её в `source_completeness`, и карточка
   * прибыли — единственная из четырёх — не читала полноту вовсе: числа
   * подписывались точными на журнале, прочитанном не до конца.
   */
  const fromProfit = record(data.source_completeness).status;
  const flagged =
    Array.isArray(data.limitations) &&
    data.limitations
      .map((entry) => record(entry).key)
      .includes('incomplete_read');
  if (
    fromCurrent !== 'incomplete' &&
    fromRoot !== 'incomplete' &&
    fromProfit !== 'incomplete' &&
    !flagged
  ) {
    return null;
  }
  return 'Журнал за период прочитан не целиком: числа — нижняя граница, ноль означает «не измерено».';
}

function buildMasterCard(evidence: unknown, userText: string): ChatReportCard {
  const data = record(evidence);
  const metrics = record(data.metrics);
  const resolved = record(data.resolved_period);
  const period = record(data.period);
  const label =
    (typeof resolved.label_ru === 'string' && resolved.label_ru) ||
    (typeof period.label_ru === 'string' && period.label_ru) ||
    'выбранный период';

  const booked = moneyRubFromKopecks(metrics.booked_value_amount_kopecks);
  const staff = Array.isArray(record(data.current).staff_summary)
    ? (record(data.current).staff_summary as unknown[])
    : [];
  /**
   * 🔴 Личный срез по построению содержит одну строку — свою. Но если строк
   * оказалось больше или меньше, молчаливое `{}` превращало «не смогли
   * сопоставить» в «начислений нет». Причина у канона есть, и она называется.
   */
  const self = staff.length === 1 ? record(staff[0]) : null;
  const salary = record(self?.salary);
  const earned =
    salary.status === 'available'
      ? moneyRubFromKopecks(record(salary.accrued).amount_kopecks)
      : null;
  const earnedUnavailableReason =
    earned !== null
      ? null
      : self === null
        ? 'employee_row_not_resolved'
        : typeof salary.unavailable_reason === 'string'
          ? salary.unavailable_reason
          : 'crm_payroll_is_unavailable';

  // Реальный потенциал из истории чеков мастера (топ-40% за ~60 дней), не +18%.
  //
  // 🔴 Именно это и было нарушено: при отсутствии расчёта подставлялось
  // «выручка × 1.18» — выдуманное число, которое карточка подписывала как
  // «ориентир из твоей истории чеков». Мастер видел точную сумму, за которой
  // не стоит ничего. Нет расчёта — нет цифры.
  const motivation = record(data.money_motivation);
  const potential = metricNumber(motivation.potential_rub) ?? null;
  /**
   * 🔴 Запасной путь через стоимость записанного убран: «потенциал минус
   * записанное» — это не апсайд к заработку, а разность двух РАЗНЫХ фактов.
   * Нет начисления — нет и разницы с ним.
   */
  const upside =
    metricNumber(motivation.upside_rub) ??
    (potential != null && earned != null
      ? Math.max(0, potential - earned)
      : null);
  const motivationFootnote =
    typeof motivation.footnote === 'string' ? motivation.footnote : null;

  const tips = masterUpsellTips(data);
  // 🔴 Голые «уход» и «бород» ловили обычные вопросы: «сколько клиентов
  // уходит», «сколько стрижек бороды». Оба слова остаются, но только в связке
  // с намерением допродажи.
  const wantsUpsell =
    /(апселл|допрод|дополн|экстра|мотивац|потенциал|мог\s+заработать|сколько\s+мог)/i.test(
      userText,
    ) ||
    /уход\w*\s+за|допуслуг|(?:предлож|посовет|продать)\w*[^.?!]{0,24}(?:бород|уход)/i.test(
      userText,
    );

  const masterNote = incompleteReadNote(evidence);

  if (wantsUpsell) {
    return {
      widget: 'master_upsell',
      widget_data: {
        title: 'Совет по допродажам',
        period_label: label,
        /**
         * 🔴 Cycle 04 P5. Заработок — это НАЧИСЛЕНИЕ, и ничто другое.
         *
         * Здесь стояло `earned ?? booked`: когда расчёт зарплаты недоступен,
         * мастеру показывали стоимость записанного под именем «заработано».
         * Это отменяет разделение, ради которого делались P2 и P2.1: два
         * разных факта снова становились одним числом, и худшим из возможных
         * способов — тем, что льстит.
         */
        earned_rub: earned,
        /** Стоимость записанного — рядом и своим именем, а не вместо. */
        booked_rub: booked,
        earned_unavailable_reason: earnedUnavailableReason,
        potential_rub: potential,
        upside_rub: upside,
        target_check_rub: metricNumber(motivation.target_check_rub),
        tips:
          tips.length > 0
            ? tips
            : [
                'К стрижке предложи уход или бороду, если гость уже брал это раньше — без давления.',
                'Закрепи следующую запись на 3–4 недели, пока гость в кресле.',
              ],
        footnote:
          motivationFootnote ||
          'Потенциал — ориентир MAYA по допродажам из твоей истории чеков, не касса.',
        // Неполный журнал вытесняет остальные подписи: числа выше — нижняя
        // граница, и мастеру это важнее совета.
        status_text: masterNote,
        source_complete: masterNote === null,
      },
    };
  }

  return {
    widget: 'master_earn',
    widget_data: {
      title: 'Твой результат',
      period_label: label,
      earned_rub: earned,
      booked_rub: booked,
      potential_rub: potential,
      upside_rub: upside,
      target_check_rub: metricNumber(motivation.target_check_rub),
      appointments: metricNumber(metrics.appointments_total),
      unique_clients: metricNumber(metrics.unique_clients),
      earned_unavailable_reason: earnedUnavailableReason,
      footnote:
        earned == null
          ? 'Начисление из CRM за период ещё не пришло. Стоимость записанного показана отдельным полем — это не заработок.'
          : motivationFootnote ||
            'Потенциал — ориентир MAYA по допродажам из твоей истории чеков, не факт кассы.',
      status_text: masterNote,
      source_complete: masterNote === null,
    },
  };
}

function masterUpsellTips(data: Record<string, unknown>): string[] {
  const opportunities = Array.isArray(data.upsell_opportunities)
    ? data.upsell_opportunities
    : [];
  const fromHistory: string[] = [];
  for (const raw of opportunities.slice(0, 3)) {
    const row = record(raw);
    if (typeof row.tip === 'string' && row.tip.trim()) {
      fromHistory.push(row.tip.trim());
    }
  }
  if (fromHistory.length > 0) {
    return fromHistory;
  }

  const current = record(data.current);
  const services = Array.isArray(current.service_summary)
    ? current.service_summary
    : Array.isArray(data.service_changes)
      ? data.service_changes
      : [];
  const tips: string[] = [];
  for (const raw of services.slice(0, 8)) {
    const row = record(raw);
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!name) continue;
    const delta = metricNumber(row.delta);
    if (delta !== null && delta < 0) {
      tips.push(`Клиентам, кто обычно берёт «${name}», мягко напомни сегодня.`);
    } else if (/уход|бород|камуфляж|масс|экспресс/i.test(name)) {
      tips.push(`К стрижке предложи «${name}» — гости уже брали эту опцию.`);
    }
    if (tips.length >= 3) break;
  }
  return tips.slice(0, 3);
}
