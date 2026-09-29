// The voice hook's encoder, re-typed for the carrier.
//
// `/api/ai/transcribe` accepts exactly one format: WAV, PCM16, 16 kHz, mono. The 44-byte RIFF
// header is byte-identical to the backend spec's own fixture and to the legacy PWA encoder:
// format 1 (PCM), 1 channel, 16 000 Hz, byte rate 32 000, block align 2, 16 bits.
//
// 🔴 Transcribed from maya-chat-shell/src/voice/wav.ts, NOT imported: the `voice` layer is
// deliberately outside the published @maya/runtime package (RUNTIME_LAYERS names six layers and
// voice is not one) because it needs MediaRecorder and AudioContext, and the carrier's allowlist
// refuses it by name — there is a passing fixture for that exact import. The format is a wire
// contract with the backend's parser, so test/voice.test.mjs compares these bytes with the shell's
// own encoder over a corpus rather than trusting the transcription.
//
// ES intrinsics only: no host global, no clock, no entropy. Base64 is written out by hand because
// this layer has no `btoa`.

export const WAV_SAMPLE_RATE = 16_000;
export const WAV_HEADER_BYTES = 44;
export const WAV_DATA_URL_PREFIX = 'data:audio/wav;base64,';

/**
 * Whatever holds the rendered mono samples — a Float32Array from an OfflineAudioContext, or a plain
 * array in a test. Written as a named shape rather than `ArrayLike<number>` because the carrier's
 * closed-tag scanner reads raw text and a lowercase type argument matches its tag pattern.
 */
export interface Samples {
  readonly length: number;
  readonly [index: number]: number | undefined;
}

/** Float samples in [-1, 1] → a complete WAV file (header + little-endian PCM16). */
export function encodeWavPcm16Mono16k(samples: Samples): Uint8Array {
  const count = samples.length;
  const pcmBytes = count * 2;
  const bytes = new Uint8Array(WAV_HEADER_BYTES + pcmBytes);
  const view = new DataView(bytes.buffer);
  let at = 0;
  const ascii = (s: string): void => {
    for (let i = 0; i < s.length; i += 1) {
      view.setUint8(at, s.charCodeAt(i));
      at += 1;
    }
  };
  const u32 = (x: number): void => {
    view.setUint32(at, x, true);
    at += 4;
  };
  const u16 = (x: number): void => {
    view.setUint16(at, x, true);
    at += 2;
  };

  ascii('RIFF');
  u32(36 + pcmBytes);
  ascii('WAVE');
  ascii('fmt ');
  u32(16); // fmt chunk size
  u16(1); // PCM
  u16(1); // mono
  u32(WAV_SAMPLE_RATE);
  u32(WAV_SAMPLE_RATE * 2); // byte rate = rate × block align
  u16(2); // block align = channels × bytes per sample
  u16(16); // bits per sample
  ascii('data');
  u32(pcmBytes);

  for (let i = 0; i < count; i += 1) {
    const v = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(at, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    at += 2;
  }
  return bytes;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** RFC 4648 base64 with padding. Chunked so a 20 s clip (640 044 B) never builds one giant array. */
export function base64Encode(bytes: Uint8Array): string {
  const parts: string[] = [];
  const CHUNK = 3 * 4096;
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const end = Math.min(bytes.length, start + CHUNK);
    let s = '';
    let i = start;
    for (; i + 2 < end; i += 3) {
      const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
      s += ALPHABET.charAt((n >> 18) & 63) + ALPHABET.charAt((n >> 12) & 63) + ALPHABET.charAt((n >> 6) & 63) + ALPHABET.charAt(n & 63);
    }
    const rest = end - i;
    if (rest === 1) {
      const n = (bytes[i] ?? 0) << 16;
      s += ALPHABET.charAt((n >> 18) & 63) + ALPHABET.charAt((n >> 12) & 63) + '==';
    } else if (rest === 2) {
      const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8);
      s += ALPHABET.charAt((n >> 18) & 63) + ALPHABET.charAt((n >> 12) & 63) + ALPHABET.charAt((n >> 6) & 63) + '=';
    }
    parts.push(s);
  }
  return parts.join('');
}

/** The one wire form: `data:audio/wav;base64,<file>` (JSON body, never multipart). */
export function wavDataUrl(wav: Uint8Array): string {
  return WAV_DATA_URL_PREFIX + base64Encode(wav);
}
