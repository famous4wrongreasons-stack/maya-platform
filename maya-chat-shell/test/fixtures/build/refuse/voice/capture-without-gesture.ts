// @as: src/voice/capture.ts
// @expect: voice-capture
export const capture = () => navigator.mediaDevices.getUserMedia({ audio: true });
