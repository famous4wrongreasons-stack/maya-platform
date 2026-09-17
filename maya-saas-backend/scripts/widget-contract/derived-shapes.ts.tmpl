// K2 - five shapes the certified contract NAMES and declares nowhere.
//
// Found by compiling it, which is what K2 is for. Each is fixed by the contract's own text, in
// the clause quoted on it; none adds a semantic and none is an owner decision. Written down here
// so that a rule citing one is a rule against a typed thing rather than against a free name.
//
// A first pass at these under-read three of them. The corrected versions below take the members
// the contract states rather than the members a reasonable guess would supply, which is the
// difference between deriving a shape and inventing one.
import type {
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
} from './kinds';
import type { CapabilityRef } from './capability-ref';
import type { WidgetIntent } from './intent';

/**
 * `WidgetBody` - the union of the twenty-two kind bodies.
 *
 * Fixed by: section 2.1's closed enum plus section 2.6's twenty-two bodies. `refSet` and
 * `resolveInteractive` both take it, and an envelope's `body` is one of exactly these.
 * Built by: K2, here. Total over the enum by construction - a kind added to the union without a
 * body here fails compilation, which is section 2.2 K1's own discipline.
 */
export type WidgetBody =
  | ChoiceBody
  | ServiceSelectorBody
  | StaffSelectorBody
  | TimeSlotSelectorBody
  | BookingConfirmationBody
  | ScheduleBody
  | ClientListBody
  | MetricBody
  | ChartBody
  | ReportBody
  | StrategyOptionsBody
  | ApprovalBody
  | ProgressBody
  | LimitationBody
  | SourceStatusBody
  | SettingsDraftBody
  | FormBody
  | ConsentStateBody
  | IdentityBindingBody
  | PaymentHandoffBody
  | MediaPreviewBody
  | ArtifactBody;

/**
 * `CorrelationRefs` - the ids a composer input carries beside its correlation.
 *
 * Fixed by: section 1.1.2, whose member comment is exact - "run/turn/message/parent ids only".
 * Four optional opaque ids and nothing else; a composer input carries no capability, endpoint or
 * role, so there is nothing else this could hold.
 * Built by: K3 - the gateway mints them.
 */
export interface CorrelationRefs {
  readonly run_id?: string;
  readonly turn_id?: string;
  readonly message_id?: string;
  readonly parent_id?: string;
}

/**
 * `IntentProposal` - what a projector may PROPOSE before the minter types it.
 *
 * Fixed by: section 1.1.2's member comment, which enumerates it outright -
 *   "capability (or handoff_capability_ref), argument handles, role. No token. No floor."
 * Every exclusion in that sentence is load-bearing and is expressed in the type rather than in a
 * comment: there is no member able to carry an `intent_token`, a `verification_floor`, an
 * `effect` or a `target`, so a projector cannot propose one. Section 1.1.2 E5 is the rule this
 * shape exists to make structural.
 * Built by: K3.
 */
export interface IntentProposal {
  readonly capability?: CapabilityRef;
  readonly handoff_capability_ref?: CapabilityRef;
  readonly argument_handles?: Readonly<Record<string, string>>;
  readonly role: WidgetIntent['role'];
}

/**
 * `BridgeKey` - the key of one native bridge capability.
 *
 * NOT closed by the contract, and deliberately left open here rather than invented. Section 4.6
 * NT2 fixes what matters - `required: []`, the empty tuple, so no business capability may be
 * gated on any plugin - and never enumerates the keys. The repository names three plugins as
 * evidence (`MayaRuntime`, `MayaNfcWriter`, `AppIcon`) without saying those ARE the set.
 * Closing it is K6's job against the real shell, and it confers nothing either way: `required`
 * being the empty tuple means the set cannot gate a capability whatever its members.
 * Built by: K6.
 */
export type BridgeKey = string;

/**
 * `BridgeSession` - the negotiated availability of each bridge key, for one session.
 *
 * Fixed by: section 4.6 NT3, which states the member exactly -
 *   "`BridgeSession.resolved: Record<BridgeKey, 'available'|'absent'|'unknown'>` computed by one
 *    negotiator; `bridge(key)` reads only that map."
 * NT3's rule is capability negotiation, never platform detection: `isNativePlatform()` is a
 * platform predicate and must never be used as a capability predicate. This shape is what makes
 * that structural - there is nothing here to ask about the platform.
 * Built by: K6, once per session at app boot.
 */
export interface BridgeSession {
  readonly resolved: Readonly<
    Record<BridgeKey, 'available' | 'absent' | 'unknown'>
  >;
}
