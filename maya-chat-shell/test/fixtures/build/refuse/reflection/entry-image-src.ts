// @as: entry/main.ts
// @expect: dom-sink
export const root = document.getElementById('maya');
export const leak = (page: Document): void => {
  page.createElement('img').src = '/x';
};
