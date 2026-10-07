import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CrmProvider } from '../../common/domain.enums';
import {
  goodsHash,
  goodsProposal,
  lineTotal,
  receiptContextFacts,
  type GoodsReceiptContext,
} from '../goods-receipt.contract';
import { observedGoodsItem } from '../yclients-goods-read';
import {
  parseGoodsResponseJson,
  YclientsGoodsReceiptUnknownError,
  YCLIENTS_RECEIPT_SCOPE_BLOCKERS,
  receiptWireNumber,
  yclientsReceiptBody,
  yclientsReceiptReadback,
} from '../yclients-goods-receipt';
import { YclientsCRMAdapter } from './yclients-crm.adapter';

type Schema = {
  type?: string;
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
};
type Official = {
  sourceSha256: string;
  schemas: Record<string, Schema>;
  storagePermissions: Schema;
};
const official = JSON.parse(
  readFileSync(
    path.join(__dirname, '../fixtures/yclients-receipt-openapi-20261007.json'),
    'utf8',
  ),
) as Official;
const permission = (): { storages: Record<string, unknown> } => ({
  storages: {
    storages_access: true,
    storages_transactions_access: true,
    storages_create_transactions_access: true,
    storages_create_transactions_buy_access: true,
    storages_last_days_count: -1,
    storages_create_last_days_count: -1,
    storages_ids: [],
    storages_transactions_types: [],
  },
});
const rawGood = () => ({
  good_id: 123,
  title: 'Offline goods',
  cost: 100,
  actual_cost: 40,
  unit_actual_cost: 4,
  unit_id: 11,
  service_unit_id: 22,
  unit_short_title: 'bottle',
  service_unit_short_title: 'ml',
  unit_equals: 10,
  loyalty_abonement_type_id: 0,
  loyalty_certificate_type_id: 0,
  actual_amounts: [{ storage_id: 9, amount: 1.25 }],
});
function qualifiedTestContext(): GoodsReceiptContext {
  // Explicit isolated wire-test substitution. No such permission result is
  // inferred by the real context reader; it remains blocked by the pinned schema.
  return {
    goods: observedGoodsItem([rawGood()], '123', '5', 'RUB'),
    store: { id: '9', name: 'Test store', company_id: '5' },
    can_receive: true,
    permission_revision: goodsHash('WIRE_TEST_ONLY'),
  };
}
function args(
  context = qualifiedTestContext(),
  patch: Record<string, unknown> = {},
): Record<string, unknown> {
  const p = goodsProposal({
    goods_id: '123',
    store_id: '9',
    quantity: '2.5',
    unit_id: '11',
    unit_cost: '10.25',
    currency: 'RUB',
    price_kind: 'receipt_purchase_unit',
    received_at: '2026-10-07T09:00:00Z',
    photo_sha256: 'a'.repeat(64),
    source_line: 1,
    review_version: 1,
    ...patch,
  });
  return {
    ...p,
    ...receiptContextFacts(context, p, '5'),
    integration_revision: 'b'.repeat(64),
    line_total: lineTotal(String(p.quantity), String(p.unit_cost)),
  };
}
const document = () => ({
  id: 900,
  type_id: 3,
  company_id: 5,
  storage_id: 9,
  create_date: '2026-10-07T12:00:00.000+03:00',
});
const transaction = () => ({
  id: 901,
  document_id: 900,
  type_id: 3,
  company_id: 5,
  good_id: 123,
  storage_id: 9,
  unit_id: 11,
  operation_unit_type: 1,
  amount: 2.5,
  cost_per_unit: 10.25,
  discount: 0,
  cost: 25.625,
  create_date: '2026-10-07T09:00:00Z',
  deleted: false,
});
function adapter() {
  return new YclientsCRMAdapter({
    provider: CrmProvider.YCLIENTS,
    apiToken: 'SYNTHETIC_ONLY',
    settings: { companyId: 5, currency: 'RUB' },
  });
}
const route = (input: Parameters<typeof fetch>[0]) =>
  new URL(
    input instanceof Request ? input.url : input.toString(),
  ).pathname.replace('/api/v1/', '');

describe('Real YCLIENTS receipt adapter, offline HTTP only; scope admission NOT ACCEPTED', () => {
  const oldPartner = process.env.YCLIENTS_PARTNER_TOKEN;
  beforeEach(() => {
    process.env.YCLIENTS_PARTNER_TOKEN = 'SYNTHETIC_ONLY';
  });
  afterEach(() => {
    process.env.YCLIENTS_PARTNER_TOKEN = oldPartner;
    jest.restoreAllMocks();
  });
  function transport(
    options: {
      permissions?: unknown;
      stores?: unknown;
      good?: unknown;
      post?: unknown;
      doc?: unknown;
      lines?: unknown;
      fail?: string;
      httpStatus?: number;
      lineMeta?: unknown;
    } = {},
  ) {
    const calls: Array<{
      path: string;
      method: string;
      body: Record<string, unknown> | null;
    }> = [];
    jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      expect(init?.redirect).toBe('error');
      const p = route(input);
      calls.push({
        path: p,
        method: init?.method ?? 'GET',
        body:
          typeof init?.body === 'string'
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : null,
      });
      if (p === options.fail)
        return Promise.reject(new Error('offline lost reply'));
      const data: unknown =
        p === 'user/permissions/5'
          ? (options.permissions ?? permission())
          : p === 'storages/5'
            ? (options.stores ?? [{ id: 9, title: 'Test store' }])
            : p === 'goods/5/123'
              ? (options.good ?? [rawGood()])
              : p === 'storage_operations/operation/5'
                ? (options.post ?? { document: document() })
                : p === 'storage_operations/documents/5/900'
                  ? (options.doc ?? document())
                  : p === 'storage_operations/documents/goods_transactions/900'
                    ? (options.lines ?? [transaction()])
                    : undefined;
      if (data === undefined) throw new Error('Undeclared route ' + p);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data,
            ...(p === 'storage_operations/documents/goods_transactions/900'
              ? {
                  meta:
                    options.lineMeta === undefined
                      ? { count: 1 }
                      : options.lineMeta,
                }
              : {}),
          }),
          {
            status: options.httpStatus ?? 200,
          },
        ),
      );
    });
    return calls;
  }
  it('pins official schema required fields and the exact unresolved provider scope fields', () => {
    expect(official.sourceSha256).toBe(
      '9ba4c2deca4197aeee333c95b4d641f19073ef91b40279b0fc83651bd502157b',
    );
    const schema =
      official.schemas.storage_operation_operation_request_data_types;
    expect(schema.required!).toEqual([
      'create_date',
      'goods_transactions',
      'storage_id',
      'type_id',
    ]);
    expect(schema.properties!.create_date).toMatchObject({
      type: 'string',
      format: 'date-time',
    });
    expect(schema.properties!.goods_transactions).toMatchObject({
      type: 'array',
      items: { type: 'object' },
    });
    expect(schema.properties!.transactions).toBeUndefined();
    for (const key of ['storages_ids', 'storages_transactions_types'])
      expect(official.storagePermissions.properties![key]).toMatchObject({
        type: 'array',
        items: { type: 'object' },
      });
    expect(
      official.storagePermissions.properties!.storages_ids.items!.properties,
    ).toBeUndefined();
  });
  it.each(
    [[], [9], [{ id: 9 }], true, false, null].map((value) => ({ value })),
  )(
    'real current reader never invents selected-store/type permission from %j',
    async ({ value }) => {
      const p = permission();
      p.storages.storages_ids = value;
      p.storages.storages_transactions_types = value;
      const calls = transport({ permissions: p });
      const c = await adapter().readGoodsReceiptContext('tenant', '123', '9');
      expect(c.can_receive).toBe(false);
      expect(c.blockers).toEqual([...YCLIENTS_RECEIPT_SCOPE_BLOCKERS]);
      expect(c.store).toEqual({ id: '9', name: 'Test store', company_id: '5' });
      expect(c.goods.item).toMatchObject({
        sale_price: '100',
        cost_price: '40',
        unit_cost_price: '4',
        sale_unit_id: '11',
        write_off_unit_id: '22',
      });
      expect(calls.map((x) => [x.method, x.path])).toEqual([
        ['GET', 'user/permissions/5'],
        ['GET', 'storages/5'],
        ['GET', 'goods/5/123'],
      ]);
    },
  );
  it('real writer stops at the exact schema scope blocker before POST or owner callback', async () => {
    const calls = transport(),
      owner = jest.fn().mockResolvedValue(undefined);
    await expect(
      adapter().createGoodsReceipt('tenant', args(), Date.now() + 20000, owner),
    ).rejects.toThrow(YCLIENTS_RECEIPT_SCOPE_BLOCKERS[0]);
    expect(owner).not.toHaveBeenCalled();
    expect(calls.every((x) => x.method === 'GET')).toBe(true);
  });
  it.each([
    'storages_access',
    'storages_transactions_access',
    'storages_create_transactions_access',
    'storages_create_transactions_buy_access',
  ])('requires explicit provider %s', async (key) => {
    const p = permission();
    p.storages[key] = false;
    transport({ permissions: p });
    await expect(
      adapter().readGoodsReceiptContext('tenant', '123', '9'),
    ).rejects.toThrow('yclients_receipt_provider_permission_denied');
  });
  it.each(
    [
      [{ id: 8, title: 'Other' }],
      [
        { id: 9, title: 'A' },
        { id: 9, title: 'B' },
      ],
      [],
    ].map((stores) => ({ stores })),
  )('refuses absent or ambiguous exact store %j', async ({ stores }) => {
    transport({ stores });
    await expect(
      adapter().readGoodsReceiptContext('tenant', '123', '9'),
    ).rejects.toThrow();
  });
  it('separates permission-day uncertainty and rejects IDs before fetch', async () => {
    const p = permission();
    p.storages.storages_create_last_days_count = 0;
    const calls = transport({ permissions: p });
    expect(
      (await adapter().readGoodsReceiptContext('tenant', '123', '9')).blockers,
    ).toContain('yclients_receipt_permission_day_window_unqualified');
    const count = calls.length;
    await expect(
      adapter().readGoodsReceiptContext('tenant', '../123', '9'),
    ).rejects.toThrow();
    expect(calls).toHaveLength(count);
  });
  it.each([
    ['11', 1],
    ['22', 2],
  ] as const)(
    'serializes declared unit %s as operation type %d without conversion, catalog mutation or fabricated document',
    (unit, type) => {
      const c = qualifiedTestContext(),
        p = args(c, { unit_id: unit }),
        before = JSON.stringify(c);
      const body = yclientsReceiptBody(p, c);
      const schema =
        official.schemas.storage_operation_operation_request_data_types;
      for (const k of Object.keys(body))
        expect(schema.properties![k]).toBeDefined();
      for (const k of schema.required!) expect(body).toHaveProperty(k);
      const row = body.goods_transactions[0],
        rowSchema =
          official.schemas
            .storage_operation_good_transaction_request_data_types;
      for (const [k, v] of Object.entries(row)) {
        expect(rowSchema.properties![k].type).toBe('number');
        expect(typeof v).toBe('number');
      }
      expect(body).toEqual({
        type_id: 3,
        storage_id: 9,
        create_date: p.received_at,
        goods_transactions: [
          {
            good_id: 123,
            operation_unit_type: type,
            amount: 2.5,
            cost_per_unit: 10.25,
            discount: 0,
            cost: 25.625,
          },
        ],
      });
      expect(JSON.stringify(body)).not.toMatch(
        /supplier|photo|review|document_id|actual_cost|unit_equals|unit_id/,
      );
      expect(JSON.stringify(c)).toBe(before);
      expect(c.goods.item.sale_price).toBe('100');
    },
  );
  it('refuses numeric wire rounding and ambiguous equal-unit mapping', () => {
    expect(receiptWireNumber('0.000001')).toBe(0.000001);
    expect(() => receiptWireNumber('999999999999.123456')).toThrow();
    const c = qualifiedTestContext();
    c.goods.item.write_off_unit_id = '11';
    expect(() => yclientsReceiptBody(args(c), c)).toThrow(
      'yclients_receipt_unit_mapping_ambiguous',
    );
  });
  it('WIRE ONLY: one schema POST then attributed document/line GETs; final owner check follows fresh source', async () => {
    const calls = transport(),
      a = adapter(),
      c = qualifiedTestContext(),
      owner = jest.fn().mockResolvedValue(undefined);
    const source = jest
      .spyOn(a, 'readGoodsReceiptContext')
      .mockResolvedValue(c);
    const result = await a.createGoodsReceipt(
      'tenant',
      args(c),
      Date.now() + 20000,
      owner,
    );
    expect(source).toHaveBeenCalledTimes(1);
    expect(owner).toHaveBeenCalledTimes(1);
    expect(source.mock.invocationCallOrder[0]).toBeLessThan(
      owner.mock.invocationCallOrder[0],
    );
    expect(result).toEqual({
      receipt_id: '900',
      observed: {
        company_id: '5',
        goods_id: '123',
        store_id: '9',
        quantity: '2.5',
        unit_id: '11',
        unit_cost: '10.25',
        line_total: '25.625',
        currency: 'RUB',
        received_at: '2026-10-07T09:00:00Z',
      },
    });
    expect(calls.map((x) => [x.method, x.path])).toEqual([
      ['POST', 'storage_operations/operation/5'],
      ['GET', 'storage_operations/documents/5/900'],
      ['GET', 'storage_operations/documents/goods_transactions/900'],
    ]);
    expect(calls[0].body).toEqual(yclientsReceiptBody(args(c), c));
  });
  it('WIRE ONLY: refuses changed current source or revoked final owner before any POST', async () => {
    const calls = transport(),
      a = adapter(),
      c = qualifiedTestContext(),
      p = args(c);
    c.goods.item.sale_price = '101';
    jest.spyOn(a, 'readGoodsReceiptContext').mockResolvedValue(c);
    await expect(
      a.createGoodsReceipt('tenant', p, Date.now() + 20000, () =>
        Promise.resolve(),
      ),
    ).rejects.toThrow('yclients_receipt_source_changed');
    const owner = jest.fn().mockRejectedValue(new Error('revoked'));
    await expect(
      a.createGoodsReceipt('tenant', args(c), Date.now() + 20000, owner),
    ).rejects.toThrow('yclients_receipt_owner_revoked_before_dispatch');
    expect(calls).toHaveLength(0);
  });
  it('classifies failed source reads before POST as a definitive refusal', async () => {
    const calls = transport(),
      a = adapter();
    jest
      .spyOn(a, 'readGoodsReceiptContext')
      .mockRejectedValue(new Error('read timed out'));
    await expect(
      a.createGoodsReceipt('tenant', args(), Date.now() + 20000, () =>
        Promise.resolve(),
      ),
    ).rejects.toThrow('yclients_receipt_predispatch_source_unavailable');
    expect(calls).toHaveLength(0);
  });
  it.each([
    'storage_operations/operation/5',
    'storage_operations/documents/5/900',
    'storage_operations/documents/goods_transactions/900',
  ])(
    'WIRE ONLY: %s failure stays UNKNOWN, no retry, retains only verified acknowledgment identity',
    async (fail) => {
      const calls = transport({ fail }),
        a = adapter(),
        c = qualifiedTestContext();
      jest.spyOn(a, 'readGoodsReceiptContext').mockResolvedValue(c);
      await expect(
        a.createGoodsReceipt('tenant', args(c), Date.now() + 20000, () =>
          Promise.resolve(),
        ),
      ).rejects.toMatchObject({
        name: 'YclientsGoodsReceiptUnknownError',
        acknowledgedDocumentId:
          fail === 'storage_operations/operation/5' ? null : '900',
      });
      expect(calls.filter((x) => x.method === 'POST')).toHaveLength(1);
    },
  );
  it('WIRE ONLY: redirect rejection after POST remains UNKNOWN with no resend', async () => {
    const a = adapter(),
      c = qualifiedTestContext();
    jest.spyOn(a, 'readGoodsReceiptContext').mockResolvedValue(c);
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((_input, init) => {
        expect(init?.redirect).toBe('error');
        return Promise.reject(new TypeError('fetch redirect rejected'));
      });
    await expect(
      a.createGoodsReceipt('tenant', args(c), Date.now() + 20000, () =>
        Promise.resolve(),
      ),
    ).rejects.toMatchObject({
      name: 'YclientsGoodsReceiptUnknownError',
      acknowledgedDocumentId: null,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    { count: 2 },
    { count: 0 },
    { count: [1] },
    { count: [[1]] },
    {},
    null,
  ])(
    'WIRE ONLY: missing or contradictory total %j cannot prove complete readback',
    async (lineMeta) => {
      const calls = transport({ lineMeta }),
        a = adapter(),
        c = qualifiedTestContext();
      jest.spyOn(a, 'readGoodsReceiptContext').mockResolvedValue(c);
      await expect(
        a.createGoodsReceipt('tenant', args(c), Date.now() + 20000, () =>
          Promise.resolve(),
        ),
      ).rejects.toMatchObject({
        name: 'YclientsGoodsReceiptUnknownError',
        acknowledgedDocumentId: '900',
      });
      expect(calls.filter((x) => x.method === 'POST')).toHaveLength(1);
    },
  );
  it.each([
    {},
    { document: { ...document(), company_id: 6 } },
    { document: { ...document(), create_date: 1493128800 } },
  ])(
    'WIRE ONLY: malformed or foreign acknowledgment is never success',
    async (post) => {
      const calls = transport({ post }),
        a = adapter(),
        c = qualifiedTestContext();
      jest.spyOn(a, 'readGoodsReceiptContext').mockResolvedValue(c);
      await expect(
        a.createGoodsReceipt('tenant', args(c), Date.now() + 20000, () =>
          Promise.resolve(),
        ),
      ).rejects.toBeInstanceOf(YclientsGoodsReceiptUnknownError);
      expect(calls).toHaveLength(1);
    },
  );
  it.each([
    { company_id: 6 },
    { document_id: 901 },
    { storage_id: 8 },
    { good_id: 124 },
    { unit_id: 22 },
    { operation_unit_type: 2 },
    { operation_unit_type: [1] },
    { type_id: [3] },
    { type_id: 1 },
    { amount: -2.5 },
    { amount: 3 },
    { discount: 1 },
    { cost: 25.6 },
    { deleted: true },
    { create_date: 1493128800 },
    { create_date: '2026-02-30T09:00:00Z' },
  ])('attributed readback refuses %j', (patch) => {
    expect(() =>
      yclientsReceiptReadback(
        document(),
        [{ ...transaction(), ...patch }],
        '900',
        args(),
        1,
      ),
    ).toThrow();
  });
  it('preserves incoming decimal lexemes before binary floating point rounding', () => {
    const data = parseGoodsResponseJson(
      '{"amount":2.5000000000000001,"cost":1e2,"comment":"amount: 1.25","deleted":false}',
    ) as Record<string, unknown>;
    expect(data).toEqual({
      amount: '2.5000000000000001',
      cost: '1e2',
      comment: 'amount: 1.25',
      deleted: false,
    });
    expect(() =>
      yclientsReceiptReadback(
        document(),
        [{ ...transaction(), amount: data.amount }],
        '900',
        args(),
        1,
      ),
    ).toThrow();
    expect(() => parseGoodsResponseJson('{"amount":01}')).toThrow();
    expect(() => parseGoodsResponseJson('{"amount":1.}')).toThrow();
    expect(() => parseGoodsResponseJson('{1:2}')).toThrow();
    expect(
      parseGoodsResponseJson(JSON.stringify({ text: 'quote " 123 \\ 4.5' })),
    ).toEqual({ text: 'quote " 123 \\ 4.5' });
  });
  it('requires exactly one line and strips all unexpected provider fields', () => {
    for (const lines of [[], [transaction(), transaction()], null])
      expect(() =>
        yclientsReceiptReadback(document(), lines, '900', args(), 1),
      ).toThrow();
    const result = yclientsReceiptReadback(
      { ...document(), private: 'PRIVATE' },
      [{ ...transaction(), raw_ocr: 'PRIVATE', client: { phone: 'PRIVATE' } }],
      '900',
      args(),
      1,
    );
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });
});
