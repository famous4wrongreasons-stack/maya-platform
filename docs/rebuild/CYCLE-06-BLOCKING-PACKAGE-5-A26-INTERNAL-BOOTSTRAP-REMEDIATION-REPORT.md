# Package 5 final remediation — approved internal TrialActivation candidate

Accepted checkpoint: `03c1c3a7`. A26 Internal Trial Bootstrap V1 is approved.
This remains final-gate remediation; accepted Waves 1–6 are not reopened.

## Implementation

The existing atomic TrialActivation transaction now supports explicit internal
mode: tenant, first branch, reserved owner/membership and exactly one initial
InternalProvider commit together. The provider identity derives from the same
activation and binds only that owner/branch. No new schema or action class.

The approving instruction explicitly excludes automatic schedules. Therefore
no availability rules, services, prices, additional staff or CRM identities are
manufactured. Subsequent setup belongs to the existing canonical A28 commands.
The old owner-provider bootstrap helper now fails closed; public/admin routes
remain initiators. No physical tenant-delete compensation is present.

AI onboarding remains real-CRM-only, with the same immutable receipt and A17/A16
continuation. It cannot select the internal bootstrap to imitate CRM import.
Site/app callers pass activation identity and expected draft revision and
resume the receipt only after explicit CRM connection. Manual retry retains
its activation token in session-scoped storage.

The A18 PHP forwarding fragment preserves the original authenticated channel,
strict consent decisions and idempotency key; unknown identity fields are
rejected. It adds the existing challenge-consumption endpoint without Client
selection. Its deployment replaces only the old consent switch cases.

Two pre-existing final regression ratchets needed bounded synchronization:
only the exact read-only Client consent verifier may cross the generic engine
import guard, with AST rejection of any other calls; the exact isolated A18
challenge proof requires loopback, its owned port/database and refusal marker.
Negative tests retain mutation/provider/import and lookalike-proof detection.

## Local evidence

- PostgreSQL AI/A26 47/47, including actual process exits after tenant, owner and
  provider creation; fresh-process retries; concurrent activation; durable
  post-commit failure; retained suspension/provider; no duplicate outcome.
- A18 PostgreSQL 22/22; Python transport 8/8; PHP pure transport 8/8.
- Full regression 327 suites / 2726 tests PASS; ratchet synchronization 13/13.
- Prisma validate, project lint, application/scripts typechecks, build and
  build preflight PASS. Site/app inline syntax 27/28 scripts PASS.

This source checkpoint precedes the production gates/cutover. No runtime deploy
or final Package 5 verdict is claimed here. The production remediation must
pass server artifact/config/schema/readiness gates, then deploy the bounded
backend/Python/PHP/caller candidate, verify read-only and restart the complete
13-family final gate. No real consent/trial/onboarding/provider smoke mutations.
No Wave 7, Chapter 7, or automatic Chapter 6 completion. Historical 17 local
DBs are outside ownership and untouched.
