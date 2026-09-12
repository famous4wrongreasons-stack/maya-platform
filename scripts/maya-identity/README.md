# Shared Maya identity and native consent release

Canonical geometry/motion: `сайт и приложение/assets/maya-identity.js`.
`generate.cjs` derives all 51 versioned SVG/PNG assets and the inline PWA copy.
Do not edit generated sizes or recover an old native HTML bundle as current source.

Use an isolated native copy. Never run these commands against a dirty user checkout.

1. `node scripts/maya-identity/generate.cjs`
2. `python3 scripts/maya-identity/native-overlay.py <isolated-native>`
3. `node scripts/maya-identity/native-assets.cjs <isolated-native>`
4. `bash scripts/maya-identity/build-native.sh <isolated-native> <owned-output>`
5. Install only after the mandatory backend/PWA/security gates pass. The build script
   checks exact canonical HTML equality before and after Xcode. Stale `www`, synced
   `public` or built `public` fails the release. iOS AppIconBarber remains tenant-owned.

The current VPS PWA is a separately certified variant. `overlay-production.cjs`
accepts only its pinned Chapter 7 hash and applies bounded identity/consent blocks.
It preserves unrelated P06 consumers, parses all scripts and runs the existing C7
consumer guard. It only produces a candidate; it does not deploy. Review its change
manifest, compare live pre-state again, preserve a private backup, publish generated
assets first and atomically replace the HTML last. Never deploy the full native/PWA
source over a distinct production variant without reconciliation.

The old AConsentGate is retired in the canonical bundle; AMayaConsent is the sole
active form. The VPS legacy shell aliases its one existing mount to this same form.
Its shell mode controls presentation only; `/client-channel/status` establishes
eligibility and all mutations retain the canonical A18 issuer/consent owner.
Local storage is scoped by tenant/account; it preserves one event before sending,
retains it on rejection/uncertainty, and clears it only after confirmed success.
No keyless grant, hidden Client/binding creation or profile-row-as-consent fallback.

Release prerequisites remain mandatory regression, A18/consent and R01 guards,
lint, both typechecks, build, Prisma, schema/health/readiness and native sync/build.
Beget maintenance HTML, backups and PHP relays are outside this UI deployment.

`preview.cjs` is a local synthetic visual fixture with no production identities or
network mutations. Its privacy/marketing selections never change real consent.
A simulator proof build may replace only its own bundled HTML with that fixture;
never install that proof bundle on a user device or deploy it.
