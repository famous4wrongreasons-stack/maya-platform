# Companion v1 — scoped UI evidence

Scope and remaining source contracts:
[design checkpoint](../../MAYA-COMPANION-DESIGN-CHECKPOINT-20261013.md).
Local implementation over baseline `957067080d7e8c8b7a1f107be69b377263955eb5`;
not a full-release certificate. All browser text and HTTP responses are synthetic.

## Final scoped run

Exact implementation: `5b8d99db12a41e5522ad71f0a9a7972e2070f0ec`.
All eight stages were freshly run after commit with a clean worktree and Node
`v22.23.3`. HEAD stayed unchanged throughout. See [receipt](receipts/receipt.json)
and [emitted browser receipt](receipts/browser.json).

| Surface | Fresh result |
| --- | --- |
| Carrier | 170 PASS, 0 FAIL; includes six Companion tests and 40 old/new widget semantic comparisons |
| Runtime | 763 PASS, 7 SKIP, 0 FAIL; skips are preserved, not counted as passes |
| Carrier ratchets | 72 refuse / 45 admit counterexamples, 0 failures |
| Emitted Chrome UI | 35 PASS; actual temporary tab visibility, motion, menu/focus, reply/error/retry identity, 320/393/427/1280 widths, enlarged text and short viewport |
| Release packaging tests | 18 PASS, 0 FAIL |
| Canonical packaging | Build and final independent verify PASS, 8 files per target, CSS/artwork identical, JS differs only at approved API endpoint substitution |
| Source package | 113/113 original files retain manifest hashes; package is unchanged |

Fresh PWA/Capacitor builds are local payloads, **not** an Xcode build/install.
No real microphone, backend, retained database, user credentials, model or
provider was used. Network requests outside the synthetic origin: 0. No CSP or
JavaScript exceptions. Full release certification: **NOT ISSUED**.

[Chat screenshot](chat-393.png) and [menu screenshot](menu-393.png) were visually
reviewed. 320/427/desktop, 200% chat/header text and keyboard-height screenshots
remain local with hashes in [artifact manifest](artifact-manifest.json).
The font check enlarges the named chat/header text, not a complete screen-reader
or OS Dynamic Type audit. Synthetic screenshot copy is not model output quality.

Next-screen contracts/source map: [SOURCE-MAP.md](SOURCE-MAP.md).

The final receipt set records the committed implementation SHA, source/payload
hashes, commands, statuses and local artifact provenance. Any subsequent evidence
commit changes documentation only; it is not a new certified product candidate.

During development, browser proof caught a reply cue being cleared by the sent
draft transition and visual inspection caught a header reserve being counted
twice/default button styling. Both were corrected with explicit regressions.
Two harness assertions were corrected independently: the menu's nested
`last-of-type` selector and backgrounding a tab in a different browser context.
Background pause is now exercised with a real second tab in the **same** synthetic
browser context, without spoofing `document.hidden` or editing application state.

Acceptance covers actual emitted UI, scoped carrier/runtime tests, closed asset
admission and PWA/Capacitor packaging parity. It does not establish real model
answer quality, live booking, physical voice/iPhone behavior, all five redesigned
sections or final CI/FBE2E/mutation certification.
