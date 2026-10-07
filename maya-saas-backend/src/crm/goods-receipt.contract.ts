import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { stableActionJson } from '../action-engine/action-engine.identity';
import {
  goodsDecimal,
  goodsId,
  type GoodsItemRead,
} from './yclients-goods-read';

export const GOODS_RECEIPT_TOOL = 'inventory.goods.receipt.prepare';
export const GOODS_RECEIPT_CAPABILITY = 'crm.goods.receipt.create.v1';
export class GoodsPreDispatchError extends ConflictException {}
export function goodsRefuse(code: string): never {
  throw new GoodsPreDispatchError(code);
}
export const goodsHash = (value: unknown) =>
  createHash('sha256').update(stableActionJson(value)).digest('hex');
export function exactDecimal(value: unknown, positive = false): string {
  const raw = goodsDecimal(value);
  if (raw === null) goodsRefuse('goods_decimal_unqualified');
  const normalized = raw.includes('.')
    ? raw.replace(/0+$/, '').replace(/\.$/, '')
    : raw;
  if (positive && normalized === '0')
    goodsRefuse('goods_quantity_must_be_positive');
  return normalized;
}
export function lineTotal(quantity: string, unitCost: string): string {
  const decimal = (s: string) => {
    const [whole, fraction = ''] = s.split('.');
    return { n: BigInt(whole + fraction), scale: fraction.length };
  };
  const a = decimal(exactDecimal(quantity, true)),
    b = decimal(exactDecimal(unitCost));
  const scale = a.scale + b.scale,
    raw = (a.n * b.n).toString().padStart(scale + 1, '0');
  const product = scale ? raw.slice(0, -scale) + '.' + raw.slice(-scale) : raw;
  return exactDecimal(
    scale ? product.replace(/0+$/, '').replace(/\.$/, '') : product,
  );
}
export const GOODS_PROPOSAL_KEYS = [
  'goods_id',
  'store_id',
  'quantity',
  'unit_id',
  'unit_cost',
  'currency',
  'price_kind',
  'received_at',
  'photo_sha256',
  'source_line',
  'review_version',
] as const;
export const GOODS_PREPARED_KEYS = [
  'company_id',
  'integration_revision',
  'current_revision',
  'goods_name',
  'store_name',
  'unit_label',
  'line_total',
] as const;
export function goodsProposal(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    goodsRefuse('goods_proposal_required');
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (k) =>
        ![...GOODS_PROPOSAL_KEYS, ...GOODS_PREPARED_KEYS].includes(k as never),
    )
  )
    goodsRefuse('goods_unexpected_proposal_field');
  if (
    input.price_kind !== 'receipt_purchase_unit' ||
    typeof input.currency !== 'string' ||
    !/^[A-Z]{3}$/.test(input.currency)
  )
    goodsRefuse('goods_explicit_receipt_price_required');
  if (
    typeof input.received_at !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
      input.received_at,
    ) ||
    !Number.isFinite(Date.parse(input.received_at)) ||
    new Date(input.received_at.slice(0, 10) + 'T00:00:00Z')
      .toISOString()
      .slice(0, 10) !== input.received_at.slice(0, 10)
  )
    goodsRefuse('goods_explicit_receipt_time_required');
  if (
    typeof input.photo_sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(input.photo_sha256) ||
    !Number.isSafeInteger(input.source_line) ||
    Number(input.source_line) < 1 ||
    Number(input.source_line) > 20 ||
    !Number.isSafeInteger(input.review_version) ||
    Number(input.review_version) < 1 ||
    Number(input.review_version) > 20
  )
    goodsRefuse('goods_exact_source_line_required');
  return {
    goods_id: goodsId(input.goods_id),
    store_id: goodsId(input.store_id),
    quantity: exactDecimal(input.quantity, true),
    unit_id: goodsId(input.unit_id),
    unit_cost: exactDecimal(input.unit_cost),
    currency: input.currency,
    price_kind: input.price_kind,
    received_at: input.received_at,
    photo_sha256: input.photo_sha256,
    source_line: input.source_line,
    review_version: input.review_version,
  };
}
export function preparedGoods(value: unknown): Record<string, unknown> {
  const proposal = goodsProposal(value),
    input = value as Record<string, unknown>;
  if (!GOODS_PREPARED_KEYS.some((k) => k in input)) return proposal;
  for (const key of ['integration_revision', 'current_revision'])
    if (typeof input[key] !== 'string' || !/^[a-f0-9]{64}$/.test(input[key]))
      goodsRefuse('goods_exact_revision_required');
  for (const key of ['goods_name', 'store_name', 'unit_label'])
    if (
      typeof input[key] !== 'string' ||
      !input[key].trim() ||
      input[key].length > 512 ||
      /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(input[key])
    )
      goodsRefuse('goods_source_label_unavailable');
  if (
    exactDecimal(input.line_total) !==
    lineTotal(String(proposal.quantity), String(proposal.unit_cost))
  )
    goodsRefuse('goods_line_total_mismatch');
  return {
    ...proposal,
    company_id: goodsId(input.company_id),
    integration_revision: input.integration_revision,
    current_revision: input.current_revision,
    goods_name: input.goods_name,
    store_name: input.store_name,
    unit_label: input.unit_label,
    line_total: exactDecimal(input.line_total),
  };
}

/** Trusted provider port, not a model-authored authority object. There is no
 * real YCLIENTS receipt writer until its payload/rights/readback is qualified. */
export type GoodsReceiptContext = {
  goods: GoodsItemRead;
  store: { id: string; name: string; company_id: string };
  can_receive: boolean;
};
export type GoodsReceiptResult = {
  receipt_id: string;
  observed: {
    company_id: string;
    goods_id: string;
    store_id: string;
    quantity: string;
    unit_id: string;
    unit_cost: string;
    line_total: string;
    currency: string;
    received_at: string;
  };
};
export function receiptContextFacts(
  context: GoodsReceiptContext,
  proposal: Record<string, unknown>,
  companyId: string,
) {
  const goods = context.goods;
  if (
    context.can_receive !== true ||
    goods.contract !== 'maya.goods-item.read/2' ||
    goods.company_id !== companyId ||
    goods.item.id !== proposal.goods_id ||
    goods.item_kind !== 'physical' ||
    goods.currency !== proposal.currency ||
    context.store.id !== proposal.store_id ||
    context.store.company_id !== companyId
  )
    goodsRefuse('goods_receipt_scope_or_permission_unavailable');
  const unitLabel =
    proposal.unit_id === goods.item.sale_unit_id
      ? goods.item.sale_unit_label
      : proposal.unit_id === goods.item.write_off_unit_id
        ? goods.item.write_off_unit_label
        : null;
  if (!unitLabel || !goods.item.unit_ratio)
    goodsRefuse('goods_receipt_unit_unqualified');
  const facts = {
    company_id: companyId,
    goods_name: goods.item.name,
    store_name: context.store.name,
    unit_label: unitLabel,
  };
  return {
    ...facts,
    current_revision: goodsHash({
      companyId,
      item: goods.item,
      kind: goods.item_kind,
      currency: goods.currency,
      store: context.store,
      can_receive: context.can_receive,
    }),
  };
}
export function confirmedReceipt(
  value: GoodsReceiptResult,
  args: Record<string, unknown>,
) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof value.receipt_id !== 'string' ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(value.receipt_id)
  )
    throw new Error('goods_receipt_ack_unavailable');
  const observed: Record<string, string> = {};
  for (const key of [
    'company_id',
    'goods_id',
    'store_id',
    'quantity',
    'unit_id',
    'unit_cost',
    'line_total',
    'currency',
    'received_at',
  ] as const) {
    if (value.observed?.[key] !== args[key])
      throw new Error('goods_receipt_readback_mismatch');
    observed[key] = value.observed[key];
  }
  return {
    receipt_id: value.receipt_id,
    ...observed,
    operation: 'stock_receipt',
    catalog_price_changed: false,
    absolute_stock_assigned: false,
  };
}
