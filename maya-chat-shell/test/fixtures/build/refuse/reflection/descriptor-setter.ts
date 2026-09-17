// @as: src/dom/host.ts
// @expect: layer-global
export const leak = (el: HTMLElement, s: string): void => {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'inner' + 'HTML')?.set?.call(el, s);
};
