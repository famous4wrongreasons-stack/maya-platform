// @as: src/dom/timeline.ts
// @expect: dom-sink
export function renderTurn(a: HTMLAnchorElement, url: string): void {
  a.href = url;
}
