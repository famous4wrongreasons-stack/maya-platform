// @as: src/dom/host.ts
// @expect: layer-global
export const leak = (el: HTMLElement, u: string) => el.ownerDocument.defaultView.fetch(u);
