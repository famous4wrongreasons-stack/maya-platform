# Package 5 final remediation — B5/B6 contract reconstruction STOP

Date: 2026-09-04. Accepted checkpoint: `225ba5e1`.
Accepted production remediation baseline:
`20260904-p5-final-remediation-94543056`.

**Contract reconstruction is complete. Existing schema is insufficient, and
specific preference/provider policy choices require owner approval.**
The user's Stage 1/2 and new-business/schema STOP applies before runtime,
schema, ratchet or deployment implementation. This is not Wave 7 and does not
reopen accepted Waves 1–6 or the accepted A18 consent/A26/AI deployment.

## B5 findings and decision boundary

The same legacy request currently combines three meanings: a selected visit's
quiet/social preference, the Client's remembered default, and a CRM comment
marker. Only the first two are the Client's Maya-owned preference state. The
CRM comment is synchronization/presentation of that choice, not its source.
Current app behavior is best effort after booking; a mood failure does not
invalidate a successful booking. The staff-facing journal also reads Maya's
local per-visit value. Device-local default persistence is separate from server
state. The inspected default SQLite getter has no production caller; existing
storage alone does not prove an active automatic future-visit application rule.

D2-A supplies the correct default owner, **Client-owned CustomerProfile**, but
does not supply a field or an exact per-visit write envelope. Existing canonical
`update_client_profile` V1 handles locale only. Staff encrypted notes and
provider-owned Appointment notes/payload are not substitutes for new preference
state. Reusing their JSON/text would be a runtime workaround.

Package 1 already approves A07 `crm.appointment.fields.v1`, including comment
updates, read-preserve-write-read, UNKNOWN and reconciliation. Do not claim that
the provider API operation itself needs to be invented or reapproved. However,
the existing generic executor does not establish that every verified Client mood
choice must be synchronized, or provide this compound local/provider operation's
durable handoff and Client authority. The live direct PUT is never a valid
compatibility fallback.

Decision proposal: **recommend Maya-local V1**, with explicit local/CRM wording
and staff visibility in Maya. Alternative: retain CRM synchronization through
existing A07 with an explicit durable child relationship and separate outcome.
Neither option is implemented by this assessment. The proposed prospective
appointment limit is also explicitly presented for approval, rather than
silently changing the legacy endpoint.

Read the exact proposal:
`package5-b5-visit-mood-v1-decision-proposal.md`.

## B6 findings and schema boundary

Notification preferences are **Client-owned communication-policy restrictions**.
They are not consent decisions; neither opt-in categories nor defaults create
ClientConsentFact or authority to send. Current UI explicitly distinguishes
notification tuning from consent. Server delivery must separately satisfy the
existing consent and tenant/system policy boundaries.

The live schema has no suitable Client preference store. Tenant-wide
AppointmentNotificationSetting and membership-required DashboardPreference have
different owners. CustomerProfile has no notification or mood field; a guest
Client must not be represented by a fabricated User or membership.

Two concrete semantic gaps must not be hidden by a migration:

- `has_saved_notify_prefs` makes mere row existence enable marketing throttling
  and existing-record CRM reminder override. Thus legacy same-visible-value
  writes can change behavior. This conflicts with the required read/no-op rule.
- Legacy reminder hours accepts 0–48, but enabled + 0 has inconsistent meanings:
  booking uses 0 while existing-record refresh substitutes 3. New canonical
  behavior cannot copy both interpretations as one contract.

The exact proposal adds **three nullable fields to existing models, no new
models**: CustomerProfile.defaultVisitMood, CustomerProfile.notificationPreferencesJson
and Appointment.clientVisitMood. It retains exact Client FKs and immutable
authority/audit foundations, with narrow DB validation and zero historical
backfill. The ten existing notification keys become a proposed strict versioned
envelope; no arbitrary config bucket or legal-consent storage.

The included policy proposal explicitly asks to approve effective-value/no-op
semantics, inherited V1 defaults/caps, reminder enabled + 1–48 hours and tenant
timezone. These are proposed decisions, not approvals inferred from legacy
constants. Automatic CRM reminder updates are not smuggled into a local
preference command. See:
`package5-b5-b6-client-preferences-schema-v1-proposal.md`.

## Read-only evidence and scope limits

Evidence: `evidence/package5-b5-b6-contract-reconstruction.json`.

- Fetched origin equals accepted `225ba5e1` at entry.
- Read-only production catalogs: 91 public tables; all 73 repository migrations
  present among 76 migration records, pending 0. Selected columns/constraints
  confirm the schema gap. No application/customer rows were read.
- Live webhook/database/YClients source hashes still match the accepted
  `225ba5e1` evidence. No release, service or environment modification.
- Health/readiness PASS on unchanged runtime. This is a contract assessment,
  not a new full deployment/drift gate.
- Source call paths and published caller code were inspected, not invoked.
  Observed defaults were extracted as source constants without importing Python
  business modules or reading secrets/customer state.
- Existing D2-A and optional-User/verified-channel/600-second challenge decisions
  remain approved; no repeat approval for those foundations is requested.

No Stage 3 ratchet changes, Stage 4 mutation/concurrency tests, Stage 5 deploy,
or Stage 6 full final gate were started. Their prior PASS counts are not a new
B5/B6 remediation proof. The accepted final-gate FAIL remains current; no new
global bypass count or completeness claim is made.

After approval, implement the exact foundation and policy, prove schema and
runtime invariants locally, then follow the authorized conditional migration,
deployment and complete 13-family final-gate sequence. Tests must include both
Python endpoints, their direct writer helpers, read-mode behavior, actual live
provider boundary and the downstream preference consumers; no broad directory
or test-filename exemptions.

```text
B5 CONTRACT RECONSTRUCTION: COMPLETE
VISIT MOOD CANONICAL OWNER: CLIENT — CUSTOMERPROFILE DEFAULT + PER-APPOINTMENT CLIENT PREFERENCE
CRM SYNC REQUIRED: NO — NOT AN ESTABLISHED APPROVED B5 REQUIREMENT
CRM WRITE AUTHORITY ALREADY APPROVED: YES — PACKAGE 1 A07 BOUNDARY ONLY
B5 AUTOMATIC CRM SYNC / DURABLE HANDOFF APPROVED: NO
B6 CANONICAL OWNER: CLIENT-OWNED COMMUNICATION PREFERENCES
B6 PREFERENCES ARE CONSENT FACTS: NO
EXISTING SCHEMA SUFFICIENT: NO
ADDITIONAL SCHEMA REQUIRED: YES — THREE NULLABLE FIELDS PROPOSED
B5/B6 SCHEMA/POLICY APPROVED: NO
B5/B6 RUNTIME REMEDIATION CAN RESUME: NO — OWNER DECISION REQUIRED
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL — ACCEPTED BASELINE, NOT RERUN
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
REAL PRODUCTION MUTATIONS FOR FINAL PROOF: 0
WAVE 7 CREATED: NO
CHAPTER 6 COMPLETE: NOT DECLARED
CHAPTER 7 STARTED: NO
PRE-EXISTING LOCAL TEMP/TEST DATABASES: 17
PRE-EXISTING DATABASES DELETED: 0
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```

Only proposals, report, evidence and current remainder are committed/pushed.
All unrelated dirty files and the 17 pre-existing local databases are preserved.
