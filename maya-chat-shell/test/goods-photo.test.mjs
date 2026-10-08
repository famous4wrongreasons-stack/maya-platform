// Headless, fully synthetic proof. No model/OCR/provider/HTTP acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoodsPhoto } from '../src/shell/goods-photo.ts';
import { createConversation } from '../src/shell/conversation.ts';
import { projectGoodsPhotoPreview, projectGoodsPhotoSearch, projectGoodsPhotoItem, projectGoodsPhotoReview } from '../src/net/goods-photo.ts';
import { conversationId, sourceRevision, photoSha256, context, preview, search, item, review } from './goods-photo-fixtures.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));
function observable(initial) { let current = initial; const listeners = new Set(); return { view: () => current, subscribe: fn => (listeners.add(fn), () => listeners.delete(fn)), set: patch => { current = { ...current, ...patch }; for (const fn of [...listeners]) fn(current); } }; }
function setup(options = {}) {
  const session = observable({ signedIn: true }), privacy = observable({ localEpoch: 0 });
  const calls = [], chats = [], resolutions = [];
  let serial = 0, ownerSerial = 0;
  const ownerTurn = raw => ({ ...raw, user_turn: { ...raw.user_turn, turnId: `2333be6e-bca6-4df0-8405-${String(++ownerSerial).padStart(12, '0')}` } });
  const transport = { chat: async request => { chats.push(request); return { ok: true, value: { reply: 'server chat reply', userTurn: { conversationId, turnId: 'new' } } }; }, conversation: async () => ({ ok: true, value: { conversationId: options.empty ? null : conversationId, turns: options.turns ?? [], truncated: false, interrupted: false } }) };
  for (const method of ['goodsPhotoPreview', 'goodsPhotoSearch', 'goodsPhotoItem', 'goodsPhotoReview']) {
    transport[method] = (request, signal) => {
      const call = { method, request, signal }; calls.push(call);
      if (options.defer === method) return new Promise(resolve => call.resolve = resolve);
      if (options.fail === method) return Promise.resolve({ ok: false, failure: { reason: options.failure ?? 'unknown' } });
      let value;
      if (method === 'goodsPhotoPreview') value = projectGoodsPhotoPreview(preview());
      if (method === 'goodsPhotoSearch') value = projectGoodsPhotoSearch(ownerTurn(search()), request);
      if (method === 'goodsPhotoItem') value = projectGoodsPhotoItem(ownerTurn(item()), request);
      if (method === 'goodsPhotoReview') value = projectGoodsPhotoReview(ownerTurn({ ...review(), ...(options.status ? { status: options.status, resolution: null } : {}) }), request);
      assert.notEqual(value, null, 'synthetic backend conforms to the actual projection');
      return Promise.resolve({ ok: true, value });
    };
  }
  const conversation = createConversation({ session, transport, scheduler: { now: () => 1 }, newAbort: () => new AbortController(), newRequestId: () => `chat_request_${++serial}`, ingestResolution: value => { resolutions.push(value); return 'approval_presented'; } });
  const port = createGoodsPhoto({ session, privacy, transport: options.unsupported ? {} : transport, conversation, newAbort: () => new AbortController(), newId: () => `photo_request_${++serial}` });
  const ready = async () => { await flush(); port.open(); await port.upload(new Blob(['abcdefghijkl'], { type: 'image/png' })); };
  const detail = async () => { await ready(); port.selectLine(1); port.editQuery('шампунь'); await port.search(); await port.selectItem('22'); };
  const fields = { storeId: '3', quantity: '1.250', unitId: '1', unitCost: '12.30', currency: 'RUB', receivedAt: '2026-10-08T10:00:00+03:00', priceKind: 'receipt_purchase_unit' };
  return { port, conversation, session, privacy, calls, chats, resolutions, ready, detail, fields, dispose() { port.dispose(); conversation.dispose(); } };
}
test('preview adds no chat and performs no lookup; explicit item selection keeps all review fields blank', async () => {
  const s = setup(); await s.ready();
  assert.deepEqual(s.calls.map(c => c.method), ['goodsPhotoPreview']);
  assert.deepEqual(s.conversation.view().items, []);
  assert.equal(s.port.view().selectedLine, null);
  s.port.selectLine(1); assert.equal(s.port.view().query, '');
  await s.port.search(); assert.equal(s.calls.length, 1);
  s.port.editQuery('шампунь'); await s.port.search();
  assert.equal(s.port.view().matches.length, 2);
  await s.port.selectItem('11'); await s.port.selectItem('foreign'); assert.equal(s.calls.length, 2);
  await s.port.selectItem('22'); assert.equal(s.calls.length, 3);
  assert.equal(s.port.view().item.salePrice, '999.00');
  assert.equal(Object.values(s.port.view().review).every(v => v === ''), true);
  for (const call of s.calls.slice(1)) { assert.equal(call.request.conversationId, conversationId); assert.equal(call.request.source_revision, sourceRevision); }
  assert.equal(JSON.stringify(s.port.view()).includes(sourceRevision), false);
  assert.equal(JSON.stringify(s.port.view()).includes(photoSha256), false);
  assert.equal(s.conversation.view().items.filter(i => i.kind === 'user').length, 2);
  await s.port.review(); assert.equal(s.calls.length, 3);
  s.dispose();
});
test('exact correction prepares one version, sends canonical owner resolution, and only explicit changed draft advances', async () => {
  const s = setup(); await s.detail(); s.port.editReview(s.fields);
  const first = s.port.review(); const duplicate = s.port.review(); await Promise.all([first, duplicate]);
  assert.equal(s.resolutions.length, 1);
  const firstCall = s.calls.at(-1);
  assert.equal(firstCall.request.proposal.review_version, 1);
  assert.equal(firstCall.request.proposal.unit_cost, '12.30');
  assert.equal(firstCall.request.proposal.quantity, '1.250');
  assert.equal(firstCall.request.proposal.price_kind, 'receipt_purchase_unit');
  await s.port.review(); assert.equal(s.calls.length, 4);
  s.port.editReview({ unitCost: '12.30' }); await s.port.review(); assert.equal(s.calls.length, 4);
  s.port.editReview({ unitCost: '13.00' }); await s.port.review();
  assert.equal(s.calls.at(-1).request.proposal.review_version, 2);
  assert.equal(s.calls.at(-1).request.proposal.unit_cost, '13.00');
  assert.equal(s.resolutions.length, 2);
  assert.equal(s.conversation.view().items.some(i => i.notice === 'approval_not_here'), false);
  assert.equal(s.conversation.view().items.filter(i => i.kind === 'user').every(i => i.text === 'Проверить выбранный товар.' && i.state === 'sent' && i.retry.retry === 'none'), true);
  s.dispose();
});
test('response loss blocks every repeat/edit path; held and completed are terminal', async () => {
  for (const options of [{ fail: 'goodsPhotoReview' }, { status: 'held' }, { status: 'completed' }]) {
    const s = setup(options); await s.detail(); s.port.editReview(s.fields); await s.port.review();
    assert.equal(s.port.view().phase, options.fail ? 'uncertain' : 'reviewed');
    const before = s.port.view();
    s.port.editReview({ quantity: '20' }); s.port.editQuery('другое'); s.port.selectLine(1); s.port.open();
    await s.port.search(); await s.port.selectItem('22'); await s.port.review(); await s.port.upload(new Blob(['abcdefghijkl'], { type: 'image/png' }));
    assert.equal(s.calls.length, 4); assert.equal(s.port.view(), before);
    s.port.abort(); assert.equal(s.port.view().phase, 'closed'); assert.equal(s.port.view().lines.length, 0);
    s.dispose();
  }
});
test('single photo flight locks chat; close aborts request and suppresses late result', async () => {
  const s = setup({ defer: 'goodsPhotoPreview' }); await flush(); s.port.open();
  const pending = s.port.upload(new Blob(['abcdefghijkl'], { type: 'image/png' }));
  await s.port.upload(new Blob(['abcdefghijkl'], { type: 'image/png' }));
  assert.equal(s.calls.length, 1); assert.equal(s.conversation.view().inFlight, true);
  assert.deepEqual(s.conversation.submitUserTurn('concurrent', { modality: 'typed' }), { accepted: false, refusal: 'in_flight' });
  s.port.abort(); assert.equal(s.calls[0].signal.aborted, true);
  s.calls[0].resolve({ ok: true, value: projectGoodsPhotoPreview(preview()) }); await pending;
  assert.equal(s.port.view().phase, 'closed'); assert.deepEqual(s.port.view().lines, []);
  assert.deepEqual(s.conversation.view().items, []); assert.equal(s.conversation.view().inFlight, false);
  s.dispose();
});
test('privacy epoch and signout erase fields, abort detail and never resurrect a late canonical turn', async () => {
  for (const action of ['privacy', 'signout']) {
    const s = setup({ defer: 'goodsPhotoItem' }); await s.ready(); s.port.selectLine(1); await s.port.search('шампунь');
    const pending = s.port.selectItem('22'), call = s.calls.at(-1);
    if (action === 'privacy') { s.conversation.freezeForErasure(s.conversation.erasureTarget()); s.privacy.set({ localEpoch: 1 }); }
    else s.session.set({ signedIn: false });
    assert.equal(call.signal.aborted, true);
    call.resolve({ ok: true, value: projectGoodsPhotoItem(item(), { ...context, goods_id: '22' }) }); await pending;
    assert.equal(s.port.view().phase, 'closed'); assert.equal(s.port.view().item, null); assert.deepEqual(s.conversation.view().items, []);
    assert.equal(s.port.view().query, ''); s.dispose();
  }
});
test('source refusal preserves original witness and does not perform automatic lookup/review', async () => {
  const s = setup({ fail: 'goodsPhotoItem', failure: 'conflict' }); await s.ready(); s.port.selectLine(1); await s.port.search('шампунь'); await s.port.selectItem('22');
  assert.equal(s.port.view().failure, 'conflict'); assert.equal(s.port.view().item, null);
  await s.port.review(); assert.equal(s.calls.length, 3);
  await s.port.search(); assert.equal(s.calls.at(-1).request.source_revision, sourceRevision);
  s.dispose();
});
test('absent transport is honestly unavailable without fabricated transcript', async () => {
  const s = setup({ unsupported: true }); await s.ready();
  assert.equal(s.port.view().failure, 'unavailable'); assert.deepEqual(s.conversation.view().items, []); s.dispose();
});
test('canonical operation refuses foreign conversation and duplicate canonical turns do not reanimate widgets', async () => {
  const s = setup(); await flush(); const response = projectGoodsPhotoReview(review(), context);
  const run = value => s.conversation.runGoodsPhotoOperation('review', async () => ({ ok: true, value }), new AbortController().signal);
  assert.equal((await run({ ...response, turn: { ...response.turn, conversationId: 'foreign' } })).ok, false);
  assert.equal(s.conversation.view().items.length, 0);
  await run(response); await run(response);
  assert.equal(s.conversation.view().items.length, 2); assert.equal(s.resolutions.length, 1);
  assert.equal((await s.conversation.runGoodsPhotoOperation('item', async () => ({ ok: true, value: response }), new AbortController().signal)).ok, false);
  s.dispose();
});

test('restored completed canonical review remains display-only on explicit stable replay', async () => {
  const raw = review(), s = setup({ turns: [{ id: raw.user_turn.turnId, role: 'user', text: raw.user_text, completed: true }, { id: 'assistant', role: 'assistant', text: raw.reply, completed: true }] });
  await flush(); const before = s.conversation.view().items.length;
  await s.conversation.runGoodsPhotoOperation('review', async () => ({ ok: true, value: projectGoodsPhotoReview(raw, context) }), new AbortController().signal);
  assert.equal(s.conversation.view().items.length, before);
  assert.equal(s.resolutions.length, 0, 'historical approval controls remain inert');
  s.dispose();
});

test('successful busy-to-idle publication cannot resurrect fields after a synchronous subscriber reset', async () => {
  for (const operation of ['upload', 'detail']) for (const reset of ['abort', 'signout', 'privacy']) {
    const s = setup(); await flush();
    if (operation === 'detail') { await s.ready(); s.port.selectLine(1); await s.port.search('шампунь'); }
    else s.port.open();
    let wasBusy = false, triggered = false;
    const off = s.port.subscribe(view => {
      if (view.busy !== null) wasBusy = true;
      if (!triggered && wasBusy && view.busy === null) {
        triggered = true;
        if (reset === 'abort') s.port.abort();
        if (reset === 'signout') s.session.set({ signedIn: false });
        if (reset === 'privacy') s.privacy.set({ localEpoch: 1 });
      }
    });
    if (operation === 'upload') await s.port.upload(new Blob(['abcdefghijkl'], { type: 'image/png' }));
    else await s.port.selectItem('22');
    assert.equal(triggered, true);
    assert.equal(s.port.view().phase, 'closed'); assert.equal(s.port.view().item, null);
    assert.deepEqual(s.port.view().lines, []); assert.equal(s.port.view().query, '');
    off(); s.dispose();
  }
});

test('reset queued between operation settlement and caller continuation cannot reapply the response', async () => {
  for (const operation of ['upload', 'detail']) {
    const s = setup(); await flush();
    if (operation === 'detail') { await s.ready(); s.port.selectLine(1); await s.port.search('шампунь'); }
    else s.port.open();
    let wasInFlight = false, queued = false;
    const off = s.conversation.subscribe(view => {
      if (view.inFlight) wasInFlight = true;
      if (wasInFlight && !view.inFlight && !queued) {
        queued = true;
        // First microtask runs before run() resumes; the nested reset runs after its return but
        // before upload/selectItem's await continuation. This covers both publication boundaries.
        queueMicrotask(() => queueMicrotask(() => s.port.abort()));
      }
    });
    if (operation === 'upload') await s.port.upload(new Blob(['abcdefghijkl'], { type: 'image/png' }));
    else await s.port.selectItem('22');
    assert.equal(queued, true); assert.equal(s.port.view().phase, 'closed');
    assert.deepEqual(s.port.view().lines, []); assert.equal(s.port.view().item, null);
    off(); s.dispose();
  }
});

test('reset during initial search/detail publication prevents dispatch from the closed form', async () => {
  for (const operation of ['search', 'detail']) {
    const s = setup(); await s.ready(); s.port.selectLine(1);
    if (operation === 'detail') await s.port.search('шампунь');
    const count = s.calls.length;
    let triggered = false;
    const off = s.port.subscribe(view => {
      if (!triggered && (operation === 'search' ? view.query === 'шампунь' : view.item === null)) {
        triggered = true; s.port.abort();
      }
    });
    if (operation === 'search') await s.port.search('шампунь');
    else await s.port.selectItem('22');
    assert.equal(triggered, true); assert.equal(s.calls.length, count);
    assert.equal(s.port.view().phase, 'closed');
    off(); s.dispose();
  }
});

test('conversation subscriber erasure/signout before attachment dispatch makes no transport call', async () => {
  for (const reset of ['signout', 'privacy']) {
    const s = setup(); await flush(); s.port.open();
    let triggered = false;
    const off = s.conversation.subscribe(view => {
      if (!triggered && view.inFlight) {
        triggered = true;
        if (reset === 'signout') s.session.set({ signedIn: false });
        else { s.conversation.freezeForErasure(s.conversation.erasureTarget()); s.privacy.set({ localEpoch: 1 }); }
      }
    });
    await s.port.upload(new Blob(['abcdefghijkl'], { type: 'image/png' }));
    assert.equal(triggered, true); assert.equal(s.calls.length, 0);
    assert.equal(s.port.view().phase, 'closed');
    off(); s.dispose();
  }
});
