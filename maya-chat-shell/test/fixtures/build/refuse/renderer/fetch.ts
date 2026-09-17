// @as: src/renderer/probe.ts
// @expect: layer-global, fetch-shape
export const leak = () => fetch('u');
