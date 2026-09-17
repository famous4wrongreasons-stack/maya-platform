// @as: entry/main.ts
// @expect: layer-global
export const root = document.getElementById('maya');
export const leak = (d: Document): boolean => Reflect.set(d, 'coo' + 'kie', 'a=b');
