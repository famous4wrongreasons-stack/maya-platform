// @as: src/dom/host.ts
// @expect: dom-sink
export const link = (a: HTMLAnchorElement, u: string): void => {
  a.href = u;
};
