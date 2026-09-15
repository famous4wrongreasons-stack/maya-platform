// K2 - the certified contract, compiled.
// `subjectCapability` has its SIGNATURE in verification-floor (section 0.8 F41) and its one BODY
// in intent (section 3.5). That is one declaration and not two - section 0.2 F6a admits it by
// name - but a barrel must still choose which to re-export. It re-exports the body.
export * from './capability-ref';
export * from './envelope-roots';
export * from './envelope';
export * from './kinds';
export * from './lifecycle';
export * from './verification-floor';
export * from './registries';
export * from './confirmation-guard';
export * from './tables';
export * from './derived-shapes';
export * from './ambient';
export { subjectCapability, NEVER_CHAT_ACTUATED } from './intent';
export type {
  WidgetIntent,
  AuthorityHint,
  EffectClass,
  IntentTarget,
  ShellRoute,
  DetailRouteKey,
  ConfirmationRequirement,
  InputSchema,
  InputField,
  IntentRecord,
  WidgetIntentSubmission,
  ReadbackAck,
} from './intent';
