import { goodsId, observedGoodsItem } from './yclients-goods-read';
import { ServiceUnavailableException } from '@nestjs/common';

describe('YCLIENTS goods READ facts (synthetic documentation-shaped payload)', () => {
  const row = {
    good_id: '123',
    title: 'Тестовый шампунь',
    cost: '100.50',
    actual_cost: '60.10',
    unit_actual_cost: '6.01',
    unit_id: '11',
    service_unit_id: '22',
    unit_short_title: 'шт',
    service_unit_short_title: 'мл',
    unit_equals: '10',
    actual_amounts: [{ storage_id: '99', amount: '45' }],
    supplier_id: 'PRIVATE',
  };
  it('preserves three independent price fields, separate units and configured currency without stock inference', () => {
    const out = observedGoodsItem([row], '123', '5', 'RUB');
    expect(out).toMatchObject({
      company_id: '5',
      currency: 'RUB',
      currency_source: 'tenant_setting',
      scope: 'single_catalog_item',
      item: {
        id: '123',
        name: 'Тестовый шампунь',
        sale_price: '100.50',
        cost_price: '60.10',
        unit_cost_price: '6.01',
        sale_unit_id: '11',
        write_off_unit_id: '22',
        unit_ratio: '10',
      },
    });
    expect(out.limitations).toContain('catalog_not_stock_receipt');
    expect(JSON.stringify(out)).not.toMatch(
      /actual_amounts|supplier_id|PRIVATE/,
    );
  });
  it('preserves fractional per-store quantities without inventing the stock unit or physical item kind', () => {
    const out = observedGoodsItem(
      [{ ...row, actual_amounts: [{ storage_id: '99', amount: '-1.250' }] }],
      '123',
      '5',
      'RUB',
    );
    expect(out.stock).toEqual({
      status: 'observed',
      rows: [{ store_id: '99', quantity: '-1.250' }],
      unit_basis: 'not_provided',
      exhaustive: false,
    });
    expect(out.item_kind).toBe('unknown');
    expect(
      observedGoodsItem(
        [
          {
            ...row,
            loyalty_abonement_type_id: 0,
            loyalty_certificate_type_id: 0,
          },
        ],
        '123',
        '5',
        'RUB',
      ).item_kind,
    ).toBe('physical');
    expect(
      observedGoodsItem(
        [
          {
            ...row,
            loyalty_abonement_type_id: 1,
            loyalty_certificate_type_id: 0,
          },
        ],
        '123',
        '5',
        'RUB',
      ).item_kind,
    ).toBe('loyalty');
    expect(
      observedGoodsItem(
        [{ ...row, actual_amounts: [{ storage_id: '99', amount: '1,25' }] }],
        '123',
        '5',
        'RUB',
      ).stock.status,
    ).toBe('unavailable');
  });
  it('retains unknowns rather than manufacturing zero prices, currency or 1:1 units', () => {
    const out = observedGoodsItem(
      [{ good_id: 123, title: 'Товар' }],
      '123',
      '5',
      undefined,
    );
    expect(out.currency).toBeNull();
    expect(out.item).toMatchObject({
      sale_price: null,
      cost_price: null,
      unit_cost_price: null,
      sale_unit_id: null,
      write_off_unit_id: null,
      unit_ratio: null,
    });
    expect(out.limitations).toContain('price_or_unit_facts_incomplete');
  });
  it.each(['1,20', '-1', '1e3', Infinity, NaN, '', null, '1.1234567'])(
    'does not round or reinterpret an unqualified amount %s',
    (cost) => {
      expect(
        observedGoodsItem([{ ...row, cost }], '123', '5', 'RUB').item
          .sale_price,
      ).toBeNull();
    },
  );
  it('preserves a measured zero while withholding a zero ratio', () => {
    const out = observedGoodsItem(
      [{ ...row, cost: 0, unit_equals: '0' }],
      '123',
      '5',
      '',
    );
    expect(out.item.sale_price).toBe('0');
    expect(out.item.unit_ratio).toBeNull();
    expect(out.currency).toBeNull();
  });
  it.each([
    null,
    {},
    [],
    [row, row],
    [null],
    [{ good_id: '456', title: 'Чужой товар' }],
    [{ good_id: '123', title: '' }],
  ])('rejects unavailable or mismatching exact source identity', (rows) => {
    expect(() => observedGoodsItem(rows, '123', '5', 'RUB')).toThrow(
      ServiceUnavailableException,
    );
  });
  it.each(['../other', '0', '-1', '123?company_id=9', '', null, {}, 1.5])(
    'rejects invalid route ID %j',
    (value) => {
      expect(() => goodsId(value)).toThrow('goods_read_invalid_id');
    },
  );
});
