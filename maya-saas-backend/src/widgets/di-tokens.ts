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
// Not here: `GATE_8R_OWNERS`. The Gate 8-R spec places that token beside its frozen unruled value in
// `gates/gate-8r.owners.ts` (U8R).
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

/** Gate 10's router (`routing/deterministic-router.ts`); signature per AMB-29 (U10b). */
export const DETERMINISTIC_ROUTER = 'DETERMINISTIC_ROUTER';

/** Gate 10's capability facts (`routing/capability-facts.provider.ts`; U10b). */
export const CAPABILITY_FACTS = 'CAPABILITY_FACTS';

/** Gate 11's noun-resolution ports; every port unbound until AMB-33/34/36/37 (U11a, U11b). */
export const NOUN_RESOLUTION_PORTS = 'NOUN_RESOLUTION_PORTS';
