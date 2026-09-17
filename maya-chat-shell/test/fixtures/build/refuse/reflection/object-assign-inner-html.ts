// @as: src/dom/host.ts
// @expect: dom-sink
export const leak = (el: HTMLElement, s: string): HTMLElement => Object.assign(el, { innerHTML: s });
