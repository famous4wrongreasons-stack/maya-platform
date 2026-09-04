# Package 5 final remediation — B5/B6

Owner accepted `cdd97012`, selected Maya-local mood V1 and approved exactly three nullable fields. Waves 1–6 remain accepted; this is remediation, not Wave 7.

## Schema in production

`b152bf09` added `CustomerProfile.defaultVisitMood`, `CustomerProfile.notificationPreferencesJson`, and `Appointment.clientVisitMood`. Expected-only additive migration gate/apply passed. Pending migrations 0, drift NONE, historical backfill 0. Existing runtime stayed active during apply. PostgreSQL schema proof 37/37; clean replay and schema ratchets passed.

## Deployed runtime

B5/B6 use two explicitly versioned Client preference capabilities under the existing Canonical Action Ingress/Action Engine. Accepted Wave registrations remain unchanged. Authority is an authenticated current channel plus durable verified ClientChannelLink, rechecked inside the transaction with Client identity holds and common tenant access policy. No phone, arbitrary Client, bare User or provider-record match establishes authority.

Mood changes one owned upcoming confirmed Appointment and remembers the default in the same local transaction. Existing appointment choices remain independent of later defaults. A07 remains separate; this flow has no CRM dependency or automatic PUT. Old bot callback buttons direct the user to the authenticated application instead of pretending to carry a verified first-party Client command.

Notification preferences are sparse Client overrides, never consent or opt-in. Missing values inherit the existing applicable central/tenant/category policy. No three-hour Client default is introduced. Zero and invalid/coerced reminder hours fail validation; `reminder=false` disables. A payload explicitly requesting both disable and hours is rejected; an earlier valid hour choice may remain dormant while disabled. Returning to an inherited value removes the override; reads and unchanged/empty requests create no profile, Client, consent, execution or applied mutation fact. The no-op contract has no implicit pin-defaults operation.

Legacy Python readers use canonical read projections, with missing binding failing closed. Read-only projections do not write SQLite. The legacy existing-record reminder synchronization helper is closed. Future booking continues through its existing Package 1 boundary: absent Client hours are omitted, with no legacy Python substitution; Package 1 provider behavior is not promoted into Client preference authority. Notification preference and ClientConsentFact remain distinct. Quiet-time evaluation is server-derived using the tenant timezone.

Frontend calls preserve current channel credentials, stable command identity and expected generation. Mood default is read from CustomerProfile rather than shared device storage. Missing binding does not appear as an unrestricted empty configuration. Shared changes were mirrored into the native working copy and Capacitor sync passed; existing unrelated native work was preserved.

## Evidence

- PostgreSQL runtime proof: 28/28, including duplicate/restart, concurrent same/different requests, crash before first effect, rollback between profile/appointment writes, retry after rollback, no-op, missing Client, cross-Client/tenant/provider rejection, historical appointment rejection and no consent mutation.
- Full regression: 329 suites / 2742 tests PASS. Backend/script typechecks, project lint, build and preflight compilation PASS.
- Python bridge: 18/18 PASS including prior A18; synthesized live candidate: 10/10 PASS. PHP transport: 13/13 PASS including prior consent. Source/candidate inline-script parsing and protocol checks PASS.
- Bypass ratchets reject reintroduced SQLite/profile/preference writes, hidden Client creation, automatic provider PUT and arbitrary expansion of channel authority.

## Deployment and final result

Runtime source `fb820b3b` is deployed at `/opt/maya-saas/releases/20260904-p5-b5-b6-fb820b3b`. Sequential mandatory deployment gates and isolated read-only candidate startup passed. Python, PHP and all three published app copies match bounded candidate hashes. Current Maya/PWA services are active and ready; error-priority journal entries since activation are zero. The previously inactive bot remains inactive. Pending migrations 0; drift NONE; 74 repository migrations and 77 production records including the three recognized historical records.

Compiled B5/B6, prior A18/A26/AI and AC6 ownership/policy checks passed. The 40 accepted Wave 1–5 registrations remain unchanged; the two approved Client preference remediation capabilities are additionally registered. The standalone postdeploy helper initially asserted a namespace-qualified Python call while the reviewed implementation uses an explicit `from legacy_client_preferences_bridge import command` import. That check was corrected to assert the exact import and dispatch; live candidate hashes and negative writer checks remained enforced. This was a verification-script error, not a runtime change or relaxed bypass exclusion.

The native mirror and generated public copy match after sync. Native build/install was not requested; its pre-existing dirty worktree and remote divergence were preserved. In the platform worktree all 30 unrelated dirty files were preserved, with only the committed task delta applied to the three mixed files.

The automatically restarted full 13-family inventory found **B7/B8**, two other A18 legacy writers. Under the user's explicit new-bypass STOP, Package 5 remains incomplete. See `CYCLE-06-BLOCKING-PACKAGE-5-B5-B6-DEPLOYED-FINAL-GATE-STOP-REPORT.md` and `evidence/package5-b5-b6-deployed-final-recheck.json`. Candidate regression PASS is not substituted for the stopped final aggregate gate.

No real production business/provider command was invoked for proof. Existing 17 local test databases were not used or deleted. Owned temporary processes/watchers/Chrome/databases remaining: 0.
