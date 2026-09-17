// @as: src/dom/host.ts
// @expect: dom-sink
export const sink = (el: HTMLElement, s: string): void => {
  el.innerHTML = s;
};
