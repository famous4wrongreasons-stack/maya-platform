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

## Final delivery

- Implementation b6b9c5ae; visual proof b70f761c, both pushed before publication.
- VPS static publication and exact post-hash verification: PASS, eight artifacts.
  Current app SHA256: 59bd3301dc16ae6f16828a8def6ed1d3c978a205af07e70e4a8cbb2624b03077.
  The private recovery snapshot remains under `.maya-release-evidence/maya-identity-20260913`
  on the same VPS. No backend release or service restart was required.
- Signed ru.mayaos.app v1.0 **build 11** installed and launched on the connected
  iPhone. Device inventory confirms 11. Built canonical HTML SHA256:
  02e85f68b7370f7dbc6ce7ba14eae3e5816ac5fac50e1dd2c8d0bc9b1c1547f7.
- Privacy accept and marketing accept/decline: PASS in executable/synthetic browser
  and iOS WebView proofs. No real person's production consent was sent for proof.
- New native/WebView screenshot: [consent form](evidence/consent-ios-synthetic.png).
- Main dirty status is byte-identical: 25 pre-existing entries (including the
  prior external extra entry); 23 regular-file hashes unchanged. Original native
  dirty status: 82 entries identical, 81 regular-file hashes unchanged. Neither
  original checkout was edited. The previous partial `/tmp` worktree was preserved.

| Requested result | Verdict |
|---|---|
| NEW MAYA LOGO | IMPLEMENTED YES |
| CANONICAL LOGO ASSET | сайт и приложение/assets/maya-identity.js; generated maya-mark.svg |
| SPLASH MORPH ANIMATION | PASS |
| THINKING ANIMATION | PASS |
| VOICE/RECORDING VISUAL | PASS; existing WebAudio amplitude only |
| REDUCED MOTION | PASS |
| LEGACY LOGO SURFACES REMAINING | 0 in upgraded active Maya consumer components; tenant brands/history remain independent |
| NATIVE CONSENT 400 ROOT CAUSE | Saved build 9 keyless consent_submit payload rejected by explicit_consent_decisions_required before effect |
| PRIVACY CONSENT FLOW | PASS — synthetic/executable, no production grant |
| MARKETING ACCEPT FLOW | PASS — synthetic/executable |
| MARKETING DECLINE FLOW | PASS — synthetic/executable + iOS WebView |
| KEYLESS LEGACY FLOW | STILL FAIL-CLOSED YES |
| A18/CONSENT SECURITY CONTRACTS PRESERVED | YES |
| MANDATORY REGRESSION | PASS — 437 suites / 3664 tests |
| PRODUCTION DEPLOYMENT | PASS — VPS frontend + signed iPhone build 11 |
| CHAPTER 7 COMPLETE | PRESERVED |
| CHAPTER 8 STARTED | NO |

Beget maintenance pages/PWA backups are deliberately not restored. No App Store
submission or Android deployment is claimed. The installed iPhone build is the
existing development distribution, not a public App Store release.

Hygiene: owned PostgreSQL cluster stopped and removed after a synthetic recovery
dump; owned simulator deleted, proof-only app removed, preview browser/server
closed. Existing development build outputs remain as deliverables, not processes.
No pre-existing database was accessed for proof. Production business/provider/
message/consent mutations: 0. Final relay post-verification and HEAD/origin receipt
are appended with the report checkpoint.

Final R01 post-verification: PASS — same 42 entries, 10 active PHP, three public
roots, nine local routing files, seven protected HTML/backups, 16 blocked artifacts
and 128 denied HEAD URLs. PHP source evaluation/business effects: 0. All three
before/prepublish/after checks agree. Backend health/readiness remain PASS without
restart. **PROCESS HYGIENE: 0.** Final report checkpoint is pushed and HEAD/origin
verified in the delivery response; all implementation and release evidence is
retained in this directory.
