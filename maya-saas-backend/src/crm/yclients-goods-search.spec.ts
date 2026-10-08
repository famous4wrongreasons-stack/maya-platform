import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  GOODS_SEARCH_LIMIT,
  GOODS_SEARCH_SOURCE_LIMIT,
  goodsSearchQuery,
  observedGoodsSearch,
} from './yclients-goods-search';

const item = (id: number | string = 123) => ({
  parent_id: 0,
  item_id: id,
  category_id: 0,
  title: 'Тестовый шампунь',
  is_chain: false,
  is_category: false,
  is_item: true,
});
const category = (id: number | string = 123) => ({
  parent_id: '0',
  item_id: '0',
  category_id: id,
  title: 'Уход за волосами',
  is_chain: true,
  is_category: true,
  is_item: false,
});

describe('YCLIENTS bounded goods search projection, synthetic source only', () => {
  afterEach(() => jest.useRealTimers());

  it('normalizes an explicit name, article or barcode without widening the query', () => {
    expect(goodsSearchQuery('  Тестовый   шампунь  ')).toBe('Тестовый шампунь');
    expect(goodsSearchQuery('  A-01/2  ')).toBe('A-01/2');
    expect(goodsSearchQuery('  0001234567890  ')).toBe('0001234567890');
    expect(goodsSearchQuery('аб')).toBe('аб');
    expect(goodsSearchQuery('а'.repeat(100))).toHaveLength(100);
  });

  it.each([
    undefined,
    null,
    123,
    {},
    '',
    '   ',
    'а',
    'а'.repeat(101),
    'а\nб',
    '\tаб',
    'а\u0000б',
    'а\u007fб',
    'а\u202eб',
  ])('rejects invalid explicit query %j before a source read', (query) => {
    expect(() => goodsSearchQuery(query)).toThrow(BadRequestException);
  });

  it('keeps item/category identity distinct and projects no source price, stock or private metadata', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-08T12:00:00.000Z'));
    const read = observedGoodsSearch(
      [
        category(),
        {
          ...item(),
          title: ' Шампунь ',
          cost: 100,
          amount: 9,
          private: 'HIDDEN',
        },
      ],
      '  шампунь  ',
      '5',
    );
    expect(read).toEqual({
      contract: 'maya.goods-search.read/1',
      source: 'external_crm',
      scope: 'bounded_goods_and_categories_search',
      as_of: '2026-10-08T12:00:00.000Z',
      company_id: '5',
      query: 'шампунь',
      limit: 20,
      may_have_more: false,
      exhaustive: false,
      rows: [
        { kind: 'category', id: '123', title: 'Уход за волосами' },
        { kind: 'item', id: '123', title: 'Шампунь' },
      ],
      limitations: [
        'category_first_bounded_search',
        'query_parameter_metadata_conflicts_with_url_template',
        'search_matches_not_goods_cards',
        'price_and_stock_not_observed',
        'no_mutation_authority',
      ],
    });
    expect(JSON.stringify(read)).not.toMatch(
      /HIDDEN|"cost"|"amount"|"private"/,
    );
  });

  it('retains empty and categories-only results without asserting an exhaustive inventory', () => {
    expect(observedGoodsSearch([], 'шампунь', '5')).toMatchObject({
      rows: [],
      may_have_more: false,
      exhaustive: false,
    });
    expect(
      observedGoodsSearch([category(1), category(2)], 'уход', '5').rows,
    ).toEqual([
      { kind: 'category', id: '1', title: 'Уход за волосами' },
      { kind: 'category', id: '2', title: 'Уход за волосами' },
    ]);
  });

  it('uses the 21st validated row only as a sentinel and keeps observed order', () => {
    const rows = Array.from({ length: GOODS_SEARCH_SOURCE_LIMIT }, (_, n) =>
      item(n + 1),
    );
    const read = observedGoodsSearch(rows, 'шампунь', '5');
    expect(read.rows).toHaveLength(GOODS_SEARCH_LIMIT);
    expect(read.rows.map((row) => row.id)).toEqual(
      Array.from({ length: 20 }, (_, n) => String(n + 1)),
    );
    expect(read.may_have_more).toBe(true);
    expect(read.exhaustive).toBe(false);
    expect(
      observedGoodsSearch(rows.slice(0, 20), 'шампунь', '5').may_have_more,
    ).toBe(false);
    expect(() =>
      observedGoodsSearch([...rows.slice(0, 20), null], 'шампунь', '5'),
    ).toThrow(ServiceUnavailableException);
  });

  it.each([
    { label: 'non-array', rows: {} },
    { label: 'null', rows: null },
    { label: 'mixed valid and invalid', rows: [item(), null] },
    { label: 'nested array', rows: [[item()]] },
    {
      label: 'oversized array',
      rows: Array.from({ length: 22 }, (_, n) => item(n + 1)),
    },
    { label: 'duplicate item identity', rows: [item(123), item('123')] },
    {
      label: 'duplicate category identity',
      rows: [category(123), category('123')],
    },
    { label: 'missing title', rows: [{ ...item(), title: undefined }] },
    { label: 'empty title', rows: [{ ...item(), title: '  ' }] },
    { label: 'oversized title', rows: [{ ...item(), title: 'а'.repeat(513) }] },
    { label: 'control in title', rows: [{ ...item(), title: 'Шам\nпунь' }] },
    { label: 'ambiguous flags', rows: [{ ...item(), is_category: true }] },
    { label: 'no kind', rows: [{ ...item(), is_item: false }] },
    { label: 'numeric flag', rows: [{ ...item(), is_item: 1 }] },
    { label: 'missing chain flag', rows: [{ ...item(), is_chain: undefined }] },
    { label: 'invalid parent identity', rows: [{ ...item(), parent_id: -1 }] },
    {
      label: 'both identities positive',
      rows: [{ ...item(), category_id: 2 }],
    },
    {
      label: 'category with item identity',
      rows: [{ ...category(), item_id: 2 }],
    },
    { label: 'zero item identity', rows: [item(0)] },
    { label: 'zero category identity', rows: [category(0)] },
    { label: 'fractional identity', rows: [item('1.5')] },
    { label: 'exponent identity token', rows: [item('1e3')] },
    { label: 'unbounded identity', rows: [item('9007199254740993')] },
  ])(
    'fails closed for $label instead of returning an empty/partial success',
    ({ rows }) => {
      expect(() => observedGoodsSearch(rows, 'шампунь', '5')).toThrow(
        ServiceUnavailableException,
      );
    },
  );

  it('rejects unqualified company identity even for an empty response', () => {
    expect(() => observedGoodsSearch([], 'шампунь', '../5')).toThrow(
      ServiceUnavailableException,
    );
  });
});
