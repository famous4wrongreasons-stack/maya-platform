# Chat-First Gate Programme — code readiness for the first real booking E2E (no booking was performed)

**Branch:** `codex/maya-identity-consent-20260913`

**Certified input:** Wave 6 at `a43ded94aeca6692a0d4536ca4d97c3062a39576`

**Final code/test target:** `3b00f38b6424969697b26eb0fd3f43c8f92d827f` — the published branch head, equal to
`origin/codex/maya-identity-consent-20260913`. Every code, test, generated and workflow file is committed at
that SHA; the only uncommitted file while this report is being written is the report itself, which the
publication commit below carries. The FBE2E delta is `a43ded94..3b00f38b` —
**ten commits, 62 changed files**: `54503ed8` FBE2E-1, `6af72aa4` FBE2E-2, `e1806508` FBE2E-3, `fb69bb78`
FBE2E-4, `5f6c9f06` the regenerated shell transport manifest, `3d44f42e` the one-line selector-owner
ratchet, and the four recovery commits below.

**The four recovery commits.** The first two were needed to make a mutation receipt obtainable at all and
change no runtime behaviour; the third is this report's previous edition; the fourth is the owner-approved
runtime fix this edition certifies.

| commit | what it is |
|---|---|
| `6ccb9f48` | **test-only.** One mutation declaration file, `test/widgets-live/mutations/gateP-g15b.json`, `+3 −3`: `G15B-M1`'s anchor widened so it resolves exactly once again. Without it the whole 31-battery corpus refused to load. |
| `66675087` | **test, harness and one workflow comment.** Six files: the E2 booking fixture's opening hours, the K9 finance-fence scan, the mutation battery runner, the mutation CI helper, that helper's own test file, and a comment-only edit to `.github/workflows/widgets-mutation.yml`. No runtime, business, security, contract or generated file. |
| `6ab4ffa6` | **docs-only.** The previous edition of this report, certifying `66675087` and naming, as its first limitation, the one confirmed open defect that `3b00f38b` now fixes. |
| `3b00f38b` | **the owner-approved runtime fix.** Three files: `src/widgets/stores/intent-audit.store.ts` (`+52 −1`), its pinned unit spec `src/widgets/stores/widget-stores.service.spec.ts` (`+43 −0`), and the new `test/widgets-live/h2-terminal-line-ownership.live-spec.ts` (`+388`). Nothing else: no schema, migration, action class, route, owner port, capability, mutation declaration, workflow or shell file. |

`git diff --name-only 3d44f42e..3b00f38b` lists eleven files. Exactly **one** of them is a non-spec file
under `src/` — `intent-audit.store.ts`, the approved fix — so **runtime files changed after `3d44f42e`: 1,
and it is the one the owner authorised.** Everything else in that range is test, harness, mutation
declaration, workflow comment or documentation.

**The confirmed open defect of the previous edition is FIXED.** A post-commit escape tap used to replace a
`CONFIRMED` terminal line with `SUBMITTED` and drop the Action Engine receipt reference. Under the owner's
ruling — **CONFIRMED + DISMISS leaves the booking CONFIRMED**; a dismiss is not a business state
transition, not a receipt revocation and not a cancellation; the action receipt is immutable historical
evidence and a UI dismiss is a presentation/lifecycle operation only — the write is now fenced to the
intent its receipt adjudicates. The ruling's four prohibitions and where each is proven:

| the dismiss MUST NOT | proven by | where |
|---|---|---|
| downgrade the presentation to `SUBMITTED` / pending | executed trace, both directions, in PostgreSQL **and** on a real `POST /api/widgets/resolve`; pinned in CI by the new live spec | **§7.3** clause 1 |
| erase `actionReceiptRef` | executed trace: the reference read off the receipt row *before* the dismiss is the reference in the line *after* it, and both receipt rows are untouched and asserted in order | **§7.3** clause 2 |
| overwrite the confirmed `TerminalLine` | executed trace (`terminalLinesJson` is still exactly one element, deep-equal to the COMMIT's) **plus** assertion — the unit spec now pins both `updateMany` call shapes and the two monotonicity assertions. On the CONFIRMED-over-CONFIRMED branch this holds today because of the minter's shape, not because of the predicate — **L14** | **§7.3** clause 3 |
| create a contradictory conversation state | executed trace read from the real shell runtime's own conversation view: after the dismiss it contains neither «Запрос принят. Подтверждение ожидается.» nor «Запись не подтверждена.», and every assistant line is «Запись подтверждена.» | **§7.3** clause 4 |

The fix is scoped to itself. Five residuals it leaves or creates are disclosed and deliberately **not**
fixed, because the owner scoped this change to the prepared fix alone: **L14**, **L15**, **L17**, **L27**
and **L28**.

**Publication.** This report is published as a **docs-only commit that touches this file alone**, made after
the five workflow receipts at `3b00f38b` landed. Until that commit exists this file is an uncommitted
modification and nothing else in the tree differs from the certified SHA. It changes no runtime, test, generated or workflow
file, so it does not move the code/test target: **the receipts belong to `3b00f38b`**, which is the exact
SHA certified here.

**Production deployment:** none.

**Real production business / provider / message effects:** zero. Every live proof ran against a database
created for the proof and the internal provider fixture; no external CRM, provider or messaging system was
reached.

---

## 1. Delivered scope

The bounded FBE2E package closes the remaining code path between the certified Chat-First shell and the
certified Wave 6 booking owner:

1. **`FBE2E-1 SHELL-INTENT-BINDING`** connects the existing `SubmissionPort` to authenticated
   `/widgets/intent` and returns authorized successor envelopes through the existing shell store and
   renderer;
2. **`FBE2E-2 BOOKING-SELECTOR-TRANSITIONS`** advances `SERVICE_SELECTOR` → `STAFF_SELECTOR` →
   `TIME_SLOT_SELECTOR` → `BOOKING_CONFIRMATION` through server-owned transitions and canonical
   catalog/availability reads;
3. **`FBE2E-3 RECEIPT-TO-CONVERSATION`** projects a confirmed Action Engine receipt as a server-authored
   terminal line through `/widgets/resolve` into the shell's conversation store — and, since `3b00f38b`,
   keeps that line owned by the intent the receipt adjudicates (**§7**);
4. **`FBE2E-4 FIRST-REAL-SHELL-E2E`** runs the real shell runtime, renderer and intent projection in a
   separate Node process against the Nest HTTP gateway, an isolated PostgreSQL database and the internal
   provider fixture.

Chapter 10, CRM Control, Unified Inbox and other later product capabilities were **not** started.

## 2. How to read the proof levels

Every claim below names its proof and the level at which that proof executes. The levels are not
interchangeable, and no section claims a level its proof does not reach.

| level | what it means here |
|---|---|
| **live-HTTP** | a real HTTP request over TCP into the assembled production `AppModule` behind all six global guards (`test/widgets-live/support/http-bootstrap.ts`), against real PostgreSQL. **Not** the compiled binary |
| **live-GW** | in-process gateway: the production service called directly against real PostgreSQL, no HTTP hop |
| **unit** | jest or `node --test` with the collaborators doubled; no server, no database |
| **build** | source-text, typecheck, reproducible-build or manifest assertion — the bytes are inspected, no behaviour is executed |
| **BIN** | the production binary corpus (`npm run test:widgets:http` against the built `dist/src/main`). **No FBE2E line reaches this level**: `scripts/widgets-http-proof/**` is byte-unchanged across the delta and holds no booking or shell case. See **L4** |

A unit proof is not a live one anywhere in this document. Where a row carries both levels, both are named.

## 3. FBE2E-1 — shell intent binding

The shell sends only the opaque intent token and one server-declared input value (`option_id` or
`slot_ref`) permitted by the envelope `InputSchema`. It cannot select a capability, owner, lifecycle
stage, endpoint or successor widget. An accepted successor envelope re-enters the existing verified
ingestion/store/render pipeline; a settled result can append only server-authored terminal lines returned
by the read path. Client text, button labels and tap state cannot become receipt evidence.

| what | proof | level |
|---|---|---|
| live submission uses only the widget intent/resolve routes and returns the authorized successor or receipt line | `maya-chat-shell/test/intents.test.mjs` :: `FBE2E-1: live submission uses only widget intent/resolve and returns the authorized successor or receipt line` | **unit** — the transport is a hand-written double |
| a drawn selector can submit only a server-declared option/ref value | `intents.test.mjs` :: `FBE2E-1: a drawn selector can submit only one server-declared option/ref value` | **unit** |
| the submission body is the closed contract type, with nothing riding along | `intents.test.mjs` :: `the submission is the contract WidgetIntentSubmission: exact members, the vault token, nothing else` | **unit** |
| an extra member does not compile | `intents.test.mjs` :: `the submission literal is checked against the closed contract type: an extra member does not compile` | **build** — a real `ts.createProgram` probe with its own negative controls |
| the network allowlist is exactly the nine approved endpoints, one fetch call site | `maya-chat-shell/test/net.test.mjs` :: `PATHS holds exactly the nine approved literals; one fetch call site; API_BASE is the one endpoint line`, with `deepEqual` against `build.mjs`'s `P1_PATHS`; non-vacuity control `the gates are not vacuous over these files: a tenth path, …` | **build** |
| the transport sends only typed bodies and retains only authorized response members | `net.test.mjs` :: `widget transport sends only typed bodies and retains only authorized response members` | **unit** |

The submission is never put on a wire at this level. See **L3**.

## 4. FBE2E-2 — server-owned booking progression

Closed-domain option validation happens on the server. Partial selections are retained only as
server-mapped opaque frozen-noun evidence in the successor `WidgetIntentRecord`. Neither the shell, the
widget body nor the LLM owns transition state or booking semantics. The confirmation remains linked to its
exact predecessor, conversation, tenant and principal and reaches the already certified `P-MINT-BOOK`
registry and the existing booking owner.

Each transition re-checks the tenant and the canonical source; the REFINE selector transitions
additionally re-check the authority/actor binding through `sameAuthority`. The slot → confirmation DRAFT
transition does **not** — see **L7**.

| transition | proof | level |
|---|---|---|
| **SERVICE → STAFF** | router: `src/widgets/routing/effect-router.service.spec.ts` :: `FBE2E-2 SERVICE_SELECTOR uses the validated opaque option and the canonical server owner to choose STAFF_SELECTOR`. Owner read: `src/widgets/owner-ports/booking-selector.adapter.spec.ts` :: `reads staff through the existing policy/runtime and never accepts a raw service id` (a raw id yields `null` with zero further reads) | **unit**; plus **live-HTTP** inside FBE2E-4, where the shell harness refuses any successor whose `kind` is not `STAFF_SELECTOR` |
| **STAFF → SLOT** | router: `effect-router.service.spec.ts` :: `FBE2E-2 STAFF_SELECTOR retains the exact service handle and lets the canonical owner choose TIME_SLOT_SELECTOR`. Owner read: `booking-selector.adapter.spec.ts` :: `reads availability with exact reopened service/staff ids and rejects foreign tenant handles`. Presentation: `src/widgets/booking/booking-selector.presenter.spec.ts` :: `projects valid availability into exact opaque slot refs and refuses malformed facts` | **unit**; plus **live-HTTP** inside FBE2E-4 (same mechanism) |
| **SLOT → CONFIRMATION** | router: `effect-router.service.spec.ts` :: `FBE2E-2 TIME_SLOT_SELECTOR creates an existing server draft and confirmation without client-selected capability` (asserts `putDraft` once and the booking minter once). Owner quote: `src/widgets/owner-ports/booking-preview.adapter.spec.ts` :: `reopens exact opaque handles and delegates quote semantics to the existing booking owner` and `rejects raw or foreign handles before asking the booking owner`. Gate 11: `src/widgets/owner-ports/noun-resolution.owners.provider.spec.ts` :: `defers the exact selector-stage pair until Gate 13 supplies the validated slot`, `decodes only the recognized opaque booking slot before the canonical fresh quote`, `fails closed when a server-recognized booking slot has no canonical encoding` | **unit**; plus **live-HTTP** inside FBE2E-4 (same mechanism) |
| **CONFIRMATION → P-MINT-BOOK** | `src/widgets/emission/booking-confirmation-minter.service.spec.ts` :: `FBE2E-2 links create confirmation to its selector while copying the exact canonical owner fact` — asserts the fact is the *same object*, `facts_origin: ['copied']`, `origin.emitter: 'capability_read'` and the exact `supersedesWidgetId`. Registry: `src/widgets/booking/booking-intent-template.registry.spec.ts` :: `owns typed selector progression, three propose edges and three typed COMMIT recipes`, `resolves a server-owned exact recipe`, `refuses a HANDOFF-only capability member in the booking mint registry` | **unit**; its mutation ratchet `gateP-mint.json#MINT-M17` is **build-killed at its declared status** in the receipt of §10 |
| fail-closed on an inexact selector input or inherited handle set | `effect-router.service.spec.ts` :: `FBE2E-2 fails closed when a selector input or inherited handle set is not exact` | **unit** |

At the unit level the owners are doubled, so these prove the router's wiring and its refusals, not the
canonical reads. The canonical reads are exercised end to end only inside FBE2E-4.

Two properties of the new owner and presenter are weaker than the transitions they serve, and neither is
hidden: the new owner declares its own read `COMPLETE` where the certified canonical owner reports that it
cannot measure completeness (**L8**), and the presenter renders three contract-visible cells as `KNOWN` for
properties the canonical read never returned (**L6**).

## 5. FBE2E-3 — receipt to conversation

The commit continues through the existing Gate 14 / Action Engine path. `CONFIRMED` is emitted only when
the canonical receipt is `ACCEPTED` and carries a non-null `actionReceiptRef`. `SUBMITTED` and `UNKNOWN`
cannot masquerade as success. UNKNOWN preserves the existing reconciliation semantics and never opens a new
channel or blind retry.

The successful receipt path is:

```text
Action Engine
→ WidgetIntentReceipt.actionReceiptRef
→ server-authored TerminalLine
→ /widgets/resolve
→ the shell's conversation store
→ the Maya conversation view
```

| what | proof | level |
|---|---|---|
| the terminal outcome is derived from the durable receipt, never from the submitted claim (`CONFIRMED` / `SUBMITTED`) | `src/widgets/stores/widget-stores.service.spec.ts` :: `derives the terminal outcome from the durable receipt, never from the submitted claim` | **unit** — see **L22** on what this test does and does not establish |
| a refused receipt yields `NOT_CONFIRMED`, and the write is idempotent by tenant/token with no utterance echo | `widget-stores.service.spec.ts` :: `writeReceipt is idempotent by tenant/token and never retains an utterance echo` | **unit**; the `NOT_CONFIRMED` branch was additionally executed at **live-HTTP** while proving the fix — §7.5 — by a trace harness that is **not** in the repository, so it is not re-run in CI |
| the claim/reconciliation writes are tenant-scoped compare-and-set | `widget-stores.service.spec.ts` :: `claim and reconciliation are tenant-scoped compare-and-set writes` | **unit** |
| `CONFIRMED` is never published without a durable canonical action receipt | `src/widgets/routing/effect-router.architecture.spec.ts` :: `FBE2E-3 never publishes CONFIRMED without a durable canonical action receipt` | **build** — this ratchet matches regexes against the source text of `intent-audit.store.ts`; it executes nothing |
| only a server terminal receipt enters conversation, and the successor replaces the selector | `maya-chat-shell/test/intents.test.mjs` :: `FBE2E-1/3: successor replaces the selector and only a server terminal receipt enters conversation` | **unit** |
| the line is read back over the real resolve route and appears in the real shell's conversation | FBE2E-4, below | **live-HTTP** |
| the published line belongs to the intent the receipt adjudicates, so a dismiss cannot take a confirmation back | `test/widgets-live/h2-terminal-line-ownership.live-spec.ts` — **`PASS` in CI at `3b00f38b`** (§11) — plus the executed clause traces of §7.3 | **live-HTTP** + real PostgreSQL |

The chat **network** transport is out of FBE2E-4's scope and is stubbed to fail in the executable proof —
see **L19**. The write that publishes this line was the site of the previous edition's one confirmed open
defect; §7 is that defect and its fix.

## 6. FBE2E-4 — real shell proof

The executable proof spawns a separate Node process (`test/widgets-live/support/shell-booking-flow.mjs`)
which runs the real shell runtime, renderer and intent projection against the live HTTP gateway, activating
only controls the production renderer drew, through service, staff, slot and confirmation. The confirmation
submits the existing typed booking COMMIT, passes Gate 14, invokes the existing Action Engine booking owner
and returns the durable receipt to the same conversation store.

| what | proof | level |
|---|---|---|
| the whole walk | `maya-saas-backend/test/widgets-live/e2-booking.live-spec.ts` :: `E2 — BOOK-1…BOOK-6 and live Gate 14 booking COMMIT [HTTP, PostgreSQL]` › `BOOK-1…BOOK-6: create, reschedule and cancel each propose then COMMIT through Gate 14`. **In CI at `3b00f38b`:** `PASS test/widgets-live/e2-booking.live-spec.ts`, inside the 24-suite / 340-test Widgets Live run on a freshly migrated PostgreSQL service (99 migrations applied) | **live-HTTP** |
| **LIVE COMMIT THROUGH GATE 14** | the same test: BOOK-4 and BOOK-6 assert literally `{ outcome: 'terminate', receipt_outcome: 'ACCEPTED', gates_run: 14, stopped_at_gate: '13' }` and `owner_decision.state === 'SUCCEEDED'` over `POST /api/widgets/intent` | **live-HTTP** — but see **L18**: these two are submitted by the jest harness, not by the shell process |
| **ACTION ENGINE RECEIPT** | the same test, BOOK-2: a `widgetIntentReceipt` row for the shell's own confirmation widget with `outcome: 'ACCEPTED'` and a non-null `actionReceiptRef`; `actionExecution` rows for `crm.appointment.{create,reschedule,cancel}.v1` all `SUCCEEDED`, and exactly three of them | **live-HTTP** + real PostgreSQL |
| **RECEIPT → MAYA CONVERSATION** | the same test: `terminal_lines` equals exactly one `CONFIRMED` line carrying that `actionReceiptRef`, read back over a real `POST /api/widgets/resolve`; and the real shell's assistant lines, taken from `runtime.conversation.view()`, contain that server-authored line, with zero locally authored sentences | **live-HTTP** on both sides — and since `3b00f38b` that line also survives the confirmation's own escape, §7 |

What the proof does **not** cover, stated so it is not read for more than it measures: it loads the shell's
TypeScript **sources** (`maya-chat-shell/src/renderer/render.ts`, `src/net/project.ts`, `src/shell/intents.ts`,
`src/shell/shell.ts`) via Node type-stripping, **not** the built shell artifact; the authenticated HTTP calls
are made by the harness's own `post()` over global `fetch` passed in as `transport`, **not** by the shell's
own `src/net/client.ts`; and it does not run the compiled backend binary. See **L3** and **L4**.

Since `3b00f38b` it is no longer the only live spec that touches FBE2E: `h2-terminal-line-ownership.live-spec.ts`
is the second, and it is the one that pins the terminal-line ownership rule (§7).

The fixture's availability window was moved to 12:00–14:00 tenant-local at `66675087` so that the walk no
longer depends on the hour it runs at; §10.2 records why, and **L5** records the runtime observation found
underneath it.

## 7. The fix at `3b00f38b` — the terminal line belongs to the intent that was adjudicated

This section is the one new proof in this edition. Every figure in it was read from a log or an artifact of
the run that produced it; the evidence files are
`.maya-program/fbe2e/H2-DEFECT-AND-FIX.md`, `.maya-program/fbe2e/H2-APPLIED.md` and
`.maya-program/fbe2e/verify-terminal-line-overwrite.md`, outside the repository.

### 7.1 What was wrong

`src/widgets/stores/intent-audit.store.ts` published a `BOOKING_CONFIRMATION`'s terminal line with a
predicate keyed on the **widget alone** — `{tenantId, widgetId, kind: 'BOOKING_CONFIRMATION', erasedAt: null}` —
at `writeReceipt` and identically at `reconcileAcceptedReceipt`. There was no intent in that `where`: no
`intentTokenHash`, no effect, no capability, no lifecycle condition, no "only if empty". So **any** receipt
for **any** intent of that widget replaced the whole array.

Every `BOOKING_CONFIRMATION` carries two separately tokenised intents minted onto the same `widgetId`: the
primary COMMIT (`commit.booking.<subject>@1`, capability `AE / crm.appointment.<subject>.v1`) and the escape
the contract requires on every tier (`control.dismiss@1`, capability `CONTROL / control.widget.dismiss`),
which the production renderer draws as a Dismiss button. The escape is admitted with
`actionReceiptRef: null`, i.e. receipt outcome `ACCEPTED` with no canonical reference — which is exactly
`terminalLine`'s `SUBMITTED` branch. A real shell process pressing **Confirm booking** and then **Dismiss**
turned `{outcome: 'CONFIRMED', text: 'Запись подтверждена.', action_receipt_ref: <uuid>}` into
`{outcome: 'SUBMITTED', text: 'Запрос принят. Подтверждение ожидается.', action_receipt_ref: null}` in
`WidgetEmission.terminalLinesJson`, on the thread page and in the chat — while `appointment.status` stayed
`confirmed`, the `ActionExecution` row stayed `SUCCEEDED` and both receipt rows stayed intact. The write
arrived with `e1806508` (FBE2E-3) and does not exist in the certified Wave 6 input.

### 7.2 The ownership predicate

One idea, expressed once and used twice: **the terminal line belongs to the intent the receipt adjudicates,
not to the widget the intent was drawn on.** It is a relation filter on the pre-existing
`WidgetEmission.intentRecords`, inside the same `updateMany` — no new model, field, migration, action class,
route, owner, capability or second query:

```ts
const ownedBy = (tenantId, intentTokenHash, publishesConfirmed) => ({
  some: scoped(tenantId, { intentTokenHash, effect: 'COMMIT', capabilitySpace: 'AE' }),
  ...(publishesConfirmed ? {} : {
    none: scoped(tenantId, {
      effect: 'COMMIT',
      receipts: { some: scoped(tenantId, { outcome: 'ACCEPTED', actionReceiptRef: { not: null } }) },
    }),
  }),
});
```

- **`some` — identification, and fail-closed.** The emission must hold the very record this token named,
  and that record must be the confirmation's own Action-Engine COMMIT. A CONTROL escape, a REFINE, a DRAFT
  or a token whose record cannot be found matches nothing, so nothing is written. This is the clause that
  kills the defect.
- **`none` — monotonicity.** Unless the line being published is itself `CONFIRMED`, no COMMIT of that
  emission may already hold the canonical action receipt. `CONFIRMED` is published unconditionally, because
  it is the one line that cannot take another back — which is also why **L14** exists.

`writeReceipt` derives the line once (`const line = terminalLine(receipt)`) and passes
`line.outcome === 'CONFIRMED'` into the predicate; `reconcileAcceptedReceipt` gets the same predicate with
`true`, because reconciliation only ever fills in a canonical reference and therefore only ever publishes
`CONFIRMED`. `terminalLine` itself, the receipt upsert and its idempotency, the claim, the refusal
vocabulary, the escape's own effect and every gate are untouched.

The fail-closed direction was bounded rather than assumed: `grep` finds no `widgetIntentRecord.delete` or
`deleteMany` anywhere in `src` or `scripts`, the model carries no erasure column of its own, and a
`BOOKING_CONFIRMATION` mints `amend_intents: []`, so a confirmation has exactly two records — the AE COMMIT
and the CONTROL escape. There is no path in the tree on which a live COMMIT's own record is absent at the
moment its line is published.

### 7.3 The counterfactual, and the four prohibitions

**Counterfactual, executed both ways on one real database, same hour, Node v22.23.3.** Reverted (a scratch
copy whose `intent-audit.store.ts` is byte-identical to the pre-fix file), the new live spec fails **rc 1**
on exactly one assertion and no other — a `CONFIRMED` line with its `uuid` becomes `SUBMITTED` with
`action_receipt_ref: null`. Applied, on the real tree, it passes **rc 0**. Every assertion before that one
passed on both sides: the COMMIT was routed, the line *was* `CONFIRMED` with its canonical reference, and
the escape *was* admitted and dismissed.

The four prohibitions were traced through the certified E2/FBE2E-4 create path over the production HTTP
routes, with the **real shell process** (production renderer, production transport, `createLiveSubmission`)
pressing **Confirm booking** and then **Dismiss** on the same card. The two sides are
`logs/h2applied-clause-trace-fixed.log` (rc 0, 3/3) and `logs/h2applied-clause-trace-reverted.log` (rc 1).

| clause | result | the executed trace |
|---|---|---|
| **1 — MUST NOT downgrade the presentation** | **PASS, executed trace** | after the dismiss, both in PostgreSQL and on a real `POST /api/widgets/resolve`: `{text: 'Запись подтверждена.', outcome: 'CONFIRMED', action_receipt_ref: '483ed7f8-…'}`. The same trace on the pristine-store copy, same dismiss, same moment: `{text: 'Запрос принят. Подтверждение ожидается.', outcome: 'SUBMITTED', action_receipt_ref: null}` |
| **2 — MUST NOT erase `actionReceiptRef`** | **PASS, executed trace** | the reference read off the receipt row *before* the dismiss is the reference in the line *after* it, in the store and on the thread page. Both receipt rows are asserted exactly and in order: `[{ACCEPTED, '483ed7f8-…'}, {ACCEPTED, null}]` — the COMMIT's, and the escape's adjudicating only itself. The escape's receipt neither gains a canonical reference nor takes the COMMIT's away |
| **3 — MUST NOT overwrite the confirmed `TerminalLine`** | **PASS, executed trace + assertion** | `terminalLinesJson` after the dismiss is an array of **exactly one** element, deep-equal to the one the COMMIT wrote (an exact array comparison, so an appended second line would fail it too). At assertion level the change pins the predicate itself: both `widgetEmission.updateMany` call shapes now carry `intentRecords.some = {intentTokenHash, effect: 'COMMIT', capabilitySpace: 'AE', tenantId}`, and two new assertions pin the monotonicity rule at the same granularity — the `CONFIRMED` write has **no** `none` clause, every non-`CONFIRMED` write **has** one. **L14** states what this clause does not yet owe to the predicate |
| **4 — MUST NOT create a contradictory conversation state** | **PASS, executed trace** | read from the real shell runtime's own timeline (`runtime.conversation.view().items`, assistant items only). With the fix: `assistantLines: ['Запись подтверждена.', 'Запись подтверждена.']`, `display: 'terminal'`. With the fix reverted, same run, same press: `['Запись подтверждена.', 'Запрос принят. Подтверждение ожидается.']`. The trace asserts it negatively as well: after the dismiss the conversation contains neither «Запрос принят. Подтверждение ожидается.» nor «Запись не подтверждена.», and every assistant line is «Запись подтверждена.» |

The doubled line in clause 4's fixed column is not a slip — it is disclosed as **L27**.

### 7.4 DISMISS still dismisses

| what DISMISS must still do | evidence, from the same run with the fix applied |
|---|---|
| still be admitted | `receipt_outcome: ACCEPTED`; its own receipt row is written (`{ACCEPTED, null}`) |
| still return its dismissed resolution | the shell activation returns exactly `{"outcome": "dismissed"}`; the shipped regression spec additionally asserts the server's `resolved_widget: {control: 'dismissed'}` |
| still move the widget's delivery/lifecycle state | `activations 4 → 5`, `submissions 4 → 5`, `stateChanges 4 → 5`, `sentences` stays **0** (no silent outcome), `display` stays `terminal` |
| leave the booking confirmed | `appointment.status = confirmed` and `ActionExecution = [{crm.appointment.create.v1, SUCCEEDED}]`, both asserted **after** the dismiss |

The escape is still a real submission that is routed, claimed, adjudicated and recorded. What changed is
only that its adjudication no longer publishes a line it does not own.

### 7.5 The other two terminal branches still publish — and at what level

The fix is fail-closed, so this is the direction that had to be shown. Both traces below ran on a real
database over the production HTTP routes, and both live in the recovery programme's own scratch copies:
the **only** part of §7 that is committed and therefore re-run in CI is
`test/widgets-live/h2-terminal-line-ownership.live-spec.ts`, which covers the dismiss. These two branches
are proven by executed trace, not by a committed spec. Before the fix, **neither** of them
had any live coverage at all: `grep` over `src`, `test`, `scripts` and the shell finds
«Запрос принят…» only in `intent-audit.store.ts`, and «Запись не подтверждена.» only there and in the unit
spec.

**`NOT_CONFIRMED` — fully live.** The certified create path walks to the confirmation; then the booking
becomes impossible **at the owner, not at a gate** — the client's verified channel link is revoked after
sealing (a complete first revocation, the only update the A18 evidence trigger permits), which the canonical
appointment owner requires and which no gate reads. The frozen nouns and the world they name are untouched,
so Gate 11 has nothing stale to find, and the real **Confirm booking** button is then pressed over
`POST /api/widgets/intent`: `{outcome: 'terminate', receipt_outcome: 'REFUSED', refusal_code: null,
gates_run: 14, stopped_at_gate: '13', owner_decision: null}`, and
`{text: 'Запись не подтверждена.', outcome: 'NOT_CONFIRMED', action_receipt_ref: null}` is published in
PostgreSQL and on the thread page, with `appointment.count` 0. It is admitted because it *is* that COMMIT's
own adjudication (`some` matches) and no COMMIT of that emission holds a canonical receipt (`none` holds).
Three earlier attempts at this refusal are recorded in the logs and did **not** reach the owner: deleting
the provider–service link is caught by Gate 11 (`superseded/handle_stale`, stopped at 9/11), and suspending
the membership invalidates the session (HTTP 401).

**`SUBMITTED` — live on everything the fix could break, with the verdict itself supplied. Stated plainly
rather than implied.** An UNKNOWN Action-Engine outcome is the only legitimate producer of `SUBMITTED`, and
it cannot be produced from outside the process: `ActionExecutionState.UNKNOWN` is written only when a worker
lease expires after an external dispatch that may have crossed the boundary, and **no fault-injection seam
for it exists**. So the trace walks the real create path to a real minted confirmation, reads that
confirmation's real COMMIT record from PostgreSQL (asserting `capabilitySpace === 'AE'`), and calls the
**booted application's own** `WidgetStoresService.writeReceipt` with exactly what `CommitBookingAdapter`
returns for UNKNOWN — `outcome: 'ACCEPTED', actionReceiptRef: null`. Everything downstream is live: the
ownership predicate, the write, the projection, the real `POST /api/widgets/resolve`. The line is published
as `{text: 'Запрос принят. Подтверждение ожидается.', outcome: 'SUBMITTED', action_receipt_ref: null}`; then
`reconcileAcceptedReceipt` on the same booted app, as the effect router calls it, returns `true` and
upgrades the same line to `CONFIRMED` with its reference — the second `updateMany` the fix touches,
exercised live. **What this is not:** the owner's UNKNOWN verdict is supplied rather than produced by an
uncertain CRM call. This branch therefore does not reach the same level as the `NOT_CONFIRMED` one, and
**L20** and the `UNKNOWN SEMANTICS` result line are unchanged by it.

Both branches produce the same lines with the fix **reverted** — those two trace tests pass on both sides —
which is the statement that the fix changed nothing about them.

### 7.6 What else was executed on the fixed tree

Locally, every rc read directly from `$?`: the whole unit corpus **570 suites / 5319 tests** rc 0; all four
typechecks, lint (0 errors, 9 pre-existing warnings, **none** in the three touched files), build, K3 10/10,
the K3–K6 exit gates, `run-all-checks.sh` 25 checkers, the binary HTTP proof 15/15, and
`test:widgets:live` **24 suites / 340 tests** rc 0. One non-reproducing transport-level flake in
`gate8-input.live-spec.ts` is disclosed in the evidence file rather than called green: it did not reproduce
in ten further runs on either side of the fix, and that suite contains `BOOKING_CONFIRMATION` zero times, so
neither `updateMany` the fix touches can match anything in it.

The two mutation batteries that name the touched files were run **whole and unrestricted**: `gate13`
(25 mutants) and `P-mint` (20 mutants), both `AS-DECLARED`, `mismatches: 0`, `restrictions` all null, both
baseline controls green (`RED BASELINES: 0`), no mutant `SURVIVED`, `UNEXPECTED` or `vacuous`. The four
`gate13` mutants that patch the fixed file were each killed by the killer they declare, three of them by the
very unit tests this change edits. The whole-corpus dry-run validated every `find` anchor and every killer
id of all 373 declarations against the new tree, rc 0.

**The paired edit is load-bearing in both halves, and that was proved rather than asserted.** With the store
reverted to its pre-fix text and the **fixed** unit spec in place, `jest src/widgets/stores` is rc 1 with
`Tests: 3 failed, 33 passed` — and the three that fail are exactly the three the patch touches
(`writeReceipt is idempotent…`, `derives the terminal outcome from the durable receipt…`, `claim and
reconciliation are tenant-scoped compare-and-set writes`). Neither half stands alone, and the new
assertions are not vacuous. That, together with the live spec's single-assertion counterfactual, is the
whole defence of the new predicate — because it carries no mutant (**L15**).

## 8. Structural finality

Each row was verified against the repository at **both** `a43ded94` and `3b00f38b`, not taken from the
implementation record, and re-measured for this edition.

| claim | result | how it was verified |
|---|---|---|
| **NEW MODELS** | **0** | `grep -cE '^model '` over `prisma/schema.prisma` at both SHAs → 130 / 130; enums 21 / 21; the whole file's `sha256` is **identical** at both SHAs (`a151afd3a549cfed…`) |
| **NEW PHYSICAL FIELDS** | **0** | the same byte-identical schema digest, over the one and only `.prisma` file in the repository; plus a scan of the whole delta for out-of-band DDL — `git diff a43ded94..3b00f38b -U0`, excluding this report's own prose, contains no `ALTER TABLE`, `ADD COLUMN`, `CREATE TABLE` or `executeRaw` (0 hits; the one raw hit in the delta is this document quoting the check). FBE2E writes into the **pre-existing** `WidgetEmission.terminalLinesJson`, and the fix reads the **pre-existing** `WidgetEmission.intentRecords` relation — both present at `a43ded94` |
| **NEW ACTION CLASSES** | **0** | `git diff --name-only a43ded94..3b00f38b -- src/action-engine src/orchestration` → **0 files**; `action-engine.registry.ts` digest `482d9c51e34c2586…` and `orchestration/c9.registry.ts` digest `a3e59981bd19390d…` identical at both SHAs |
| **MIGRATIONS** | **0 added** | `git ls-tree -d` over `prisma/migrations` → 99 / 99 at both SHAs; `git diff --name-only … -- prisma` → 0 files; independently, `prisma migrate deploy` in both the Widgets Live and Platform CI jobs at `3b00f38b` reports `99 migrations found in prisma/migrations` and `All migrations have been successfully applied` |
| **NO NEW CONTROLLER ROUTE** | **confirmed** | the delta's 62 changed files contain **no controller file at all**, and `git diff -U0 a43ded94..3b00f38b` adds no `@Get`/`@Post`/`@Put`/`@Patch`/`@Delete`/`@All` decorator anywhere (0 hits). `/api/widgets/intent` and `/api/widgets/resolve` are the pre-existing Wave-6 routes |
| **THE SHELL'S TWO WIDGET ROUTES** | **exactly two** | `maya-chat-shell/src/net/client.ts`'s `PATHS` holds nine literals, of which the widget routes are `widgetIntent: '/widgets/intent'` and `widgetResolve: '/widgets/resolve'`; the whole diff of `maya-chat-shell/build.mjs` is `+2 −0` — those same two literals appended to `P1_PATHS`. The build's fetch-shape gate refuses a tenth, with `test/fixtures/build/refuse/fetch-shape/widgets-path-added` as its own negative control, and the Chat Shell receipt at `3b00f38b` records `self-test: refuse 66/66 refused with the named rule, admit 23/23 admitted, coverage 31/31, write guard 2/2` |

## 9. Permanent boundaries

Architectural, build and mutation ratchets preserve:

- `SHELL != BOOKING OWNER`;
- `WIDGET BODY != BUSINESS STATE`;
- `CLIENT TAP != BUSINESS AUTHORITY`;
- `LLM != SELECTOR TRANSITION OWNER`;
- `BUTTON != ENDPOINT`;
- `UNKNOWN != SUCCESS`;
- `SUBMITTED != CONFIRMED`.

Three of these are weaker on the booking path than on the generic one, and each is named in the
limitations below rather than left to be discovered: `CLIENT TAP != BUSINESS AUTHORITY` (**L7**, **L13**,
**L25**), `WIDGET BODY != BUSINESS STATE` (**L6**, **L8**, **L20**, **L24**) and `SUBMITTED != CONFIRMED`
(**L21**).

`SUBMITTED != CONFIRMED` now holds in **both** directions on the confirmation path. It always held in the
direction that matters for fraud — a submitted claim cannot become `CONFIRMED`, because `terminalLine` reads
the durable receipt. Until `3b00f38b` it failed in the opposite direction, where a true `CONFIRMED` could be
replaced by `SUBMITTED`; §7 closes that, and `test/widgets-live/h2-terminal-line-ownership.live-spec.ts`
pins it live in CI. What the predicate does **not** yet forbid is one `CONFIRMED` replacing another with a
different reference — **L14**.

## 10. The mutation corpus at the final target

Counts below were aggregated from the receipt artifacts of Widgets Mutation run **36338566165** at
`3b00f38b` — all 47 shard receipts and all 31 assembled per-battery receipts, parsed rather than read off a
summary line. Every one carries `source_head: 3b00f38b6424969697b26eb0fd3f43c8f92d827f` and contract
`maya.widgets-mutation-battery/2`.

| | count |
|---|---|
| batteries | **31** |
| shards (CI matrix jobs) | **47** — gates 6/7/9/10/13 ×4, `P-mint` ×2, the other 25 whole |
| jobs in the run | **49** — 47 shards, the planner, the fail-closed aggregator; all `success` |
| declarations | **373** |
| — recorded `build-killed` | 242 |
| — recorded `live-killed` | 128 |
| — recorded `pending` (`gate6#M17b` and `gate6#M18b`) | 2 |
| — recorded `equivalent`, never run (`gate10#M10-5`, declared equivalent) | 1 |
| mutants whose recorded status differs from its declaration | **0** |
| `SURVIVED` | **0** |
| `UNEXPECTED` | **0** |
| `vacuous` kills | **0** |
| shards with a red baseline control (`baseline_red`) | **0** |
| shard statuses | 25 `AS-DECLARED` (whole batteries) + 22 `PARTITION-AS-DECLARED` |
| assembled per-battery receipts | **31**, every one `AS-DECLARED` with `baseline_red: []` |
| receipts carrying the `baseline_red` field at all | **78 of 78** |
| the aggregator's own statement | `Total of 47 artifact(s) downloaded` → `COMPLETE BATTERIES: 31; mutants: 373` |

Across all 78 receipt artifacts the status tally is therefore **56 `AS-DECLARED`** (25 whole shards + 31
assembled receipts) and **22 `PARTITION-AS-DECLARED`**.

Declarations at the certified input `a43ded94` were **368**, so the delta adds exactly **+5** and no battery
was added or removed. The fix at `3b00f38b` adds **none** — it touches no declaration file, which is exactly
why **L15** exists. The five are all in `gateP-mint.json`, which grows 15 → 20, and **all five reached their
declared status in this receipt**:

| mutant | file | declared | recorded | killed by |
|---|---|---|---|---|
| `MINT-M16` loss of strict service-selector construction | `envelope.factory.ts` | build-killed | **build-killed** | `FBE2E-2 mints a strict service selector` |
| `MINT-M17` incorrect confirmation predecessor linkage | `booking-confirmation-minter.service.ts` | build-killed | **build-killed** | `FBE2E-2 links create confirmation` |
| `MINT-M18` slot-decoding bypass | `noun-resolution.owners.provider.ts` | build-killed | **build-killed** | `decodes only the recognized opaque booking slot` |
| `MINT-M19` widened Gate 11 deferral | `noun-resolution.owners.provider.ts` | build-killed | **build-killed** | `defers the exact selector-stage pair` |
| `MINT-M20` live end-to-end booking-path violation | `successor-minter.service.ts` | live-killed | **live-killed** | `BOOK-1…BOOK-6` |

`MINT-M20` and `gateP-principal#P-M11` — the two mutants whose killer is the FBE2E-4 booking test — are
both recorded `kills_by_entry {untagged: 1}` and `live_evidence: false`. That is **L1**, measured again at
this SHA. Corpus-wide, this receipt records `kills_by_entry` totals `{BUILD: 328, GW: 86, untagged: 70,
HTTP: 31, RI: 26, U: 3}` and **27 of 373** mutants with `live_evidence: true` — unchanged from the previous
target, because the fix declares no mutant and the new live spec is nobody's declared killer.

Two existing Gate 13 receipt mutants were retargeted to the final implementation anchors, and neither was
weakened. `gate13.json` holds the same **25** declarations with the same ids at both SHAs; both keep their
declared `build-killed` status and their identical killers, and both are recorded at that status here.

### 10.1 The `P-g15b` anchor fix, and why the corpus could not load without it

FBE2E-2 gave `src/widgets/emission/successor-minter.service.ts` a **second** predecessor lookup whose three
lines are identical to the first, so `gateP-g15b.json#G15B-M1`'s anchor matched twice and the runner's
loader refused to load — not that battery alone: at `3d44f42e` the **whole 31-battery corpus** exited `2`
before a single mutant ran, on any runtime. `6ccb9f48` widens the anchor with its surrounding
`intentRecords.some{…}` and the following `renderReceipts:` so it resolves exactly once, and the widened
anchor was checked against git to confirm it pins the **same** statement the certified declaration mutated:
at `a43ded94` the old anchor occurred exactly once, and that occurrence was the generic `mint()` lock's
re-check — the one the widened anchor still matches. The mutation's substance is unchanged: it still deletes
`principalProofHash` from the predecessor lookup, and `G15-9` still kills it, which is what this receipt
records. `edits` semantics, `killers` and `expect` are unchanged for all eight mutants; no mutant was
removed, no killer widened, no declared status downgraded. The whole diff is `+3 −3` in one file: the
widened `find`/`replace` pair, and one word added to the mutant's description so that it says *generic*
successor-link lock — because after FBE2E-2 there are two lock-guarded principal fences in that file and the
old wording read broader than the counterfactual.

### 10.2 The clock-fragile fixture

The mutation receipt at `6ccb9f48` failed on one shard. `P-mint-part-2-of-2` reported `MISMATCH`,
`mismatches: 1`, `MINT-M20` `SURVIVED` with `killedBy: []` and one `vacuous` entry reading *"fails on the
unmutated baseline"* — because the shard's `baseline|live` control was already red on `BOOK-1…BOOK-6`.

The cause was the fixture, not the mutation and not the mirror. `e2-booking.live-spec.ts` opened its salon
**00:00–02:00 tenant-local** on every weekday. `BookingSelectorAdapter.advance` asks the internal calendar
for the day one ahead and the industry preset drops every candidate closer than a 120-minute minimum
notice, so that window is empty for every wall clock after **20:31 UTC**. Widgets Live ran the spec at
18:25 UTC and passed; the mutation shard reached its control at ≈22:30 UTC and the flow legitimately refused
with `booking_selector_source_unavailable`, surfacing in the shell as `activation_unavailable`.

The repair is two literals and a comment in that fixture — `startMinute: 12 * 60`, `endMinute: 14 * 60`.
A read-only probe that imports the real `localDateMinuteToUtc` and the real `getIndustryPreset` and
replicates the adapter's asked-for date and the notice filter's first clause swept a 5-minute clock grid:
the committed 00:00–02:00 window offers **zero** slots in 328 of 2304 samples (the 20:31→00:00 UTC band,
14.2 % of every day), the repaired 12:00–14:00 window offers **four slots at all 2304 samples** — the same
four the green runs always had, so the envelope size is unchanged — with a worst-case lead of 9.08 h, and a
whole-day window mints an oversize envelope, so the window had to be *moved*, not widened. No clock was ever
forced: the 21:00 and 22:30 UTC figures above are that read-only probe's calculation, not spec runs. What was
executed is a real red/green pair at the machine's own wall clock inside the dead band — the pristine fixture
failed at 23:11:54 UTC with `shell activation refused` and the repaired fixture passed at 23:14:35 UTC, same
database, same mirror — plus a three-window experiment at a fixed 23:04 UTC in which only the fixture's two
literals varied (00:00–02:00 refused, a whole day minted an oversize envelope, 12:00–14:00 passed).
This corrects the commit message of `66675087`, which this report certifies: that message says the repair was
verified "by a 20,160-sample probe … and by forced-clock runs: pristine red at 21:00, 22:30 and 23:00 UTC".
No clock was forced and the probe sampled 2,304 points on the window that matters; the conclusion stands on
the probe plus the real red/green pair above, and the commit message overstated how it was reached.

Not one assertion, killer, mutant declaration, expected status, runtime file or workflow changed. All 31
battery declaration files plus `neutralisers.json` were hashed against `HEAD` — 32 of 32 identical.

### 10.3 The chance-red finance-fence scan

A second shard, `P-f88`, was green with a red `baseline|unit,typecheck,k3`: one failing unit test,
`K9 — the finance fence shell.pay carries ONE opaque session_ref and nothing else`.

The runtime was doing exactly what K9 requires. The **test** was scanning generated entropy for English
words: `mintShellPaySession()` returns 32 characters of base64url, and the old assertion lowercased the
whole JSON and asserted it contained none of `http`, `url`, `checkout`, `token`, `card`, `provider`.
Measured with the real mint, **3,000,000 mints** under Node 22: **2,887 reds**, p = 9.623e-4, about one in
1039; by marker `url` 2718, `card` 88, `http` 79, `token` 2, `checkout` 0, `provider` 0. Across the 287
unit-step jest invocations recorded in that run's 47 shard artifacts the expectation is 0.276 such reds and
`P(at least one) = 24.1 %`; observed 1. Platform CI runs the unit suite once per commit, so it is green with
probability 99.90 % — which is why the 570-suite run was green and said nothing about this test being sound.
Five other candidates (mirror construction, the jest invocation, a missing env literal, test ordering, a
genuinely order-dependent test) were each ruled out by execution, and the failure was reproduced inside the
runner's own mirror by forcing one value the real mint does produce.

The repair is in the spec only: the scan now runs over the wire **shape**, with the one opaque value elided
by a `JSON.stringify` replacer, and a new `Object.getOwnPropertyNames` assertion covers non-enumerable
members. Over 3,000,000 real mints the scanned string is now a single constant with 0 reds. One class of
finding is given up and named in the spec: a ref whose *value* carried a marker while still satisfying
`SESSION_REF_PATTERN` — which the pattern assertion immediately above it already forbids. No battery
declaration names this test, so no killer, declaration or expected status changed.

### 10.4 The baseline-integrity gate, and the defect it closes

**The defect, stated plainly rather than hidden: in the earlier run at `6ccb9f48`, seven of the 47 shards
ran with a red UNMUTATED baseline control, and six of them reported green — `AS-DECLARED` or
`PARTITION-AS-DECLARED`, exit 0.** Six were red on `baseline|live` with the E2 booking test failing
(shards `8`, `9-part-2-of-4`, `9-part-4-of-4`, `P-mint-part-1-of-2`, `P-mint-part-2-of-2`, `P-mt3`); the
seventh, `P-f88`, was red on `baseline|unit,typecheck,k3` with the K9 test failing. Only
`P-mint-part-2-of-2` was not green, and it failed for a different reason — the declaration mismatch of
§10.2. A shard whose unmutated mirror is not green has measured nothing its mutants can be judged by.

Two properties of the runner made it worse rather than louder: vacuity was tested per mutant against
**that mutant's own** killers, so a control failure nobody named was invisible; and a step was counted as
failing only when the **control's** same step had exited 0, so a red control step explained away the same
red step in every mutant.

`66675087` mechanises the rule the programme already stated — *a battery whose baseline is red proves
nothing*:

- three pure functions in `scripts/widgets-mutation-ci.mjs` (`redBaselineControls`, `describeRedBaselines`,
  `shardStatus`), imported by the battery runner, so the shard and the aggregation cannot disagree about
  what a red baseline is;
- a red baseline is a non-zero step exit, **or** a failed assertion with a zero exit, **or** a jest report
  that never arrived;
- new shard statuses `BASELINE-RED` and `BASELINE-RED+MISMATCH` (so neither hides the other), both exit 1,
  and a partition does not soften them; stderr names the control, the non-zero steps and every failing
  baseline test;
- every receipt now carries `baseline_red`, so "no red baseline" is something the artifact **says** rather
  than something a reader infers from a missing field — and at `3b00f38b` all 78 receipts carry it; and the
  aggregation recomputes the same check from each part's own `baseline_controls`, so an older receipt is
  judged by its measurements, not by its self-assessment;
- **neutraliser controls stay exempt**, and must: being red is a neutraliser's declared job. Four shards of
  that same run carried red neutraliser controls (`4` with `N4|live`, `6-part-3-of-4` and `6-part-4-of-4`
  with `N6-FLOOR|live`, `P-principal` with `N2|live`) which a broader gate would have failed wrongly. A
  test pins this: every neutraliser control in the synthetic fixture is reddened and the whole 31-battery
  assembly still passes.

Executed both ways. Against the pre-gate harness a simulated red baseline gave exit **0** and `AS-DECLARED`
with the field absent; against the new harness the same simulation gives exit **1**, `BASELINE-RED` and the
naming stderr line. Over the **real** 47 artifacts of the earlier run, the old aggregator's refusal read
`M-NULL-PASS: baseline red / 1 !== 0` — no part, no control, no failing test; the new one reads
`8: red baseline control — the unmutated mirror was not green: baseline|live: exits {"live":1}; failing
baseline tests: "E2 — BOOK-1…BOOK-6 …"`. Re-run on clean databases with both fixture repairs in place, the
**seven** affected parts — run together with two siblings, nine in all — reported `baseline_red: []`, every
mutant at its declared status, and the aggregation over them was rc 0. Those nine re-runs were made on a
working tree, not on the committed one; what settles the committed tree is the CI run at `3b00f38b`, which
re-measures the same property from the published commit across all 47 shards and records 0 red baselines.

**The gate's own tests ran in CI at `3b00f38b`**, in the Widgets Mutation run's planner job
(`Battery shards`): `node --test scripts/widgets-mutation-ci.test.mjs` → `# tests 34 / # pass 34 / # fail 0
/ # skipped 0`, including the four counterfactuals (`receipt fails closed: red baseline`, `… visible only in
a step exit`, `… receipt declares its own red baseline`, `… shard promoted a red baseline to AS-DECLARED`)
and the four gate tests (`gate: a baseline control is red on a non-zero step exit, a failed assertion, or a
missing report`, `gate: a red baseline is a distinct shard status and a non-zero exit, and never hides a
mismatch`, `gate: the refusal names the control, the steps and every failing baseline test`, `gate: the
assembly refuses the exact P-f88 part, AS-DECLARED and mismatch-free as it was written`).

One consumer was deliberately left alone and is disclosed as **L26**.

## 11. CI receipts at `3b00f38b`

Every GitHub Actions receipt is per-SHA, and `3b00f38b` is the SHA this report certifies. All five runs were
read from their own logs and artifacts; every run's `headSha` is
`3b00f38b6424969697b26eb0fd3f43c8f92d827f`, every run's `event` is `push` on this branch, and every
`conclusion` is `success`. **The figures below are re-read from these runs, not carried over from the
earlier target.**

| workflow | run id | conclusion | figures read from that run's own log |
|---|---|---|---|
| **Widget Contract** | `36338566169` | `success` | **Non-blocking by construction** — see **L2**. `Widget Contract (non-blocking)`: `npm ci` ok; `npx tsc --noEmit --project tsconfig.widget-contract.json` **exit 2 with 334 `error TS…` diagnostics** (the job log carries 336 `##[error]` lines; two of them are the tsc and checker steps' own exit markers), of which 88 are literally missing `@prisma/client` exports and the remaining 246 are attributed to the same cause by reading, not measured, because the job never runs `prisma generate`; `node scripts/widget-contract-check.mjs` → **`30/31 checks pass, 4 pending on a later package`**, the one `FAIL` being `[EXECUTED] the three registries load at their declared cardinalities`, from the same missing generated client; the Wave 1 build-exclusion step reported success. All of these figures are **identical to the previous target `66675087` and to the certified input `a43ded94`**, so nothing here moved in the delta or in the fix. `K1 surface dossier (non-blocking)`: **`15/15 checks pass`**, 795/795 surfaces covered, 112 primary-nav rows across all channels / 101 Maya-owned, owner signature present — 126 rows across 26 groups, 11 approved with conditions carrying 25 binding terms |
| **MAYA Chat Shell** | `36338566224` | `success` | Both matrix jobs green: **Node v22.23.2** and **Node v24.21.0**. Reproducible build against the committed manifest: `web reproducible: d956a485da3326f6…` with **30 per-file hashes equal**, and `cmp` of a fresh `dist/manifest.json` against the committed copy passed. Purity self-test: **`refuse 66/66` refused with the named rule, `admit 23/23` admitted, `coverage 31/31`, write guard 2/2, probes 8/8 refused, 0 refusals off probe lines**. Typecheck ok. Node test suite: **`tests 337, suites 8, pass 329, fail 0, cancelled 0, skipped 8, todo 0`** on each runtime. The 8 skips each print `LOCAL API NOT GIVEN — skipped, this is NOT a PASS`. **`K5 EXIT: PASS`** on both runtimes. **`K15 over src + entry: PASS`** on both — `maya-chat-shell/src` 29 files, `maya-chat-shell/entry` 2 files, successor authority values 0, client storage never (ast+text), reflective access none. The delta touches no shell file, so these are unchanged |
| **Widgets Live** | `36338566210` | `success` | One job, every step green. `prisma migrate deploy` → **99 migrations found, all applied**; `typecheck:widgets-live` ok; `test:widgets:live` → **`Test Suites: 24 passed, 24 total` / `Tests: 340 passed, 340 total`**, 113.017 s, including a `PASS` line for **each** of `test/widgets-live/e2-booking.live-spec.ts` (FBE2E-4) and `test/widgets-live/h2-terminal-line-ownership.live-spec.ts` (the fix's regression spec, new at this SHA — the +1 suite and +1 test over the previous target); `npm run build` ok; `test:widgets:http` (the production-binary corpus) → `contract maya.widgets-intent-http-proof/2`, **`cases: 15, status: PASS, failed: 0`**, binary health 200, `mint_provenance {captured: 2, malformed: 0}` |
| **Platform CI** | `36338566173` | `success` | Three jobs green. **Frontend bundles**: inline-script parse ok, prepublication safety contracts ok, routing/isolation counterfactuals **`# tests 8 / # pass 8 / # fail 0`**. **NestJS and Prisma** (Node v22.23.2): `npm audit --omit=dev --audit-level=high` → **`found 0 vulnerabilities`**; `prisma validate` → **`The schema at prisma/schema.prisma is valid`**; `migrate deploy` → **99 migrations, all applied**; seed ok; `typecheck` and `typecheck:scripts` ok; `lint` → **`9 problems (0 errors, 9 warnings)`**, all pre-existing unused-disable-directive warnings; `k3-gateway-check` → **`10/10 K3 structural checks pass`**; `npm test -- --runInBand` → **`Test Suites: 570 passed, 570 total` / `Tests: 5319 passed, 5319 total`**, 857.786 s; `test:e2e` → **1 suite / 1 test passed**; `npm run build` ok; HTTP smoke → **`HTTP smoke passed`**. **Legacy Python**: compileall ok, `unittest discover` → **`Ran 613 tests`, `OK`** |
| **Widgets Mutation** | `36338566165` | `success` | **49 of 49 jobs `success`**, 0 failed. Planner (`Battery shards`): `node --test scripts/widgets-mutation-ci.test.mjs` → **34/34**, 0 fail, 0 skipped. 47 shard jobs, one per planned shard. Aggregator: `Total of 47 artifact(s) downloaded` → **`COMPLETE BATTERIES: 31; mutants: 373`**, publishing 31 per-battery receipts as one complete artifact. Parsed from those artifacts: **0 `SURVIVED`, 0 `UNEXPECTED`, 0 status-vs-declaration mismatches, 0 `vacuous`, 0 red baseline controls**, every receipt at `source_head 3b00f38b…` — §10. **This receipt is a re-run of failed jobs at the same SHA; see the provenance note below** |

### 11.1 Receipt provenance, stated plainly

The Widgets Mutation receipt was obtained on the **second attempt** of run `36338566165`, and how that
happened is part of the receipt.

On the first attempt the `P-mint-part-2-of-2` shard was **cancelled by the runner**. Its log ends
`##[error]The operation was canceled.` at `21:44:53Z` after starting at `19:25:05Z` — **140 minutes** inside
the job's declared `timeout-minutes: 180`. There was **no test failure and no red baseline recorded**: the
shard produced no receipt at all, so the fail-closed aggregator refused with `RESULT: failure` and the run
concluded `failure`. That refusal is the gate of §10.4 doing its job — a missing part cannot be treated as a
green one.

I re-ran **only the failed jobs, at the same SHA**. On the second attempt the shard ran `22:26:31Z →
00:55:04Z` — **148 minutes** — and completed; the aggregation then admitted all 47 parts and the run
concluded `success`. **Nothing in the repository, the declarations, the harness or the workflow was changed
to obtain this receipt**; `3b00f38b` is the head of both attempts.

The margin is now thin and is disclosed rather than left to be discovered. The same shard took **116
minutes** at `66675087` (`06:51:01Z → 08:47:10Z` in run `36295381427`). The new live spec lengthens every
live step of that battery — each of its three `live-killed` mutants and its `baseline|live` control now runs
one more suite — so the shard grew by about 32 minutes and its headroom against the 180-minute ceiling is
now **about 30 minutes**. A further live spec, or a slower runner, will cancel it again. This is recorded as
**L16**.

The other four receipts were single-attempt runs whose every job concluded `success` on the first pass.

The Widgets Mutation row is the decisive one, and this is the second complete mutation receipt this branch
has admitted: at `a43ded94` and `3d44f42e` the run was `cancelled` and the aggregator never ran; at
`6ccb9f48` one shard failed on the declaration mismatch of §10.2 so the aggregator's first step refused; at
`66675087` the first complete receipt landed; and at `3b00f38b` it landed again, over the fixed tree. The
receipt is admitted by the fail-closed assembler — one job per planned shard, at the exact head, with
nothing stale, missing, duplicated, substituted, restricted or reduced, no red baseline anywhere, and zero
`SURVIVED` / `UNEXPECTED` across all 31 batteries / 47 shards / 373 declarations.

Nothing in this report rests on a Wave 6 carry-forward, and nothing rests on the receipts of the previous
target: the shell corpus (337 tests), the widgets live corpus (340 tests plus the 15-case binary HTTP
corpus), the application corpus (5319 tests), the e2e suite, the lint, the typechecks, the K3 checks, the
dependency audit and the whole mutation programme were all re-executed at **this** target by the five runs
above. Two repository-side counts are quoted from files rather than from a run: the gate clause inventory
(`docs/rebuild/evidence/maya-chat-first-ux/gate-clause-inventory.json` → 15 gates, 165 clauses) and the
shell manifest's 30 hashed web files (`web.files`; its `sources` list holds 32 entries).

## 12. Disclosed limitations

Every entry was verified against the repository or the receipts at `3b00f38b` before it was written down.
None was acted on: closing any of them is new work, and the owner scoped `3b00f38b` to the prepared fix
alone. They are listed most severe first and referenced by number from the sections above. **28 entries:
1 HIGH, 15 MEDIUM, 12 LOW.**

What changed in this edition's register, stated so the renumbering cannot hide anything:

- the previous edition's **L1** — the one confirmed open defect — is **CLOSED** and recorded as such
  immediately below, outside the numbered list;
- **five entries are new**: **L14**, **L15**, **L27** and **L28** are residuals of the fix, and **L16** is a
  residual of the receipt that certifies it;
- **L17** is not new. It is the previous edition's L15, restated: the fix changed its consequence (such a
  write no longer reaches the conversation) but not its cause (the lookup is still unfenced). It is the fifth
  residual the fix's own record discloses, and it is counted once, here;
- every other entry still stands and was carried over with its number shifted by one where the closed entry
  used to sit. The previous edition's L2…L24 are this edition's L1…L13 and L17…L26.

### CLOSED — a post-commit escape tap replaced a `CONFIRMED` terminal line with `SUBMITTED` and dropped the Action Engine receipt reference

**Was: HIGH, confirmed by execution, open at `66675087`. Now: fixed at `3b00f38b`, proven in both
directions.** The full defect statement, the ownership predicate, the counterfactual and the four
prohibitions of the owner's ruling are §7. In short: the terminal-line write was keyed on the widget alone,
so the confirmation's own `control.dismiss@1` escape — a second tokenised intent on the same `widgetId`,
admitted with `actionReceiptRef: null` — rewrote the booking's `CONFIRMED` line to `SUBMITTED` while the
appointment stayed `confirmed` and the Action Engine execution stayed `SUCCEEDED`.

Its proof, at the level each part reaches:

- **live-HTTP, in CI, at this SHA:** `PASS test/widgets-live/h2-terminal-line-ownership.live-spec.ts` inside
  Widgets Live run `36338566210` (§11);
- **live-HTTP counterfactual, executed locally on a real database:** reverted, that spec fails rc 1 on
  exactly one assertion — `CONFIRMED` with its `uuid` becomes `SUBMITTED` with a null reference — and on no
  other; applied, rc 0;
- **executed trace of all four prohibitions**, in both directions, with the real shell process pressing
  Confirm then Dismiss, reading PostgreSQL, a real `POST /api/widgets/resolve` and the shell runtime's own
  conversation view (§7.3);
- **unit, load-bearing:** three store tests now pin both `updateMany` call shapes and the monotonicity rule;
  with the store reverted and those assertions in place, exactly those three tests fail and no others
  (§7.6);
- **no mutant** attests it — that gap is **L15**, and it is why the two proofs above were each verified
  load-bearing rather than merely present.

`DISMISS` still dismisses (§7.4) and the other two terminal branches still publish (§7.5). The residuals the
fix leaves are **L14**, **L15**, **L17**, **L27** and **L28**.

---

**L1 — HIGH. The one live proof of the booking flow cannot count as HTTP evidence, because its test is
untagged.** The mutation runner reads a test's entry level from a tag of the form `[HTTP]`; the FBE2E-4
test's innermost `describe` reads `[HTTP, PostgreSQL]`, which that pattern does not match. This is
load-bearing, not cosmetic, and the receipt at `3b00f38b` records it: `gateP-mint#MINT-M20` and
`gateP-principal#P-M11`, the only two mutants in the whole corpus whose declared killer is that test, are
recorded `kills_by_entry {untagged: 1}` and `live_evidence: false`. Corpus-wide the receipt records 31
`HTTP` kills against **70 untagged** kills, and 27 of 373 mutants carry `live_evidence: true`. So the only
live proof of the whole booking flow contributes nothing to the corpus's HTTP-evidence count even though it
genuinely runs over real HTTP, in CI, at this target. The new `h2-terminal-line-ownership.live-spec.ts`
carries the same `[HTTP, PostgreSQL]` form, so it would inherit the same blindness if a mutant ever named
it. The tag predates FBE2E; FBE2E is what made this test the sole live carrier. The remedy is one character
of test metadata.

**L2 — MEDIUM. One of the five receipts cannot fail, and two of its steps did not pass.** The Widget
Contract workflow declares `continue-on-error: true` on both jobs and on every step that can fail — by
design, documented in the workflow's own header, because Wave 1 changes no deployed byte. Its `success`
conclusion is therefore **structural** and is not by itself evidence that its checks passed. At `3b00f38b`
they did not, and the log says so: `npx tsc --noEmit --project tsconfig.widget-contract.json` exited 2 with
334 diagnostics, and `widget-contract-check.mjs` reported `30/31 checks pass` with
`FAIL [EXECUTED] the three registries load at their declared cardinalities`. Both failures have one cause —
the job runs `npm ci` and never `prisma generate`, so `@prisma/client` has no generated client — and both
are byte-for-byte identical at the previous target `66675087` and at the certified input `a43ded94`, so
nothing in this delta or in the fix caused or worsened them. What the receipt does establish is the 30
structural checks that did pass and the K1 dossier job's 15/15. Closing this is a workflow change (add
`prisma generate`, then make the job blocking), which is a repository-settings and owner decision, not a
test repair.

**L3 — MEDIUM. `SHELL → /widgets/intent` is proven at build and unit only; the shell's own HTTP client
never issues a live widget request anywhere in the repository.** The live harness defines its own `post()`
over global `fetch` with hard-coded route literals and hands it in as the transport.
`maya-chat-shell/src/net/client.ts` — the module that owns `PATHS`, the endpoint base, the bearer, the
401-refresh single flight and the response projections — is imported nowhere under the backend's test tree.
A route literal that was wrong in `client.ts` but right in the harness would pass every gate in the
repository. What does hold: the nine-literal allowlist and its parity with the build's own list (build), the
reproducible manifest (build), the single fetch call site (build), and the typed-body / allowlisted-response
transport behaviour with `fetch` stubbed (unit).

**L4 — MEDIUM. No FBE2E line is proven against a built artifact.** The live E2E loads the shell's
TypeScript **sources** through Node type-stripping, not `dist/`'s built bundle, and it runs the backend
through the in-process `AppModule`, not the compiled binary. The production-binary corpus
(`scripts/widgets-http-proof/**`) is byte-unchanged across the delta and holds no booking or shell case, so
its 15 green cases at `3b00f38b` say nothing about FBE2E. The shell's built bytes are covered only at
**build** level: the reproducible-build check (30 per-file hashes equal, fresh build `cmp`-identical to the
committed manifest) proves the bundle is the one the sources produce, not that the bundle behaves. The fix's
own live spec runs at the same level as the rest of the live corpus — real HTTP into the assembled
`AppModule`, not the binary.

**L5 — MEDIUM. A UTC calendar date is handed to a tenant-local calendar, so the availability day is off by
one during the UTC evening.** `src/widgets/owner-ports/booking-selector.adapter.ts` computes the day to
offer as `new Date(input.routing.now.getTime() + 86_400_000).toISOString()`, and
`InternalCalendarService.getAvailableSlots` reads `params.date.slice(0, 10)` as a **tenant-local** date. For
a tenant east of UTC in the UTC evening that is the tenant's *current* local day, not tomorrow: a
Europe/Moscow tenant between 00:00 and 03:00 local would be offered today's remaining slots instead of
tomorrow's. This is runtime code and was deliberately not touched; it is not the cause of anything in §10.2
(with any daytime schedule the asked-for day still has slots hours out, which is exactly why the repaired
fixture is green at every hour). If "one day ahead" is part of the contract, this line is a genuine defect
and needs its own change.

**L6 — MEDIUM. The presenter renders three contract-visible cells as `KNOWN` for properties the canonical
read never returned.** Every service option carries `requires_consultation` as a known `false` and `enabled`
as a known `true`; every staff option carries `enabled` as a known `true`; every slot carries `availability`
as a known `FREE`. The known-cell helper sets `state: 'KNOWN'`, `reason_code: null` and `fact_ref: 0`, so
these read as measured evidence. Against the owner payload the presenter actually reads — service `id`,
`name`, `duration_minutes`, `price`, `currency`, `category`; staff `id`, `name`, `title`, `specialization`;
slot `start`, `end` — **no** `requires_consultation`, `enabled` or `availability` field exists, and the
availability read's own per-slot status is discarded. These are not decoration: the envelope factory
enumerates `body.options[].requires_consultation`, `body.options[].enabled` and
`body.groups[].slots[].availability` among the declared cell paths for the three selector kinds, so they are
contract-visible. The discipline was to hand and was not applied — the same file's unknown-measure helper
produces the correct `NOT_MEASURED` / `NOT_COLLECTED` form and is used for exactly one property (**L20**).
Coverage compounds it rather than catching it: `requires_consultation` occurs in **zero** spec or test file
across both projects; the staff assertions check the staff ref and label only; and the one assertion that
touches the slot cell pins the fabricated value — `availability: { value: 'FREE' }` for a source slot
carrying only `start` and `end` — as intended behaviour, without checking its `state`, `reason_code` or
`fact_ref`. Per **L12** the presenter has no mutant either.

**L7 — MEDIUM. The new DRAFT transition drops the three authority fences the certified DRAFT path
enforces, and fabricates a resolved-noun row.** `completeBookingSelection` is the only DRAFT destination in
the router that does not build its actuating input through the shared helper, and it therefore drops that
helper's three checks: authority tenant equals context tenant, authority user equals the acting user, and
actor tenant equals context tenant. It then hand-constructs the input from the JWT actor and the widget's
principal, and additionally asserts `resolvedNouns` as `{row: 'A1', diverged: false, diff: []}` — "read row
A1, nothing diverged" — for a read Gate 11 explicitly deferred. If actor and principal ever diverge, the
booking is quoted and drafted against the JWT actor's account while the draft row is written under the
widget's principal proof and the confirmation is minted for that principal; the certified DRAFT path
refuses that pairing outright. **Not reachable today, and verified so by execution:** on the JWT-only intent
route the authority's user is set from the request context, so the two always agree, and each hostile
submission — a token minted for another principal in the same tenant, a token for another tenant, an actor
whose JWT tenant differs from the resolved tenant — is refused at an earlier gate. The channel-carrier branch
sets a null user, which the two predicates treat differently; but such a principal cannot reach the gateway
without widening `PrincipalResolver.resolve`, which is a code change, and even then the booking owner's own
`resolveAccount` fence refuses the pairing. The sibling REFINE selector transition keeps an **equivalent**
check (not the same predicate), so this is an inconsistency inside the delta and a lost layer of
defence in depth, not a reachable hole and not a deliberate relaxation. No test can detect it: every router
case fixes the authority user and tenant equal to the acting context.

**L8 — MEDIUM. A second canonical capability-read call site was added, and it fabricates its own
completeness where the canonical owner reports that it cannot measure completeness.** The certified owner
edge deliberately reports `{status: 'PARTIAL', totalCount: null, hasMore: true, reasonCodes:
['NOT_COLLECTED']}`, because it cannot measure completeness. The new booking selector adapter, calling the
same underlying reads, asserts `{status: 'COMPLETE', returnedCount = totalCount = <array length>,
hasMore: false, truncated: false, reasonCodes: []}` — and when the payload shape is not recognised its
`returned` computation falls through to `0`, so the fact still claims `COMPLETE` with a total of 0 and no
more pages. That fact becomes the envelope's declared completeness, so the successor selector tells the
client the option list is complete on evidence the owner never produced. The import-graph architecture test
was widened from one canonical-read edge to two to admit the new call site. That widening is `+4 −1` in
`widget-import-graph.architecture.spec.ts` and rides in `fb69bb78` (FBE2E-4). It is **not** in `3d44f42e`,
whose whole content is one different line in the same file — `'BOOKING_SELECTOR_OWNER'` added to the declared
owner set. So the ratchet that held "one canonical read edge" now admits two with divergent evidence
discipline.

**L9 — MEDIUM. The rewrite of the shell COMMIT block deleted the only executable witness that the booking
COMMIT traversed all fourteen gates.** The previous BOOK-1/BOOK-2 block asserted
`{ outcome: 'terminate', receipt_outcome: 'ACCEPTED', gates_run: 14, stopped_at_gate: '13' }` and
`owner_decision.state === 'SUCCEEDED'`; neither string survives anywhere in the new block, and nothing
replaces them. The shell child process only checks that the confirmation's COMMIT activation returned
`dismissed`, and the spec then asserts the effects — a receipt reference exists, the appointment row is
`confirmed`, the terminal line is the `CONFIRMED` one. A future change that reached the Action Engine by a
shorter route would keep all of those green. Since "no COMMIT without Gate 14" is one of the claims under
examination, losing its only executable witness inside the same delta that added a new route into the
booking flow is a coverage regression exactly where it matters. BOOK-3…BOOK-6 were not changed in this
respect, and the fix's own live spec does not restore the witness: it asserts the dismiss's effects, not the
COMMIT's gate count.

**L10 — MEDIUM. `gate4`'s shard has no green live baseline reference at all.** In the receipt at
`3b00f38b`, `widgets-mutation-report-4.json` carries exactly one baseline control,
`baseline|unit,typecheck,k3` (all exits 0), and **no `baseline|live`** — because both of that battery's live
mutants (`M4-2`, `M4-3`) run under neutraliser set `N4`, and the runner creates a plain live baseline only
for a live mutant with no neutraliser. The shard's only live control is `4:N4|live`, recorded under
`neutraliser_controls` with `exits {"live": 1}` and **41** failing tests — red correctly and by design, since reddening those checks is what `N4` exists to do. The two live
kills are therefore credited with nothing in that shard establishing that gate4's live suite is green
unmutated. Nothing about this is a gate evasion — the shard is `AS-DECLARED` with `baseline_red: []`, the
neutraliser exemption of §10.4 is the correct rule, and the same live suite is green unmutated in the Widgets
Live receipt — but the shard on its own does not carry that reference. Closing it means declaring one
neutraliser-free live mutant in `gate4`, or emitting a plain live baseline whenever any live step runs.

**L11 — MEDIUM. The delta's new selector branch in the chat-read trigger has neither a unit test nor a
mutant.** Routing `SERVICE_SELECTOR` / `STAFF_SELECTOR` / `TIME_SLOT_SELECTOR` to the booking-selector
emission path instead of the generic one is new in this delta:
`src/widgets/composition/chat-read.trigger.ts` is changed and `chat-read.trigger.spec.ts` is **not** — it is
the only file in that directory the delta touches. Its emitter double still exposes only the generic method;
the booking method appears in exactly one spec in the whole repository, which calls the emitter directly;
and no mutant in any of the 31 batteries edits that trigger file. The branch is proven only by consequence,
in one test, at one level: the live spec's catalog read happens to return a `SERVICE_SELECTOR` envelope
carrying options.

**L12 — MEDIUM. The delta's new runtime code carries no mutant at all.** Three wholly new runtime files
have none: `src/widgets/booking/booking-selector.presenter.ts` (276 lines),
`src/widgets/booking/booking-noun-identity.ts` (38) and
`src/widgets/owner-ports/booking-selector.adapter.ts` (106). Neither do the two new blocks the delta added
to pre-existing files: `src/widgets/owner-ports/booking-preview.adapter.ts` (+75) and
`src/widgets/routing/effect-router.ports.ts` (+26). Grepping all 31 declaration files for each of those five
paths returns nothing. The five declarations the delta adds are all in `gateP-mint.json` and target four
other files. The ratchet therefore does not reach the booking presenter or either new canonical-owner
adapter — which is what makes **L6** and **L20** uncaught rather than merely unasserted. The fix at
`3b00f38b` adds a sixth uncovered site, recorded separately as **L15**.

**L13 — MEDIUM. The booking path's two principal fences still have no mutant, and no booking spec asserts a
foreign-principal transition.** FBE2E-2 added a second server-owned successor path with its own initial
principal fence and its own lock-time fence, and no mutant in any of the 31 batteries deletes either of
them. The booking adapter specs assert a foreign *tenant* only. The generic path's two equivalents are
covered. Closing this needs one mutant per booking-path fence plus a foreign-principal booking-transition
killer test — carried forward unchanged from the Wave-6-era gap register, now widened by this delta.

**L14 — MEDIUM. NEW WITH THE FIX. A `CONFIRMED` terminal line may still be replaced by another `CONFIRMED`
line carrying a different `action_receipt_ref`.** The ownership predicate's monotonicity clause is attached
only to the non-`CONFIRMED` branch: `ownedBy(..., publishesConfirmed)` emits its `none` guard only when
`publishesConfirmed` is `false`, because `CONFIRMED` was reasoned about as the line that cannot take another
back. It cannot take one back, but it can *substitute* for one. So clause 3 of the owner's ruling — MUST NOT
overwrite the confirmed `TerminalLine` — holds today because of the **minter's shape** (a
`BOOKING_CONFIRMATION` mints exactly two intents, one AE COMMIT and one CONTROL escape, so there is no
second AE COMMIT on that widget to produce a second canonical receipt) and **not** because the predicate
forbids it. Nothing in the tree exercises the branch, and no test or mutant pins the reasoning. A future
change that minted a second COMMIT onto one confirmation widget, or re-ran a COMMIT to a new canonical
reference, would reopen exactly the shape §7 closed, and the predicate would admit it. Closing this is a
`none`-clause on both branches plus its own assertion, which is a runtime change the owner did not
authorise here.

**L15 — MEDIUM. NEW WITH THE FIX. The new ownership predicate carries no mutant, so no green mutation
receipt attests it.** `3b00f38b` touches no declaration file — the corpus is 373 declarations at both the
previous and the current target — and no mutant in any of the 31 batteries edits `ownedBy`, its `some`
clause, its `none` clause or either call site's new argument. The four `gate13` mutants that patch
`intent-audit.store.ts` target other statements and each is recorded at its declared status here — `M13-14`,
`M13-15` and `M13-18` build-killed, `M13-U13C-13` live-killed — which says the fix did not disturb their
anchors, not that the fix is covered. Its defence is therefore
exactly two things, each verified load-bearing rather than merely present: the three unit assertions (with
the store reverted and those assertions in place, exactly the three edited tests fail and no others) and the
new live spec (reverted, it fails rc 1 on exactly one assertion and no other). That is real evidence, and it
is weaker than a mutant, because neither check would notice a *different* weakening of the same predicate.
Closing this means declaring at least three mutants — drop `some`, drop the `effect`/`capabilitySpace`
narrowing, drop `none` — and is new work in a declaration file.

**L16 — MEDIUM. NEW WITH THE RECEIPT. The decisive mutation receipt now has about thirty minutes of
headroom, and its previous attempt was cancelled for want of it.** `P-mint-part-2-of-2` runs the `P-mint`
battery's live half; `timeout-minutes` for a shard job is **180**. That shard took **116 minutes** at
`66675087`, was **cancelled at 140 minutes** on the first attempt at `3b00f38b`, and took **148 minutes** on
the re-run that produced this receipt (§11.1). The new live spec is the cause: every live step of that
battery — its three `live-killed` mutants and its `baseline|live` control — now runs one more suite. So the
receipt this report rests on was obtained with roughly a 30-minute margin, on a shared runner, and the next
live spec added anywhere in `widgets-live` will spend that margin. Nothing was weakened to obtain the
receipt and nothing is being hidden; but "the mutation programme is reproducible at this SHA" is now a claim
with a known, measured expiry. Closing it means splitting `P-mint` into more parts, raising the timeout, or
restricting which live suites a mutant's live step runs — each a workflow or harness change.

**L17 — LOW. The reconcile receipt lookup is still not fenced to the COMMIT.** *(The previous edition's L15,
restated: the fix changed this entry's consequence but not its cause, and it is the fifth residual the fix's
own record discloses.)* `reconcileAcceptedReceipt` finds its receipt by
`{intentTokenHash, outcome: 'ACCEPTED', actionReceiptRef: null}` alone, so a caller that passed an escape's
token would write an action receipt reference onto that CONTROL receipt. What the fix changed: the second
`updateMany` in that method now carries the same `ownedBy` predicate, so such a write can no longer reach the
conversation — a CONTROL token matches no AE COMMIT record, so no terminal line is published. What it did
not change: the receipt row itself. Nothing in the tree calls reconcile with a control token; the widening
would be a caller-side change. Fencing the lookup changes receipt semantics rather than the line, which is
outside the approved scope, so it was reported rather than taken.

**L18 — LOW. The claim "the shell's own COMMIT ran all fourteen gates" is not literally asserted.** The
explicit `gates_run: 14` / `stopped_at_gate: '13'` assertions are on BOOK-4 and BOOK-6, which the jest
harness submits itself from an envelope minted in-process. The commit the **real shell process** performs is
checked only by its effects, because the shell harness returns only the confirmation widget id, the
assistant lines and its counters. The effects are strong; the literal gate count is not measured on that
path. See also **L9**.

**L19 — LOW. `RECEIPT → MAYA CONVERSATION` is proven up to the shell's conversation store, not onto the
chat network path.** The live harness stubs the chat transport to fail with `no_connection`, and the
asserted lines are read from the shell runtime's conversation view. What is additionally asserted is that
the shell authored no line of its own. The chat network hop is out of this package's scope and is not
exercised. The fix's clause-4 trace reads the same conversation view, so it inherits the same boundary.

**L20 — LOW. `UNKNOWN SEMANTICS` is not fully proven: one unknown branch is asserted nowhere.** Every staff
option's nearest availability is rendered as a `NOT_MEASURED` / `NOT_COLLECTED` measure, and
`nearest_availability` occurs in **zero** spec or test file across both projects (the only non-runtime
occurrences are the contract's own type files and a shell dev fixture); the staff assertions check the
service refs, the shown count, the staff ref and the label only, and per **L12** the presenter has no
mutant. The unknown-price branches are properly covered — a missing canonical price renders `NOT_MEASURED`
rather than inventing zero, and a priceless service refuses the whole selector. Separately, and unchanged by
the fix: the Action Engine's own `UNKNOWN` outcome has no fault-injection seam, so §7.5's `SUBMITTED` proof
supplies that verdict to the booted application's own writer instead of producing it from an uncertain call.
The gap is narrow but real, which is why the result line below reads `PARTIAL` and not `PASS`.

**L21 — LOW. The invariant "`CONFIRMED` if and only if a non-empty receipt reference" is enforced on the
client, not at the server's read boundary.** The server's terminal-line reader accepts any string as the
outcome: it does not restrict it to the seven contract outcomes and does not relate the outcome to the
receipt reference. The shell's projection does both, and refuses the line otherwise. So the only thing
standing between a malformed stored line and the wire is the writer's own code — and this delta is precisely
what started writing that column, which makes the read boundary load-bearing for the first time without it
being tightened in step. The fix narrows *who* may write the column; it does not tighten what the reader
will accept.

**L22 — LOW. One store test does not establish the property its name claims.** The test named for deriving
the terminal outcome from the durable receipt drives a recording Prisma double that answers the receipt
upsert from a fixed queue regardless of the payload, so the case that passes a client-shaped receipt
reference and observes `SUBMITTED` proves only that the code reads the double's reply — not that a
caller-supplied reference fails to persist. On a real first write the upsert's create block does carry the
passed reference. No client path can set that field today (only the effect router calls the writer, with the
Action Engine's value), so this is a test-fidelity defect rather than a live hole. The fix edits this same
test to pin the new call shape; it does not repair the double.

**L23 — LOW. A blanket structural ban in the shell's network test was replaced by two occurrence counts.**
The delta removed the assertion that no `/widgets/` literal appears anywhere in the four network modules and
replaced it with two per-literal occurrence counts in the client module alone. After the change, a
`/widgets/...` literal in the session, projection or endpoint module, or a third distinct one in the client
outside the allowlist block, passes this test. Residual risk is small — the allowlist is still pinned by
exact comparison against the build's own list, the single fetch call site is still asserted, and the build's
fetch-shape gate still refuses an added path with its own refuse fixture — but the assertion that made the
whole network surface widget-path-free no longer exists.

**L24 — LOW. Business decisions are hard-coded in the new owner instead of being owner- or tenant-derived.**
The availability read is issued for exactly "now plus twenty-four hours", so the user can only ever be
offered slots on that single day, with no window, no widening and no tenant timezone; the presenter then
declares the timezone `UTC` unconditionally, sets the "more" and "widen window" intents to null, and renders
each slot's label as the raw ISO instant, so the moment the user confirms is shown as a UTC ISO string. None
of this bypasses a fence, but it is business state decided in the widget layer, which is what the
`WIDGET BODY != BUSINESS STATE` ratchet exists to prevent — and it is why the live fixture's schedule had to
be chosen carefully (§10.2). **L5** is the sharper edge of the same design.

**L25 — LOW. On the new selector path the client's tap is taken as proof of delivery and render.** When the
predecessor is still in the minted state, the selector successor path drives it through two persisted
lifecycle transitions — minted → delivered, delivered → live — inside the conversation lock before
superseding it, on the strength of the tap alone; the code says so in its own comment. The fences are real:
each write is tenant- and widget-scoped with an exact prior state, must affect exactly one row or the whole
operation throws, and the supersession additionally requires the predecessor's intent record to match the
request's principal proof — so a client cannot choose an arbitrary stage or advance someone else's widget,
and the generic path still requires a live predecessor and a render receipt. But "the shell cannot choose a
lifecycle stage" now holds only in the weaker sense that it can advance the exact widget it legitimately
tapped along the two transitions the contract allows: delivered and live are no longer independent server
observations on this path. The declared mutant for this line is `MINT-M20`, which is `live-killed` at its
declared status in the receipt of §10 — though per **L1** that kill records no HTTP evidence.

**L26 — LOW. A third consumer of a mutation receipt still does not check its baseline controls.**
`docs/rebuild/evidence/maya-chat-first-ux/gate-audit-build.mjs` refuses `SURVIVED` and `UNEXPECTED` mutants
and checks the contract string, but never looks at a receipt's `status` or its baseline controls, so it would
promote evidence out of a red-baseline receipt exactly as the shard used to. It is run by **no** workflow —
it is a manual evidence builder — and adding the same two lines would also start refusing whichever
historical reports under `docs/rebuild/evidence/` carry a red baseline, which changes what an
already-recorded audit artifact can be rebuilt from. That is an owner decision about recorded evidence, not
a test repair, so it is reported rather than taken.

**L27 — LOW. NEW WITH THE FIX. With the fix, the shell appends the confirmation line a second time on the
dismiss.** `createLiveSubmission` re-reads the thread page on every settled submission and `intents.ts`
appends every line it is handed, so after the dismiss the shell's conversation reads
`['Запись подтверждена.', 'Запись подтверждена.']` — measured, in the clause-4 trace of §7.3. Two identical
true statements are a cosmetic repetition, not a contradictory state, and the owner's clause is about
contradiction; the stored `terminalLinesJson` and the thread page each hold exactly **one** line, so nothing
in the durable record is duplicated. The rough edge is in the shell's append rule and it predates the fix —
before it, the duplicate was the *wrong* line rather than a repeated right one, which is what made it look
like a contradiction instead of a repetition. Closing it is a shell change (append only lines the
conversation does not already carry, or reconcile by receipt reference), which is not what the owner
approved here.

**L28 — LOW. NEW WITH THE FIX. A dismiss on a confirmation that was never committed now leaves no terminal
line at all, where it used to leave the pending sentence.** This follows from the predicate's `some` clause
by inspection of the code, and was **not** executed: the escape's receipt names a CONTROL record, which
matches no AE COMMIT record, so `updateMany` matches nothing and no line is written. Before the fix, that
same escape wrote `{outcome: 'SUBMITTED', text: 'Запрос принят. Подтверждение ожидается.'}`. Nothing true is
lost — that sentence was false, since no request had been submitted for confirmation — and the widget's own
`resolved_widget: {control: 'dismissed'}` still tells the client what happened. But a tier that relied on
the terminal line as the only record of a dismissal would now show an empty terminal area, and this
direction has no test on either side of the change. Stated at the level it is proven: **inspection, not
execution.**

### Closed since the previous edition, and why

- **The one confirmed open defect is fixed.** The previous edition's **L1** — a post-commit escape tap
  replacing a `CONFIRMED` line with `SUBMITTED` and dropping the receipt reference — is closed by
  `3b00f38b` under the owner's ruling, with the proof recorded above and in §7. It left five residuals, four
  of them new (**L14**, **L15**, **L27**, **L28**) and one restated (**L17**).
- **The previous edition's closures still stand:** the FBE2E mutation ratchet has executed
  (`MINT-M16…M20` at their declared statuses, now twice, at `66675087` and at `3b00f38b`), and every CI
  receipt is real rather than pending.
- Five earlier errors stay corrected: the superseded battery receipt is not cited, the FBE2E real-shell
  harness is not listed under Wave 6 carry-forward, the claim that every selector transition re-checks the
  authority binding is qualified in §4 and **L7**, **L12** does not call five files "wholly new", and the
  target SHA is the one the receipts name — now `3b00f38b`.
- One figure is stated more precisely than in the previous edition: the shell manifest's "30" is its
  **30 hashed web files** (`web.files`), not its source list, which holds 32 entries.

## 13. Remaining configuration prerequisites

The code path is ready. A controlled real booking still requires:

1. approved AI provider configuration (`AI_CORE_PROVIDER`; DeepSeek preferred with the existing
   OpenAI fallback) and its credential in the existing secret mechanism;
2. `YCLIENTS_PARTNER_TOKEN` plus an existing connected tenant/integration credential;
3. the required tenant entitlements for widget runtime, customer booking/CRM integration and AI;
4. a supported authenticated principal with the canonical Client binding required by the booking
   contract;
5. an owner-approved real test service, staff member and slot;
6. explicit authorization for one controlled real booking in the controlled test/deployment
   environment.

No secret value is stored in this report or introduced by the FBE2E package or by the fix.

## 14. Required final result

Every key below is filled from the proof named in this document, at that proof's real level. `PASS` means
proven here. `PARTIAL` means proven in part, with the unproven part named. Nothing is inferred from a run
that has not reported, and nothing is inferred from a green tick.

```yaml
FBE2E-1: PASS                          # unit + build (transport doubled; contract closure by ts program probe) — L3: the shell's own net/client.ts issues no live widget request anywhere
FBE2E-2: PASS                          # unit (owners doubled) + the live walk of FBE2E-4, green in CI run 36338566210
FBE2E-3: PASS                          # all three terminal branches have now been executed live: CONFIRMED end to end through /widgets/resolve into the real shell's conversation — the only one pinned in CI, by PASS e2-booking.live-spec.ts and PASS h2-terminal-line-ownership.live-spec.ts in run 36338566210; NOT_CONFIRMED by a genuinely refused COMMIT at the owner, and SUBMITTED through the booted application's own writer with the UNKNOWN verdict supplied because no fault-injection seam for it exists — those two by executed local trace whose harness is NOT in the repository, so they are not re-run in CI (§7.5). The named FBE2E-3 gate itself is still a source-text ratchet that executes nothing. The confirmed defect that sat on this deliverable is FIXED at 3b00f38b and pinned live in CI — L20 keeps UNKNOWN SEMANTICS at PARTIAL
FBE2E-4: PASS                          # live-HTTP; PASS e2-booking.live-spec.ts inside 24 suites / 340 tests, CI run 36338566210, fresh PostgreSQL, 99 migrations applied
SHELL → /widgets/intent: PASS          # build + unit only — L3
SERVICE → STAFF: PASS                  # unit + live-HTTP (the live kind check is the harness's own guard)
STAFF → SLOT: PASS                     # unit + live-HTTP (same mechanism)
SLOT → CONFIRMATION: PASS              # unit + live-HTTP (same mechanism) — L7: this DRAFT transition drops the authority fences
CONFIRMATION → P-MINT-BOOK: PASS       # unit; its mutant MINT-M17 is build-killed at its declared status in run 36338566165
LIVE COMMIT THROUGH GATE 14: PASS      # live-HTTP; asserted literally for BOOK-4/BOOK-6 — L18: the shell's own COMMIT is proven by effect; L9: the delta deleted that path's only gate-count assertion
ACTION ENGINE RECEIPT: PASS            # live-HTTP + real PostgreSQL; ACCEPTED receipt, non-null ref, exactly three SUCCEEDED executions
RECEIPT → MAYA CONVERSATION: PASS      # live-HTTP on both sides: the server-authored CONFIRMED line carrying the canonical actionReceiptRef is read back over a real POST /api/widgets/resolve and appears in the real shell's conversation view, with zero locally authored sentences — and since 3b00f38b that line survives the confirmation's own escape, pinned in CI by PASS h2-terminal-line-ownership.live-spec.ts. L19: the chat network transport is out of scope and stubbed to fail. L27: after the dismiss the conversation view carries the confirmation line twice — two identical true statements on exactly this surface
CONFIRMED + DISMISS: PASS              # the owner's ruling, each of its four prohibitions proven by executed trace in both directions on real PostgreSQL over real HTTP with the real shell process pressing Confirm then Dismiss (§7.3). Only clause 1 is pinned in CI, by the committed live spec; the traces for clauses 2, 3 and 4 ran from an uncommitted harness (§7.5), so they are executed evidence that CI does not re-run; reverted, the live spec fails on exactly CONFIRMED → SUBMITTED with a null reference and on nothing else; DISMISS still dismisses and the booking stays confirmed (§7.4). L14: clause 3 holds today because of the minter's shape, not because of the predicate — a CONFIRMED line may still be replaced by another CONFIRMED line with a different reference. L15: no mutant attests the predicate. L27, L28: two disclosed presentation residuals
UNKNOWN SEMANTICS: PARTIAL             # NOT FIXED, and the remaining gap stated exactly: (1) the staff nearest_availability branch, the one property rendered as a correct NOT_MEASURED / NOT_COLLECTED measure, is asserted in zero spec or test file across both projects and the presenter carries no mutant (L20, L12); (2) three contract-visible cells are rendered KNOWN for properties the canonical read never returned (L6); (3) the Action Engine's own UNKNOWN outcome has no fault-injection seam, so the SUBMITTED branch of §7.5 supplies that verdict to the booted application's own writer rather than producing it. Proven: the unknown-price branches — a missing canonical price renders NOT_MEASURED rather than inventing zero, and a priceless service refuses the whole selector; and the live SUBMITTED → CONFIRMED reconciliation downstream of the supplied verdict
NEW MODELS: 0                          # identical schema digest at both SHAs; 130 models / 21 enums unchanged
NEW PHYSICAL FIELDS: 0                 # same digest; no out-of-band DDL in the delta's code; writes the pre-existing terminalLinesJson and reads the pre-existing intentRecords relation
NEW ACTION CLASSES: 0                  # 0 files changed under src/action-engine and src/orchestration; both registry digests identical
MIGRATIONS: 0                          # 99 at both SHAs; migrate deploy applies 99 in two CI jobs at this SHA
NEW CONTROLLER ROUTES: 0               # no controller file among the delta's 62 files; no route decorator added
SHELL WIDGET ROUTES ADDED: 2           # /widgets/intent and /widgets/resolve; build.mjs diff is +2 −0; a tenth path is refused, self-test 66/66 refuse + 23/23 admit
MUTATION CORPUS: 31 batteries / 47 shards / 373 declarations   # run 36338566165; 368 at the certified input, so +5, all in gateP-mint.json; the fix adds none — L15
UNEXPECTED SURVIVING MUTANTS:
  ALL 31 BATTERIES: 0 of 373           # 0 SURVIVED, 0 UNEXPECTED, 0 status-vs-declaration mismatches, 0 vacuous, 0 red baselines; 242 build-killed, 128 live-killed, 2 pending (gate6#M17b, gate6#M18b), 1 declared equivalent (gate10#M10-5); 25 AS-DECLARED + 22 PARTITION-AS-DECLARED shards, 31 assembled receipts all AS-DECLARED, 56 AS-DECLARED + 22 PARTITION-AS-DECLARED across all 78 artifacts
MUTATION RATCHET OVER THE FBE2E DELTA: PASS   # MINT-M16…M19 build-killed and MINT-M20 live-killed, each at its declared status and by its declared killer. L1: MINT-M20's kill records live_evidence false because its killer test is untagged
COMPLETE MUTATION PROGRAMME: PASS      # run 36338566165, 49/49 jobs; the fail-closed assembler admitted 31 complete battery receipts / 373 mutants at the exact head. Obtained on the run's second attempt: one shard was cancelled by the runner at 140 minutes of its 180-minute budget with no test failure and no red baseline recorded, the aggregation therefore refused, and re-running only the failed jobs at the same SHA completed it in 148 minutes with nothing changed (§11.1) — L16: about 30 minutes of headroom remain
FULL REGRESSION: PASS                  # 570 suites / 5319 tests, Node v22.23.2, Platform CI run 36338566173; plus 340 live tests in 24 suites, 337 shell tests on Node 22 and 24, 613 legacy Python tests, 15/15 binary HTTP cases, 1/1 e2e
REQUIRED CI RECEIPTS: 5 of 5 GREEN     # all per-SHA at 3b00f38b, all conclusion success, all event push on this branch; read from the run logs and artifacts, not from the tick
  Widget Contract: 36338566169 success # L2: non-blocking by construction; tsc exited 2 (334 diagnostics, 88 missing @prisma/client exports) and the checker reported 30/31 with 4 pending — both identical at the previous target and at the certified input. K1 dossier 15/15, 795/795 surfaces
  MAYA Chat Shell: 36338566224 success # Node v22.23.2 and v24.21.0; 337 tests, 329 pass, 0 fail, 8 skips each printing "this is NOT a PASS"; K5 EXIT PASS on both; K15 PASS on both; reproducible build, 30 per-file hashes equal, fresh manifest cmp-identical
  Widgets Live: 36338566210 success    # 99 migrations applied; 24 suites / 340 tests, 113.017 s; PASS e2-booking.live-spec.ts and PASS h2-terminal-line-ownership.live-spec.ts; binary HTTP 15 cases PASS, 0 failed, health 200
  Platform CI: 36338566173 success     # 570/5319 unit (857.786 s), 1/1 e2e, lint 0 errors / 9 pre-existing warnings, audit 0 vulnerabilities, prisma validate ok, 99 migrations, K3 10/10, routing counterfactuals 8/8, HTTP smoke passed, 613 Python tests OK
  Widgets Mutation: 36338566165 success # 49/49 jobs; planner self-tests 34/34; aggregator "Total of 47 artifact(s) downloaded" → "COMPLETE BATTERIES: 31; mutants: 373"; second attempt, see §11.1
BIN COVERAGE OF ANY FBE2E LINE: ABSENT # L4: the production-binary corpus is byte-unchanged and holds no booking or shell case
BOOKING-PATH PRINCIPAL-FENCE MUTANTS: 0   # L13: named follow-up; the generic path is covered, the booking path is not
MUTANTS FOR THE TERMINAL-LINE OWNERSHIP PREDICATE: 0   # L15: the fix's defence is three unit assertions plus one live spec, each verified load-bearing by counterfactual, not a mutation receipt
DISCLOSED LIMITATIONS: 28              # L1…L28 above; 1 HIGH, 15 MEDIUM, 12 LOW; none acted on, none buried. One HIGH limitation CLOSED by the fix and recorded with its proof. Five entries are new: L14, L15, L27 and L28 are residuals of the fix, L16 is a residual of the receipt that certifies it. One entry is restated rather than new: L17, the previous edition's L15, whose consequence the fix changed and whose cause it did not — it is the fifth residual the fix's own record discloses, counted once. The previous edition's L2…L24 are this edition's L1…L13 and L17…L26
RUNTIME FILES CHANGED AFTER 3d44f42e: 1   # intent-audit.store.ts, the owner-approved fix in 3b00f38b (+52 −1); 6ccb9f48 is test-only, 66675087 is test + harness + one workflow comment, 6ab4ffa6 and this report are docs-only
FIRST REAL CHAT-FIRST BOOKING E2E:
  CODE READY: YES
  REMAINING CONFIGURATION PREREQUISITES:
    - approved AI provider configuration (AI_CORE_PROVIDER; DeepSeek preferred with the existing OpenAI fallback) and its credential in the existing secret mechanism
    - YCLIENTS_PARTNER_TOKEN plus an existing connected tenant/integration credential
    - the required tenant entitlements for widget runtime, customer booking/CRM integration and AI
    - a supported authenticated principal with the canonical Client binding required by the booking contract
    - an owner-approved real test service, staff member and slot
    - explicit authorization for one controlled real booking in the controlled test/deployment environment
CHAPTER 10 STARTED: NO
PRODUCTION DEPLOYMENT: NO
REAL PRODUCTION BUSINESS EFFECTS: 0
```

---

**CHAPTER 10 STARTED: NO · PRODUCTION DEPLOYMENT: NO · REAL PRODUCTION BUSINESS EFFECTS: 0**
