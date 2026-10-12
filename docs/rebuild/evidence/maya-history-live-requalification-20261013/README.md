# Live history → last-visit requalification

13 October 2026 (Europe/Moscow), branch `codex/maya-local-crm-setup-20261010`.
Executed candidate: `ccd8ad91d9fef03d9e474b74f91b8fb15f4b82f3`.
**TWO-QUESTION LIVE LOCAL ACCEPTANCE: PASS. NOT RELEASE CERTIFICATION.**

## Executed path

The owner authorized the bounded retry and signed into ordinary Maya in Chrome.
The approved native Keychain component supplied both saved keys without another
credential-entry prompt. No authentication bypass or token extraction was used.
The same retained local database, existing verified personal Client and existing
conversation were used; no CRM setup, binding or journal import was repeated.

| Question | Actual model plan | Result |
| --- | --- | --- |
| Покажи историю моих визитов | `booking.list_own`, `period=past` | Four own retained rows; persisted reply exactly matches the canonical server composer |
| Когда я был у вас последний раз? | `booking.list_own`, `period=last_visit` | Correct absence of confirmed attended visits, with limited-history caveat; exact canonical reply match |

The read-only database proof checked two distinct fresh persisted user turns,
two assistant completions, two completed `appointments.own.list` executions and
one conversation. Both results contain only the four rows belonging to the
verified personal Client; the other 158 rows are excluded. These four saved rows
do not establish an attended visit. Absence in this bounded local history is not
proof that the person has never visited the salon.

This closes the specific live semantic requalification left open after
[`880b4653` / `e267e9ef`](../maya-history-current-request-20261012/README.md).
The older [`f653516d` failure](../maya-history-keychain-live-20261012/README.md)
remains historical evidence. One successful live pair is not a statistical
reliability claim or acceptance of all personal-history questions.

## Browser and observation limits

Both questions were sent through the actual React AChat, without refresh or
another login after the owner signed in. Native Chrome automation initially did
not deliver the intended Cyrillic text. Each final field value was verified
before clicking Send; the database contains the exact two requested questions.
No duplicate question reached the server in this attempt.

Native accessibility observations sometimes lagged behind completed responses.
Opening diagnostics and switching the privacy view back to the same conversation
exposed the current state without refreshing or clearing authentication. The
second HTTP request was visibly `201`, 5.67 seconds. Both answers were visible;
the full second answer's normalized hash matches the persisted canonical reply.
The first answer's accessibility text was truncated: its full UI text hash was
not captured. Exact first-reply equality is a persistence/composer proof, not a
full browser DOM hash. This does not resolve the broader browser automation /
blank-window issue. Historical incomplete-reply notices remain in the timeline.

The local observation script was corrected to read the actual structured
response at `semantic_plan.tasks[].entities_json`, rather than a nonexistent
top-level `entities`. Five synthetic parser checks passed; the original script
is retained and both hashes are recorded. This changed only a local read-only
observer, not product bytes or model requests.

## Scope, usage and cleanup

- Authorized window: 01:20:47–01:50:47 MSK; explicitly stopped after completion.
- DeepSeek: two requests, both successful; 31,699 prompt tokens and 371 completion
  tokens reported. Conservative approved-price estimate: **$0.04331184**, below
  $2. This is not a verified provider invoice. Original pricing evidence timestamp
  was retained within the admission contract's 24-hour freshness window.
- YCLIENTS: three catalogue reads (`book_services`, `categories`, `team`), zero
  refused reads; no customer/journal reimport or business mutation.
- Personal visit results remain in the canonical server composer. The bounded
  planning admission continues to exclude private visits/contacts/notes and
  previous assistant replies from model input; this pass made no policy changes.
- PostgreSQL stopped, runtime process group absent, private state retained and
  source bytes unchanged: PASS. Receipt status `cancelled` means the explicit
  orderly SIGTERM after success, not failure of either question.
- No production, grant, migration, SMS/OTP, YCLIENTS booking/change/cancellation,
  notification, iPhone operation or Chapter 10 work.

The preceding day-12-03 and day-13-01 attempts expired with zero model calls.
Their raw receipts and the browser interruption remain separately hashed in the
manifest; they are not presented as successful acceptance.

## Evidence and remaining work

Adjacent JSON contains inspected counts/hashes, actual model periods, exact
canonical reply comparisons, UI observation limits, usage and cleanup. Raw model
responses, local operational manifests, database files, keys and customer data
are not committed. `receipt-manifest.json` preserves source paths and hashes for
the selected local receipts; it does not archive the database or credentials.

Next is the separately scoped real create → result → reschedule → cancel
acceptance. The synthetic [booking preview/recovery evidence](../maya-owned-booking-preview-20261012/README.md)
does not authorize or prove real provider effects. Mobile/voice qualification,
messenger delivery, broader workflows, release certification and full product
acceptance remain separate work. This documentation commit does not re-certify
the candidate or extend the completed external-access window.
