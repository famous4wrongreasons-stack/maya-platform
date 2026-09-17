// @as: src/dom/host.ts
// @expect: dom-sink
export const sink = (btn: HTMLButtonElement): void => {
  btn.click();
};
