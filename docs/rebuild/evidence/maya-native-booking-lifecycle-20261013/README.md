# Native booking lifecycle — 2026-10-13

**LOCAL SYNTHETIC PASS**, exact executable candidate `374965c53c46faea7a4b1bc85ea70d98864f6825`.
Branch: `codex/maya-local-crm-setup-20261010`. This is development evidence, not a release certificate or real salon acceptance.

## What changed

The existing exact booking-followup browser proof gained an explicit `--native-followup` option. It uses the current React build, real HTTP/AppModule/authentication/Client/Action Engine, native `YclientsCRMAdapter` serialization/parsing, and finite in-process provider responses backed by a test-only PostgreSQL ledger. No new product endpoint, writer, entitlement policy, schema, carrier behavior or UI design was added.

The existing internal-calendar variant remains independently runnable and passed again on the same SHA. Native setup uses the canonical CRM connect/activate HTTP owners with CAS in a new disposable database. Synthetic fixture entitlements are confined to that database and do not qualify the owner's retained database for grants.

## Fresh proof

| Surface | Result |
| --- | --- |
| React → native adapter → test provider create/move/cancel → second login | 11/11 checkpoints PASS |
| Same lifecycle through internal calendar, same SHA | 11/11 checkpoints PASS |
| Parallel consumed confirmation replays after each native operation | 9/9 refused as `expired`; no new AE or provider action |
| Native provider ledger | One record ID; one POST, one PUT, one DELETE; final canceled |
| Maya identity/state | One Appointment identity, exact Client and branch, three SUCCEEDED AE executions with one attempt each |
| Visible confirmations | Service/staff names and branch-local 17:00 → 17:30; canonical success text for each operation |
| Browser transport | Four chat turns, six accepted UI intents, two canonical synthetic-email logins per run; forbidden external browser requests 0 |
| Cleanup/source pinning | Both browser children closed, both servers closed, both owned PG clusters stopped, candidate/source hashes unchanged |
| Widget-live TypeScript and scoped lint | PASS |
| Existing AR-1 boundary tests | Selected 6 PASS / 0 FAIL; 24 unselected, not a complete AR-1 suite |

The model decisions, calendar/provider data, credentials and proof actors are synthetic. No user visits or keys were loaded into these tests. The browser drives the real UI without replacing its booking semantics. The provider ledger is test infrastructure, not a second product appointment writer.

## Failed attempt and correction

At `396df1a7`, the lifecycle test itself passed, but generic fixture cleanup tried to delete an imported Staff row while its Appointment still referenced it. The suite was correctly marked failed, and the owned Jest process was explicitly terminated so the outer driver could stop its PG. That receipt is preserved and does not substitute for the final pass.

At `374965c53c46faea7a4b1bc85ea70d98864f6825`, native proof rows remain in their private stopped test cluster and application/database pools close in `finally`. Shared fixtures and product code were not changed. The complete fresh native and internal runs both exited successfully without increasing timeouts.

## Actual remaining boundary

The successful real history check on `ccd8ad91` remains valid for its two questions; it does not admit booking. The current local history runtime is read-only, trial does not grant `widgets.runtime`, and production single-operator AR-1 V2 cannot be relabelled as staging. Current code and six selected tests confirm this boundary.

The exact implementation-only choice is in [LOCAL-BOOKING-ADMISSION-DECISION.md](LOCAL-BOOKING-ADMISSION-DECISION.md). It proposes continuing the existing AR-1 mechanism, not a founder bypass or parallel engine. It has not been approved or implemented in this checkpoint. Current platform credentials/signing availability has not been reverified.

This test uses a synthetic verified CLIENT. A real owner's already verified personal context still needs the eventual exact combined acceptance; success here is not a claim that TENANT_OWNER acquired Client authority. Fresh release admission, bounded provider/model authorization and the owner's exact selections remain required before the first real booking.

## Evidence and reproduction

[Allowlisted results](summary.json), [raw artifact hashes](raw-manifest.json). Raw browser/auth/PG artifacts remain outside Git; no database dump, real secret or customer export is committed.

From `maya-saas-backend` on the committed source, choose fresh absolute output directories:

```sh
node scripts/booking-confirmation-proof.mjs --run --browser-only --exact-followup --native-followup --output=/private/tmp/maya-native-booking-new
node scripts/booking-confirmation-proof.mjs --run --browser-only --exact-followup --output=/private/tmp/maya-internal-booking-new
```

These commands create their own guarded test clusters, migrate only those clusters, build current React and stop their services. They never resume the owner's saved database or obtain saved provider keys.

Production effects, real YCLIENTS effects, model spending, real-tenant grant changes, iPhone installation: **0**. Full certification: **NOT ISSUED**. HANDOFF remains STOP.
