# Verified owner personal booking — qualified React checkpoint

Code `e7118871` completes a local user path for an owner who already has a
current verified personal Client link and an eligible upcoming appointment:
read own appointments in chat, choose **«Записаться для себя»**, select a public
service/staff/date, read an actual availability proposal, and explicitly confirm.
The owner remains TENANT_OWNER. Successful creation is shown only after reading
SUCCEEDED for that exact canonical selection. A lost provider response remains
UNKNOWN; reopening after application and PostgreSQL restart does not send it again.

This follows the [backend read checkpoint](MAYA-PERSONAL-OWNER-READ-CHECKPOINT-20261007.md)
and the [readable booking checkpoint](MAYA-BOOKING-CONFIRMATION-OUTCOMES-20261007.md).
It is a local development result, not production activation or C10 completion.

## One existing authority chain

`React chat → AiCore → existing C9 appointments.own.list → PersonalScheduleSource
→ sealed SCHEDULE → existing NAVIGATE/Gate6/current canonical READ → separately
sealed fs.booking child → finite transient personal receiver → existing personal
HTTP contract → PersonalClientContext/quote/Action Engine`.

The navigation template is finite and only admitted from the actual own.list
source. The child rechecks the exact retained parent, tenant, conversation, turn,
principal proof, seal, release projection and current personal context. The
parent's presentation grants no mutation authority. Owner cards contain no
CLIENT cancellation/reschedule recipes; the child cannot recursively navigate.
The existing CLIENT recipes on the parent keep their existing authorization.

The transient form has no conversation writer, persistent browser store, polling
or role switch. Its fixed net port uses the existing single fetch site and closed
routes/DTOs. Only preview/results/create carry the literal per-request
`x-maya-authority-context: personal_client`; public catalog reads carry no selected
Client authority. Contact, Client/link, role and provider payload fields are not
accepted from the form. The server independently resolves current authority.

Confirmation consumes the local selection before awaiting create. The next
preview correlates through the canonical selection/idempotency owner and reads
that execution's state; another successful execution in a result page cannot
confirm this request. UNKNOWN, unreadable outcomes and pending requests outside
the first results page prevent automatic repeat dispatch. Manual result checks
perform GET only. Close, sign-out, revocation, frozen detail and expiry discard
transient facts; late responses cannot repopulate them. Initial expiry during
child preparation is covered separately from a later expiry timer.

## Executed evidence

Fresh **r5** runs built React in owned Chrome against actual AppModule/auth,
current C9 and PostgreSQL. The next stage creates a new application process and
restarts that same owned PostgreSQL cluster. No page response is fabricated.

| Scenario | Observed result |
|---|---|
| Existing owner previews | Zero new AE executions or appointments before confirmation; source, price/duration, staff and salon timezone visible |
| Explicit successful confirm | One SUCCEEDED execution, attempt 1, one new canonical appointment |
| Link revoked after preview | Create and later result read return 403; zero new executions/appointments |
| Provider saves then drops response | UNKNOWN, attempt 1, one provider ledger row; no new canonical appointment |
| New app/PG and browser session | Success and UNKNOWN retain attempt 1; provider dispatches and reconciliations both zero |
| Manual result check | A new completed GET is awaited; exact create count remains unchanged |
| Scoped preview/results | Observed Prisma model/raw writes are empty |

Each scenario starts with one existing canonical appointment so that the
own.list entry is truthful. Thus the success count is two appointments; the
revoked/UNKNOWN counts remain one. The role and active membership are checked
at the scenario checkpoints. After restart, success is visible through a fresh
own.list with two appointments and a new selection form; this is **not** a restored
success terminal card. UNKNOWN is visibly restored as an uncertain result with
no confirmation control. The existing incomplete-history notice is retained.

Eight complete serialized model request bodies (six before, two after restart)
are preserved. They contain user messages and empty tool_results, and exclude
the tested private service, branch, visit times, counts, contacts and account/link
identifiers. The private assistant replies are displayed in React and supplied
to the next chat route, but not forwarded to the model. The model response is
scripted at the real serializer's network boundary; this is not real-model
privacy/factuality acceptance for arbitrary inputs.

Final checks: **77 backend tests, 166 runtime/transport tests, 93 React regression
tests, 10 build self-tests PASS**. Production-only backend TypeScript at 4096 MB,
scoped ESLint and shell/React builds pass. No aggregate HTTP/PG suite or full
test/script typecheck is claimed. Independent code/evidence review found no
remaining blocker in this scope. Preview, success, refusal and restarted UNKNOWN
screenshots were inspected. This is functional desktop evidence, not mobile
visual acceptance or a completed UI polish pass.

All five attempts are preserved: r1 exposed the duplicate entry/navigation
control; r2 exhausted the synthetic request budget; r3 lost its tool session in
resume and is explicitly interrupted; r4 clicked before history/widget restore
finished; r5 passes with the actual enabled composer and new-request refresh
waits. Earlier failing local checks are retained too. Every owned cluster has
`pg_ctl status` exit 3, all recorded PG/carrier ports are closed, and no owned
Chrome remains. See the [hashed evidence manifest](evidence/maya-development-integration-20261006/personal-owner-react/manifest.json).

## Exact remaining boundaries

Subsequent clarification: [First Client binding remainder](MAYA-FIRST-CLIENT-LINK-REMAINDER-20261007.md) records the existing A18 V1 initial-binding path through another verified channel. The V2-only observation below is historical and does not mean all initial Maya binding mechanisms are absent.

1. **First Client link is not authorized by SB-1 V2.** The approved
   [successor contract](widget-release-programme/sb1-v2/CONTRACT.md) requires the
   exact latest revoked predecessor and canonical CRM verification channel.
   `ClientReverificationCandidateService` rejects
   `latest_revoked_exact_client_predecessor_required`; an existing Client row or
   phone equality does not fix that. Challenge/consume remain backend routes,
   not a new carrier onboarding flow. The pending context question is:
   **«У этого аккаунта раньше уже был подтверждённый клиентский профиль MAYA,
   или это первая привязка?»** No answer is treated as authority.
2. **Empty own.list has no opener.** The existing PersonalScheduleAdapter needs
   a real eligible appointment row. A truthful list-level empty-state entry must
   be specified/admitted separately; no fabricated appointment/range/source is
   used. Denied owner own.create also cannot authorize navigation through its
   denied retained source under [R3.9.6](MAYA-WIDGET-CONTRACT-V1.md).
3. **Normal relay activation remains incomplete.** The canonical
   [PHP relay](../../maya-saas-backend/deploy/platform/beget-edge/maya-platform-api.php)
   and its [faithful dev relay](../../maya-chat-shell/dev/serve.mjs) do not forward
   the personal-context header. R5 uses an explicitly test-only loopback relay
   that forwards the carrier's literal header without injecting identity/context.
   Relay parity/R01 qualification and a separately authorized release are still
   required. Neither relay, the website, nor deployment settings were changed.

The A18 verifier, identities, catalog and provider in the proof are synthetic.
The loopback provider persists then drops one response; no real YCLIENTS adapter
is instantiated. Existing create/audit/recovery behavior is preserved; its
synthetic internal notification lineage fails closed, so notifications are not
qualified. No real model/provider/SMS, production identity mutation, HTTPS/phone,
push/merge/deploy, schema/retention decision, background authority or second
orchestrator was introduced. Qualification remains **NOT_ISSUED**.
