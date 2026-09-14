# C7 P03 — exact outcomes, attribution and stage measurements

Status: implementation, focused tests, targeted TypeScript and synthetic PostgreSQL acceptance complete. The combined Wave 3 release gate and production cutover remain parent-owned. This package does not claim whole-Chapter-7 completion.

Authority: Q04/Q12/Q13/Q14/Q15 and approved D02/D03/D13 Option A under the [combined mapping](CYCLE-07-COMBINED-SCHEMA-ACTION-MAPPING.md) and [owner approval](evidence/chapter7-schema-mapping/owner-approval.json). Uses the applied 37-field P01 `MeasurementRevision`; no migration, model, action or parallel publisher is added.

## Reader and exact authority

`MeasurementOutcomesReader(prisma, context, evidence)` exposes `supports`, `authorize(tenantId, normalizedIntent, tx)` and `read(tenantId, normalizedIntent, tx)`. The only injected action capability is the existing owner read `readTrustedNormalizedInput(tenantId, executionId, tx?)`; the module wraps it in a frozen narrow interface. Readers import no action executor, provider adapter interface, encryption implementation or delivery machinery.

Supported kinds are `appointment_outcome` and `execution_funnel`, capability `measurement.read`, with empty dimensions and sourceQuery. Tenant system context and the tenant's canonical timezone are required. Appointment scope supports exact Client/Appointment and optional Staff/branch intersection; conflicting branch scopes are rejected. Funnel scope is tenant-wide because all stages do not share a canonical Client/Staff/branch denominator. Restricted funnel, configuration-owner and arbitrary query scopes are rejected instead of broadened.

Initial admission checks the exact current Appointment/Client relationship. Receipt authorization checks exact tenant/Appointment/branch/Staff while preserving the admitted historical Client. Shared publication holds the Appointment source lock and closes a corrected A-to-B subject as empty UNAVAILABLE. P03 does not strand a pending historical receipt by requiring its old Client association before that shared check. The existing publisher alone owns claims, fencing, revision selection and snapshot immutability.

## Outcome and attribution semantics

P01's five existing metrics retain their keys and bases: `appointment_status`, `attendance`, `booked_value`, `confirmed_cash`, `confirmed_refunds`. Null attendance/value stays NOT_MEASURED; a stored zero remains zero. Booked value is never cash, a refund, profit or incremental revenue.

Current status and attendance are separate from creation lineage. `current_active_booking` and `exact_attributed_active_booking` become false after a canonical cancellation; a new revision records this while old published snapshots and the original successful effect receipt remain unchanged. Exact Appointment DomainEvent receipts give the observed event history; no payload or provider text is retained.

Credit requires all of the following under one exact tenant:

- An immutable B31 idempotency binding to the exact canonical Client, the existing immutable booking-intent contract/hash, and owner-verified normalized input matching that Client.
- An allowed, approved/not-required, non-dry-run, successful `crm.appointment.create.v1` execution from the canonical authenticated Client path.
- A finished direct `EXECUTION` attempt, successful with an acknowledged/not-applicable boundary, whose receipt identifies the same Appointment and successful creation. Execution and attempt completion must be at or before the requested cutoff.
- The internal B31 identity `appointment-action:<executionId>` proving the exact action-to-Appointment link.

One unique execution/attempt pair receives credit. Repeated references to that same pair collapse; competing exact pairs are AMBIGUOUS with no credit. UNKNOWN, failed, denied, dry-run, missing retained input, reconciliation-only success, legacy source, phone/time proximity and external-ID equality alone remain uncredited. Known input contract/integrity failures produce an explicit safe limitation; database/infrastructure errors still propagate.

The approved narrow decoder does not expose the frozen external calendar/provider-company namespace. Therefore external receipts remain uncredited with `external_effect_provider_namespace_not_frozen_in_receipt`, even if a current mirror has the same external ID. No current integration is substituted for historical provider evidence and no decryptor or hash contract is duplicated.

## Capacity and A29

Capacity requires the credited execution's exact historical AgentTask/Opportunity chain, a cancellation-recovery Opportunity with complete watch/interval/schedule evidence, and the existing Opportunity owner's reference functions matching the original canonical Appointment interval. Staff and branch must match. `filled_capacity` is true only for a currently confirmed outcome occupying the entire original blocked interval; a partial occupation does not become full recovery. Attendance is separate. A changed/missing original interval, missing task lineage, incomplete evidence or an A29 `filledWindow` flag alone produces NOT_MEASURED.

The current canonical B31 authenticated Client create path does not supply an AgentTask lineage. Such outcomes can have exact booking credit while capacity stays NOT_MEASURED. This is the approved source-gap path, not a new action or inferred join.

A29 is read separately in the tenant-wide funnel. Its source-labelled booking cohort retains assignment count, frozen window-day distribution, current booked/canceled states and the original `filledWindow` flag explicitly labelled as a flag. Existing exact `ActionTargetMutation.targetRef = RecoveryConversion.id` correction receipts are counted separately. No subject/contact join links A29 to a verified Client, and no assignment/window is changed by measurement. A real source-owner cancellation 50 days after a frozen one-day assignment is included in the PostgreSQL proof.

## Funnel denominators and observation time

All admission cohorts use half-open `[periodFrom, min(periodTo, asOf))` bounds in the declared canonical tenant timezone. Their current state is read at source observation time; historical state is not reconstructed. Open periods and source updates after the requested cutoff are explicitly labelled.

| Stage | Denominator and clock | Separate facts |
| --- | --- | --- |
| Opportunity | Revision rows with `firstDetectedAt` in the cohort; logical count uses distinct semantic key within it | Current active/resolved/expired/superseded revisions |
| AgentTask | Assignment rows with `requestedAt` in the cohort | Current versus invalidated assignments |
| ActionExecution | Admitted logical rows with `createdAt` in the cohort | Policy decision, approval decision, dry-run, current execution state, real non-dry-run success and exact task FK |
| ActionAttempt | Exact children of the admitted execution cohort, observed at read | Execution attempts versus reconciliation attempts and current terminal/unknown state; retries never add actions |
| Campaign | Canonical root campaigns with `createdAt` in the cohort, excluding transport-child roots | Legacy lifecycle rows counted separately; B35 child slots separate |
| Recipient | Exact root recipients of the campaign cohort | Canonical Client roots, transport recipients, ACCEPTED/DELIVERED/UNKNOWN/FAILED/SKIPPED/NOT_SENT states |
| DeliveryAttempt | Exact children of those root/transport campaigns | Execution and reconciliation attempts, never recipient counts |
| A29 | Existing assignment `bookedAt` cohort | Frozen assignment/window versus current source status; no verified Client credit |

B35 transport slots cannot inflate logical Client counts. A root is observed accepted/delivered if at least one exact child has that receipt; multiple routes count once. ACCEPTED never implies DELIVERED. Acceptance/delivery ratios retain explicit integer numerators and root-recipient denominators, with floor rounding to parts per million. An empty denominator is NOT_MEASURED. The existing delivery contract has no read receipt, so read count/rate remain null NOT_MEASURED. Ephemeral proposal projections also have no durable admission denominator; proposal count is NOT_MEASURED. Counts from independent owner cohorts are not presented as a cross-stage conversion rate.

## Bounded evidence and validation

Each source/relationship read requests at most 1,001 rows and permits 1,000. Receipts retain tenant-qualified query identity, state hash, observation time, qualification and coverage, never one persisted source copy per cohort member. Queries select only safe identity/state fields; owner receipt bodies and retained inputs are used transiently for verification and never copied into measurement. Known overflow publishes empty UNAVAILABLE/UNQUALIFIED through the shared publisher and supersedes earlier current facts; it does not publish a truncated cohort or leave an infinite PENDING retry. Infrastructure and authority errors are not hidden.

Local acceptance:

- Owned unit and permanent package ratchets: 38 tests PASS (33 functional, five architecture).
- Owned plus shared measurement/Wave 3 boundaries: 55 tests PASS across four suites.
- Adjacent canonical ingress, durable policy, B34 and Wave 3 architecture: 23 tests PASS; no production writer allowlist was changed.
- Targeted runtime/spec/proof TypeScript: PASS. Targeted runtime/spec lint: PASS.
- Real isolated PostgreSQL acceptance: ten scenarios PASS through the shared dispatcher with P03 installed. Existing B31 create/cancel, Appointment observation/change, A29 fact plane, Opportunity lifecycle and the accepted controlled AE/CD fixture owners create synthetic source facts. Measurement itself performs no source mutation, retry, reconciliation, invitation or delivery.

The proof is hard-bound before Prisma construction to loopback `127.0.0.1:55517`, database `maya_c7_replay`, user `maya_c7`, with no URL query overrides. It creates only random synthetic tenants and leaves the parent-owned shared cluster intact. Historical setup failures (missing local tsx launcher, incorrectly shaped fixture cancel principal, and an unsuitable synthetic UNKNOWN injection) remain in the external work logs; the final passing run uses the existing controlled owner UNKNOWN lifecycle.

The [Q04/Q12–Q15 proof map](evidence/chapter7-p03-outcomes/proof-summary.json) and [sanitized PostgreSQL output](evidence/chapter7-p03-outcomes/postgresql-proof.txt) accompany this package. Production deployment and the combined mandatory gate are separate parent-owned acceptance steps.
