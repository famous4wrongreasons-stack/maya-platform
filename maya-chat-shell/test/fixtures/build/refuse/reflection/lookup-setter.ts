// @as: src/dom/host.ts
// @expect: identifier-ban
export const leak = (el: HTMLElement): unknown => Object.prototype.__lookupSetter__.call(el, 'innerHTML');
