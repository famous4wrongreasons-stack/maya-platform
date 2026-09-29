// The carrier's voice layer: the encoder against the shell's, and the gesture gate without a device.
//
//   node --test test/voice.test.mjs
//
// 🔴 Nothing here opens a microphone. `availability()` is a synchronous capability probe and `arm`
// refuses a bad proof before it reaches any API, so the gate is provable on a machine with no audio
// stack at all — which is what Node is.

import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const M = await import(pathToFileURL(path.join(HERE, '.bundle.mjs')).href);

/** Deterministic sample corpora — silence, full scale, clipping, and a tone. */
const CORPORA = [
  [],
  [0],
  [1, -1, 0.5, -0.5],
  [1.5, -1.5],                                   // must clamp
  [0.9999695, -1],                               // the asymmetric 0x7fff / 0x8000 scaling
  Array.from({ length: 1 }, () => 0.25),
  Array.from({ length: 2 }, (_, i) => i / 2),    // base64 remainder 1
  Array.from({ length: 4 }, (_, i) => i / 4),    // base64 remainder 2
  Array.from({ length: 16_000 }, (_, i) => Math.sin((i / 16_000) * 2 * Math.PI * 440)),
];

test('the encoder is byte-identical to the shell’s, over every corpus', () => {
  for (const samples of CORPORA) {
    const mine = M.encodeWavPcm16Mono16k(samples);
    const theirs = M.shellEncodeWav(samples);
    assert.equal(mine.length, theirs.length, `length for ${samples.length} samples`);
    assert.ok(Buffer.from(mine).equals(Buffer.from(theirs)), `bytes for ${samples.length} samples`);
    assert.equal(M.wavDataUrl(mine), M.shellWavDataUrl(theirs), `data url for ${samples.length}`);
  }
});

test('the 44-byte RIFF header is the one the backend parses', () => {
  const samples = Array.from({ length: 8 }, () => 0);
  const wav = M.encodeWavPcm16Mono16k(samples);
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const ascii = (at, n) => String.fromCharCode(...wav.slice(at, at + n));
  assert.equal(M.WAV_HEADER_BYTES, 44);
  assert.equal(wav.length, 44 + samples.length * 2);
  assert.equal(ascii(0, 4), 'RIFF');
  assert.equal(view.getUint32(4, true), 36 + samples.length * 2);
  assert.equal(ascii(8, 4), 'WAVE');
  assert.equal(ascii(12, 4), 'fmt ');
  assert.equal(view.getUint32(16, true), 16, 'fmt chunk size');
  assert.equal(view.getUint16(20, true), 1, 'format 1 = PCM');
  assert.equal(view.getUint16(22, true), 1, 'mono');
  assert.equal(view.getUint32(24, true), 16_000, 'sample rate');
  assert.equal(view.getUint32(28, true), 32_000, 'byte rate');
  assert.equal(view.getUint16(32, true), 2, 'block align');
  assert.equal(view.getUint16(34, true), 16, 'bits per sample');
  assert.equal(ascii(36, 4), 'data');
  assert.equal(view.getUint32(40, true), samples.length * 2);
});

test('the wire form is a data URL, not bare base64', () => {
  const url = M.wavDataUrl(M.encodeWavPcm16Mono16k([0, 0.5]));
  assert.ok(url.startsWith('data:audio/wav;base64,'), url.slice(0, 40));
  // The backend parses the whole string; stripping the prefix is the natural reading of the field
  // name `audioBase64` and it breaks the parser.
  assert.ok(url.length > 'data:audio/wav;base64,'.length);
});

test('base64 agrees with the platform encoder, including both remainders', () => {
  for (const n of [0, 1, 2, 3, 4, 5, 6, 3 * 4096, 3 * 4096 + 1, 3 * 4096 + 2]) {
    const bytes = new Uint8Array(Array.from({ length: n }, (_, i) => (i * 37) % 256));
    assert.equal(M.base64Encode(bytes), Buffer.from(bytes).toString('base64'), `n=${n}`);
  }
});

// ── the gesture gate, with no audio stack present ──────────────────────────────────────────────

test('an insecure context is refused before any API is touched', () => {
  const capture = M.createCapture({ secureContext: false });
  assert.deepEqual(capture.availability(), { available: false, reason: 'insecure_context' });
});

test('a secure context with no capture APIs reports api_absent, not a crash', () => {
  const capture = M.createCapture({ secureContext: true });
  const answer = capture.availability();
  assert.equal(answer.available, false);
  assert.equal(answer.reason, 'api_absent', 'Node has no mediaDevices/MediaRecorder/AudioContext');
});

test('arm refuses a forged proof, a replayed proof and a wrong gesture type', async () => {
  const capture = M.createCapture({ secureContext: true });
  const forged = { isTrusted: false, type: 'click', timeStamp: 1 };
  assert.deepEqual(await capture.arm(forged), { armed: false, reason: 'denied' }, 'isTrusted false');

  const wrongType = { isTrusted: true, type: 'mousedown', timeStamp: 1 };
  assert.deepEqual(await capture.arm(wrongType), { armed: false, reason: 'denied' }, 'wrong type');

  const notFinite = { isTrusted: true, type: 'click', timeStamp: Number.NaN };
  assert.deepEqual(await capture.arm(notFinite), { armed: false, reason: 'denied' }, 'non-finite stamp');

  // A genuine-shaped proof gets past V7 and then fails on the absent API — which proves the gate
  // let it through rather than the API check masking the gate.
  const genuine = { isTrusted: true, type: 'click', timeStamp: 12.5 };
  assert.deepEqual(await capture.arm(genuine), { armed: false, reason: 'absent' }, 'genuine → absent');

  // …and the SAME object is spent: replaying it is denied, not absent.
  assert.deepEqual(await capture.arm(genuine), { armed: false, reason: 'denied' }, 'replay is denied');
});

test('take spends from the same set as arm, so one gesture can never do both', async () => {
  const capture = M.createCapture({ secureContext: true });
  const proof = { isTrusted: true, type: 'click', timeStamp: 3 };
  assert.deepEqual(await capture.arm(proof), { armed: false, reason: 'absent' }, 'armed past V7');
  assert.equal(await capture.take(proof), null, 'the same proof is already spent');
});

test('the port answers safely with no session at all', () => {
  const capture = M.createCapture({ secureContext: true });
  assert.equal(capture.level(), 0);
  capture.hold();
  capture.cancel();
  capture.cancel();
  assert.equal(capture.level(), 0, 'still quiet, still not throwing');
});

test('the negotiated formats and constraints are the shell’s', () => {
  assert.deepEqual([...M.MIME_CANDIDATES], [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/aac',
  ]);
  assert.deepEqual(M.CAPTURE_CONSTRAINTS, {
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
});
