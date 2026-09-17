// @as: src/shell/voice-state.ts
// @expect: layer-global, voice-capture
export const capture = () => navigator.mediaDevices.getUserMedia({ audio: true });
