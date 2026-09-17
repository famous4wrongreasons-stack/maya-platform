// @as: src/net/session.ts
// @expect: literal-ban
// A retired path assembled from two literals is still a retired path (constant folding, D4).
export const toolsPath = '/ai/' + 'tools';
