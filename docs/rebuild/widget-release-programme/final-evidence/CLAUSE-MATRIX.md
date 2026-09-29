# Current complete clause matrix

GATES LIVE CONTRACT-COMPLETE 4/15 · WITH U-CLASS 8/15 · STOPPED CLAUSES 0 · BLOCKED-DISCHARGE CLAUSES 0

Strict and with-U remain separate. 9.6 is still false, now explicitly INTEGRATION_OWNED. All historical audit snapshots remain unchanged.

| Gate | Clause | State | Classification / acceptance | Duty |
|---|---|---|---|---|
| 1 | G1-a | L-T | LIVE | HMAC valid: seal verified, keyed, before Gate 1 proceeds |
| 1 | G1-b | L | LIVE | `widget_id` matches |
| 1 | G1-c | L | LIVE | not expired |
| 1 | G1-d | L | LIVE | not consumed when `single_use` |
| 1 | G1-e | L | LIVE | not superseded |
| 1 | G1-f | L | LIVE | `EXPIRED`/`SUPERSEDED` are response outcomes, with the R3.9.4 successor or the code alone (including A4's three fail-closed conditions) |
| 1 | G1-g | L | LIVE | the successor reads nothing canonical (no projector or owner port; `EP-BUILD`) |
| 2 | G2-a | L | LIVE | session resolved exactly as for a typed message (JWT + Membership, or a verified ClientChannelLink): the same transport chain as `POST /api/ai/chat`, proven by G2-EQ (D-16). `C9Authority.current` in `T` is the K1/K3 principal of Gates 1, 3, 5 and 6, not this clause |
| 2 | G2-b | L | LIVE | no credential comes from the widget |
| 2 | G2-c | L | LIVE | `REFUSED/unauthenticated` |
| 3 | G3-a | L | LIVE | `principal_proof_hash === c9PrincipalHash(live)`, constant time |
| 3 | G3-b | L | LIVE | a token minted for A and replayed by B fails |
| 3 | G3-c1 | L | LIVE | membership re-create or role change invalidates outstanding envelopes (the membership branch of K4, C11:2546) |
| 3 | G3-c2 | U | ACCEPTABLE_U_CLASS | client-link unlink/relink invalidates outstanding envelopes (the CLIENT_CHANNEL branch; U candidate, K14-10) |
| 3 | G3-d | L | LIVE | `REFUSED/widget_principal_mismatch` |
| 3 | G3-e | L | LIVE | a shared push is inert: a web-push token minted for A and submitted by B is refused, NW (T-3) |
| 3 | G3-f | U | ACCEPTABLE_U_CLASS | a forwarded Telegram message is inert (U candidate: K14-10 PKT:485, R-03/P-33) |
| 4 | G4-a | L | LIVE | `TenantContextService.assertTenantId` over the record's tenant and the live principal's |
| 4 | G4-b | L-T | LIVE | `REFUSED/tenant_mismatch` |
| 5 | G5-a | L | LIVE | floor re-derived from the live registry and policy tables |
| 5 | G5-b | L | LIVE | compared with the server-derived level (K1/K2, in `T`) |
| 5 | G5-c | L | LIVE | capped by `profile.max_verification_level` |
| 5 | G5-d | L | LIVE | branch per effect class |
| 5 | G5-e | L-T | LIVE | any stored/recomputed difference → `SUPERSEDED/policy_floor_changed` + successor or the code alone, with the non-durable `widget_floor_divergence` counter |
| 5 | G5-f | U | ACCEPTABLE_U_CLASS | `NEEDS_SECOND_CHANNEL`/`HANDOFF_REQUIRED` + deep link (U candidate, K6/F53; mechanism blocked on OD-4 + P-12; never Gate 13's `HandoffTarget`) |
| 6 | G6-1 | L | LIVE | dispatch on `subjectCapability(record)`, bound once |
| 6 | G6-2 | L | LIVE | `authority_hint` not read |
| 6 | G6-3 | L | LIVE | a never-rendered widget still cannot act |
| 6 | G6-4 | L | LIVE | `REFUSED/insufficient_authority`, AuthorityResolver |
| 6 | G6-5 | L | LIVE | null subject → proceeds with no owner call |
| 6 | G6-6 | false | OWNER_DECISION_REQUIRED | HANDOFF: destination fences only (registration, F48, `targetFloor('s')`, landing ingress) |
| 6 | G6-7 | L | LIVE | HANDOFF never resolves `assertCanExecute`, `c9Capability` or the allowlist |
| 6 | G6-8 | L | LIVE | (a) allowlist row |
| 6 | G6-9 | L | LIVE | (b) `policyDecision === 'ALLOW'` |
| 6 | G6-10 | L | LIVE | (c) `authenticated_request` |
| 6 | G6-11 | L | LIVE | (d) live principal role ∈ `allowedActorRoles` |
| 6 | G6-12 | L | LIVE | (e) entitlements grant `requiredFeatures` |
| 6 | G6-13 | false | EVIDENCE_MISSING | Gate 14 governs; a disagreement is refused and counted |
| 6 | G6-14 | L | LIVE | the 47: `assertCanExecute(principal, def)` with surface `'web'` |
| 6 | G6-15 | L | LIVE | non-catalogue: `WIDGET_CAPABILITY_POLICY` row (build totality + positive) |
| 6 | G6-16 | L | LIVE | `c9Capability` when `c9_domain !== null`, including BI non-READ |
| 6 | G6-17 | L | LIVE | run-less: `c9Capability` not applied |
| 6 | G6-18 | L | LIVE | CONTROL: `CONTROL_FLOOR[ref.key]` at Gate 5, Gate 3's principal binding, Gate 4's tenant assertion, then the one registered handler's own principal and tenant check (R3.2.4, C11:4771-4773); no execute-admission test |
| 6 | G6-19 | L-T | LIVE | TOOL unreachable/refused |
| 6 | G6-20 | L | LIVE | a raise is the refusal |
| 6 | G6-FR14 | L | LIVE | reads Membership/Staff/Client binding, never `presentation_mode`/`profile_id`/`a11y_env` (FR-14 C11:1798) |
| 7 | G7-1 | L | LIVE | effect within the kind's ceiling over `widget_kind` |
| 7 | G7-2 | L | LIVE | key space matches effect (R3.2.2) |
| 7 | G7-3 | L | LIVE | CONTROL keys in the control registry |
| 7 | G7-4 | L | LIVE | COMMIT carries a non-null `confirmation_of_ref` |
| 7 | G7-5 | false | EVIDENCE_MISSING | kind ≠ draft → non-null `produced_by_intent_token_hash` satisfying §3.10.2 |
| 7 | G7-6 | L | LIVE | `requiredConfirmationKind(subject) === widget_kind`, re-read live (F72) |
| 7 | G7-7 | L | LIVE | the delivering tier was permitted this effect (§3.12) |
| 7 | G7-8 | L | LIVE | the two codes |
| 7 | G7-BOOK1 | false | EVIDENCE_MISSING | BOOK.1 subject = `confirmation_subject` (C11:3109) |
| 7 | G7-FR6b | L | LIVE | exactly one pairing (C11:1786) |
| 7 | G7-FR6d | false | EVIDENCE_MISSING | no MONEY actuation; `PAYMENT_HANDOFF` gap-blocked; F80 (C11:1788, 1524) |
| 8 | G8-1 | L | LIVE | closed-domain membership (per field) |
| 8 | G8-2 | L | LIVE | cardinality |
| 8 | G8-3 | false | OWNER_DECISION_REQUIRED | bounds re-read from `bounds_source` |
| 8 | G8-4 | false | OWNER_DECISION_REQUIRED | normalizers applied |
| 8 | G8-5t | false | OWNER_DECISION_REQUIRED | `c9SafeText` over **text** values |
| 8 | G8-5p | U | ACCEPTABLE_U_CLASS | `c9SafeText` over **phone** values (U candidate, PKT:469) |
| 8 | G8-6 | L | LIVE | `max_total_bytes` by refusal |
| 8 | G8-7 | L | LIVE | inputs on a null schema refused |
| 8 | G8-8 | L | LIVE | the four codes |
| 8 | G8-SCHEMA | L | LIVE | server-held and hash-bound; erased or absent → `SUPERSEDED/handle_stale`; hash failure is a fault (B-10) |
| 8 | G8-SHAPE | L | LIVE | undeclared keys and kind conformance |
| 8 | G8-LABELS | L | LIVE | labels from validated members; no write before 9 (R3.9.1/R3.9.2) |
| 8 | G8-DENY | false | OWNER_DECISION_REQUIRED | a `c9Deny` is a verdict (R3.9.3) |
| 8-R | R-0 | L | LIVE | reachable on the live path |
| 8-R | R-1 | L | LIVE | applies exactly when `confirmation?.requires_readback === true` |
| 8-R | R-1a | U | ACCEPTABLE_U_CLASS | recomputed at ingress from effect and tier (B-17) |
| 8-R | R-2 | U | ACCEPTABLE_U_CLASS | ack present (`readback_missing`) |
| 8-R | R-3 | U | ACCEPTABLE_U_CLASS | `readback_ref` matches |
| 8-R | R-4 | U | ACCEPTABLE_U_CLASS | `body_hash` matches (H4 integrity) |
| 8-R | R-5 | U | ACCEPTABLE_U_CLASS | affirmation ∈ the closed vocabulary for the locale |
| 8-R | R-6 | L | LIVE | an ack on a record that does not require one (including a null confirmation) is refused |
| 8-R | R-7 | U | ACCEPTABLE_U_CLASS | refuses, never repairs; the affirmation is never logged or echoed |
| 9 | 9.1 | L | LIVE | render |
| 9 | 9.1a | L | LIVE | R3.9.2 labels only, no `inputs` parameter |
| 9 | 9.1b | L | LIVE | one slot |
| 9 | 9.2 | L | LIVE | appended to the conversation |
| 9 | 9.3 | L | LIVE | as a USER turn |
| 9 | 9.4 | L | LIVE | authority NONE (E10) |
| 9 | 9.5 | L | LIVE | first durable write (R3.9.1, E11) |
| 9 | 9.6 | false | INTEGRATION_OWNED | byte-identical to a typed message from here |
| 9 | 9.7 | L | LIVE | DS-03 A: superseded/handle_stale, no turn, no effect, no guessed label |
| 9 | 9.8 | L | LIVE | runs in chat ingress |
| 9 | 9.9 | L | LIVE | `rendered_utterance`/`selected_labels` persisted |
| 9 | 9.10 | L | LIVE | F15: lowered content read only by Gate 10 |
| 10 | 10.1 | L | LIVE | router over the lowering against live intents |
| 10 | 10.2 | L | LIVE | `routeUtterance` (pure, pre-LLM, escape first) |
| 10 | 10.3 | L | LIVE | `liveCandidates` |
| 10 | 10.4 | L | LIVE | `u`, `s`, `q` |
| 10 | 10.5 | L | LIVE | `ownerSet`/`sameOwner`, undefined fails closed |
| 10 | 10.6 | L | LIVE | the first row that holds decides |
| 10 | 10.7 | L | LIVE | exactly one audit record per non-AGREE, in `T`, with its members |
| 10 | 10.8 | L | LIVE | REFUSE → `intent_divergence`; NULL/AUDIT recorded, not refused |
| 10 | 10.9 | L | LIVE | widget-layer records only; never substitutes |
| 10 | 10.10 | L | LIVE | the R3.12.4 fixture duty at `EP-BUILD` |
| 10 | 10.11 | L | LIVE | intent router |
| 10 | 10.R1 | L | LIVE | row 1 of «Gate 10 in full» |
| 10 | 10.R2 | L | LIVE | row 2 of «Gate 10 in full» |
| 10 | 10.R3 | L | LIVE | row 3 of «Gate 10 in full» |
| 10 | 10.R4 | L | LIVE | row 4 of «Gate 10 in full» |
| 10 | 10.R5 | U | ACCEPTABLE_U_CLASS | row 5 of «Gate 10 in full» (null subject with a non-null match of the same effect) |
| 10 | 10.R6 | L | LIVE | row 6 of «Gate 10 in full» |
| 10 | 10.R7 | L | LIVE | row 7 of «Gate 10 in full» |
| 11 | G11-R1 | L | LIVE | fresh read from the canonical owner |
| 11 | G11-R2 | L | LIVE | witnesses compared, not re-read |
| 11 | G11-R3 | L | LIVE | value divergence → SUPERSEDED with a rendered diff |
| 11 | G11-R4 | L | LIVE | `handle_stale` |
| 11 | G11-R5 | L | LIVE | IntentGateway + owner |
| 11 | G11-I1 | L | LIVE | R3.7.3 nouns never travel to the client |
| 11 | G11-I2 | L | LIVE | R3.7.4 Handle/Witness types |
| 11 | G11-I3 | L | LIVE | F15 exactly seven inputs |
| 11 | G11-I4 | U | ACCEPTABLE_U_CLASS | R3.11.1 approval decision reads nouns from the decision record |
| 11 | G11-I5 | U | ACCEPTABLE_U_CLASS | R3.11.3 reject and re-mint |
| 11 | G11-I6 | U | ACCEPTABLE_U_CLASS | R3.11.4 both checks in order |
| 11 | G11-I7 | L | LIVE | RT3(b)/B-21 |
| 11 | G11-I8 | L | LIVE | R3.9.3 rendering |
| 11 | G11-I9 | false | EVIDENCE_MISSING | BOOK.4 booking nouns |
| 11 | G11-I10 | U | ACCEPTABLE_U_CLASS | E13 re-enters approval |
| 12 | G12-R1a | L | LIVE | REFINE body by the projector |
| 12 | G12-R1b | false | EVIDENCE_MISSING | NAVIGATE body by the projector |
| 12 | G12-R2 | L | LIVE | the same projector |
| 12 | G12-R3 | L | LIVE | the same enforcement call sites (F95 remainder) |
| 12 | G12-R4 | L | LIVE | no widget PII path |
| 12 | G12-R5 | L | LIVE | masked body, never a leak |
| 12 | G12-R6 | L | LIVE | runs in the projector (pointer slot) |
| 12 | G12-I1 | L | LIVE | F7 |
| 12 | G12-I2 | L | LIVE | L2 |
| 12 | G12-I3 | L | LIVE | B-16 |
| 12 | G12-I4 | L | LIVE | P9/P10 |
| 12 | G12-I5 | L | LIVE | K18 |
| 12 | G12-I6 | L | LIVE | `allowedKinds`/B-27 |
| 12 | G12-I7 | L | LIVE | B-02/F18 |
| 12 | G12-I8 | L | LIVE | B-03 |
| 12 | G12-I9 | L | LIVE | RT4/RT4a |
| 12 | G12-I10 | L | LIVE | FR-14/R3.8.3 |
| 12 | G12-I11 | false | EVIDENCE_MISSING | K16 |
| 13 | G13-R1 | L | LIVE | NONE unreachable |
| 13 | G13-R2 | false | EVIDENCE_MISSING | NAVIGATE → projector → `next_envelope` |
| 13 | G13-R3 | L | LIVE | REFINE → projector → `next_envelope` |
| 13 | G13-R4 | L | LIVE | terminates; no business effect from a selector |
| 13 | G13-R5 | L | LIVE | CONTROL → the one registered control handler, which performs its own principal and tenant check; no Action Engine edge (row 13, C11:4733; R3.2.4). Sub-cases: dismiss, `run.cancel`, `delivery.resolve` (the last needs P-17) |
| 13 | G13-R5b | L | LIVE | the R3.2.4 source test: each handler module imports no Prisma model outside the widget layer's own except through its owner endpoint (`EP-BUILD`, C11:3852-3861) |
| 13 | G13-R6 | L | LIVE | DRAFT → draft owner |
| 13 | G13-R7 | U | ACCEPTABLE_U_CLASS | REQUEST_APPROVAL → approval object → PENDING |
| 13 | G13-R8 | false | OWNER_DECISION_REQUIRED | HANDOFF → one `HandoffTarget`, no capability invoked |
| 13 | G13-R9 | L | LIVE | COMMIT → Gate 14 with a server-minted key |
| 13 | G13-R10 | L | LIVE | closed per-class switch (FR-1/B-28) |
| 13 | G13-I1 | U | ACCEPTABLE_U_CLASS | `approval_decision` routing |
| 13 | G13-I2 | U | ACCEPTABLE_U_CLASS | R3.11.3 |
| 13 | G13-I3 | false | EVIDENCE_MISSING | F74/F75 consumption |
| 13 | G13-I4 | L | LIVE | L7/L8/L10 |
| 13 | G13-I5 | L | LIVE | FR2/B-29 receipts |
| 13 | G13-I6 | L | LIVE | F15 AUDIT_RETAINED only |
| 13 | G13-I7 | L | LIVE | F33/F76 |
| 13 | G13-I8 | L | LIVE | FR-11/R3.9.3 |
| 13 | G13-I9 | L | LIVE | R3.11.6 approver test / P-27 |
| 14 | G14-a | L | LIVE | `prepare()` receives the key, normalized input, server-minted idempotency key and evidence refs (every G14 key is BLOCKED-DISCHARGE until a live widget COMMIT reaches `prepare()`, E2) |
| 14 | G14-b | L | LIVE | the policy resolver owns the decision (`assertNoCallerAuthority`, `assertResolverOwnsDecision`) |
| 14 | G14-c | L | LIVE | the Action Engine, never the widget, calls the provider owner |
