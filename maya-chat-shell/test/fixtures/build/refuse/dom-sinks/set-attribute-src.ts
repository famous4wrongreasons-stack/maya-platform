// @as: src/dom/host.ts
// @expect: dom-sink
export const sink = (el: HTMLElement, u: string): void => {
  el.setAttribute('src', u);
};
