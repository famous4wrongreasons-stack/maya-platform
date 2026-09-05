# Package 5 B22 Tip Contract V1 — Owner Decision Proposal

Status: **OWNER DECISION REQUIRED; RUNTIME/SCHEMA/MIGRATION NOT STARTED**.

Accepted checkpoint: `99e403c4`.

## Established facts

The current `/api/tips/sent` event is not payment evidence. It is emitted before the browser opens the external YClients/ЮMoney tip-payment page. The public proxy forwards caller-selected staff and amount without an authentication proof. The active handler inserts that assertion into SQLite analytics and directly notifies staff through Telegram/Web Push.

No approved canonical owner covers this event:

- `BillingPayment` owns Maya tenant subscription billing, not customer-to-staff tips;
- `GiftCertificate`, `CustomerSubscription`, referral and loyalty models have domain-specific value contracts and cannot be reused as a generic tip ledger;
- Appointment ownership can prove a future verified Client's relationship to a visit, but does not prove that money was transferred;
- `ClientChannelLink` can establish Client identity, but does not establish payment/value outcome;
- Communication Delivery can be reused as the delivery mechanism, but its approved production message types contain no tip-payment/tip-intent authority;
- the schema contains no `Tip`, `TipIntent` or `TipPayment` aggregate and the action registry contains no tip action class.

`B22 TIP VALUE OWNER: NOT FOUND`

`EXISTING PACKAGE 4 VALUE CONTRACT SUFFICIENT: NO`

`LEGACY SQLITE TIP FACT AS CANONICAL OWNER: NO`

`CALLER-SUPPLIED TIP AMOUNT AS VALUE AUTHORITY: NO`

`CALLER-SUPPLIED RECORD ID AS APPOINTMENT AUTHORITY: NO`

## Option A — retire the unverified signal and keep external tip payment

`RECOMMENDED: YES`

**What tip means in Maya:** no Maya business/value fact is created. Maya presents the external provider's tip-payment page and does not claim to know whether payment happened.

**Canonical owner:** none inside Maya V1. Any actual payment remains owned by the external payment/provider system until a future verified integration is approved.

**`/tips/sent`:** retired/no-op compatibility endpoint with an explicit unsupported/retired outcome. It is neither a command nor a notification owner.

**Authoritative amount:** none in Maya. The amount selected in the browser is presentation input for the external page and is not stored as payment, analytics or evidence.

**Durable tip fact:** no.

**Initiator:** any user may open the public external payment page. No Maya mutation is initiated.

**Staff notification:** none. No direct Telegram/Web Push and no Communication Delivery request is created without authoritative outcome evidence.

**Schema/action classes:** `NEW SCHEMA REQUIRED: NO`; `NEW ACTION CLASS REQUIRED: NO`.

**What business/user loses:** staff no longer receives an immediate “client marked transfer” alert, and the owner loses SQLite tip totals derived from unverified clicks. The actual external tipping/payment flow remains available. Verified payment history and confirmed-tip notification do not exist today and are not lost.

**Why recommended:** it removes false value facts and spoofable staff messages while preserving the real customer action: opening the provider payment page. It does not invent a payment lifecycle that the current provider integration cannot prove.

## Option B — create a verified, non-monetary Client tip intent

`RECOMMENDED: NO`

**What tip means in Maya:** an immutable Client assertion that they intend or claim to leave a tip. It is explicitly not payment, revenue or confirmed value.

**Canonical owner:** a new `ClientTipIntent` aggregate bound to verified Client, tenant, own canonical Appointment and server-derived staff.

**`/tips/sent`:** renamed/reframed as a canonical Client command. It must require active `ClientChannelLink`; the server derives Client, Appointment and staff. Caller amount can only be an unconfirmed intent attribute and must never enter financial totals.

**Authoritative amount:** no authoritative paid amount exists. A selected amount may be retained only as the Client's assertion, visibly labelled unconfirmed.

**Durable tip fact:** yes, but only an intent fact with limits, expiry/idempotency and immutable evidence.

**Initiator:** verified Client for their own Appointment.

**Staff notification:** only after a separate approved operational-notification policy, through Communication Delivery and canonical staff recipient resolution. Missing delivery endpoint means no send.

**Schema/action classes:** `NEW SCHEMA REQUIRED: YES`; `NEW ACTION CLASS REQUIRED: YES` for the intent. A new approved communication type/capability is also required if staff notification is retained.

**What business/user gains and risks:** the business keeps a trustworthy record of who asserted an intent and may receive a clearly non-payment notification. Staff can still mistake an intent for payment, and the fact has limited financial usefulness.

## Option C — introduce a canonical tip-payment lifecycle

`RECOMMENDED: NO FOR CHAPTER 6`

**What tip means in Maya:** a customer-to-staff payment with provider-backed initiation/outcome evidence.

**Canonical owner:** a new tip-payment aggregate and canonical payment actions, separate from tenant billing, gift certificates, subscriptions, referral and loyalty.

**`/tips/sent`:** cannot confirm payment. It may at most initiate a provider-bound payment intent after verified Client/Appointment/staff resolution. Provider webhook/read reconciliation establishes paid/canceled/unknown outcome.

**Authoritative amount:** server-bound payment intent plus authoritative provider outcome. Caller amount is validated input, never outcome evidence.

**Durable tip fact:** yes, including payment identity, amount/currency, provider reference, immutable outcome evidence, idempotency, `UNKNOWN` and reconciliation.

**Initiator:** verified Client for their own Appointment, or an authenticated provider event bound to the same payment identity.

**Staff notification:** only after canonical paid outcome, through a newly approved Communication Delivery type and canonical staff delivery endpoint. No direct fallback.

**Schema/action classes:** `NEW SCHEMA REQUIRED: YES`; `NEW ACTION CLASS REQUIRED: YES` (multiple lifecycle actions are expected). A provider contract, webhook/reconciliation contract and notification policy are required first.

**What business/user gains and risks:** Maya can show confirmed tip history and notify staff after verified payment. This is a new payments capability with provider, accounting, failure/UNKNOWN and reconciliation scope not approved for Chapter 6.

## Recommended decision

`APPROVED OPTION REQUESTED: A`

`TIP IN MAYA V1: EXTERNAL PAYMENT PRESENTATION ONLY`

`B22 CANONICAL TIP/VALUE OWNER: NONE`

`/api/tips/sent MUTATION/DELIVERY: RETIRED`

`EXTERNAL TIP PAYMENT PAGE: PRESERVED`

`MAYA TIP PAYMENT/ANALYTICS FACT: NOT CREATED`

`STAFF TIP NOTIFICATION: NOT SENT WITHOUT FUTURE AUTHORITATIVE OUTCOME CONTRACT`

`COMMUNICATION DELIVERY FOUNDATION REUSABLE IN FUTURE: YES`

`TIP NOTIFICATION AUTHORITY ALREADY APPROVED: NO`

`NEW SCHEMA IF A: NO`

`NEW ACTION CLASSES IF A: NO`

No runtime/schema/migration or production mutation is authorized by this proposal. After owner approval, Option A can be implemented as a narrow retirement remediation, with ratchets proving zero SQLite tip facts, direct Telegram/Web Push, caller value authority and legacy delivery fallback.
