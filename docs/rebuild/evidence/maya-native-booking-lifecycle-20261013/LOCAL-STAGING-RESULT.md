# Local single-operator AR-1: implementation PASS, 2026-10-13

Approved Option A is implemented in the existing AR-1 writer. Tested committed
candidate: `98761bc69af8ccd38341336201a96123cfda3930`, branch
`codex/maya-local-crm-setup-20261010`. Implementation commit `11b84c48`;
`98761bc6` corrects mutation expressions only. Pre-change checkpoint `cc413bf7`
is preserved. No merge, push, deployment or real execution was performed.

## Fresh results

| Surface | Result |
| --- | --- |
| Entitlements unit suites, including staging, production V1/V2 and legacy | 241 PASS |
| New local staging: real AppModule/HTTP/PostgreSQL and compiled binaries | 17 PASS |
| Preserved production V1/V2 and legacy HTTP/binary suites | 34 PASS |
| Offline operator configuration and compiled-command checks | 39 PASS |
| Refusal-code coverage | 13 PASS |
| Backend types, widgets-live types, scoped ESLint | PASS |
| Targeted counterfactuals | 17/17 killed by named test assertions |
| Unmutated and restored controls | Each: 241 unit + 51 HTTP/binary PASS |

The mutation run used a Git archive of the exact committed candidate, not the
working tree. It detected 14 new scoped faults and re-proved the adapted
production mutations SO-M6, SO-M7 and PU-M9. Original test files remained
unchanged inside every mutant. No timeout, compiler error or test-load failure
was credited as a behavioral kill. All nine owned clusters in the successful
corpus stopped; their `postmaster.pid` files are absent. There were no real
provider/model calls, owner data or real signing credentials in these tests.

## What is established

- New staging execution requires its own signed contract, trust namespace,
  exact tenant allowlist, global platform User/session and matching certificate,
  candidate, freshly reread build bytes and fixed profile.
- Production V1/V2 authorization parsing was not broadened; its parser function
  body matches the pre-change checkpoint byte for byte. Synthetic fixture grant
  eligibility is unchanged. The new staging-named proof DB cannot use it.
- Missing disclosure, fabricated/self-reviewer, forged/missing signatures,
  foreign tenant/environment/profile/candidate, wrong certificate, expired or
  not-yet-valid authorization, changed bytes and removed trust are refused.
- No grant from a plan/full trial or tenant-owner session. Two concurrent
  consumes of the same authorization yield one grant/audit; different
  authorizations with the same CAS cannot both win. Audit errors or silent audit
  omission roll back the entitlement. Historical receipt replay never reapplies
  a revoked grant.
- After revoke and a fresh re-grant, an old widget remains refused at Gate 6:
  HTTP 200 with `outcome=refuse`, `code=insufficient_authority`,
  `stopped_at_gate=6`. No ActionExecution is created. While the entitlement is
  disabled, the earlier feature guard returns HTTP 403.
- Legacy staging and new staging authorizations cannot revoke one another's
  grant lineage. Revoke remains available after allowlist removal, certificate
  expiry and candidate replacement using fresh valid authority for the exact
  stored release. Two processes running the compiled artifact observe grant/revoke/expiry.
- HANDOFF remains unavailable through the existing profile owners. No Client,
  booking, Action Engine, headless chat runtime, carrier, visual or product schema files changed.

## Failed attempts retained

1. Initial staging proof: the new plan fixture used `plan` instead of the actual
   `subscriptionPlan` delegate. Fixture corrected; no product change for this.
2. Extended old-token proof initially expected HTTP 403 after re-grant. Existing
   canonical gateway contract returns HTTP 200 carrying a Gate 6 refusal. The
   test now asserts that exact refusal and zero actions instead of weakening the
   result to a transport-only check.
3. First mutation pass detected nine faults, then rejected an audit mutant that
   made TypeScript code unreachable and prevented a build. It did not count a
   successful corpus. Scoped, compilable audit-bypass expressions replaced it;
   the complete 17-mutant programme restarted from `98761bc6` and passed with
   fresh unmutated/restored controls.

Raw receipts remain local, with hashes and sizes in
`LOCAL-STAGING-RAW-MANIFEST.json`; repository-safe measured results and named
killers are in `LOCAL-STAGING-SUMMARY.json`. Do not use the failed or earlier
pre-commit attempts as final evidence.

## Boundary and next step

This is targeted implementation evidence, **not a new Maya release certificate**.
No prior certificate is inherited. Full release mutation/CI/FBE2E certification
was not run in this narrow unit. `CERTIFIED_FOR_PROFILE` was exercised only on
synthetic signed test fixtures, not issued for the actual candidate/owner salon.

Before a real local booking cycle: fresh exact-candidate release admission,
actual global platform session/operator-controlled signing, separately approved
private staging snapshot preserving identity/encryption lineage, and a bounded
real create/move/cancel permit with confirmations. Provider notification behavior
must be checked, particularly cancellation. The original salon DB and saved keys
were not opened or copied; no real grant, production migration, OTP, booking,
message, deploy, iPhone installation or C10 work occurred.

Later documentation-only commits do not change the tested backend/test bytes.
They do not create or renew a certificate for any different SHA.

## Subsequent local preflight

The [2026-10-13 preflight continuation](../maya-release-preflight-20261013/README.md)
records test/evidence-harness repairs and fresh broad baseline plus synthetic
native booking lifecycle results on `27c41025`. It preserves this implementation
checkpoint and its actual mutation provenance. Neither packet is a full release
certificate or permission for owner-data execution.

The [next fresh follow-up](../maya-release-ci-followup-20261013/README.md) re-proves
all 17 targeted staging counterfactuals on `a6d9c12d`, with green 241-unit and
51-HTTP/binary controls before and after. It also records full local CI, current
widgets/runtime, canonical packaging and the synthetic native lifecycle. The
original implementation receipt above retains its own candidate and provenance;
neither targeted packet is the complete release mutation programme.
