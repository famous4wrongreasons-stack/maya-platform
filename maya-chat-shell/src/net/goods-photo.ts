// Finite source projections. Raw OCR, provider metadata and authority stay outside the view.
import { projectChatResolution } from './project.ts';
import type { GoodsPhotoResponse, GoodsPhotoLine, GoodsPhotoItem, GoodsPhotoProposal, GoodsPhotoRequestContext, GoodsPhotoTurn, GoodsSearchMatch } from './types.ts';
const own = (v: unknown, key: string): unknown => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const d = Object.getOwnPropertyDescriptor(v, key);
  return d && 'value' in d ? d.value : undefined;
};
const text = (v: unknown, max = 512): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(v);
const prose = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 8000;
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d{0,14}$/.test(v);
const decimal = (v: unknown): v is string => typeof v === 'string' && /^(0|[1-9]\d{0,11})(\.\d{1,6})?$/.test(v);
const instant = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) && /(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v));
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const nullable = <T>(v: unknown, check: (v: unknown) => v is T): v is T | null => v === null || check(v);

export function projectGoodsPhotoContext(value: unknown): GoodsPhotoRequestContext | null {
  const requestId = own(value, 'requestId'), conversationId = own(value, 'conversationId'), sourceRevision = own(value, 'source_revision');
  if (!hash(sourceRevision) || typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(requestId) || (conversationId !== undefined && !uuid(conversationId))) return null;
  return { requestId, source_revision: sourceRevision, ...(conversationId === undefined ? {} : { conversationId: conversationId as string }) };
}
export function goodsPhotoQuery(value: unknown): string | null {
  if (!text(value, 100)) return null;
  const query = value.trim().replace(/\s+/gu, ' ');
  return query.length >= 2 ? query : null;
}
export function projectGoodsPhotoProposal(value: unknown): GoodsPhotoProposal | null {
  const goods = own(value, 'goods_id'), store = own(value, 'store_id'), quantity = own(value, 'quantity'), unit = own(value, 'unit_id'), cost = own(value, 'unit_cost'), currency = own(value, 'currency'), at = own(value, 'received_at'), photo = own(value, 'photo_sha256'), line = own(value, 'source_line'), version = own(value, 'review_version');
  if (!id(goods) || !id(store) || !id(unit) || !decimal(quantity) || /^0(?:\.0+)?$/.test(quantity) || !decimal(cost) || typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency) || own(value, 'price_kind') !== 'receipt_purchase_unit' || !instant(at) || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(at) || new Date(at.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) !== at.slice(0, 10) || !hash(photo) || !Number.isInteger(line) || Number(line) < 1 || Number(line) > 20 || !Number.isInteger(version) || Number(version) < 1 || Number(version) > 20) return null;
  return { goods_id: goods, store_id: store, quantity, unit_id: unit, unit_cost: cost, currency, price_kind: 'receipt_purchase_unit', received_at: at, photo_sha256: photo, source_line: line as number, review_version: version as number };
}
export function projectGoodsPhotoPreview(value: unknown): GoodsPhotoResponse | null {
  const digest = own(value, 'photo_sha256'), source = own(value, 'lines'), sourceRevision = own(value, 'source_revision');
  if (own(value, 'contract') !== 'maya.goods-photo.preview/1' || !hash(digest) || !hash(sourceRevision) || own(value, 'recognition_acceptance') !== 'NOT_ACCEPTED' || own(value, 'review_required') !== true || own(value, 'original_stored') !== false || own(value, 'persistent_draft') !== false || !Array.isArray(source) || source.length < 1 || source.length > 20) return null;
  const lines: GoodsPhotoLine[] = [];
  for (const row of source) {
    const sourceLine = own(row, 'source_line'), name = own(row, 'name'), quantity = own(row, 'quantity'), unitLabel = own(row, 'unit_label'), unitPrice = own(row, 'unit_price'), lineTotal = own(row, 'line_total'), priceKind = own(row, 'price_kind'), confidence = own(row, 'parser_confidence');
    if (sourceLine !== lines.length + 1 || own(row, 'review_required') !== true || !nullable(name, text) || !nullable(quantity, decimal) || !nullable(unitLabel, text) || !nullable(unitPrice, decimal) || !nullable(lineTotal, decimal) || ![null, 'purchase_unit', 'sale_unit', 'line_total'].includes(priceKind as never) || !(confidence === null || typeof confidence === 'number' && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1)) return null;
    lines.push({ sourceLine: sourceLine as number, name, quantity, unitLabel, unitPrice, lineTotal, priceKind: priceKind as GoodsPhotoLine['priceKind'], parserConfidence: confidence });
  }
  return { kind: 'preview', sourceRevision, photoSha256: digest, lines };
}
function turn(value: unknown, request: GoodsPhotoRequestContext): GoodsPhotoTurn | null {
  const conversationId = own(value, 'conversationId'), user = own(value, 'user_turn'), turnId = own(user, 'turnId'), userText = own(value, 'user_text'), reply = own(value, 'reply');
  if (!uuid(conversationId) || !uuid(turnId) || own(user, 'conversationId') !== conversationId || (request.conversationId !== undefined && conversationId !== request.conversationId) || !prose(userText) || !prose(reply)) return null;
  return { conversationId, userTurn: { turnId, conversationId }, userText, reply };
}
export function projectGoodsPhotoSearch(value: unknown, request: GoodsPhotoRequestContext & { readonly query: string }): GoodsPhotoResponse | null {
  const t = turn(value, request), source = own(value, 'result'), rows = own(source, 'rows'), query = own(source, 'query'), more = own(source, 'may_have_more');
  if (own(value, 'source_revision') !== request.source_revision || own(value, 'contract') !== 'maya.goods-photo.search/1' || !t || own(source, 'contract') !== 'maya.goods-search.read/1' || own(source, 'source') !== 'external_crm' || own(source, 'scope') !== 'bounded_goods_and_categories_search' || !instant(own(source, 'as_of')) || query !== request.query || own(source, 'limit') !== 20 || own(source, 'exhaustive') !== false || typeof more !== 'boolean' || !Array.isArray(rows) || rows.length > 20) return null;
  const matches: GoodsSearchMatch[] = [];
  for (const row of rows) {
    const kind = own(row, 'kind'), key = own(row, 'id'), title = own(row, 'title');
    if ((kind !== 'item' && kind !== 'category') || !id(key) || !text(title) || matches.some(m => m.kind === kind && m.id === key)) return null;
    matches.push({ kind, id: key, title });
  }
  return { kind: 'search', sourceRevision: request.source_revision, turn: t, query: request.query, matches, mayHaveMore: more };
}
export function projectGoodsPhotoItem(value: unknown, request: GoodsPhotoRequestContext & { readonly goods_id: string }): GoodsPhotoResponse | null {
  const t = turn(value, request), source = own(value, 'result'), item = own(source, 'item'), stock = own(source, 'stock');
  const asOf = own(source, 'as_of'), currency = own(source, 'currency'), itemKind = own(source, 'item_kind'), name = own(item, 'name'), stockStatus = own(stock, 'status'), rows = own(stock, 'rows');
  if (own(value, 'source_revision') !== request.source_revision || own(value, 'contract') !== 'maya.goods-photo.item/1' || !t || own(source, 'contract') !== 'maya.goods-item.read/2' || own(source, 'source') !== 'external_crm' || own(source, 'scope') !== 'single_catalog_item' || own(source, 'stale') === true || !instant(asOf) || !nullable(currency, (v): v is string => typeof v === 'string' && /^[A-Z]{3}$/.test(v)) || !['physical', 'loyalty', 'unknown'].includes(itemKind as never) || own(item, 'id') !== request.goods_id || !text(name) || !['observed', 'unavailable'].includes(stockStatus as never) || !Array.isArray(rows) || rows.length > 20 || own(stock, 'unit_basis') !== 'not_provided' || own(stock, 'exhaustive') !== false) return null;
  for (const key of ['article', 'barcode', 'sale_unit_label', 'write_off_unit_label']) if (!nullable(own(item, key), text)) return null;
  for (const key of ['sale_price', 'cost_price', 'unit_cost_price', 'unit_ratio']) if (!nullable(own(item, key), decimal)) return null;
  for (const key of ['sale_unit_id', 'write_off_unit_id']) if (!nullable(own(item, key), id)) return null;
  const stockRows: { storeId: string; quantity: string }[] = [];
  for (const row of rows) {
    const store = own(row, 'store_id'), quantity = own(row, 'quantity');
    if (!id(store) || typeof quantity !== 'string' || !/^-?(0|[1-9]\d{0,11})(\.\d{1,6})?$/.test(quantity) || stockRows.some(r => r.storeId === store)) return null;
    stockRows.push({ storeId: store, quantity });
  }
  if (stockStatus === 'unavailable' && stockRows.length !== 0) return null;
  const projected: GoodsPhotoItem = { id: request.goods_id, name, asOf, currency, itemKind: itemKind as GoodsPhotoItem['itemKind'], article: own(item, 'article') as string | null, barcode: own(item, 'barcode') as string | null, salePrice: own(item, 'sale_price') as string | null, costPrice: own(item, 'cost_price') as string | null, unitCostPrice: own(item, 'unit_cost_price') as string | null, saleUnitId: own(item, 'sale_unit_id') as string | null, saleUnitLabel: own(item, 'sale_unit_label') as string | null, writeOffUnitId: own(item, 'write_off_unit_id') as string | null, writeOffUnitLabel: own(item, 'write_off_unit_label') as string | null, unitRatio: own(item, 'unit_ratio') as string | null, stock: { status: stockStatus as 'observed' | 'unavailable', rows: stockRows, unitBasis: 'not_provided', exhaustive: false } };
  return { kind: 'item', sourceRevision: request.source_revision, turn: t, item: projected };
}
export function projectGoodsPhotoReview(value: unknown, request: GoodsPhotoRequestContext): GoodsPhotoResponse | null {
  const t = turn(value, request), status = own(value, 'status'), resolution = projectChatResolution(own(value, 'resolution'));
  if (own(value, 'contract') !== 'maya.goods-photo.review/1' || !t || !['approval_required', 'completed', 'held'].includes(status as never) || typeof resolution === 'symbol' || (status === 'approval_required' ? resolution === null : resolution !== null)) return null;
  if (resolution && (resolution.receipt.envelope.kind !== 'APPROVAL' || own(own(resolution.receipt.envelope, 'source'), 'capability') !== 'inventory.goods.receipt.prepare')) return null;
  return { kind: 'review', turn: t, status: status as 'approval_required' | 'completed' | 'held', resolution };
}
