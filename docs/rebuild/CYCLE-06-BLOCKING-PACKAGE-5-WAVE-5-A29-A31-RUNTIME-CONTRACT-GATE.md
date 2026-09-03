# CYCLE 06 — PACKAGE 5 WAVE 5 A29/A31 RUNTIME CONTRACT GATE

Status: **PASS — the fact plane and one governed correction action are fixed;
the existing schema is sufficient**

Accepted checkpoint: `b30bfb95`

Gate date: 2026-09-03

## 1. Exact scope

The approved implementation plan and post-Wave-4 remainder checkpoint fix
Wave 5 as `A29` and `A31`.

- A29 accepts recovery touchpoint and booking observations as immutable source
  facts, derives the current recovery projections, and permits a separately
  governed attribution correction under D6-A.
- A31 accepts authenticated CRM observations, owns the canonical event and
  mirror fact plane, and performs bounded read-only reconciliation.
- Automatic fact acceptance, mirror reduction and reconciliation do not invent
  an actor or `ActionExecution`.
- No production endpoint currently exposes a manual CRM replay, discard or
  repair command. Such actions are therefore not fabricated for this Gate.

## 2. Exact governed action inventory

The production-reachable inventory contains one governed command:

1. `correct_recovery_attribution` — an AC1, exact-target, owner-approved local
   correction of the current `RecoveryConversion` attribution projection.

Touchpoint acceptance, booking observation/status acceptance, CRM webhook
ingestion, mirror comparison, reconciliation and quarantine catch-up are AC4
source-fact or AC5 projection protocols, not additional command classes.

`WAVE 5 FAMILIES: A29, A31`

`WAVE 5 ACTION CLASSES: 1 — correct_recovery_attribution`

## 3. Authority, identities and boundaries

### A29 recovery fact plane

- **Authority:** authenticated bridge/internal-calendar evidence is authority
  for an observed source fact. The deterministic reducer is authority for the
  current attribution projection. Only an active tenant owner can approve an
  operator correction.
- **Touchpoint identity:** tenant plus exact external event id. The Client
  candidate remains an HMAC subject reference, never raw phone/email identity.
- **Conversion identity:** tenant plus exact external booking reference.
- **Correction identity:** tenant plus bounded source intent and exact current
  target generation. The generation is derived under the target lock.
- **Mutable versus immutable:** `DomainEvent` is immutable source evidence;
  `RecoveryTouchpoint` and `RecoveryConversion` are current projections. A
  correction changes only the conversion's current touchpoint reference and
  appends an immutable `ActionTargetMutation`.
- **D6-A:** later authoritative evidence may correct the projection only while
  the selected touchpoint's frozen attribution window covers the booking. The
  original source events are never rewritten.

The governed correction is one target, requires owner approval, rejects
forged tenant, actor, target, evidence, generation and policy material, and
commits the projection update, mutation fact and ActionExecution success in
one serializable PostgreSQL transaction.

### A31 CRM fact and reconciliation plane

`ShadowIngestionService`, `AppointmentReconciliationService` and
`QuarantineCatchupService` are triggers/readers. They feed the single
`AppointmentChangeService` comparator rather than writing a second mirror or
event path. `AppointmentMirrorService` retains only its narrow baseline
bootstrap role; `EventStoreService` remains the event persistence owner.

Reconciliation identity is tenant plus provider plus exact window. A database
lease permits one live run, and incomplete/truncated provider reads cannot
assert deletions. Quarantine is bounded diagnostic state and does not become
business source truth.

## 4. Current production owners and bypass inventory

The pre-cutover A29 legacy group is deliberately still active and pinned by a
narrow ratchet. Its four concrete direct-mutation subgroups are:

1. `RecoveryService.ingestTouchpoint` / consent-safe touchpoint upsert;
2. `RecoveryService.recordBooking` conversion creation;
3. `RecoveryService.markBookingStatus` conversion status update;
4. the recovery report read path's confirmed-revenue/status update.

These paths must be replaced by the canonical A29 fact plane during the
separately approved production runtime cutover. They are not silently exempted
or disabled by this local Gate.

A31 already has an explicit canonical fact-plane topology. The ratchet pins
the triggers, single comparator/event writer, bootstrap exception and
read-only provider boundary so a future direct mirror writer cannot pass by a
broad path exclusion.

## 5. Idempotency, concurrency and outcomes

- identical source delivery converges through deterministic event/projection
  identity and database uniqueness;
- identity-changing evidence under the same source occurrence fails closed;
  a later valid booking/status observation is a new immutable DomainEvent and
  may recompute only the current projection;
- advisory target locks, serializable transactions and unique target
  generations make concurrent correction converge to one winner;
- retry and restart return the same ActionExecution and mutation fact;
- cross-tenant actor, fact, projection or reconciliation binding is rejected;
- source facts contain no raw phone, email or provider payload;
- local business writes use PostgreSQL commit/rollback truth.

All Wave 5 provider operations are reads. A failed or incomplete read fails
closed and is reconciled by a later bounded observation run; it is not an
ambiguous external mutation. `UNKNOWN` and blind redispatch are not applicable.

`UNKNOWN/RECONCILIATION: NOT REQUIRED — PROVIDER OPERATIONS ARE READ-ONLY; FAILURE/TRUNCATION FAIL CLOSED`

## 6. Schema verdict

The existing durable foundation is sufficient:

- `DomainEvent` stores immutable provider/bridge source facts;
- `RecoveryTouchpoint` and `RecoveryConversion` store current projections;
- `ReconciliationRun`, leases and quarantine cover A31 run completeness;
- `ActionExecution` and `ActionTargetMutation` bind the one governed correction
  to its exact tenant and target generation.

No new field, model, migration, historical backfill or business decision is
required.

`PACKAGE 5 WAVE 5 RUNTIME CONTRACT GATE: PASS`

`ADDITIONAL SCHEMA REQUIRED: NO`

`SCHEMA FOUNDATION/APPLY: NOT REQUIRED — EXISTING FOUNDATION REUSED`

`NEW BUSINESS DECISION REQUIRED: NO`

`REAL PRODUCTION BUSINESS/PROVIDER MUTATIONS: 0`

`CHAPTER 7 STARTED: NO`
