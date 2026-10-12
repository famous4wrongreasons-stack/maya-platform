# Saved-key live history: retrieval passes, last-visit semantics fail

Executed 2026-10-12 on `f653516d1ebf41af1f28c358fbbcd4229f204237`, branch
`codex/maya-local-crm-setup-20261010`. **PARTIAL local live acceptance**, not
release certification or production acceptance.

## Authorization and browser recovery

Owner approval `call_41rON9aoJOoMzKsEZlijtIdU` covered two exact questions,
30 minutes, at most 12 DeepSeek calls/$2 and 40 catalogue reads, existing local
visits only. Permit: 18:15:47.179Z–18:45:47.179Z. The owned session was stopped
early after both questions. No permit renewal, history import, booking, message,
OTP, production mutation, grant or migration occurred.

The approved native Keychain component obtained both real credentials without
another owner entry. Values were not printed or archived. Several old Maya
windows were present; a stale Telegram callback and agent-created `about:blank`
window were closed. The precise cause of the owner's earlier white window is
not proven. The owner then logged into the prepared browser, and chat rendered.
An earlier send from a different stale window returned to login without a model
call. No product, UI, cache or authentication changes were made to claim a fix.

## Fresh results

- Both questions: HTTP 201, completed `appointments.own.list`, exact server
  reply visible (whitespace normalized), one existing conversation, two distinct
  persisted user turns and request identities.
- “Покажи историю моих визитов”: **PASS**. Four personal rows; the actual tool
  result ID hash equals the canonical database aggregate. 158 other/unresolved
  salon rows excluded. Visible reply equals the canonical `past` composer over
  the actual result, including its limited-coverage caveat.
- “Когда я был у вас последний раз?”: **FAIL**. The same four-row history is
  repeated. `grounding=verified` proves source-backed data, not satisfaction of
  this question. Do not count this as successful last-visit acceptance.
- Those four saved rows contain zero confirmed attended visits. The existing
  `last_visit` composer over the same actual tool result correctly explains that
  absence; it does not invent a last-visit date or claim all-time completeness.

## Reproduced failure

Both recorded model outputs now provide valid empty tool arguments `{}`; the
previous `ai_tool_arguments_invalid` failure was not observed. Instead, the
second output supplies `entities.period=past` where the latest question requires
`last_visit`. The actual compiled parser preserves `past`; the canonical registry
accepts `{}`. Both visible replies equal the `past` composer, not `last_visit`.
This is a semantic planning error, not unavailable data or failed rendering.

The offline recorded-response proof blocks fetch and reads no credentials or
database. A diagnostic-only copy changing just the period to `last_visit` is
accepted without widening arguments or authority. It is not a product fix or
substitute live response. The underlying reason the model retained `past` is
not established by this observation alone.

Next local work: conversation-level history → last-visit regression, including
re-evaluation of the period from the latest request. Preserve exact-Client
authority, closed tool input and attendance rules. Do not introduce phrase-based
booking authority or silently replace observed model evidence.

## Usage and cleanup

Exactly two provider HTTP 200 model calls, three catalogue reads (`book_services`,
`categories`, `team`), no provider refusals. Reported usage: 31,737 input and 530
output tokens. At admitted uncached prices, estimate $0.04399164; conservative
reservation $0.21353508, below $2. This is not a verified invoice.

The bounded planner guard admitted the two approved questions and permitted
planning context. Personal tool results were composed locally. No private
replies, credentials or browser screenshots are copied here.

Owned backend/runtime/broker and PostgreSQL stopped cleanly. Database/private
service state preserved; all candidate source bytes unchanged during the run.
`cancelled` in the receipt is the explicit orderly SIGTERM after both questions,
not startup or provider failure. Only evidence and the delivery plan change
after shutdown; this checkpoint changes no product code.

Included receipts are inspected aggregate copies. The manifest records paths,
hashes and sizes of local originals; raw provider responses and runtime manifests
remain local. The executable local diagnostic is also identified by hash.
Historical preflight tests do not replace these fresh, partially failing results.
