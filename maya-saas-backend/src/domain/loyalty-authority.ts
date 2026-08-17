/**
 * Кто владеет балансом лояльности.
 *
 * 🔴 Зачем это понадобилось. Словарь был на ДВА значения (`crm | maya`) при
 * ТРЁХ источниках, и баланс из чужого журнала помечался `maya` просто потому,
 * что третьего значения не существовало. Из этого следовало практическое:
 * подтверждение перед тратой включалось только для `crm`, то есть по чужому
 * кэшу Maya обещала клиенту списание без проверки.
 *
 * 🔴 Домен НЕ знает, как устроен внешний владелец. Ни localhost, ни SQLite, ни
 * Python здесь не упоминаются и упоминаться не должны: это детали транспорта,
 * они живут в реализации границы.
 */
export type LoyaltyAuthority =
  /** Собственный реестр Maya. Единственный случай, когда Maya — владелец. */
  | 'maya'
  /** Карта лояльности провайдера CRM. */
  | 'crm'
  /**
   * Внешний журнал операций, ведущий баланс салона сегодня.
   *
   * Имя временное и архитектурное: оно называет РОЛЬ, а не реализацию. Когда
   * владение переедет, исчезнет значение — не поменяется транспорт.
   */
  | 'legacy_bot';

export const LOYALTY_AUTHORITY_VALUES: readonly LoyaltyAuthority[] = [
  'maya',
  'crm',
  'legacy_bot',
];

/** Машинные коды расхождений и оговорок. */
export const LOYALTY_WARNING = {
  /** Известны два числа, и они разошлись. Победитель НЕ выбирается молча. */
  authorityDisagreement: 'loyalty_authority_and_external_source_disagree',
  /**
   * Провайдер вернул пустой список карт с кодом успеха. Это известная
   * неустойчивость, а не доказанный ноль.
   */
  emptyCardListNotProvenZero:
    'crm_returned_empty_card_list_which_is_not_a_proven_zero',
  /** Владелец недоступен, показано последнее известное значение. */
  servedFromCache: 'balance_served_from_cache_because_authority_is_unavailable',
} as const;

export interface LoyaltyWarning {
  code: string;
  /** Значение, замеченное у ДРУГОГО источника. Никогда не «побеждает». */
  observed_balance?: number;
  observed_authority?: LoyaltyAuthority;
}

/**
 * Можно ли обещать списание без проверки у владельца.
 *
 * 🔴 Правило владельца: автоматически доверять тратимому балансу можно только
 * при `authority = maya` И достаточной свежести. Для `crm` и `legacy_bot`
 * проверка обязательна — Maya не видит их журнал и не может обещать за них.
 *
 * Если проверка невозможна, гарантированное списание не обещается.
 */
export function loyaltyVerificationRequired(params: {
  authority: LoyaltyAuthority | null;
  stale: boolean;
  hasDisagreement?: boolean;
}): boolean {
  if (params.authority !== 'maya') return true;
  if (params.stale) return true;
  return params.hasDisagreement === true;
}

/** Владелец, чьё число берётся за основу при расхождении. */
export function resolveAuthoritativeBalance(params: {
  legacyBotBalance: number | null;
  crmBalance: number | null;
}): { authority: LoyaltyAuthority | null; balance: number | null } {
  // 🔴 Политика, а не случайность: журнал операций старше карты по
  // доказательности. Карта провайдера — историческое зерно: её остаток
  // импортируется в журнал ОДИН раз, а дальше списания её не уменьшают.
  // Поэтому при разногласии выигрывает журнал, а карта сохраняется как
  // наблюдённое значение.
  if (params.legacyBotBalance !== null) {
    return { authority: 'legacy_bot', balance: params.legacyBotBalance };
  }
  if (params.crmBalance !== null) {
    return { authority: 'crm', balance: params.crmBalance };
  }
  return { authority: null, balance: null };
}
