/** Request-local catalog facts for the existing CRM owner. No stock receipt,
 * OCR confidence, mutation authority or persistent document is created here. */
export interface GoodsItemRead {
  contract: 'maya.goods-item.read/2';
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
  item_kind: 'physical' | 'loyalty' | 'unknown';
  stock: {
    status: 'observed' | 'unavailable';
    rows: { store_id: string; quantity: string }[];
    unit_basis: 'not_provided';
    exhaustive: false;
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
export function goodsDecimal(value: unknown): string | null {
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
  const ratio = goodsDecimal(row.unit_equals);
  const item = {
    id: expectedId,
    name: text(row.title)!,
    article: text(row.article),
    barcode: text(row.barcode),
    sale_price: goodsDecimal(row.cost),
    cost_price: goodsDecimal(row.actual_cost),
    unit_cost_price: goodsDecimal(row.unit_actual_cost),
    sale_unit_id: optionalId(row.unit_id),
    write_off_unit_id: optionalId(row.service_unit_id),
    sale_unit_label: text(row.unit_short_title),
    write_off_unit_label: text(row.service_unit_short_title),
    unit_ratio: ratio !== null && Number(ratio) > 0 ? ratio : null,
  };
  // The API documents per-store quantities but does not identify their unit
  // basis. Preserve the observed decimal without labelling it sale/write-off
  // units or treating it as a receipt delta.
  const amounts =
    Array.isArray(row.actual_amounts) && row.actual_amounts.length <= 20
      ? row.actual_amounts
      : null;
  const stockRows = amounts?.map((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    const a = value as Record<string, unknown>;
    const id = optionalId(a.storage_id);
    const raw =
      typeof a.amount === 'number' || typeof a.amount === 'string'
        ? String(a.amount)
        : '';
    const quantity = /^-?(0|[1-9]\d{0,11})(\.\d{1,6})?$/.test(raw) ? raw : null;
    return id && quantity !== null ? { store_id: id, quantity } : null;
  });
  const stockKnown =
    !!stockRows &&
    stockRows.every((v) => v !== null) &&
    new Set(stockRows.map((v) => v.store_id)).size === stockRows.length;
  const flags = [
    row.loyalty_abonement_type_id,
    row.loyalty_certificate_type_id,
  ];
  const itemKind = flags.every((v) => v === 0 || v === '0')
    ? 'physical'
    : flags.some(
          (v) =>
            (typeof v === 'number' && Number.isSafeInteger(v) && v > 0) ||
            (typeof v === 'string' && /^[1-9]\d*$/.test(v)),
        )
      ? 'loyalty'
      : 'unknown';
  return {
    contract: 'maya.goods-item.read/2',
    source: 'external_crm',
    scope: 'single_catalog_item',
    as_of: new Date().toISOString(),
    company_id: companyId,
    currency,
    currency_source: currency ? 'tenant_setting' : 'unknown',
    item,
    item_kind: itemKind,
    stock: {
      status: stockKnown ? 'observed' : 'unavailable',
      rows: stockKnown ? stockRows : [],
      unit_basis: 'not_provided',
      exhaustive: false,
    },
    limitations: [
      'stock_quantity_unit_not_provided',
      'catalog_not_stock_receipt',
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
