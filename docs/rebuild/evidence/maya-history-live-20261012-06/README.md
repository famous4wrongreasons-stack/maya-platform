# Live personal history: first answer passes; last-visit planning blocked

2026-10-12. Executed candidate `8c6aff11c2bdcc7f205c61f75214f00bc41d5eb9`,
branch `codex/maya-local-crm-setup-20261010`. Local acceptance only, not release
certification. The original two-question owner allowance expired at 14:57 Moscow;
both questions completed and the owned session was stopped at 14:41:40.

The owner approved the $2/12-attempt/30-minute bounded review in
`call_fc03710fd8d4404fb997ff4fcdca117c`, requested the corrected retry, completed
manual credential entry and password login, and explicitly instructed this chat
to continue despite conflicting coordination from another thread.

## Executed results

- One ordinary browser login. Existing personal binding, privacy consent and
  history setting remained valid; marketing stayed false. No setting/consent write.
- Canonical reader returned exactly four personal rows. Their ID hash equals
  the read-only canonical database aggregate; 158 other salon rows are excluded.
- “Покажи историю моих визитов”: HTTP 201, completed `appointments.own.list`,
  verified grounding. Reply equals the canonical server composer over those
  four rows and the visible React message equals that reply, apart from the
  normal MAYA accessibility prefix. This is functional text evidence, not a
  complete visual design review.
- “Когда я был у вас последний раз?”: HTTP 201 with a blocked fallback,
  no tool execution. This question FAILS live answer acceptance. No false date
  or success was announced. The saved rows do not establish confirmed attendance;
  the canonical answer should explain that absence rather than claim a date.
- Same existing conversation: seven previous turns remain unchanged, four new
  turns persisted. The previously interrupted turn was not automatically retried.
- Exactly two DeepSeek calls, both provider HTTP 200; three YCLIENTS catalogue
  GETs (`book_services`, `categories`, `team`), zero other provider calls/refusals.
  No client/journal import, booking, notification, OTP, production or grant.
- Model input passed the finite history planner guard: no private visit results,
  assistant history, contacts or notes. Private replies were composed locally.
- Reported model usage: 31,579 input / 538 output tokens; at the admitted uncached
  price, estimate $0.04381476 (not an invoice). Conservative reservation $0.212553,
  under the $2 limit. No subsequent paid retry.

## Exact reproduced failure

The second recorded model output has `booking.list_own` and the correct semantic
`entities.period=last_visit`, but proposes tool arguments `{"period":"last_visit"}`.
The canonical `appointments.own.list` input contract accepts an empty object only.
The normal tool registry refuses with `ai_tool_arguments_invalid`.

`recorded-planner-proof.mjs` runs the actual compiled planning parser and registry
without fetch, credentials or database. The first recorded output passes. The
second semantic plan validates, but its tool arguments fail. Changing ONLY the
tool arguments to `{}` in an in-memory diagnostic copy passes while retaining
semantic `period=last_visit`. Expanded semantic fields are recomputed by the
existing validator; their presence is not the reproduced blocker. No product
code or real model response was changed to manufacture acceptance.

Next implementation work: make this recorded failure a regression for the
planner/tool contract. Do not widen Client authority or silently accept arbitrary
tool fields. Local replay should precede any new paid/live qualification.

## Preservation and cleanup

Owned browser and runner stopped, PostgreSQL stopped, retained database preserved.
Source and private service-key file hashes stayed unchanged throughout the run.
No raw personal replies or credentials are archived here. Raw local receipts are
listed by path/hash in `receipt-manifest.json`; small inspected aggregate receipts
are included. This evidence records a PARTIAL result, never a green substitute.

Earlier attempt `-05` failed before a provider call because preparation used a
microsecond pricing timestamp where admission requires canonical millisecond ISO.
The corrected `-06` permit was checked by the same read-only validator before
manual input; the original expiry/budget stayed unchanged. Neither credentials
nor product code caused that preparation failure.
