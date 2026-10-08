import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { observedGoodsItem } from '../crm/yclients-goods-read';
import { observedGoodsSearch } from '../crm/yclients-goods-search';
import {
  goodsPhotoItemResult,
  goodsPhotoRequest,
  goodsPhotoSearchResult,
} from './goods-photo.contract';

const source = 'b'.repeat(64);
const search = () =>
  observedGoodsSearch(
    [
      {
        parent_id: 0,
        item_id: 1,
        category_id: 0,
        title: 'Товар',
        is_chain: false,
        is_item: true,
        is_category: false,
      },
    ],
    'товар',
    '5',
  );
const item = () =>
  observedGoodsItem([{ good_id: 1, title: 'Товар' }], '1', '5', 'RUB');
const complete = (result: unknown) => ({ status: 'completed', result });
describe('Goods photo finite transport/projection', () => {
  it.each(['query', 'goods_id', 'proposal'] as const)(
    'requires a source witness on %s before matching or review',
    (field) => {
      expect(() =>
        goodsPhotoRequest({ requestId: 'request_1', [field]: 'товар' }, field),
      ).toThrow(BadRequestException);
      expect(() =>
        goodsPhotoRequest(
          {
            requestId: 'request_1',
            source_revision: 'arbitrary',
            [field]: 'товар',
          },
          field,
        ),
      ).toThrow(BadRequestException);
    },
  );
  it('allows only finite lookup fields, never arbitrary source/actor authority', () => {
    expect(
      goodsPhotoRequest(
        { requestId: 'request_1', query: '  товар ', source_revision: source },
        'query',
      ),
    ).toEqual({
      requestId: 'request_1',
      query: 'товар',
      source_revision: source,
    });
    expect(() =>
      goodsPhotoRequest(
        {
          requestId: 'request_1',
          query: 'товар',
          source_revision: source,
          tenantId: 'foreign',
        },
        'query',
      ),
    ).toThrow(BadRequestException);
  });
  it('strips extra owner/runtime properties while retaining the bounded goods observation', () => {
    const result = search();
    const projected = goodsPhotoSearchResult(
      {
        status: 'completed',
        execution_id: 'PRIVATE',
        result: {
          ...result,
          rows: result.rows.map((row) => ({ ...row, secret: 'PRIVATE' })),
          secret: 'PRIVATE',
        },
      },
      'товар',
    );
    expect(projected).toEqual(result);
    expect(JSON.stringify(projected)).not.toContain('PRIVATE');
  });
  it.each([
    { ...search(), rows: Array.from({ length: 21 }, () => search().rows[0]) },
    { ...search(), rows: [search().rows[0], search().rows[0]] },
    { ...search(), rows: [{ ...search().rows[0], title: 'а'.repeat(513) }] },
    { ...search(), query: 'другой' },
    { ...search(), exhaustive: true },
    { ...search(), limitations: Array.from({ length: 21 }, () => 'extra') },
  ])(
    'refuses oversized or incoherent search output rather than truncating silently',
    (result) => {
      expect(() => goodsPhotoSearchResult(complete(result), 'товар')).toThrow(
        ServiceUnavailableException,
      );
    },
  );
  it('retains unknown item facts and forbids a different identity or invented stock unit', () => {
    const result = item();
    expect(goodsPhotoItemResult(complete(result), '1')).toEqual(result);
    expect(() => goodsPhotoItemResult(complete(result), '2')).toThrow(
      ServiceUnavailableException,
    );
    expect(() =>
      goodsPhotoItemResult(
        complete({
          ...result,
          stock: { ...result.stock, unit_basis: 'bottle' },
        }),
        '1',
      ),
    ).toThrow(ServiceUnavailableException);
  });
  it('withholds stale or incomplete saved READs', () => {
    expect(() =>
      goodsPhotoSearchResult({ ...complete(search()), stale: true }, 'товар'),
    ).toThrow(ServiceUnavailableException);
    expect(() =>
      goodsPhotoItemResult({ status: 'executing', result: item() }, '1'),
    ).toThrow(ServiceUnavailableException);
  });
});
