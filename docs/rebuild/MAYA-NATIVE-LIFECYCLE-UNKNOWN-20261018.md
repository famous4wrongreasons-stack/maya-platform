# Native move/cancel after a lost provider response — 2026-10-18

**LOCAL DIAGNOSTIC EVIDENCE. NOT RELEASE CERTIFICATION OR SERVER EXECUTION AUTHORIZATION.**

Application candidate: `6356db1875545337e34b6c8888b7ca858bb64361`.
Profile: `closed-input.no-handoff.no-price-goods@1`.
Parent tooling checkpoint: `598a6db3723572bafe945d571a29782c11ce5ad8`.

This follows [canonical AR-1/native integration](MAYA-NATIVE-AR1-INTEGRATION-20261018.md)
and closes its specifically identified missing **move/cancel UNKNOWN Action Engine
reconciliation proof**, on isolated synthetic data. The original checkpoint and
its narrower claims remain historical evidence.

Only the diagnostic runner and probe change. Product backend, identity, Action
Engine, runtime, carrier, schema and native egress implementation are unchanged.
The existing 1,333 owner-deleted files remain deleted and unstaged.

## Actual failure and canonical behavior

Each new scenario starts with the existing signed AR-1 HTTP admission, then the
ordinary AChat/widget selection and confirmation create one synthetic booking.
Reschedule/cancel go through the existing authenticated appointment HTTP owner,
current verified personal-client checks and the real Action Engine.

The provider executes an actual PostgreSQL UPDATE and awaits its autocommit
acknowledgement. It then destroys the TCP socket **before sending any response**.
The native adapter receives a real transport failure, not a test-authored UNKNOWN
exception. No provider idempotency or uniqueness guard conceals duplicate effects.

The existing CRM owner uses the captured provider and exact record to reconcile.
The test selects whether that actual GET returns the persisted record or HTTP 503.
No reconciliation result, Action Engine state, clock or authority decision is mocked.

| Operation | Exact-record read | Execution attempt | Final Action Engine state | Local appointment |
| --- | --- | --- | --- | --- |
| Time-only move | Available | UNKNOWN | SUCCEEDED / RESOLVED | New start persisted after readback |
| Time-only move | Unavailable | UNKNOWN | UNKNOWN / MANUAL_REQUIRED after bounded retries | Previous start retained |
| Cancel | Available | UNKNOWN | SUCCEEDED / RESOLVED | Canceled after readback |
| Cancel | Unavailable | UNKNOWN | UNKNOWN / MANUAL_REQUIRED after bounded retries | Previous confirmed status retained |

In the unavailable cases the first HTTP response is 503 with `crm_outcome_unknown`;
retries do not report success. The provider's change is real within the test
database, but the local mirror is not advanced without evidence. The resolved
cases return 201 only after canonical readback proves the effect.

Each case issues one normal and six concurrent same-operation HTTP retries.
There is exactly one target ActionExecution and one EXECUTION attempt, one provider
create and one target PUT or DELETE. The proxy records only the original socket
failure, with no additional quota refusal masking an Action Engine redispatch.
Its uncertain-write lock remains closed even after a successful readback.

## Fresh verification

Final baseline: **10 PASS / 0 FAIL / 0 SKIP**, including the previous six cases:
healthy native create/move/cancel, create UNKNOWN and four AR-1 invalidations
(revoke, allowlist removal, candidate replacement and real expiry).

Exact results, source hashes and safe small artifacts are recorded in
[RECEIPT.json](evidence/maya-native-lifecycle-unknown-20261018/RECEIPT.json).
The runner rejects missing cases, skips, wrong attempt classification, duplicate
provider effects, a failed healthy control, source changes or failed database cleanup.

The counterfactual changes only a disposable copy of the native egress: an actual
post-dispatch socket loss is converted into a fabricated definite HTTP 403.
The unchanged assertions must reject that result after verifying the provider
already persisted the effect. This is one targeted transport mutation, not the
complete product mutation corpus.

Result: **5 expected failures detected, 5 controls pass, 0 skipped**. The original
create-loss case and all four move/cancel cases reject `FAILED / crm_provider_rejected`
in place of UNKNOWN. Each new case independently records one persisted provider
change before its assertion fails. Healthy lifecycle and all four AR-1 refusal
controls remain green. Type checking passed in both final runs; all owned test
clusters stopped and application hashes remained unchanged.

The observation collector now labels each additional synthetic company separately.
Previously, its summary dictionary labelled every non-healthy proxy `socketLoss`,
so later scenarios overwrote that summary entry. Per-case assertions were already
separate. The corrected final receipt preserves the original create-loss snapshot
and all four new lifecycle snapshots without collisions.

## Reproduction and boundaries

```sh
node maya-saas-backend/scripts/native-provider-socket-proof.mjs --run \
  --source /absolute/path/to/verified-6356-backend-export \
  --repository /absolute/path/to/development/repository \
  --output /absolute/path/to/new-output \
  --create-egress --lifecycle-ae --release-admission --lifecycle-loss-ae

# Separate fresh output, same flags, plus:
# --counterfactual proxy-definite-outcome
```

All child processes are fenced to OS loopback networking. Every run gets its own
fresh guarded PostgreSQL database. Private signing keys and certificates are
artificial test authority; private keys remain in memory and are not archived.
The runner compares the application export to the exact Git candidate and checks
its bytes again after execution. No deleted source is restored.

Canonical widget entitlement admission is exercised, but the egress's external
execution-admission callback remains **explicitly synthetic**. A bound JSON digest
is not an authorization issuer. No real operator/secret/ledger/network deployment
path has been installed by this proof.

Follow-up actions here use canonical HTTP owners, not fresh widget/carrier/iPhone
acceptance. Ordinary bounded AiCore transport and final combined native widget
lifecycle remain open. So do real operator/transport wiring, server pre-state and
rollback verification, and separate execution authorization before external effects.

The interrupted V6 full mutation run still has no verifiable final receipt.
This focused proof does not replace complete certification or issue a certificate.

Beget/production changes, real provider/model calls, owner-database or Keychain
access, and iPhone changes: **0**. Migration/grant writes occur only in disposable
test databases. No push is performed in this unit.
