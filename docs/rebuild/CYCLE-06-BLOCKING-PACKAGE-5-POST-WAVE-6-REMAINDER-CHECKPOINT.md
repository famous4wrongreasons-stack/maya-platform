# Package 5 post-Wave-6 remainder — B7/B8 approved remediation

Owner accepted `47454962` and approved B7 schema/limits V1 plus B8 linking-only A.
Waves 1–6 remain accepted. B5/B6 deployment `fb820b3b` remains the runtime baseline.
Previous full Package 5 Final Gate failed on B7/B8; Package 5 is not complete.

1. B7 schema foundation and production migration: PASS. Pending 0, drift NONE,
   no backfill; production baseline process was preserved during apply.
2. B7/B8 runtime candidate: implemented. PostgreSQL runtime 20/20, Python 28/28,
   targeted ratchets 39/39, full regression 331 suites / 2758 tests and mandatory
   local lint/typechecks/build PASS. See B7/B8 runtime candidate report.
3. Next: mandatory server deployment gates; cut over the exact candidate only
   if green, then structural/read-only verification without business smoke.
4. Automatically restart the complete 13-family Final Adversarial Gate from scratch.
   Any new bypass/business/schema blocker causes exact-evidence STOP.
5. Only after Package 5 PASS may a separate Chapter 6 final acceptance cycle begin.

B7: nullable encrypted Client-owned preferences, no staff-note reuse/backfill.
V1 simultaneous limits: 12 entries / 200 code points each / 8192 plaintext JSON
bytes / 10963 ciphertext bytes. Overflow atomically rejects, old state unchanged.
B8: SMS and phone matches are evidence only; verified channel binding/challenge
required; no hidden Client creation/update or contact-phone persistence.

Preserve D1-A…D7-A, P02/P03, tenant hard-delete prohibition, all accepted baselines,
Client ownership, prospective configuration and immutable evidence. A30 remains
AC6 maintenance coordinator with durable Run/ItemClaim and unchanged Policy V1.
No real production business/provider mutations for proof. No Wave 7, no Chapter 7,
no automatic Chapter 6 completion. The 17 historical test databases are untouched.
