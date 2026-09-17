// @as: src/dom/host.ts
// @expect: layer-global
export const leak = (e: Event): EventTarget | undefined => e.composedPath().at(-1);
