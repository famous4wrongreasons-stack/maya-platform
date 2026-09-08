# Wave R-C: approved durable policy resume and local acceptance

Owner approval accepts checkpoint `4e63b65c`, Option A in the existing durable-policy
sheet. The earlier lifetime STOP is resolved by `8ac3c3e4`. Original R-C package
commits and all eight approved contracts are preserved. This report certifies local
acceptance; production cutover and the Package 5 Final Gate have not yet run.

## Claim and dispatch

The same tenant-qualified READY execution is locked. Original HMAC, immutable
normalized intent, owner/slot binding, business expiry and payload are checked.
Current canonical policy must ALLOW; a historical ALLOW cannot override current
revocation. An ordinary attempt and a fresh signed-policy AuditLog receipt commit
together. Original admission fields remain unchanged. Immediately before crossing
the effect boundary, the original attempt's fresh receipt and current policy are
checked again. Missing/expired evidence fails closed. UNKNOWN reconciles the same
execution; confirmed and terminal slots cannot dispatch again.

The allowlist is the approved 13 R-C command capabilities, exact bound R05/R06/R08/
R12/R13 delivery slots, the narrow R13 assistant-preference transition and P407
only with the original per-card R10 approval receipt. R06's already-approved
shift-reminder mapping remains A11, with an exact OperationalAlertRun binding;
it is not reclassified into A13. Unbound A11/A12/A13, A18, B31/B33, unrelated P407,
AC6 and required-human-approval lifetimes are unchanged. Human approval and actual
intent expiry cannot be refreshed. No model, field, action or migration is added
by this policy decision.

R11 and the exact R13 weekly preference transition now use the same kernel claim
inside their existing atomic A22 transaction. Other A22 commands retain their
previous contract. The kernel uses the existing transaction-local UTC convention
when reading R-C timestamptz bindings; no connection/pool timezone is changed.

## Executable evidence

[Machine-readable acceptance and file digests](evidence/package5-rc-policy-approved/manifest.json).

| Package | Blockers | Local acceptance / principal evidence |
| --- | --- | --- |
| R05 | B36, B43 | PASS: B36 concurrent admission, stable identity, ordered eight-slot plan; actual restart after old policy expiry, UNKNOWN barrier and independent recipients; both morning kinds, exact Staff/calendar binding, snapshot access and retention |
| R06 | B44, B45, B48, B49 | PASS: occurrence/audience admission, event/projection/wanted-slot paths, Client authority, delayed claim and restart, retention, Python delivery ratchets |
| R08 | B47 | PASS: exact Client/Appointment/attendance, consent and delivery, delayed claim, restart and retention; PHP relay and PWA retry proofs |
| R09 | B52 | PASS: anonymous source isolation, human moderation, revision/idempotency races, restart and retention; public/PWA/PHP/Python proofs |
| R11 | B51, B59 | PASS: tenant revisions separate from personal mute, current Membership, real 65-second ALLOW/DENY/revocation and exact retry, PWA proof |
| R12 | B53, B58 | PASS: immutable text/media owner, delayed slots, actual restart, private binary/media verification, retention, PHP retirement and PWA transport/UNKNOWN proof |
| R13 | B37 | PASS: opt-in default off, exact intake/approval/receipt authority, reminder/reply delivery, real delayed claims, restart, retention and PWA proof |
| R14 | B55 | PASS: explicit physical-cash observation, revisions/correction history, same pending execution after actual restart and expired old policy, PWA proof |

The real >60-second tests preserve execution IDs and original admission evidence.
The controlled >15-minute kernel proof also covers DENY, Membership/route revocation,
expired intent, concurrent claims, audit rollback, policy change before dispatch,
UNKNOWN and terminal outcomes. Synthetic transports are explicitly separated from
production effects.

Aggregate PASS: **411 backend suites / 3370 tests**, all architectural ratchets,
lint, application and scripts typechecks, build, Prisma validation. All **93**
migrations replay on an empty owned PostgreSQL database without drift. A second
replay uses the actual deployment order (native-security A18 before the nine R-C
migrations), also without drift. Combined PostgreSQL constraint proof has 45 checks.
Actual application DI resolves all eight owners plus the existing security owner.

Owned lint defects are repaired without configuration changes. Regression fixtures
now recognize the exact approved R-C registrations and retention classes. The B9
wanted-slot trigger is asserted at its existing canonical DomainEvent owner instead
of the retired raw Python delete path. Python guard digests are interpreter-neutral
ASTs; negative writer tests remain mandatory.

Release artifacts are composed over fresh hash-verified production variants:
30 Python changes pass 15 guards and 43 tests. Six PWA variants contain 102 exact
canonical functions; the four native security-consent functions and both unchanged
native PHP aliases are preserved. R08/R12 PHP checks and isolated pure cases pass;
the prior PHP 5.6 parser baseline is unchanged. No application/provider entry was
executed by those PHP proofs.

## Coordinated cutover

1. Commit/push the reviewed release. Recheck origin, the current native-security
   release and exact Python/edge hashes. Stage pinned manifests/candidates privately.
   Read-only preflight confirms no R-C tables, no incompatible OwnerReportRun rows
   and the existing two security invalidations. Preserve native audit/state.
2. Retain an encrypted database backup and metadata evidence. Use the existing
   `deploy/vps/deploy.sh` with `MAYA_DEPLOY_PREPARE_ONLY=1`: no gate is skipped;
   dependencies are installed anew, then the nine approved migrations, strict
   pending/drift verification and Prisma generation run before activation.
3. Execute the prepared-release readiness step with all nine schedulers suppressed
   in that disposable process. It only checks health/readiness and is terminated.
4. Quiesce `maya-saas` and `barbershop-bot`. Publish the exact reviewed PHP/media
   denial, Python and PWA artifacts using hash-pinned staged replacement. Keep both
   application services stopped until every host's artifacts are verified. Preserve
   unrelated files and all legacy history. No live business command is used.
5. Prepare R12's approved `/var/lib/maya-saas/team-private` as owner-only storage for
   the `maya-saas` service. The observed parent is root:root 0700 and denies service
   traversal; grant only the existing service group traversal (root:maya-saas 0710),
   with the child maya-saas:maya-saas 0700. Existing children/data and public upload
   permissions remain unchanged. ffprobe is already installed. Persist the R05 daily/morning, R06 operational and canonical Inbox cutover
   timestamps. Enable the R13 scheduler; this does not opt any User into reminders
   (the personal preference remains default OFF). Configure the existing public
   community source through the strict active CRM-integration resolver, its three
   existing static publication keys and published-post namespace. This grants only
   source transport scope, never Client or moderator authority. Configure the two
   actually available staff-AI providers; no tenant configuration is synthesized.
   The service cannot traverse the private Python-bot home. Keep that restriction:
   install the three hash-verified pure PDF/catalogue files in a separate service-
   readable renderer directory, with pinned existing ReportLab 4.5.1, Pillow 12.2.0
   and charset-normalizer 3.4.7. Synthetic formatting as the service user must pass.
   Back up both environment files privately and preserve their original metadata.
6. Switch the prepared backend using the existing symlink/systemd release process,
   then start the Python service. Verify health/readiness, compiled/source hashes,
   pending migrations, drift, exact schema/action/owner wiring, private media denial
   and preserved native security state with structural/read-only probes.

Before activation, recovery restores only the changed pinned files and original
service/config metadata; additive schemas and all history remain. After any R-C
intent has been admitted, recovery is forward repair of the same owners/executions,
not rollback into legacy writers or restoration of a stale database. The older
invalidation-blind native release is never a recovery target.

Only after 8/8 production PASS may accounting become 24/24 blockers and 14/14
packages, followed by the single Final Gate for 13 families and 32 inventoried
surfaces. Current production accounting remains 10/24 blockers and 6/14 packages.

```text
R05/R06/R08/R09/R11/R12/R13/R14 LOCAL ACCEPTANCE: PASS
B36 IDEMPOTENCY KEY: PASS
B36 CONCURRENT WRITE CONFLICT: PASS
B36 DELAYED RESUME: PASS
WAVE R-C AGGREGATE GATE: PASS
WAVE R-C PRODUCTION CUTOVER: NOT STARTED
PACKAGE 5 FINAL GATE RUN: NO
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
PRODUCTION BUSINESS/PROVIDER/MESSAGE EFFECTS FOR PROOF: 0
MAIN DIRTY WORKTREE TOUCHED: NO
PRE-EXISTING DATABASES TOUCHED: 0
```

The owned synthetic PostgreSQL cluster is still running for this active wave;
final zero-process/database hygiene is asserted only after cleanup.

## Deployment-gate follow-up

The first unchanged deployment gate hit a native V8 GC SIGSEGV with installed
Node 24.19.0, before any release upload/migration. A retry with the existing supported
Node 24.15.0 completed 410 suites but four sequential-request tests in R04's HTTP
fixture timed out; the same nine tests passed in isolation. The fixture now owns
one explicit loopback listener for its suite, closed by the existing `app.close()`;
Supertest no longer repeatedly opens/closes the same shared server. Assertions,
guards, timeouts and runtime are unchanged. Five repeated isolated runs on both
installed Node versions pass with open-handle detection. The complete deployment
gate must pass again before proceeding. Release runtime/artifact identity remains
`8bc03454`; this follow-up changes test lifecycle and documentation only.
