# C8 Wave 2 — P02 value/ranking and P03 prospective target infrastructure

Authority: the approved D1–D16, combined 3-model/94-field envelope and [limited-data decision](CYCLE-08-LIMITED-DATA-IMPLEMENTATION-DECISION.md). P01 production baseline is `20260913-c8-p01-12f0f35b`. This package introduces **no schema/migration/business action**. Numeric model activation remains disabled for all eight targets.

## Runtime ownership

`C8Producer` accepts only a fixed capability and exact scoped subject. Current A22 policy, canonical subjects, server clock and C7 snapshots determine inputs. `C8CaptureService` initiates the existing C7 owner; it cannot write Client, Appointment or MeasurementRevision. Confirmed source metrics provide integer money and observed attendance. Cash/refunds are unavailable when the existing per-Client source cannot establish them. Booked/gross value remains a labelled proxy, not profit, CLV or incremental revenue. Net refunds require the exact linked-net source metric; separate unlinked amounts are not heuristically reconciled.

The existing C8 store remains the sole derived writer. Query evidence freezes a closed tenant/Client/Staff/branch/service predicate and the ordered complete population digest. The digest covers full source content inside PostgreSQL; raw contact/provider content is not copied out. Admission, publication and current reads recheck the population, so a newly added appointment or source correction invalidates current use even when every old row remains. Every ranking dependency is also requalified against current sources and policy. Historical published snapshots stay immutable.

Dormancy uses the exact confirmed elapsed/calendar rule and proven attendance. No last visit means unavailable. A rule requiring complete coverage cannot use the partial canonical mirror. Internal service scope is supported only through existing canonical identity; unqualified provider/catalog linkage and ambiguous mixed service money are unavailable. No universal visit count, cadence, loyalty or value cutoff is introduced.

`C8RankingService` uses whole bounded cohorts, named comparators, exact decimal comparison and opaque-ID ties. Every comparator is retained. An unavailable probabilistic comparator makes that objective unavailable; it is never replaced by a probability or silently dropped. A separately configured historical objective continues to work. Unknown/incompatible subjects are a separate bucket. All comparator revisions are immutable dependencies; no contact list or scalar dataset is copied into the rank. Resume reconstructs the same cohort only after its query digest matches. The 5,000-member bound is a resource limit, not a business threshold; oversized scopes are refused, not called a complete top list.

## Prospective collection

Each T01–T08 target has its exact event/label/horizon manifest, input contract and unfitted model definition. The admitted T0 follows source snapshot and definition admission. T02 freezes an already-existing future Appointment and its exact schedule; other horizons use the configured elapsed/calendar window from actual T0. Missing salary terms, capacity denominator, monetary lineage or creation-event coverage remain explicit unsupported/missing evidence. An existing-booking scenario is labelled conditional booked value, never expected cash or causal uplift.

`C8Worker` runs within the existing bounded operational scheduler; no timer/daemon/cron is added. No confirmed C8 policy means no admission or fabricated defaults. Configured subjects receive prospective input-only captures. Repeated/concurrent collection within the same open target window converges through the C8 store's scoped admission lock to one immutable T0; restart resumes existing IDs. The worker makes at most 50 capture attempts per tick, and does not call a provider, send a message, train a model or activate one. P05 will attach later qualified C7 labels to these captures.

A concurrent **C7 local computation claim** is retried with the exact original snapshot identity. This narrow bounded wait does not retry provider UNKNOWN or create a new business intent. Other errors remain errors or explicit unavailable conditions.

| Target | Contract/input persistence | Numeric output | Calibration |
| --- | --- | --- | --- |
| T01 attended return | Exact Client, known visit history, configured H | DISABLED | UNAVAILABLE |
| T02 no-show | Exact future Appointment/Client and immutable scheduled end | DISABLED | UNAVAILABLE |
| T03 expected value | Exact Client / named monetary basis / H | DISABLED | UNAVAILABLE |
| T04 revenue | Exact tenant/branch and named currency/basis/H | DISABLED | UNAVAILABLE |
| T05 accrued earnings | Exact Staff; missing independent compensation terms unsupported | DISABLED | UNAVAILABLE |
| T06 observed booking demand | Creation-event coverage required; table history not a substitute | DISABLED | UNAVAILABLE |
| T07 scheduled utilization | Qualified capacity denominator required | DISABLED | UNAVAILABLE |
| T08 statistical deviation | Qualified forecast distribution required; no incident inference | DISABLED | UNAVAILABLE |

## Frozen requirement mapping and executable proof

| Q / package | Implementation and proof |
| --- | --- |
| Q07 / P02 | C7-qualified historical value; exact large/negative decimals, currency, partial/unknown distinction |
| Q08 / P02 | T03 named-basis/horizon input-only persistence; no CLV or fabricated expected value |
| Q09 / P02 | Observed vs conditional existing-booking scenario vs disabled expected value; no causal output |
| Q10 / P02 | Confirmed cadence, strict/inclusive boundary, missing last visit, coverage requirement |
| Q15 / P02 | Whole cohort, comparator/tie/exclusion manifest, restart, source population correction |
| Q11 / P03 | T01/T02 T0/schedule/horizon, numeric disabled and one concurrent capture |
| Q12 / P03 | T04/T05 exact monetary/Staff scope and honest missing terms |
| Q13 / P03 | T06/T07 creation event/capacity requirements; unavailable rather than invented denominator |
| Q14 / P03 | T08 explicit statistical target unavailable; deterministic policy signals stay a distinct kind |

Executable PostgreSQL proof: `scripts/chapter8-wave2-proof.ts`, **13 scenarios PASS**, using only the owned synthetic cluster. P01 preservation: **24 checks PASS**. Mandatory-discoverable C8 tests: **6 suites / 61 tests PASS**. The package guard covers source writers, full population revalidation, target clocks, disabled prediction, whole ranking and the existing worker launcher. The P01 shared guards and all inherited Chapter 6/7 ratchets remain enabled.

All eight rows above were exercised as actual durable PostgreSQL captures, not mocked numeric predictions. These synthetic implementation checks do **not** establish real-world calibration or fitted model readiness.

P02 LOCAL EXECUTABLE PROOF: PASS
P03 LOCAL EXECUTABLE PROOF: PASS
WAVE 2 MANDATORY RELEASE GATE: PENDING
P02 PRODUCTION: NOT DEPLOYED
P03 PRODUCTION: NOT DEPLOYED
C8 REQUIREMENTS COMPLETE: 7/24 (production)
C8 PACKAGES COMPLETE: 1/6 (production)
C8 WAVES COMPLETE: 1/4 (production)
T01–T08 ACTIVE: 0/8
T01–T08 DISABLED: 8/8
REAL-WORLD CALIBRATION: UNAVAILABLE
PRODUCTION PROOF EFFECTS: 0

Next: the documented full mandatory release gate and coordinated Wave 2 cutover; only then production acceptance and automatic P04/P05. P06 retains the bounded UI/AI/read and legacy consumer cutover scope. No Chapter 9 implementation.
