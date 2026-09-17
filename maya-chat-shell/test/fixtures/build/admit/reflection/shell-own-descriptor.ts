// @as: src/shell/copy.ts
export const own = (v: object, k: string): unknown => Object.getOwnPropertyDescriptor(v, k)?.value;
