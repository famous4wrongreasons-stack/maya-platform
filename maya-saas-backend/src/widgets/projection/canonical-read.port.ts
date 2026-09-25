// U12a — the projector's ONLY data edge, declared as a TYPE and nothing else.
//
// Row 12 (C11:4732) says the new body is produced "behind the same five client-preview / PII
// enforcement points". F95 item 2 (C11:1882-1886) rules the COUNT unproven — "the five are
// enumerated nowhere" — and keeps this remainder normative: no widget-layer module may implement PII
// masking of its own, and **the projector reaches a capability only through the same service call
// sites the non-widget read paths use**. That second half is what this file is for: one named edge,
// so "the projector read the owner's way" is a property of the import graph rather than of a review.
//
// IN U12a THE EDGE HAS NO IMPLEMENTATION AND NO OWNER IMPORT. That is deliberate, not unfinished:
//   - `WidgetProjectorService` answers `degraded` with ZERO reads, so an edge with a body would be an
//     edge nothing may cross yet, and a fence nothing calls protects nobody (P-K4K8's lesson);
//   - the union import-graph test (`widget-import-graph.architecture.spec.ts`) and k3 check 9 already
//     admit exactly this file, beside `owner-ports/**`, as the one projection file that MAY import an
//     owner service. U12b binds it and asks the integrator for the module imports and the DI token in
//     the same commit as the row it registers (§2.6 item 6).
// So ARCH-12-14 ("no module reachable from here reads `BridgeSession` or `native_bridge`") holds over
// a closure of widget-contract types today, and the ratchet is in place before the first owner edge.
//
// What U12b may add here, and nothing else (G12-R3, PLAN G12 §5.3):
//   `capability_read`     `def = c9Registry.tryGet(row.subject_key)`, `def.mode === 'READ'` asserted per
//                         row at `EP-BUILD` (ARCH-12-7), then by the registry's owner key:
//                         `AiToolRuntimeService.execute(plan.actor, name, { arguments, surface })`
//                         WITHOUT an `idempotencyKey`; `MeasurementReadService.read/snapshot`;
//                         `C8ReadService.list/snapshot`.
//   `orchestrator_state`  `C9Store.snapshot(plan.runId)` or `C9Execution.status(plan.runId)`.
// Never `AiToolHandlerService`, `AppointmentsService`, `ClientAppointmentReadService`,
// `C9Store.review/revision/cancel/admit`, or a Prisma model outside `Widget*` (ARCH-12-1).
//
// `tenantId` and `userId` are expressions over `plan.authority` / `plan.actor` and over nothing else —
// never the record, never a frozen noun, never the submission (ARCH-12-8). The owner re-validates the
// arguments it is given; the projector never pre-authorises a read.

import type { AiToolSurface } from '../../ai-tools/ai-tool.types';
import type { AuthenticatedUser } from '../../common/authenticated-user.interface';
import type { C9Principal } from '../../orchestration/c9.contract';
import type { C9Domain } from '../../widget-contract/ambient';
import type { FactUsed } from '../../widget-contract/envelope';
import type { ChannelId } from '../../widget-contract/lifecycle';
import type { ResolvedNouns } from '../gate.types';
import type { ProjectorRow } from './projector.registry';

/**
 * Gate 8's closed-domain result, as the plan carries it: per declared field, the validated OPTION IDS
 * of an `enum` or `ref` field (`AdmissionFacts.validatedInputs.closed`).
 *
 * ARCH-12-5 / I49: a `string`, `phone` or scalar input NEVER reaches an owner argument. The type is the
 * fence — there is no member here that could carry one, so binding one is not a rule to remember but a
 * compile error. The sole exception is the separately typed, server-validated journal business date
 * carried below; it is not part of this map and cannot satisfy a closed input.
 */
export type ClosedInputBindings = ReadonlyMap<string, readonly string[]>;

/**
 * `planOf(record, ctx)` — the closed input of every `compose*` call (PLAN G12 §5.2).
 *
 * Its record members are AUDIT_RETAINED (class A) columns only. It has NO member for `bodyJson`,
 * `textEquivalentJson`, `composedEnvelopeJson`, `emittedEnvelopeJson`, `utteranceTemplate`,
 * `renderedUtterance`, `selectedLabels`, `selectionDomainLabelsJson` or `spokenTranscript`, and no
 * member for a free-text, phone or scalar input (ARCH-12-5). It also has no member for `profile_id`,
 * `X-Maya-Render-*`, `a11y_env`, a bridge value or `presentation_mode` (ARCH-12-3, ARCH-12-6, FR-14):
 * presentation may narrow what a person is shown, and it may never move an authority decision.
 *
 * `authority` and `actor` are NULLABLE on purpose. A guest session that Gate 2 admits has no live C9
 * principal (I47), and the answer to "no principal" is `degraded` with zero reads — never a read made
 * under somebody else's authority, and never a principal the projector built for itself (ARCH-12-8).
 */
export interface ProjectionPlan {
  // ── the tapped record, AUDIT_RETAINED members only ─────────────────────────────────────────────
  readonly widgetId: string;
  readonly widgetKind: string;
  readonly effect: string;
  readonly capabilitySpace: string | null;
  readonly capabilityKey: string | null;
  /** OD-1 sealed source evidence for NAVIGATE(detail/w); never authority by itself. */
  readonly sourceCapabilitySpace: string | null;
  readonly sourceCapabilityKey: string | null;
  readonly targetJson: unknown;
  readonly runId: string | null;
  readonly revisionId: string | null;
  readonly c9Domain: C9Domain | null;
  readonly frozenNounsJson: unknown;
  readonly requestedScopeHash: string;
  /** X-class, operations.journal.read only. It is never a noun, identity or authority proof. */
  readonly retainedLocalBusinessDate: string | null;

  // ── context slots, each written by its one producer inside the one ordered pipeline ────────────
  /** D-2: `ctx.principal.authority`, resolved by `C9Authority.current(T)` in the request transaction. */
  readonly authority: C9Principal | null;
  /** The JWT-validated actor, exactly as `@CurrentUser()` delivers it (K5). */
  readonly actor: Readonly<AuthenticatedUser> | null;
  /** Gate 6's server-side surface. Never derived from `profile_id`, a header or the body. */
  readonly aiToolSurface: AiToolSurface | null;
  /** Step 0's carrier: the channel the answer is fitted for. */
  readonly answeringChannel: ChannelId;
  /** Gate 11's freshly resolved handles; `null` before Gate 11 has run. */
  readonly resolvedNouns: ResolvedNouns | null;
  /** Gate 8's validated closed-domain members, and only those (ARCH-12-5). */
  readonly closedInputs: ClosedInputBindings | null;
}

/**
 * What the port answers. An owner exception is carried WHOLE and UNREAD to the caller, which maps it
 * through P10's `C9_DENIAL_PROJECTION` / `LIMITATION_REASON_TABLE` (P-RENDER). No exception message
 * text ever enters a member (PLAN G12 §5.4 item 3): the code comes from the table, never from the
 * owner's words.
 */
export type CanonicalReadResult =
  | {
      readonly kind: 'value';
      readonly value: unknown;
      readonly fact: FactUsed;
    }
  | {
      readonly kind: 'owner_exception';
      readonly exception: unknown;
      readonly denial_code: string;
      readonly fact: FactUsed;
    };

/** Exact shape Gate 13 may hand back after calling a canonical propose owner. */
export interface CanonicalOwnerResponse {
  readonly value: unknown;
  readonly fact: FactUsed;
  readonly limitation_codes?: readonly string[];
}

/** One read, named by the row that permits it. There is no free-form read on this edge. */
export interface CanonicalReadRequest {
  readonly plan: ProjectionPlan;
  readonly row: ProjectorRow;
  /** Bound from the row's argument map only: a frozen-noun handle or a closed input (ARCH-12-5). */
  readonly ownerArguments: Readonly<Record<string, unknown>>;
}

/**
 * The port. ONE method, so "exactly one read per composition" (F7, C11:136) is countable rather than
 * argued: a composition that called twice would be visible at the one call site U12b writes.
 *
 * It is declared here and implemented nowhere in U12a. A `CanonicalReadPort` is a type, so it is erased
 * at run time: no file the gateway reaches at run time holds an owner because of this declaration.
 */
export interface CanonicalReadPort {
  read(request: CanonicalReadRequest): Promise<CanonicalReadResult>;
}
