import { sourceInstantText } from '../common/source-instant-text';

type Reply = { reply: string; status: 'verified' | 'blocked' };
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const topics: Record<string, string> = {
  service_quality: 'качество услуги',
  staff: 'работа мастера',
  wait: 'ожидание',
  booking: 'запись',
  cleanliness: 'чистота',
  atmosphere: 'атмосфера',
  price: 'цена',
  location: 'расположение',
  communication: 'общение',
  result: 'результат',
};
function instant(value: unknown): string | null {
  if (value instanceof Date)
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)
  )
    return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z')
    ? date.toISOString()
    : null;
}
const rating = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= 5;
const blocked = (): Reply => ({
  reply:
    'Не удалось подтвердить доступную выборку отзывов и её границы. Это не доказывает отсутствие отзывов или настройки реестра.',
  status: 'blocked',
});

/** Existing authorized reviews.list.read output only. No query/configuration,
 * sentiment inference, original text, identities or new review source. */
export function reviewsReply(value: unknown, stale = false): Reply {
  const data = object(value),
    scope = object(data?.read_scope);
  if (
    stale ||
    data?.stale === true ||
    !data ||
    !scope ||
    scope.contract !== 'maya.review-registry-query/1' ||
    scope.configuration_status !== 'not_observed' ||
    scope.order !== 'occurred_at_desc' ||
    (scope.scope !== 'tenant' && scope.scope !== 'one_branch') ||
    scope.to_exclusive !== null ||
    data.privacy !== 'review_text_redacted_from_ai' ||
    (data.source !== 'tenant_review_registry' &&
      data.source !== 'not_configured') ||
    !Array.isArray(data.reviews) ||
    typeof scope.limit !== 'number' ||
    !Number.isInteger(scope.limit) ||
    scope.limit < 1 ||
    scope.limit > 50 ||
    data.reviews.length > scope.limit ||
    data.count !== data.reviews.length ||
    scope.returned_count !== data.reviews.length ||
    scope.limit_reached !== (data.reviews.length === scope.limit) ||
    (scope.rating_exact !== null && !rating(scope.rating_exact))
  )
    return blocked();
  const from =
    scope.from_inclusive === null ? null : instant(scope.from_inclusive);
  if (scope.from_inclusive !== null && !from) return blocked();
  const rows: Array<{ at: string; rating: number; topics: string[] }> = [];
  for (const raw of data.reviews) {
    const row = object(raw),
      at = instant(row?.occurred_at);
    if (
      !row ||
      !at ||
      !rating(row.rating) ||
      !Array.isArray(row.topics) ||
      row.topics.length > 10 ||
      row.topics.some(
        (topic) => typeof topic !== 'string' || !Object.hasOwn(topics, topic),
      ) ||
      (scope.rating_exact !== null && row.rating !== scope.rating_exact) ||
      (from && at < from) ||
      (rows.length && at > rows[rows.length - 1].at)
    )
      return blocked();
    rows.push({
      at,
      rating: row.rating,
      topics: [...new Set(row.topics as string[])],
    });
  }
  const lines = [
    scope.scope === 'one_branch'
      ? 'Прочитана выборка локального реестра в доступном филиале.'
      : 'Прочитана выборка локального реестра по бизнесу.',
    from
      ? `Временной фильтр: начиная с ${sourceInstantText(from)} (UTC); верхняя граница не задана.`
      : 'Нижняя и верхняя временные границы не заданы.',
    scope.rating_exact === null
      ? 'Фильтр по оценке не задан.'
      : `Фильтр: ровно ${scope.rating_exact} из 5.`,
    `Порядок: от новых к старым. Лимит чтения: ${scope.limit}.`,
    rows.length
      ? `Получено отзывов: ${rows.length}.`
      : 'По выполненным фильтрам отзывы не найдены. Это не доказывает отсутствие настройки реестра.',
    ...rows
      .slice(0, 5)
      .map(
        (row) =>
          `${sourceInstantText(row.at)} (UTC) — оценка ${row.rating} из 5${row.topics.length ? `; темы: ${row.topics.map((topic) => topics[topic]).join(', ')}` : ''}.`,
      ),
    ...(rows.length > 5 ? ['Показаны первые пять полученных отзывов.'] : []),
    ...(scope.limit_reached
      ? ['Лимит чтения достигнут; наличие остальных отзывов не проверено.']
      : []),
    'Точный календарный период и полный набор низких оценок этой выборкой не подтверждены.',
  ];
  return { reply: lines.join('\n'), status: 'verified' };
}
