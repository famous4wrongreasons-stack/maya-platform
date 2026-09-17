// @as: src/dom/host.ts
// @expect: dom-sink
export const leak = (a: HTMLAnchorElement, u: string): void => {
  [a.href] = [u];
};
