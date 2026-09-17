// @as: src/dom/host.ts
// @expect: layer-global, type-assertion
export const leak = (e: Event) => (e as UIEvent).view;
