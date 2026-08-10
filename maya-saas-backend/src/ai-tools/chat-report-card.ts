/**
 * Всплывающие карточки в чате MAYA (владелец / мастер).
 *
 * Текст ответа остаётся, карточка — структурированный срез тех же tool_results.
 * Без выдуманных цифр: только то, что уже посчитал сервер.
 */

export type ChatReportWidget =
  | 'business_report'
  | 'master_earn'
  | 'master_upsell'
  | 'client_dossier'
  | 'client_return_candidates';

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
        'clients.return_candidates.read',
      ].includes(item.name),
    );
  if (!latest) {
    return null;
  }
  if (latest.name === 'clients.return_candidates.read') {
    return buildClientReturnCandidatesCard(latest.result);
  }
  if (latest.name === 'analytics.business.profit') {
    return buildProfitCard(latest.result);
  }
  if (latest.name === 'analytics.employee.query' || options.personal) {
    return buildMasterCard(latest.result, options.userText);
  }
  if (latest.name === 'analytics.business.query') {
    return buildBusinessCard(latest.result);
  }
  return null;
}

function buildClientReturnCandidatesCard(evidence: unknown): ChatReportCard {
  const data = record(evidence);
  const filter = record(data.filter);
  const candidates = Array.isArray(data.candidates)
    ? data.candidates.slice(0, 15).map((candidate) => {
        const row = record(candidate);
        return {
          display_name:
            typeof row.display_name === 'string' ? row.display_name : 'Клиент',
          phone_masked:
            typeof row.phone_masked === 'string' ? row.phone_masked : null,
          reason: typeof row.reason === 'string' ? row.reason : null,
          reason_code:
            typeof row.reason_code === 'string' ? row.reason_code : null,
          last_event_at:
            typeof row.last_event_at === 'string' ? row.last_event_at : null,
          last_completed_visit:
            typeof row.last_completed_visit === 'string'
              ? row.last_completed_visit
              : null,
          average_cycle_days: metricNumber(row.average_cycle_days),
          days_overdue: metricNumber(row.days_overdue),
        };
      })
    : [];
  return {
    widget: 'client_return_candidates',
    widget_data: {
      title: 'Клиенты для возврата',
      total_count: metricNumber(data.total_count) ?? 0,
      shown_count: metricNumber(data.shown_count) ?? candidates.length,
      candidates,
      requires_confirmation: data.requires_confirmation === true,
      communication_started: data.communication_started === true,
      filter:
        filter.type === 'inactive_period'
          ? {
              type: 'inactive_period',
              threshold_days: metricNumber(filter.threshold_days),
              lookback_days: metricNumber(filter.lookback_days),
            }
          : { type: 'adaptive_return' },
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
  const revenue = moneyRubFromKopecks(metrics.revenue_amount_kopecks);
  const ticket = moneyRubFromKopecks(metrics.average_ticket_amount_kopecks);
  return {
    widget: 'business_report',
    widget_data: {
      title: 'Сводка салона',
      period_label: label,
      revenue_rub: revenue,
      appointments: metricNumber(metrics.appointments_total),
      unique_clients: metricNumber(metrics.unique_clients),
      clients_new: metricNumber(metrics.clients_new),
      clients_returning: metricNumber(metrics.clients_returning),
      average_ticket_rub: ticket,
      cancellations: metricNumber(metrics.appointments_cancelled),
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
  return {
    widget: 'business_report',
    widget_data: {
      title: 'Прибыль',
      period_label: label,
      revenue_rub: revTotal,
      net_profit_rub: net.status === 'available' ? netTotal : null,
      profit_status:
        typeof net.status === 'string' ? net.status : 'unavailable',
      insight:
        net.status === 'available'
          ? null
          : typeof net.unavailable_reason === 'string'
            ? 'Прибыль пока не посчитана — смотри текст MAYA выше.'
            : 'Прибыль пока недоступна.',
    },
  };
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
  const self = staff.length === 1 ? record(staff[0]) : {};
  const salary = record(self.salary);
  const earned =
    salary.status === 'available'
      ? moneyRubFromKopecks(record(salary.accrued).amount_kopecks)
      : null;

  // Реальный потенциал из истории чеков мастера (топ-40% за ~60 дней), не +18%.
  const motivation = record(data.money_motivation);
  const potential =
    metricNumber(motivation.potential_rub) ??
    (booked != null || earned != null
      ? Math.round((booked ?? earned ?? 0) * 1.18)
      : null);
  const upside =
    metricNumber(motivation.upside_rub) ??
    (potential != null && earned != null
      ? Math.max(0, potential - earned)
      : potential != null && booked != null
        ? Math.max(0, potential - booked)
        : null);
  const motivationFootnote =
    typeof motivation.footnote === 'string' ? motivation.footnote : null;

  const tips = masterUpsellTips(data);
  const wantsUpsell =
    /(апселл|допрод|дополн|уход|бород|экстра|мотивац|потенциал|мог\s+заработать|сколько\s+мог)/i.test(
      userText,
    );

  if (wantsUpsell) {
    return {
      widget: 'master_upsell',
      widget_data: {
        title: 'Совет по допродажам',
        period_label: label,
        earned_rub: earned ?? booked,
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
      footnote:
        earned == null
          ? 'Начисление из CRM за период ещё не пришло — показываю стоимость записанных услуг.'
          : motivationFootnote ||
            'Потенциал — ориентир MAYA по допродажам из твоей истории чеков, не факт кассы.',
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
