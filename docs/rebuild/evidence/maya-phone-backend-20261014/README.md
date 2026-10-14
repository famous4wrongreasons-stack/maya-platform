# First-phone backend preparation: actual binary and HTTPS

Executed 2026-10-14 on clean committed candidate
`87c0d3774ff3f67959ebfa2b502f3894cb3ffc4f`, branch
`codex/maya-local-crm-setup-20261010`. **50 scoped checkpoints PASS.**
This is local synthetic preparation, not a release certificate, public endpoint,
live AI/provider acceptance or iPhone installation.

## What was actually executed

The current Nest build's `dist/src/main.js` ran with its ordinary AppModule,
production configuration validation, HTTP guards and authentication. No Nest
test override, mock HTTP upstream, retained salon database or manual entitlement
writer was used. A new owned PostgreSQL 16 cluster replayed all 106 canonical migrations.
The migration-created `maya-os` bootstrap tenant remained; two additional full
trial businesses were created by the ordinary activation/signup HTTP owners.

The existing staging Caddy configuration was adapted only for the local topology:
loopback ports, current emitted React payload root, separate canonical OAuth
callback root and an ephemeral test TLS certificate. ACME and the admin listener
were disabled. Trust was passed to individual test requests; system and phone
trust stores were not modified. Untrusted TLS failed closed.

Backend networking used the existing `diagnosticSandboxPolicy`: its exact
listener and its exact new PostgreSQL port only. Kernel EPERM refusals were
executed for an external documentation address and a non-admitted local port.
No real provider credentials were loaded. The model's existing `safe` setting,
disabled external-login methods and scheduler settings remained in force.

| Surface | Fresh result | Boundary |
| --- | --- | --- |
| Clean schema replay and actual backend startup | PASS; startup 1029 ms | Fresh synthetic database only, not production migration |
| HTTPS health and DB readiness | PASS; health carries exact candidate SHA | Loopback only; SHA is corroborated by source/build hashes, not accepted from health alone |
| React payload and OAuth callback | 8 current payload files and separate canonical callback match | No native device test |
| Native CORS | `capacitor://localhost` preflight accepted; foreign browser origin gets no permission | CORS is not represented as server-side authorization |
| Anonymous access | Protected route returns 401 | Ordinary guards |
| Trial activation and password login | Both synthetic businesses PASS | No platform-owner fixture or credentials |
| Conversation, Inbox, retained reports, own tasks | Both tenants return bodies accepted by their current runtime projectors | Empty synthetic data, not populated business acceptance |
| Ideas / C8 valuations | **UNAVAILABLE_FOR_TRIAL**; exact current refusal proved | Not a successful Ideas read; see below |
| Tenant isolation | Different branches, wrong-tenant login refused, foreign conversation refused without creating B history | Two synthetic tenants, not scale qualification |
| Chat persistence | One deterministic withdrawal turn and its reply persisted only for A | Existing `Стоп, ничего не делай` path; no LLM-quality/booking claim |
| Session refresh and logout | Refresh works; conversation survives; revoked access and refresh tokens fail | Actual current session owner |
| Platform boundary | Both tenant owners refused platform metrics | No platform release authority granted |
| Effect boundary | 0 widget grants, 0 CRM integrations, 0 external provider effects | No AR-1 admission, SMS, YCLIENTS or paid model |
| Cleanup | Backend, gateway and PG stopped; all three listeners closed | Ephemeral TLS key and DB password files removed |

The HTTP checks completed with a maximum observed request time of 120 ms.
This small empty-database sample is not a performance or concurrency benchmark.
Canonical runtime projectors were bundled directly from the committed sources;
the proof did not invent permissive replacement response schemas.

## Initial failure and its disposition

The first run at `ada15e500a761dc83c7728e6872487c4de1f6005` stopped after
26 successful checks when the proof incorrectly required a 200 Ideas response
for an ordinary trial. Its receipt is preserved in `INITIAL-FAILURE.json`, with
the unchanged original's path and SHA256.

Source inspection established the precise current contract:
`MeasurementReadService.member` requires `membership.tenant.status === 'active'`.
`trialFullAccess` does not satisfy that check. The second run proved the exact
403 `measurement_membership_revoked` response for both ordinary trials. The
runtime maps 403 to its existing `forbidden` state.

Only the **proof expectation** changed in `87c0d377`; application code, trial
policy, roles and entitlements did not. This is not acceptance of complete Ideas
functionality. Showing Ideas to trial owners requires a separate scoped contract
decision; the prior trial-history setting decision did not authorize changing
measurement/C8 access. A first device smoke must report this section as unavailable.

## Evidence and reproducibility

- `RESULT.json`: full repository-safe executed result, source-file hashes,
  timings, statuses, build/gateway hashes and cleanup evidence.
- `INITIAL-FAILURE.json`: safe projection of the failed first run; no hidden waiver.
- `LOCAL-ARTIFACTS.json`: exact local artifact paths, sizes and hashes. Private
  scratch PG clusters and intermediate files are not repository artifacts.
- `FILES.json`: hashes of archived packet files.

With locked local dependencies, Node 22, PostgreSQL 16 and an explicitly verified
Caddy binary, run from the backend directory:

```sh
node scripts/phone-backend-proof.mjs --run \
  --out=/private/tmp/maya-phone-backend-unique-run \
  --caddy=/absolute/path/to/caddy
```

The command requires a fresh private directory and committed clean captured
source. It owns only its new database/processes and stops them on completion or
failure. It never accepts an existing database URL or real provider key. Its
default invocation is prepare-only. This command does not keep a phone server alive.

## Exact remaining first-device work

1. Select and authorize the network location for an isolated synthetic endpoint.
   The prepared choices are the Mac on the same Wi-Fi with explicit test TLS
   trust, or an existing separate test host with valid HTTPS. No network location
   or trust installation is presumed approved by this receipt.
2. Qualify that exact reachable endpoint, then build/sync/verify the Debug payload
   against that address and sign with the existing legitimate development identity.
3. Obtain the separate device-install authorization, install and run actual iOS
   WebView/keyboard/safe-area/background/session acceptance.
4. Live model, real salon data and booking remain a separate permission/admission
   boundary. This packet neither certifies nor opens them.

Product/backend/runtime/presentation sources are unchanged by this unit. This
closes real-binary loopback authentication/transport preparation; it does not mean
`READY FOR PRODUCTION`, `CERTIFIED_FOR_PROFILE` or `INSTALLED ON IPHONE`.
