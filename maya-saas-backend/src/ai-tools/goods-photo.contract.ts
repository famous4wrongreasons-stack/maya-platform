import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import {
  GOODS_PROPOSAL_KEYS,
  goodsProposal,
} from '../crm/goods-receipt.contract';
import { goodsId, type GoodsItemRead } from '../crm/yclients-goods-read';
import {
  goodsSearchQuery,
  type GoodsSearchRead,
} from '../crm/yclients-goods-search';

export type GoodsPhotoRequest = {
  requestId: string;
  conversationId?: string;
  source_revision: string;
};
export type GoodsPhotoReview = GoodsPhotoRequest & {
  proposal: Record<string, unknown>;
};
export const goodsPhotoRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Closed transport input. No caller-supplied authority, source revision or widget. */
export function goodsPhotoRequest(
  value: unknown,
  field: 'query' | 'goods_id' | 'proposal',
): GoodsPhotoRequest & Record<string, unknown> {
  const body = goodsPhotoRecord(value);
  if (
    Object.keys(body).some(
      (key) =>
        !['requestId', 'conversationId', 'source_revision', field].includes(
          key,
        ),
    ) ||
    typeof body.requestId !== 'string' ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(body.requestId) ||
    typeof body.source_revision !== 'string' ||
    !/^[a-f0-9]{64}$/.test(body.source_revision) ||
    (body.conversationId !== undefined &&
      (typeof body.conversationId !== 'string' || !isUUID(body.conversationId)))
  )
    throw new BadRequestException('goods_photo_request_invalid');
  let input: unknown;
  if (field === 'query') input = goodsSearchQuery(body.query);
  else if (field === 'goods_id') {
    try {
      input = goodsId(body.goods_id);
    } catch {
      throw new BadRequestException('goods_photo_item_invalid');
    }
  } else {
    const proposal = goodsPhotoRecord(body.proposal);
    if (
      Object.keys(proposal).some(
        (key) => !GOODS_PROPOSAL_KEYS.includes(key as never),
      )
    )
      throw new BadRequestException('goods_photo_proposal_field_invalid');
    input = goodsProposal(body.proposal);
  }
  return {
    requestId: body.requestId,
    ...(body.conversationId === undefined
      ? {}
      : { conversationId: body.conversationId }),
    source_revision: body.source_revision,
    [field]: input,
  };
}

function unavailable(): never {
  throw new ServiceUnavailableException(
    'goods_photo_source_projection_unavailable',
  );
}
function text(value: unknown, max = 512): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value)
  )
    unavailable();
  return value;
}
function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}
function id(value: unknown): string {
  if (typeof value !== 'string') unavailable();
  try {
    return goodsId(value);
  } catch {
    unavailable();
  }
}
function nullableId(value: unknown): string | null {
  return value === null ? null : id(value);
}
function decimal(value: unknown, negative = false): string {
  if (
    typeof value !== 'string' ||
    !(
      negative
        ? /^-?(0|[1-9]\d{0,11})(\.\d{1,6})?$/
        : /^(0|[1-9]\d{0,11})(\.\d{1,6})?$/
    ).test(value)
  )
    unavailable();
  return value;
}
function nullableDecimal(value: unknown): string | null {
  return value === null ? null : decimal(value);
}
function limits(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 20) unavailable();
  return value.map((v: unknown) => text(v, 128));
}
function instant(value: unknown): string {
  const valueText = text(value, 40);
  if (!Number.isFinite(Date.parse(valueText))) unavailable();
  return valueText;
}
function completed(value: unknown): Record<string, unknown> {
  const output = goodsPhotoRecord(value);
  if (output.status !== 'completed' || output.stale === true) unavailable();
  return goodsPhotoRecord(output.result);
}

/** Bounded owner data only. Runtime receipts, approval IDs and extra source fields stay internal. */
export function goodsPhotoSearchResult(
  value: unknown,
  query: string,
): GoodsSearchRead {
  const result = completed(value);
  if (
    result.contract !== 'maya.goods-search.read/1' ||
    result.source !== 'external_crm' ||
    result.scope !== 'bounded_goods_and_categories_search' ||
    result.query !== query ||
    result.limit !== 20 ||
    result.exhaustive !== false ||
    typeof result.may_have_more !== 'boolean' ||
    !Array.isArray(result.rows) ||
    result.rows.length > 20
  )
    unavailable();
  const seen = new Set<string>();
  const rows = result.rows.map(
    (value: unknown): GoodsSearchRead['rows'][number] => {
      const row = goodsPhotoRecord(value);
      if (row.kind !== 'item' && row.kind !== 'category') unavailable();
      const exactId = id(row.id),
        key = `${row.kind}:${exactId}`;
      if (seen.has(key)) unavailable();
      seen.add(key);
      return { kind: row.kind, id: exactId, title: text(row.title) };
    },
  );
  return {
    contract: 'maya.goods-search.read/1',
    source: 'external_crm',
    scope: 'bounded_goods_and_categories_search',
    as_of: instant(result.as_of),
    company_id: id(result.company_id),
    query,
    limit: 20,
    may_have_more: result.may_have_more,
    exhaustive: false,
    rows,
    limitations: limits(result.limitations),
  };
}

export function goodsPhotoItemResult(
  value: unknown,
  expectedId: string,
): GoodsItemRead {
  const result = completed(value),
    item = goodsPhotoRecord(result.item),
    stock = goodsPhotoRecord(result.stock);
  if (
    result.contract !== 'maya.goods-item.read/2' ||
    result.source !== 'external_crm' ||
    result.scope !== 'single_catalog_item' ||
    item.id !== expectedId ||
    !['physical', 'loyalty', 'unknown'].includes(String(result.item_kind)) ||
    !['observed', 'unavailable'].includes(String(stock.status)) ||
    stock.unit_basis !== 'not_provided' ||
    stock.exhaustive !== false ||
    !Array.isArray(stock.rows) ||
    stock.rows.length > 20 ||
    (stock.status === 'unavailable' && stock.rows.length !== 0) ||
    !(
      (result.currency === null && result.currency_source === 'unknown') ||
      (typeof result.currency === 'string' &&
        /^[A-Z]{3}$/.test(result.currency) &&
        result.currency_source === 'tenant_setting')
    )
  )
    unavailable();
  const seen = new Set<string>();
  const rows = stock.rows.map((value: unknown) => {
    const row = goodsPhotoRecord(value),
      store = id(row.store_id);
    if (seen.has(store)) unavailable();
    seen.add(store);
    return { store_id: store, quantity: decimal(row.quantity, true) };
  });
  return {
    contract: 'maya.goods-item.read/2',
    source: 'external_crm',
    scope: 'single_catalog_item',
    as_of: instant(result.as_of),
    company_id: id(result.company_id),
    currency: result.currency,
    currency_source: result.currency_source,
    item: {
      id: id(item.id),
      name: text(item.name),
      article: nullableText(item.article),
      barcode: nullableText(item.barcode),
      sale_price: nullableDecimal(item.sale_price),
      cost_price: nullableDecimal(item.cost_price),
      unit_cost_price: nullableDecimal(item.unit_cost_price),
      sale_unit_id: nullableId(item.sale_unit_id),
      write_off_unit_id: nullableId(item.write_off_unit_id),
      sale_unit_label: nullableText(item.sale_unit_label),
      write_off_unit_label: nullableText(item.write_off_unit_label),
      unit_ratio: nullableDecimal(item.unit_ratio),
    },
    item_kind: result.item_kind as GoodsItemRead['item_kind'],
    stock: {
      status: stock.status as GoodsItemRead['stock']['status'],
      rows,
      unit_basis: 'not_provided',
      exhaustive: false,
    },
    limitations: limits(result.limitations),
  };
}
