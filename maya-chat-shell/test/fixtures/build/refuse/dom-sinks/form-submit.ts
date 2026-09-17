// @as: src/dom/host.ts
// @expect: dom-sink
export const sink = (form: HTMLFormElement): void => {
  form.submit();
};
