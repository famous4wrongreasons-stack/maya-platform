// K5 — the certified Widget Contract, as the shell sees it.
//
// This is the ONLY module that names '#contract'. `build.mjs` emits the contract's declarations
// from `maya-saas-backend/tsconfig.widget-contract.json` into a temporary directory and maps
// '#contract' to them, so the shell consumes the certified types and never a second copy of them.
//
// Types only. Every line below is an `export type`, so this module emits no runtime bytes and no
// runtime edge to the backend. The build refuses a value import from here and refuses any shell
// declaration whose name collides with a contract export (D8).
//
// Not here, on purpose: no receipt shape and no resolve shape. The contract names them and the
// generated types do not declare them yet (R7-E1/E2); P1 ships no consumer for either.
//
// Frozen in S0. A unit that needs another contract type stops and reports it.

export type {
  // envelope root (section 1)
  WidgetEnvelope,
  WidgetBody,
  Provenance,
  FactUsed,
  Completeness,
  EvidenceRef,
  Authorship,
  Narrative,
  CellPointer,
  Integrity,
  Limitation,
  VerificationLevel,
  // leaves (sections 1.2-1.4)
  Cell,
  CellState,
  ReasonCode,
  Measure,
  Phrase,
  // presentation (section 0.5)
  Presentation,
  TextEquivalent,
  // intents (section 3)
  WidgetIntent,
  AuthorityHint,
  EffectClass,
  IntentTarget,
  ShellRoute,
  DetailRouteKey,
  ConfirmationRequirement,
  InputSchema,
  InputField,
  WidgetIntentSubmission,
  ReadbackAck,
  CapabilityRef,
  CapabilityRefKey,
  IntentRef,
  // kinds (section 2)
  WidgetKind,
  RoleHint,
  FullscreenReason,
  OptionItem,
  TableSpec,
  FieldBound,
  FormField,
  FormJustification,
  ChoiceBody,
  ServiceSelectorBody,
  StaffSelectorBody,
  TimeSlotSelectorBody,
  BookingConfirmationBody,
  ScheduleBody,
  ClientListBody,
  MetricBody,
  ChartBody,
  ReportBody,
  StrategyOptionsBody,
  ApprovalBody,
  ProgressBody,
  LimitationBody,
  SourceStatusBody,
  SettingsDraftBody,
  FormBody,
  ConsentStateBody,
  IdentityBindingBody,
  PaymentHandoffBody,
  MediaPreviewBody,
  ArtifactBody,
  // lifecycle, delivery and render receipt (section 4)
  Lifecycle,
  LifecycleState,
  DeliveryRecord,
  ChannelId,
  TerminalOutcome,
  TerminalLine,
  HistorisedWidget,
  RenderReceipt,
  RenderTier,
  // accessibility (section 4.8)
  A11yBlock,
  A11yEnvironment,
  InteractiveRef,
  InteractiveRefKey,
  SuffixSpec,
} from '#contract';
