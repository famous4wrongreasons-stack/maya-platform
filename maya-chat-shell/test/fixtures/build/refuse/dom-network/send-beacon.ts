// @as: src/dom/host.ts
// @expect: layer-global, identifier-ban
export const leak = (u: string) => navigator.sendBeacon(u);
