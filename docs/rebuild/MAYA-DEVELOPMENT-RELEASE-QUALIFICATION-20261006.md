# Local release qualification checkpoint — 2026-10-06

**Historical AR-1 single-operator rehearsal passed its mechanics. The verifier at
that checkpoint accepted 33 HTTP/BIN claims covering 163 IDs using the prior scope
map. This is not current V1.4 conformance. Certificate: NOT_ISSUED.**

The subsequent [V1.4 preparation review](widget-release-programme/development-v14/README.md)
withdraws obsolete whole-approval U grounds and two broader L claims. The current
verifier correctly rejects the old manifest's six approval U claims. The artifacts
below retain their original bytes and results as historical evidence; none is
promoted to the new audit.

Candidate `7879f811b2c04d8fee7439e862cbd74b59c4cb3d` follows checkpoint
`48773ca4028445e0391e7a1ac7fec38c16799a1a`. Runtime source remains
`be7a4a5f08fe34369c11d548741724bae13a2618`: backend runtime, Prisma schema,
migrations, shell and React source are unchanged. Compiled build digest and the
unchanged web/Capacitor payload inventories were measured again in
[candidate-artifacts.json](evidence/maya-development-integration-20261006/release-qualification/candidate-artifacts.json).

The [48-file archive manifest](evidence/maya-development-integration-20261006/release-qualification/manifest.json)
records original local paths, byte counts and SHA-256 hashes. The
[structured summary](evidence/maya-development-integration-20261006/release-qualification/qualification-summary.json)
and [165-duty coverage matrix](evidence/maya-development-integration-20261006/release-qualification/candidate-coverage.json)
retain the distinction between fresh claims and completed clause qualification.
No clause is promoted by this checkpoint. G6-6/G13-R8 remain STOP; all 163
applicable duties still require complete candidate qualification before issuance.

## Useful results

| Measurement | Result |
| --- | --- |
| AR-1 offline operator/compiled validation | 29 PASS |
| AR-1 HTTP lifecycle and profile isolation | 23 PASS, repeated within the full HTTP run |
| AR-1 two separately compiled processes | PASS: shared grant, revoke and expiry |
| Fresh unfiltered HTTP run, one worker with recycling | 54 suites/538 tests PASS; one suite/test fails on historical HAR-5 audit pin |
| Fresh independent BIN runner | 21/21 PASS |
| Evidence verifier with existing approved scope/U-proof overlay | 35 lines, 33 claims, 163 distinct applicable clause IDs; zero violations |
| Recorded mint provenance | HTTP 274, BIN 42; zero refused mint captures; 590 database-before-teardown records |
| Diagnostic import-boundary regression | 59 PASS; 86 unrelated harness tests skipped in the focused run; full harness also exercised afterward |
| Live TypeScript and changed-file lint | PASS |

The AR-1 receipts use **ephemeral synthetic keys and synthetic local identities**
under existing fixtures. They exercise the real guards, canonical writer, audit,
CAS, role/tenant boundaries, expiry and revocation. This is a local rehearsal of
the existing contract, not an actual owner signature, production grant, actual
platform-owner session, model acceptance or deploy permission.
Governance remains `single-operator`, `independentHumanReview=false`,
`reviewerId=null`. The engineering agent review is not a second human reviewer.

## Three PublicBooking foreign keys: real semantic discrepancy

The original migration
`20261005160000_public_booking_guest/migration.sql` omits ON DELETE, ON UPDATE and
deferrability clauses. Its checksum remains
`e02cd1b34c3c1a70e2c038e77e800926776aaa5b837a78dfe646c59a52366a42`.
The locally applied migration journal matches all four original guest migration
checksums. Schema and SQL originated together in `b3fdbfe1`; the discrepancy was
not introduced by this development slice.

| Foreign key | Applied local PostgreSQL 16.14 | Prisma declaration |
| --- | --- | --- |
| PublicBookingSession.tenantId → Tenant.id | DELETE NO ACTION / UPDATE NO ACTION | DELETE RESTRICT / UPDATE NO ACTION |
| PublicBookingQuote.(sessionId,tenantId) → PublicBookingSession.(id,tenantId) | Same | Same |
| PublicBookingAttempt.(quoteId,sessionId,tenantId) → PublicBookingQuote.(id,sessionId,tenantId) | Same | Same |

All three catalog rows are validated, `condeferrable=false`, `condeferred=false`:
[catalog and migration journal](evidence/maya-development-integration-20261006/release-qualification/fk-catalog.txt).
The user triggers are BEFORE UPDATE only; neither DELETE nor INSERT is covered:
[actual trigger definitions](evidence/maya-development-integration-20261006/release-qualification/fk-user-triggers.txt).

Nondeferrability does **not** establish equivalence. The bounded
[TEMP-only SQL proof](evidence/maya-development-integration-20261006/release-qualification/fk-semantics.sql)
and its [18 observations](evidence/maya-development-integration-20261006/release-qualification/fk-semantics-attempt2.txt)
show, for key widths 1, 2 and 3:

- Both actions refuse deleting a referenced parent with SQLSTATE 23503.
- Both allow explicit child-first deletion.
- In one SQL statement, deleting and reinserting a parent with the same key is
  allowed by NO ACTION and refused by RESTRICT, even with NOT DEFERRABLE.

The proof uses only temporary tables in the owned local proof database and ends
with ROLLBACK. It does not mutate guest data or schema. The initial syntax-error
attempt is retained separately. PostgreSQL documents the default NO ACTION and
the distinction from RESTRICT in its [constraint documentation](https://www.postgresql.org/docs/16/ddl-constraints.html#DDL-CONSTRAINTS-FK);
its [PG16 referential-integrity implementation](https://github.com/postgres/postgres/blob/REL_16_STABLE/src/backend/utils/adt/ri_triggers.c#L606)
also distinguishes replacement of a deleted key. The local counterexample is the
direct evidence for this checkpoint.

Existing ownership is `AppointmentsModule/PublicBookingService`. The repository
inserts and reads guest sessions/quotes/attempts; expiry/revocation withdraws use.
No production guest purge/deletion policy was found. The existing
[guest release/rollback contract](WEBSITE-GUEST-BOOKING-RELEASE-GATES.md) requires
preserving guest tables, constraints and AE evidence during rollback; it does not
settle parent replacement semantics. Test teardown deletes child-first and does
not establish production erasure authority.

**Exact owner decision pending:** preserve applied NO ACTION and explicitly
reconcile Prisma, or retain the existing Prisma RESTRICT intent through one new
forward corrective migration for exactly these three FKs. Independent engineering
review recommends the latter. No such migration has been written or applied;
applied migration bytes, Prisma schema and the exact nonempty diff remain intact.
There is no justified equivalence normalization or baseline-only waiver. Existing
deploy qualification requires an empty `prisma migrate diff --exit-code`; that
check remains RED until the decision and its separately verified correction.

## Certification evidence and remaining work

Fresh HTTP/BIN collection started in an empty directory at the frozen candidate:

```sh
# Sanitized public test literals + owned loopback proof DATABASE_URL only.
WIDGETS_EVIDENCE=1 WIDGETS_EVIDENCE_DIR=<fresh-dir> \
  node node_modules/jest/bin/jest.js --config test/jest-widgets-live.json \
  --maxWorkers=1 --workerIdleMemoryLimit=768MB --json --outputFile=<fresh-report>
WIDGETS_EVIDENCE=1 WIDGETS_EVIDENCE_DIR=<same-dir> npm run test:widgets:http
node scripts/widgets-evidence-verify.mjs --dir <same-dir> \
  --audit ../docs/rebuild/widget-release-programme/approved-release/current-audit.json \
  --u-proofs ../docs/rebuild/widget-release-programme/approved-release/u-proofs.json
```

The unchanged verifier's default historical Wave-5 map first reported nine
V-U-PROOF violations. The existing approved-release overlay supplies the later
approved closed-input/U basis for those exact clauses. With those explicit inputs,
the same fresh manifest passes; no manifest line, verifier or allowlist was
modified. The overlay supplies scope/basis only: its historical green states,
mutation results and receipts are not imported as fresh qualification. Both
evidence-verifier outputs and the unchanged manifest are archived.

The remaining failures are concrete:

1. FK reconciliation requires the owner decision above.
2. HAR-5 still checks the historical V1.3 inventory/audit pin
   `b84b3e7303e1a655bf47c436075089ce51d79e315128e8cafb9325c64f19c36c` against
   current V1.4 `9bd33e79959c87d9e8f28ffbccc622ca9180aa7f179533499305ac892cc1d769`.
   A fresh candidate audit must use current receipts and V1.4 rules. Historical
   audit/inventory files and prior profile pins remain byte-for-byte preserved.
3. Mutation dry-run stops at `gate13.json#M13-2b`: its COMMIT anchor predates the
   schedule branch. The declared corpus is 47 batteries / 68 jobs / 545 mutants;
   this checkpoint does not claim that all remaining anchors validate. Repair
   stale anchors without changing their intended fault/killers, then run the full
   unfiltered corpus with green controls in the reserved long slot. The existing
   strict entry remains `widgets-mutation-ci.mjs release <fresh-parts> <out> <sha>`.
   No subset or prior receipt substitutes for it.

Only after those checks and current FBE2E/isolation/dependency/revocation bindings
are complete can the existing ProfileCertificate validator receive a completed
unsigned candidate payload. No valid certificate object was fabricated from
synthetic all-green fixtures. Owner signing, production trust/session/grant and
deployment remain separate actions under the existing AR-1 runbook.

## Diagnostic harness correction and preservation

`118fe288` moved two explicitly synthetic helpers from canonical
`widgets-live/support` to `widgets-diagnostics/support` and updated their three
direct diagnostic consumers. Their behavior is unchanged. Keeping them in the
canonical evidence harness caused six global V-OVERRIDE refusals before any
claims existed. `7879f811` prevents production/canonical harness/BIN support from
reaching diagnostics through transitive relative imports, including reexports,
side-effect imports, dynamic imports, require, index files and cycles. Direct and
nested clause-import counterexamples still fail the unchanged strict verifier.
The final independent engineering review has no remaining blocker in this narrow
change; its earlier P2 and resolution are recorded in the archive.

All tests ran serially on owned local services. HTTP processes exited; the owned
PostgreSQL cluster was stopped and its PID file is absent. The source, occupancy,
pricing and platform worktrees remain unchanged at their prior pins, verified in
[preservation.json](evidence/maya-development-integration-20261006/release-qualification/preservation.json).
No remote/production server, real UNKNOWN attempt, production database, YCLIENTS/model/production HTTPS/phone,
push or merge action occurred. Schedule editor remains NOT_USER_REACHABLE under
the restricted profile. No background C10 authority or C10-complete claim follows
from this checkpoint.
