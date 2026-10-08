import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransport } from '../src/net/client.ts';
import { projectGoodsPhotoContext, projectGoodsPhotoPreview, projectGoodsPhotoSearch, projectGoodsPhotoItem, projectGoodsPhotoProposal, projectGoodsPhotoReview } from '../src/net/goods-photo.ts';
import { context, sourceRevision, preview, search, item, proposal, review } from './goods-photo-fixtures.mjs';
const signal = () => new AbortController().signal;
function net(responses) {
  const calls = []; let authorizations = 0, refreshes = 0, refused = 0;
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); const next = responses.shift(); if (next instanceof Error) throw next; return new Response(JSON.stringify(next?.body), { status: next?.status ?? 200 }); };
  const auth = { authorize: async () => { authorizations++; return { kind: 'bearer', serial: 1, bearer: 'synthetic' }; }, reauthorize: async () => { refreshes++; return { kind: 'bearer', serial: 2, bearer: 'synthetic-next' }; }, refused: () => refused++ };
  return { transport: createTransport(auth, { requestMs: 1000, transcribeMs: 1000 }), calls, counts: () => ({ authorizations, refreshes, refused }) };
}
test('finite projections preserve exact decimals and strip source authority; malformed and drift refuse', () => {
  const p = projectGoodsPhotoPreview({ ...preview(), raw_ocr: 'secret', tenantId: 'foreign' });
  assert.equal(p.lines[0].unitPrice, '999.00'); assert.equal(p.lines[0].priceKind, 'sale_unit');
  assert.equal('raw_ocr' in p, false); assert.equal('tenantId' in p, false);
  const s = projectGoodsPhotoSearch(search(), { ...context, query: 'шампунь' });
  assert.equal(s.matches[0].kind, 'category'); assert.equal('company_id' in s, false);
  const detail = projectGoodsPhotoItem(item(), { ...context, goods_id: '22' });
  assert.equal(detail.item.salePrice, '999.00'); assert.equal(detail.item.stock.rows[0].quantity, '-2.5');
  for (const raw of [{ ...preview(), source_revision: '' }, { ...preview(), original_stored: true }]) assert.equal(projectGoodsPhotoPreview(raw), null);
  assert.equal(projectGoodsPhotoSearch({ ...search(), source_revision: 'c'.repeat(64) }, { ...context, query: 'шампунь' }), null);
  assert.equal(projectGoodsPhotoItem(item(), { ...context, goods_id: '23' }), null);
  assert.equal(projectGoodsPhotoItem({ ...item(), source_revision: 'c'.repeat(64) }, { ...context, goods_id: '22' }), null);
  assert.equal(projectGoodsPhotoProposal({ ...proposal(), received_at: '2026-02-30T10:00:00Z' }), null);
  assert.equal(projectGoodsPhotoProposal({ ...proposal(), quantity: '0' }), null);
  assert.equal(projectGoodsPhotoProposal({ ...proposal(), unit_cost: 12.3 }), null);
  assert.equal(projectGoodsPhotoContext({ ...context, source_revision: '' }), null);
});
test('certified approval with assistant correlation passes; wrong kind/capability and contradictory status refuse', () => {
  const raw = review(), projected = projectGoodsPhotoReview(raw, context);
  assert.equal(projected.status, 'approval_required');
  assert.equal(projected.resolution.receipt.envelope, raw.resolution.receipt.envelope);
  assert.notEqual(raw.resolution.receipt.envelope.correlation.turn_id, raw.user_turn.turnId);
  for (const mutate of [r => r.resolution.receipt.envelope.source.capability = 'other', r => r.resolution.receipt.envelope.kind = 'NOTICE', r => r.status = 'completed', r => r.resolution = null, r => r.user_turn.conversationId = 'foreign']) {
    const invalid = review(); mutate(invalid); assert.equal(projectGoodsPhotoReview(invalid, context), null);
  }
  assert.equal(projectGoodsPhotoReview({ ...review(), status: 'held', resolution: null }, context).status, 'held');
});
test('multipart uses one fixed photo name, no manual boundary or original filename; default parser unavailable is explicit', async () => {
  const n = net([{ status: 503, body: { message: 'goods_photo_parser_not_configured' } }]);
  const result = await n.transport.goodsPhotoPreview(new File(['abcdefghijkl'], 'private original name.png', { type: 'image/png' }), signal());
  assert.deepEqual(result, { ok: false, failure: { reason: 'recognition_unavailable' } });
  assert.equal(n.calls[0].url, '/api/ai/goods/photo-preview');
  const { headers, body } = n.calls[0].init;
  assert.equal(headers['Content-Type'], undefined); assert.equal(headers.Authorization, 'Bearer synthetic');
  assert.deepEqual([...body.keys()], ['photo']); assert.equal(body.get('photo').name, 'invoice.png');
  await n.transport.goodsPhotoPreview(new Blob(['a'], { type: 'image/png' }), signal());
  await n.transport.goodsPhotoPreview(new Blob(['a'.repeat(12)], { type: 'image/svg+xml' }), signal());
  assert.equal(n.calls.length, 1);
});
test('JSON DTOs stay closed, preserve current conversation and witness, and invalid input makes no request', async () => {
  const n = net([{ body: search() }, { body: item() }, { body: review() }]);
  assert.equal((await n.transport.goodsPhotoSearch({ ...context, query: '  шампунь ', tenantId: 'foreign' }, signal())).ok, true);
  assert.equal((await n.transport.goodsPhotoItem({ ...context, goods_id: '22', authority: 'owner' }, signal())).ok, true);
  assert.equal((await n.transport.goodsPhotoReview({ ...context, proposal: { ...proposal(), tenantId: 'foreign' }, role: 'owner' }, signal())).ok, true);
  const bodies = n.calls.map(call => JSON.parse(call.init.body));
  assert.deepEqual(bodies[0], { ...context, query: 'шампунь' });
  assert.deepEqual(bodies[1], { ...context, goods_id: '22' });
  assert.deepEqual(bodies[2], { ...context, proposal: proposal() });
  assert.equal((await n.transport.goodsPhotoReview({ ...context, proposal: { ...proposal(), price_kind: 'sale_unit' } }, signal())).failure.reason, 'invalid_request');
  assert.equal(n.calls.length, 3);
});
test('review loss or malformed success stays unknown with no resend; 401 refresh is bounded', async () => {
  for (const response of [new TypeError('lost'), { status: 200, body: {} }, { status: 503, body: {} }]) {
    const n = net([response]);
    assert.equal((await n.transport.goodsPhotoReview({ ...context, proposal: proposal() }, signal())).failure.reason, 'unknown');
    assert.equal(n.calls.length, 1);
  }
  const n = net([{ status: 401 }, { status: 401 }]);
  assert.equal((await n.transport.goodsPhotoSearch({ ...context, query: 'шампунь' }, signal())).failure.reason, 'signed_out');
  assert.equal(n.calls.length, 2); assert.deepEqual(n.counts(), { authorizations: 1, refreshes: 1, refused: 1 });
  assert.equal(JSON.parse(n.calls[1].init.body).source_revision, sourceRevision);
});
test('preview recognizes only exact OCR message and HTTP status pairs, with one request and no retry', async () => {
  const cases = [
    [
      503,
      { message: 'goods_photo_parser_not_configured' },
      'recognition_unavailable',
    ],
    [503, { message: 'goods_photo_ocr_busy' }, 'recognition_busy'],
    ...['timeout', 'unavailable', 'output_limit', 'output_invalid'].map(
      (code) => [
        503,
        { message: `goods_photo_ocr_${code}` },
        'recognition_failed',
      ],
    ),
    [
      400,
      { message: 'goods_photo_ocr_table_unsupported' },
      'unsupported_table',
    ],
    [400, { message: 'goods_photo_ocr_busy' }, 'invalid_photo'],
    [413, { message: 'goods_photo_ocr_table_unsupported' }, 'invalid_photo'],
    [
      503,
      { message: 'goods_photo_ocr_table_unsupported' },
      'source_unavailable',
    ],
    [500, { message: 'goods_photo_ocr_timeout' }, 'unavailable'],
    [403, { message: 'goods_photo_ocr_busy' }, 'forbidden'],
    [409, { message: 'goods_photo_ocr_timeout' }, 'conflict'],
    [200, { message: 'goods_photo_ocr_busy' }, 'unavailable'],
    [503, { message: 'goods_photo_ocr_timeout_extra' }, 'source_unavailable'],
    [503, { message: ['goods_photo_ocr_busy'] }, 'source_unavailable'],
    [
      503,
      {
        error: {
          message: 'goods_photo_ocr_busy',
          code: 'goods_photo_ocr_busy',
        },
      },
      'source_unavailable',
    ],
    [
      503,
      {
        message: 'Current CRM read unavailable',
        error: { code: 'goods_read_source_unavailable' },
      },
      'source_unavailable',
    ],
  ];
  for (const [status, body, reason] of cases) {
    const n = net([{ status, body }]);
    assert.deepEqual(
      await n.transport.goodsPhotoPreview(
        new Blob(['abcdefghijkl'], { type: 'image/png' }),
        signal(),
      ),
      { ok: false, failure: { reason } },
      `${status}: ${JSON.stringify(body)}`,
    );
    assert.equal(n.calls.length, 1);
    assert.deepEqual(n.counts(), {
      authorizations: 1,
      refreshes: 0,
      refused: 0,
    });
  }
});
test('OCR error names do not reclassify source reads or uncertain proposal preparation', async () => {
  for (const message of [
    'goods_photo_parser_not_configured',
    'goods_photo_ocr_busy',
    'goods_photo_ocr_timeout',
    'goods_photo_ocr_unavailable',
    'goods_photo_ocr_output_limit',
    'goods_photo_ocr_output_invalid',
    'goods_photo_ocr_table_unsupported',
  ]) {
    for (const status of [400, 503]) {
      const n = net(
        Array.from({ length: 3 }, () => ({ status, body: { message } })),
      );
      const readReason =
        status === 400 ? 'invalid_request' : 'source_unavailable';
      assert.equal(
        (
          await n.transport.goodsPhotoSearch(
            { ...context, query: 'шампунь' },
            signal(),
          )
        ).failure.reason,
        readReason,
      );
      assert.equal(
        (
          await n.transport.goodsPhotoItem(
            { ...context, goods_id: '22' },
            signal(),
          )
        ).failure.reason,
        readReason,
      );
      assert.equal(
        (
          await n.transport.goodsPhotoReview(
            { ...context, proposal: proposal() },
            signal(),
          )
        ).failure.reason,
        status === 400 ? 'invalid_request' : 'unknown',
      );
      assert.equal(n.calls.length, 3);
    }
  }
});
test('preview error classification does not invoke message accessors or inherit a message', async () => {
  const originalParse = JSON.parse;
  let getterCalls = 0;
  const getter = Object.defineProperty({}, 'message', {
    get() {
      getterCalls++;
      throw new Error('untrusted getter');
    },
  });
  const inherited = Object.create({ message: 'goods_photo_ocr_busy' });
  try {
    for (const body of [getter, inherited]) {
      // JSON cannot carry an accessor. Inject at the parsed-body edge to retain
      // the classifier's own-data-property guarantee without a public test API.
      JSON.parse = (raw, ...args) =>
        raw === '{"descriptorProbe":true}' ? body : originalParse(raw, ...args);
      const n = net([{ status: 503, body: { descriptorProbe: true } }]);
      assert.equal(
        (
          await n.transport.goodsPhotoPreview(
            new Blob(['abcdefghijkl'], { type: 'image/png' }),
            signal(),
          )
        ).failure.reason,
        'source_unavailable',
      );
      assert.equal(n.calls.length, 1);
    }
  } finally {
    JSON.parse = originalParse;
  }
  assert.equal(getterCalls, 0);
});
