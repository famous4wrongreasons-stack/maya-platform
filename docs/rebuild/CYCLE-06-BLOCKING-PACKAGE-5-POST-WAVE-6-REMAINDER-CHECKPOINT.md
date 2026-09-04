# Package 5 post-Wave-6 remainder — B7/B8 deployed; B9/A18 STOP

Accepted owner checkpoint `47454962`. Waves 1–6 remain accepted, 6/6; no new wave.
B7 schema `5e3a8e7a` and runtime `4b96b546` are deployed. Current release:
`/opt/maya-saas/releases/20260904-p5-b7-b8-4b96b546`.

1. B7 schema/migration and B7/B8 runtime remediation: PASS. Pending 0, drift NONE,
   no backfill or real production business/provider proof mutations. Schema 19/19,
   runtime PostgreSQL 20/20, Python 28/28, ratchets 39/39. Candidate regression
   331 suites / 2758 tests, lint/typechecks/build PASS.
2. Server deployment gates and production structural/read-only verification: PASS.
   Live hashes match; health/readiness PASS; service error-priority entries since
   activation 0 at verification. Earlier remediations and Waves 1–6 preserved.
3. Complete 13-family Final Gate restarted from scratch. New **B9/A18**:
   production `/api/chat` → AI `get_referral_link` and `remember_wanted_slot`
   → direct SQLite `database.get_or_create_client`. Referral read can create a
   legacy Client before downstream rejection. Seven isolated checks reproduced
   deployed behavior; see the B7/B8 deployed Final Gate STOP report/evidence.
4. **PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL; PACKAGE 5 COMPLETE: NO.**
   STOP at new bypass; no B9 implementation or further final aggregate gates.
   Inventory set coverage 13/13 does not prove global canonical-only ownership.
   Other collected paths/scripts still need complete classification after resume.
5. Next separate authorization: remediate exact B9 Client-creation ownership,
   reconstructing downstream semantics where necessary. Preserve deployed B7/B8,
   then restart the full 13-family Final Gate. Only after Package 5 PASS may a
   separate Chapter 6 final acceptance cycle begin.

B7 retains nullable encrypted Client-owned preferences, no staff-note reuse or
backfill. Simultaneous V1 limits: 12 entries / 200 code points each / 8192 plaintext
JSON bytes / 10963 ciphertext bytes. Overflow rejects atomically, old state
unchanged. B8 retains phone/SMS evidence-only semantics, verified canonical
binding/challenge, no hidden Client create/update or contact-phone persistence.

Preserve D1-A…D7-A, P02/P03 holds, tenant hard-delete prohibition, Client ownership,
prospective configuration and immutable evidence. A30 remains AC6 coordinator
with durable Run/ItemClaim and unchanged Policy V1. No Wave 7/Chapter 7/automatic
Chapter 6 completion. The 17 old DBs remain untouched. All owned temporary
processes/watchers/Chrome/databases are 0 at closure.
