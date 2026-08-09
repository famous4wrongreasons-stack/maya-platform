# Chapter 6 — Consent & Communication Engine

<!-- markdownlint-configure-file {"MD013": false} -->

## 6.1 Goal

No client communication is sent merely because Maya has contact data.

The engine must determine whether a specific subject may receive a specific
message, for a specific purpose, through a specific channel, at a specific
time, under a versioned policy.

This chapter is an architecture requirement, not legal advice. Legal bases,
texts and retention schedules require jurisdiction-specific approval.

## 6.2 Consent dimensions

Consent and communication policy are evaluated by:

- subject/customer;
- tenant and optional organization/location scope;
- purpose;
- channel;
- message class;
- identity used;
- legal basis;
- evidence source;
- policy/text version;
- granted, refused or withdrawn state;
- effective and expiry interval;
- jurisdiction and age/representative rules where applicable.

A single marketingConsent boolean is insufficient.

## 6.3 Purpose taxonomy

Initial purposes SHOULD distinguish:

- transactional booking confirmation;
- operational schedule change;
- service reminder;
- requested customer support reply;
- feedback/review request;
- loyalty or package information;
- personalized recommendation;
- marketing campaign;
- win-back/reactivation;
- legally required notice.

Tenants may configure policy within platform/legal bounds, but cannot redefine
marketing as transactional to bypass consent.

## 6.4 Consent evidence

Every consent event records:

- subject and identity reference;
- purpose/channel/scope;
- action: grant, refuse, withdraw or expire;
- timestamp and actor;
- source system and source event ID;
- policy/text version and locale when available;
- capture method and evidence reference;
- legal basis classification;
- import/migration provenance.

Historical evidence is immutable. Effective state is derived.

## 6.5 Effective consent

The effective-state reducer evaluates ordered events and policy:

~~~text
verified subject and identity
  + purpose/channel consent
  + legal/tenant policy
  + suppression list
  + quiet hours/frequency limits
  + current identity health
  = eligibility decision
~~~

Unknown or contradictory evidence fails closed for optional marketing.

## 6.6 Communication eligibility decision

Input:

- tenant and actor;
- customer or immutable audience snapshot;
- purpose and message class;
- requested channel;
- template/version;
- requested send time;
- campaign/action context.

Output:

~~~yaml
decision: allow | deny | defer
reasonCodes:
  - purpose_consent_missing
policySnapshotId: "pol_..."
identityId: null
nextEligibleAt: null
evaluatedAt: "..."
~~~

The decision is recalculated near execution. An old preview cannot override a
later withdrawal.

## 6.7 Suppression and contact health

Suppression reasons include:

- explicit unsubscribe or withdrawal;
- complaint;
- hard bounce or invalid destination;
- repeated delivery failure;
- identity unverified;
- legal or safety hold;
- tenant do-not-contact rule;
- global platform safety block.

Suppression is separate from consent because operational causes may block an
otherwise consented channel.

## 6.8 Audience snapshots

Bulk or segmented actions use immutable audience snapshots:

- query/segment version and evaluation time;
- candidate count;
- allowed, denied and deferred counts;
- reason breakdown;
- policy snapshot;
- identity/channel selected per subject;
- estimated cost and expiry.

Approval binds to the snapshot hash. Audience expansion after approval creates
a new draft and approval.

## 6.9 Communication workflow

~~~text
Opportunity or user request
  → PrepareCampaign ActionDraft
  → Build audience snapshot
  → Evaluate eligibility
  → Render preview and exclusions
  → Human approval where required
  → Re-evaluate eligibility at send time
  → Provider delivery
  → Receipts, failures, replies and suppressions
  → Outcome measurement
~~~

The LLM may draft content but cannot choose hidden recipients or override
eligibility.

## 6.10 Channel selection

Channel selection uses:

- verified availability;
- customer preference;
- purpose policy;
- delivery health;
- tenant cost policy;
- urgency;
- channel capability.

Fallback to another channel requires separate eligibility. Failure on one
channel is not consent for another.

## 6.11 Frequency and quiet-time policy

The engine supports:

- per-purpose frequency caps;
- tenant and customer quiet hours;
- local timezone;
- deduplication across campaigns;
- minimum interval after prior contact;
- fatigue score or suppression policy;
- emergency/transactional exceptions only when explicitly governed.

## 6.12 Customer controls

Customers SHOULD be able to:

- see understandable active preferences;
- grant or withdraw by purpose/channel;
- correct channel identities;
- opt out through each applicable delivery channel;
- obtain confirmation of the change.

Withdrawal must propagate to future eligibility and queued sends within a
defined SLA.

## 6.13 Audit and privacy

Audit stores decision metadata and evidence references, not unnecessary message
content or raw contact values. Provider credentials and raw recipient lists do
not enter LLM prompts.

## 6.14 Acceptance criteria

- Marketing is denied when consent evidence is missing.
- Transactional and marketing purposes are tested separately.
- Withdrawal after approval but before send excludes the customer.
- Bulk approval cannot be reused for a larger audience.
- Hard bounce suppresses future use of the failed identity.
- Channel fallback performs a new eligibility decision.
- Customer self-service changes are auditable and reflected in effective state.
