# CYCLE 06 BLOCKING PACKAGE 4 — P4-09 VALUE-BEARING CONFIGURATION RUNTIME CONTRACT GATE

Status: **COMPLETE — CONTRACT DECISION REQUIRED BEFORE SHADOW**

Source checkpoint: `b825eb70`

Gate date: 2026-09-02

## 1. Scope and evidence boundary

This Gate analyzes only `P4-09 / A27-V`: value-bearing configuration for
customer subscription offers, gift-certificate offers, and referral rewards.
It does not reopen the already completed P4-02 through P4-08 families and it
does not start ordinary inventory or other Package 5 content work.

Evidence was taken from:

- the accepted post-P4-08 remainder checkpoint and Package 4 monetary/value
  and schema-foundation reports;
- `BusinessContentController`, `BusinessContentService`, and their DTOs;
- Prisma `TenantCatalogItem`, `ReferralProgram`, `ActionExecution`,
  `CustomerSubscription`, `GiftCertificate`, and referral reward models;
- the production P4-04 referral reward issuer;
- the production P4-05 and P4-06 purchase/activation contracts and their
  immutable result aggregates.

No runtime, schema, migration, configuration, provider, production, or value
state changed during this Gate. A08 remains disabled.

## 2. Current production owners and bypass inventory

P4-09 is one production-reachable bypass group: authenticated HTTP invokes
`BusinessContentService` directly instead of Canonical Action Ingress.

There are four concrete direct-mutation implementation subgroups:

| Subgroup | Production entry points | Current owner | Direct mutation |
| --- | --- | --- | --- |
| catalog create | certificate and membership `POST` routes | `BusinessContentService.createCatalogItem` | inserts `TenantCatalogItem` |
| catalog replace/update | certificate and membership `PUT` routes | `BusinessContentService.updateCatalogItem` | overwrites the current catalog row |
| catalog delete | certificate and membership `DELETE` routes | `BusinessContentService.deleteCatalogItem` | physically deletes the current catalog row |
| referral program update | referral `PUT` route | `BusinessContentService.updateReferralProgram` | upserts the tenant singleton `ReferralProgram` |

The same three catalog methods also serve ordinary inventory. Inventory is
not P4-09, so a future ratchet must inspect the value-bearing certificate and
membership branches narrowly. It may not exclude the whole service or forbid
the unrelated inventory path.

The AI tool catalog exposes read-only certificate, membership, and referral
program tools. No production AI write tool, scheduler, bulk writer, provider
writer, or background configuration writer was found.

`P4-09 PRODUCTION BYPASS GROUPS: 1`

`P4-09 DIRECT-MUTATION SUBGROUPS: 4`

## 3. Exact action classes

The real HTTP mutation boundaries yield seven action classes. Creation,
replacement, and deletion are not one business identity: they have different
existence preconditions, result facts, replay behavior, and conflict rules.
Certificate and membership targets are also separate because their future
value consumers and frozen facts differ.

| Order | Action class | Exact target/effect |
| ---: | --- | --- |
| 1 | `create_gift_certificate_offer` | create one tenant-wide certificate offer configuration |
| 2 | `update_gift_certificate_offer` | replace one exact existing certificate offer configuration |
| 3 | `delete_gift_certificate_offer` | withdraw one exact existing certificate offer configuration |
| 4 | `create_customer_membership_offer` | create one tenant-wide membership/subscription offer configuration |
| 5 | `update_customer_membership_offer` | replace one exact existing membership/subscription offer configuration |
| 6 | `delete_customer_membership_offer` | withdraw one exact existing membership/subscription offer configuration |
| 7 | `update_referral_reward_policy` | create or update the tenant singleton referral reward policy |

The referral singleton remains one action class because its current endpoint
is a partial upsert of one durable target. Fixed-money and percentage reward
slots are denominations inside that policy, not separate action identities.

The catalog DTO currently uses full-replacement semantics: omitted price is
written as `NULL`, omitted currency becomes `RUB`, and omitted `active`
becomes `true`. Consequently even a seemingly descriptive certificate or
membership `PUT` can alter value/availability. Until a later content-only
PATCH contract exists, every certificate/membership write above belongs to
the value-bearing boundary. Inventory remains excluded.

## 4. Durable state already available

### 4.1 Current configuration

`TenantCatalogItem` already provides tenant, kind, stable row id, optional
external reference, current price/currency/availability, metadata, and a
durable `updatedAt` revision fact. It is tenant-wide; no branch-qualified
catalog contract exists. The Gate therefore does not invent branch overrides.

`ReferralProgram` is one tenant-qualified row with fixed-money and percentage
reward slots, explicit percentage liability caps, currency, enablement, and a
durable `updatedAt` revision fact. PostgreSQL already rejects mixed or
incomplete denomination contracts.

### 4.2 Mutation history and re-assertion

`ActionExecution` can retain the exact pre-mutation snapshot, desired
snapshot, target, actor/policy/approval evidence, predecessor execution, and
safe result. The current row's `updatedAt` plus the previous successful target
execution can form a durable predecessor chain. That chain distinguishes
`A -> B`, retry of `A -> B`, `B -> A`, and a later new `A -> B` without random
epochs or a generic revision table.

For a deleted target, the successful delete execution is the durable
predecessor for a later re-create. This is safe only after an immutable
logical offer key has been approved; current optional/mutable `externalRef`
does not yet provide that contract.

### 4.3 Frozen customer value

The prior families already prevent retroactive value mutation:

- P4-04 copies denomination, amount/percentage, maximum liability, currency,
  policy snapshot, expiry, recipient, and presentation facts into immutable
  issuance/reward rows;
- P4-05 copies plan, price, currency, allowance, service scope, and term facts
  into immutable `CustomerSubscription` terms;
- P4-06 copies nominal amount, currency, offer snapshot, recipient subject,
  expiry, and presentation-key version into immutable `GiftCertificate` rows.

A configuration mutation must never update those rows. There is no schema
path by which the current catalog or referral policy can rewrite them.

`RETROACTIVE VALUE MUTATION POSSIBLE: NO`

## 5. Proven referral-policy boundary

The P4-04 production issuer reads the current tenant `ReferralProgram` only
when it creates the one issuance for a qualified referral. It then freezes a
policy snapshot and exact reward rows. Therefore the already accepted
prospective boundary is:

- an issued referral reward never changes;
- a qualified but not-yet-issued referral uses the policy authoritative at
  issuance time;
- a referral with an existing issuance returns that issuance without reading
  or applying a later policy;
- fixed-money and percentage rewards remain native denominations; no
  conversion to loyalty points exists;
- the P4-04 caps remain authoritative: at most two recipients, `50,000`
  kopecks liability per reward, `100,000` kopecks per issuance, and owner
  approval for executable issuance from one kopeck.

P4-09 may configure a policy only within that already approved value envelope.
Raising a P4-04 issuance cap is not a configuration update; it requires a new
policy approval outside this Gate.

## 6. Blocking canonical-offer authority gap

The certificate and membership rows are described as sellable offers and are
returned by customer-readable HTTP/AI surfaces. However they are not the
current production value authority:

- P4-05 resolves six subscription offers from
  `CUSTOMER_SUBSCRIPTION_PURCHASE_OFFERS` under
  `p4-05.legacy-fixed-catalog.v1` and never reads `TenantCatalogItem`;
- P4-06 resolves three certificate offers from
  `GIFT_CERTIFICATE_PURCHASE_OFFERS` under
  `p4-06.legacy-fixed-catalog.v1` and never reads `TenantCatalogItem`;
- membership catalog rows do not carry typed plan/tier, allowance, term, or
  service-scope facts through the write DTO;
- certificate and membership `externalRef` is optional and mutable, so it is
  not yet an exact link to either static canonical offer code;
- production may therefore advertise one active price while canonical
  checkout applies another, or mutate a row with no effect on future issuance.

The frozen P4-05/P4-06 checkout contract does settle the retrospective
boundary once an authoritative offer is selected: a later configuration
change cannot alter an already initiated checkout, payment, activated term,
or issued certificate. What is not settled is which row selects and prices a
future checkout, how existing static offers are materialized, and what delete
means when a static fallback exists.

Encoding any of those choices in Shadow would invent business/payment
semantics. The companion proposal isolates the required decision.

`CANONICAL OFFER AUTHORITY CONTRACT: INCOMPLETE`

## 7. Idempotency, concurrency, and local outcome contract

Once the offer-key decision is approved, the local contract is otherwise
complete:

- create identity: tenant + value kind + immutable offer key + desired
  snapshot + durable predecessor target execution;
- update identity: tenant + row/offer key + server-read current revision and
  snapshot + desired snapshot + mutation-contract version;
- delete identity: tenant + row/offer key + server-read current revision and
  pre-delete snapshot + delete-contract version;
- referral identity: tenant singleton + server-read current revision/snapshot
  + desired policy snapshot + contract version;
- retry/restart inside one predecessor state converges on one execution;
- a new mutation after an intervening successful mutation gets a new identity;
- concurrent writers use the same server-read revision; one transaction wins
  and stale executions reconcile or fail with `configuration_conflict`;
- a no-op desired state returns the exact existing state and creates no new
  configuration effect.

All seven mutations are local PostgreSQL operations. There is no provider
dispatch and no reason to manufacture `UNKNOWN`: commit or rollback is the
authoritative outcome. No reconciliation subsystem is required beyond reading
the execution and current configuration state after a local crash.

`UNKNOWN/RECONCILIATION CONTRACT: NOT REQUIRED`

## 8. Policy, approval, and blast-radius gap

The current controller accepts tenant owner, business owner, tenant admin, and
administrator roles and immediately mutates configuration. It does not use
Action Engine policy/approval and permits prices/reward amounts up to two
billion kopecks at the DTO layer.

Existing consumer contracts provide upper safety envelopes, but do not by
themselves decide who may change future commercial value:

- P4-04 has exact per-reward/per-issuance caps;
- P4-05's current server catalog tops out at `600,000` kopecks and supports
  only its six exact plan templates;
- P4-06's current server catalog tops out at `500,000` kopecks and its
  reconciliation envelope remains bounded by the accepted P4-06 limits;
- there is no bulk value-configuration endpoint or scheduler; each request
  can be limited to one target.

Whether tenant admins may commit these changes directly or only request an
owner-approved action is a business authority decision. So are the exact
rules for prices below/above the current consumer envelopes and creation of a
new offer key. The companion proposal recommends a conservative version-1
profile, but it is not approved by this Gate.

`POLICY/APPROVAL/BLAST-RADIUS CONTRACT: INCOMPLETE`

## 9. Schema verdict

The missing facts are authority and runtime-contract decisions, not a durable
storage deficit. Existing rows, `updatedAt`, retained ActionExecution
snapshots/predecessors, and frozen consumer aggregates can represent the safe
contract. `metadataJson` is available if a later approved server-owned typed
template reference needs retention; raw caller JSON must not become value
authority.

No schema or migration is proposed.

`CANONICAL SCHEMA SUFFICIENT: YES`

`ADDITIONAL SCHEMA REQUIRED: NO`

## 10. Gate verdict

The exact mutation surfaces and non-retroactivity boundary are known, but
Shadow cannot start until canonical offer authority and value-configuration
approval limits are explicitly approved in:

`CYCLE-06-BLOCKING-PACKAGE-4-P4-09-CANONICAL-OFFER-AUTHORITY-CONTRACT-PROPOSAL.md`.

`P4-09 RUNTIME CONTRACT GATE COMPLETE: YES`

`P4-09 EXACT ACTION CLASSES: 7 — create_gift_certificate_offer / update_gift_certificate_offer / delete_gift_certificate_offer / create_customer_membership_offer / update_customer_membership_offer / delete_customer_membership_offer / update_referral_reward_policy`

`P4-09 PRODUCTION BYPASS GROUPS: 1`

`P4-09 DIRECT-MUTATION SUBGROUPS: 4`

`CANONICAL SCHEMA SUFFICIENT: YES`

`ADDITIONAL SCHEMA REQUIRED: NO`

`RETROACTIVE VALUE MUTATION POSSIBLE: NO`

`P4-09 SHADOW ACTION CLASSES: 0/7`

`P4-09 EXECUTABLE PROOF: NOT RUN`

`DUPLICATE VALUE CONFIG MUTATION POSSIBLE: YES — CURRENT DIRECT OWNER HAS NO CANONICAL CLAIM`

`POLICY/APPROVAL/BLAST-RADIUS: NOT ENFORCED`

`LEGACY BYPASS RATCHET READY: NO`

`REAL PRODUCTION CONFIG/VALUE MUTATIONS: 0`

`PROVIDER WRITES: 0`

`READY FOR P4-09 PRODUCTION CUTOVER: NO`

`P4-10 STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP.
