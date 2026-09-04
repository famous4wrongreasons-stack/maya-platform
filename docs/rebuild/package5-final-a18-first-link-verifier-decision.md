# Package 5 Final — A18 first-link Client authority verifier

Status: **HISTORICAL STOP — CHALLENGE MECHANISM NOW APPROVED AFTER `813107da`**

The user accepted `813107da` and approved a server-issued, short-lived, single-use
Client Linking Challenge after trusted server-side Client resolution. This
resolves the mechanism decision described below. The current boundary is the
minimal challenge schema and separate TTL proposals, documented in
`CYCLE-06-BLOCKING-PACKAGE-5-A18-CLIENT-LINK-CHALLENGE-ASSESSMENT.md`.
The original evidence and question below are retained as checkpoint history.

Date: 2026-09-04. Foundation source: `ae3f7438`; accepted schema decision:
`55380a90` plus explicit ClientChannelLink Schema V1 approval.

## Completed foundation

The approved single-model foundation has passed 32 PostgreSQL cases, 24 targeted
checks, clean replay, validate, typechecks and project lint. Its additive migration
is applied in production: pending 0, approved-schema drift NONE, link rows/backfill
0. No second model is proposed and none is needed to store the completed link.

The binding invariants and D2-A are already approved. They are not reopened.
The remaining question concerns the source of a first link's verification proof,
not whether phone matching may be used: it may not.

## Exact missing decision

**Which trusted evidence issuer/source proves that the authenticated person is
authorized for the exact existing canonical Client when no verified link exists?**

The answer must identify the evidence that source supplies and how it binds the
exact tenant/Client to the verified channel subject. A successful channel login
or operator selecting a Client does not answer this question. Once that trust
source is specified, signature validation, bounded challenges, replay handling
and service wiring are implementation work within the approved invariants.

The required verifier contract has two independent inputs:

| Input | Existing evidence | Current conclusion |
| --- | --- | --- |
| Channel control | Server-verified Telegram login/initData, or authenticated Maya User/session | Reusable only for the actual authenticated issuer/subject |
| Exact Client authority | Previously proven User↔Client provenance, or independently verified first-link challenge | No production verifier/provenance source identified that satisfies the approved contract |

The completed link stores the verified result and audit evidence; it cannot
bootstrap its own verification. Generating an opaque token or signing a submitted
Client id would authenticate the token's issuer without proving Client authority.

## Evidence reviewed

- `src/crm/client-identity.service.ts:67` registers an observed CRM card. Its
  Client creation at line 194 preserves the CRM identity; it does not verify a
  customer channel. The sole production caller at
  `src/crm/crm.service.ts:3125` supplies provider/external id/phone, not verified
  User↔Client provenance.
- `src/customers/customers.service.ts:284` looks up Client by tenant and User.
  It does not verify historical provenance or complete a linking challenge.
- Production contains 23 Clients, one with a non-null User reference. These are
  aggregate counts only; no identity was copied or promoted to a verified link.
  The bare reference is insufficient under the approved proposal.
- Deployed `web_auth.py:364` `_issue_session` can resolve chat id with
  `database.find_client_by_phone`. Deployed `_authed_chat_id` consumes that
  session alongside signed Telegram authentication. Therefore the common legacy
  chat id cannot be reclassified as independently verified Client authority.
- `ClientChannelLinkVerifier` in `src/crm/client-channel-link.service.ts:46`
  is a required server dependency. There is deliberately no permissive default
  or HTTP endpoint. The only implementation is the isolated synthetic verifier
  in `scripts/package5-a18-client-channel-link-proof.ts:34`; those test fixtures
  are not production evidence.
- The unchanged live release has no ClientChannelLink runtime consumer/verifier;
  production link rows are 0, as required for this no-backfill migration.

Evidence hashes and deployed function call inventory:
`evidence/package5-a18-first-link-authority-blocker.json`.

## Why this is a STOP

The approved Schema V1 proposal, “Verification evidence and owner boundary,”
requires both channel control and exact Client authority. It explicitly rejects
phone/contact matching, CRM external id, selected Client, a hash or bridge secret
alone and does not approve a challenge shortcut. The current user instruction
requires STOP on a new business/schema blocker.

No extra authority source was invented. No historical link was backfilled, no
synthetic fixture was promoted to live verification, and no permanently rejecting
replacement endpoint was reported as successful consent remediation.

This STOP does not reverse the production migration. The foundation is additive,
empty and ready for the approved verifier. No new schema requirement is asserted
for the future verifier; assess that only against its concrete approved evidence.

## Retained remainder

After this decision, resume A18 verified-link consumption and account-optional
canonical consent, including shared identity locking/revalidation at commit,
then both A26 routes and hard-delete compensation. The required guest, PWA,
Telegram, retry, concurrency and A26 targeted proofs are still outstanding.
Do not substitute the foundation's synthetic-verifier proof for those tests.

The three original paths remain unresolved:

1. `/api/consent/submit` direct Python consent ownership.
2. `/api/onboarding/trial` legacy bootstrap and physical tenant-delete compensation.
3. `/api/admin/tenants` direct creation outside TrialActivation.

After all remediation gates and production read-only verification pass,
automatically restart the complete 13-family Final Package 5 Gate. Its prior FAIL
is retained; no new full-suite or final-gate PASS is claimed. Waves 1–6 remain
accepted. Wave 7, Chapter 7 and automatic Chapter 6 completion remain forbidden.
