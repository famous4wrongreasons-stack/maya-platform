# Companion v1 — scoped UI evidence

Scope and remaining source contracts:
[design checkpoint](../../MAYA-COMPANION-DESIGN-CHECKPOINT-20261013.md).
Local implementation over baseline `957067080d7e8c8b7a1f107be69b377263955eb5`;
not a full-release certificate. All browser text and HTTP responses are synthetic.

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
