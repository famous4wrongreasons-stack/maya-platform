# A18 — Client Linking Challenge TTL Decision V1

Status: **PROPOSED — EXPLICIT TTL APPROVAL REQUIRED**

Date: 2026-09-04. Accepted checkpoint: `813107da`; first-link challenge mechanism
approved in the user's following instruction. No lifetime has been approved yet.

## Existing policy assessment

| Existing duration | Source | Why it is not an approved linking TTL |
| --- | --- | --- |
| 300-second default phone code | `AuthService.getPhoneAuthCodeTtlSeconds`, `PHONE_AUTH_CODE_TTL` | Phone authentication, configurable; not exact Client-link authority |
| 300-second default email code | `EmailAuthService.getCodeTtlSeconds`, `EMAIL_AUTH_CODE_TTL` | Email authentication, configurable; not this challenge class |
| 600-second default OAuth state | `SocialAuthService.getAuthFlowStateTtlSeconds`, `AUTH_FLOW_STATE_TTL_SECONDS` | OAuth/PKCE flow state, configurable; different purpose |
| 24-hour short-lived auth retention | Approved A30 Auth Retention Policy V1 | Deletion eligibility after terminal facts, not bearer validity; fixed existing allowlist |

The schema, auth configuration, approved A18 documents and Authority/Policy V1
documents contain no existing approved one-time Client Linking Challenge TTL.
The implementation defaults above are evidence only and are not inherited.

## Proposed decision

Approve **600 seconds (10 minutes)** for the initial V1 Client Linking Challenge.
This is a proposed product/security tradeoff: enough time for the PWA↔Telegram
handoff while bounding the usable lifetime of an unconsumed bearer. It is not
presented as a security standard or an already approved constant.

```text
CLIENT LINK CHALLENGE POLICY KEY: package5.a18.client-link-challenge
CLIENT LINK CHALLENGE POLICY VERSION: 1
PROPOSED CLIENT LINK CHALLENGE TTL: 600 SECONDS
PROPOSED CLIENT LINK CHALLENGE TTL: 10 MINUTES
CLOCK: SERVER-DERIVED UTC
EXPIRES AT: ISSUED AT + 600 SECONDS
VALIDITY TEST: SERVER CONSUME TIME < EXPIRES AT
EXPIRY EQUALITY: REJECT
SLIDING EXPIRY / SILENT EXTENSION: NO
INITIATOR TTL/DEADLINE OVERRIDE: NO
TENANT-CONFIGURABLE TTL IN V1: NO
POLICY CHANGE REQUIRES NEW VERSION: YES
TTL DECISION APPROVED: NO
TTL IMPLEMENTED IN PRODUCTION: NO
```

Issue and consume instants come from the database clock. Recheck after obtaining
the transaction locks. Receipt insertion, consumer retries, provider changes or
waiting on a lock never extend `expiresAt`. An expired challenge remains invalid;
a replacement requires a fresh authorized issue with its own token and interval.

This decision concerns validity only. It does not alter A30 retention durations,
deletion predicates or allowlist, and it does not authorize challenge cleanup.

Approve this TTL decision separately from
`package5-a18-client-link-challenge-schema-v1-proposal.md`. Both are needed before
implementation. If a different duration is chosen, update the proposed V1 before
coding; do not silently substitute an existing auth environment default.
