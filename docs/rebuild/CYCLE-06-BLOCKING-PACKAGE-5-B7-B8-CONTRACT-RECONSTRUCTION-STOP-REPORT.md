# Package 5 Final — B7/B8 contract reconstruction; proposal STOP

Date: 2026-09-04. Accepted checkpoint: `2a6d645d`.
**STOP before runtime/schema implementation, as required by the user's B7 schema
boundary.** The current CustomerProfile cannot represent Client-stated free-text
habits without adding a field or changing a different approved field's meaning.
B8's SMS/contact/linking behavior also needs an explicit product decision; no
first Client creation authority is inferred.

B5/B6 remain the accepted production baseline. Waves 1–6 are not reopened.
No runtime source, schema, migration, test, architectural ratchet, deployment,
service or production business record changed in this cycle.

## B7 — exact semantics and minimal proposal

The AI tool remembers a short preference the Client explicitly expressed, such
as service style or comfort. It is current personalization state, distinct from
staff notes, consent, structured visit mood and communication preferences.
The legacy implementation appends deduplicated text, retaining up to 12 lines
and truncating a combined 800-character string. The AI initiator currently
receives a channel id and calls a direct SQLite writer; its read consumers also
include a phone-resolved staff dossier.

The production catalog and source confirm:

- `CustomerProfile.preferredLocale` and its canonical self command cover locale.
- `encryptedNotes` belongs to staff-authorized notes; it cannot be repurposed for
  Client self-preferences without changing authority and storage semantics.
- B5/B6 mood and notification fields have strict approved meanings/allowlists.
- There is no existing Client-owned free-text preference field. Execution/audit
  JSON and identity evidence are not substitutes for current profile storage.

Prepared `package5-b7-client-habits-schema-v1-proposal.md`: one nullable encrypted
field, `CustomerProfile.encryptedClientPreferences String?`, no new models,
Client-qualified ownership guard, existing encryption/ActionExecution/mutation
foundation, no backfill. Versioned bounded append/no-op behavior is explicit.
The proposal asks to reject capacity overflow instead of silently truncating or
removing old entries; this change is marked as an owner decision, not an already
approved constant. No B5/B6 field or staff note is changed.

After approval, verified ClientChannelLink authority must travel outside model
arguments; AI remains an initiator. Guest Client, no-op, retry/concurrency,
missing/ambiguous/cross-tenant Client and no hidden creation proofs remain
required. None was falsely reported as executed in this documentation cycle.

## B8 — three identities are separate

SMS proves phone possession, a current signed channel/Maya JWT proves its own
subject, and a verified ClientChannelLink / server-bound challenge proves the
exact Client relationship. None of the first two independently proves the third.

The deployed `web_auth.verify_phone_login` additionally calls `_issue_session`:
it finds a legacy Client by phone, substitutes its Telegram chat id when found,
and creates a legacy web session. This is not pure phone evidence. The canonical
channel authenticator accepts Maya JWT and signed Telegram proofs and rejects
that phone-derived session. B8 cannot wrap this legacy resolution in a bridge
and call it verified Client authority.

The existing ClientChannelLink/challenge schema is sufficient for linking to an
already proven Client. The current issuer requires an existing verified link;
SMS cannot cause challenge issuance for an arbitrary/phone-matched Client. A
cold-start Client without a trusted resolver remains fail closed.

No approved canonical Client contact-phone update command was found. The current
profile command is locale-only; Client.phoneHash is a nonunique discovery index
maintained by CRM observations, not an approved verified contact-phone command.
Consequently the old phone/profile write cannot simply be redirected into it.

Prepared `package5-b8-phone-client-linking-v1-decision-proposal.md`:

- Recommended **A: existing verified Client linking only**. Reuse approved
  channel/challenge/link flow; no saved contact phone and no phone-derived Client
  selection/creation. Callers lacking a valid link/challenge fail closed.
- Alternative **B: persist a contact phone for an already proven Client** requires
  a separately defined canonical field/command and proof lifecycle.

The decision explicitly does **not** assume that the product needs first Client
creation from SMS. That authority is neither approved nor proposed. Existing
Client linking approval, TTL 600 seconds and D2-A are not being reopened.

## Read-only baseline and STOP limits

Production remains `/opt/maya-saas/releases/20260904-p5-b5-b6-fb820b3b`, same
service start time as the accepted deployment. B5/B6 live Python hashes match
that candidate. Current catalog/source hashes support the field assessment.
Release preflight reports all 74 repository migrations applied, 77 production
records including three recognized historical records, pending 0. Drift NONE;
health/readiness PASS. No customer row values, credentials or tokens were read
for this assessment.

Evidence: `evidence/package5-b7-b8-contract-reconstruction.json`.
The earlier full Final Gate FAIL remains current; it was not rerun because
this cycle stopped at the explicitly required schema/business decision boundary.
No executable proof, full regression or deployment is claimed for an unimplemented
proposal. The previous accepted deployment tests remain historical evidence.

Next: owner decision on the B7 minimum schema/V1 bounds and B8 intended effect;
then continue this same Final Remediation cycle with required proof and mandatory
deployment gates. After successful production verification, restart all 13
families' Final Gate. Do not create Wave 7 or announce Chapter 6 complete.

```text
B7/B8 CONTRACT RECONSTRUCTION: COMPLETE
B7 CANONICAL OWNER: CLIENT / CustomerProfile
B7 EXISTING SCHEMA SUFFICIENT: NO
B7 ADDITIONAL SCHEMA REQUIRED: YES — ONE NULLABLE ENCRYPTED FIELD PROPOSED
B7 SCHEMA PROPOSAL: READY FOR OWNER DECISION
B8 VERIFIED PHONE POSSESSION: EVIDENCE ONLY
PHONE MATCH AS CLIENT AUTHORITY: NO
B8 EXISTING CLIENT LINK FOUNDATION: SUFFICIENT
B8 CANONICAL CLIENT PHONE-UPDATE CONTRACT: NOT FOUND
FIRST CLIENT CREATION FROM PHONE: NOT APPROVED
B8 DECISION PROPOSAL: READY — LINKING ONLY RECOMMENDED
B7/B8 RUNTIME REMEDIATION READY: NO — OWNER DECISIONS REQUIRED
RUNTIME/SCHEMA IMPLEMENTATION STARTED: NO
B5/B6 PRODUCTION BASELINE: UNCHANGED
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
PENDING MIGRATIONS: 0
SCHEMA DRIFT: NONE
PRODUCTION MUTATIONS: 0
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
CHAPTER 6 COMPLETE: NOT DECLARED
PRE-EXISTING LOCAL TEMP/TEST DATABASES: 17
PRE-EXISTING DATABASES DELETED: 0
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```
