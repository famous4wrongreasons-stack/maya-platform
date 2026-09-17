// @as: src/dom/host.ts
// @expect: layer-global
export const leak = () => new Function('');
