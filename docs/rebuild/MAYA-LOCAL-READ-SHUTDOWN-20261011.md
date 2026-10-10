# Local read-session shutdown — 11 October 2026

Status: development harness fix; no new provider, model or release authorization.

## Observed defect and correction

The successful real connection checkpoint (`bfc83242`, documented at `1fe7074b`)
retains two manual-stop failures, `runtime_summary_missing`. Those receipts are
unchanged. Cancellation sent SIGTERM, then `finally` sent SIGTERM again while the
runtime's `once` handler was asynchronously closing AppModule and publishing its
IPC summary. The second signal could terminate that cleanup.

`local-yclients-read.mjs` now shares one shutdown promise between cancellation and
finalization. The existing finite TERM/KILL deadlines remain unchanged. An absent
summary or unclean exit still fails. Group absence is verified after child close
and cannot be reported as successful when unconfirmed.

Fresh execution also observed `kill(-ownedPgid, 0)` returning EPERM during exit.
This is treated as **not proven absent**, so the same bounded wait continues.
ESRCH alone proves absence; actual signal errors are not bypassed or suppressed.
No claim about the OS-level cause of that transient denial is made.

## Executed proof

- Exact pre-fix source at `1fe7074b`, relocated only for isolated imports: both
  owner-cancel and repeated-owner-cancel tests fail with `runtime_summary_missing`.
- Current local read suite: **157 pass, 0 fail**, including six real-child/IPC
  lifecycle tests (TTL, cancel, repeated cancel, transient denied probe, missing
  receipt, unresponsive child). The last two must remain failures of the launcher.
- Synthetic child/loopback tests only: no owner DB, credentials or upstream calls.
- Intermediate failed runs were retained privately; they are not replaced by the
  passing receipt. Metadata and hashes: [summary](evidence/maya-read-shutdown-20261011/summary.json).

## AChat preparation boundary

An earlier unchanged `1fe7074b` offline run exercised 48 synthetic dialogues / 81
HTTP turns: 57 pass, 0 semantic failures, 12 unsupported, 10 insufficient evidence,
2 clarification pending; critical safety failures/missing evidence 0. Exit 2 and
`completed-with-semantic-limitations` are retained. This is scripted synthetic
evidence, not model quality or acceptance on the owner's salon.

The owner's active local CRM connection remains preserved. The setup-read profile
still refuses `/ai/chat` and model traffic. Existing admitted model qualification
uses synthetic CRM/test databases. Connecting the existing bounded model broker
to the retained owner database for a narrowly read-only AChat window remains
separate, unfinished preparation. Key availability is confirmed; paid execution
and credential entry have not been requested or performed by this checkpoint.
