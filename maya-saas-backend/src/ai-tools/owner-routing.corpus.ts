/**
 * Корпус владельца барбершопа: живая фраза → инструмент + окно.
 *
 * Цель этапа A: ≥40 формулировок в CI. Новый прод-косяк = новая строка сюда.
 * now корпуса: 2026-08-07T09:00:00.000Z (как routing-regression).
 */

export type OwnerRoutingCase = {
  id: string;
  text: string;
  previous?: string;
  /** Инструменты в порядке вызова (обычно один preload). */
  tools: string[];
  /** Частичное совпадение аргументов предзагрузки. */
  arguments?: Record<string, unknown>;
  notTools?: string[];
  domain?: string;
};

export const OWNER_ROUTING_CORPUS: OwnerRoutingCase[] = [
  // —— советы / диагностика ——
  {
    id: 'advise-return-clients',
    text: 'Посоветуй как вернуть клиентов',
    tools: ['analytics.business.query'],
    notTools: ['customers.count'],
    arguments: { comparison: 'previous_period' },
  },
  {
    id: 'who-in-drawdown',
    text: 'Кто из мастеров больше всего в просадке',
    tools: ['analytics.business.query'],
    notTools: ['catalog.staff.read'],
  },
  {
    id: 'why-drawdown-yoy',
    text: 'Ответь почему у нас просадка, сравни с прошлым годом',
    tools: ['analytics.business.query'],
    arguments: {
      period: 'year_to_date',
      comparison: 'previous_year_same_period',
    },
  },
  {
    id: 'what-to-do-load',
    text: 'Загруз упал, что делать',
    tools: ['analytics.business.query'],
    arguments: { comparison: 'previous_period' },
  },

  // —— сегодня / сравнения ——
  {
    id: 'records-today',
    text: 'Сколько записей сегодня?',
    tools: ['analytics.business.query'],
    arguments: { period: 'today', comparison: 'none' },
  },
  {
    id: 'cash-today-slang',
    text: 'Че по кассе сегодня',
    tools: ['analytics.business.query'],
    arguments: { period: 'today' },
  },
  {
    id: 'compare-today-vs-last-week',
    text: 'Сравни сегодня с прошлой неделей',
    tools: ['analytics.business.query'],
    arguments: { period: 'today', comparison: 'previous_period' },
  },
  {
    id: 'how-we-doing-today',
    text: 'Как мы сегодня вообще',
    tools: ['analytics.business.query'],
    arguments: { period: 'today' },
  },

  // —— день / диапазон (главный скрин) ——
  {
    id: 'report-aug-7',
    text: 'Дай отчет за 7 августа',
    tools: ['analytics.business.query'],
    arguments: { period: 'named_day', day: '2026-08-07' },
  },
  {
    id: 'only-aug-7',
    text: 'Я прошу только за 7 августа',
    tools: ['analytics.business.query'],
    arguments: { period: 'named_day', day: '2026-08-07' },
  },
  {
    id: 'followup-day-7',
    text: 'А за 7',
    previous: 'Сколько записей сегодня?',
    tools: ['analytics.business.query'],
    arguments: { period: 'named_day', day: '2026-08-07' },
  },
  {
    id: 'cash-dotted-day',
    text: 'Касса за 07.08',
    tools: ['analytics.business.query'],
    arguments: { period: 'named_day', day: '2026-08-07' },
  },
  {
    id: 'range-1-7',
    text: 'Сводку с 1 по 7 августа',
    tools: ['analytics.business.query'],
    arguments: {
      period: 'named_range',
      from_day: '2026-08-01',
      to_day: '2026-08-07',
    },
  },
  {
    id: 'first-week-august',
    text: 'За первую неделю августа что по деньгам',
    tools: ['analytics.business.query'],
    arguments: {
      period: 'named_range',
      from_day: '2026-08-01',
      to_day: '2026-08-07',
    },
  },
  {
    id: 'yesterday-cash',
    text: 'Что по кассе вчера',
    tools: ['analytics.business.query'],
    arguments: { period: 'yesterday' },
  },
  {
    id: 'last-week',
    text: 'Что было на прошлой неделе',
    tools: ['analytics.business.query'],
    arguments: { period: 'last_week' },
  },
  {
    id: 'last-7-days',
    text: 'Динамика за последние 7 дней',
    tools: ['analytics.business.query'],
    arguments: { period: 'last_7_days' },
  },

  // —— прибыль / экономика ——
  {
    id: 'profit-july',
    text: 'Какая была прибыль в июле',
    tools: ['analytics.business.profit'],
    arguments: { period: 'named_month', month: '2026-07' },
  },
  {
    id: 'profit-august-followup',
    text: 'А прибыль в августе?',
    previous: 'Какая была прибыль в июле',
    tools: ['analytics.business.profit'],
    arguments: { period: 'named_month', month: '2026-08' },
  },
  {
    id: 'net-july',
    text: 'Сколько чистыми вышло в июле',
    tools: ['analytics.business.profit'],
    arguments: { period: 'named_month', month: '2026-07' },
  },
  {
    id: 'am-i-in-plus',
    text: 'Я в плюсе?',
    tools: ['analytics.business.profit'],
  },
  {
    id: 'acquisition-cost',
    text: 'Сколько стоит привести нового клиента',
    tools: ['analytics.business.profit'],
    notTools: ['catalog.services.read'],
  },
  {
    id: 'acquisition-cost-alt',
    text: 'Во сколько мне обходится новый клиент',
    tools: ['analytics.business.profit'],
    notTools: ['catalog.services.read'],
  },
  {
    id: 'client-price-economy',
    text: 'Цена клиента какая',
    tools: ['analytics.business.profit'],
    notTools: ['catalog.services.read'],
  },

  // —— прайс vs экономика ——
  {
    id: 'haircut-price',
    text: 'Сколько стоит стрижка',
    tools: ['catalog.services.read'],
    domain: 'service_catalog',
  },
  {
    id: 'beard-price',
    text: 'Сколько стоит борода',
    tools: ['catalog.services.read'],
    domain: 'service_catalog',
  },
  {
    id: 'price-list',
    text: 'Какой у нас прайс',
    tools: ['catalog.services.read'],
    domain: 'service_catalog',
  },

  // —— расходы ——
  {
    id: 'spend-structure',
    text: 'На что больше всего тратим',
    tools: ['expenses.read'],
    domain: 'business_expenses',
  },
  {
    id: 'consumables-spend',
    text: 'Сколько ушло на расходники',
    tools: ['expenses.read'],
    domain: 'business_expenses',
  },
  {
    id: 'where-money-goes',
    text: 'Куда уходят деньги',
    tools: ['expenses.read'],
    domain: 'business_expenses',
  },

  // —— барберы / загруз / записи ——
  {
    id: 'who-are-barbers-named',
    text: 'Кто из барберов сегодня загружен',
    tools: ['analytics.business.query'],
    arguments: { period: 'today' },
  },
  {
    id: 'load-how',
    text: 'Какой загруз за неделю',
    tools: ['analytics.business.query'],
    arguments: { period: 'week_to_date' },
  },
  {
    id: 'cancellations',
    text: 'Сколько отмен сегодня',
    tools: ['analytics.business.query'],
    arguments: { period: 'today' },
  },
  {
    id: 'average-check',
    text: 'Какой средний чек в июле',
    tools: ['analytics.business.query'],
    arguments: { period: 'named_month', month: '2026-07' },
    notTools: ['catalog.services.read'],
  },
  {
    id: 'haircut-not-ticket',
    text: 'Сколько у нас стоит мужская стрижка по прайсу',
    tools: ['catalog.services.read'],
    domain: 'service_catalog',
    notTools: ['analytics.business.query', 'analytics.business.profit'],
  },
  {
    id: 'today-records-not-month-cash',
    text: 'Сколько записей сегодня',
    tools: ['analytics.business.query'],
    arguments: { period: 'today' },
    notTools: ['analytics.business.profit'],
  },
  {
    id: 'revenue-july',
    text: 'Сколько подняли в июле',
    tools: ['analytics.business.query'],
    arguments: { period: 'named_month', month: '2026-07' },
  },
  {
    id: 'money-slang',
    text: 'Че по бабкам за август',
    tools: ['analytics.business.query'],
    arguments: { period: 'named_month', month: '2026-08' },
  },

  // —— follow-up без дня ——
  {
    id: 'inherit-today-records',
    text: 'А по записям?',
    previous: 'Сколько выручки сегодня?',
    tools: ['analytics.business.query'],
    arguments: { period: 'today' },
  },
  {
    id: 'followup-day-after-month',
    text: 'А за 7?',
    previous: 'Сколько выручки в августе',
    tools: ['analytics.business.query'],
    arguments: { period: 'named_day', day: '2026-08-07' },
  },
  {
    id: 'new-vs-returning',
    text: 'Сколько новых и вернувшихся за 7 августа',
    tools: ['analytics.business.query'],
    arguments: { period: 'named_day', day: '2026-08-07' },
  },
  {
    id: 'staff-breakdown-ask',
    text: 'Разбей вчера по мастерам',
    tools: ['analytics.business.query'],
    arguments: { period: 'yesterday' },
  },
  {
    id: 'month-to-date-default',
    text: 'Что по деньгам',
    tools: ['analytics.business.query'],
    arguments: { period: 'month_to_date' },
  },
  {
    id: 'full-customer-database',
    text: 'Сколько всего клиентов в нашей базе за всё время?',
    tools: ['customers.count'],
    notTools: ['analytics.business.query'],
    domain: 'customer_count',
  },
  {
    id: 'full-customer-database-people-slang',
    text: 'Сколько всего людей в базе YClients',
    tools: ['customers.count'],
    notTools: ['analytics.business.query'],
    domain: 'customer_count',
  },
  {
    id: 'full-customer-database-followup',
    text: 'Всего за всё время',
    previous: 'Сколько клиентов в нашей базе за этот месяц?',
    tools: ['customers.count'],
    notTools: ['analytics.business.query'],
    domain: 'customer_count',
  },
  {
    id: 'period-customer-count-stays-analytics',
    text: 'Сколько клиентов в нашей базе за этот месяц?',
    tools: ['analytics.business.query'],
    notTools: ['customers.count'],
    arguments: { period: 'month_to_date' },
  },
  {
    id: 'salary-by-master',
    text: 'Сколько заработал каждый мастер за текущий месяц?',
    tools: ['analytics.business.query'],
    arguments: { period: 'month_to_date' },
  },
  {
    id: 'confirmed-revenue-by-master',
    text: 'Скажи, кто сколько принёс в кассу за месяц',
    tools: ['analytics.business.query'],
    arguments: { period: 'month_to_date' },
  },
];
