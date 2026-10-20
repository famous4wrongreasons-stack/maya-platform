# Telegram initial Client registration: bounded conflict retry

Date: 2026-10-20. Narrow repair following the owner's continuation instruction.

Parent product candidate: `36555c5579a9f95e3983c8db8f0a5bbab8329947`.
Diagnostic provenance: `117d1611669be2541d880727fea8ac475e0aa88c` on
`codex/diagnose-telegram-concurrency-20261019`, packet
`docs/rebuild/evidence/maya-telegram-concurrency-diagnosis-20261020/`.

## Defect and change

Five immediate retries of PostgreSQL serialization conflicts could all fail before
another valid login's CRM-card registration committed. One login created its link;
other valid concurrent requests reported `client_binding_unavailable`.

The existing Telegram coordinator now waits 25, 50, 100 and 200 ms between the
same maximum five registration attempts, outside database transactions. Only its
existing serialization-error classes are retryable. It checks current login and
the original server-admitted deadline before waiting and again before retrying.
It refuses a wait that cannot fit inside that deadline. No deadline is extended.
The existing registrar, SERIALIZABLE transactions, current CRM source and exact
Client checks, identity locks, immutable historical verification, one canonical
link writer and atomic audit remain in place. No schema or carrier change.

A successful CRM registration is still not booking authority. Final link creation
still rereads current authority/source; the owner role does not become Client access.

## Executed development checks

These are working-patch regression receipts, **not final-HEAD certification**.
The attached JSON records precise file hashes, local receipt hashes and outcomes.

- The original unchanged eight cases previously failed under real PostgreSQL
  `commit_delay=20000`, `commit_siblings=1`. This scheduling condition is a proof
  fixture, not a claim about production or the original GitHub server settings.
- Repaired full Telegram suite under that same condition: 101 PASS / 0 FAIL.
- Twenty fresh invocations of the eight concurrent cases: 160 PASS / 0 FAIL.
  Each case runs three requests and asserts exactly one link and one audit.
- Targeted mutation programme: 20/20 detected, including removal of the wait,
  excessive retries, non-serialization retries, deadline and post-wait authority.
- Ordinary full targeted baseline and restored control: 122 PASS / 0 FAIL each.
- Widget live TypeScript and changed-file lint checks passed.

Eleven new live regression cases cover settlement delay, bounded exhaustion,
non-retryable errors, deadline before/after waiting, insufficient remaining time,
and current session/membership/identity changes while waiting.
The synthetic scheduling oracle is separate from the actual PostgreSQL stress
proof; neither uses real Telegram/YCLIENTS or customer data.

## Next boundary

Full fresh certification on the committed repair SHA remains mandatory, including
all declared widget mutations, CI, backend/runtime/carrier/HTTP/BIN, source duties,
FBE2E, native execution, profile/revocation, packaging and rollback proofs.
Previous candidate receipts do not certify these changed bytes.

No deploy, owner/production database migration, real grant/signing, model expense,
OTP/YCLIENTS effect or phone installation was performed. All owned regression
PostgreSQL clusters were stopped. The owner's intentional tracked deletions in
the primary checkout were retained; the complete existing certification checkout
was reused for the repair.
