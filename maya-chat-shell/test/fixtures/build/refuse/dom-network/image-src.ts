// @as: src/dom/host.ts
// @expect: layer-global, dom-sink
export const leak = (u: string) => {
  new Image().src = u;
};
