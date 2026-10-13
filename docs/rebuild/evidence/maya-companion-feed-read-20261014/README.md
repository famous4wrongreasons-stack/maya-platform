# Companion Feed acknowledgement — fresh scoped evidence

Candidate: `be123b3d3b26101713a045b04976071cc4b07ae2`.
Product implementation: `7c477a9a2a769cad19a38b4f27bf7364169c3c58`.
Branch: `codex/maya-local-crm-setup-20261010`.
All 18 commands ran on this clean, unchanged committed candidate.
Execution: 2026-10-14 01:41:20–01:44:40 Europe/Moscow (UTC in `summary.json`).

| Surface | Fresh result |
| --- | --- |
| Full runtime | 828 PASS / 7 SKIP / 0 FAIL |
| Full carrier | 187 PASS |
| Scoped backend sources + C8 specs + C9 lifecycle presentation | 355 PASS / 23 suites |
| Workspace mutations | 23/23 killed, green baseline |
| Tasks / task actions / Ideas mutations | 9 + 11 + 36 killed, green baselines |
| Runtime architectural ratchets | 68 refusal / 24 admission, 31 coverage, 2 write, 51 PWA, 8 bypass |
| Carrier architectural ratchets | 72 refusal / 45 admission |
| Emitted synthetic browsers | Workspace 75 + chat 35 + tasks 32 + task actions 28 + Ideas 68 = 238 PASS |
| Packaging tests | 18 PASS |
| Runtime reproducibility / PWA-Capacitor parity | PASS; 8 files; approved endpoint substitution only |
| Scoped backend test lint | PASS |

This is 79 scoped mutants, not the complete release corpus. Seven skipped tests
remain skipped. No full backend/Platform CI, native signing/install, real provider,
model or retained database acceptance, release certificate or readiness is asserted.

Only an explicit gesture on a currently loaded unread notification can call the
existing `POST /inbox/:id/read` owner. It is scoped to current tenant/user/nondeleted
item and modifies only `readAt`; the production backend is unchanged. The frontend
does not optimistically acknowledge or infer success from `{ok:true}`. A fresh list
must contain the exact same item with read state. Missing/foreign/still-unread rows,
permission removal, failed reread, stale session and late answers are covered.
Opening and filtering are inert. No Save, task completion, outbound message or
booking authority is supplied by this operation.

Socket-loss injection remains enabled. The final browser receipt records three
logical Fetch calls and four HTTP deliveries because Chrome redelivers after a
connection loss. Tests distinguish application replay from transport delivery.
The existing server safely repeats only the read-time update; no immutable first
read timestamp or exactly-once delivery is claimed. The backend HTTP test exercises
actual Nest guards/controller/service with synthetic persistence, including scoped
foreign/deleted/missing records and repeated/concurrent calls. It is not a real DB
concurrency proof.

`summary.json` holds exact commands and original log hashes. `runner.py` reuses the
previous checkpoint's command inventory only, never its results. It requires a clean
committed start and unchanged/clean end. Host paths and dependencies must be resolved
and fresh output directories selected for reproduction elsewhere.

`MANIFEST.json` binds originals and archived artifacts by hash and size. Copied text
has trailing whitespace normalized; originals remain unchanged. The derived socket
diagnosis keeps only relevant synthetic network metadata/read requests, omitting
unrelated fixture login bodies, with original/derived hashes and transformation.

All five final browser receipts agree on candidate and all eight emitted payload
hashes, with zero external requests. Workspace screenshots contain synthetic data.
Final Feed 320/1280px and pending/confirmed/unconfirmed 393px were visually inspected.
Other unchanged surface screenshots are hash-manifested instead of copied. The owner
visual reference is hashed separately and grants no execution authority.

`development-corrections/` is non-final provenance: an initially illegal shell-to-net
value import; a test expecting 403 instead of the canonical 401 on revoked membership;
backend test lint corrections; the raw-HTTP-count assumption disproven by network
diagnosis; and the first final run's stale closed network inventories. The latter
were fixed in `be123b3d` using exactly one approved prefix and method, then the entire
18-step scoped programme reran. No timeout increase or authority weakening occurred.

`SCAN.json` records scoped secret/PII pattern review of the changed code and copied
text, with explicit review of synthetic fixtures. It is not a historical repository
audit. No keys, customer data, real external effects, push or production changes
occurred. See [checkpoint](../../MAYA-COMPANION-FEED-READ-CHECKPOINT-20261014.md).
