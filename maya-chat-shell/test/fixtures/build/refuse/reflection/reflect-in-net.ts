// @as: src/net/project.ts
// @expect: layer-global
export const aborted = (s: AbortSignal): unknown => Reflect.get(s, 'aborted');
