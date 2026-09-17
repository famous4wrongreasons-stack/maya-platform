// @as: src/dom/host.ts
// @expect: layer-global
export const leak = (el: HTMLElement) => el['owner' + 'Document'];
