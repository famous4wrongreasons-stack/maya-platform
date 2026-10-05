<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: 991abe87d33b2b5887fc1cdba5de9438ddd1768571b1957bf8e617689f64f691 -->

# Production-source NAVIGATE — bounded persistence decision

Status: STOP before schema change. Existing detail/w revalidation mechanisms remain implemented; no production-source clause is promoted by this proposal.

## Exact gap

The combined candidate has a real journal SCHEDULE producer and the existing `composeNavigate(detail)` reader. The reader correctly requires the original server-validated local business date to reread `operations.journal.read` under current authority. A NAVIGATE record currently cannot retain that date:

```sql
"WidgetIntentRecord_journal_date_scope_check":
"retainedLocalBusinessDate" IS NULL OR (
  "effect" = 'REFINE' AND
  "capabilitySpace" = 'C9' AND
  "capabilityKey" = 'operations.journal.read' AND
  canonical_date_validation
)
```

The record writer independently applies the same REFINE-only scope. `navigate.schedule@1` targets `shell.root`; it is not a production detail/w producer. `fullscreen_detail` remains null in the current minter. Reusing that versioned template with a different target would rewrite its meaning, so the proposed producer needs a new fixed key.

Reading a date out of historical body JSON would bypass the retained-source contract. Storing it in immutable AuditLog would move erasable query content into the wrong persistence class. Inferring today's date would change the original query. None is implemented.

## Option A — extend the existing retained journal-date contract narrowly

Approve a new fixed `navigate.journal.detail@1` template: SCHEDULE, NAVIGATE, target `detail:fs.calendar`, no InputSchema, source exactly `C9:operations.journal.read`. The server derives the date from the exact completed canonical journal read. It is an erasable query parameter, never identity or authority.

Permit the existing `retainedLocalBusinessDate` column for this exact NAVIGATE/source/kind/target combination in addition to the unchanged REFINE branch. This needs one additive migration replacing the CHECK with an OR for the exact new branch; no table or column. The date parser, field erasure/retention, sealed source verification, current tenant/principal authorization, release profile admission and canonical read owner remain mandatory.

The producer must derive `presentation.fullscreen_detail` from that fixed server template and use the existing SCHEDULE detail interaction. Its response uses the canonical schedule presenter. A returned detail may carry a separately versioned, server-bound `w` link to its exact retained parent; the emitter must resolve and verify that parent within the same tenant/current principal/release before minting, and resolve must check it again. No caller-selected widget id or generic target mechanism is admitted.

Required proofs: real producer HTTP/BIN detail→current owner reread; exact retained parent `w` re-resolution; foreign tenant/principal, tampered/stale/erased source, revoked release and unavailable parent refusals; actual carrier activation/parity; mutations removing source, current-authority, scope and target fences.

## Option B — leave the current persistence contract unchanged

Keep the journal detail producer STOP and retain G12-R1b, G12-I11 and G13-R2 as false. Existing mechanism/negative proofs are useful but cannot replace source evidence. These applicable duties cannot be excluded from `closed-input.no-handoff@1`.

## Alternatives checked

The existing business-hours owner exposes a free-form schedule string, not the dated journal grid; interpreting it as appointments would introduce another contract. Catalog selectors have no existing detail interaction in their strict body, so they are not a drop-in journal/carrier evidence replacement. This packet requests the smallest extension for the actual combined carrier's SCHEDULE path; it does not claim that every conceivable future NAVIGATE source requires a database date column.

Recommendation: Option A, with the exact CHECK/erasure and target-binding invariants above. This authorizes only code, a reviewed migration and synthetic proof if accepted. It never authorizes applying the migration or any grant/deploy/OTP/booking operation in production.
