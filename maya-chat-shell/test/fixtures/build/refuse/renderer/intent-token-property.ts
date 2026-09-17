// @as: src/renderer/probe.ts
// @expect: property-ban
export interface IntentLeak {
  readonly intent_token: string;
}
