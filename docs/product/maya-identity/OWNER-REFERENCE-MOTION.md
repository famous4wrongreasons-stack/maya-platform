# Maya motion: use the owner's actual reference

Owner rejected the previous smooth-v2 approximation. Baseline `f0147bfe`.
The motion source is now the unchanged `may ani.png`, versioned at
`сайт и приложение/maya-motion-reference.png`, SHA256
`b57b04948f6b029ba9eb10ed186cf03e408cb78ea8911103eed83eb4f35ef385`.

`MayaIdentity` crops the six top-row source poses and the large middle wave.
It removes only the white matte at render time; on white all seven source crops
recompose with maximum pixel error **0/255** in the browser proof. The original
shape, fold, gradient, soft halo and tapered ends are retained. The old invented
mathematical waveform is removed. Static app icons remain unchanged.

The PNG does not contain an original timing/easing timeline. The implementation
cross-dissolves actual images without deforming them. It does not claim exact
reconstruction of unprovided in-between motion. Active-state opacity is calm and
continues while busy; existing microphone amplitude controls recording opacity.
No generated waveform, new microphone or new external dependency. Small loaders
use compact source poses; the voice surface uses the full horizontal wave, bounded
by viewport width. Reduced motion is static; hidden/unmount stop owned animation.

Client-mode restoration from build 12 is preserved. The new actual chooser was
exercised with synthetic server metadata: Client preview opens, return to owner
works, private authority remains server-controlled. Consent, tenant/Client
bindings and all business handlers are unchanged.

## Verification

- Browser: **16/16** exact-source and lifecycle checks PASS. Seven source poses
  match 0/255 over white. Enlarged intermediate states reviewed; no warped edge
  streaks. Console errors/warnings 0.
- Mandatory regression: **437 suites / 3667 tests PASS**. Final renderer also
  rerun through the reference proof and targeted identity/app-access/native-consent
  tests: **3 suites / 20 tests PASS**.
- Lint, application typecheck, scripts typecheck, build, Prisma validation PASS.
- Signed iPhone **build 13** PASS; canonical, synced and built native HTML match:
  `6e94cb7e35f6f175f390c9fcf3e8070a29509fef704bb615bc3eacf91ea7900a`.
  All three bundles include the exact source PNG, enforced by release guard.
- Backend `20260912-c7-p06-4058cd8c`: health/readiness PASS, pending migrations 0,
  schema drift NONE. No schema/backend change.
- R01 finite relay guard: 42 artifacts / 3 roots / 128 denied HEAD URLs PASS;
  maintenance, protected backups, PHP and routing remain unchanged.

See [comparison](evidence/reference-v3-comparison.jpg),
[executable receipt](evidence/reference-v3-proof.txt), and root `design-qa.md`.

## Bounded publication

`overlay-reference.cjs` pins the certified prior VPS HTML and changes exactly the
inline motion source and voice presentation width. All other HTML bytes remain
unchanged. `publish-reference.py` allows that app.html and the one new reference
PNG only. It checks backend identity, target/source hashes and existing C7 guard,
backs up original HTML privately, installs the image first and replaces HTML
atomically. It refuses an unexpected existing image. Beget is never written.
Expected VPS HTML SHA256:
`dae6c0b057bf4fc05d26393da13dbd0dafb38a6ba38359244a7870ee495d8715`.

This report precedes publication; the delivery receipt records actual installation
and post-publication verification. No production business/provider/message proof
mutation, main/native user-checkout change, historical DB access or Chapter 8 work.
