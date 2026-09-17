// K5 — the voice hook's encoder (SHELL-PLAN v2.1 §1.9; lens-voice §6.3).
//
// `/api/ai/transcribe` accepts exactly one format: WAV, PCM16, 16 kHz, mono (`ai-speech.service.ts`
// `extractPcm`). This module turns rendered mono samples into that file and into the JSON-safe
// `data:audio/wav;base64,…` string the transport sends.
//
// The 44-byte RIFF header is byte-identical to the backend spec's fixture
// (`ai-speech.service.spec.ts:93-108`) and to the legacy PWA encoder: format 1 (PCM), 1 channel,
// 16 000 Hz, byte rate 32 000, block align 2, 16 bits.
//
// ES intrinsics only: no host global, no clock, no entropy. Base64 is written out here because the
// voice layer has no `btoa`.

export const WAV_SAMPLE_RATE = 16_000;
export const WAV_HEADER_BYTES = 44;
export const WAV_DATA_URL_PREFIX = 'data:audio/wav;base64,';

/** Float samples in [-1, 1] → a complete WAV file (header + little-endian PCM16). */
export function encodeWavPcm16Mono16k(samples: ArrayLike<number>): Uint8Array {
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
