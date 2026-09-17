// @as: src/renderer/probe.ts
export const keys = (o: Readonly<Record<string, unknown>>): string[] => Object.keys(o).sort();
export const clamp = (n: number): number => Math.max(0, Math.min(3, n));
