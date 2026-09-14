# CYCLE 06 BLOCKING PACKAGE 4 — P4-09 CANONICAL OFFER AUTHORITY CONTRACT PROPOSAL

Status: **OPTION A APPROVED — IDENTITY CLARIFICATION REQUIRES SCHEMA FOUNDATION**

Source Gate: `CYCLE-06-BLOCKING-PACKAGE-4-P4-09-VALUE-BEARING-CONFIGURATION-RUNTIME-CONTRACT-GATE.md`

Proposal date: 2026-09-02

## 1. Decision boundary

The P4-09 Runtime Contract Gate found no schema gap. It found three contract
decisions that cannot be selected by implementation convenience:

1. whether and how `TenantCatalogItem` becomes the exact authority for future
   P4-05 membership and P4-06 certificate checkout;
2. the stable offer identity/materialization/delete contract needed to avoid
   dual authority and deterministic re-creation collisions;
3. actor approval and safety limits for changing persistent future value.

Referral policy prospective behavior is already established by P4-04 and does
not require a new value representation. This proposal does not modify runtime,
schema, migrations, catalog data, referral policy, customer value, provider
state, or production.

## 2. Proposed canonical offer authority

### 2.1 Known-template-only version 1

Approve `TenantCatalogItem` as the tenant-specific availability and price
authority only for exact server-owned P4-05/P4-06 templates.

- `kind=membership` may bind only to one of the six current P4-05 offer codes;
- `kind=certificate` may bind only to one of the three current P4-06 offer
  codes;
- `TenantCatalogItem.id` is the primary immutable internal Maya offer
  identity;
- a server-owned immutable template key classifies that internal offer as one
  of the known P4-05/P4-06 templates, but is not a provider identity;
- `externalRef` remains an optional integration/provider alias under its
  historical semantics; it is not primary identity and may not participate in
  logical action identity;
- plan/product type, tier, included visits, term, service scope, certificate
  denomination type, expiry, presentation policy, and provider contract remain
  server-owned template facts, never free-form caller metadata;
- `priceKopecks`, `currency`, and `active` are the mutable tenant-specific
  value/availability facts after validation;
- a caller cannot create a seventh membership template, fourth certificate
  template, arbitrary term/service scope, percentage certificate, or new
  value type through this family.

Adding a new template is a separate product/value contract. This version-1
restriction converges the real current offers without allowing the generic
catalog DTO to define new financial semantics.

### 2.2 Future checkout boundary

After materialization and cutover, P4-05/P4-06 purchase initiation must read
the exact active tenant catalog row by tenant + internal offer id and verify
its server-owned template key.
It combines the validated mutable row with the server template and freezes
the resulting snapshot before provider dispatch.

Approve these effects:

- a configuration mutation affects only checkout intents created after that
  mutation commits;
- an existing checkout retains its exact price/currency/offer snapshot even
  if the row later changes or is withdrawn;
- successful activation uses the paid checkout snapshot, not the current row;
- existing subscription terms, certificates, referral rewards, payments, and
  redemptions are never rewritten;
- an inactive or absent row fails closed for a new checkout.

There is no fallback from an absent/inactive canonical row to a static catalog
after authority cutover. Such a fallback would create two simultaneous value
authorities and make delete silently re-enable the old offer.

### 2.3 Controlled materialization

Before P4-09 production cutover, a separate read-first establishment gate must
materialize or reconcile the nine known offer rows per tenant that actually
uses the corresponding commerce feature. It must prove:

- every row has one exact immutable internal Maya identity and one immutable
  server template key;
- no duplicate `(tenant, kind, template key)` binding;
- existing `externalRef` aliases are preserved without becoming identity;
- configured price/currency/availability matches the approved source;
- no checkout, payment, subscription, or certificate is created;
- re-run creates no duplicate configuration;
- canonical purchase does not switch authority until the tenant's required
  rows are complete.

This is configuration establishment, not a schema migration and not customer
value issuance. It requires its own production-write approval later. The safe
local P4-09 cycle may prove the contract without materializing production rows.

## 3. Proposed catalog mutation semantics

### 3.1 Identity and concurrency

For certificate and membership offers:

- create targets tenant + a server-generated immutable offer id + kind +
  immutable template key and requires that target to be absent;
- update targets the exact internal offer id and exact current immutable value
  version;
- delete is a logical retirement version for the exact internal offer id; it
  does not erase the canonical identity or its earlier versions;
- each mutation appends one immutable value version bound to its
  ActionExecution and predecessor version;
- the logical identity includes predecessor version, operation, internal
  offer id, desired snapshot, and contract version; `externalRef` is excluded;
- retries within one generation converge; an intervening update/delete makes
  a later re-assertion a new execution;
- compare-and-set on the server-read revision allows one concurrent winner;
  stale writers fail with `configuration_conflict` and do not overwrite it.

The internal row id never changes. A genuinely new offer receives a new Maya
id even if an integration later reuses an old `externalRef`. Random UUID
generation alone is not the logical idempotency identity: create also binds
the approved creation intent and exact template/value snapshot.

### 3.2 Delete and deactivate

Approve API delete as logical retirement of the current future offer. The
retirement action appends an immutable terminal value version and leaves the
internal offer identity and historical versions intact. Already frozen
checkout/value rows remain valid. New checkout fails closed because the
current version is retired.

Deactivation remains a reversible non-terminal version. A retired internal
offer cannot be silently reactivated; a later replacement is a new internal
offer identity. Neither operation cancels an existing checkout, refunds a
payment, ends a subscription, revokes a certificate, or changes issued value.

### 3.3 Narrow Package 4 ownership

P4-09 owns all certificate/membership writes through the existing full-replace
DTO because omission currently changes value fields. Inventory CRUD remains
outside P4-09. A future content-only PATCH may delegate name/description-only
changes to Package 5, but it cannot bypass the P4-09 action when price,
currency, active state, kind, or canonical offer identity might change.

## 4. Proposed value and approval profile

### 4.1 Server-derived limits

Approve the conservative version-1 envelope inherited from the already
deployed consumer catalogs:

| Configuration | Maximum mutable value | Other constraints |
| --- | ---: | --- |
| membership offer price | `600,000` kopecks | positive integer, `RUB`, known P4-05 template only |
| certificate offer price/nominal | `500,000` kopecks | positive integer, `RUB`, known P4-06 template only |
| referral reward slot liability | `50,000` kopecks | exact P4-04 fixed-money or percentage-with-cap contract |
| referral issuance aggregate liability | `100,000` kopecks | at most two configured recipient slots |

These are safety ceilings, not tariffs or required prices. A tenant may choose
a lower positive price/reward within the matching consumer contract. Zero or
missing price cannot be activated for purchase. A request above a ceiling,
outside `RUB` for version 1, or outside a known template fails closed and
requires a separately reviewed policy version.

P4-06's reconciliation envelope retains its existing child and aggregate
exposure limits. Changing a catalog row cannot raise that envelope.

### 4.2 Actor and approval

Approve:

- tenant owner or business owner may request and approve one value-bearing
  configuration action;
- tenant admin or administrator may prepare/request the action but cannot be
  the final approver for a price, currency, enablement, deletion, or reward
  liability change;
- requester and approver must be active same-tenant memberships;
- approval is bound to the exact predecessor revision and desired snapshot;
- any change after approval invalidates approval;
- one execution mutates one catalog target or the one referral singleton;
- no batch endpoint, scheduler, cross-tenant envelope, or approval reuse is
  authorized.

The current P4-04 owner approval for actual reward issuance remains required;
approving referral configuration does not pre-approve later reward value.

## 5. Referral policy mutation retained

`update_referral_reward_policy` uses the current tenant singleton and the
P4-04 denomination/check constraints:

- each slot is absent, fixed-money, or percentage with explicit liability cap;
- mixed denomination facts for one slot fail closed;
- currency and liability stay inside the version-1 profile;
- policy update affects qualified-but-unissued referrals at issuance time;
- existing issuance/reward rows are immutable and never recalculated;
- terms/code-prefix may be carried in the same approved singleton snapshot,
  but neither field becomes value or authorization authority.

No implicit reward-to-points conversion is introduced.

## 6. Outcome, provider, and ratchet contract

All seven configuration actions are pure PostgreSQL mutations:

- commit is `SUCCEEDED`;
- rollback/conflict is not success;
- `UNKNOWN` is not created;
- provider reconciliation and provider writes do not exist in P4-09;
- communication/catalog presentation occurs after the committed configuration
  result and is not part of the value mutation.

The eventual ratchet must:

1. allow inventory CRUD to remain outside this Package 4 family;
2. require all certificate/membership value-bearing branches and referral
   reward-policy writes to enter the canonical P4-09 executor;
3. fail on a synthetic direct `TenantCatalogItem` certificate/membership or
   `ReferralProgram` writer;
4. verify P4-05/P4-06 purchase resolvers consume only the exact canonical row
   after authority materialization;
5. forbid static-catalog fallback once the tenant is switched;
6. preserve immutable P4-04/P4-05/P4-06 result writers.

## 7. Schema impact after approved identity clarification

The approved clarification makes the existing schema insufficient. The
current row has an internal id, but its value-bearing fields are overwritten
in place and there is no immutable version row, predecessor claim, current
version pointer, or tenant-qualified ActionExecution binding. `updatedAt` and
an unbound execution snapshot cannot enforce the approved append-only rule.

The minimum additive design is specified in:

`CYCLE-06-BLOCKING-PACKAGE-4-P4-09-IMMUTABLE-OFFER-VALUE-VERSION-SCHEMA-PROPOSAL.md`.

No migration is created or applied by this contract correction.

## 8. Acceptance criteria

After explicit schema approval, foundation, and migration gate, the safe local
P4-09 cycle may implement seven non-executable Shadows and continue through
targeted/adversarial PostgreSQL proof. It must prove:

- exact internal identity, known-template mapping, and tenant isolation;
- server-derived price/currency/template/policy facts;
- deterministic create/update/delete/re-create generations;
- same-generation retry and concurrent convergence;
- stale-revision rejection;
- approved actor and snapshot-bound owner approval;
- existing checkout/issued value remains immutable;
- future checkout observes the new committed row only;
- missing/inactive row fails closed and never falls back;
- caps are enforced before configuration mutation;
- referral configuration cannot bypass P4-04 issuance caps/approval;
- no production configuration, customer value, payment, or provider write.

## 9. Proposal verdict

`P4-09 CONTRACT PROPOSAL READY: YES`

`CANONICAL OFFER AUTHORITY: TENANTCATALOGITEM AFTER CONTROLLED MATERIALIZATION`

`SUPPORTED OFFER TEMPLATES: EXISTING P4-05/P4-06 CODES ONLY`

`PRIMARY CANONICAL OFFER IDENTITY: IMMUTABLE TENANTCATALOGITEM.ID`

`EXTERNALREF PRIMARY IDENTITY: NO — INTEGRATION ALIAS ONLY`

`IMMUTABLE OFFER VALUE VERSION: REQUIRED`

`STATIC FALLBACK AFTER AUTHORITY CUTOVER: FORBIDDEN`

`CONFIGURATION EFFECT BOUNDARY: FUTURE CHECKOUT/ISSUANCE ONLY`

`ALREADY INITIATED/ISSUED VALUE MUTATES: NO`

`MEMBERSHIP PRICE SAFETY CEILING PROPOSED: 600000 KOPECKS`

`CERTIFICATE VALUE SAFETY CEILING PROPOSED: 500000 KOPECKS`

`REFERRAL REWARD CAPS: EXISTING P4-04 LIMITS`

`VALUE CONFIG FINAL APPROVER PROPOSED: SAME-TENANT OWNER`

`BULK VALUE CONFIGURATION: FORBIDDEN`

`ADDITIONAL SCHEMA REQUIRED: YES — MINIMAL APPEND-ONLY VALUE VERSION FOUNDATION`

`CONTROLLED PRODUCTION CATALOG MATERIALIZATION REQUIRED BEFORE CUTOVER: YES`

`PRODUCTION CONFIG/VALUE MUTATIONS: 0`

`P4-09 SHADOW AUTHORIZED: NO — SCHEMA PROPOSAL APPROVAL/FOUNDATION REQUIRED`

STOP.
