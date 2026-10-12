# Personal booking — current React/HTTP/PostgreSQL proof

Date: 2026-10-12. Tested committed source: `7f141850a138d37ef8c5fdd30c632842762811f1`.
Branch: `codex/maya-local-crm-setup-20261010`.
Local synthetic acceptance only; no certificate issued and no live booking claim.

## Established result

Both existing entry paths passed fresh prepare → application/PostgreSQL restart
→ resume: SCHEDULE with an existing appointment, and “Хочу записаться” through
SERVICE_SELECTOR with zero previous appointments. Actual current emitted React,
headless runtime, backend HTTP, identity and Action Engine owners were exercised.
The model, identity verifier and loopback CRM provider were synthetic. Each run
used a new disposable PostgreSQL cluster; both clusters and owned browsers stopped.

Proven in each path: canonical branch selection and timezone reach availability
and confirmation; successful internal booking adds exactly one row; revocation,
changed preview facts and incomplete price/duration/currency refuse dispatch;
known zero price remains distinct from missing price. The fake provider persists
one booking then loses its response. Maya shows UNKNOWN, never success; result
reads and restart create no second provider booking or dispatch. Original READY
facts remain immutable and changed facts fail after restart. Preview/result readers
write no booking state; owner membership stays tenant_owner, with separate verified
personal authority and actor evidence. Private form data is absent from model
history. Catalog navigation also refuses a revoked link and survives close/reopen.

## Harness corrections and provenance

- `2f8bd02c`: the old external fixture omitted canonical company→branch binding.
  Added that binding and retained an executable refusal for its absence.
- `2f893ef1`: old browser admission blocked GET /api/branches and omitted branchId
  from availability; updated only the exact loopback/scenario allowlist. Probe now
  selects the server-returned branch and formats slot labels in that branch timezone.
- `7f141850`: corrected the new proof assertion to the existing HTTP `branch_id`
  field (the runtime maps it to branchId). No wire/product contract changed.
- Before guard correction: 2/4 tests failed. Current personal plus existing branch
  guard tests: 10 PASS. Seven destructive guard mutations killed with green baseline.
- Backend widgets-live type check and scoped ESLint passed. No backend src, Prisma,
  runtime src or React src changed relative to `c4ae96de`.

Early red receipts remain under /private/tmp/maya-personal-booking-after-history-20261012,
/private/tmp/maya-personal-booking-after-history-fixed-20261012 and
/private/tmp/maya-personal-booking-branch-current-20261012. They are not relabelled green.
Fresh final runs and hashes are in proof-summary.json and receipt-manifest.json.

## Boundaries and next step

No retained owner database, real YCLIENTS/model, notifications, OTP, production,
iPhone, design or C10 effects were used. This is not full certification, real provider
acceptance, or owner UX approval. Live personal history AChat replies are still the
next unfinished acceptance. A new owner-approved 30-minute/$2 two-question window
was received after these synthetic proofs; it does not authorize real booking.
