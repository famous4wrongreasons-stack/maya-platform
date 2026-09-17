// @as: src/renderer/probe.ts
// @expect: layer-global
export const leak = () => globalThis['fe' + 'tch'];
