# Native time-move/cancel transport — 2026-10-18

**LOCAL PREPARATION PASSED. NOT CONNECTED TO BEGET. NOT RELEASE CERTIFICATION.**

Application candidate: `6356db1875545337e34b6c8888b7ca858bb64361`.
Profile: `closed-input.no-handoff.no-price-goods@1`.
Starting tooling checkpoint: `71df972014e11f781b44a05c4620441c67ef1725`.

This extends the operational transport introduced in
[MAYA-NATIVE-CREATE-EGRESS-20261018.md](MAYA-NATIVE-CREATE-EGRESS-20261018.md).
That checkpoint and its original receipts remain historical evidence. Product
backend, Client Identity, Action Engine, runtime, carrier, schema, model selection
and grants were not changed. The execution export was compared with exact Git
objects before and after each integration run. No deleted source was restored.

## Implemented contract

`phone-native-create-egress.mjs` keeps V1 create-only. Fixed V2
`maya.phone-native-create-egress/2` adds **at most one time-only reschedule and one
cancel of the record successfully created by this same run**. It is not a generic
provider proxy, booking owner or alternative release engine.

- V2 requires the existing exact candidate/profile/tenant/company/credential and
  execution-authorization digest scope, current independent admission, a maximum
  30-minute window and fixed ceilings `maxCreates=1`, `maxReschedules=1`,
  `maxCancels=1`. V1 rejects these extra scope fields.
- No caller supplies the provider record ID in scope. Only an explicit positive
  `record_id` in the exact single successful create receipt binds the record.
  The request's echoed `appointments[].id` is not that evidence. An ambiguous
  receipt after dispatch becomes transport uncertainty, without a writable ID.
- Reads and writes of other records/companies, broad journals, price/goods
  endpoints, HANDOFF and unlisted routes remain refused.
- Exact-record GET supports the existing native owner's read. A move needs a
  matching successful response less than 60 seconds old. This narrower transport
  freshness ceiling does not replace canonical current-authority/source checks.
  The response ID and canonical-format phone must correlate with the created
  record. This is transport correlation, not authority inferred from a phone.
- PUT preserves the native serializer's client, service, master, duration, cost,
  original cost, discount, attendance and comment. Only datetime may differ.
  `save_if_busy=false` and `send_sms=false` remain mandatory. The selected target
  must still pass canonical availability and Action Engine checks. No new time
  interpretation or availability resolver was introduced here.
- DELETE has no body and targets only the bound record. Genuine JSON responses
  and genuine empty HTTP 204 cancellations are passed through.
- Every dispatch reservation is fsynced before network I/O. Concurrent operations
  cannot reorder a move/cancel. A slow older GET cannot restore a superseded read.
  No ledger reopening, quota reset, retry or automatic renewal is provided.
- Any post-dispatch transport/body/expiry/revocation failure closes the downstream
  socket instead of manufacturing a definite provider refusal. A possibly applied
  move/cancel blocks further writes in this run. Exact-record reads may remain
  available, but they do not automatically unlock another mutation.

The narrow time-only restriction deliberately excludes changing master/service
or a noncanonical provider phone representation in this operational component.
It does not change the broader backend product contract. The existing native
adapter sends local `YYYY-MM-DDTHH:mm:ss`, after canonical timezone conversion;
those bytes are preserved.

**Real authority is not installed.** This module still has no executable entrypoint,
secret loader, Compose wiring or authorization issuer. Tests supply a clearly
synthetic admission callback. A JSON scope, label, digest or callback stub never
constitutes platform execution authorization. Tenant-owner login is not platform
authority. No first-phone execution has been authorized or performed by this unit.

## Fresh executed evidence

| Surface | Final result | Precisely established |
| --- | --- | --- |
| Unit/adversarial suite | 90 PASS, 0 FAIL, 0 SKIP | V1 regression plus V2 scope, record/body substitution, preservation, replay/concurrency, expiry/revoke, durable reservation and exclusions |
| Unit mutations | 5/5 detected with green baseline | Removing preservation, read freshness, explicit receipt identity, uncertainty transport or uncertain-write refusal is detected; healthy control remains green |
| Native lifecycle wire, real loopback sockets and private PG provider | 3 PASS | Healthy create → PUT → DELETE; durable PUT then socket loss; durable DELETE then socket loss |
| Native lifecycle counterfactual | Correctly detected | Fabricated post-dispatch 403 makes exactly the two loss cases fail; healthy control passes |
| Canonical HTTP / Action Engine integration | 2 PASS | Ordinary synthetic AChat booking selection/confirmation creates one record; canonical authenticated HTTP reschedules/cancels the same record; original create-UNKNOWN/retry case remains green |

For healthy integration, all three canonical Action Engine executions are
`SUCCEEDED`, each with one attempt. One normal and six concurrent HTTP retries of
both the move and cancellation leave **one POST, one PUT, one DELETE** and one local
Appointment. The proxy receives no extra refused mutation attempt that could hide
an Action Engine redispatch. Client/service/master/price preservation was checked
against the actual frozen native serializer, not a replacement CRM implementation.

For the two move/cancel fault cases, the test provider commits a real PostgreSQL
change, then destroys its socket before replying. The unmodified native adapter
raises `CrmOutcomeUnknownError`. Normal/concurrent direct-adapter retries are
refused by the transport and do not add effects. The provider has no idempotency
or uniqueness rule masking repeated effects. **These loss cases qualify the
adapter/transport boundary; they do not newly prove the Action Engine's whole
move/cancel UNKNOWN reconciliation flow.** The create-UNKNOWN Action Engine proof
is separately executed in the integration suite.

The positive create begins at canonical AChat/widget confirmation. Positive
reschedule/cancel use the existing authenticated HTTP owners and Action Engine.
**This is not a fresh reschedule/cancel widget, browser or iPhone acceptance.**
No model calls occur; initial interpretation and platform admission are synthetic.
Native fetch and adapter operations are not mocked. A test destination substitution
forwards native bytes/streams to actual loopback HTTP. OS sandboxing denies
non-loopback network traffic. Every owned test cluster was stopped.

Exact source/runner/test hashes and small safe receipts:
[evidence/maya-native-lifecycle-20261018/RECEIPT.json](evidence/maya-native-lifecycle-20261018/RECEIPT.json).
Full synthetic logs and counterfactual copies are local and indexed by hash. Raw
provider databases are disposable evidence infrastructure, not application data.

Reproduction, using a fresh output directory per command:

```sh
node maya-saas-backend/scripts/phone-native-create-egress-mutation.mjs \
  --run --output /absolute/path/to/new-unit-output

node maya-saas-backend/scripts/native-provider-socket-proof.mjs --run \
  --source /absolute/path/to/verified-6356-backend-export \
  --repository /absolute/path/to/development/repository \
  --output /absolute/path/to/new-wire-output --create-egress --lifecycle-wire

# Separate fresh output: add --counterfactual proxy-definite-outcome above.
# Separate fresh output: replace --lifecycle-wire with --lifecycle-ae for
# canonical HTTP/Action Engine integration; it also executes create-UNKNOWN.
```

## Remaining work before another phone/server rollout

1. Connect this component to the existing real platform execution admission,
   operator-owned ledger, trusted artifact digest and isolated network topology.
2. Finish bounded ordinary AiCore transport. The historical wrapper's actor headers
   are absent from the ordinary client; a shared provider Bearer token is not
   proof of the exact acting user. No model switch or paid call is authorized here.
3. Run the combined native widget lifecycle and move/cancel UNKNOWN reconciliation
   through the final transport/admission wiring. Broad history/registry reads and
   arbitrary provider-record recovery are still outside this component's scope.
4. Complete fresh full release admission/certification. The interrupted V6 full
   mutation run has no verifiable final receipt and remains incomplete. These
   focused proofs do not replace it or issue a release certificate.
5. Verify actual server pre-state and rollback readiness; obtain separate bounded
   execution authorization before a server change, grant or real business effect.

Beget/production changes, real provider/model calls, Keychain/owner database access,
iPhone changes, grants and migrations outside disposable test databases: **0**.
The owner's **1,333 intentional deletions** remain untouched and unstaged.
No Git push was performed in this unit.
