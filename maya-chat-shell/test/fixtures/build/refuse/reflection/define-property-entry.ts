// @as: entry/main.ts
// @expect: layer-global
export const root = document.getElementById('maya');
export const trap = (a: HTMLAnchorElement): void => {
  Object.defineProperty(a, 'rel', { set: () => undefined });
};
