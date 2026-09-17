// K5 / S6 — the voice hook's conformance tests (SHELL-PLAN v2.1 §1.9, §3.1 S6; lens-voice §8 1–10).
//
//   node --test test/voice.test.mjs
//
// No browser and no DOM library: the capture module runs against in-file media doubles installed on
// the global object, the state machine against a fake scheduler, and the voice control against an
// in-file element double. Chromium with a fake device is step 15 of §2.7 (recorded separately).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { base64Encode, encodeWavPcm16Mono16k, WAV_DATA_URL_PREFIX, WAV_HEADER_BYTES, wavDataUrl } from '../src/voice/wav.ts';
import { CAPTURE_CONSTRAINTS, createCapture, levelFromRms, MIME_CANDIDATES, negotiateMime } from '../src/voice/capture.ts';
import {
  captureGate,
  createVoiceControl,
  mapTranscribeFailure,
  TRANSCRIBE_TIMEOUT_MS,
  VOICE_CAP_MS,
  VOICE_LOCKED_LABEL,
  VOICE_UNAVAILABLE_LABEL,
  voiceUnavailableCell,
} from '../src/shell/voice-state.ts';
import { formatElapsed, mountVoiceControl, voiceIndicator, voiceStatusSentence } from '../src/dom/voice-control.ts';
import { createConversation } from '../src/shell/conversation.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SH = path.resolve(HERE, '..');
const BE = path.resolve(SH, '..', 'maya-saas-backend');
const VOICE_FILES = ['src/shell/voice-state.ts', 'src/voice/capture.ts', 'src/voice/wav.ts', 'src/dom/voice-control.ts'];

const V11_CELL = {
  state: 'UNAVAILABLE',
  value: null,
  label: 'Голос недоступен на этом устройстве — напишите сообщение',
  reason_code: 'OUT_OF_SCOPE',
  fact_ref: null,
  as_of: null,
  evidence_refs: [],
  next_intent_ref: null,
};

// ── doubles ──────────────────────────────────────────────────────────────────────────────────────

const settle = async (rounds = 25) => {
  for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

let stamp = 0;
/** A trusted-gesture proof, as dom/voice-control.ts mints one. A fresh object per gesture. */
const gesture = (type = 'click') => ({ isTrusted: true, type, timeStamp: (stamp += 1) });

function fakeScheduler(start = 1_700_000_000_000) {
  let now = start;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => now,
    after(ms, run) {
      const id = (seq += 1);
      timers.set(id, { at: now + ms, run });
      return () => {
        timers.delete(id);
      };
    },
    frame(run) {
      return this.after(16, run);
    },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let next = null;
        for (const [id, t] of timers) if (t.at <= end && (next === null || t.at < next.t.at || (t.at === next.t.at && id < next.id))) next = { id, t };
        if (next === null) break;
        timers.delete(next.id);
        now = next.t.at;
        next.t.run();
      }
      now = end;
    },
    pending: () => timers.size,
  };
}

/**
 * Browser media doubles on the global object. Every getUserMedia call, track, recorder, context and
 * offline render is counted, so "0 calls" and "every track ended" are observable.
 */
function installMedia(opts = {}) {
  const o = {
    mediaDevices: true,
    recorder: true,
    audioContext: true,
    offline: true,
    mimes: ['audio/webm;codecs=opus'],
    deny: null,
    deferGetUserMedia: false,
    decodeThrows: false,
    durationSec: 1.5,
    rms: 0.2,
    ...opts,
  };
  const calls = { getUserMedia: 0, constraints: [], tracks: [], recorders: [], contexts: [], offline: [], pendingStreams: [] };

  class FakeTrack {
    constructor() {
      this.readyState = 'live';
    }
    stop() {
      this.readyState = 'ended';
    }
  }
  class FakeStream {
    constructor() {
      this.tracks = [new FakeTrack()];
      calls.tracks.push(...this.tracks);
    }
    getTracks() {
      return [...this.tracks];
    }
  }
  const mediaDevices = {
    getUserMedia(constraints) {
      calls.getUserMedia += 1;
      calls.constraints.push(constraints);
      if (o.deny) return Promise.reject(Object.assign(new Error('refused'), { name: o.deny }));
      if (o.deferGetUserMedia)
        return new Promise((resolve) => {
          calls.pendingStreams.push(() => resolve(new FakeStream()));
        });
      return Promise.resolve(new FakeStream());
    },
  };
  class FakeRecorder extends EventTarget {
    static isTypeSupported(mime) {
      return o.mimes.includes(mime);
    }
    constructor(stream, options) {
      super();
      this.stream = stream;
      this.mimeType = options?.mimeType ?? '';
      this.state = 'inactive';
      calls.recorders.push(this);
    }
    start(timeslice) {
      this.timeslice = timeslice;
      this.state = 'recording';
    }
    stop() {
      if (this.state === 'inactive') throw new Error('InvalidStateError');
      this.state = 'inactive';
      queueMicrotask(() => {
        const data = new Event('dataavailable');
        data.data = new Blob([new Uint8Array([26, 69, 223, 163])], { type: this.mimeType });
        this.dispatchEvent(data);
        this.dispatchEvent(new Event('stop'));
      });
    }
  }
  class FakeAudioContext {
    constructor() {
      this.state = 'running';
      calls.contexts.push(this);
    }
    resume() {
      return Promise.resolve();
    }
    close() {
      this.state = 'closed';
      return Promise.resolve();
    }
    createAnalyser() {
      return {
        fftSize: 2048,
        getFloatTimeDomainData: (frame) => frame.fill(o.rms),
      };
    }
    createMediaStreamSource() {
      return { connect() {}, disconnect() {} };
    }
    decodeAudioData(data, ok, fail) {
      if (o.decodeThrows) {
        const err = Object.assign(new Error('Unable to decode audio data'), { name: 'EncodingError' });
        if (fail) fail(err);
        return Promise.reject(err);
      }
      const decoded = { duration: o.durationSec, sampleRate: 48_000, numberOfChannels: 2, bytes: data.byteLength };
      if (ok) ok(decoded);
      return Promise.resolve(decoded);
    }
  }
  class FakeOffline {
    constructor(channels, length, rate) {
      calls.offline.push({ channels, length, rate });
      this.length = length;
      this.destination = {};
    }
    createBufferSource() {
      return { buffer: null, connect() {}, start() {} };
    }
    startRendering() {
      const data = new Float32Array(this.length);
      for (let i = 0; i < this.length; i += 1) data[i] = 0.25 * Math.sin((2 * Math.PI * 440 * i) / 16_000);
      return Promise.resolve({ getChannelData: () => data });
    }
  }

  const saved = {};
  const put = (name, value) => {
    saved[name] = Object.getOwnPropertyDescriptor(globalThis, name);
    if (value === undefined) delete globalThis[name];
    else Object.defineProperty(globalThis, name, { value, configurable: true, writable: true, enumerable: true });
  };
  put('navigator', o.mediaDevices ? { mediaDevices } : {});
  put('MediaRecorder', o.recorder ? FakeRecorder : undefined);
  put('AudioContext', o.audioContext ? FakeAudioContext : undefined);
  put('OfflineAudioContext', o.offline ? FakeOffline : undefined);

  return {
    calls,
    opts: o,
    liveTracks: () => calls.tracks.filter((t) => t.readyState !== 'ended').length,
    restore() {
      for (const [name, desc] of Object.entries(saved)) {
        if (desc) Object.defineProperty(globalThis, name, desc);
        else delete globalThis[name];
      }
    },
  };
}

/** Session, route and environment doubles the machine subscribes to. */
function hostDoubles() {
  const hidden = new Set();
  const sessionListeners = new Set();
  const widgetListeners = new Set();
  let session = { signedIn: true, display: { userName: 'Мастер', tenantName: 'Салон' } };
  let shellView = { primary: 'shell.root', fullscreen: null };
  return {
    environment: {
      onHidden(listener) {
        hidden.add(listener);
        return () => hidden.delete(listener);
      },
    },
    session: {
      view: () => session,
      subscribe(listener) {
        sessionListeners.add(listener);
        return () => sessionListeners.delete(listener);
      },
    },
    widgets: {
      view: () => shellView,
      subscribe(listener) {
        widgetListeners.add(listener);
        return () => widgetListeners.delete(listener);
      },
    },
    hide: () => [...hidden].forEach((l) => l()),
    signOut() {
      session = { signedIn: false, reason: 'signed_out' };
      [...sessionListeners].forEach((l) => l(session));
    },
    route(primary) {
      shellView = { ...shellView, primary };
      [...widgetListeners].forEach((l) => l(shellView));
    },
  };
}

const idSource = () => {
  let n = 0;
  return () => `turn-${String((n += 1)).padStart(8, '0')}`;
};

/**
 * The §1.5A wire step of `submitUserTurn`, as a reference: NFC, trim, 1..2000, requestId from the
 * injected generator, `{surface:'web', requestId, messages}`. It records every call, so the voice
 * path is checked to pass the transcript verbatim into THE function with only `origin` differing.
 */
function referenceConversation(ids, chatReply = 'Готово') {
  const bodies = [];
  const calls = [];
  const listeners = new Set();
  const history = [];
  let inFlight = false;
  const emit = () => [...listeners].forEach((l) => l(view()));
  const view = () => ({ items: [], inFlight, composer: { enabled: true }, dropped: 0 });
  const transport = {
    chat(request, signal) {
      assert.ok(signal instanceof AbortSignal);
      bodies.push(JSON.stringify(request));
      return Promise.resolve({ ok: true, value: { request_id: request.requestId, reply: chatReply, action_status: null } });
    },
  };
  return {
    bodies,
    calls,
    view,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setInFlight(value) {
      inFlight = value;
      emit();
    },
    submitUserTurn(text, origin) {
      calls.push({ text, origin });
      const content = text.normalize('NFC').trim();
      if (content.length === 0) return { accepted: false, refusal: 'empty' };
      if (content.length > 2000) return { accepted: false, refusal: 'too_long' };
      if (inFlight) return { accepted: false, refusal: 'in_flight' };
      const requestId = ids();
      inFlight = true;
      emit();
      transport.chat({ surface: 'web', requestId, messages: [...history, { role: 'user', content }] }, new AbortController().signal).then((outcome) => {
        history.push({ role: 'user', content }, { role: 'assistant', content: outcome.value.reply });
        inFlight = false;
        emit();
      });
      return { accepted: true, itemId: requestId };
    },
  };
}

/**
 * THE conversation (src/shell/conversation.ts), over a transport double that enforces the backend DTO
 * (`AiCoreChatDto`: exactly {surface, requestId, messages}, surface enum, requestId regex, 1..12
 * messages, role enum, content 1..2000) and records every body byte for byte.
 */
function realConversation(ids) {
  const bodies = [];
  const violations = [];
  const transport = {
    chat(request, signal) {
      assert.ok(signal instanceof AbortSignal);
      const raw = JSON.stringify(request);
      bodies.push(raw);
      const body = JSON.parse(raw);
      if (JSON.stringify(Object.keys(body).sort()) !== '["messages","requestId","surface"]') violations.push(`keys ${Object.keys(body)}`);
      if (!['web', 'native', 'telegram', 'voice'].includes(body.surface)) violations.push('surface');
      if (!/^[A-Za-z0-9_-]{8,128}$/.test(body.requestId ?? '')) violations.push('requestId');
      if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 12) violations.push('messages count');
      for (const m of body.messages ?? []) {
        if (JSON.stringify(Object.keys(m).sort()) !== '["content","role"]') violations.push(`message keys ${Object.keys(m)}`);
        if (!['user', 'assistant'].includes(m.role)) violations.push('role');
        if (typeof m.content !== 'string' || m.content.length < 1 || m.content.length > 2000) violations.push('content');
      }
      return Promise.resolve({ ok: true, value: { request_id: body.requestId, reply: 'Готово', action_status: null } });
    },
  };
  const conversation = createConversation({
    transport,
    session: { view: () => ({ signedIn: true, display: { userName: 'Анна', tenantName: 'Салон' } }), subscribe: () => () => undefined },
    scheduler: { now: () => 1_700_000_000_000 },
    newAbort: () => new AbortController(),
    newRequestId: ids,
  });
  return { conversation, bodies, violations };
}

/** A transcribe transport double: records every request body and answers with `answer(request, signal)`. */
function transcribeStub(answer) {
  const requests = [];
  return {
    requests,
    transcribe(request, signal) {
      requests.push({ request, signal });
      return answer(request, signal);
    },
  };
}
const transcriptOf = (text) => () => Promise.resolve({ ok: true, value: { transcript: text } });

function voiceRig({ media = {}, transcribe = transcriptOf('мои записи'), lockSources = () => [], conversation } = {}) {
  const m = installMedia(media);
  const scheduler = fakeScheduler();
  const host = hostDoubles();
  const talk = conversation ?? referenceConversation(idSource());
  const transport = transcribeStub(transcribe);
  const capture = createCapture({ secureContext: true });
  const armCalls = [];
  const spiedCapture = {
    ...capture,
    availability: () => capture.availability(),
    arm: (proof) => {
      armCalls.push(proof);
      return capture.arm(proof);
    },
    level: () => capture.level(),
    hold: () => capture.hold(),
    take: (proof) => capture.take(proof),
    cancel: () => capture.cancel(),
  };
  const machine = createVoiceControl({
    capture: spiedCapture,
    transport,
    conversation: talk,
    scheduler,
    newAbort: () => new AbortController(),
    lockSources,
    environment: host.environment,
    session: host.session,
    widgets: host.widgets,
  });
  return { m, scheduler, host, talk, transport, machine, armCalls };
}

/** arm → granted → listening for `ms` → «Отправить». */
async function speak(rig, ms = 1500) {
  rig.machine.arm(gesture());
  await settle();
  assert.equal(rig.machine.view().state, 'listening');
  rig.scheduler.advance(ms);
  rig.machine.send(gesture());
  await settle();
}

const decodeWavHeader = (dataUrl) => {
  assert.ok(dataUrl.startsWith(WAV_DATA_URL_PREFIX), 'data:audio/wav;base64, prefix');
  const bytes = Buffer.from(dataUrl.slice(WAV_DATA_URL_PREFIX.length), 'base64');
  return {
    bytes,
    riff: bytes.toString('ascii', 0, 4),
    riffSize: bytes.readUInt32LE(4),
    wave: bytes.toString('ascii', 8, 12),
    fmt: bytes.toString('ascii', 12, 16),
    fmtSize: bytes.readUInt32LE(16),
    audioFormat: bytes.readUInt16LE(20),
    channels: bytes.readUInt16LE(22),
    sampleRate: bytes.readUInt32LE(24),
    byteRate: bytes.readUInt32LE(28),
    blockAlign: bytes.readUInt16LE(32),
    bits: bytes.readUInt16LE(34),
    data: bytes.toString('ascii', 36, 40),
    dataSize: bytes.readUInt32LE(40),
  };
};

// ── the element double for dom/voice-control.ts ─────────────────────────────────────────────────

function domDouble() {
  const focus = { active: null };
  class FakeClassList {
    constructor() {
      this.names = new Set();
    }
    add(...names) {
      for (const n of names) this.names.add(n);
    }
    remove(...names) {
      for (const n of names) this.names.delete(n);
    }
    contains(name) {
      return this.names.has(name);
    }
    toggle(name, force) {
      const on = force === undefined ? !this.names.has(name) : Boolean(force);
      if (on) this.names.add(name);
      else this.names.delete(name);
      return on;
    }
  }
  class FakeText {
    constructor(value) {
      this.nodeType = 3;
      this.textContent = String(value);
      this.parent = null;
    }
  }
  class FakeEl {
    constructor(tag) {
      this.nodeType = 1;
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.parent = null;
      this.attrs = new Map();
      this.listeners = new Map();
      this.text = '';
      this.textWrites = 0;
      this.hidden = false;
      this.disabled = false;
      this.type = '';
      this.classList = new FakeClassList();
    }
    append(...nodes) {
      for (let n of nodes) {
        if (typeof n === 'string') n = new FakeText(n);
        if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1);
        n.parent = this;
        this.children.push(n);
      }
    }
    remove() {
      if (this.parent === null) return;
      this.parent.children.splice(this.parent.children.indexOf(this), 1);
      this.parent = null;
    }
    setAttribute(name, value) {
      this.attrs.set(name, String(value));
    }
    getAttribute(name) {
      return this.attrs.has(name) ? this.attrs.get(name) : null;
    }
    get textContent() {
      return this.children.length > 0 ? this.children.map((c) => c.textContent).join('') : this.text;
    }
    set textContent(value) {
      this.children = [];
      this.text = String(value);
      this.textWrites += 1;
    }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(fn);
    }
    removeEventListener(type, fn) {
      const list = this.listeners.get(type) ?? [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    }
    /** Bubbling dispatch; trusted unless `init.isTrusted === false`. */
    fire(type, init = {}) {
      const event = {
        type,
        isTrusted: true,
        timeStamp: 1234.5,
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        ...init,
      };
      for (let n = this; n; n = n.parent) for (const fn of [...(n.listeners.get(type) ?? [])]) fn(event);
      return event;
    }
    focus() {
      if (focus.active === this) return;
      const prev = focus.active;
      focus.active = this;
      if (prev) for (const fn of prev.listeners.get('blur') ?? []) fn({ type: 'blur' });
      for (const fn of this.listeners.get('focus') ?? []) fn({ type: 'focus' });
    }
  }
  const factory = {
    create: (tag) => new FakeEl(tag),
    createInput: (type) => Object.assign(new FakeEl('input'), { type }),
    text: (value) => new FakeText(value),
  };
  return { factory, focus, FakeEl };
}

const walk = (el, out = []) => {
  out.push(el);
  for (const c of el.children ?? []) if (c.nodeType === 1) walk(c, out);
  return out;
};
const visible = (el, out = []) => {
  if (el.hidden) return out;
  out.push(el);
  for (const c of el.children ?? []) if (c.nodeType === 1) visible(c, out);
  return out;
};
const byClass = (root, name) => walk(root).find((el) => el.classList.contains(name));

function conversationViewPort(initial = {}) {
  let view = { items: [], inFlight: false, composer: { enabled: true }, dropped: 0, ...initial };
  const listeners = new Set();
  return {
    view: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      view = { ...view, ...next };
      [...listeners].forEach((l) => l(view));
    },
  };
}

function fakeVoicePort(initial = {}) {
  let view = { state: 'idle', elapsedMs: 0, level: 0, unavailable: null, notice: null, ...initial };
  const listeners = new Set();
  const calls = { arm: [], send: [], cancel: 0 };
  return {
    calls,
    view: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    arm: (proof) => calls.arm.push(proof),
    send: (proof) => calls.send.push(proof),
    cancel: () => {
      calls.cancel += 1;
    },
    set(next) {
      view = { ...view, ...next };
      [...listeners].forEach((l) => l(view));
    },
  };
}

/** A container that already holds the composer, as the shell composes it; the voice control is appended after. */
function mountWithComposer(voice, conversation = conversationViewPort()) {
  const dom = domDouble();
  const container = dom.factory.create('div');
  const composer = dom.factory.create('textarea');
  composer.setAttribute('aria-label', 'Сообщение для MAYA');
  const composerSend = dom.factory.create('button');
  composerSend.textContent = 'Отправить';
  container.append(composer, composerSend);
  const unmount = mountVoiceControl({ factory: dom.factory, container, voice, conversation });
  const region = byClass(container, 'voice');
  return { dom, container, composer, composerSend, region, unmount, conversation };
}

// ── source helpers (comment-stripped code, via the backend's TypeScript) ────────────────────────

const beRequire = createRequire(path.join(BE, 'package.json'));
let tsCache = null;
const typescript = () => (tsCache ??= beRequire('typescript'));
const strippedCode = (rel) => {
  const ts = typescript();
  const sf = ts.createSourceFile(rel, fs.readFileSync(path.join(SH, rel), 'utf8'), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  return ts.createPrinter({ removeComments: true }).printFile(sf);
};
const bundleFiles = () => {
  const out = [];
  const visit = (dir) => {
    if (!fs.existsSync(path.join(SH, dir))) return;
    for (const entry of fs.readdirSync(path.join(SH, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) visit(rel);
      else if (rel.endsWith('.ts') && !rel.endsWith('.d.ts')) out.push(rel);
    }
  };
  visit('src');
  visit('entry');
  return out.sort();
};

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// lens-voice §8 test 1 — V1/G8 parity
// ═════════════════════════════════════════════════════════════════════════════════════════════════

test('1 V1/G8: a spoken turn and a typed turn with the same text produce byte-identical /ai/chat bodies', async () => {
  const typed = referenceConversation(idSource());
  assert.deepEqual(typed.submitUserTurn('мои записи', { modality: 'typed' }), { accepted: true, itemId: 'turn-00000001' });
  await settle();

  const rig = voiceRig({ transcribe: transcriptOf('мои записи'), conversation: referenceConversation(idSource()) });
  try {
    await speak(rig);
    assert.equal(rig.transport.requests.length, 1, 'one transcribe request');
    assert.equal(rig.talk.bodies.length, 1, 'one chat request');
    assert.equal(rig.talk.bodies[0], typed.bodies[0], 'the /ai/chat body is byte-identical');
    assert.equal(rig.talk.bodies[0], '{"surface":"web","requestId":"turn-00000001","messages":[{"role":"user","content":"мои записи"}]}');

    // the one function, the transcript verbatim; only the in-memory origin differs
    assert.deepEqual(rig.talk.calls, [{ text: 'мои записи', origin: { modality: 'spoken' } }]);
    assert.deepEqual(typed.calls, [{ text: 'мои записи', origin: { modality: 'typed' } }]);
    assert.equal(rig.machine.view().state, 'idle');

    // the transcribe wire: JSON {audioBase64} only, a data URL of WAV PCM16 mono 16 kHz
    const { request, signal } = rig.transport.requests[0];
    assert.deepEqual(Object.keys(request), ['audioBase64']);
    assert.ok(signal instanceof AbortSignal);
    const h = decodeWavHeader(request.audioBase64);
    assert.deepEqual(
      [h.riff, h.wave, h.fmt, h.fmtSize, h.audioFormat, h.channels, h.sampleRate, h.byteRate, h.blockAlign, h.bits, h.data],
      ['RIFF', 'WAVE', 'fmt ', 16, 1, 1, 16_000, 32_000, 2, 16, 'data'],
    );
    assert.equal(h.dataSize, 2 * Math.ceil(1.5 * 16_000));
    assert.equal(h.bytes.length, WAV_HEADER_BYTES + h.dataSize);
    assert.deepEqual(rig.m.calls.offline, [{ channels: 1, length: 24_000, rate: 16_000 }]);
    assert.equal(rig.m.liveTracks(), 0, 'every track ended after the send');
  } finally {
    rig.m.restore();
  }
});

test('1b D2: no client-side resolution — escape words, ordinals and affirmations reach the chat verbatim', async () => {
  for (const said of ['отмена', 'стоп', 'хватит', 'первое', '2', 'да', ' Второе. ']) {
    const typed = referenceConversation(idSource());
    typed.submitUserTurn(said, { modality: 'typed' });
    await settle();
    const rig = voiceRig({ transcribe: transcriptOf(said), conversation: referenceConversation(idSource()) });
    try {
      await speak(rig);
      assert.deepEqual(rig.talk.calls, [{ text: said, origin: { modality: 'spoken' } }], `«${said}» is handed over untouched`);
      assert.equal(rig.talk.bodies[0], typed.bodies[0], `«${said}»: same bytes as typing it`);
      assert.equal(rig.m.calls.getUserMedia, 1);
    } finally {
      rig.m.restore();
    }
  }
  // and nothing in the bundle reads the envelope's aliases or ordinals
  for (const rel of bundleFiles()) {
    const code = strippedCode(rel);
    assert.doesNotMatch(code, /\bspeech_aliases\b/, `${rel} names speech_aliases`);
    assert.doesNotMatch(code, /\bordinal\b/, `${rel} names ordinal`);
  }
});

test('1c V1/G8 on THE conversation: spoken and typed turns through src/shell/conversation.ts give byte-identical DTO-valid /ai/chat bodies (no alias, ordinal or modality on the wire)', async () => {
  for (const said of ['мои записи', 'отмена', 'стоп', 'хватит', 'первое', '2', 'да', ' Второе. ']) {
    const typed = realConversation(idSource());
    assert.equal(typed.conversation.submitUserTurn(said, { modality: 'typed' }).accepted, true);
    await settle();
    const spoken = realConversation(idSource());
    const rig = voiceRig({ transcribe: transcriptOf(said), conversation: spoken.conversation });
    try {
      await speak(rig);
      assert.equal(spoken.bodies.length, 1, `«${said}»: one chat request`);
      assert.equal(typed.bodies.length, 1);
      assert.equal(spoken.bodies[0], typed.bodies[0], `«${said}»: the spoken body is byte-identical to typing it`);
      assert.deepEqual(spoken.violations, [], `«${said}»: DTO-valid`);
      const body = JSON.parse(spoken.bodies[0]);
      assert.equal(body.surface, 'web');
      assert.equal(body.messages.at(-1).content, said.normalize('NFC').trim(), `«${said}»: verbatim, only NFC + trim`);
      assert.doesNotMatch(spoken.bodies[0], /modality|spoken|voice|ordinal|alias/, `«${said}»: nothing of the origin on the wire`);
      // the origin reached THE function and stays in memory only
      const turn = spoken.conversation.view().items.find((i) => i.kind === 'user');
      assert.equal(turn.modality, 'spoken');
      assert.equal(typed.conversation.view().items.find((i) => i.kind === 'user').modality, 'typed');
      assert.equal(rig.machine.view().state, 'idle');
    } finally {
      rig.m.restore();
      typed.conversation.dispose();
      spoken.conversation.dispose();
    }
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// test 2 — no readback
// ═════════════════════════════════════════════════════════════════════════════════════════════════

test('2 no readback: a spoken turn builds no readback or affirmation and never a voice surface', async () => {
  const rig = voiceRig({ transcribe: transcriptOf('да, подтверждаю') });
  try {
    await speak(rig);
    const sent = [...rig.transport.requests.map((r) => r.request), ...rig.talk.bodies.map((b) => JSON.parse(b))];
    assert.equal(sent.length, 2);
    const keys = [];
    const collect = (v) => {
      if (Array.isArray(v)) v.forEach(collect);
      else if (v && typeof v === 'object')
        for (const [k, inner] of Object.entries(v)) {
          keys.push(k);
          collect(inner);
        }
    };
    sent.forEach(collect);
    for (const k of keys) assert.doesNotMatch(k, /readback|affirmation|spoken|modality|audience|tenant/i, `request key ${k}`);
    assert.equal(JSON.parse(rig.talk.bodies[0]).surface, 'web');
  } finally {
    rig.m.restore();
  }
  for (const rel of VOICE_FILES) {
    const code = strippedCode(rel);
    assert.doesNotMatch(code, /readback|affirmation/i, `${rel} constructs a readback`);
    assert.doesNotMatch(code, /surface/, `${rel} names a surface`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// test 3 — V6
// ═════════════════════════════════════════════════════════════════════════════════════════════════

const formBody = (sensitivity) => ({
  fields: [
    { field_key: 'name', sensitivity: 'public' },
    { field_key: 'phone', sensitivity },
  ],
});

test('3 V6: a PII lock refuses arming with the neutral Cell and 0 getUserMedia calls', async () => {
  const locked = [{ lifecycle: { input_lock: 'soft' }, body: formBody('pii') }];
  const gate = captureGate(locked);
  assert.equal(gate.allowed, false);
  assert.deepEqual(gate.cell, { ...V11_CELL, label: VOICE_LOCKED_LABEL });
  assert.equal(gate.cell.state, 'UNAVAILABLE');

  assert.equal(captureGate([{ lifecycle: { input_lock: 'hard' }, body: { table: { columns: [{ key: 'x', sensitivity: 'SECURE_SURFACE_ONLY' }] } } }]).allowed, false);
  assert.equal(captureGate([{ lifecycle: { input_lock: 'none' }, body: formBody('pii') }]).allowed, true, 'no lock: voice stays');
  assert.equal(captureGate([{ lifecycle: { input_lock: 'soft' }, body: formBody('internal') }]).allowed, true, 'lock without PII: voice stays');
  assert.equal(captureGate([]).allowed, true);

  const rig = voiceRig({ lockSources: () => locked });
  try {
    rig.machine.arm(gesture());
    await settle();
    assert.equal(rig.m.calls.getUserMedia, 0);
    assert.equal(rig.armCalls.length, 0);
    assert.equal(rig.m.calls.contexts.length, 0, 'no AudioContext either');
    assert.deepEqual(rig.machine.view(), { state: 'idle', elapsedMs: 0, level: 0, unavailable: null, notice: 'locked_for_step' });
  } finally {
    rig.m.restore();
  }
});

test('3b V6 at commit: a lock that arrives while listening drops the clip — 0 requests, tracks ended', async () => {
  let sources = [];
  const rig = voiceRig({ lockSources: () => sources });
  try {
    rig.machine.arm(gesture());
    await settle();
    assert.equal(rig.machine.view().state, 'listening');
    rig.scheduler.advance(2000);
    sources = [{ lifecycle: { input_lock: 'hard' }, body: formBody('SECURE_SURFACE_ONLY') }];
    rig.machine.send(gesture());
    await settle();
    assert.equal(rig.machine.view().state, 'idle');
    assert.equal(rig.machine.view().notice, 'locked_for_step');
    assert.equal(rig.transport.requests.length, 0);
    assert.equal(rig.talk.bodies.length, 0);
    assert.equal(rig.m.liveTracks(), 0);
    assert.equal(rig.m.calls.offline.length, 0, 'nothing was even encoded');
  } finally {
    rig.m.restore();
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// test 4 — V7
// ═════════════════════════════════════════════════════════════════════════════════════════════════

test('4 V7: capture refuses to arm without a genuine, unspent GestureProof', async () => {
  const m = installMedia();
  try {
    const capture = createCapture({ secureContext: true });
    for (const bad of [undefined, null, {}, { isTrusted: false, type: 'click', timeStamp: 1 }, { isTrusted: true, type: 'focus', timeStamp: 1 }, { isTrusted: true, type: 'click', timeStamp: Number.NaN }]) {
      assert.deepEqual(await capture.arm(bad), { armed: false, reason: 'denied' });
      assert.equal(await capture.take(bad), null);
    }
    assert.equal(m.calls.getUserMedia, 0);
    assert.equal(m.calls.contexts.length, 0);

    const proof = gesture();
    assert.deepEqual(await capture.arm(proof), { armed: true });
    assert.equal(m.calls.getUserMedia, 1);
    assert.deepEqual(m.calls.constraints[0], CAPTURE_CONSTRAINTS);
    assert.equal(m.calls.recorders[0].timeslice, undefined, 'recorder started without a timeslice');
    capture.cancel();
    assert.deepEqual(await capture.arm(proof), { armed: false, reason: 'denied' }, 'a spent proof arms nothing');
    assert.equal(m.calls.getUserMedia, 1);
  } finally {
    m.restore();
  }
});

test('4b V7: the machine ignores arm/send without a proof; the control mints proofs only from trusted clicks', async () => {
  const rig = voiceRig();
  try {
    rig.machine.arm(undefined);
    rig.machine.arm({ isTrusted: false, type: 'click', timeStamp: 1 });
    await settle();
    assert.equal(rig.armCalls.length, 0);
    assert.equal(rig.m.calls.getUserMedia, 0);
    assert.equal(rig.machine.view().state, 'idle');

    const proof = gesture();
    rig.machine.arm(proof);
    await settle();
    assert.equal(rig.machine.view().state, 'listening');
    rig.scheduler.advance(1000);
    rig.machine.send(proof); // the arming proof, spent
    rig.machine.send(undefined);
    await settle();
    assert.equal(rig.machine.view().state, 'listening');
    assert.equal(rig.transport.requests.length, 0);
    rig.machine.cancel();
  } finally {
    rig.m.restore();
  }

  const voice = fakeVoicePort();
  const { region } = mountWithComposer(voice);
  const mic = byClass(region, 'voice-mic');
  mic.fire('click', { isTrusted: false });
  assert.equal(voice.calls.arm.length, 0, 'a synthetic click arms nothing');
  mic.fire('click', { timeStamp: 77 });
  assert.deepEqual(voice.calls.arm, [{ isTrusted: true, type: 'click', timeStamp: 77 }]);
  voice.set({ state: 'listening' });
  const send = byClass(region, 'voice-send');
  send.fire('click', { isTrusted: false });
  assert.equal(voice.calls.send.length, 0);
  send.fire('click', { timeStamp: 78 });
  assert.deepEqual(voice.calls.send, [{ isTrusted: true, type: 'click', timeStamp: 78 }]);
});

test('4c V7 lint: getUserMedia appears once in the bundle, as navigator.mediaDevices.getUserMedia inside a GestureProof function', () => {
  const ts = typescript();
  const sites = [];
  for (const rel of bundleFiles()) {
    const sf = ts.createSourceFile(rel, fs.readFileSync(path.join(SH, rel), 'utf8'), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    const visit = (node) => {
      if ((ts.isIdentifier(node) || ts.isStringLiteral(node)) && node.text === 'getUserMedia') {
        let fn = node.parent;
        while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
        sites.push({
          rel,
          path: node.parent.getText(sf),
          fn: fn?.name?.getText(sf) ?? null,
          params: fn ? fn.parameters.map((p) => p.type?.getText(sf) ?? '') : [],
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  assert.deepEqual(sites, [{ rel: 'src/voice/capture.ts', path: 'navigator.mediaDevices.getUserMedia', fn: 'arm', params: ['GestureProof'] }]);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// test 5 — V11
// ═════════════════════════════════════════════════════════════════════════════════════════════════

test('5 V11: every unavailability cause yields exactly the one Cell, and the composer stays first', async () => {
  assert.deepEqual(voiceUnavailableCell(), V11_CELL);
  assert.equal(VOICE_UNAVAILABLE_LABEL, V11_CELL.label);

  const causes = [
    { name: 'insecure context', media: {}, secure: false, reason: 'insecure_context' },
    { name: 'no mediaDevices', media: { mediaDevices: false }, reason: 'api_absent' },
    { name: 'no MediaRecorder', media: { recorder: false }, reason: 'api_absent' },
    { name: 'no AudioContext', media: { audioContext: false }, reason: 'api_absent' },
    { name: 'no OfflineAudioContext', media: { offline: false }, reason: 'api_absent' },
    { name: 'no MIME type', media: { mimes: [] }, reason: 'no_mime_type' },
  ];
  for (const cause of causes) {
    const m = installMedia(cause.media);
    try {
      const capture = createCapture({ secureContext: cause.secure ?? true });
      assert.deepEqual(capture.availability(), { available: false, reason: cause.reason }, cause.name);
      const host = hostDoubles();
      const machine = createVoiceControl({
        capture,
        transport: transcribeStub(transcriptOf('x')),
        conversation: referenceConversation(idSource()),
        scheduler: fakeScheduler(),
        newAbort: () => new AbortController(),
        lockSources: () => [],
        environment: host.environment,
        session: host.session,
        widgets: host.widgets,
      });
      assert.deepEqual(machine.view(), { state: 'unavailable', elapsedMs: 0, level: 0, unavailable: V11_CELL, notice: null }, cause.name);
      machine.arm(gesture());
      await settle();
      assert.equal(m.calls.getUserMedia, 0, `${cause.name}: nothing armed`);
      const { container, composer, region } = mountWithComposer(machine);
      assert.equal(container.children[0], composer, `${cause.name}: composer first`);
      assert.equal(container.children.indexOf(region), 2, `${cause.name}: voice after the composer`);
      assert.equal(composer.hidden, false);
      assert.equal(byClass(region, 'voice-status').textContent, V11_CELL.label);
      assert.equal(byClass(region, 'voice-mic').hidden, true);
    } finally {
      m.restore();
    }
  }

  // runtime causes: permission denied, device absent, decode throws, provider 503
  const runtime = [
    { name: 'permission denied', media: { deny: 'NotAllowedError' }, at: 'arm' },
    { name: 'no device', media: { deny: 'NotFoundError' }, at: 'arm' },
    { name: 'decode throws', media: { decodeThrows: true }, at: 'send' },
    { name: 'provider 503', transcribe: () => Promise.resolve({ ok: false, failure: { reason: 'provider_unavailable' } }), at: 'send' },
  ];
  for (const cause of runtime) {
    const rig = voiceRig({ media: cause.media ?? {}, ...(cause.transcribe ? { transcribe: cause.transcribe } : {}) });
    try {
      const { container, composer, region } = mountWithComposer(rig.machine);
      byClass(region, 'voice-mic').fire('click');
      await settle();
      if (cause.at === 'send') {
        assert.equal(rig.machine.view().state, 'listening', cause.name);
        rig.scheduler.advance(1000);
        byClass(region, 'voice-send').fire('click');
        await settle();
      }
      assert.deepEqual(rig.machine.view(), { state: 'unavailable', elapsedMs: 0, level: 0, unavailable: V11_CELL, notice: null }, cause.name);
      assert.equal(container.children[0], composer, `${cause.name}: composer first`);
      assert.equal(byClass(region, 'voice-status').textContent, V11_CELL.label, cause.name);
      assert.equal(rig.m.liveTracks(), 0, `${cause.name}: tracks ended`);
      assert.equal(rig.talk.bodies.length, 0, `${cause.name}: no chat turn`);
      for (const el of walk(container)) assert.notEqual(el.getAttribute?.('role'), 'alert');
      // unavailable for the session: another gesture arms nothing
      const before = rig.m.calls.getUserMedia;
      rig.machine.arm(gesture());
      await settle();
      assert.equal(rig.m.calls.getUserMedia, before, `${cause.name}: stays unavailable`);
    } finally {
      rig.m.restore();
    }
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// test 6 — the encoder
// ═════════════════════════════════════════════════════════════════════════════════════════════════

/** ai-speech.service.spec.ts:93-108, transcribed byte for byte. */
function specWavFile(pcm) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16_000, 24);
  header.writeUInt32LE(32_000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

test('6 encoder: the 44-byte header and the file equal the backend spec fixture for a known PCM input', () => {
  const samples = new Float32Array([0, 1, -1, 0.5, -0.5, 2, -2, 0.25]);
  const wav = encodeWavPcm16Mono16k(samples);
  const expectedPcm = Buffer.alloc(samples.length * 2);
  [0, 32767, -32768, 16383, -16384, 32767, -32768, 8191].forEach((v, i) => expectedPcm.writeInt16LE(v, i * 2));
  assert.deepEqual(Buffer.from(wav.subarray(44)), expectedPcm, 'PCM16 little-endian, clamped');
  assert.deepEqual(Buffer.from(wav), specWavFile(expectedPcm), 'byte-identical to the spec fixture');
  assert.deepEqual(Buffer.from(wav.subarray(0, 44)), specWavFile(expectedPcm).subarray(0, 44));
  assert.deepEqual(Buffer.from(encodeWavPcm16Mono16k(new Float32Array(0))), specWavFile(Buffer.alloc(0)));

  // base64 is pure code; it must agree with the platform encoder at every remainder
  for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8, 12_287, 12_288, 12_289, 40_000]) {
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) bytes[i] = (i * 131 + 7) & 255;
    assert.equal(base64Encode(bytes), Buffer.from(bytes).toString('base64'), `length ${n}`);
  }
  assert.equal(wavDataUrl(wav), `data:audio/wav;base64,${Buffer.from(wav).toString('base64')}`);

  // lens-voice §10: 20 s = 640 044 B WAV and an 853 432 B JSON body
  const twenty = encodeWavPcm16Mono16k(new Float32Array(16_000 * 20));
  assert.equal(twenty.length, 640_044);
  assert.equal(JSON.stringify({ audioBase64: wavDataUrl(twenty) }).length, 853_432);
});

test('6b encoder cross-check: the backend AiSpeechService parser accepts 1 s and 20 s and refuses 33 s', async () => {
  const src = fs.readFileSync(path.join(BE, 'src/ai-tools/ai-speech.service.ts'), 'utf8');
  const ts = typescript();
  beRequire('reflect-metadata');
  beRequire('@nestjs/common').Logger.overrideLogger(false);
  const out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true, emitDecoratorMetadata: true },
  }).outputText;
  const filename = path.join(BE, 'src/ai-tools/ai-speech.service.transpiled-in-memory.js');
  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(out, filename);
  const { AiSpeechService } = mod.exports;
  const service = new AiSpeechService({ get: (k) => ({ YANDEX_SPEECHKIT_API_KEY: 'test-only-not-a-key', AI_SPEECH_TIMEOUT_MS: '5000' })[k] });

  const realFetch = globalThis.fetch;
  let providerBytes = -1;
  globalThis.fetch = async (_url, init) => {
    providerBytes = init.body.length;
    return { ok: true, status: 200, json: async () => ({ result: 'проба' }) };
  };
  try {
    for (const seconds of [1, 20]) {
      const samples = new Float32Array(16_000 * seconds);
      for (let i = 0; i < samples.length; i += 1) samples[i] = 0.3 * Math.sin((2 * Math.PI * 440 * i) / 16_000);
      const dataUrl = wavDataUrl(encodeWavPcm16Mono16k(samples));
      assert.deepEqual(await service.transcribe(service.fromBase64(dataUrl)), { transcript: 'проба' }, `${seconds} s accepted`);
      assert.equal(providerBytes, 32_000 * seconds, 'only the PCM reaches the provider');
    }
    const tooLong = wavDataUrl(encodeWavPcm16Mono16k(new Float32Array(16_000 * 33)));
    await assert.rejects(service.transcribe(service.fromBase64(tooLong)), (err) => err.getResponse().error.code === 'invalid_speech_audio');
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// test 7 — cap and cancel
// ═════════════════════════════════════════════════════════════════════════════════════════════════

test('7 cap: at 20 s the state is held, capture stopped, 0 requests — and nothing is ever auto-sent', async () => {
  const rig = voiceRig();
  try {
    rig.machine.arm(gesture());
    await settle();
    assert.equal(rig.machine.view().state, 'listening');
    rig.scheduler.advance(VOICE_CAP_MS - 1);
    assert.equal(rig.machine.view().state, 'listening');
    rig.scheduler.advance(1);
    await settle();
    assert.deepEqual(rig.machine.view(), { state: 'held', elapsedMs: VOICE_CAP_MS, level: 0, unavailable: null, notice: null });
    assert.equal(rig.m.liveTracks(), 0, 'the microphone is released at the cap');
    assert.equal(rig.m.calls.recorders[0].state, 'inactive');
    rig.scheduler.advance(10 * 60_000);
    await settle();
    assert.equal(rig.machine.view().state, 'held');
    assert.equal(rig.transport.requests.length, 0);
    assert.equal(rig.talk.bodies.length, 0);
    assert.equal(rig.scheduler.pending(), 0, 'no timer left running while held');

    rig.machine.send(gesture()); // the clip leaves only on this gesture
    await settle();
    assert.equal(rig.transport.requests.length, 1);
    assert.equal(rig.talk.bodies.length, 1);
    assert.equal(rig.machine.view().state, 'idle');
  } finally {
    rig.m.restore();
  }
});

test('7b cancel from arming, listening or held (and Esc, hidden, route change, sign-out) makes 0 requests and stops every track', async () => {
  const exits = {
    cancel: (rig) => rig.machine.cancel(),
    hidden: (rig) => rig.host.hide(),
    route: (rig) => rig.host.route('shell.privacy'),
    signOut: (rig) => rig.host.signOut(),
  };
  for (const [exitName, exit] of Object.entries(exits))
    for (const from of ['arming', 'listening', 'held']) {
      const rig = voiceRig({ media: { deferGetUserMedia: from === 'arming' } });
      try {
        rig.machine.arm(gesture());
        await settle();
        if (from === 'held') rig.scheduler.advance(VOICE_CAP_MS);
        else if (from === 'listening') rig.scheduler.advance(3000);
        assert.equal(rig.machine.view().state, from, `${exitName} from ${from}: reached`);
        exit(rig);
        if (from === 'arming') rig.m.calls.pendingStreams.forEach((grant) => grant()); // permission lands late
        await settle();
        rig.scheduler.advance(60_000);
        await settle();
        const label = `${exitName} from ${from}`;
        assert.equal(rig.machine.view().state, 'idle', label);
        assert.equal(rig.machine.view().notice, null, label);
        assert.equal(rig.transport.requests.length, 0, `${label}: 0 transcribe requests`);
        assert.equal(rig.talk.bodies.length, 0, `${label}: 0 chat requests`);
        assert.equal(rig.m.calls.getUserMedia, 1, label);
        assert.ok(rig.m.calls.tracks.length === 1 && rig.m.liveTracks() === 0, `${label}: every track ended`);
        assert.ok(rig.m.calls.contexts.every((c) => c.state === 'closed'), `${label}: audio context closed`);
        assert.equal(rig.m.calls.offline.length, 0, `${label}: nothing encoded`);
      } finally {
        rig.m.restore();
      }
    }

  // Esc from the control
  const rig = voiceRig();
  try {
    const { region } = mountWithComposer(rig.machine);
    byClass(region, 'voice-mic').fire('click');
    await settle();
    assert.equal(rig.machine.view().state, 'listening');
    const esc = byClass(region, 'voice-send').fire('keydown', { key: 'Escape' });
    assert.equal(esc.defaultPrevented, true);
    await settle();
    assert.equal(rig.machine.view().state, 'idle');
    assert.equal(rig.transport.requests.length, 0);
    assert.equal(rig.m.liveTracks(), 0);
  } finally {
    rig.m.restore();
  }
});

test('7c cancel while transcribing aborts the request and submits nothing; hidden does not abort a committed clip', async () => {
  let release;
  const rig = voiceRig({
    transcribe: (_request, signal) =>
      new Promise((resolve) => {
        release = () => resolve({ ok: true, value: { transcript: 'поздно' } });
        signal.addEventListener('abort', () => resolve({ ok: false, failure: { reason: 'aborted' } }));
      }),
  });
  try {
    await speak(rig);
    assert.equal(rig.machine.view().state, 'transcribing');
    rig.host.hide();
    await settle();
    assert.equal(rig.machine.view().state, 'transcribing', 'a hidden page does not throw away a clip already sent');
    const { signal } = rig.transport.requests[0];
    rig.machine.cancel();
    assert.equal(signal.aborted, true);
    release();
    await settle();
    assert.equal(rig.machine.view().state, 'idle');
    assert.equal(rig.machine.view().notice, null);
    assert.equal(rig.talk.bodies.length, 0);
  } finally {
    rig.m.restore();
  }
});

test('7d short clips, timeouts and failures: neutral notices, no retry, no chat turn', async () => {
  // < 300 ms: dropped on the device
  let rig = voiceRig();
  try {
    await speak(rig, 200);
    assert.deepEqual(rig.machine.view(), { state: 'idle', elapsedMs: 0, level: 0, unavailable: null, notice: 'too_short' });
    assert.equal(rig.transport.requests.length, 0);
    assert.equal(rig.m.liveTracks(), 0);
  } finally {
    rig.m.restore();
  }
  rig = voiceRig({ media: { durationSec: 0.2 } });
  try {
    await speak(rig, 1000); // the decoded clip is what counts
    assert.equal(rig.machine.view().notice, 'too_short');
    assert.equal(rig.transport.requests.length, 0);
  } finally {
    rig.m.restore();
  }

  // the 30 s transcribe timeout aborts and reads as a lost connection
  rig = voiceRig({
    transcribe: (_request, signal) => new Promise((resolve) => signal.addEventListener('abort', () => resolve({ ok: false, failure: { reason: 'aborted' } }))),
  });
  try {
    await speak(rig);
    assert.equal(rig.machine.view().state, 'transcribing');
    rig.scheduler.advance(TRANSCRIBE_TIMEOUT_MS);
    await settle();
    assert.equal(rig.transport.requests[0].signal.aborted, true);
    assert.equal(rig.machine.view().notice, 'no_connection');
    assert.equal(rig.transport.requests.length, 1, 'no automatic retry');
  } finally {
    rig.m.restore();
  }

  const table = [
    [{ reason: 'not_recognized' }, 'not_recognized'],
    [{ reason: 'audio_rejected' }, 'audio_rejected'],
    [{ reason: 'rate_limited', retryAfterSec: 30 }, 'audio_rejected'],
    [{ reason: 'unexpected_response', status: 418 }, 'audio_rejected'],
    [{ reason: 'no_connection' }, 'no_connection'],
    [{ reason: 'signed_out', signedOut: 'session_expired' }, null],
  ];
  for (const [failure, notice] of table) {
    rig = voiceRig({ transcribe: () => Promise.resolve({ ok: false, failure }) });
    try {
      await speak(rig);
      assert.deepEqual(rig.machine.view(), { state: 'idle', elapsedMs: 0, level: 0, unavailable: null, notice }, failure.reason);
      assert.equal(rig.transport.requests.length, 1, `${failure.reason}: no retry`);
      assert.equal(rig.talk.bodies.length, 0);
    } finally {
      rig.m.restore();
    }
  }
  assert.deepEqual(mapTranscribeFailure({ reason: 'provider_unavailable' }, false), { then: 'unavailable' });
  assert.deepEqual(mapTranscribeFailure({ reason: 'aborted' }, false), { then: 'quiet' });
  assert.deepEqual(mapTranscribeFailure({ reason: 'aborted' }, true), { then: 'notice', notice: 'no_connection' });

  // a typed turn in flight: the transcript waits for it, then goes once
  const talk = referenceConversation(idSource());
  rig = voiceRig({ conversation: talk, transcribe: transcriptOf('после') });
  try {
    rig.machine.arm(gesture());
    await settle();
    rig.scheduler.advance(1000);
    rig.machine.send(gesture());
    talk.setInFlight(true);
    await settle();
    assert.equal(rig.machine.view().state, 'transcribing');
    assert.equal(talk.calls.length, 0);
    talk.setInFlight(false);
    rig.scheduler.advance(0);
    await settle();
    assert.deepEqual(talk.calls, [{ text: 'после', origin: { modality: 'spoken' } }]);
    assert.equal(talk.bodies.length, 1);
    assert.equal(rig.machine.view().state, 'idle');
  } finally {
    rig.m.restore();
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// test 8 — V8 / A-9
// ═════════════════════════════════════════════════════════════════════════════════════════════════

test('8 V8/A-9: listening and recording differ in non-motion glyph and label; the meter is three discrete steps', () => {
  const listening = voiceIndicator('listening');
  const recording = voiceIndicator('recording');
  assert.ok(listening && recording);
  assert.notEqual(listening.glyph, recording.glyph);
  assert.notEqual(listening.label, recording.label);
  const all = ['arming', 'listening', 'held', 'recording', 'transcribing'].map(voiceIndicator);
  assert.equal(new Set(all.map((i) => i.glyph)).size, 5, 'every in-progress state has its own glyph');
  assert.equal(new Set(all.map((i) => i.label)).size, 5, 'and its own label');

  const voice = fakeVoicePort();
  const { region } = mountWithComposer(voice);
  const indicator = byClass(region, 'voice-indicator');
  const indicatorGlyph = byClass(indicator, 'voice-glyph');
  const indicatorLabel = byClass(indicator, 'voice-state-label');
  const snapshot = () => ({ glyph: indicatorGlyph.textContent, label: indicatorLabel.textContent, shown: !indicator.hidden });
  voice.set({ state: 'listening', level: 2, elapsedMs: 7_400 });
  const a = snapshot();
  const meter = byClass(region, 'voice-meter');
  const steps = meter.children.filter((c) => c.classList.contains('voice-meter-step'));
  assert.equal(steps.length, 3, 'three steps');
  assert.equal(meter.getAttribute('aria-hidden'), 'true');
  assert.deepEqual(steps.map((s) => s.classList.contains('is-on')), [true, true, false], 'level 2 lights two steps');
  assert.equal(meter.hidden, false);
  assert.equal(byClass(region, 'voice-elapsed').textContent, '0:07');
  voice.set({ state: 'recording', level: 0 });
  const b = snapshot();
  assert.ok(a.shown && b.shown);
  assert.notEqual(a.glyph, b.glyph, 'glyph differs');
  assert.notEqual(a.label, b.label, 'label differs');
  assert.equal(meter.hidden, true, 'the meter belongs to listening only');
  // the distinction is text content, not a class or an animation: it survives with every class stripped
  voice.set({ state: 'listening' });
  for (const el of walk(region)) el.classList.names.clear();
  const strippedListening = snapshot();
  voice.set({ state: 'recording' });
  for (const el of walk(region)) el.classList.names.clear();
  const strippedRecording = snapshot();
  assert.deepEqual([strippedListening.glyph, strippedListening.label], [a.glyph, a.label]);
  assert.deepEqual([strippedRecording.glyph, strippedRecording.label], [b.glyph, b.label]);
  for (let level = 0; level <= 3; level += 1) {
    voice.set({ state: 'listening', level });
    assert.equal(steps.filter((s) => s.classList.contains('is-on')).length, level);
  }
  assert.equal(formatElapsed(0), '0:00');
  assert.equal(formatElapsed(20_000), '0:20');
  assert.equal(formatElapsed(61_999), '1:01');
  assert.equal(levelFromRms(0), 0);
  assert.equal(levelFromRms(Number.NaN), 0);
  assert.equal(levelFromRms(0.02), 1);
  assert.equal(levelFromRms(0.1), 2);
  assert.equal(levelFromRms(0.9), 3);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// test 9 — A-12
// ═════════════════════════════════════════════════════════════════════════════════════════════════

test('9 A-12: one polite live region, written on state or notice change only; no role="alert" anywhere', async () => {
  const voice = fakeVoicePort();
  const { region, container } = mountWithComposer(voice);
  const status = byClass(region, 'voice-status');
  assert.equal(status.getAttribute('aria-live'), 'polite');
  assert.equal(status.getAttribute('role'), null, 'not a second role="status" beside the chat');
  const noAlert = () => {
    for (const el of walk(container)) {
      assert.notEqual(el.getAttribute('role'), 'alert');
      assert.notEqual(el.getAttribute('aria-live'), 'assertive');
    }
  };

  const sentences = [];
  const views = [
    { state: 'arming' },
    { state: 'listening' },
    { state: 'held' },
    { state: 'recording' },
    { state: 'transcribing' },
    ...['not_recognized', 'audio_rejected', 'too_short', 'no_connection', 'locked_for_step'].map((notice) => ({ state: 'idle', notice })),
    { state: 'unavailable', notice: null, unavailable: V11_CELL },
  ];
  for (const v of views) {
    voice.set({ notice: null, unavailable: null, ...v });
    noAlert();
    sentences.push(status.textContent);
    assert.equal(status.textContent, voiceStatusSentence(voice.view()));
    assert.ok(status.textContent.length > 0, `${v.state}/${v.notice ?? ''} says something`);
  }
  assert.equal(new Set(sentences).size, sentences.length, 'every state and notice has its own sentence');

  voice.set({ state: 'listening', notice: null, unavailable: null });
  const writes = status.textWrites;
  for (let i = 1; i <= 12; i += 1) voice.set({ elapsedMs: i * 250, level: (i % 4) });
  assert.equal(status.textWrites, writes, 'meter ticks are never announced');
  voice.set({ state: 'held' });
  assert.equal(status.textWrites, writes + 1);

  // the real machine: a full turn emits state changes, and the region announces each once
  const rig = voiceRig();
  try {
    const mounted = mountWithComposer(rig.machine);
    const live = byClass(mounted.region, 'voice-status');
    const heard = [];
    const record = () => {
      if (heard.at(-1) !== live.textContent) heard.push(live.textContent);
    };
    rig.machine.subscribe(record);
    byClass(mounted.region, 'voice-mic').fire('click');
    await settle();
    for (let i = 0; i < 8; i += 1) rig.scheduler.advance(250);
    byClass(mounted.region, 'voice-send').fire('click');
    await settle();
    assert.deepEqual(heard, ['Жду разрешения на микрофон', 'Слушаю — ничего не отправляется', 'Отправляю запись на распознавание', 'Распознаю…', '']);
    for (const el of walk(mounted.container)) assert.notEqual(el.getAttribute('role'), 'alert');
  } finally {
    rig.m.restore();
  }
});

test('9b focus never falls out of the control: a hidden focused control hands focus to the next one', async () => {
  const voice = fakeVoicePort();
  const { region, dom, composer } = mountWithComposer(voice);
  const mic = byClass(region, 'voice-mic');
  mic.focus();
  voice.set({ state: 'arming' });
  assert.equal(dom.focus.active, byClass(region, 'voice-cancel'));
  voice.set({ state: 'listening' });
  assert.equal(dom.focus.active, byClass(region, 'voice-cancel'), 'cancel is still shown, focus stays');
  byClass(region, 'voice-send').focus();
  voice.set({ state: 'recording' });
  assert.equal(dom.focus.active, byClass(region, 'voice-cancel'));
  voice.set({ state: 'unavailable', unavailable: V11_CELL });
  assert.equal(dom.focus.active, byClass(region, 'voice-status'));
  // focus elsewhere (the composer) is never taken
  composer.focus();
  voice.set({ state: 'idle', unavailable: null });
  voice.set({ state: 'listening' });
  assert.equal(dom.focus.active, composer);

  // «Отправить» is disabled while a chat turn is in flight; the mic while the composer is disabled
  const conversation = conversationViewPort();
  const voice2 = fakeVoicePort({ state: 'listening' });
  const m2 = mountWithComposer(voice2, conversation);
  assert.equal(byClass(m2.region, 'voice-send').disabled, false);
  conversation.set({ inFlight: true });
  assert.equal(byClass(m2.region, 'voice-send').disabled, true);
  voice2.set({ state: 'idle' });
  conversation.set({ composer: { enabled: false, reason: 'subscription_required' } });
  assert.equal(byClass(m2.region, 'voice-mic').disabled, true);
  // tab order within the control during capture: send, then cancel
  voice2.set({ state: 'held' });
  const order = visible(m2.region).filter((el) => el.tagName === 'BUTTON').map((el) => el.getAttribute('aria-label') ?? el.textContent);
  assert.deepEqual(order, ['Отправить запись', 'Отмена записи']);
  m2.unmount();
  assert.equal(m2.container.children.length, 2, 'unmount removes only the voice control');
});

test('9c WCAG 2.5.3 label in name: every voice control’s accessible name begins with the words it shows, in every state', () => {
  const shownText = (el) => {
    if (el.nodeType === 3) return el.textContent;
    if (el.getAttribute('aria-hidden') === 'true') return '';
    return el.children.length > 0 ? el.children.map(shownText).join('') : el.text;
  };
  const squash = (t) => t.replace(/\s+/g, ' ').trim();
  const voice = fakeVoicePort();
  const { region } = mountWithComposer(voice);
  const checked = [];
  for (const state of ['idle', 'arming', 'listening', 'held', 'recording', 'transcribing']) {
    voice.set({ state });
    for (const button of visible(region).filter((el) => el.tagName === 'BUTTON')) {
      const shown = squash(shownText(button));
      const name = squash(button.getAttribute('aria-label') ?? shownText(button));
      checked.push(`${state}: «${shown}» → «${name}»`);
      assert.ok(shown.length > 0, `${state}: a control with no visible words`);
      assert.ok(name.toLocaleLowerCase('ru').startsWith(shown.toLocaleLowerCase('ru')), `${state}: the name «${name}» does not begin with the visible «${shown}»`);
    }
  }
  for (const want of [/«Сказать голосом»/, /«Отправить»/, /«Отмена»/]) assert.ok(checked.some((c) => want.test(c)), `${want} checked: ${checked.join('; ')}`);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// test 10 — hygiene
// ═════════════════════════════════════════════════════════════════════════════════════════════════

test('10 hygiene: the voice modules hold no console, storage, object URL, playback or network API', () => {
  const banned = [
    /\bconsole\s*\./,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bindexedDB\b/,
    /\bcaches\b/,
    /\bcookie\b/,
    /\bcreateObjectURL\b/,
    /\bnew\s+Audio\s*\(/,
    /\.play\s*\(/,
    /\bspeechSynthesis\b/,
    /\bWebSocket\b/,
    /\bEventSource\b/,
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bsendBeacon\b/,
    /\bpostMessage\b/,
    /\bvmListen\b|\brtStart\b|rt\.malesthetic\.pro|\/api\/realtime|transcribe_only|CHAT_PROXY/,
    /createScriptProcessor|ScriptProcessorNode/,
  ];
  for (const rel of VOICE_FILES) {
    const code = strippedCode(rel);
    for (const re of banned) assert.doesNotMatch(code, re, `${rel}: ${re}`);
  }
  // the capture globals live in voice/capture.ts alone
  for (const rel of bundleFiles().filter((f) => f !== 'src/voice/capture.ts')) {
    const code = strippedCode(rel);
    for (const re of [/\bgetUserMedia\b/, /\bMediaRecorder\b/, /\bAudioContext\b/, /\bOfflineAudioContext\b/, /\bmediaDevices\b/])
      assert.doesNotMatch(code, re, `${rel}: ${re}`);
  }
  assert.deepEqual([...MIME_CANDIDATES], ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/aac']);
  const m = installMedia({ mimes: ['audio/mp4'] });
  try {
    assert.equal(negotiateMime(), 'audio/mp4', 'negotiated in order, no platform branch');
  } finally {
    m.restore();
  }
});
