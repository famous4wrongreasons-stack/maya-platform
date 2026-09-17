// @as: src/dom/timeline.ts
export function renderReplyLink(a: HTMLAnchorElement, url: string): boolean {
  if (!/^(https:|tel:|mailto:)/.test(url)) return false;
  a.href = url;
  a.rel = 'noopener noreferrer';
  return true;
}
