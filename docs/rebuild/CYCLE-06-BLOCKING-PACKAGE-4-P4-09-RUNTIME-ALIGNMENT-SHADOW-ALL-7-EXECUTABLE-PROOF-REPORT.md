# Cycle 06 Blocking Package 4 — P4-09 Runtime Alignment, Shadow 7/7, and ALL-7 Executable Proof

Date: 2026-09-03

## 1. Scope and production boundary

This checkpoint resumed P4-09 after the production migration provenance was
reconciled. The approved replacement-lineage migration was re-gated, applied,
and recorded separately in
`CYCLE-06-BLOCKING-PACKAGE-4-P4-09-OFFER-REPLACEMENT-LINEAGE-PRODUCTION-MIGRATION-GATE-APPLY-REPORT.md`.

The remaining work in this checkpoint was local and non-production:

- align the seven canonical value-configuration contracts with immutable
  internal offer identities and append-only value versions;
- implement and verify seven physically non-executable Shadow plans;
- prove all seven canonical mutations against a disposable PostgreSQL
  database;
- stage a fail-closed canonical offer resolver for future P4-05/P4-06
  issuance;
- prepare a narrow pre-cutover bypass ratchet.

No production catalog, referral policy, checkout, payment, subscription,
certificate, referral reward, loyalty, or provider state was created or
changed by this local proof.

## 2. Production migration result

The production migration gate established:

- expected-only pending migration:
  `20260903010000_p4_09_offer_replacement_lineage`;
- structural clone and lineage adversarial proof: PASS;
- production apply: exactly the approved lineage migration;
- pending migrations after apply: `0`;
- post-apply drift: `NONE`;
- historical offer/version data preserved: YES;
- fake replacement backfill: NO;
- production health/readiness: PASS;
- production configuration/value mutations: `0`.

The migration checkpoint is repository commit `6197ab70`.

## 3. Runtime contract alignment

The Action Engine now registers Shadow and executable capabilities for exactly
seven action classes:

1. `create_gift_certificate_offer`;
2. `update_gift_certificate_offer`;
3. `delete_gift_certificate_offer`;
4. `create_customer_membership_offer`;
5. `update_customer_membership_offer`;
6. `delete_customer_membership_offer`;
7. `update_referral_reward_policy`.

The aligned path derives immutable offer/version identities, predecessor
versions, value snapshots, requester membership, policy snapshot, approval
requirement, and safety limits server-side. Executable changes require an
active same-tenant requester and an active tenant/business owner approval
bound to the exact normalized input.

All seven mutations are pure PostgreSQL operations. The executor holds a
target-scoped transaction advisory lock and commits the domain version, audit
fact, ActionAttempt, and final ActionExecution state in one serializable
transaction. External dispatch is not crossed, `UNKNOWN` is not used, and
provider writes do not exist.

Approved policy remains exact:

- one target per mutation;
- bulk mutation forbidden;
- membership cap: `600000` kopecks;
- certificate cap: `500000` kopecks;
- referral cap per slot: `50000` kopecks;
- referral aggregate cap: `100000` kopecks;
- referral recipients: at most `2`;
- currency: `RUB`;
- every value-bearing change requires owner approval.

`externalRef` is retained only as a mutable integration alias. It is excluded
from canonical identity and value-snapshot identity.

## 4. Shadow 7/7

The executable PostgreSQL proof first planned all seven actions through their
Shadow capabilities. Every result reported:

- Shadow divergence: `0`;
- configuration mutations: `0`;
- customer-value mutations: `0`;
- provider writes: `0`.

The architectural ratchet additionally proves that the Shadow service calls
`planShadow` and contains no catalog or referral mutation operation and no
reference to the executable service.

## 5. ALL-7 executable PostgreSQL proof

The proof ran after a clean replay of all `69` migrations in an isolated
database whose name was restricted to `maya_c06_p409_all7_*`. Cleanup was
owned by a shell trap and the database was dropped after the run.

The proof established:

- every action class reaches one canonical `SUCCEEDED` ActionExecution;
- unapproved mutations fail closed;
- retry and restart restore the same execution/result;
- duplicate concurrent delivery of one mutation creates one version;
- two different approved updates from the same predecessor have one winner
  and one stale/conflict rejection;
- prior value versions remain immutable;
- retirement is append-only;
- replacement gets a new immutable offer id and durable predecessor lineage;
- the old retired offer cannot resolve through a static-catalog fallback;
- the canonical authority resolver returns the exact current value-version id
  and current tenant price for future certificate/membership issuance;
- a historical certificate stays on its original value snapshot after a
  later offer version and replacement;
- a historical subscription term stays on its original value snapshot and
  price after a later membership version;
- an already issued referral reward retains its frozen value after a later
  referral policy version;
- `externalRef` does not become offer identity;
- cross-tenant access and forged caps/bulk authority fail closed;
- customer-value mutations and provider writes remain `0`.

## 6. Bypass ratchet

The narrow pre-cutover ratchet records exactly the accepted current baseline:

`1 production bypass group / 4 direct-mutation subgroups`

The subgroups are catalog create, catalog update, catalog hard delete, and
referral-program upsert in `BusinessContentService`. The ratchet detects each
direct writer independently, proves a canonical delegation sample is clean,
does not exclude the business-content directory, and classifies the
PostgreSQL proof as disposable/test-only.

At the separately approved production runtime cutover, this accepted baseline
must be changed from four to zero. Until then the legacy owner remains active
and no production execution ownership has changed.

## 7. Required production materialization boundary

The approved Canonical Offer Authority contract requires a controlled,
read-first establishment of the nine known offer rows for each tenant using
P4-05/P4-06 commerce before purchase initiation may switch away from the
static catalogs. Production currently contains `0` `TenantCatalogItem` rows
and `0` offer-version rows, as recorded by both production schema gates.

Therefore an immediate runtime cutover would make all new membership and gift
certificate checkouts fail closed. The canonical resolver is implemented and
proven locally, but it is deliberately not wired into the already deployed
P4-05/P4-06 production purchase paths. There is no static fallback in the
staged resolver.

The next safe production step is the separately approved offer
materialization/reconciliation gate. It must establish exact internal ids,
template bindings, initial immutable value versions, prices/currency and
availability without creating checkout/payment/customer value, then prove
idempotency and complete coverage. This checkpoint does not authorize those
production configuration writes.

## 8. Verification evidence

| Verification | Result |
| --- | --- |
| Production lineage migration | PASS — pending `0`, drift `NONE`, health/readiness PASS |
| Prisma validate | PASS |
| Clean migration replay | PASS — `69/69` |
| Targeted Jest | PASS — `6/6` suites, `32/32` assertions |
| PostgreSQL Shadow + ALL-7 proof | PASS — Shadow `7/7`, executable `7/7` |
| Concurrent distinct-version proof | PASS — one winner |
| Application typecheck | PASS |
| Scripts typecheck | PASS |
| Targeted ESLint | PASS |
| Production configuration/value mutations | `0` |
| Provider writes | `0` |
| Temporary proof databases remaining | `0` |

## 9. Verdict

`P4-09 RUNTIME CONTRACT ALIGNMENT: COMPLETE`

`OFFER REPLACEMENT LINEAGE: ENFORCED`

`CANONICAL OFFER AUTHORITY: TenantCatalogItem`

`PRIMARY OFFER IDENTITY: IMMUTABLE INTERNAL ID`

`externalRef PRIMARY IDENTITY: NO`

`VERSIONED OFFER VALUE: ENFORCED`

`RETROACTIVE VALUE MUTATION POSSIBLE: NO`

`OWNER APPROVAL: ENFORCED`

`BLAST-RADIUS CAPS: ENFORCED`

`P4-09 SHADOW ACTION CLASSES: 7/7`

`SHADOW DIVERGENCES: 0`

`P4-09 ALL-7 EXECUTABLE PROOF: PASS`

`DUPLICATE VALUE CONFIG MUTATION POSSIBLE: NO`

`HISTORICAL/FROZEN VALUE REBOUND POSSIBLE: NO`

`UNKNOWN REQUIRED: NO`

`LEGACY BYPASS RATCHET READY: YES`

`REAL PRODUCTION CONFIG/VALUE MUTATIONS: 0`

`PROVIDER WRITES: 0`

`READY FOR P4-09 PRODUCTION CUTOVER: NO — CONTROLLED CANONICAL OFFER MATERIALIZATION REQUIRED`

`NEXT PACKAGE 4 FAMILY STARTED: NO`

STOP.
