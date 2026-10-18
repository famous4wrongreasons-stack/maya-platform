# Native create transport preparation — 2026-10-18

**IMPLEMENTED AND LOCALLY PROVEN; NOT CONNECTED TO A SERVER; NOT EXECUTION READY.**

Application candidate remains `6356db1875545337e34b6c8888b7ca858bb64361`, profile
`closed-input.no-handoff.no-price-goods@1`. No product, runtime, carrier, schema,
grant or model selection was changed. This is an operational network restriction
for that candidate, not a new CRM adapter, booking owner or AR-1 engine.

## Concrete change

The historical phone catalogue sidecar permits reads only. A write-capable
transport cannot reuse its error handling unchanged: fabricating HTTP 403 after
a provider has committed would turn an uncertain result into a definite failure.

`phone-native-create-egress.mjs` implements a fixed **personal create-only**
transport component. It preserves the ordinary adapter's method, body and genuine
provider response. Native `Client → confirmation → Action Engine → CRM adapter`
authority is unchanged. It never edits client identity, confirms a booking,
creates an entitlement, or performs a retry.

- Exact candidate/profile, tenant label, company and credential digest; finite
  execution-authorization digest and at most a 30-minute scope.
- One create attempt and at most 256 reads; limits are transport ceilings, not a
  real execution authorization. Independent current admission is mandatory at
  construction and reread throughout dispatch/response. The callback must return
  synchronous `true`; missing, false, undefined and asynchronous results refuse.
- Exclusive private ledger creation, fsync before dispatch, no payload/credential
  storage. A prior ledger cannot be reopened even after a crash. Deletion or
  replacement stops access; ledger failure poisons the run before network dispatch.
- Existing finite catalogue reads, native one-day availability, and only the
  exact post-create contact lookup used by reconciliation. It does not admit a
  customer registry export, arbitrary search, broad appointment/history read,
  admin/guest booking, reschedule or cancellation.
- Exactly one native personal appointment per payload; SMS/email flags must be
  zero. Prices, goods operations, HANDOFF and unlisted methods/routes refuse.
  The native adapter's local datetime is passed unchanged; the canonical booking
  owner remains responsible for branch timezone semantics.
- Fixed official HTTPS upstream, redirects refused, finite request/response sizes,
  timeout, concurrent-request ceiling and cancellation on revoke/client close.
  Cookies, forwarding headers and upstream cookies/redirect destinations are not
  propagated. Genuine provider JSON statuses/bodies remain unchanged.
- After a create may have crossed the dispatch boundary, transport loss, partial
  or invalid response, size overflow, redirect, expiry and revocation close the
  socket. They do not invent a definite provider rejection or success.

This component intentionally has **no executable entrypoint**, credential loader,
server Compose change or real authorization issuer. The native integration proof
supplies a clearly synthetic admission callback. A scope JSON, credential digest,
tenant label or callback stub is not evidence of platform authority. Tenant-owner
login never substitutes for platform execution authority.

## Fresh executed results

| Surface | Result |
| --- | --- |
| Transport unit/adversarial tests | 38 PASS, 0 FAIL, 0 SKIP |
| Ordinary AChat → selection → availability → confirmation → Action Engine → native adapter → transport → loopback HTTP/PG provider | 2 PASS, 0 FAIL, 0 SKIP |
| Same diagnostic without transport (regression) | 2 PASS, 0 FAIL, 0 SKIP |
| Counterfactual: proxy fabricates 403 after provider commit and socket loss | Detected: healthy case passes, uncertainty case fails exactly as expected |

The healthy case persists one provider row and succeeds. The fault case persists
one provider row, destroys the provider socket before response, and reaches Maya
as `UNKNOWN` / `crm_outcome_unknown`. One normal plus six concurrent confirmation
retries retain one Action Engine attempt and one provider booking, with no false
success. Reconciliation receives a real test-provider 503 and remains safely pending.

The proxy's one-create budget does not mask a retry bug: the test separately
requires no additional proxy refusal from those retries. Its only refusal is the
original socket loss. The direct regression also has no proxy budget, provider
idempotency or uniqueness constraint to hide duplicate POSTs.

The counterfactual modifies only a copied diagnostic proxy. It produces exactly
one persisted provider row but a FAILED Action Engine attempt with
`crm_provider_rejected`; the unchanged healthy control still passes. This proves
the check distinguishes transport uncertainty from a manufactured definite result.

No fetch or native CRM operation is mocked in the integration proof. Test-only
destination substitution forwards through real loopback HTTP and real synthetic
PostgreSQL; response body streams and network failures are preserved. Model
interpretation and execution admission are synthetic. The OS blocks non-loopback
outbound traffic for the test process. Both disposable clusters were stopped and
the frozen application hashes remained unchanged.

First integration attempt `native-01` refused before dispatch because the new
transport expected an offset suffix that the existing native adapter deliberately
does not send. `appointmentInstantForProvider` supplies branch-local
`YYYY-MM-DDTHH:mm:ss`. Only the new transport validator/test fixture was corrected;
the adapter and canonical timezone conversion were not changed. Final receipts
come from `native-final`, `direct-regression`, and `proxy-counterfactual-01`.

Evidence and exact tooling hashes: [RECEIPT.json](evidence/maya-create-egress-20261018/RECEIPT.json).
Raw synthetic databases and full logs remain local; no credentials or customer
data were copied into the repository. The previous direct proof and its original
receipts remain preserved in [the preceding checkpoint](MAYA-NATIVE-SOCKET-PROOF-20261018.md).

Reproduction uses the existing local runner, adding `--create-egress`:

```sh
node maya-saas-backend/scripts/native-provider-socket-proof.mjs --run \
  --source /absolute/path/to/verified-6356-backend-export \
  --repository /absolute/path/to/development/repository \
  --output /absolute/path/to/new-output \
  --create-egress

# Independent fresh output; deliberately wrong proxy uncertainty handling.
# Add --counterfactual proxy-definite-outcome to the command above.
```

## Exact remaining boundaries

1. Bind the component to the existing real platform execution admission, trusted
   artifact digest, isolated network topology and operator-owned ledger path.
   No real authorization was issued or consumed in this unit. Changing ledger
   paths/restarting with fabricated admission is not an authorized new run.
2. Implement/prove bounded AI transport compatible with ordinary AiCore. The
   historical wrapper's actor headers are absent from the ordinary model client;
   a shared provider Bearer token cannot be claimed as exact-user authority.
3. Qualify reschedule/cancel and bounded reconciliation record reads separately
   before enabling them. This create-only component currently refuses them.
4. Complete fresh full certification/admission. The interrupted V6 corpus has no
   verifiable final receipt and remains incomplete; these scoped tests do not
   replace it. No new release certificate is issued by this checkpoint.
5. Recheck actual server pre-state and rehearse the existing cutover/rollback plan,
   then obtain separate execution authorization before any real change/effect.

Beget/production changes, owner database access, Keychain access, real model calls,
real YCLIENTS effects, grants, migrations outside disposable test DBs and iPhone
changes: **0**. The owner's 1,333 intentional deletions were not restored/staged.
