// @as: src/dom/host.ts
// @expect: layer-global, fetch-shape
export const leak = () => fetch('https://x');
