/** Request-local catalog facts for the existing CRM owner. No stock receipt,
 * OCR confidence, mutation authority or persistent document is created here. */
export interface GoodsItemRead {
  contract: 'maya.goods-item.read/1';
  source: 'external_crm';
  scope: 'single_catalog_item';
  as_of: string;
  company_id: string;
  currency: string | null;
  currency_source: 'tenant_setting' | 'unknown';
  item: {
    id: string;
    name: string;
    article: string | null;
    barcode: string | null;
    sale_price: string | null;
    cost_price: string | null;
    unit_cost_price: string | null;
    sale_unit_id: string | null;
    write_off_unit_id: string | null;
    sale_unit_label: string | null;
    write_off_unit_label: string | null;
    unit_ratio: string | null;
  };
  limitations: string[];
}

export function goodsId(value: unknown): string {
  if (
    !['string', 'number'].includes(typeof value) ||
    !/^[1-9]\d{0,14}$/.test(String(value))
  )
    throw new Error('goods_read_invalid_id');
  return String(value);
}
const optionalId = (value: unknown): string | null => {
  try {
    return goodsId(value);
  } catch {
    return null;
  }
};
function decimal(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value);
  // Exact decimal text; no currency/kopeck conversion or rounding. Exponent,
  // negative, locale-ambiguous and unbounded values are not observed amounts.
  return /^(0|[1-9]\d{0,11})(\.\d{1,6})?$/.test(raw) ? raw : null;
}
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 512
    ? value.trim()
    : null;

export function observedGoodsItem(
  rows: unknown,
  expectedId: string,
  companyId: string,
  configuredCurrency: unknown,
): GoodsItemRead {
  goodsId(expectedId);
  goodsId(companyId);
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    !rows[0] ||
    typeof rows[0] !== 'object' ||
    Array.isArray(rows[0])
  )
    throw new Error('goods_read_source_unavailable');
  const row = rows[0] as Record<string, unknown>;
  if (goodsId(row.good_id) !== expectedId || !text(row.title))
    throw new Error('goods_read_identity_unavailable');
  const currency =
    typeof configuredCurrency === 'string' &&
    /^[A-Z]{3}$/.test(configuredCurrency)
      ? configuredCurrency
      : null;
  const ratio = decimal(row.unit_equals);
  const item = {
    id: expectedId,
    name: text(row.title)!,
    article: text(row.article),
    barcode: text(row.barcode),
    sale_price: decimal(row.cost),
    cost_price: decimal(row.actual_cost),
    unit_cost_price: decimal(row.unit_actual_cost),
    sale_unit_id: optionalId(row.unit_id),
    write_off_unit_id: optionalId(row.service_unit_id),
    sale_unit_label: text(row.unit_short_title),
    write_off_unit_label: text(row.service_unit_short_title),
    unit_ratio: ratio !== null && Number(ratio) > 0 ? ratio : null,
  };
  return {
    contract: 'maya.goods-item.read/1',
    source: 'external_crm',
    scope: 'single_catalog_item',
    as_of: new Date().toISOString(),
    company_id: companyId,
    currency,
    currency_source: currency ? 'tenant_setting' : 'unknown',
    item,
    limitations: [
      'catalog_not_stock_balance_or_receipt',
      'no_mutation_authority',
      ...(!currency ? ['currency_not_configured'] : []),
      ...(Object.entries(item).some(
        ([key, value]) =>
          /price$|unit_id$|unit_ratio/.test(key) && value === null,
      )
        ? ['price_or_unit_facts_incomplete']
        : []),
    ],
  };
}
