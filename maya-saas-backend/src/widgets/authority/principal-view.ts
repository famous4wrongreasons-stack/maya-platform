// D-2 — the live principal, the pure half.
//
// GATES-PLAN-V11 P-PRINCIPAL splits the principal in two, and the split is the point:
//   - THIS file is pure. It maps an already-resolved `C9Principal` and an already-read membership role
//     onto the `PrincipalView` the gates read. It calls no owner, opens no transaction, reads no store
//     and constructs no principal (K5, C11:2548) — every input is an ANSWER a mechanism already gave.
//   - `owner-ports/principal.adapter.ts` is the boundary. It is the ONE widget file that calls
//     `C9Authority.current`, the tenancy owner's in-transaction Membership read and `c9PrincipalHash`.
//
// Why a view rather than a fact (D-2): Gate 1's R3.9.4 issuance and Gate 3 both read the principal
// BEFORE slot 2, and a fact produced at slot 2 or later cannot be read at slot 1 (J-1). So the principal
// is the base member `GateContext.principal`, resolved once, before the array runs.
//
// Why it is resolved inside the one request transaction `T` (D-1): K1 (C11:2536-2539) states both live
// rungs "inside the request transaction" — `BOUND_CLIENT` through `ClientChannelRuntimeService.resolve`
// and `SESSION_VERIFIED` through `C9Authority.current`'s `FOR SHARE` read of exactly one active
// `Membership` for an active `User`. A level derived outside `T` is a level that may already have aged
// by the time Gate 5 compares it, and a role read outside `T` is a role another connection may be
// changing while Gate 6 reads it.

import type { C9Principal } from '../../orchestration/c9.contract';
import type { PrismaService } from '../../prisma/prisma.service';
import type { VerificationLevel } from '../../widget-contract/envelope';
import type { Presentation } from '../../widget-contract/envelope-roots';
import type { PrincipalView } from '../gate.types';
import { resolveVerificationLevel } from './authority-resolver';

/**
 * `T` — the one request transaction (D-1), as the widget layer names it: the store client the
 * interactive `$transaction` callback receives.
 *
 * Derived from the store client's own type rather than imported from `@prisma/client`, so no widget
 * file outside the owner-ports boundary names a Prisma value and the layer gains no second database
 * client (D-6, FR-1).
 */
type TransactionCallback = Parameters<PrismaService['$transaction']>[0];
export type RequestTx = TransactionCallback extends (tx: infer T) => unknown
  ? T
  : never;

/**
 * The port the gateway injects under `PRINCIPAL_RESOLVER` (D-2). Its one implementation is
 * `owner-ports/principal.adapter.ts`; a gate file and `intent-gateway.service.ts` name this interface
 * and the token, never the adapter class and never an owner service (D-6).
 *
 * `null` means the resolution FAILED — `C9Authority.current` denied a session the transport chain
 * admitted (a staff-class role without exactly one active `Staff` row; a tenant, user or membership
 * that went inactive after the guard ran). Under D-16 that principal has no live proof hash, so there is
 * nothing for Gate 3 to compare against and slot 3 refuses `widget_principal_mismatch`. It is NOT slot
 * 2's case: the transport session existed, and row 2 ("session resolved exactly as for a typed message",
 * C11:4721) is about the transport chain, which admitted it.
 */
export interface PrincipalResolver {
  /**
   * Resolves the live principal inside `T`. Never throws for a denial: a denial is `null`, which the
   * pipeline refuses at slot 3. It throws only when the store itself fails, and the gateway rolls `T`
   * back on a throw (D-1).
   */
  resolve(tx: RequestTx): Promise<PrincipalView | null>;
}

/** B-02 (C11:7189-7191): the roles whose presentation is `client`. */
export const PRESENTATION_CLIENT_ROLES: ReadonlySet<string> = Object.freeze(
  new Set(['client', 'customer']),
);

/** B-02 (C11:7189-7191): the roles whose presentation is `owner`. */
export const PRESENTATION_OWNER_ROLES: ReadonlySet<string> = Object.freeze(
  new Set(['tenant_owner', 'business_owner']),
);

/**
 * B-02, verbatim: "presentation_mode: client for CLIENT_CHANNEL, client or customer; owner for
 * tenant_owner or business_owner; staff for any other role."
 *
 * PRESENTATION ONLY (FR-14, C11:1798). Gate 6 and its owner ports never read it — a presentation mode
 * that could reach an authority decision would be exactly the "role removal from UX = role removal from
 * security" confusion FR-14 exists to forbid. It is carried here because the successor and the projector
 * need it (P-MINT-CORE, U12b), not because a gate does. Held at the source by `k5-principal.architecture.spec.ts`
 * (PR-13) and by `gate-context.source.spec.ts`.
 */
export const presentationModeFor = (
  kind: C9Principal['kind'],
  role: string | null,
): Presentation['presentation_mode'] => {
  if (kind === 'CLIENT_CHANNEL') return 'client';
  if (role !== null && PRESENTATION_CLIENT_ROLES.has(role)) return 'client';
  if (role !== null && PRESENTATION_OWNER_ROLES.has(role)) return 'owner';
  return 'staff';
};

/**
 * K1 (C11:2536-2539), through the ONE ladder: `USER` → `SESSION_VERIFIED`, `CLIENT_CHANNEL` →
 * `BOUND_CLIENT`.
 *
 * It calls `resolveVerificationLevel` rather than restating the rungs. A second ladder here is a second
 * answer to "how well is this caller verified", and two answers that can disagree is the defect the
 * resolver was extracted to prevent. `channelSubject` is false and `roles` empty on purpose: a resolved
 * C9 principal is at least `BOUND_CLIENT`, and the resolver reads no role (K2, C11:2542).
 */
export const verificationLevelFor = (
  kind: C9Principal['kind'],
): VerificationLevel =>
  resolveVerificationLevel({
    membershipResolved: kind === 'USER',
    channelLinkActive: kind === 'CLIENT_CHANNEL',
    channelSubject: false,
    roles: [],
  });

/**
 * The view, assembled from answers.
 *
 * `proofHash` is NOT computed here: `c9PrincipalHash` is the owner's function (K3, C11:2544) and the
 * widget layer calls it in exactly one place, the adapter at the boundary. Passing it in keeps this file
 * free of every owner import and makes "which hash does Gate 3 compare" a question with one call site
 * rather than a convention.
 */
export const principalView = (input: {
  readonly authority: C9Principal;
  readonly role: string | null;
  readonly proofHash: string;
}): PrincipalView =>
  Object.freeze({
    authority: input.authority,
    role: input.role,
    presentationMode: presentationModeFor(input.authority.kind, input.role),
    verificationLevel: verificationLevelFor(input.authority.kind),
    proofHash: input.proofHash,
  });
