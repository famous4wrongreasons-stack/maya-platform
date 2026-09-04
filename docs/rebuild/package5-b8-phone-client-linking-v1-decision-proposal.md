# Package 5 B8 — phone possession / Client linking decision V1

Status: **DECISION PROPOSAL — not approved or implemented**.
Accepted checkpoint `2a6d645d`. Date: 2026-09-04.
B5/B6 and accepted waves remain unchanged. B7 independently requires its minimal
schema proposal; no runtime implementation has begun in this cycle.

## What the current endpoint proves and changes

Live `POST /api/cabinet/link-phone` authenticates the current legacy channel,
passes phone/code to `web_auth.verify_phone_login`, then directly creates/updates
a SQLite Client's encrypted phone and phone hash. The intended product effect
is that an empty Telegram cabinet can show the CRM card, visits and loyalty
associated with the entered phone. That goal does not establish authority to
select the canonical person by a shared phone number.

The SMS helper is not a pure verification function. `web_auth.py:119–137`
checks the provider's `/user/auth` response and calls `_issue_session`
(`364–432`). That function searches legacy Clients by phone and may adopt the
matched Telegram `chat_id`, then creates a legacy web session. This derived
session must not be forwarded as authoritative Telegram/Client proof. B8 must
separate SMS verification from that phone-based session-resolution side effect;
changing all other login providers is not automatically authorized here.

| Evidence | What it proves | What it does not prove |
| --- | --- | --- |
| Successful provider SMS check | Possession/control of that phone for the verified authentication operation | Ownership of any particular Client or another Telegram account |
| Current Maya JWT / signed Telegram initData or widget proof | Current authenticated channel/User subject, qualified by tenant and provider | Canonical Client identity on its own |
| Active verified ClientChannelLink | Exact established channel → Client binding, subject to tenant/hold/revocation checks | Authority to merge another Client, replace a different channel's link or change contact fields outside a command |
| Valid ClientLinkChallenge | Short-lived server-bound authority for one exact Client and atomic linking | Permission for the consumer to choose Client, phone-match, or create a new Client |

The existing canonical authenticator accepts Maya JWT and signed Telegram proofs.
It rejects the legacy phone-derived web session. The current challenge issuer
requires an existing verified channel-to-Client link as its trusted resolution
source. An unbound caller cannot bootstrap authority by asking for a challenge;
a bare `Client.userId`, provider subject, SMS success or phone match is insufficient.

## Exact remaining choice

The identity-link schema is sufficient for **linking to an already proven Client**.
However, no approved self-service canonical Client phone-update command was found:
Wave 3 `update_client_profile` changes locale; `update_client_notes` is staff
notes. `Client.phoneHash` is expressly a nonunique discovery index, with its current
CRM observation writer, not a verified contact-phone field. Writing it from SMS
would introduce a different field/authority contract. A writable column alone
is not approval of that behavior.

The decision is whether B8 V1 only links the channel to an existing Client, or
must also persist a Client contact phone. It is **not** a request to approve
phone-based first Client creation.

| Option | Behavior | Schema/authority consequence |
| --- | --- | --- |
| **A — verified Client linking only (recommended)** | Use existing valid channel proof and verified ClientChannelLink, or consume an already issued exact ClientLinkChallenge. Unbound/ambiguous callers without such challenge fail closed and receive an explicit linking-required outcome. SMS cannot select Client or issue a challenge. No Client phone/profile write; the response must not claim a phone was saved. | Reuse existing identity schema and approved atomic link command. No new phone field, Client-creation authority or provider business-write contract. The old “enter a phone to find a CRM Client” behavior is intentionally removed. |
| **B — verified contact phone on an already proven Client** | First prove exact Client through existing binding/challenge; then a separate canonical command may save a server-verified contact phone, without changing Client identity, links, CRM membership or any other Client. Unbound callers still fail closed. | Requires an explicit contact-phone command/storage/proof-lifecycle proposal before implementation: exact canonical field, current-vs-historical verification, replay/concurrency and durable evidence. The current schema/locale command does not settle these. |

**Recommendation: A for Chapter 6.** It reuses the approved linking authority
without preserving phone-based Client discovery as an authentication shortcut.
Customers without a usable verified link must complete the approved linking flow;
a phone code alone will no longer unlock a different CRM card. If storing a
contact number is a required product outcome, choose B and define that bounded
contract explicitly rather than silently updating Client.phoneHash or staff notes.

For option A, SMS possession may remain transient evidence of the phone step but
is not required by, and must not be promoted into, the approved Client linking
proof. Do not persist raw codes, issue a phone-derived legacy session, copy
arbitrary phone evidence into ClientChannelLink or announce “phone saved.” Reuse
the existing 600-second challenge endpoints and their atomic consume/link audit.
The current request shape `{phone, code}` cannot be silently reinterpreted as
successful canonical linking; callers must present an approved channel proof and,
when needed, an existing server-bound linking token through the supported flow.

If a product later requires verified phone to **create the first canonical
Client**, that is a new business authority decision with its own minimal
proposal and proof. Neither option here authorizes it, and the current product's
need for that new authority has not been established.

## Preserved invariants / post-decision proof

- Verified phone possession is evidence only, never canonical Client ownership.
- No legacy Client create/update or phone-derived substitution of channel identity.
- No silent Client merge/rebind; no cross-tenant or ambiguous linking.
- A changed Client profile requires an expressly approved canonical command;
  option A performs no such profile change.
- Preserve ClientChannelLink/challenge evidence, TTL 600 seconds, one-time consume,
  one concurrent winner, retry/restart and Client-without-User support.
- Targeted proof must cover existing link, missing/ambiguous link, phone-only
  rejection, substituted Client/tenant, replay/expired token, concurrent linking,
  already-linked different Client, and absence of legacy SQL/session fallback.
- No real phone/SMS/profile/provider business mutation for production smoke.
  After an approved implementation and green deployment gates, verify read-only,
  then rerun the full Package 5 Final Gate across all 13 families.

```text
VERIFIED PHONE POSSESSION == CANONICAL CLIENT OWNERSHIP: NO
PHONE MATCH AS CLIENT AUTHORITY: NO
VERIFIED PHONE POSSESSION: EVIDENCE ONLY
EXISTING VERIFIED CLIENT LINK FOUNDATION: SUFFICIENT
EXISTING CANONICAL CLIENT PHONE-UPDATE CONTRACT: NOT FOUND
FIRST CANONICAL CLIENT CREATION FROM PHONE: NOT APPROVED / NOT PROPOSED
RECOMMENDED: OPTION A — VERIFIED CLIENT LINKING ONLY
CROSS-TENANT LINKING: FORBIDDEN
SILENT CLIENT MERGE: FORBIDDEN
MISSING/AMBIGUOUS CLIENT: FAIL CLOSED
B8 RUNTIME IMPLEMENTATION: NOT STARTED
PRODUCTION MUTATIONS: 0
```
