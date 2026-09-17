// @as: entry/main.ts
// @expect: layer-global
export const root = document.getElementById('maya');
export const leak = (w: Window): void => {
  const store = Reflect.get(w, 'local' + 'Storage') as { setItem(k: string, v: string): void };
  store.setItem('k', 'v');
};
