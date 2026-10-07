import { goodsDecimal } from '../crm/yclients-goods-read';

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const label = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() && value.length <= 512
    ? value.replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, ' ').trim()
    : null;

/** Source-only response: no item names, invoice fields or quantities go to a final model turn. */
export function goodsReadReply(
  value: unknown,
  stale = false,
): { reply: string; status: 'verified' | 'blocked' } {
  const data = record(value),
    item = record(data.item);
  if (
    stale ||
    data.stale === true ||
    data.contract !== 'maya.goods-item.read/2' ||
    !label(item.name)
  )
    return {
      reply:
        'Актуальные сведения о товаре не подтверждены. Это не означает нулевой остаток.',
      status: 'blocked',
    };
  const currency =
    typeof data.currency === 'string' && /^[A-Z]{3}$/.test(data.currency)
      ? data.currency
      : null;
  const money = (v: unknown) =>
    goodsDecimal(v) === null
      ? 'не указана'
      : `${goodsDecimal(v)}${currency ? ` ${currency}` : ' (валюта не подтверждена)'}`;
  const lines = [
    `Товар в YCLIENTS: ${label(item.name)}.`,
    `Продажная цена: ${money(item.sale_price)}.`,
    `Себестоимость: ${money(item.cost_price)}; себестоимость единицы: ${money(item.unit_cost_price)}.`,
    `Единица продажи: ${label(item.sale_unit_label) ?? 'не указана'}; единица списания: ${label(item.write_off_unit_label) ?? 'не указана'}.`,
    `Соотношение единиц в каталоге: ${goodsDecimal(item.unit_ratio) ?? 'не подтверждено'}.`,
  ];
  const stock = record(data.stock);
  if (stock.status === 'observed' && Array.isArray(stock.rows)) {
    const rows = stock.rows
      .slice(0, 20)
      .map(record)
      .filter(
        (r) =>
          /^[1-9]\d{0,14}$/.test(String(r.store_id)) &&
          /^-?(0|[1-9]\d{0,11})(\.\d{1,6})?$/.test(String(r.quantity)),
      );
    lines.push(
      rows.length
        ? 'Количество по складам, полученное из CRM:\n' +
            rows
              .map((r) => `Склад ${String(r.store_id)}: ${String(r.quantity)}`)
              .join('\n')
        : 'В ответе CRM нет строк остатков по складам.',
    );
  } else lines.push('Остатки по складам не подтверждены.');
  lines.push(
    'Единица этих остатков в ответе не указана; пересчёт и количество нового прихода по ним не определяются.',
  );
  if (data.item_kind !== 'physical')
    lines.push(
      'Принадлежность позиции к физическим товарам не подтверждена: приход пока недоступен.',
    );
  return { reply: lines.join('\n\n'), status: 'verified' };
}
