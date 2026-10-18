# Native booking lifecycle with canonical AR-1 — 2026-10-18

**LOCAL DIAGNOSTIC PROOF. NOT A RELEASE CERTIFICATE OR SERVER EXECUTION AUTHORIZATION.**

Application candidate: `6356db1875545337e34b6c8888b7ca858bb64361`.
Profile: `closed-input.no-handoff.no-price-goods@1`.
Parent tooling checkpoint: `c01bff0d1848a23b0872ec9778cb63fc6d202593`.

This follows [native lifecycle transport preparation](MAYA-NATIVE-LIFECYCLE-EGRESS-20261018.md).
Only the diagnostic runner and probe change. Application backend, runtime, carrier,
schema, model selection and the operational transport are unchanged.

## What this adds

The opt-in `--release-admission` run exercises the existing AR-1 production
single-operator contract on a freshly created, guarded loopback PostgreSQL
database, with ephemeral artificial signing authority. No actual platform operator,
production trust, owner database or external service is involved.

The ordinary fixture initially creates its historical widget entitlement. The
probe removes that row before any widget request, then obtains the new grant
only through the canonical platform HTTP controller. The probe does not override
the release writer, policy, access service, guards, audit, clocks or Action Engine.

A genuine global platform session is created through the existing login route.
The artificial certificate binds the exact application candidate and fixed
profile. Its evidence remains explicitly synthetic: these tests qualify the
admission mechanism, not the actual release threshold.

For every scenario, the probe checks:

- dry-run does not make the release effective;
- forged signature, client session, tenant-owner session and a signature scoped
  to another existing tenant cannot grant;
- signed grant is recorded by the canonical atomic writer with its AuditLog receipt;
- effective view has the expected profile and certificate digest;
- the receipt explicitly declares single-operator governance, no reviewer and
  `independentHumanReview: false`;
- replay of the grant does not add a second release audit.

## Fresh evidence

See [structured receipt](evidence/maya-native-ar1-20261018/RECEIPT.json).
Final counts: **6 PASS / 0 FAIL / 0 SKIP**; the counterfactual detects exactly
one expected failure with five passing controls; historical-mode regression:
**2 PASS / 0 FAIL / 0 SKIP**. Exact executed runner/probe hashes are recorded there.

1. Signed grant → ordinary synthetic AChat → native catalog/availability →
   canonical widget confirmation → one native create → canonical authenticated
   reschedule → cancel. The Action Engine records one successful attempt for
   each operation. Normal and six concurrent retries of both follow-ups produce
   no extra provider mutation.
2. With the same actual AR-1 admission, the provider commits create and loses its
   response. The native adapter and Action Engine naturally report UNKNOWN;
   normal and six concurrent confirmations do not duplicate it. Failed provider
   reconciliation stays safely pending.
3. A real, previously minted confirmation is refused after canonical revoke.
4. The same refusal holds after removal of the exact tenant from the allowlist.
5. The same refusal holds after replacement of the configured running candidate.
6. The same refusal holds after actual grant expiry, using real application and
   database clocks. No clock substitution or entitlement-row tampering is used.

Each negative asserts zero provider POSTs, zero provider bookings, zero action
executions, zero local appointments and zero proxy refusals. Thus the transport's
quota cannot conceal an attempted forbidden dispatch. Canonical revoke remains
available after allowlist removal, candidate replacement and expiry. Replaying
an original grant cannot reactivate the revoked entitlement.

The counterfactual deliberately skips the revoke operation in a test-only
scenario. The old valid confirmation then reaches the provider exactly once,
and precisely that refusal test must fail while the other five pass. This proves
the negative is sensitive to the missing invalidation. It is a harness
counterfactual, **not** a complete mutation corpus or a product-code mutation.

The prior lifecycle mode without `--release-admission` is also rerun to check
runner compatibility. Its fixture admission remains explicitly weaker and is
not substituted for the new proof.

## Reproduction

Use the small, exact Git-object-verified backend export and a fresh output
directory for each invocation. The runner verifies all product bytes before
and after execution and applies migrations only to its own disposable database.

```sh
node maya-saas-backend/scripts/native-provider-socket-proof.mjs --run \
  --source /absolute/path/to/verified-6356-backend-export \
  --repository /absolute/path/to/development/repository \
  --output /absolute/path/to/new-output \
  --create-egress --lifecycle-ae --release-admission
```

For the separate counterfactual run, add `--counterfactual skip-revoke`.
For the historical-mode regression, omit `--release-admission`.

Every child process runs under the OS loopback-only network fence. The native
adapter uses real HTTP and test-provider PostgreSQL persistence; only destination,
credentials and model interpretation are synthetic. Signing private keys remain
ephemeral in the test process and are neither exported nor archived.

## Remaining boundary

This closes the **synthetic canonical widget-admission integration proof**.
It does not install a real external-effects admission bridge. The native egress
module still uses a separately labelled synthetic `assertCurrent` callback;
binding its scope to an authorization digest alone is not authority. No new
release engine, issuer, public endpoint or executor has been added.

The positive move/cancel path uses the canonical authenticated HTTP owners;
this run is not widget/carrier/iPhone acceptance of those follow-ups. Their
post-dispatch UNKNOWN reconciliation still needs the combined owner-level proof.
Only create-UNKNOWN is exercised through the Action Engine in this unit.

Ordinary bounded AiCore transport, real operator/transport wiring, final combined
native widget lifecycle and the interrupted full release certification remain
open. The V6 full mutation run still has no verifiable final result. No certificate,
production readiness or phone readiness is inherited or issued here.

Beget/production changes, real provider/model calls, Keychain/owner database
access and iPhone changes: **0**. Grants and migration writes occur only in the
fresh disposable proof databases. The owner's 1,333 intentional deletions remain
untouched and unstaged. No Git push is performed by this unit.
