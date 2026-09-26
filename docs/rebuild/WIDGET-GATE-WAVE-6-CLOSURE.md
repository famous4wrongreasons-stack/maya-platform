# Chat-First Gate Programme — Wave 6 closure

**Branch:** `codex/maya-identity-consent-20260913`

**Certified input:** Wave 5 at `17b5dc0b52b64c795f8455840b7c297e3fc06a58`

**Code verification target:** `b2a0edbade23e630a11bf21388c88dabab14ddcd`

**Production deployment:** none

**Real business/provider/message effects:** zero

## Delivered scope

Wave 6 closes the approved Contract V1.2 and booking gate programme only:

1. `C-V12` — OD-1 Option A and OD-2 Option C are normative, versioned and executable;
2. `I-MIG3` — one additive prospective migration adds the sealed server-owned NAVIGATE source-capability reference;
3. `U12c` / `U13d` — NAVIGATE projections and routing re-check current principal, tenant, authority and capability availability;
4. `P-MINT-BOOK` — the closed server-owned booking registry mints typed create, reschedule and cancel semantics;
5. `P-DISCHARGE` — only the eight fully proven booking mechanisms leave the A2.2 gap ledger;
6. `E2` — BOOK-1…BOOK-6 execute create, reschedule and cancel through the authenticated widget route, all 14 gates and the existing Action Engine owner on an isolated PostgreSQL/internal-provider fixture;
7. final gate re-audit and `CKPT-W6`.

`P-G15c` is not activated. Voice and spoken-readback mechanisms remain pending. No blanket discharge, production configuration, deployment or business effect is included.

## Contract V1.2 and I-MIG3

`WidgetIntentRecord` now retains nullable `sourceCapabilitySpace` and `sourceCapabilityKey` only as sealed audit evidence for the corresponding NAVIGATE record. The client and LLM cannot author either value. Seal verification and the Gate 12/Gate 13 path re-check the current principal, tenant, authority and capability availability on every navigation; stale, revoked and foreign references refuse.

The migration `20260925150000_widget_layer_source_capability` is additive and prospective. It changes only `WidgetIntentRecord`, creates no backfill and rewrites no prior migration. A clean database replay applies all 99 repository migrations, including exactly three widget-layer migrations.

OD-2 splits the JWT widget route from its Step-0 carriers and retained record fields from spoken readback. Only complete mechanisms can discharge. The Contract V1.2 decision record and generated ledgers preserve voice/spoken as independent pending rows.

## Typed booking mint and discharge

The booking template registry is closed and server-owned:

- `draft.booking.create@1`;
- `refine.booking.reschedule@1`;
- `refine.booking.cancel@1`;
- `commit.booking.create@1`;
- `commit.booking.reschedule@1`;
- `commit.booking.cancel@1`.

Unknown, incompatible or wrongly paired templates fail closed. The LLM/client cannot select effect semantics, target authority or generic CRM mutations. Booking COMMIT exists only on a canonical `BOOKING_CONFIRMATION` and routes to the existing Action Engine create/reschedule/cancel owner.

P-DISCHARGE withdraws exactly `MG-P-01`, `MG-P-08`, `MG-P-16`, `MG-P-18`, `MG-P-23`, `MG-P-25`, `MG-P-26` and `MG-P-30`. Each row names its implementation and executable build proof. All sibling and unimplemented rows remain fail closed; voice/spoken remains pending.

## E2

BOOK-1…BOOK-6 run against a fresh owned PostgreSQL database and the internal provider fixture:

| Edge | Proof |
|---|---|
| BOOK-1 | server-minted create DRAFT reaches the canonical read-only booking owner and returns `BOOKING_CONFIRMATION` |
| BOOK-2 | linked create COMMIT runs all 14 gates and succeeds through `crm.appointment.create.v1` |
| BOOK-3 | reschedule REFINE returns a separately linked confirmation |
| BOOK-4 | linked reschedule COMMIT runs all 14 gates and succeeds through `crm.appointment.reschedule.v1` |
| BOOK-5 | cancel REFINE returns a separately linked confirmation |
| BOOK-6 | linked cancel COMMIT runs all 14 gates and succeeds through `crm.appointment.cancel.v1` |

Exactly three `ActionExecution` rows reach `SUCCEEDED`; the Appointment is created, rescheduled and canceled. The proof performs zero external live CRM/provider calls and no production mutation.

## Final evidence and audit

The final evidence run used an owned PostgreSQL cluster and final code target. It admitted 9 manifest lines / 7 claims, captured 10 HTTP and 2 production-binary server mints, checked 254 records before teardown, scanned 20 harness files and reported zero verifier violations.

The conservative `FINAL` audit retires the temporary `BLOCKED-DISCHARGE` label. Clauses without admitted production-triggered HTTP/BIN evidence remain `false`; they are not relabelled live.

```text
GATES LIVE CONTRACT-COMPLETE 3/15 · WITH U-CLASS 6/15 · STOPPED CLAUSES 0 · BLOCKED-DISCHARGE CLAUSES 0
```

Gate conformance inventory remains closed at 165 clauses and the independent checker reports zero violations.

## CKPT-W6

| Gate | Result |
|---|---|
| Application regression | 566 suites / 5301 tests PASS on supported Node 22 |
| Legacy Python regression | 613 tests PASS |
| E2E | 1 suite / 1 test PASS |
| HTTP smoke | PASS |
| Action Engine Appointment PostgreSQL proof | PASS; external live CRM mutations 0 |
| Action Engine kernel PostgreSQL proof | PASS; external effects 0 |
| Widgets live PostgreSQL corpus | 23 suites / 339 tests PASS |
| Production-binary HTTP corpus | 15/15 PASS |
| Contract / schema / architectural ratchets | PASS |
| Lint | PASS (zero errors; nine pre-existing warnings) |
| Application / scripts / widgets-live typechecks | PASS |
| Build / Prisma validation | PASS |
| Clean migration replay | 99/99; pending 0; widget-layer migrations 3 |
| Complete mutation programme | 31 batteries / 47 shards / 368 declarations PASS; unexpected surviving mutants 0 |
| Required canonical-branch CI workflows | PASS on exact code/test target |

The final evidence runtime was captured at `c42d5c8a`, before four test-only mutation-declaration commits (`5af2e832`, `b213f6d3`, `24a977ed` and `b2a0edba`). They do not change executable runtime semantics:

- `5af2e832` records the expanded Wave 6 mutation corpus;
- `b213f6d3` replaces an obsolete, unreachable Gate 6 mutant with the executable OD-1 sealed-source-capability bypass;
- `24a977ed` promotes `P-M11` from pending to the live BOOK-1 counterfactual that proves a transaction cannot remain open beyond slot 10;
- `b2a0edba` names `MINT-1` as the executable killer for `MINT-M11`, matching the actual combined MINT-1/MINT-4/MINT-5 test title without changing the mutant or the test.

Each correction was first proved by an isolated local mutation run. The full regression and mandatory mutation programme below run on the final code/test target.

The final code/test target receipts are:

- [Widget Contract 36223070423](https://github.com/famous4wrongreasons-stack/maya-platform/actions/runs/36223070423) — PASS;
- [MAYA Chat Shell 36223070425](https://github.com/famous4wrongreasons-stack/maya-platform/actions/runs/36223070425) — PASS;
- [Widgets Live 36223070424](https://github.com/famous4wrongreasons-stack/maya-platform/actions/runs/36223070424) — PASS;
- [Platform CI 36223070456](https://github.com/famous4wrongreasons-stack/maya-platform/actions/runs/36223070456) — PASS;
- [Widgets Mutation 36223070436](https://github.com/famous4wrongreasons-stack/maya-platform/actions/runs/36223070436) — PASS; complete fail-closed receipt, 31 batteries / 47 shards / 368 declarations.

The complete mutation receipt contains 238 build-killed and 127 live-killed mutants, one independently classified equivalent mutant, and the two explicitly pending voice/spoken-readback declarations preserved by OD-2 Option C. It contains zero `SURVIVED` or `UNEXPECTED` statuses. The receipt assembler independently rejected stale-head, incomplete, substituted, duplicated, weakened and crashed inputs before admitting this exact-head result.

## First owner-opened Chat-First booking boundary

Wave 6 proves the authenticated backend widget path and the existing business executor. It does **not** make the literal owner-opened shell booking flow code-ready.

The current shell still defaults to `createUnavailableSubmission()` and its network client deliberately has no `/widgets/intent` endpoint. The service, staff and time-slot projector rows also have no progression intent proposals; E2 therefore constructs the first server-owned source envelope and noun handles inside the isolated harness. The remaining code work is a canonical shell submission binding plus server-owned selector progression from chat to confirmation. It must reuse the existing envelope/seal/gate path and cannot add client authority or a second chat transport.

After that code gap is closed, non-code prerequisites remain: controlled test/deployment configuration, an approved AI provider credential, a connected YClients test tenant and read/write integration credential, required tenant entitlements, a supported authenticated principal with canonical Client binding, owner-approved test service/staff/slot, and explicit authorization for the one real test booking. None is configured or exercised by this wave.

## Hygiene and publication

The five owned proof databases and their dedicated PostgreSQL cluster were removed after the evidence snapshot and final checks. Owned temporary files, processes, watchers, browsers and databases are zero. The main dirty worktree and pre-existing databases were not touched. The closure commit contains only this report, the sanitized evidence bundle and the generated FINAL audit; it does not replace the exact code/test target or its CI receipts.

## Verdict

```yaml
WAVE 6 CERTIFIED: YES
CONTRACT V1.2: PASS
I-MIG3: PASS
NAVIGATE G12/G13: PASS
DEV-1: CLOSED
P-MINT-BOOK: PASS
BOOKING CREATE: PASS
BOOKING RESCHEDULE: PASS
BOOKING CANCEL: PASS
P-DISCHARGE: PASS
A2.2 BOOKING BLOCKERS: DISCHARGED
VOICE/SPOKEN ROWS: PENDING
E2 BOOK-1…BOOK-6: PASS
LIVE COMMIT THROUGH GATE 14: PASS
UNEXPECTED SURVIVING MUTANTS: 0
FULL REGRESSION: PASS
REQUIRED CI RECEIPTS: PASS
FIRST REAL CHAT-FIRST BOOKING E2E:
  CODE READY: NO
PRODUCTION DEPLOYMENT: NO
REAL BUSINESS EFFECTS: 0
PROCESS HYGIENE: 0
```
