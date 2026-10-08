import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { goodsId } from './yclients-goods-read';

export const GOODS_SEARCH_LIMIT = 20;
export const GOODS_SEARCH_SOURCE_LIMIT = GOODS_SEARCH_LIMIT + 1;
export const GOODS_SEARCH_QUERY_MIN_LENGTH = 2;
export const GOODS_SEARCH_QUERY_MAX_LENGTH = 100;
export const GOODS_SEARCH_TITLE_MAX_LENGTH = 512;

/** Request-local search observations, never a goods card, stock fact or authority. */
export interface GoodsSearchRead {
  contract: 'maya.goods-search.read/1';
  source: 'external_crm';
  scope: 'bounded_goods_and_categories_search';
  as_of: string;
  company_id: string;
  query: string;
  limit: typeof GOODS_SEARCH_LIMIT;
  may_have_more: boolean;
  exhaustive: false;
  rows: { kind: 'item' | 'category'; id: string; title: string }[];
  limitations: string[];
}

const controls = /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u;

export function goodsSearchQuery(value: unknown): string {
  const query =
    typeof value === 'string' && !controls.test(value)
      ? value.trim().replace(/\s+/gu, ' ')
      : '';
  if (
    query.length < GOODS_SEARCH_QUERY_MIN_LENGTH ||
    query.length > GOODS_SEARCH_QUERY_MAX_LENGTH
  )
    throw new BadRequestException({
      message:
        'Укажите название, артикул или штрихкод длиной от 2 до 100 символов.',
      error: { code: 'goods_search_invalid_query' },
    });
  return query;
}

export function goodsSearchUnavailable(cause?: unknown): never {
  throw new ServiceUnavailableException(
    {
      message:
        'Поиск товаров в CRM сейчас недоступен. Это не означает, что совпадений нет.',
      error: { code: 'goods_search_source_unavailable' },
    },
    { cause },
  );
}

function sourceId(value: unknown): string {
  try {
    return goodsId(value);
  } catch (error) {
    goodsSearchUnavailable(error);
  }
}
const zero = (value: unknown): boolean => value === 0 || value === '0';

/** Official capture 2026-10-07, SHA256
 * 9ba4c2deca4197aeee333c95b4d641f19073ef91b40279b0fc83651bd502157b.
 * Its search is category-first and meta.count counts categories, not all hits.
 * Number tokens arrive as exact text through parseGoodsResponseJson. */
export function observedGoodsSearch(
  rows: unknown,
  query: string,
  companyId: string,
): GoodsSearchRead {
  const normalizedQuery = goodsSearchQuery(query);
  const company = sourceId(companyId);
  if (!Array.isArray(rows) || rows.length > GOODS_SEARCH_SOURCE_LIMIT)
    goodsSearchUnavailable();

  const seen = new Set<string>();
  const qualified = rows.map(
    (value: unknown): GoodsSearchRead['rows'][number] => {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        goodsSearchUnavailable();
      const row = value as Record<string, unknown>;
      if (
        typeof row.is_item !== 'boolean' ||
        typeof row.is_category !== 'boolean' ||
        row.is_item === row.is_category ||
        typeof row.is_chain !== 'boolean' ||
        typeof row.title !== 'string' ||
        !row.title.trim() ||
        row.title.length > GOODS_SEARCH_TITLE_MAX_LENGTH ||
        controls.test(row.title)
      )
        goodsSearchUnavailable();
      if (!zero(row.parent_id)) sourceId(row.parent_id);

      const kind = row.is_item ? 'item' : 'category';
      if (!zero(row.is_item ? row.category_id : row.item_id))
        goodsSearchUnavailable();
      const id = sourceId(row.is_item ? row.item_id : row.category_id);
      const key = `${kind}:${id}`;
      if (seen.has(key)) goodsSearchUnavailable();
      seen.add(key);
      return { kind, id, title: row.title.trim() };
    },
  );

  return {
    contract: 'maya.goods-search.read/1',
    source: 'external_crm',
    scope: 'bounded_goods_and_categories_search',
    as_of: new Date().toISOString(),
    company_id: company,
    query: normalizedQuery,
    limit: GOODS_SEARCH_LIMIT,
    may_have_more: qualified.length > GOODS_SEARCH_LIMIT,
    exhaustive: false,
    rows: qualified.slice(0, GOODS_SEARCH_LIMIT),
    limitations: [
      'category_first_bounded_search',
      'query_parameter_metadata_conflicts_with_url_template',
      'search_matches_not_goods_cards',
      'price_and_stock_not_observed',
      'no_mutation_authority',
    ],
  };
}
