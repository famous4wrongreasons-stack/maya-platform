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

## Public relay coverage — owner scope expanded at checkpoint 6df459e8

The owner approved finite account-wide public relay reconciliation; this is the
existing R01 coverage defect, not a new C7 requirement or booking contract.
`public-relay-inventory.cjs` now discovers account site `public_html` roots and
recursively inspects PHP-like artifacts by extension/content, not `*api*.php*`.
It catches nested/renamed backups, phtml/phar files, unexpected roots and symlink
targets. Unknown artifacts, roots, links or scan errors fail closed before repair
or backend upload. Direct `/records` through a provider writer is forbidden too;
the exact `book_record` string is not the entire violation class.

The filesystem convention is **not** authoritative virtual-host configuration.
The current 23-entry manifest is intentionally NOT expanded into an approved
allowlist: the effective domain → document-root / server alias / rewrite / PHP
handler mapping has not yet been obtained. Both discovery of additional artifacts
and this missing control-plane evidence prevent completeness certification.
Do not infer that private recovery directories are unreachable merely from their
names, or that HTTP 500 makes a legacy PHP writer safe. Anonymous HEAD returning
403 at an authenticated canonical webhook is different from server-level archive
denial; classify using source and effective routing, not status alone.

Current read-only evidence covers three observed site roots, all their PHP
artifacts/htaccess files and a bounded list of outside-root recovery directories.
The new technical-domain relay is included alongside the known public backup.
No production file, maintenance page or PWA backup has been changed. See
`docs/rebuild/CYCLE-07-R01-PUBLIC-RELAY-COVERAGE-REPORT.md` at repository root.

Before repair: obtain authoritative complete virtual-host/root/alias/handler
mapping, finish reachability classification for every artifact, pin the reviewed
manifest and pass all mandatory gates. Only then perform the already authorized
active-relay restoration and historical HTTP retirement, preserving private
hash-verified recovery evidence. A fresh business architecture approval is not
required for these already-approved R01 semantics.
