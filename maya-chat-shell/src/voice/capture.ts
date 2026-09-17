// K5 — the ONE capture module (SHELL-PLAN v2.1 §1.9, rule V-1; lens-voice §6.3, §6.8).
//
// The only place in the bundle that touches the microphone: `navigator.mediaDevices.getUserMedia`,
// `MediaRecorder`, `AudioContext` and `OfflineAudioContext`. It never sends anything: it returns an
// encoded clip, and the shell hands that to the transport. It holds no network, no persistence, no
// logging and no playback, and it drops every reference to audio once a clip is taken or cancelled.
//
//   availability()  secure context · getUserMedia's host · MediaRecorder · AudioContext ·
//                   OfflineAudioContext · a negotiated MIME type (negotiation, never platform
//                   detection — NT3)
//   arm(proof)      V7: refuses without a genuine, unused GestureProof; the AudioContext is created
//                   and getUserMedia is called synchronously inside the gesture's call stack
//   hold()          the 20 s cap: capture stops, tracks end, the clip stays on the device
//   take(proof)     stop if needed → decodeAudioData → OfflineAudioContext(1, ⌈d·16000⌉, 16000)
//                   → PCM16 → 44-byte RIFF → data URL. Rejects when decoding is impossible (V11)
//   cancel()        tracks stopped, recorder discarded, context closed, clip dropped. Idempotent

import type { ArmOutcome, CaptureAvailability, CapturePort, EncodedClip, GestureProof } from '../shell/ports.ts';
import { encodeWavPcm16Mono16k, WAV_SAMPLE_RATE, wavDataUrl } from './wav.ts';

/** Probed in order with `MediaRecorder.isTypeSupported`; the first supported one is used. */
export const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/aac',
] as const;

/** Mono, with the browser's voice processing; the sample rate is never constrained. */
export const CAPTURE_CONSTRAINTS = {
  audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
} as const;

export interface CaptureOptions {
  /** `isSecureContext` of the page, read by `entry/` (the voice layer reaches no window). */
  readonly secureContext: boolean;
}

const GESTURE_TYPES: ReadonlySet<string> = new Set(['click', 'keydown', 'pointerup']);

/** A proof is genuine when it came from a trusted event of an allowed type. Runtime-checked: JS callers exist. */
function genuineProof(proof: GestureProof | null | undefined): boolean {
  return (
    typeof proof === 'object' &&
    proof !== null &&
    proof.isTrusted === true &&
    GESTURE_TYPES.has(proof.type) &&
    typeof proof.timeStamp === 'number' &&
    Number.isFinite(proof.timeStamp)
  );
}

/** The first MIME type this engine can record, or null. */
export function negotiateMime(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return null;
  for (const mime of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // an engine that throws on a candidate simply does not support it
    }
  }
  return null;
}

/** RMS of a time-domain frame → the 3-step meter (0 = silence). */
export function levelFromRms(rms: number): 0 | 1 | 2 | 3 {
  if (!(rms >= 0.01)) return 0;
  if (rms < 0.05) return 1;
  if (rms < 0.15) return 2;
  return 3;
}

/** decodeAudioData in both its promise and callback forms (older WebKit has only the callbacks). */
function decode(ctx: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise<AudioBuffer>((resolve, reject) => {
    const pending: Promise<AudioBuffer> | undefined = ctx.decodeAudioData(data, resolve, reject);
    if (pending !== undefined && typeof pending.then === 'function') pending.then(resolve, reject);
  });
}

interface CaptureSession {
  readonly ctx: AudioContext;
  stream: MediaStream | null;
  recorder: MediaRecorder | null;
  source: MediaStreamAudioSourceNode | null;
  analyser: AnalyserNode | null;
  frame: Float32Array<ArrayBuffer> | null;
  chunks: Blob[];
  mime: string;
  stopped: Promise<void> | null;
}

const stopTracks = (stream: MediaStream | null): void => {
  if (stream === null) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // a track that cannot be stopped has already ended
    }
  }
};

const closeContext = (ctx: AudioContext): void => {
  if (ctx.state === 'closed') return;
  try {
    ctx.close().then(undefined, () => undefined);
  } catch {
    // a context that cannot close is already unusable
  }
};

const stopRecorder = (recorder: MediaRecorder | null): Promise<void> => {
  if (recorder === null || recorder.state === 'inactive') return Promise.resolve();
  return new Promise<void>((resolve) => {
    recorder.addEventListener('stop', () => resolve(), { once: true });
    try {
      recorder.stop();
    } catch {
      resolve();
    }
  });
};

const deniedName = (reason: unknown): boolean =>
  typeof reason === 'object' && reason !== null && 'name' in reason && (reason.name === 'NotAllowedError' || reason.name === 'SecurityError');

export function createCapture(options: CaptureOptions): CapturePort {
  let session: CaptureSession | null = null;
  /** Bumped by cancel(): a continuation from an older generation cleans up and yields nothing. */
  let generation = 0;
  const consumed = new WeakSet<object>();

  const release = (s: CaptureSession): void => {
    stopTracks(s.stream);
    s.stream = null;
    try {
      s.source?.disconnect();
    } catch {
      // already disconnected
    }
    s.source = null;
    s.analyser = null;
    s.frame = null;
  };

  const drop = (s: CaptureSession): void => {
    release(s);
    s.chunks = [];
    const recorder = s.recorder;
    s.recorder = null;
    if (recorder !== null && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // an errored recorder is already inactive
      }
    }
    closeContext(s.ctx);
    if (session === s) session = null;
  };

  const port: CapturePort = {
    availability(): CaptureAvailability {
      if (options.secureContext !== true) return { available: false, reason: 'insecure_context' };
      if (
        navigator.mediaDevices === undefined ||
        typeof MediaRecorder === 'undefined' ||
        typeof AudioContext === 'undefined' ||
        typeof OfflineAudioContext === 'undefined'
      )
        return { available: false, reason: 'api_absent' };
      if (negotiateMime() === null) return { available: false, reason: 'no_mime_type' };
      return { available: true };
    },

    async arm(proof: GestureProof): Promise<ArmOutcome> {
      if (!genuineProof(proof) || consumed.has(proof)) return { armed: false, reason: 'denied' };
      consumed.add(proof);
      if (session !== null) return { armed: false, reason: 'busy' };
      if (!port.availability().available) return { armed: false, reason: 'absent' };
      const mime = negotiateMime();
      if (mime === null) return { armed: false, reason: 'absent' };

      // Both happen before the first await, i.e. inside the gesture (iOS audio unlock, V7).
      let ctx: AudioContext;
      let request: Promise<MediaStream>;
      try {
        ctx = new AudioContext();
      } catch {
        return { armed: false, reason: 'absent' };
      }
      try {
        request = navigator.mediaDevices.getUserMedia(CAPTURE_CONSTRAINTS);
      } catch {
        closeContext(ctx);
        return { armed: false, reason: 'absent' };
      }
      if (ctx.state === 'suspended') ctx.resume().then(undefined, () => undefined);
      const mine: CaptureSession = { ctx, stream: null, recorder: null, source: null, analyser: null, frame: null, chunks: [], mime, stopped: null };
      session = mine;
      const at = generation;

      let stream: MediaStream;
      try {
        stream = await request;
      } catch (reason) {
        drop(mine);
        return { armed: false, reason: deniedName(reason) ? 'denied' : 'absent' };
      }
      mine.stream = stream;
      if (at !== generation || session !== mine) {
        drop(mine);
        return { armed: false, reason: 'busy' };
      }

      try {
        const recorder = new MediaRecorder(stream, { mimeType: mime });
        recorder.addEventListener('dataavailable', (event) => {
          if (event.data.size > 0) mine.chunks.push(event.data);
        });
        mine.recorder = recorder;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
        mine.source = source;
        mine.analyser = analyser;
        mine.frame = new Float32Array(analyser.fftSize);
        recorder.start(); // no timeslice: one container (fragmented MP4 is a WebKit decode hazard)
      } catch {
        drop(mine);
        return { armed: false, reason: 'absent' };
      }
      return { armed: true };
    },

    level(): 0 | 1 | 2 | 3 {
      const s = session;
      if (s === null || s.analyser === null || s.frame === null || s.stream === null) return 0;
      s.analyser.getFloatTimeDomainData(s.frame);
      let sum = 0;
      for (const v of s.frame) sum += v * v;
      return levelFromRms(Math.sqrt(sum / s.frame.length));
    },

    hold(): void {
      const s = session;
      if (s === null) return;
      if (s.stopped === null) s.stopped = stopRecorder(s.recorder);
      release(s);
    },

    async take(proof: GestureProof): Promise<EncodedClip | null> {
      if (!genuineProof(proof) || consumed.has(proof)) return null;
      consumed.add(proof);
      const s = session;
      if (s === null) return null;
      const at = generation;
      const stale = (): boolean => at !== generation || session !== s;

      try {
        if (s.stopped === null) s.stopped = stopRecorder(s.recorder);
        release(s);
        await s.stopped;
        if (stale()) return null;
        const chunks = s.chunks;
        s.chunks = [];
        s.recorder = null;
        if (chunks.length === 0) {
          drop(s);
          return null;
        }
        const recorded = await new Blob(chunks, { type: s.mime }).arrayBuffer();
        if (stale()) return null;
        const decoded = await decode(s.ctx, recorded);
        if (stale()) return null;
        const frames = Math.ceil(decoded.duration * WAV_SAMPLE_RATE);
        if (!(frames > 0)) {
          drop(s);
          return null;
        }
        const offline = new OfflineAudioContext(1, frames, WAV_SAMPLE_RATE);
        const node = offline.createBufferSource();
        node.buffer = decoded;
        node.connect(offline.destination); // the speaker down-mix to mono is the spec default
        node.start();
        const rendered = await offline.startRendering();
        if (stale()) return null;
        const clip: EncodedClip = {
          durationMs: Math.round(decoded.duration * 1000),
          dataUrl: wavDataUrl(encodeWavPcm16Mono16k(rendered.getChannelData(0))),
        };
        drop(s);
        return clip;
      } catch (reason) {
        drop(s);
        throw reason;
      }
    },

    cancel(): void {
      generation += 1;
      const s = session;
      if (s !== null) drop(s);
    },
  };
  return port;
}
