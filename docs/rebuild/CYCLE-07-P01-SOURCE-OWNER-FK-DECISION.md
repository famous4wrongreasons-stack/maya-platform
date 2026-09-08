# Chapter 7 P01 — source-owner FK compatibility decision

**STOP: a proved contradiction in the approved C7 schema mapping. P01 must not deploy.**

This is not a new production surface or a reopening of Chapter 6. The existing S22 CRM observation/reconciliation path remains canonical. The proposed C7 foreign key would introduce a new restriction on that owner. P02–P06 have not started.

## Exact evidence

The approved mapping defines:

```text
MeasurementRevision(appointmentId, tenantId, clientId)
  → Appointment(id, tenantId, mayaClientId)
  ON UPDATE RESTRICT / ON DELETE RESTRICT
```

Implemented as `C7_measurement_appointment_fk` in the **unapplied production** migration `20260908153000_chapter7_measurement_foundation`.

The existing source path is:

- `src/crm/appointment-observation.service.ts`, `toObserved` / `resolveClient`: provider-qualified `CrmClientLink` resolves the actual canonical Client, without phone or User inference.
- `src/domain/appointment-change.ts`, `mergeAppointmentState`: a proved new `mayaClientId` supersedes the previous value; missing evidence preserves the previous value.
- `src/crm/appointment-change.service.ts`, `applyObservation`: the existing canonical transaction updates the Appointment from that observation.
- `src/crm/appointment-reconciliation.service.ts` and `src/crm/shadow-ingestion.service.ts`: existing callers. The mirror/bootstrap path has the same mutable source association.

[Executable reproducer](../../maya-saas-backend/scripts/chapter7-source-owner-compatibility-proof.ts) uses the real `AppointmentObservationService`, `AppointmentChangeService`, `EventStoreService` and PostgreSQL. Only the provider read fixture is synthetic; no real provider is called. It is hard-bound to the new owned localhost database and cannot run against production or the 17 old databases.

[Observed result](evidence/chapter7-p01/source-owner-compatibility-proof.txt):

| State | Exact canonical correction Client A → Client B |
| --- | --- |
| No C7 row | PASS — same-tenant, provider-qualified binding; source owner updates successfully |
| PENDING C7 row | FAIL — Prisma `P2003`, `C7_measurement_appointment_fk` |
| PUBLISHED C7 row | FAIL — same constraint; source update rolls back |

No NativeFeedbackRequest or other existing dependent business object exists in this fixture. The new C7 FK is the exact cause. No fake binding, phone matching, User authority, external operation or production mutation is involved.

This violates **source facts remain owned by source owners**. It also contradicts the mapping's explicit design that canonical Appointment identity survives an authorized Client correction while the old as-reported revision stays immutable. A lifetime FK to the current Client association cannot express both requirements.

The initial schema assessment and positive P01 proofs missed this mutable-source-key interaction. The new compatibility proof supplies the missing evidence. It is a **schema contract contradiction**, not an inventory defect and not a new Bxx sequence.

## Recommended Option A — stable source identity FK, admission-time Client proof

Keep all existing product decisions, one shared model, 37 fields and eight FKs. Change only the new Appointment relation's contract:

```text
MeasurementRevision(appointmentId, tenantId)
  → Appointment(id, tenantId)
  ON UPDATE RESTRICT / ON DELETE RESTRICT

MeasurementRevision(clientId, tenantId)
  → Client(id, tenantId)
  remains unchanged.
```

At admission, the existing C7 owner and admission guard must prove and lock the exact current `Appointment.mayaClientId == intent.clientId` under the same tenant. The admitted Client remains immutable historical evidence, rather than a permanent lock on the source's current Client association.

Required semantics for approval:

1. A canonical source correction may proceed through its existing owner. Measurement never changes, vetoes or repairs that source fact.
2. A published old revision retains its original Client/evidence/hash and deadline. It is an as-reported artifact, not current Client authority. Current read entitlements still apply; knowing the old receipt cannot disclose the new Client's facts.
3. If the source Client changes while a revision is PENDING, the old intent cannot be rewritten to the new Client. Under current permitted tenant authority, the deterministic publisher closes that same receipt as `UNAVAILABLE` with no credited pair and a safe source-subject-changed reason. It must not copy the new Client's facts into the old Client's snapshot. This uses the already approved publication state/result representation and does not introduce a business action.
4. A subsequent qualified observation for Client B uses a genuinely new durable occurrence/intent and a new revision of the **same tenant + Appointment identity**. It cannot reuse Client A's request identity. One current outcome still has at most one credit; A29 assignment remains unchanged.
5. Missing/revoked authority still fails closed. Wrong tenant/Client admission is denied. Historical Client evidence cannot authorize current reads or bypass consent, ownership, idempotency or source retention.
6. Expiry/cleanup remains the existing 365-day AC6 contract. No early delete, cascade, historical rewrite, backfill, parallel owner or additional table.

**Why A:** it distinguishes immutable historical evidence from the source owner's mutable current association. It preserves exact tenant/Client admission proof without making measurement a source mutation owner.

**Business/user gains:** canonical CRM corrections continue; historical reports remain explainable; current results can reflect the corrected Client with one outcome identity.

**Business/user loses:** no supported capability is intentionally retired. During a source-subject change, an old pending result becomes explicitly unavailable; it does not silently migrate to another Client.

This is a proposal, not implemented or treated as approved. The pending-row/current-read semantics above must be included in the single narrow approval, so they are not chosen silently later.

## Alternative Option B — retain the lifetime triple FK

Keeping the mapping unchanged freezes Appointment Client association while any C7 row references it, potentially for 365 days. The demonstrated canonical correction would remain blocked. That would require changing an existing source-owner contract and accepting delayed/failed CRM corrections. It conflicts with the already approved C7 boundary and is **not recommended**; it cannot be disguised as a runtime error-handling fix.

No broader source-version model is proposed: the approved shared representation can express Option A without expanding the model/field envelope.

## Impact and required follow-up proof

```text
RECOMMENDED OPTION: A
NEW MODELS ABOVE APPROVED ENVELOPE: 0
NEW PHYSICAL FIELDS ABOVE APPROVED ENVELOPE: 0
NEW BUSINESS ACTION CLASSES: 0
NEW AC6 CLASSES ABOVE APPROVED ENVELOPE: 0
TOTAL C7 MODELS / FIELDS / MIGRATIONS: 1 / 37 / 1
MAPPING CHANGE: ONE FK RELATION + ADMISSION/PUBLICATION VALIDATION SEMANTICS
PRODUCTION C7 MIGRATION APPLIED: NO
BACKFILL: NO
OWNER APPROVAL OF THIS DELTA: PENDING
```

After approval, revise only the still-unapplied C7 migration and the relevant Prisma relation/guards/runtime checks through normal commits; do not rewrite applied production migrations or force-push. Keep the eight source-model inverse relations and four C7 trigger functions. Rerun clean replay and convert this reproducer into acceptance proof that the canonical correction succeeds with both pending and published C7 artifacts, preserving the historical snapshot and exact new-current identity. Also prove the pending unavailable outcome, wrong Client/tenant denial, same-key conflict, one current credit, concurrency, current read authorization and AC6 preservation. Then repeat mandatory P01 gates before production.

## Preserved implementation and release state

WIP commits: `7acbf373` (shared foundation), `bfd310a8` (bounded history query receipt). P01 local component proof: 41 PostgreSQL checks and 4 suites / 49 tests PASS; **overall P01 acceptance is BLOCKED by the new source-owner compatibility FAIL**. Positive component checks do not override that failure.

Both deployment attempts were stopped in their local mandatory gate, before release upload, production migration or activation. The first full mandatory run had two old AC6 allowlist expectations; both were corrected and passed targeted tests. Subsequent full deployment-gate runs were interrupted before completion, so no fresh full-regression PASS is claimed.

Production remains `20260908-p5-rc-8bc03454`; [fresh final preflight](evidence/chapter7-p01/stop-production-preflight.txt) confirms health/readiness and no drift against that deployed C6 schema. Its 93 repository migrations (96 applied rows including the recognized historical manifest) have pending=0. **Against the C7 candidate there is exactly one expected unapplied migration**; this is not claimed to be a production C7 pending=0 result. No new migration or runtime was deployed.

[Cleanup receipt](evidence/chapter7-p01/stop-hygiene.json): synthetic dump preserved, owned cluster/database removed, owned processes/watchers/browsers/databases=0. Protected main remains 24 entries with unchanged hashes; 17 old databases untouched. Chapter 6 and its production baseline remain preserved. C7 requirements/packages/waves receive **no production-completion credit** yet. P02–P06 and the Chapter 7 Final Gate remain unstarted.

```text
P01 SOURCE OWNER COMPATIBILITY: FAIL
P01 LOCAL ACCEPTANCE: BLOCKED
P01 PRODUCTION: NOT STARTED
CHAPTER 7 PACKAGES COMPLETE: 0/6
CHAPTER 7 WAVES COMPLETE: 0/4
KNOWN CHAPTER 7 REMAINDER: P01 FK decision + approved P02–P06
MANIFEST DEFECT: NO
CHAPTER 7 COMPLETE: NO
CHAPTER 8 STARTED: NO
PRODUCTION BUSINESS/PROVIDER/MESSAGE MUTATIONS FOR PROOF: 0
```

Decision/evidence → normal commit/push → STOP. No change to the proposed FK or source owner is made without the narrow owner decision above.
