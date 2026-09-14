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

/**
 * Насколько сильно сказанное о владельце.
 *
 * 🔴 Зачем понадобилось. Поверхности выводили владельца ДВУМЯ разными
 * способами: карточка спрашивала владельца про конкретного человека, а список
 * клиентов считал его сам из колонки кэша. Совпадать они не обязаны, и это
 * читалось как противоречие Maya самой себе.
 *
 * Разница настоящая, и её надо называть, а не прятать: одно дело «мы сходили к
 * владельцу за этим клиентом», другое — «у арендатора настроен вот такой
 * владелец». Третье состояние — честное незнание.
 */
export type LoyaltyAuthorityScope =
  /** Владелец разрешён под конкретного человека: к нему действительно ходили. */
  | 'resolved'
  /** Владелец известен по настройке арендатора, но под клиента не разрешался. */
  | 'configured'
  /** Владелец неизвестен. Придумывать его нельзя. */
  | 'unknown';

/** Единый вид сведений о владельце для ЛЮБОЙ поверхности Maya. */
export interface LoyaltyAuthorityView {
  authority: LoyaltyAuthority | null;
  authority_scope: LoyaltyAuthorityScope;
  sync_status: string;
  stale: boolean;
  verification_required: boolean;
  warnings: LoyaltyWarning[];
}

/** Машинные статусы синхронизации, общие для всех поверхностей. */
export const LOYALTY_SYNC_STATUS = {
  /** Снимок кэша: показан без обращения к владельцу. */
  listSnapshot: 'list_snapshot',
  /** Владелец не ответил. */
  temporarilyUnavailable: 'temporarily_unavailable',
} as const;

/**
 * Снимок без обращения к владельцу — список клиентов, сводки, досье.
 *
 * Ходить к владельцу за каждой строкой означало бы N сетевых вызовов на
 * страницу. Поэтому мы честно говорим, что это снимок, и требуем проверки
 * перед тратой — но владельца НЕ выдумываем и второй формулой НЕ считаем.
 */
export function snapshotAuthorityView(
  configured: LoyaltyAuthority | null,
): LoyaltyAuthorityView {
  return {
    authority: configured,
    authority_scope: configured === null ? 'unknown' : 'configured',
    sync_status: LOYALTY_SYNC_STATUS.listSnapshot,
    stale: true,
    verification_required: true,
    warnings: [],
  };
}

/**
 * Владелец не ответил и неизвестен.
 *
 * 🔴 Здесь раньше подставлялся `crm`. Это была выдумка: при внутреннем
 * календаре владелец — `maya`, при включённом внешнем журнале — `legacy_bot`,
 * а при отказе границы не известно вообще ничего.
 */
export function unavailableAuthorityView(): LoyaltyAuthorityView {
  return {
    authority: null,
    authority_scope: 'unknown',
    sync_status: LOYALTY_SYNC_STATUS.temporarilyUnavailable,
    stale: true,
    verification_required: true,
    warnings: [],
  };
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
