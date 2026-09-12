# Maya identity + native consent integration

Scope: owner attachment 89e45bc3-6a47-43e4-9897-b4c4ab3ac508. Base a7389950
includes 7ef0e29f. Chapter 7 is preserved complete; Chapter 8 is not started.

## Result and boundary

One blue/cyan ribbon vector traced from the supplied mark drives 51 generated
SVG/PNG assets, native icon/launch artwork, login/header/avatar, chat thinking and
voice controls. The owner images govern the color; the prose “black” conflicts
with both supplied images, and optional clarification received no answer.
Tenant/business marks and historical recovery artifacts remain independent.
Android generated icon/splash resources are updated in the isolated native copy;
no Android release is claimed. No new dependency, backend runtime, schema,
migration, Client/consent fact or provider mutation is introduced.

The same renderer morphs mark → connected ribbon wave → mark. Thinking follows
actual pending state, not a duration. Recording consumes the existing WebAudio RMS
signal; the native recorder has no amplitude callback, so no fake amplitude or new
microphone owner is introduced. Reduced motion/hidden document produces a static
mark; unmount cancels the frame and listeners. Launch is finite. A launch-frame
termination defect found during visual QA was fixed and the actual transition,
return and reduced-motion states were observed.

## Exact consent 400 diagnosis

The connected device reports ru.mayaos.app 1.0 build 9. Its installed JavaScript
bytes and the historical individual failing HTTP request could not be extracted;
no claim is made that they were captured. A retained signed build-9 artifact has
public HTML SHA256 ed4c5e5a7c1f1e084a4a9469e354c50cbbf3219922131e751173af6a2d12f81d.
Its exact AConsentGate submit is retained without secrets in the regression fixture.
It sends POST `https://malesthetic.pro/app/api-proxy.php?action=consent_submit`,
Content-Type/application authentication headers from `__meAuthReq`, with
`accept_pdn:true, accept_marketing:<choice>` and **no idempotency_key**.

The deployed PHP helper hash is
267383a99603957efce1d515346a0c32760847f341e1f85181859384cd883c69.
Pure local/production-PHP function evaluation (no proxy/curl/provider call)
reproduces `explicit_consent_decisions_required`, mapped to HTTP400
`invalid_client_command` **before authentication, Client resolution or any effect**.
The equivalent keyed transport passes validation. This establishes the concrete
saved-build integration defect, not an invented historical request/server trace.
No raw credentials, auth headers or production Client identities were recorded.

The isolated current native checkout also had a stale profile PATCH integration;
it is replaced by the certified canonical PWA consumer. A second legacy
AConsentGate was still mounted in the canonical HTML and is now retired. Only
AMayaConsent is active. The VPS's single legacy shell mount delegates to the same
component. Its shell mode is presentation only, never Client authority.

Eligibility comes from authenticated `/client-channel/status`, not profile rows.
Submission retains existing status/challenge/consume/consent owners and exact A18
provenance checks. The body uses privacy, marketing and durable idempotencyKey.
One tenant/account-scoped event is persisted before send, reused on retry/restart
and removed only on success. Privacy and optional marketing remain distinct.
No User/Profile/phone authority, keyless fallback, auto-created binding or
production invalidation/regrant is introduced.

## Proof

- Mandatory: 437 suites / 3664 tests PASS; targeted: 4 suites / 38 tests PASS.
- Existing PostgreSQL consent/security proof: 36 checks PASS, including exact
  provenance, matching User IDs with null canonical binding denial, revoked/wrong
  tenant/Client, supported no-Maya-User binding, grant/revoke/new grant, duplicate
  concurrency, immutable invalidation history and unrelated effective grants.
- Clean replay: 94 repository migrations into one new owned local cluster. The 17
  pre-existing databases were never used. No new migration or backfill.
- Browser checks: launch morph/return, reduced motion, real amplitude input,
  privacy required, marketing default off and both selections. Synthetic iOS
  WebView: privacy selected, marketing unselected, submit completes without 400.
- Actual iOS simulator and signed device builds PASS; source/synced/built canonical
  HTML equality is a release guard. The synthetic WebView proof bundle is separate
  and must never be deployed or installed on a user device.
- Lint, application/scripts typecheck, build, Prisma validation PASS.
- Production preflight: 0 pending, drift NONE, health/readiness PASS. Existing
  R01 finite relay check: 42 entries / 128 denied HEAD URLs PASS.

The former preview-only string-order assertion was replaced by executable cases
showing a read-only canonical status read and zero mutations, with both unlinked
and linked contexts. It no longer treats profile row existence as consent. One
unchanged R02 HTTP test encountered a transient socket hang up; its targeted rerun
and the complete unchanged gate passed. No timeout/guard/configuration relaxation.

## Release

The active VPS PWA is a distinct certified variant, not the native bundle.
`overlay-production.cjs` pins its prior hash and changes only identity, consent,
thinking/voice and launch presentation, retaining C7 consumer behavior. The
candidate parses 27 scripts and passes the existing C7 guard. Eight exact static
artifacts are listed in `release-manifest.json`; publication preserves private
backups and activates HTML last. Beget maintenance pages, both PWA backups and
all PHP are outside the release. Backend remains 20260912-c7-p06-4058cd8c.

Production publication and native installation are recorded separately after
post-release verification. Production consent/business/provider/message proof
mutations remain zero. A real user's consent must remain their own decision.
