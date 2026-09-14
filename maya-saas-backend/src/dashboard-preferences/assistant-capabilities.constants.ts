export const ASSISTANT_CAPABILITIES = [
  'daily_brief',
  'business_analytics',
  'finance_analytics',
  'staff_performance',
  'client_return',
  'weekly_expense_reminders',
] as const;

export type AssistantCapability = (typeof ASSISTANT_CAPABILITIES)[number];

export const DEFAULT_ASSISTANT_CAPABILITIES: AssistantCapability[] = [
  'daily_brief',
  'business_analytics',
];

export const ASSISTANT_CAPABILITY_CATALOG: ReadonlyArray<{
  key: AssistantCapability;
  title: string;
  description: string;
}> = [
  {
    key: 'weekly_expense_reminders',
    title: 'Напоминания о расходах',
    description:
      'По воскресеньям в Telegram. Каждый расход записывается только после подтверждения отдельной карточки.',
  },
  {
    key: 'daily_brief',
    title: 'План и сводка дня',
    description: 'Загрузка, свободные окна и основные задачи на сегодня.',
  },
  {
    key: 'business_analytics',
    title: 'Аналитика бизнеса',
    description: 'Выручка, визиты, средний чек и динамика бизнеса.',
  },
  {
    key: 'finance_analytics',
    title: 'Финансовый анализ',
    description: 'Кассы, способы оплаты, начисления и финансовые срезы CRM.',
  },
  {
    key: 'staff_performance',
    title: 'Эффективность команды',
    description: 'Результаты мастеров и исполнение персональных планов.',
  },
  {
    key: 'client_return',
    title: 'Возврат клиентов',
    description: 'Клиенты с просроченным циклом и безопасные рекомендации.',
  },
];
