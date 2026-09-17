// @as: src/voice/capture.ts
import type { GestureProof } from '../shell/ports.ts';

export const arm = (proof: GestureProof): Promise<MediaStream> =>
  navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
