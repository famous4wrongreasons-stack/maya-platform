# Telegram initial binding: concurrent registration retry exhaustion

Date: 2026-10-20. Diagnostic result, not release admission.

## Disposition

**PROVEN PRODUCT CONCURRENCY AVAILABILITY DEFECT. STOP BEFORE PRODUCT CHANGE.**

Release candidate: `36555c5579a9f95e3983c8db8f0a5bbab8329947`.
Diagnostic observation branch: `codex/diagnose-telegram-concurrency-20261019`,
test observation checkpoint `517d73b524ca9a29357aecbe9e50a9bd16da81e6`.

No product, Prisma, runtime, React carrier or iOS source changed in this diagnosis.
The owner's 1,333 intentional deletions remain unchanged and unstaged.
No deploy, owner/production migration, grant, signing, external provider request,
paid model call, OTP, real booking or phone installation occurred.

## User-visible consequence

When valid Telegram logins overlap for the same initially unbound personal Client,
one request can create the verified link while another returns
`unlinked / client_binding_unavailable`. That response does not grant client
authority and can leave the client-facing flow reporting unavailable access.

This proof does **not** establish the cause of every earlier real-phone refusal.
No new real Telegram or YCLIENTS request was made.

## Proven mechanism

In `maya-saas-backend/src/auth/telegram-client-binding.service.ts`,
`registerCard` (line 329 at the release candidate) retries a real PostgreSQL
serialization conflict (`P2034`) up to five total attempts with no wait between
attempts. All five can finish before the competing successful registration has
committed. The exception reaches `afterLogin`, which returns the unavailable
binding result.

A controlled PostgreSQL commit delay reproduced this without changing product
SQL, authority checks, database constraints, the retry limit or test timeouts.
The database produced the errors naturally; no database error was injected.

Representative traced case, milliseconds relative to the first registration start:

| Caller | Outcome | Attempts | Last failed attempt / commit |
| --- | --- | --- | --- |
| 0 | linked | 1 | committed at +25 ms |
| 1 | unlinked / client_binding_unavailable | 5 | final P2034 at +12 ms |
| 2 | unlinked / client_binding_unavailable | 5 | final P2034 at +12 ms |

That case persisted exactly one ClientChannelLink and one
`client.telegram_initial_link` audit. All three failing traced cases retained
exactly one link and one audit. The 120-case stress reproduction also measured
exactly one link in every failing case. No duplicate or cross-tenant access was
observed. These are measured bounds, not a general claim about untested paths.

## Executed controls

All databases were fresh, isolated and synthetic; each owned PostgreSQL was
stopped afterwards. PostgreSQL settings for the failing condition:
`commit_delay=20000` microseconds and `commit_siblings=1`.
This is a diagnostic scheduling condition, **not a claim that CI used that setting**.

| Run | Condition | Result |
| --- | --- | --- |
| 12 | Hold actual registrar return 0–200 ms before transaction commit | 10 PASS |
| 13 | Test-only SQL statement delay, guards retained | 6 PASS |
| 14 | Full Telegram file plus registrar delay | 92 PASS |
| 15 | Natural commit-delay conflicts, call-through observation | 81 PASS / 39 FAIL |
| 16 | **Exact committed original eight tests**, commit delay | **4 PASS / 4 FAIL** |
| 17 | Eight observed cases, commit_delay=0 | **8 PASS / 0 FAIL** |
| 18 | Same eight observed cases, commit_delay=20000 | **5 PASS / 3 FAIL** |
| 19 | Published runner, clean exact candidate, original eight tests | **6 PASS / 2 FAIL** |

Runs 15–19 selected the concurrency cases; 82 unrelated cases were skipped and
are not presented as coverage. Run 14 ran its whole modified test file.
The concurrency tests contain three calls per case. Failures are the unchanged
all-responses-linked-or-already-linked assertion, not a timeout.

`ROOT-CAUSE-REPRODUCTION.json` contains toolchain identity, original-test hash,
receipt hashes, all eight traced results and per-caller attempts. The portable
Mac diagnostic runner `reproduce-canonical.py` runs the exact original eight
tests against a fresh isolated PostgreSQL instance. Its executed run 19 retained
byte-identical original test source and reproduced two failures. A single eight-case repeat
can pass because the schedule is concurrent; do not convert a passing repeat
into a waiver or relax the assertion.

Example invocation (new disposable output directory; Node 22 and PostgreSQL 16):
\`\`\`sh
python3 reproduce-canonical.py --source /path/to/clean-candidate \
  --output /path/to/new-diagnostic-output --node /path/to/node22/bin/node \
  --pg-bin /path/to/postgresql16/bin --commit-delay-us 20000
\`\`\`
Use another new output directory and \`--commit-delay-us 0\` for the ordinary
control. Exit 1 with the matching original assertion is a reproduced failure,
not a passing release test. The runner stops its own database in either case.

## Relationship to the original CI failure

Original run [39165703973](https://github.com/famous4wrongreasons-stack/maya-platform/actions/runs/39165703973),
job 117788376868: baseline 734 PASS / 1 FAIL, concurrency run 2, duration 162 ms.
Its first assertion established exactly one `linked` response. The all-responses
assertion failed; the final database-count assertion was not reached.

The original PostgreSQL service-container log was recovered. It shows a burst
of real serialization errors on Client/CrmClientLink writes separated by only
a few milliseconds in the concurrency interval. This is consistent with the
now-reproduced mechanism. The original response/error category and per-request
correlation were not retained, so exact forensic attribution of that one event
remains limited. Do not claim the original CI database-count assertion passed.

The independent product defect is proven by the fresh runs above regardless
of that historical correlation limit.

## Completed GitHub diagnostic comparison

- [Ordinary Widgets Live 39174297390](https://github.com/famous4wrongreasons-stack/maya-platform/actions/runs/39174297390):
  62 suites / 735 PASS, release binary 5 PASS; workflow success.
- [Gate 13 diagnostic 39174311201](https://github.com/famous4wrongreasons-stack/maya-platform/actions/runs/39174311201):
  four partitions passed, 25 declared mutants matched, all baseline controls green.
- Its final release collector **correctly refused**: `release requires the complete corpus`.
  Only gate 13 was requested; this is not a full mutation or release receipt.

These passing diagnostic repetitions do not supersede the reproduced defect.
Historical full-suite results are retained but not substituted for a new final
certificate.

## Next bounded engineering unit

Repair retry scheduling at the existing registrar/coordinator boundary so a
short-lived serialization conflict can settle within the existing operation
deadline. Preserve exact tenant/user/Client/source checks, serializable writes,
revocation, all fresh-authority rereads, immutable evidence and one link/audit.
Do not replace this with caller-selected Client identity, broader authority,
unbounded retries, larger test timeouts or acceptance of the unavailable result
as a successful concurrent login.

The repair must pass both the ordinary control and commit-contention reproduction,
then relevant negative/expiry/revocation proofs and complete required fresh
certification on the resulting committed candidate. No repair is implemented here.

```yaml
PRODUCT DEFECT: YES
ORIGINAL CI EXACT RESPONSE RECOVERED: NO
PRODUCT CODE CHANGED: NO
CERTIFIED_FOR_PROFILE: NO
READY FOR REAL EXECUTION: NO
EXACT BLOCKER: Telegram initial Client registration exhausts immediate serialization retries
```

