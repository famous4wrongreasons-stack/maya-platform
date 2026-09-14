# CYCLE 06 BLOCKING PACKAGE 4 — P4-09 CANONICAL OFFER AUTHORITY DECISION BRIEF

Status: **OPTION A APPROVED — IDENTITY CLARIFICATION RECORDED; NOT IMPLEMENTED**

Source checkpoint: `c663ebc5`

Source proposal:
`CYCLE-06-BLOCKING-PACKAGE-4-P4-09-CANONICAL-OFFER-AUTHORITY-CONTRACT-PROPOSAL.md`

Brief date: 2026-09-02

## 1. Decision to make

P4-05 and P4-06 currently use server-owned static catalogs, while
`TenantCatalogItem` is separately writable and customer-readable. P4-09 must
choose one unambiguous authority for future offer price and availability
without changing an already initiated checkout or already issued/frozen
customer value.

All safe options below preserve these non-negotiable facts:

- P4-04 referral rewards, P4-05 subscription terms, and P4-06 gift
  certificates remain immutable after issuance/activation;
- configuration affects only a future value boundary explicitly defined by
  the option;
- one local PostgreSQL commit/rollback owns configuration outcome;
- no provider dispatch and no `UNKNOWN` state exist in P4-09;
- server-derived policy and same-tenant authorization remain mandatory;
- P02/P03, A08, and completed P4-02 through P4-08 baselines are unchanged.

## 2. Option A — known-template tenant authority

**Canonical offer authority:** `TenantCatalogItem` owns tenant-specific
price, currency, and availability after controlled materialization. The
existing P4-05/P4-06 code catalog owns the non-mutable product template:
plan/product type, tier, allowance, term, service scope, denomination type,
expiry, presentation, and provider contract.

**Immutable offer identity:** `TenantCatalogItem.id` is the primary internal
Maya identity. `externalRef` remains an optional integration/provider alias
and is excluded from logical identity. A separate immutable server template
key maps the internal offer to one known P4-05/P4-06 template.

**Versioning:** every value mutation appends an immutable, internally
identified version bound to its predecessor and ActionExecution. The current
offer points to that version; checkout freezes the exact version id and
snapshot hash. The approved clarification therefore requires the minimal
schema foundation identified after this brief.

**P4-05 subscription:** resolves one active `kind=membership` row by tenant +
one of the six known offer codes, combines it with the immutable P4-05
template, and freezes price/currency plus all plan facts before dispatch.

**P4-06 certificate:** resolves one active `kind=certificate` row by tenant +
one of the three known offer codes, combines it with the immutable P4-06
template, and freezes nominal/currency/expiry/presentation facts before
dispatch.

**Referral future value:** does not use `TenantCatalogItem`.
`ReferralProgram` remains the tenant policy authority. P4-04 reads it at
reward issuance and freezes the exact denomination, liability, currency, and
policy snapshot. Qualified but unissued referrals see the current policy;
issued rewards never change.

**Who may change value:** tenant/business owner is the final approver. A
tenant admin/administrator may request or prepare the exact mutation but may
not self-approve it.

**Automatic changes:** only an exact idempotent no-op. Pure descriptive
content changes can later use a separate content-only contract; the current
full-replacement DTO cannot safely classify them as non-value.

**Approval required:** create, price/currency change, enable/disable, delete,
re-create, and any referral reward denomination/liability change. Approval is
bound to the exact predecessor revision and desired snapshot.

**Hard caps/blast radius:** known templates only; one target per execution;
no bulk or scheduler; membership price at most `600,000` kopecks; certificate
value at most `500,000` kopecks; referral liability at most `50,000` kopecks
per slot, `100,000` per issuance, and two recipients. Existing P4-06
reconciliation limits remain unchanged.

**Issued/frozen protection:** configuration is read only at new checkout or
reward-issuance planning. Existing checkout, payment, subscription term,
certificate, reward, redemption, and fulfillment rows are never recomputed.

**Pros:** tenant-specific pricing/availability; reuses current schema; keeps
complex product semantics server-owned; closes the current advertised-price
versus checkout-price split.

**Cons:** needs controlled production materialization before authority
cutover; P4-05/P4-06 resolvers must be aligned; static fallback must then be
removed; new product templates still require a separate contract.

**Complexity:** medium. One additive version foundation/migration,
runtime/DTO alignment, local executable proof, one controlled data-
establishment gate, and a narrow bypass ratchet.

## 3. Option B — static server catalog remains authoritative

**Canonical offer authority:** the versioned P4-05/P4-06 code catalogs remain
the sole price, availability, and product authority. `TenantCatalogItem` is a
non-authoritative presentation/projection row only.

**Immutable offer identity:** the static server offer code is canonical.
`externalRef` is a projection correlation alias, not value identity.

**Versioning:** code catalog version plus deployment/release identity. Each
checkout freezes the selected static version and exact facts.

**P4-05 subscription:** continues using the current six static offers. A
tenant catalog row cannot change checkout price, allowance, term, or scope.

**P4-06 certificate:** continues using the current three static offers. A
tenant catalog row cannot change nominal, expiry, or availability.

**Referral future value:** `ReferralProgram` remains separately canonical and
is frozen at P4-04 issuance exactly as in Option A.

**Who may change value:** P4-05/P4-06 offer value changes require reviewed
code/config release authority. Tenant users cannot change those values.
Referral policy changes still require same-tenant owner approval.

**Automatic changes:** idempotent projection refresh and non-value
description changes only. No tenant-originated price/availability change is
automatic or value-bearing.

**Approval required:** code review/release approval for certificate or
membership value; owner approval for referral reward policy.

**Hard caps/blast radius:** existing static catalogs and P4-04/P4-05/P4-06
caps remain exact. No runtime offer expansion is allowed.

**Issued/frozen protection:** strongest simple boundary: new and old checkout
facts are tied to explicit code versions, and projections cannot mutate value.

**Pros:** lowest financial ambiguity; minimal runtime change; no catalog data
establishment; straightforward audit of supported prices and products.

**Cons:** removes tenant-configurable pricing/availability; current write UI
and customer-readable catalog become misleading unless narrowed; does not
deliver the tenant offer authority anticipated by the existing P4-09
proposal; every value change needs a release.

**Complexity:** low to medium. Fewer value executors, but existing HTTP writes
must be fenced so presentation rows cannot claim financial authority.

## 4. Option C — append-only canonical offer versions

**Canonical offer authority:** a dedicated immutable offer aggregate and
append-only offer versions own both server-approved template identity and
tenant-specific price/availability. `TenantCatalogItem` becomes a projection.

**Immutable offer identity:** new internal `Offer.id`; aliases such as
`externalRef` map to it but never become identity. Each value revision has a
separate immutable version id.

**Versioning:** first-class append-only `OfferVersion` rows with one current
pointer or effective boundary. Every checkout binds the exact version id and
snapshot hash.

**P4-05 subscription:** resolves an exact membership offer version and freezes
its approved plan, price, scope, allowance, and term facts.

**P4-06 certificate:** resolves an exact certificate offer version and freezes
nominal, currency, expiry, and presentation facts.

**Referral future value:** may remain in separately versioned
`ReferralProgram` snapshots or move to an equivalent policy-version aggregate;
either way issued P4-04 reward rows remain immutable.

**Who may change value:** tenant/business owner final approval, with optional
platform approval for introducing a new template/value type.

**Automatic changes:** no-op and approved effective-date projection only.
Every new value version is an explicit append-only action.

**Approval required:** every new value version, retirement, reactivation, or
new template. Higher-risk template/value-type additions require separate
platform policy approval.

**Hard caps/blast radius:** at least the Option A ceilings; one offer version
per execution; no bulk; additional product types remain fail-closed.

**Issued/frozen protection:** direct version binding gives the strongest
historical proof. Old versions remain addressable and cannot be overwritten.

**Pros:** clearest audit/history; easiest future effective dating and new
template support; no dependence on mutable aliases or timestamps for version
identity.

**Cons:** contradicts the accepted current conclusion that no standalone
revision table is required; needs a new Schema Gate, migration, backfill/data
establishment, and broader P4-05/P4-06 alignment; largest review surface.

**Complexity:** high. Safe, but disproportionate for the known nine templates
and outside the currently approved P4-09 schema boundary.

## 5. Comparison

| Criterion | A — known-template tenant authority | B — static authority | C — append-only versions |
| --- | --- | --- | --- |
| tenant-specific price/availability | yes | no | yes |
| one runtime financial authority | yes | yes | yes |
| reuses current schema | yes | yes | no |
| supports arbitrary new templates | no | no | potentially, after a new contract |
| explicit historical version rows | no; ActionExecution snapshots | code/release history | yes |
| controlled catalog materialization | required | not required | required |
| implementation risk | medium | low | high |
| matches existing P4-09 proposal | yes | no | no |

## 6. Recommended architecture

Recommend **Option A**.

It creates one canonical tenant offer authority without allowing free-form
catalog metadata to define financial products. It preserves the already
approved P4-05/P4-06 server templates, uses the current schema and
ActionExecution version chain, and makes configuration strictly prospective.
It also avoids Option B's permanent mismatch between tenant-visible catalog
and executable checkout, while avoiding Option C's unnecessary schema and
migration surface.

For terminology, `TenantCatalogItem.id` is the immutable canonical offer
identity in Option A. `externalRef` remains only an integration alias and can
retain its historical semantics. A server-owned template key classifies the
offer without becoming its identity. Value versions are append-only and
internally identified; logical retirement preserves the offer and all earlier
versions.

Option A must not cut over until controlled materialization proves complete
coverage and P4-05/P4-06 have no static fallback for switched tenants.

## 7. Direct answers

`TenantCatalogItem AS CANONICAL AUTHORITY: YES — TENANT PRICE/CURRENCY/AVAILABILITY FOR KNOWN SERVER TEMPLATES`

`externalRef AS PRIMARY CANONICAL OFFER IDENTITY: NO — INTEGRATION/PROVIDER ALIAS ONLY`

`IMMUTABLE INTERNAL OFFER IDENTITY REQUIRED: YES — TENANTCATALOGITEM.ID`

`VERSIONED OFFER VALUE REQUIRED: YES — APPEND-ONLY INTERNAL VERSION + ACTIONEXECUTION BINDING + CHECKOUT SNAPSHOT HASH`

`ISSUED/FROZEN VALUE CHANGES RETROACTIVELY: NO`

`RECOMMENDED APPROVAL THRESHOLDS: SAME-TENANT OWNER APPROVAL FOR EVERY CREATE, PRICE/CURRENCY CHANGE, ENABLE/DISABLE, DELETE/RE-CREATE, OR REFERRAL DENOMINATION/LIABILITY CHANGE; EXACT NO-OP REQUIRES NO APPROVAL; P4-04 ISSUANCE APPROVAL FROM 1 KOPECK REMAINS SEPARATE`

`RECOMMENDED BLAST-RADIUS CAPS: ONE TARGET PER EXECUTION; NO BULK; 6 KNOWN MEMBERSHIP + 3 KNOWN CERTIFICATE TEMPLATES ONLY; MEMBERSHIP <= 600000 KOPECKS; CERTIFICATE <= 500000 KOPECKS; REFERRAL <= 50000 KOPECKS PER SLOT / <= 100000 KOPECKS PER ISSUANCE / <= 2 RECIPIENTS; EXISTING P4-06 RECONCILIATION CAPS UNCHANGED`

`RECOMMENDED OPTION: A`

`CODE/SCHEMA/RUNTIME CHANGES: 0`

`PRODUCTION WRITES: 0`

STOP.
