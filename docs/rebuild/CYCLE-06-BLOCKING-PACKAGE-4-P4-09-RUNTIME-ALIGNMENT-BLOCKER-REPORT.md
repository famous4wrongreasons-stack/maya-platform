# CYCLE 06 BLOCKING PACKAGE 4 — P4-09 RUNTIME ALIGNMENT BLOCKER REPORT

Status: **STOPPED — NEW-ID REPLACEMENT CANNOT BE REPRESENTED BY CURRENT SCHEMA**

Date: `2026-09-02`

Source checkpoint: `e4bba766`

Production migration checkpoint: `b2ef8a61`

## 1. Completed production migration boundary

The approved immutable offer-value migration passed its production Gate and
was applied exactly once before runtime work began:

- pending set before apply: exactly
  `20260902230000_p4_09_immutable_offer_value_version`;
- structural production clone and adversarial proof: PASS;
- pending migrations after apply: `0`;
- post-apply drift: `NONE`;
- historical/fake backfill: `0`;
- production offer/referral value-version rows: `0 / 0`;
- production configuration/customer-value mutations: `0`;
- production health/readiness: PASS.

The production runtime was not switched or restarted by the migration Gate.

## 2. Runtime-alignment finding

Alignment of the seven approved action classes reached the delete/replacement
boundary and found an internal contradiction between the approved contract
and the durable schema.

The contract says:

- delete appends a terminal `RETIRED` version;
- the old internal id cannot be reactivated;
- a later exact-template replacement is a new immutable internal id.

The applied schema says:

- the retired row cannot be physically deleted;
- a version cannot follow `RETIRED`;
- `(tenantId, kind, canonicalTemplateKey)` is unconditionally unique.

The retained retired row therefore permanently occupies the unique template
key. A new internal id for the same server-owned template is impossible. The
only alternatives are to reactivate the retired id, physically delete history,
change the template key, or forbid replacement forever. Each alternative
violates an approved invariant or invents new business semantics.

`OLD INTERNAL ID REACTIVATION ALLOWED: NO`

`PHYSICAL DELETE ALLOWED: NO`

`NEW INTERNAL ID FOR SAME TEMPLATE REPRESENTABLE: NO`

`RUNTIME-ONLY FIX POSSIBLE: NO`

## 3. STOP decision

The user's explicit STOP boundary requires stopping when a new schema change
or business ambiguity is found. Therefore this cycle did not:

- implement a partial runtime that silently forbids replacement;
- weaken terminal retirement;
- reuse `externalRef` as identity;
- start any of the seven Shadow actions;
- run the P4-09 executable proof;
- modify existing P4-02 through P4-08 runtime;
- perform production offer materialization or configuration mutation.

The minimal follow-up is documented in:

`CYCLE-06-BLOCKING-PACKAGE-4-P4-09-OFFER-REPLACEMENT-LINEAGE-SCHEMA-PROPOSAL.md`.

It proposes one nullable self-lineage field, removal of the conflicting
unconditional template uniqueness, and a deferred one-live-authority guard.
No migration or schema implementation was created.

## 4. Current checkpoint

`P4-09 CONTRACT CLOSURE: COMPLETE`

`CANONICAL OFFER AUTHORITY: TenantCatalogItem`

`PRIMARY OFFER IDENTITY: IMMUTABLE INTERNAL ID`

`VERSIONED OFFER VALUE DURABLE IN PRODUCTION: YES`

`RETROACTIVE VALUE MUTATION POSSIBLE: NO`

`P4-09 RUNTIME CONTRACT ALIGNMENT: BLOCKED — OFFER REPLACEMENT LINEAGE GAP`

`CURRENT SCHEMA SUFFICIENT FOR APPROVED RETIRE→REPLACE CONTRACT: NO`

`ADDITIONAL SCHEMA REQUIRED: YES`

`P4-09 SHADOW ACTION CLASSES: 0/7`

`SHADOW DIVERGENCES: NOT MEASURED`

`P4-09 EXECUTABLE PROOF: NOT RUN`

`LEGACY BYPASS RATCHET READY: NO`

`REAL PRODUCTION CONFIG/VALUE MUTATIONS: 0`

`PROVIDER WRITES: 0`

`READY FOR P4-09 PRODUCTION CUTOVER: NO`

## 5. Process hygiene

All heavy commands ran sequentially. Every yielded foreground process was
waited to completion. Structural clone cleanup ran on both success and failure.
No watcher, temporary application server, browser, Playwright or Chrome
process was started.

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0`

`STRUCTURAL CLONE DATABASES CREATED: 3`

`STRUCTURAL CLONE DATABASES REMOVED: 3`

`TEMP DATABASES REMAINING: 0`

STOP. Explicit approval of the follow-up Schema Proposal is required before
P4-09 runtime alignment, Shadow 7/7 or executable proof can resume.
