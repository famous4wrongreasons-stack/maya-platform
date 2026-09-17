// @as: src/dom/host.ts
// @expect: layer-global
export const leak = (el: HTMLElement, s: string): boolean => Reflect.set(el, 'innerHTML', s);
