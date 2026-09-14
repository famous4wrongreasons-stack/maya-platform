# C7 measurement consumer release boundary

The approved P06 cutover edits only `/var/www/maya-platform/app.html` plus the
standard backend release. Beget maintenance pages and both pre-maintenance PWA
backups remain byte-identical. No contact export, provider or business effects.

The existing VPS artifact differs from the repository PWA: its cabinet supports
the same existing endpoints, but it has no rich chat report component. Therefore
`build-vps-candidate.py` applies exact approved cabinet hunks to the pinned VPS
base and inserts the two identical formatting helpers. It never replaces unrelated
VPS identity/routing/UI code with the newer repository bundle. Chat text comes
from the canonical backend presenter; the repository rich card uses the same facts.

1. Fetch the exact VPS file read-only, retain privately; do not commit whole production HTML.
2. Build candidate using `build-vps-candidate.py BASE OUTPUT`. Base hash is mandatory.
3. Run `node verify-pwa.cjs OUTPUT` plus mandatory PWA/measurement/C6 ratchets.
4. Use `publish-vps-pwa.py STAGE check/publish/verify` with the pinned manifest.
   Publication preserves mode/owner, retains a private immutable backup and uses
   atomic replacement. `recover` restores only this change if its current hash matches.
5. `node verify-live.cjs` is the read-only verifier for this already-inventoried
   artifact. R01's separate relay verifier remains required for Beget.

No raw production HTML or secret is a versioned fixture. The publication manifest
records source/candidate hashes and backend release identity; all schema and
backend gates must pass before this publication. Pure formatting never adds cash,
net profit, salary assumptions, attribution or cross-currency rankings.

The standard backend release now verifies both R01 relays and the C7 VPS PWA
before upload, before activation and after activation. For the initial P06 wave,
publish the proven PWA candidate after all local gates, immediately followed by
the backend release. During this short transition the typed formatter renders
missing legacy finance data as unavailable. If backend cutover cannot complete,
recover only this candidate to its pinned prior bytes; do not change Beget.
