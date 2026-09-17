// @as: src/renderer/probe.ts
export interface ActionShape {
  readonly role_hint: string;
  readonly intent_ref: string;
}
export const action = (ref: string): ActionShape => ({ role_hint: 'group', intent_ref: ref });
