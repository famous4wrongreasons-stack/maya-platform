# R01 relay release and recovery boundary

The PHP legacy `create_record` path must return the existing R01 410 refusal
(`verified_client_channel_required`, accepted=false, retry_allowed=false).
It has no Client authority and may not call provider booking. Supported callers
use the existing B31–B33 canonical ingress. Do not restore legacy PHP from a
production download or backup merely because it was once deployed.

`client-initiator-boundary.cjs` checks the whole PHP input in addition to the
exact refusal. The versioned sanitized fixture is inspected by mandatory Jest;
it is a test input and **must never be deployed**. Source recovery must preserve
its certified semantics, sanitize credentials and run this guard before any
candidate is accepted. A matching new fixture hash alone does not certify safety.

`verify-edge-candidate.cjs DIRECTORY` inspects all candidate PHP/PWA files,
rejects backup PHP and placeholder credentials, and is mandatory in the edge
builder. The existing R01 registered-overlay checks remain mandatory for alias
changes. `relay-release-manifest.json` pins all nine admitted aliases, the two
maintenance backups and twelve blocked historical PHP archives. Archive content
is historical evidence, not a permitted rollback target.

`node deploy/platform/beget-edge/relay-release.cjs verify` reads the live manifest,
checks all four active PHP copies, pins both maintenance pages and both backups,
and checks HTTP HEAD denial for every historical archive. It never executes PHP
application code. Backend deployment runs this gate before upload, before
activation and after activation. An unknown file or hash fails closed and needs
exact reconciliation; do not change the manifest just to get a green release.

For the owner-approved 2026-09-12 incident only, `prepare` derives the exact
certified b1006160… result from the exact d5eeaa82… incident by replacing the one
bounded case with the existing R01 block. Every other raw byte must remain equal
to the certified artifact; redaction of the two existing config literals must
produce the versioned fixture exactly. Candidate syntax uses PHP TOKEN_PARSE,
never include/eval/application execution.

After mandatory regression, lint, both typechecks, build and Prisma PASS,
`repair` may perform that exact replacement. It pins all protected pre-state,
uses a lock and compare-before-replace, keeps a private mode-0600 incident backup
outside the document root and atomically replaces only the main relay. A retry
recognizes the certified result. Never roll back to the unsafe artifact. Any
post-state error requires read-only reconciliation. The command contains no
config/hash/path override and cannot promote an unrelated source.

These gates protect repository release/recovery paths and detect external drift;
they do not claim to revoke independent hosting credentials. An out-of-band
upload can still change Beget files and will fail the next live gate. The exact
actor/command for the incident has not been established; no claim is made that
the unsafe artifact passed this documented deployment process.

## Current stop: an unregistered executable backup

The recursive live gate intentionally fails on
`app/backups/api-proxy-before-loyalty-20260721-2035.php`. This path is not one
of the twelve blocked historical archives: HTTP HEAD returns 200 with PHP/JSON,
and its source contains a direct `book_record` case. See the bounded evidence
in `docs/rebuild/evidence/r01-relay-regression-remediation/` from the repository
root. Do not whitelist it as safe or run repair/deployment around the failed
gate. Its production scope must be reconciled under the owner's new-surface
STOP rule. The one-file main-relay repair remains prepared but unexecuted.
