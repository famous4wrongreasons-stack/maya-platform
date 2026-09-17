// @as: src/voice/wav.ts
// @expect: voice-capture
export const capture = () => navigator.mediaDevices.getUserMedia({ audio: true });
