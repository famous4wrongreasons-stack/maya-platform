// @as: entry/main.ts
const root = document.getElementById('maya');
export const here = (): string | null => root?.ownerDocument.defaultView?.location.href ?? null;
