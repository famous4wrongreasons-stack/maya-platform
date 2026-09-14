import type {
  ConversationDomain,
  ConversationLanguageContract,
  ConversationNumberNormalizationRule,
  ConversationTemporalNormalizationRule,
} from './conversation-intelligence.types';

/**
 * Language hints improve semantic planning and evaluation. They are not a
 * command router: no phrase in this file directly selects a tool or grants a
 * permission.
 */
export const MAYA_DOMAIN_TERMS: Record<ConversationDomain, readonly string[]> =
  {
    booking: ['запись', 'визит', 'бронь', 'окно', 'слот', 'приём'],
    schedule: ['расписание', 'график', 'смена', 'выходной', 'рабочий день'],
    clients: ['клиент', 'гость', 'посетитель', 'покупатель', 'база клиентов'],
    employees: ['мастер', 'сотрудник', 'специалист', 'барбер', 'команда'],
    services: ['услуга', 'процедура', 'стрижка', 'комплекс', 'прайс'],
    finance: ['выручка', 'оборот', 'касса', 'прибыль', 'расходы', 'деньги'],
    payments: ['оплата', 'наличные', 'карта', 'возврат денег', 'эквайринг'],
    sales: ['продажи', 'продано', 'чек', 'покупки', 'допродажа'],
    products: ['товар', 'косметика', 'продукция', 'розница', 'домашний уход'],
    inventory: ['склад', 'остатки', 'запасы', 'расходники', 'закупка'],
    analytics: ['аналитика', 'сводка', 'динамика', 'показатели', 'срез'],
    kpi: ['план', 'KPI', 'цель', 'выполнение', 'результат'],
    retention: ['возвращаемость', 'удержание', 'повторные', 'цикл визитов'],
    churn: ['отток', 'пропавшие', 'уснувшие', 'потерянные', 'уходящие'],
    marketing: ['маркетинг', 'акция', 'аудитория', 'предложение', 'кампания'],
    messaging: ['рассылка', 'сообщение', 'текст', 'отправка', 'получатели'],
    reviews: ['отзывы', 'оценка', 'рейтинг', 'жалобы', 'обратная связь'],
    loyalty: ['лояльность', 'кэшбэк', 'карта гостя', 'постоянный клиент'],
    bonuses: ['баллы', 'бонусы', 'списание', 'начисление', 'баланс'],
    certificates: ['сертификат', 'номинал', 'подарочная карта'],
    subscriptions: ['абонемент', 'пакет визитов', 'подписка клиента'],
    referrals: ['реферал', 'друг', 'приглашение', 'рекомендация'],
    branches: ['филиал', 'точка', 'локация', 'салон', 'подразделение'],
    company: ['бизнес', 'компания', 'салон', 'адрес', 'контакты'],
    settings: ['настройки', 'параметры', 'модуль', 'функция', 'доступ'],
    notifications: ['уведомление', 'напоминание', 'оповещение', 'пуш'],
    tasks: ['задача', 'поручение', 'дело', 'дедлайн', 'приоритет'],
    reports: ['отчёт', 'брифинг', 'итоги', 'сводка', 'результат'],
    forecasting: ['прогноз', 'ожидаем', 'к концу месяца', 'будущая загрузка'],
    recommendations: ['совет', 'рекомендация', 'что делать', 'следующий шаг'],
    general_business_questions: [
      'объясни',
      'помоги подумать',
      'бизнес-вопрос',
      'идея',
    ],
    support: [
      'помощь',
      'поддержка',
      'не работает',
      'интеграция',
      'администратор',
    ],
    small_talk: ['привет', 'спасибо', 'как дела', 'поговорим', 'Майя'],
  };

export const MAYA_ENTITY_TERMS: Record<string, readonly string[]> = {
  employee: ['мастер', 'специалист', 'барбер', 'сотрудник', 'ребята'],
  client: ['клиент', 'гость', 'посетитель', 'постоянник', 'новичок'],
  service: ['услуга', 'процедура', 'комплекс', 'стрижка', 'уход'],
  branch: ['филиал', 'точка', 'салон', 'локация', 'подразделение'],
  product: ['товар', 'продукт', 'косметика', 'позиция', 'домашний уход'],
  appointment: ['запись', 'визит', 'бронь', 'приём', 'слот'],
  date: ['дата', 'день', 'число', 'когда'],
  time: ['время', 'час', 'утро', 'день', 'вечер'],
  period: ['период', 'неделя', 'месяц', 'квартал', 'год'],
  amount: ['сумма', 'рубли', 'деньги', 'оборот', 'стоимость'],
  percentage: ['процент', 'доля', 'конверсия', 'рост', 'падение'],
  appointment_status: ['ожидание', 'пришёл', 'отменён', 'неявка', 'завершён'],
  payment_method: ['наличные', 'карта', 'онлайн', 'сертификат', 'баллы'],
  audience: ['сегмент', 'аудитория', 'получатели', 'когорта', 'список'],
  metric: ['показатель', 'метрика', 'KPI', 'результат', 'динамика'],
};

export const MAYA_TEMPORAL_RULES: readonly ConversationTemporalNormalizationRule[] =
  [
    {
      canonical: 'today',
      examples: ['сегодня', 'за сегодня', 'сегодняшний день', 'на сегодня'],
      resolution: 'Business-local calendar day containing now.',
    },
    {
      canonical: 'tomorrow',
      examples: ['завтра', 'на завтра', 'завтрашний день'],
      resolution: 'Business-local day after today.',
    },
    {
      canonical: 'day_after_tomorrow',
      examples: ['послезавтра', 'через два дня'],
      resolution: 'Business-local day two calendar days after today.',
    },
    {
      canonical: 'yesterday',
      examples: ['вчера', 'за вчера', 'вчерашний день'],
      resolution: 'Business-local day before today.',
    },
    {
      canonical: 'day_before_yesterday',
      examples: ['позавчера', 'два дня назад'],
      resolution: 'Business-local day two calendar days before today.',
    },
    {
      canonical: 'this_week',
      examples: ['эта неделя', 'на этой неделе', 'с начала недели'],
      resolution:
        'Monday through now in the business timezone unless future context is explicit.',
    },
    {
      canonical: 'last_week',
      examples: ['прошлая неделя', 'предыдущая неделя', 'за прошлую неделю'],
      resolution:
        'Previous complete Monday-Sunday interval in the business timezone.',
    },
    {
      canonical: 'rolling_7_days',
      examples: ['за неделю', 'последние семь дней', 'за 7 дней'],
      resolution:
        'Rolling seven-day interval; do not silently replace with calendar week.',
    },
    {
      canonical: 'this_month',
      examples: ['этот месяц', 'в текущем месяце', 'с начала месяца'],
      resolution: 'First business-local day of the current month through now.',
    },
    {
      canonical: 'last_month',
      examples: ['прошлый месяц', 'предыдущий месяц', 'за прошлый месяц'],
      resolution: 'Previous complete business-local calendar month.',
    },
    {
      canonical: 'rolling_30_days',
      examples: [
        'последние 30 дней',
        'за тридцать дней',
        'месяц назад по сегодня',
      ],
      resolution:
        'Rolling thirty-day interval; do not silently replace with calendar month.',
    },
    {
      canonical: 'this_quarter',
      examples: ['этот квартал', 'с начала квартала', 'текущий квартал'],
      resolution: 'Current business-local calendar quarter through now.',
    },
    {
      canonical: 'year_to_date',
      examples: ['этот год', 'с начала года', 'за текущий год'],
      resolution: 'January 1 through now in the business timezone.',
    },
    {
      canonical: 'morning',
      examples: ['утром', 'с утра', 'до обеда'],
      resolution:
        'Use tenant opening hours and configured day-part boundaries.',
    },
    {
      canonical: 'afternoon',
      examples: ['днём', 'после обеда', 'во второй половине дня'],
      resolution: 'Use configured business-local day-part boundaries.',
    },
    {
      canonical: 'evening',
      examples: ['вечером', 'после шести', 'к закрытию', 'в конце дня'],
      resolution:
        'Resolve against tenant hours; preserve an explicit lower time bound.',
    },
    {
      canonical: 'weekend',
      examples: ['на выходных', 'в эти выходные', 'в субботу или воскресенье'],
      resolution:
        'Resolve using business calendar; never assume the business is closed.',
    },
    {
      canonical: 'named_weekday',
      examples: ['в пятницу', 'на понедельник', 'в ближайшую среду'],
      resolution:
        'Nearest non-past matching weekday unless dialogue context says otherwise.',
    },
    {
      canonical: 'next_named_weekday',
      examples: ['в следующую пятницу', 'на будущий понедельник'],
      resolution: 'Matching weekday in the following calendar week.',
    },
  ];

export const MAYA_NUMBER_RULES: readonly ConversationNumberNormalizationRule[] =
  [
    {
      kind: 'amount',
      examples: ['больше сотки', 'сотка плюс', 'за сто перевалили'],
      resolution:
        'Interpret сотка as 100,000 RUB only in financial context; otherwise clarify.',
    },
    {
      kind: 'amount',
      examples: ['около 200к', 'две сотни тысяч', 'тысяч двести'],
      resolution:
        'Approximate 200,000 in the currency selected by tenant context.',
    },
    {
      kind: 'amount',
      examples: ['полмиллиона', 'пол ляма', 'пятьсот тысяч'],
      resolution: '500,000 in financial context.',
    },
    {
      kind: 'amount',
      examples: ['тысяч 50', 'полтинник тысяч', 'где-то пятьдесят тысяч'],
      resolution: 'Approximate 50,000; preserve approximation.',
    },
    {
      kind: 'count',
      examples: ['больше десяти клиентов', 'десятка гостей', '10+ человек'],
      resolution: 'Count threshold greater than ten, never a currency amount.',
    },
    {
      kind: 'time',
      examples: ['часов в пять', 'к пяти', 'после семи'],
      resolution:
        'Business-local clock time; infer 17:00/19:00 only when opening hours disambiguate.',
    },
    {
      kind: 'duration',
      examples: ['пару дней', 'дня два', 'через пару дней'],
      resolution: 'Approximately two calendar days.',
    },
    {
      kind: 'duration',
      examples: ['несколько недель', 'недели три', 'пару-тройку недель'],
      resolution:
        'Range of two to four weeks; clarify when exact boundaries affect an action.',
    },
  ];

export const MAYA_NOISY_INPUT_RULES = [
  'Correct likely speech-to-text and keyboard errors semantically; never require exact spelling.',
  'Treat скока, скок and сколько as the same interrogative quantity when context agrees.',
  'Treat седня and сёдня as сегодня; прош мес as прошлый месяц.',
  'Treat акно as окно, вырчка as выручка, запиши мя as запиши меня.',
  'Mixed Russian and English business terms such as revenue, booking, staff and CRM retain their domain meaning.',
  'Punctuation, capitalization and filler words must not change intent.',
  'Do not repair a person, service or branch name by guessing; resolve it against tool data.',
] as const;

export const MAYA_ELLIPTICAL_FOLLOW_UPS = [
  'А завтра?',
  'А Максим?',
  'Почему?',
  'Сколько?',
  'Покажи',
  'Ещё',
  'А за месяц?',
  'А прошлый?',
  'Сравни',
  'Кто именно?',
  'А если без него?',
] as const;

export function mayaConversationLanguageContract(
  businessTimezone: string,
): ConversationLanguageContract {
  return {
    locale: 'ru-RU',
    business_timezone: businessTimezone,
    timezone_policy: `Resolve every relative date and clock value in ${businessTimezone}, the tenant timezone supplied by runtime; never use the model server timezone.`,
    domain_terms: MAYA_DOMAIN_TERMS,
    entity_terms: MAYA_ENTITY_TERMS,
    temporal_rules: MAYA_TEMPORAL_RULES,
    number_rules: MAYA_NUMBER_RULES,
    noisy_input_rules: MAYA_NOISY_INPUT_RULES,
    elliptical_follow_ups: MAYA_ELLIPTICAL_FOLLOW_UPS,
  };
}
