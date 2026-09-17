// @as: src/renderer/cells.ts
// @expect: contract-collision
const refKey = (k: string, id: string): string => `${k}:${id}`;
export const interactiveKey = refKey('intent', 'i1');
