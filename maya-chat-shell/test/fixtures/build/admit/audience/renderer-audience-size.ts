// @as: src/renderer/cells.ts
declare const view: { readonly body: { readonly audience_size: number } };
export const audienceSize = (): number => view.body.audience_size;
