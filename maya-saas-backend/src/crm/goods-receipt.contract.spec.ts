import {
  normalizeGoodsReceiptInput,
  goodsReceiptCapability,
} from '../action-engine/goods-receipt.contract';
import {
  goodsProposal,
  preparedGoods,
  receiptContextFacts,
  lineTotal,
  confirmedReceipt,
} from './goods-receipt.contract';
import { observedGoodsItem } from './yclients-goods-read';
const proposal = {
  goods_id: '123',
  store_id: '9',
  quantity: '2.500',
  unit_id: '11',
  unit_cost: '10.25',
  currency: 'RUB',
  price_kind: 'receipt_purchase_unit',
  received_at: '2026-10-07T09:00:00Z',
  photo_sha256: 'a'.repeat(64),
  source_line: 1,
  review_version: 1,
};
const goods = () =>
  observedGoodsItem(
    [
      {
        good_id: '123',
        title: 'Шампунь',
        cost: '100',
        actual_cost: '40',
        unit_actual_cost: '4',
        unit_id: '11',
        service_unit_id: '22',
        unit_short_title: 'флакон',
        service_unit_short_title: 'мл',
        unit_equals: '10',
        loyalty_abonement_type_id: 0,
        loyalty_certificate_type_id: 0,
      },
    ],
    '123',
    '5',
    'RUB',
  );
function prepared() {
  const p = goodsProposal(proposal);
  return {
    ...p,
    ...receiptContextFacts(
      {
        goods: goods(),
        store: { id: '9', name: 'Товары', company_id: '5' },
        can_receive: true,
      },
      p,
      '5',
    ),
    integration_revision: 'b'.repeat(64),
    line_total: lineTotal(String(p.quantity), String(p.unit_cost)),
  };
}
describe('single photo line goods receipt facts, independent AE and no rounding', () => {
  it('separates fractional receipt from sale price, cost and absolute stock', () => {
    const p = prepared();
    expect(p.quantity).toBe('2.5');
    expect(p.unit_cost).toBe('10.25');
    expect(p.line_total).toBe('25.625');
    expect(preparedGoods(p)).toEqual(p);
    expect(
      normalizeGoodsReceiptInput({ ...p, approval_id: 'approval' }),
    ).toEqual({ ...p, approval_id: 'approval' });
    expect(goodsReceiptCapability.retry.maxExecutionAttempts).toBe(1);
    expect(goodsReceiptCapability.riskFacets).toContain('financial');
  });
  it.each([
    { quantity: '1,5' },
    { quantity: '0' },
    { unit_cost: '1e2' },
    { unit_cost: '-1' },
    { price_kind: 'sale_unit' },
    { price_kind: 'line_total' },
    { currency: '' },
    { photo_sha256: 'untrusted' },
    { source_line: 0 },
    { supplier_id: '1' },
    { raw_ocr: 'PRIVATE' },
    { received_at: '2026-02-30T09:00:00Z' },
    { received_at: '2026-10-07T24:00:00Z' },
    { review_version: 0 },
  ])('refuses incomplete/ambiguous proposal %j', (patch) =>
    expect(() => goodsProposal({ ...proposal, ...patch })).toThrow(),
  );
  it('trims only exact trailing zeros before validating product precision', () => {
    expect(lineTotal('0.000002', '0.5')).toBe('0.000001');
  });
  it('does not round a product requiring more than six decimal places', () =>
    expect(() => lineTotal('1.5', '0.000001')).toThrow());
  it('requires authoritative physical good, company, store, permission, currency and chosen unit', () => {
    const p = goodsProposal(proposal),
      g = goods(),
      store = { id: '9', name: 'Товары', company_id: '5' };
    for (const context of [
      { goods: { ...g, item_kind: 'unknown' }, store, can_receive: true },
      { goods: g, store: { ...store, company_id: '6' }, can_receive: true },
      { goods: g, store, can_receive: false },
      { goods: { ...g, currency: null }, store, can_receive: true },
    ] as const)
      expect(() => receiptContextFacts(context, p, '5')).toThrow();
    expect(() =>
      receiptContextFacts(
        { goods: g, store, can_receive: true },
        { ...p, unit_id: '999' },
        '5',
      ),
    ).toThrow();
  });
  it('AE rejects altered totals and unknown fields independently', () => {
    for (const patch of [
      { line_total: '25.62' },
      { quantity: '0' },
      { absolute_stock: '2.5' },
      { approval_id: '' },
      { received_at: '2026-02-30T09:00:00Z' },
      { received_at: '2026-10-07T24:00:00Z' },
    ])
      expect(() =>
        normalizeGoodsReceiptInput({
          ...prepared(),
          approval_id: 'a',
          ...patch,
        }),
      ).toThrow();
  });
  it('requires exact acknowledged receipt readback; a matching stock balance alone is insufficient', () => {
    const p = prepared();
    const observed = {
      company_id: '5',
      goods_id: '123',
      store_id: '9',
      quantity: '2.5',
      unit_id: '11',
      unit_cost: '10.25',
      line_total: '25.625',
      currency: 'RUB',
      received_at: '2026-10-07T09:00:00Z',
    };
    expect(
      confirmedReceipt({ receipt_id: 'receipt1', observed }, p),
    ).toMatchObject({
      operation: 'stock_receipt',
      catalog_price_changed: false,
      absolute_stock_assigned: false,
    });
    for (const receipt_id of [undefined, null, 123, '', {}, []])
      expect(() =>
        confirmedReceipt({ receipt_id, observed } as never, p),
      ).toThrow();
    const extra = {
      ...observed,
      raw_ocr: 'PRIVATE_INVOICE',
      supplier: 'PRIVATE',
    };
    expect(
      confirmedReceipt({ receipt_id: 'receipt1', observed: extra }, p),
    ).toEqual({
      receipt_id: 'receipt1',
      ...observed,
      operation: 'stock_receipt',
      catalog_price_changed: false,
      absolute_stock_assigned: false,
    });
    expect(() =>
      confirmedReceipt(
        { receipt_id: 'receipt1', observed: { ...observed, quantity: '3' } },
        p,
      ),
    ).toThrow();
  });
});
