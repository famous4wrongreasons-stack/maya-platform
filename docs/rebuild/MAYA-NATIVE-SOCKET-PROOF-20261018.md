# Native booking response-loss proof — 2026-10-18

Status: **local diagnostic PASS; NOT release certification or real booking acceptance**.
Application source remains `6356db1875545337e34b6c8888b7ca858bb64361`, with
`closed-input.no-handoff.no-price-goods@1`. The development parent is
`e0aaae75c06e4129f5ef48fd8f0db82432b1f101`. This unit adds only a test, its local
runner and evidence. No application, runtime, carrier, migration or profile bytes
were changed. HANDOFF remains excluded and globally STOP.

## What was executed

The ordinary `/api/ai/chat` owner interprets a finite synthetic booking request,
resolves the current branch, and emits its sealed service selector. Service and
staff selection use the existing HTTP widget gateway. The registered availability
read then supplies a slot; DRAFT creates canonical confirmation and COMMIT invokes
the existing Action Engine and native `YclientsCRMAdapter`.

The model interpretation is scripted; no model is called. The factory changes
only the adapter's destination and synthetic credentials. Native fetch, request
serialization, response parsing, CRM error classification and Action Engine
operations are not mocked. Existing fixture owners create synthetic client
verification and entitlement in a fresh disposable database; this does not prove
the real Telegram identity or AR-1 grant flow.

The provider is an actual loopback HTTP server with a PostgreSQL booking ledger.
Each POST inserts and commits a row using its own database transaction. It has
no payload uniqueness constraint or idempotency guard that could conceal a
second POST. In the fault case it destroys the TCP socket **after** that durable
COMMIT, before returning any HTTP response. The test does not manufacture an
UNKNOWN result. Its reconciliation endpoint returns a real HTTP 503, so absence
or success cannot be inferred from unavailable provider evidence.

Fresh final result: **2 tests passed, 0 failed, 0 skipped**.

| Case | Observed result |
| --- | --- |
| Healthy native request | One provider row, one Action Engine execution/attempt, SUCCEEDED and one local external appointment |
| Provider commits, response lost | One provider row; execution/attempt UNKNOWN; `crm_outcome_unknown` / `crm_provider_outcome_unknown` |
| One normal retry and six concurrent retries | Still one provider POST and one durable row; execution attempt count remains one |
| User-facing persisted widget outcome | SUBMITTED / result not confirmed; no success announcement |
| Unavailable reconciliation | Safely pending; no local appointment manufactured from UNKNOWN |

Both synthetic companies made 33 read requests; each made exactly one booking
POST. The fault company encountered exactly one socket loss and one reconciliation
attempt. Unexpected provider routes/contracts: zero. Real provider/model calls:
zero. The OS sandbox allowed outbound loopback only. Both test databases were
stopped; frozen source hashes were unchanged before/after.

## Counterfactual sensitivity

A separate test-only adapter copy changes just the native transport catch from
`CrmOutcomeUnknownError` to a definite `Error`. The healthy test still passes;
the response-loss test fails. The runner requires the exact observed regression:
one durable provider booking, one socket loss, one FAILED attempt classified
`crm_provider_rejected`. An unrelated failure cannot count as a detected mutation.

Final result: **counterfactual detected** (one expected failing test, one passing
control). The original application is never edited. Counterfactual observations
are explicitly labelled `TEST_COPY_NATIVE_TRANSPORT_CATCH_MUTATED`.

## Fixture diagnosis and provenance

Attempts `baseline-01` and `baseline-02` stopped before any booking POST. A direct
`catalog.services.read` returns an unscoped selector; the current booking owner
correctly refuses it when a configured branch exists (`booking_catalog_scope_required`).
The final test enters through ordinary chat so the existing owner supplies branch
scope. This is a test-fixture repair; the product refusal was not weakened.

The runner uses Node's real single realm instead of a Jest VM: native fetch errors
must share the production `Error` realm. It uses the existing HTTP/PG fixture
owners with `node:test`, `expect` and call-through harness spies. It refuses extra
source files/symlinks that could shadow verified TypeScript, compares every exported
Git blob, and pins the generated Prisma schema. Node 22.23.3 and fresh lockfile
dependencies were used. This diagnostic runner is not a replacement release gate.

The owner's intentionally deleted files were not restored. A 38 MB backend-only
Git export under the task's durable `outputs/execution-sources` supplies the
frozen bytes. No new Git worktree was created. Dependencies and synthetic PG data
remain outside Git; only small safe receipts are archived.

Evidence: [baseline](evidence/maya-native-socket-20261018/BASELINE.json),
[baseline observations](evidence/maya-native-socket-20261018/BASELINE-OBSERVATIONS.json),
[counterfactual](evidence/maya-native-socket-20261018/COUNTERFACTUAL.json),
[counterfactual observations](evidence/maya-native-socket-20261018/COUNTERFACTUAL-OBSERVATIONS.json),
[hash/provenance index](evidence/maya-native-socket-20261018/INDEX.json).

Reproduce on a Mac with PostgreSQL 16 and the exact Git source/dependencies:

```sh
node maya-saas-backend/scripts/native-provider-socket-proof.mjs --run \
  --repository /absolute/path/to/development/repository \
  --source /absolute/path/to/verified-6356-backend-export \
  --output /absolute/path/to/new-baseline-directory

# Same source, separate new output; mutates only a diagnostic overlay copy.
node maya-saas-backend/scripts/native-provider-socket-proof.mjs --run \
  --repository /absolute/path/to/development/repository \
  --source /absolute/path/to/verified-6356-backend-export \
  --output /absolute/path/to/new-counterfactual-directory \
  --counterfactual definite-outcome
```

## Current boundary and remaining work

The overnight full mutation run V6 has **no verifiable final result**. On Oct 18
its execution directory and manifest were absent and no mutation worker remained.
The cause of directory removal is not established. The Oct 17 cutover note's
"still running" statement describes the earlier observation only. See
[interruption record](evidence/maya-native-socket-20261018/CERTIFICATION-INTERRUPTION.json).
Historical or partial parts cannot substitute for a fresh complete run/admission.

This proof closes native transport response-loss classification and retry safety
on synthetic data. It does not prove real YCLIENTS acceptance, success via
reconciliation, a browser/iPhone interaction, bounded model/CRM deployment
transports, actual server pre-state, rollback on that server, or complete release
certification. Those remain necessary before the controlled phone cutover in
[the existing plan](MAYA-PHONE-CANONICAL-CUTOVER-20261017.md).

Production/Beget changes, owner database access, grants, real provider effects,
Keychain access, OTP/messages and iPhone changes in this unit: **zero**.
