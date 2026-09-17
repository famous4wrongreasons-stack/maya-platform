// @as: src/dom/host.ts
export const names = (m: Readonly<Record<string, string>>): string[] => Object.keys(m).concat(Object.entries(m).map(([k, v]) => `${k}=${v}`));
