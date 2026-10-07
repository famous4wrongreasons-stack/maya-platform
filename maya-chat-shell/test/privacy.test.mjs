// Synthetic runtime proof; no HTTP, database, model, provider or real subject.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createShellRuntime } from '../src/shell/shell.ts';
import { createVoiceControl } from '../src/shell/voice-state.ts';
import { createPersonalBooking } from '../src/shell/personal-booking.ts';
import { bodyHash } from '../src/integrity/h7.ts';
import { render } from '../src/renderer/render.ts';

const conversationId = 'd4325f49-5d17-44e3-9f93-7df35d468b83';
const nextConversationId = '2333be6e-bca6-4df0-8405-9b88e9a8da59';
const erasedAt = '2026-10-07T10:00:00.000Z';
const flush = () => new Promise(resolve => setImmediate(resolve));
const fixture = name => JSON.parse(fs.readFileSync(new URL(`../dev/fixtures/envelopes/h7/invariant/kind-${name}.json`, import.meta.url)));
const deferred = (calls, request, signal) => new Promise(resolve => calls.push({ request, signal, resolve }));
function setup(options = {}) {
  let sessionView = { signedIn: true, display: { userName: 'Synthetic owner', tenantName: 'Fixture' } };
  const sessionListeners = new Set();
  const session = { view: () => sessionView, subscribe: fn => (sessionListeners.add(fn), () => sessionListeners.delete(fn)), set(view) { sessionView = view; for (const fn of [...sessionListeners]) fn(view); } };
  const chats = [], erasures = [], submissions = [], transcripts = [], resolves = [];
  let serial = 0, reads = 0, now = Date.parse('2026-09-17T09:05:00.000Z'), voice = null;
  const scheduler = { now: () => now, after: () => () => {}, frame: () => () => {} };
  const environment = { a11y: () => ({ reduced_motion: false, forced_colors: false, text_scale: 1, pointer: 'fine', keyboard_only_hint: false, caption_preference: false }), onA11yChange: () => () => {}, fragment: () => '', onHidden: () => () => {} };
  const transport = {
    chat: (request, signal) => deferred(chats, request, signal),
    eraseConversation: (request, signal) => deferred(erasures, request, signal),
    conversation: async () => { reads++; return { ok: true, value: { conversationId: options.empty ? null : conversationId, turns: options.empty ? [] : [{ role: 'user', text: 'private history', completed: true }], truncated: false, interrupted: false } }; },
    resolveWidgets: (request, signal) => options.holdReceipts ? deferred(resolves, request, signal) : Promise.resolve({ ok: true, value: { tenant_bound: true, widgets: [] } }),
    transcribe: (request, signal) => deferred(transcripts, request, signal),
  };
  if (options.unsupported) delete transport.eraseConversation;
  const runtime = createShellRuntime({ transport, session, render, environment, scheduler,
    history: { push() {}, back() {}, onBack: () => () => {} },
    newAbort: () => new AbortController(), newId: () => `53046c62-d780-43d5-8d8e-${String(++serial).padStart(12, '0')}`,
    submission: { submit: (request, signal) => deferred(submissions, request, signal) },
    onPrivacyFreeze: () => voice?.cancel(),
  });
  const capture = { availability: () => ({ available: true }), arm: async () => ({ armed: true }), level: () => 0, hold() {}, take: async () => ({ durationMs: 1000, dataUrl: 'data:audio/wav;base64,synthetic' }), cancel() {} };
  voice = createVoiceControl({ capture, transport, conversation: runtime.conversation, scheduler, newAbort: () => new AbortController(), lockSources: () => runtime.widgets.lockSources(), environment, session, widgets: runtime.widgetPort });
  const confirm = () => { runtime.privacy.requestConfirmation(); runtime.privacy.confirmErasure(); };
  const complete = async (index = 0, patch = {}) => {
    const call = erasures[index];
    call.resolve({ ok: true, value: { contract: 'maya.privacy.history-erasure/1', outcome: 'COMPLETED', ...call.request, erasedAt, ...patch } });
    await flush();
  };
  return { ...runtime, session, chats, erasures, submissions, transcripts, resolves, voice, confirm, complete,
    reads: () => reads, advance: ms => { now += ms; }, dispose() { voice.dispose(); runtime.dispose(); } };
}

test('only explicit confirmation for a server-owned current conversation sends erasure', async () => {
  for (const options of [{ empty: true }, { unsupported: true }]) {
    const s = setup(options); await flush();
    assert.equal(s.privacy.view().available, false);
    s.confirm(); assert.equal(s.erasures.length, 0); s.dispose();
  }
  const s = setup(); await flush();
  s.widgetPort.navigate('shell.privacy');
  s.privacy.confirmErasure();
  s.privacy.requestConfirmation();
  s.privacy.cancelConfirmation();
  s.privacy.confirmErasure();
  assert.equal(s.erasures.length, 0);
  assert.equal(s.conversation.view().items.some(item => item.text === 'private history'), true);
  s.confirm(); s.privacy.confirmErasure(); s.privacy.retry();
  assert.equal(s.erasures.length, 1);
  assert.deepEqual(Object.keys(s.erasures[0].request).sort(), ['conversationId', 'requestId']);
  assert.equal(s.erasures[0].request.conversationId, conversationId);
  assert.equal(s.privacy.view().localEpoch, 1);
  assert.deepEqual(s.conversation.view().items, []);
  assert.deepEqual(s.conversation.view().composer, { enabled: false, reason: 'history_erasure' });
  s.dispose();
});

test('lost response freezes actions; manual retry preserves the same tuple and fresh turn has no deleted history', async () => {
  const s = setup(); await flush(); s.confirm();
  s.erasures[0].resolve({ ok: false, failure: { reason: 'unknown' } }); await flush();
  assert.equal(s.privacy.view().phase, 'uncertain');
  assert.equal(s.privacy.view().available, false);
  assert.deepEqual(s.conversation.submitUserTurn('must not send', { modality: 'typed' }), { accepted: false, refusal: 'composer_disabled' });
  s.privacy.requestConfirmation(); s.privacy.cancelConfirmation();
  await flush(); assert.equal(s.erasures.length, 1, 'no automatic retry or new request');
  s.privacy.retry(); s.privacy.retry();
  assert.equal(s.erasures.length, 2);
  assert.equal(s.erasures[0].request, s.erasures[1].request);
  await s.complete(1);
  assert.equal(s.privacy.view().phase, 'completed');
  assert.equal(s.privacy.view().erasedAt, erasedAt);
  assert.equal(s.privacy.view().localEpoch, 1);
  assert.equal(s.reads(), 1, 'completion does not restore a different conversation');
  s.conversation.submitUserTurn('fresh text', { modality: 'typed' });
  assert.deepEqual(s.chats[0].request.messages, [{ role: 'user', content: 'fresh text' }]);
  assert.equal(s.chats[0].request.conversationId, undefined);
  s.chats[0].resolve({ ok: true, value: { reply: 'fresh reply', userTurn: { conversationId: nextConversationId, turnId: 'new-turn' } } }); await flush();
  assert.equal(s.privacy.view().phase, 'idle', 'old completion does not describe the new conversation');
  assert.equal(s.privacy.view().erasedAt, null);
  s.confirm();
  assert.equal(s.erasures[2].request.conversationId, nextConversationId);
  assert.notEqual(s.erasures[2].request.requestId, s.erasures[1].request.requestId);
  s.dispose();
});

test('inflight chat, retained receipt read and stale timeline callbacks cannot resurrect content', async () => {
  const s = setup(); await flush();
  s.conversation.submitUserTurn('late private request', { modality: 'typed' });
  s.confirm(); assert.equal(s.chats[0].signal.aborted, true);
  s.conversation.timeline.appendServerLine('old asynchronous line');
  s.conversation.timeline.appendNotice('history_restored');
  await s.complete();
  s.chats[0].resolve({ ok: true, value: { reply: 'late private reply', userTurn: { conversationId, turnId: 'old-turn' } } }); await flush();
  assert.deepEqual(s.conversation.view().items, []);
  s.dispose();
  const restoring = setup({ holdReceipts: true }); await flush();
  assert.equal(restoring.resolves.length, 1);
  restoring.confirm(); assert.equal(restoring.resolves[0].signal.aborted, true);
  await restoring.complete();
  restoring.resolves[0].resolve({ ok: true, value: { tenant_bound: true, widgets: [{ envelope: fixture('booking-confirmation'), terminal_lines: [{ text: 'deleted receipt must not return' }] }] } }); await flush();
  assert.deepEqual(restoring.conversation.view().items, []);
  restoring.dispose();
});

test('all widget capabilities including detail-only entries are released, and late submission is ignored', async () => {
  const s = setup(); await flush();
  const opener = s.widgets.ingest(fixture('schedule'));
  const shown = s.shell.presentDetail(fixture('booking-confirmation'), { itemId: opener.itemId, ref: 'intent:i1' });
  assert.equal(shown.presented, true);
  const orphan = s.widgets.openDetail(fixture('booking-confirmation'), { itemId: opener.itemId, ref: 'intent:i1' });
  assert.ok(orphan, 'detail-only entry outside current fullscreen exists');
  const pending = s.widgets.activate(shown.itemId, 'intent:i1');
  assert.equal(s.submissions.length, 1);
  assert.ok(s.widgets.heldTokens() > 0);
  s.confirm();
  assert.equal(s.widgetPort.view().fullscreen, null);
  assert.equal(s.widgets.heldTokens(), 0);
  assert.deepEqual(s.widgets.lockSources(), []);
  assert.equal(s.submissions[0].signal.aborted, true);
  await s.complete();
  s.submissions[0].resolve({ status: 'settled', lines: [{ text: 'late receipt' }] });
  await pending;
  assert.deepEqual(s.conversation.view().items, []);
  assert.equal((await s.widgets.activate(orphan.itemId, 'intent:i1')).reason, 'unknown_item');
  s.dispose();
});

test('pending render observation cannot start after erasure cleared its entry', async () => {
  const s = setup({ holdReceipts: true }); await flush();
  s.resolves[0].resolve({ ok: true, value: { tenant_bound: true, widgets: [] } }); await flush();
  const card = s.widgets.ingest(fixture('service-selector'));
  s.widgets.rendered(card.itemId);
  s.confirm(); await flush();
  assert.equal(s.resolves.length, 1, 'no late render HTTP read');
  s.dispose();
});

test('privacy closes the real personal receiver, drops selections and ignores a late personal read', async () => {
  const s = setup(); await flush();
  const reads = [];
  const personal = createPersonalBooking({ widgets: s.widgetPort, session: s.session, newAbort: () => new AbortController(), transport: {
    personalResults: async () => ({ ok: true, value: { results: [], hasPending: false, hasMore: false } }),
    personalBranches: async () => ({ ok: true, value: [] }),
    personalServices: async () => ({ ok: true, value: [{ id: 'service', name: 'Private service' }] }),
    personalStaff: async () => ({ ok: true, value: [{ id: 'staff', name: 'Private staff' }] }),
    personalSlots: (date, serviceId, staffId, signal) => deferred(reads, { date, serviceId, staffId }, signal),
  } });
  const opener = s.widgets.ingest(fixture('schedule'));
  const detail = fixture('schedule');
  detail.provenance.source_capability = 'appointments.own.list';
  detail.presentation.fullscreen_detail.route_key = 'fs.booking';
  detail.intents[0].target = { class: 'detail', ref: 'fs.booking' };
  detail.lifecycle.input_lock = 'none';
  detail.integrity.body_hash = bodyHash(detail);
  assert.equal(s.shell.presentDetail(detail, { itemId: opener.itemId, ref: 'intent:i1' }).presented, true);
  await flush();
  assert.equal(s.widgetPort.view().fullscreen.receiver, 'personal_booking');
  personal.chooseService('service'); personal.chooseStaff('staff'); personal.date('2026-10-15');
  const pending = personal.slots(); await flush();
  assert.equal(reads.length, 1);
  s.confirm();
  assert.equal(reads[0].signal.aborted, true);
  assert.equal(personal.view().phase, 'closed');
  assert.equal(personal.view().serviceId, '');
  assert.equal(personal.view().staffId, '');
  assert.equal(personal.view().date, '');
  assert.deepEqual(personal.view().services, []);
  await s.complete();
  reads[0].resolve({ ok: true, value: [{ start: '2026-10-15T09:00:00Z', staffId: 'staff', branchId: null }] }); await pending;
  assert.equal(personal.view().phase, 'closed');
  assert.deepEqual(personal.view().slots, []);
  personal.dispose(); s.dispose();
});

test('privacy explicitly cancels committed voice transcription; delayed transcript never submits a new turn', async () => {
  const s = setup(); await flush();
  s.voice.arm({ isTrusted: true, type: 'click', timeStamp: 1 }); await flush();
  s.advance(1000);
  s.voice.send({ isTrusted: true, type: 'click', timeStamp: 2 }); await flush();
  assert.equal(s.voice.view().state, 'transcribing');
  s.widgetPort.navigate('shell.privacy');
  assert.equal(s.voice.view().state, 'transcribing', 'route navigation alone does not cancel committed voice');
  s.confirm();
  assert.equal(s.transcripts[0].signal.aborted, true);
  assert.equal(s.voice.view().state, 'idle');
  await s.complete();
  s.transcripts[0].resolve({ ok: true, value: { transcript: 'deleted voice preference' } }); await flush();
  assert.equal(s.chats.length, 0);
  assert.deepEqual(s.conversation.view().items, []);
  s.dispose();
});

test('logout/new login invalidates erasure continuation; late completion cannot clear the next session', async () => {
  const s = setup(); await flush(); s.confirm();
  s.session.set({ signedIn: false, reason: 'signed_out' });
  assert.equal(s.erasures[0].signal.aborted, true);
  s.session.set({ signedIn: true, display: { userName: 'Different session', tenantName: 'Other' } }); await flush();
  s.conversation.submitUserTurn('new session', { modality: 'typed' });
  s.chats[0].resolve({ ok: true, value: { reply: 'new session reply', userTurn: { conversationId: nextConversationId, turnId: 'new-turn' } } }); await flush();
  const before = s.conversation.view();
  await s.complete();
  assert.equal(s.conversation.view(), before);
  assert.equal(s.privacy.view().phase, 'idle');
  assert.equal(s.privacy.view().erasedAt, null);
  assert.equal(s.privacy.view().localEpoch, 2);
  s.privacy.retry(); assert.equal(s.erasures.length, 1);
  s.dispose();
});

for (const boundary of ['voice cancellation', 'conversation freeze', 'retry publication']) test(`replacement session during synchronous ${boundary} cannot dispatch the old target`, async () => {
  const s = setup(); await flush();
  let switched = false;
  const replace = () => {
    if (switched) return;
    switched = true;
    s.session.set({ signedIn: false, reason: 'signed_out' });
    s.session.set({ signedIn: true, display: { userName: 'Replacement', tenantName: 'Other tenant' } });
  };
  let unsubscribe;
  if (boundary === 'voice cancellation') {
    s.voice.arm({ isTrusted: true, type: 'click', timeStamp: 1 }); await flush();
    unsubscribe = s.voice.subscribe(view => { if (view.state === 'idle') replace(); });
    s.confirm();
  } else if (boundary === 'conversation freeze') {
    unsubscribe = s.conversation.subscribe(view => { if (view.composer.reason === 'history_erasure') replace(); });
    s.confirm();
  } else {
    s.confirm(); s.erasures[0].resolve({ ok: false, failure: { reason: 'unknown' } }); await flush();
    unsubscribe = s.privacy.subscribe(view => { if (view.phase === 'erasing') replace(); });
    s.privacy.retry();
  }
  await flush();
  assert.equal(switched, true, 'the tested callback boundary must be reached');
  assert.equal(s.erasures.length, boundary === 'retry publication' ? 1 : 0, 'replacement login receives no old erasure call');
  assert.equal(s.privacy.view().phase, 'idle');
  assert.equal(s.privacy.view().erasedAt, null);
  assert.equal(s.conversation.view().composer.enabled, true);
  unsubscribe(); s.dispose();
});

for (const reason of ['forbidden', 'unavailable', 'conflict', 'invalid_request']) test(`definite ${reason} never claims completion or revives old controls`, async () => {
  const s = setup(); await flush(); s.confirm();
  s.erasures[0].resolve({ ok: false, failure: { reason } }); await flush();
  assert.equal(s.privacy.view().phase, 'refused');
  assert.equal(s.privacy.view().failure, reason);
  assert.equal(s.privacy.view().erasedAt, null);
  assert.equal(s.conversation.view().composer.enabled, false);
  s.privacy.retry(); s.confirm(); assert.equal(s.erasures.length, 1);
  s.dispose();
});

test('mismatched completion remains uncertain and cannot unlock the conversation', async () => {
  const s = setup(); await flush(); s.confirm();
  await s.complete(0, { conversationId: nextConversationId });
  assert.equal(s.privacy.view().phase, 'uncertain');
  assert.equal(s.conversation.view().composer.enabled, false);
  s.dispose();
});
