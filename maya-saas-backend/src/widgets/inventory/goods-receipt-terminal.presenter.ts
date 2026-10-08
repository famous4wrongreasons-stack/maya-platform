import type { GoodsReceiptApprovalOwnerPort } from './goods-receipt-approval.port';

/** Exact immutable receipt facts only. No provider read, model text, photo or person data. */
export const GOODS_RECEIPT_UNCONFIRMED =
  'Результат прихода не подтверждён. Повторная отправка остановлена; проверьте документ в YCLIENTS.';
const headlines = {
  SUCCEEDED: 'Приход товара подтверждён в YCLIENTS.',
  REJECTED: 'Приход отклонён. Изменений в складе по этому предложению нет.',
  UNKNOWN: GOODS_RECEIPT_UNCONFIRMED,
} as const;
export function goodsReceiptTerminalText(
  facts: Awaited<ReturnType<GoodsReceiptApprovalOwnerPort['read']>>['facts'],
  state: keyof typeof headlines,
): string {
  const required = [
    'goods_id',
    'store_id',
    'quantity',
    'unit_label',
    'unit_id',
    'unit_cost',
    'currency',
    'line_total',
    'received_at',
  ];
  if (
    required.some(
      (key) =>
        typeof facts[key] !== 'string' ||
        !facts[key] ||
        String(facts[key]).length > 240,
    )
  )
    throw new Error('goods_receipt_terminal_facts_unavailable');
  const data = facts as Readonly<Record<string, string>>;
  const text = [
    headlines[state],
    `Товар: ${data.goods_id}. Склад: ${data.store_id}.`,
    `Количество: ${data.quantity} ${data.unit_label} (код единицы ${data.unit_id}).`,
    `Закупочная цена за единицу: ${data.unit_cost} ${data.currency}.`,
    `Сумма прихода: ${data.line_total} ${data.currency}.`,
    `Дата прихода: ${data.received_at}.`,
  ].join('\n');
  if (text.length > 2048)
    throw new Error('goods_receipt_terminal_text_too_large');
  return text;
}
/** The typed alias may reuse only this exact server owner's terminal projection.
 * A route acknowledgement never becomes a fabricated success sentence. */
export function goodsReceiptDecisionReply(value: unknown): string {
  const row = (v: unknown): Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  const decision = row(value),
    result = row(decision.outcome),
    text = decision.receipt_text;
  const state = decision.state;
  const supported =
    state === 'UNKNOWN' ||
    (state === 'REJECTED' && decision.status === 'rejected') ||
    (state === 'SUCCEEDED' &&
      decision.status === 'completed' &&
      result.verified === true &&
      result.source === 'yclients' &&
      typeof result.action_execution_id === 'string' &&
      result.action_execution_id.length > 0 &&
      typeof result.receipt_id === 'string' &&
      result.receipt_id.length > 0 &&
      result.operation === 'stock_receipt' &&
      result.catalog_price_change_requested === false &&
      result.absolute_stock_assignment_requested === false);
  return supported &&
    typeof text === 'string' &&
    text.length <= 2048 &&
    text.startsWith(headlines[state] + '\n')
    ? text
    : GOODS_RECEIPT_UNCONFIRMED;
}
