# Smooth Maya ribbon and Client mode recovery

Owner follow-up: the animation was too sharp and Client mode disappeared after
login. Baseline bdaac825; canonical origin unchanged at preflight.

## Corrections

The former renderer resampled two unequal outlines by arc length into a polygon,
and did not fade the ends. The corrected renderer subdivides the original cubic
logo exactly and interpolates cubic control points. Smooth analytic wave edges,
rounded transition caps, a continuing blue/cyan fold, a low-opacity soft halo and
an opacity mask give the reference's flowing ribbon and feathered ends. Static
logo and all 51 generated SVG/PNG assets remain byte-identical to the prior release.
One renderer still owns launch/thinking/recording/response/return states; no new
microphone, network call, dependency or business owner. Reduced motion is static;
launch/return settle exactly and unmount cancels the frame loop.

Client mode was removed by `meAppAccessSelectableModes`, introduced in 33396c16
and propagated by the previous canonical native bundle update. The server already
returns Client preview for business accounts. The UI now presents every returned
mode and accepts an explicit preview selection. The previous stale-saved-choice
recovery remains: an unverified old Client choice cannot auto-trap a business
account on login. The person can select Client preview and return to owner/staff.
No new mode is invented when absent from the server, no preview is upgraded to
private Client authority, and cached private cabinet data is cleared on preview.
A18 provenance, keyless refusal and canonical consent commands are unchanged.

## Verification

- Mandatory backend regression: **437 suites / 3666 tests PASS**.
- Targeted app-access, identity and native consent: **4 suites / 23 tests PASS**.
- Real chooser DOM with synthetic server metadata: Client preview opens, private
  cabinet data clears, return to owner succeeds. Owner/staff, stale saved choice,
  verified Client and server-absent Client cases are executable regressions.
- Chromium and iOS WebView visual inspection: smooth wave, fading tails, same
  folded palette; actual player frame snapshots, return, finite launch, reduced
  motion and unmount cleanup checked. Synthetic fixtures use no production data.
- Lint, application/scripts typechecks, build and Prisma validation PASS. A typed
  test-double cast in the previously added native consent test was corrected;
  no production service or test expectation was weakened.
- Signed iPhone build 12 PASS, exact source/synced/built HTML equality PASS.
- Production read-only preflight: backend 20260912-c7-p06-4058cd8c healthy/ready,
  pending migrations 0, schema drift NONE. No schema change or access to pre-existing databases.
- R01 release guard: 42 artifacts / 3 roots / 128 denied HEAD URLs PASS; protected
  maintenance pages and PWA backups remain unchanged.

Evidence: [motion frames](evidence/smooth-morph-v2.png),
[iOS WebView wave](evidence/smooth-ios-v2.png),
[restored chooser](evidence/client-mode-restored.png).

## Release boundary

Native bundle contains both corrections. The separately certified VPS PWA does
not contain the mode-filtering function; its only change is the inline renderer.
`overlay-smooth.cjs` pins the exact current production hash and proves all bytes
outside that block unchanged. `publish-smooth.py` permits one app.html replacement,
requires the existing backend release and C7 guard, and saves a private immutable
backup. No Beget, PHP, maintenance, backup PWA, backend, consent or provider write.
The production/native delivery receipt follows after verified publication.

## Delivery receipt

Implementation **be35f82f** was pushed before publication. VPS publication and
post-verify PASS; exactly one `app.html` changed. SHA256:
`2d85dbe8a0d6afa3b0c5c10a4afae31bcbaf1b7c987c2016d60bc9877a245f80`.
The existing C7 live consumer guard passes all 27 scripts. Recovery snapshot is
private at `.maya-release-evidence/maya-smooth-20260913` on the same VPS; previous
release backups are preserved. Backend release and all non-motion HTML bytes are
unchanged.

Signed `ru.mayaos.app` v1.0 **build 12 installed successfully**; device inventory
confirms 12. Built/synced/native HTML SHA256:
`5ef9907e14480ca3fa588990a66772e93003c80977cdcec3416c740013f86a81`.
Automatic launch was refused because the physical iPhone is locked. No claim is
made to have inspected the person's logged-in device screen. The update is ready
for their next launch; the chooser and wave were tested on synthetic browser/
iOS WebView surfaces, and the installed bundle matches the tested canonical HTML.

Original main/native dirty status is unchanged; all 23/81 recorded regular-file
hashes match. No user worktree changes, pre-existing DB access, force push,
production consent/booking/provider/message proof effects or Chapter 8 work.

Post-publication R01 verification: PASS, 42 entries / 128 denied HEAD checks;
all 7 protected HTML/backup artifacts unchanged. Owned preview/browser/simulator
processes are stopped, owned synthetic simulator deleted and remote upload stage
removed. Private recovery snapshots and signed build remain. No owned temporary
PostgreSQL database or watcher; process hygiene 0.
