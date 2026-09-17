// @as: src/dom/host.ts
// @expect: import-allowlist
export const leak = () => import('x');
