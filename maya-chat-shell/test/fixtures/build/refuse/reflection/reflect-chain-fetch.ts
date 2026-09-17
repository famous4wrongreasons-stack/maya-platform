// @as: src/dom/host.ts
// @expect: layer-global
export const leak = (el: HTMLElement): unknown => {
  const doc: unknown = Reflect.get(el, 'owner' + 'Document');
  const win: unknown = Reflect.get(Object(doc), 'default' + 'View');
  const f: unknown = Reflect.get(Object(win), 'fet' + 'ch');
  return typeof f === 'function' ? Reflect.apply(f, win, ['/x']) : null;
};
