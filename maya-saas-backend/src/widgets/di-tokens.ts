// The widget layer's DI tokens (integrator decision D-6, plan §1.3).
//
// A gate file and `intent-gateway.service.ts` name an owner only through a port interface and one of
// these tokens; the provider bound to a token lives in `owner-ports/` (or, for a widget-internal
// port, in `widgets.module.ts`). One file, so parallel units cannot each spell a token their own way.
//
// EVERY TOKEN HERE IS UNBOUND in U0. Nothing provides one and nothing injects one: a token that exists
// is not a port that is wired, and a port that is wired is not a gate that is enforced. Each binding
// lands with its unit and, where the plan says so, its ruling, in the same commit as the test that
// pins it (plan §3.5 item 7).
//
// GATES-PLAN-V11 I-CTX declares the tokens its later units bind, so no unit spells one of its own. That
// includes `GATE_8R_OWNERS`: the token lives here, and `gates/gate-8r.owners.ts` (U8R) holds only its
// frozen unruled value.
//
// The values follow the Gate 8-R spec's convention: each token is a string equal to its own name.

/** Gate 6's owner set (`Gate6Owners`); provider `owner-ports/gate6.owners.provider.ts` (U6). */
export const GATE6_OWNERS = 'GATE6_OWNERS';

/** Slot 8's input-validation gate (`input-validation/input-validation.gate.ts`; U8a/U8b). */
export const INPUT_VALIDATION = 'INPUT_VALIDATION';

/** Gate 8's bounds registry; an empty frozen map until AMB-21. */
export const INPUT_BOUNDS_REGISTRY = 'INPUT_BOUNDS_REGISTRY';

/** Gate 8's normalizer registry; an empty frozen map until AMB-21. */
export const INPUT_NORMALIZER_REGISTRY = 'INPUT_NORMALIZER_REGISTRY';

/** Gate 10's widget-internal candidate/audit port; bound to the stores facade by WidgetsModule. */
export const GATE10_STORE = 'GATE10_STORE';

// U10a (IR-U10A-3): `DETERMINISTIC_ROUTER` and `CAPABILITY_FACTS` are DELETED. Under V1.1 the router
// and `ownerSet` are pure value imports over the frozen registries, not DI providers (AREA-B §3.2), so
// a token for each would be a port that will never be bound — and an unbound token that no unit will
// ever bind is the kind of thing that reads as "planned" for a year. Neither was imported anywhere.

/** Gate 11's noun-resolution ports; every port unbound until AMB-33/34/36/37 (U11a, U11b). */
export const NOUN_RESOLUTION_PORTS = 'NOUN_RESOLUTION_PORTS';

/** D-1: the one request transaction `T` that `submit()` opens (P-PRINCIPAL). */
export const REQUEST_TX = 'REQUEST_TX';

/** D-2: resolves `GateContext.principal` inside `T` through `C9Authority.current` (P-PRINCIPAL). */
export const PRINCIPAL_RESOLVER = 'PRINCIPAL_RESOLVER';

/** H4: verifies the keyed envelope seal; provided by the emission module, B-22 (P-SEAL, P-G15a). */
export const SEAL_VERIFIER = 'SEAL_VERIFIER';

/** R3.9.4 and L7: minter (2)'s successor entry for the gateway's edges (P-MINT-CORE). */
export const SUCCESSOR_MINTER = 'SUCCESSOR_MINTER';

/** Gate 13's HANDOFF edge: the `HandoffTarget` signer (U13b). */
export const HANDOFF_SIGNER = 'HANDOFF_SIGNER';
export const C9_CANCEL_OWNER = 'C9_CANCEL_OWNER';

/** U13c: the server-owned draft registry. P-MINT-BOOK supplies its first owner in Wave 6. */
export const DRAFT_OWNER_REGISTRY = 'DRAFT_OWNER_REGISTRY';

/** U13c: the marketing owner's narrow REQUEST_APPROVAL / APPROVAL decision edge. */
export const APPROVAL_REQUEST_OWNER = 'APPROVAL_REQUEST_OWNER';

/** U13c: canonical appointment COMMIT edge, through the existing CRM owners. */
export const COMMIT_BOOKING_OWNER = 'COMMIT_BOOKING_OWNER';

/** P-MINT-BOOK: the single widget-internal confirmation minter used by canonical booking owners. */
export const BOOKING_CONFIRMATION_MINTER = 'BOOKING_CONFIRMATION_MINTER';

/** P-MINT-BOOK: exact reschedule/cancel propose edge; no generic C9 dispatch. */
export const BOOKING_PROPOSE_OWNER = 'BOOKING_PROPOSE_OWNER';

/** Gate 8-R's owner set; bound to `GATE_8R_OWNERS_UNRULED` in `gates/gate-8r.owners.ts` (U8R, R8R-1). */
export const GATE_8R_OWNERS = 'GATE_8R_OWNERS';

/** Gate 4: `TenantContextService.assertTenantId` through the tenancy port (U4, IR4-1 and IR4-2). */
export const TENANT_SCOPE = 'TENANT_SCOPE';

/** U12b: the projector's single read-only edge to canonical owners. */
export const CANONICAL_READ = 'CANONICAL_READ';
