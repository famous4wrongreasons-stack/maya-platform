// @as: src/dom/host.ts
// @expect: layer-global
export const leak = (a: HTMLAnchorElement): boolean => Reflect.set(a, 'hr' + 'ef', 'javascript:alert(1)');
