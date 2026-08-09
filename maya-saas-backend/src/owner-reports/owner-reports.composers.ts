import { displayDayRu, formatRubFromKopecks } from './owner-reports.time';

type OverviewLike = {
  appointments?: {
    active?: number;
    total?: number;
    booked_minutes?: number;
  };
  staff?: Array<{
    name?: string | null;
    appointments?: number;
    booked_minutes?: number;
  }>;
  average_ticket?: Array<{ amount_kopecks?: number }>;
  revenue?: Array<{ amount_kopecks?: number }>;
};

export function composeMorningBrief(input: {
  localDate: string;
  overview: OverviewLike;
}): { title: string; bodyText: string; payload: Record<string, unknown> } {
  const booked =
    Number(input.overview.appointments?.active ?? 0) ||
    Number(input.overview.appointments?.total ?? 0) ||
    0;
  const bookedMinutes = Number(
    input.overview.appointments?.booked_minutes || 0,
  );
  const ticket = Number(
    input.overview.average_ticket?.[0]?.amount_kopecks || 0,
  );
  const bookedValue = Number(input.overview.revenue?.[0]?.amount_kopecks || 0);
  const underused = (input.overview.staff || [])
    .filter((row) => Number(row.appointments || 0) <= 1)
    .map((row) => String(row.name || '').trim())
    .filter(Boolean)
    .slice(0, 4);

  const lines = [
    'Доброе утро! Посмотрела салон на сегодня 👇',
    '',
    `📅 Сегодня: ${booked} записей` +
      (bookedValue > 0
        ? `, ожидаемо ~${formatRubFromKopecks(bookedValue)}` +
          (ticket > 0 ? ` (средний чек ${formatRubFromKopecks(ticket)})` : '')
        : '') +
      '.',
  ];
  if (underused.length) {
    lines.push(
      `🪑 Недозагружены: ${underused.join(', ')}` +
        (bookedMinutes > 0 ? ` — занято ${bookedMinutes} мин.` : '.'),
    );
  } else {
    lines.push('🪑 Загрузка мастеров выглядит ровной на утро.');
  }
  lines.push(
    '',
    'Откройте чат MAYA, если нужно закрыть окна или скорректировать план.',
  );

  return {
    title: `MAYA · утренний план · ${displayDayRu(input.localDate)}`,
    bodyText: lines.join('\n'),
    payload: {
      kind: 'morning_brief',
      local_date: input.localDate,
      booked,
      booked_value_kopecks: bookedValue,
      underused,
    },
  };
}

type FinanceLike = {
  revenue?: {
    total?: { amount_kopecks?: number } | null;
    by_account?: Array<{
      name?: string;
      is_cash?: boolean | null;
      amount_kopecks?: number;
    }>;
    transaction_count?: number | null;
  };
  payroll?: {
    status?: string;
    accrued_total?: { amount_kopecks?: number } | null;
    staff?: Array<{
      name?: string;
      accrued?: { amount_kopecks?: number } | null;
    }>;
  };
};

export function composeDailyReport(input: {
  localDate: string;
  overview: OverviewLike;
  finance: FinanceLike | null;
}): { title: string; bodyText: string; payload: Record<string, unknown> } {
  const day = displayDayRu(input.localDate);
  const visits =
    Number(input.overview.appointments?.active ?? 0) ||
    Number(input.overview.appointments?.total ?? 0) ||
    0;
  const revenueTotal = Number(
    input.finance?.revenue?.total?.amount_kopecks || 0,
  );
  const accounts = input.finance?.revenue?.by_account || [];
  const cash = accounts
    .filter((row) => row.is_cash === true)
    .reduce((sum, row) => sum + Number(row.amount_kopecks || 0), 0);
  const card = accounts
    .filter((row) => row.is_cash === false)
    .reduce((sum, row) => sum + Number(row.amount_kopecks || 0), 0);
  const payrollStaff = (input.finance?.payroll?.staff || [])
    .filter((row) => Number(row.accrued?.amount_kopecks || 0) > 0)
    .slice(0, 12);

  const lines = [`📊 Отчёт за ${day} готов`, ''];

  if (payrollStaff.length) {
    lines.push('Зарплаты (смена):');
    for (const row of payrollStaff) {
      lines.push(
        `• ${row.name || 'Мастер'}: ${formatRubFromKopecks(row.accrued?.amount_kopecks)}`,
      );
    }
    const accrued = Number(
      input.finance?.payroll?.accrued_total?.amount_kopecks || 0,
    );
    if (accrued > 0) {
      lines.push(`Итого начислено: ${formatRubFromKopecks(accrued)}`);
    }
    lines.push('');
  }

  lines.push('Оплаты за день:');
  if (cash > 0 || card > 0) {
    lines.push(`💵 Наличные — ${formatRubFromKopecks(cash)}`);
    lines.push(`💳 Карта — ${formatRubFromKopecks(card)}`);
  } else if (revenueTotal > 0) {
    lines.push(`Выручка по кассе — ${formatRubFromKopecks(revenueTotal)}`);
  } else {
    lines.push('Подтверждённая касса за день пока пустая или недоступна.');
  }
  if (revenueTotal > 0) {
    lines.push(`Выручка за день: ${formatRubFromKopecks(revenueTotal)}`);
  }
  lines.push(`Записей за день: ${visits}`);
  lines.push(
    '',
    'Сообщение сохранено в чате MAYA и не исчезнет после закрытия приложения.',
  );

  return {
    title: `Отчёт за ${day}`,
    bodyText: lines.join('\n'),
    payload: {
      kind: 'daily_report',
      local_date: input.localDate,
      visits,
      revenue_total_kopecks: revenueTotal,
      cash_kopecks: cash,
      card_kopecks: card,
    },
  };
}
