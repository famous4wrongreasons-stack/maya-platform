# Out-of-K1 findings — carried, classified, not lost

*Two conditions found while grounding the K1 dossier that are **not** K1 decisions. The owner's
instruction on signing K1: record them, classify each against the frozen K1–K16 plan as either
existing-package remediation or a narrow blocker dependency, **do not grow the number of packages**,
and — for the first — STOP before any implementation that touches it if it is a proven security
regression of an existing canonical contract.*

---

## F-CRM-JOURNAL-READ — an undecided authority question, not a proven regression

**Status: MECHANICALLY SETTLED, INTENT UNDECIDED.** Four independent readings: three said "gap",
one refuted it on intent — and the refutation was right to push back. What follows separates what
the code certainly does from what nobody has decided it *should* do.

### What is certain, and is not in dispute

`GET /crm/journal` (`crm-integration.controller.ts:178`) passes the actor only to derive the tenant:
`crmService.getJournal(this.tenantId(actor), query)`. `getJournal` (`crm.service.ts:3160`) contains
**zero occurrences of `actor`**, applies no per-actor binding, and forwards `query.providerId`
unchanged (`crm.service.ts:3212`).

`providerId` is **`@IsOptional()`**, documented as *"Optionally **limit** the journal to one CRM
staff member"* (`dto/list-crm-journal.dto.ts`). It is a display filter, not a scope. **Omitting it
returns the whole tenant's journal** — so nobody needs a colleague's id to read a colleague's grid.

The route admits nine roles; six have declared full access:

```
CRM_JOURNAL_ROLES (controller:52)     …OWNER …ADMIN MANAGER BRANCH_MANAGER PROVIDER EMPLOYEE STAFF
JOURNAL_FULL_ACCESS_ROLES (svc:3274)  …OWNER …ADMIN MANAGER BRANCH_MANAGER
DELTA                                 PROVIDER  EMPLOYEE  STAFF
```

Each row (`crm-adapter.interface.ts:207`) carries `client: { id, name }`, `notes`, `services`,
times, `status`, `total_price`. **No phone numbers** — `CLIENT_PHONE_ROLES` (`crm.service.ts:3288`)
is applied at `crm.service.ts:3554`, on the **detail** path, which does take an actor. **Nothing
cross-tenant** — `assertTenantId` holds on every call.

### Why this is a question and not a verdict

The codebase argues with itself, and each side has a real claim:

| reads as a gap | reads as intended |
|---|---|
| `crm.service.ts:3269` — «Кому журнал открыт целиком: владелец, управляющий, администратор. **Остальные — только собственные визиты**.» | `crm-integration.controller.ts:46` — «Журнал и операции над визитом — **работа всей смены**… Мастер обязан видеть свою сетку, иначе кабинет сотрудника отличается от PWA, **где это умеет каждый**.» |
| Writes are fenced per-actor (`assertJournalStaffWritable`) and single-record reads too (`assertJournalRecordAccess`, seven call sites) | The DTO calls `providerId` an optional **limit** — the shape of a filter over a tenant-wide list, not of a scope |

The first comment's own parenthetical points at `assertJournalRecordAccess` — a **record** fence.
So it can be read as *"the rest may only act on their own visits"*, which is exactly what is
implemented, rather than *"the rest may only list their own visits"*, which is not.

**So there is no proven security regression of a canonical contract, and the owner's hard STOP does
not fire.** What there is: a salon-wide schedule readable by every member of the shift, which is
either normal for a barbershop or a leak of client names and visit notes across masters — and that
is a **business decision nobody has recorded**. My earlier report called it a proven gap. That was
an overstatement, and the adversarial pass is what corrected it.

### Classification

**Existing package remediation — no new package. Two packages already own the two halves:**

| half | package | wave |
|---|---|---|
| the **fence** — server-side authority over a staff-facing capability | **K4**, which the plan already charges with «the 121 `SECURITY/AUTHORITY ONLY` rows — as fences, not as screens» | 2 |
| the **surface** — the staff journal as something a person reads | **K10**, owner and staff intelligence | 4 |

**No stop on Wave 2 as scoped — with one thing to watch in K3.** K4, K5 and K6 do not touch this
route. **K3 does emit `SCHEDULE` read-only behind the entitlement**, and a `SCHEDULE` has to be
sourced from somewhere. K3 emits *to nobody*, so nothing leaks either way — but the wiring decision
arrives in K3, not in K10, and it must not be made by default. **Condition on K3:** a `SCHEDULE`
source for a `PROVIDER` / `EMPLOYEE` / `STAFF` principal may not be wired to the tenant-wide journal
listing until the question below is answered. Wiring it to the actor's own grid is always safe and
needs no answer.

**One obligation carried forward:** the package that surfaces the staff journal must **put the
question to the owner** — may a master see the whole salon's grid, with client names and visit
notes? — and make the answer explicit in one place, because today two comments in the same module
give opposite answers. If the answer is "only their own", the repair mirrors the write path: give
`getJournal` the actor, call `journalStaffBinding`, and force `providerId` to the bound id rather
than refusing, so a master asking for the grid gets *their* grid.

---

## F-UNSUBSCRIBE — the consent text names a command the consent gate blocks

**Status: PROVEN, by reading both lines.**

`ai администратор/bot.py:445` renders, inside the marketing opt-in text:

> «_Согласие можно отозвать в любой момент командой /unsubscribe._»

`ai администратор/bot.py:353`:

```python
_GATE_ALLOWED_COMMANDS = {"/start", "/privacy", "/cancel"}
```

and the gate tests `first_word in _GATE_ALLOWED_COMMANDS` at `bot.py:389`. `/unsubscribe` is not in
the set. The handler exists (`cmd_unsubscribe`, `bot.py:576`, registered at `bot.py:4981`), so this
is not a missing feature — it is a promise the gate refuses to let the client reach.

**Two defects may be present and they are different.** Whether `cmd_unsubscribe` *revokes* or only
*redirects* to the app decides whether the repair is "let the command through" or "make the command
do what the text says". Both must be established before either is chosen.

This is a 152-ФЗ / ст. 18 ФЗ «О рекламе» surface: the wording and the mechanism are both
load-bearing, and a promise the system cannot honour is the defect whichever way it is repaired.

### Classification

**Existing package remediation — no new package. K12 owns it**, and the plan already names the
exact writer: `Package5Wave3CanonicalCutoverService.recordClientConsent(tenantId, userId, clientId,
kind: 'privacy'|'marketing', granted, occurredAt, idempotencyKey)`. K12 delivers «the four
`NEVER_CHAT_ACTUATED` consent acts as class-`s` handoffs» — which is precisely the shape this
finding needs: a revocation the client reaches through a handoff, not through a chat actuation.
**K14** (Telegram cutover) is where the bot side actually changes, and it already depends on K12.
So the sequence exists in the plan: **K12 defines the act, K14 makes Telegram hand off to it.**

**It constrains the repair.** Per the signed G11 condition, Telegram stays DELIVERY / HANDOFF and
does not become a second widget runtime. A fix that made the bot carry its own consent-revocation
runtime would violate the condition the owner just signed. The admissible repairs are: allow the
command through the gate so it can hand off; or correct the wording to name a route that works.

**Blocks nothing in Wave 2.** It is a live compliance defect in production code, and it is tracked
here so that it is repaired on its own schedule rather than inherited silently by a cutover.

---

## What this file is for

Neither finding is a K1 decision, and neither may be closed by a K1 signature. They are recorded
here because the alternative is that they survive only in a conversation. `PACKAGES: 16` is
unchanged, and this file adds none.
