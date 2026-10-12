# H-1 execution outcome and delayed catalogue-read correction

Date: 2026-10-12, Europe/Moscow.
Branch: `codex/maya-local-crm-setup-20261010`.

This updates, rather than replaces, the preceding preparation checkpoint.
It is not release certification or successful live AChat/history acceptance.

Subsequent local-only update: the owner approved H-2 Option A and its synthetic
implementation passed. See [TRIAL-HISTORY-IMPLEMENTATION.md](TRIAL-HISTORY-IMPLEMENTATION.md).
The live outcomes and the historical remaining-boundary assessment below are
preserved; the implementation does not retrospectively change those outcomes.

## Authorized real local execution

The owner separately approved one session of at most 30 minutes, one salon
journal import for October 5–18 inclusive, at most 5,000 appointments, canonical
personal-history configuration and own privacy consent with marketing false.
The partner credential was entered manually in the hidden Terminal prompt;
the owner authenticated through the normal local Maya form.

Executed candidate: `f7429380a9d92b2f710f2ca90f9da2a6d00d0282`.
The session became ready at 12:00:14 Moscow, with expiry 12:29:31, and was
deliberately stopped early after collecting the results below. The final
launcher status `cancelled` describes that stop; it does not negate the already
completed reconciliation. The consumed permit must not be restarted or reused.

| Observation | Actual outcome |
| --- | --- |
| Existing canonical reconciliation | Complete; 162 fetched, 162 created, zero updates/skips/change events |
| Interval | October 5–18, Europe/Moscow; zero locally observed out-of-window appointments |
| Current verified personal Client links | Exactly one |
| Personal appointments | Four, from a read-only aggregate in the retained database |
| Other or unresolved appointments | 158; this is not a claim that all 158 have resolved foreign Client identities |
| Provider dispatch | Four GETs: one journal, staff, service catalogue, categories; six subsequent requests refused before dispatch |
| Governed settings read | 403, `Exact active staff membership required`; settings write not attempted |
| Own privacy consent | 201 and confirmed by status read; privacy true, marketing false |
| Personal history HTTP read | 500; live acceptance FAIL/incomplete, no raw rows returned |
| Unauthenticated / caller-selected Client | 401 / 403 |
| Cleanup | Local child group absent, retained database stopped, private state preserved, source unchanged, no cleanup failures |

The retained database was resumed, not migrated, seeded or replaced. It remains
on the Mac with the imported journal and consent. No production, model,
provider booking mutation, SMS/message, grant or new Client binding occurred.

[live-summary.json](live-summary.json) contains allowlisted aggregate results.
[live-receipt-manifest.json](live-receipt-manifest.json) pins the original local
receipts without copying private scope, credentials or raw customer data.

## Proven local transport defect

`CrmService` caches its adapter for five minutes. The real personal read happened
after that cache expired. A new adapter legitimately reloaded public staff and
service labels; the local history transport incorrectly treated a previously
read catalogue URL as forbidden across the entire session. It poisoned the
read operation and returned 500. The import itself had already succeeded.

Regression source `d022414d792ab52e8749d931e5424202926ef395` expires only the
synthetic adapter cache before the same compiled HTTP read. It reproduces
`500 !== 200`. Two separate unit regressions also failed before the correction.
The first exploratory HTTP probe on `c79c2b9f` had a test ReferenceError;
it is retained as an invalid reproduction, not evidence of this defect.

Correction `45e2c6e7eabeddda52c1499d3294847f50b6dfdc` scopes URL duplicate
detection to one operation. A subsequent canonical personal read may refresh
its finite public labels. One journal invocation, ordered pages, same-operation
duplicate refusal, exact company/GET paths, source/authority/expiry checks and
session-wide call/byte budgets all remain in place. No timeout was increased.
No backend product, schema, carrier, runtime presentation or iOS source changed.

## Fresh synthetic qualification

Executed implementation/test HEAD:
`7c26f2958af0e0dbb10292fd6f8b2eccec559e2b`.
Subsequent documentation commits are not represented as independently tested HEADs.

| Surface | Result |
| --- | --- |
| History, Telegram, diagnostic, resume and read-profile units | 148 PASS, zero failures/skips |
| Local restriction mutations | 16/16 killed; unmutated/restored baselines each 37/37 PASS |
| Compiled AppModule + HTTP/PostgreSQL + real child IPC/relay | Two fresh runs, each 16/16 PASS |
| Expired adapter cache → catalogue refresh → exact-Client read | PASS without reimport |
| Disposable database/process cleanup and source pins | PASS in both final runs |
| Real provider calls in these synthetic proofs | Zero |

The first post-fix HTTP run on `45e2c6e7` passed the five checks including
catalogue refresh, then ended with `socket hang up`. Its exact cause was not
proven. `7c26f295` adds bounded HTTP deadlines and safe listener/request phase
diagnostics; it does not claim a proven socket root-cause repair. Both runs on
that HEAD completed successfully. The failed receipt is retained and must not
be relabelled PASS. A recurrence needs diagnosis, not a longer timeout.

The final child proof deliberately denies external provider networking and
expects a failed synthetic child import with safe reporting/cleanup. It is not
evidence that another live provider import occurred. Old Telegram-batch binary
results remain historical; this correction changes only the history transport
and its proof/mutation scripts, not the legacy mode.

See [cache-refresh-proof-summary.json](cache-refresh-proof-summary.json) for
structured results and source/receipt provenance.

## Projection clarification

The preparation report's earlier blanket statement that the private HTTP
projection excludes all notes/contacts was too broad. The current canonical
`ClientAppointmentReadService` filters by the exact verified Client and returns
an empty raw `provider_payload`, but can include that Client's stored `notes`
and a branch contact phone. The synthetic test's absent marker does not prove
general note redaction: that fixture's raw comment was not a stored own note.
The AChat/tool safe formatter is a separate boundary. No live AChat/model call
was made in this session, and no raw private projection is archived here.

## Remaining boundary

1. [H-2 trial-history decision](TRIAL-HISTORY-DECISION.md): current A22 settings
   authority requires literal `active`; the real salon is `trial`. Do not bypass
   this with SQL, a changed tenant status or a local override. The prior C9 trial
   principal correction does not automatically widen A22 authority.
2. The live personal-history read and AChat acceptance remain incomplete. A
   synthetic correction cannot retroactively change the live HTTP 500 result.
3. Any later real continuation needs a fresh bounded allowance and a qualified
   path reusing the already-imported journal. Do not launch this one-import
   command again merely to check saved history. Model/chat is still outside
   the completed allowance.

**REAL LOCAL JOURNAL IMPORT: PASS.**
**LOCAL DELAYED CATALOGUE-READ CORRECTION: SYNTHETIC PASS.**
**LIVE PERSONAL HISTORY / ACHAT: NOT PASSED.**
**H-2: OWNER DECISION REQUIRED.**
**PRODUCTION / RELEASE CERTIFICATION: NOT CLAIMED.**
