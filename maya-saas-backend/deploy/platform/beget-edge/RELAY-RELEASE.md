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
builder. `verify-edge-candidate.cjs --shell DIRECTORY [PUBLISH_PATH]` is the
second, equally strict shape for a static shell/PWA input, which carries no PHP
at all: it requires zero PHP-like files by the live scanner's own predicate, zero
routing/handler configuration, zero symlinks, zero archive-named files, exactly
one web app manifest whose every icon resolves inside the candidate, a relative
`scope`/`start_url`, and an `id` that neither claims nor extends a reserved legacy
install id. It is not a relaxation of `verify()`, which is unchanged.
The existing R01 registered-overlay checks remain mandatory for alias
changes. `relay-release-manifest.json` pins the 26 inspected PHP artifacts in three mapped roots (10 active,
16 denied), seven preserved HTML/backup files — two served maintenance pages and
five `archived_offroot` bundles the owner-approved R3 ruling moved out of the
served roots — and ten local routing files. Archive content
is historical evidence, not a permitted rollback target.

`node deploy/platform/beget-edge/relay-release.cjs verify` reads the live manifest,
checks all ten active PHP copies, pins both maintenance pages, requires every
`archived_offroot` entry to be **absent** from every public root, and checks HTTP
HEAD denial across known domain aliases for every denied PHP artifact and every
former `archived_offroot` URL. Source inspection never evaluates PHP; HTTP probes have no action/body. Backend deployment runs this gate before upload, before
activation and after activation. An unknown file or hash fails closed and needs
exact reconciliation; do not change the manifest just to get a green release.

Three classes make that last sentence mechanical rather than advisory. **Absence:**
an `archived_offroot` artifact that reappears at its pinned path fails closed, and
for HTML this is the only mechanism, because HTML never enters the PHP-like
inventory. **Archive equality:** the gate hashes the private R3 archive read-only
and requires the R3 rollback manifest of record and each `archived_offroot` pin to
be present there; no archive byte, name or path ever leaves the host, nothing is
copied or restored, and an unresolved locator fails the gate instead of skipping
the class. The archive directory is operator-local and deliberately absent from
this repository: it is resolved from `MAYA_R01_ARCHIVE_DIR`, or from a one-line
pointer file under the mode-0700 private evidence directory the retirement writer
already owns (`MAYA_R01_ARCHIVE_POINTER`, default
`.maya-release-evidence/r01-20260912/archive-dir`). **Three-way equality:** a
manifest entry that names a `committedSource` must satisfy
`sha256(committed) == pin == live`, so editing a pin to match a changed file fails
against the committed bytes. Class counts in the receipt are derived from the
roles, never written as literals.

For the owner-approved 2026-09-12 incident only, `prepare` derives the exact
certified b1006160… result from the exact d5eeaa82… incident by replacing the one
bounded case with the existing R01 block. Every other raw byte must remain equal
to the certified artifact; redaction of the two existing config literals must
produce the versioned fixture exactly. Candidate syntax uses PHP TOKEN_PARSE,
never include/eval/application execution.

After mandatory regression, lint, both typechecks, build and Prisma PASS,
`repair` may perform that exact replacement. It pins all protected pre-state,
uses a lock and compare-before-replace, keeps a private mode-0600 incident backup
outside the document root and atomically replaces only the main relay. The two exact legacy writers are
first retired with pinned filename-denial rules, preserving their PHP bytes.
Routing updates are monotonic and individually atomic under the same lock;
interrupted batches resume without ever reopening a writer. All pre-states are
validated before the batch, and actual URL denial is required before proceeding. A retry
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

The authenticated Beget panel mapping, known local routing configuration and
actual URL evidence are recorded in the control-plane inventory. Private provider
vhost export is **not** a canonical R01/C7 prerequisite: see the independent
canonical review, which supersedes the previous operational STOP. Do not infer
infinite coverage from directory names; equally, do not add unrestricted
infrastructure discovery to the frozen Chapter 7 gate.

The version-2 manifest registers the three bound roots and eight known public
host aliases. Technical HTTP is included; technical HTTPS has no listener.
Known local configuration, including ancestor absence, is pinned and drift fails
closed. Newly observed concrete roots/files/symlinks are reconciled before release.
The two exact retired writers are checked both by filename and PATH_INFO URL.
An authenticated webhook's application 403 is not an archive denial: active PHP
must pass the whole-source guard. HTTP 500 is never accepted as safe retirement.

`prepare` accepts only the exact known incident pre-state, without mutation.
`repair` is authorized only after mandatory gates. It writes two exact HTTP
denial rules and restores the certified main relay; historical PHP and the
maintenance pages are pinned byte-for-byte in the host writers' protected
pre-state. An `archived_offroot` artifact is absent by ruling, so it is pinned by
absence in `validateObserved` and by hash in the private archive, never by
presence in that pre-state. `verify` never accepts the incident pre-state. A failed post-state check blocks backend cutover; never
restore unsafe bytes as a rollback. No business/provider/message proof is used.

## AASA release inventory

The existing Apple association and its `.well-known/.htaccess` content-type rule are both registered
with their unchanged committed hashes and `committedSource`. The nested rule is part of the finite
routing inventory even though it is outside the site-root `.htaccess`. Unknown nested routing still
fails closed; its location is never an exemption. The AASA content is a pinned `hosting_asset`.
