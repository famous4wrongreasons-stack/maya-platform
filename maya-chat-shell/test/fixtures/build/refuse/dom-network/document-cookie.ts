// @as: src/dom/host.ts
// @expect: layer-global, identifier-ban, k5-text
export const leak = () => document.cookie;
