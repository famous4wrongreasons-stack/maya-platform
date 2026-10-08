const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const label = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() && value.length <= 512
    ? value.replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, ' ').trim()
    : null;

/** Observed search results only. Categories never become item selection,
 * prices or inventory; the reply terminates before another model turn. */
export function goodsSearchReply(
  value: unknown,
  stale = false,
): { reply: string; status: 'verified' | 'blocked' } {
  const data = record(value);
  const blocked = {
    reply:
      'Актуальные результаты поиска товаров не подтверждены. Повторите поиск по названию, артикулу или штрихкоду.',
    status: 'blocked' as const,
  };
  if (
    stale ||
    data.stale === true ||
    data.contract !== 'maya.goods-search.read/1' ||
    data.source !== 'external_crm' ||
    data.scope !== 'bounded_goods_and_categories_search' ||
    data.limit !== 20 ||
    data.exhaustive !== false ||
    typeof data.may_have_more !== 'boolean' ||
    typeof data.query !== 'string' ||
    data.query.trim().length < 2 ||
    data.query.length > 100 ||
    /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(data.query) ||
    typeof data.as_of !== 'string' ||
    !Number.isFinite(Date.parse(data.as_of)) ||
    !/^[1-9]\d{0,14}$/.test(String(data.company_id)) ||
    !Array.isArray(data.rows) ||
    data.rows.length > 20 ||
    (data.may_have_more && data.rows.length !== 20)
  )
    return blocked;
  const rows = data.rows.map(record);
  if (
    rows.some(
      (row) =>
        !['item', 'category'].includes(String(row.kind)) ||
        !/^[1-9]\d{0,14}$/.test(String(row.id)) ||
        !label(row.title),
    ) ||
    new Set(rows.map((row) => `${String(row.kind)}:${String(row.id)}`)).size !==
      rows.length
  )
    return blocked;
  const shortTitle = (row: Record<string, unknown>) => {
    const title = label(row.title)!;
    return title.length > 160 ? title.slice(0, 159) + '…' : title;
  };
  const items = rows.filter((row) => row.kind === 'item');
  const categories = rows.filter((row) => row.kind === 'category');
  const parts = ['Результаты поиска в YCLIENTS:'];
  if (items.length)
    parts.push(
      items
        .map((row) => `Товар №${String(row.id)}: ${shortTitle(row)}`)
        .join('\n'),
    );
  if (categories.length)
    parts.push(
      'Категории:\n' +
        categories.map((row) => `• ${shortTitle(row)}`).join('\n'),
    );
  if (!rows.length) parts.push('CRM не вернула совпадений по этому запросу.');
  else if (!items.length)
    parts.push(
      'В этом ответе есть категории, но нет карточек товаров. Уточните название, артикул или штрихкод.',
    );
  if (data.may_have_more)
    parts.push(
      'Показаны первые 20 совпадений; уточните запрос, чтобы сузить поиск.',
    );
  parts.push(
    'Поиск ограничен, категории возвращаются первыми. Это не полный каталог; отсутствие товара в этом ответе не подтверждает его отсутствие в YCLIENTS.',
  );
  if (items.length)
    parts.push(
      'Для цен и остатков укажите номер нужного товара из списка. Товар ещё не выбран.',
    );
  return { reply: parts.join('\n\n'), status: 'verified' };
}
