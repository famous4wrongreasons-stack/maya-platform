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

---

## F-ENUM-CARDINALITY — RESOLVED by owner ruling, wave 2

The three disagreements are closed: **the certified contract wins**, and §5.5's rows were
transcription defects, not decisions. `LifecycleState` 8 → **10**, `ChannelId` 5 → **11**,
`RenderTier` 3 → **7**.

**A fourth turned up during reconciliation, of exactly the same class.** §5.5 gave
`MechanismGapStatus` as **4** and cited «§0.1 F5's status vocabulary». F5 names **five**:
`[EXISTS]`, `[ABSENT]`, `[PARTIAL]`, `[UNENFORCEABLE-TODAY]`, `NORMATIVE-PENDING`. It is corrected
the same way and for the same reason — the row cites the contract rather than claiming authority of
its own. The K1 mechanism-gap registry happens to use only three of the five, but an observed sample
is not a domain, and a `CHECK` narrower than the vocabulary is the failure the ruling exists to
prevent.

**Three of the four count-only enums are now derived, none guessed:**

| enum | members | evidence |
|---|---|---|
| `ConfirmationOfKind` | `draft` `record` `approval` | **normative union** — §0.13 F74 declares it in TypeScript, and the compiled contract carries it at `intent.ts:261` |
| `FreshnessClass` | `live` `scenario` `proactive_once` `static` | **normative union** — a member of `Lifecycle` (§4.1), compiled at `lifecycle.ts:48`; E-28 confirms the ownership |
| `MechanismGapStatus` | F5's five, above | **normative vocabulary** — extracted from F5's own sentence, not retyped |

`GapOwnerState`, `IntentReceiptOutcome` and `TombstoneStore` were never count-only: §5.5 states their
members in full, and the K1 capability-gap registry independently uses only `GapOwnerState`'s three.

---

## F-TURNROLE — the one enum with no canonical definition anywhere

**STOP, scoped to this enum only.** Every other constraint is generated; this one cannot be, and
padding it to three would be exactly the inference the ruling forbids.

```
ENUM                     TurnRole
EXPECTED COUNT           3   (asserted by mapping §5.5, with no source)
AVAILABLE MEMBERS        none that any canonical definition states
MISSING SEMANTIC DEFINITION   what a timeline turn's role may be
```

**Where it is not.** The certified contract contains **no `TurnRole`**, no `TimelineTurn` shape and
no turn-role union — `grep` returns 0 across the whole document. The compiled contract module
declares nothing turn-role-shaped. §5.5's source column reads «timeline only», which points at
nothing. The nearest thing in the repository is `AiCoreMessageRole = 'assistant' | 'user'`
(`src/ai-tools/ai-core.types.ts:5`) — **two** members, in an LLM transport type that is not a
contract definition and does not match the asserted count.

**What the contract does say about turns**, and why it is not enough: Gate 9 requires the lowered
utterance to be appended «as a **USER turn with authority NONE**», E10 repeats it, and
`spoken_transcript` is documented «voice turns only; authority NONE». So a `user` role certainly
exists and a distinction between typed and spoken turns is implied. **That is inference from usage,
not a declared domain** — it yields neither a third member nor an assurance that three is the right
number.

**Consequence, and it is narrow.** `WidgetTimelineTurn.role` has no `CHECK`, so **33 of 34** are
generated and the resume gate's `CHECKS: 34/34` does not hold. The migration stays out of the deploy
path. Nothing else in K3 is blocked by this: the tables, columns, keys, indexes and the other 33
constraints are all generated and verified.

**What a ruling needs to settle:** the exact members of a timeline turn's role. The natural
candidates are a two-member `user` / `assistant` domain matching the existing transport type, or a
three-member domain adding a system/tool turn — but which one is a semantic decision about what the
timeline records, and the contract has never made it.

---

## What this file is for

Neither finding is a K1 decision, and neither may be closed by a K1 signature. They are recorded
here because the alternative is that they survive only in a conversation. `PACKAGES: 16` is
unchanged, and this file adds none.

---

## F-ENUM-CARDINALITY — RESOLVED by owner ruling, wave 2

The three disagreements are closed: **the certified contract wins**, and §5.5's rows were
transcription defects, not decisions. `LifecycleState` 8 → **10**, `ChannelId` 5 → **11**,
`RenderTier` 3 → **7**.

**A fourth turned up during reconciliation, of exactly the same class.** §5.5 gave
`MechanismGapStatus` as **4** and cited «§0.1 F5's status vocabulary». F5 names **five**:
`[EXISTS]`, `[ABSENT]`, `[PARTIAL]`, `[UNENFORCEABLE-TODAY]`, `NORMATIVE-PENDING`. It is corrected
the same way and for the same reason — the row cites the contract rather than claiming authority of
its own. The K1 mechanism-gap registry happens to use only three of the five, but an observed sample
is not a domain, and a `CHECK` narrower than the vocabulary is the failure the ruling exists to
prevent.

**Three of the four count-only enums are now derived, none guessed:**

| enum | members | evidence |
|---|---|---|
| `ConfirmationOfKind` | `draft` `record` `approval` | **normative union** — §0.13 F74 declares it in TypeScript, and the compiled contract carries it at `intent.ts:261` |
| `FreshnessClass` | `live` `scenario` `proactive_once` `static` | **normative union** — a member of `Lifecycle` (§4.1), compiled at `lifecycle.ts:48`; E-28 confirms the ownership |
| `MechanismGapStatus` | F5's five, above | **normative vocabulary** — extracted from F5's own sentence, not retyped |

`GapOwnerState`, `IntentReceiptOutcome` and `TombstoneStore` were never count-only: §5.5 states their
members in full, and the K1 capability-gap registry independently uses only `GapOwnerState`'s three.

---

## F-TURNROLE — the one enum with no canonical definition anywhere

**STOP, scoped to this enum only.** Every other constraint is generated; this one cannot be, and
padding it to three would be exactly the inference the ruling forbids.

```
ENUM                     TurnRole
EXPECTED COUNT           3   (asserted by mapping §5.5, with no source)
AVAILABLE MEMBERS        none that any canonical definition states
MISSING SEMANTIC DEFINITION   what a timeline turn's role may be
```

**Where it is not.** The certified contract contains **no `TurnRole`**, no `TimelineTurn` shape and
no turn-role union — `grep` returns 0 across the whole document. The compiled contract module
declares nothing turn-role-shaped. §5.5's source column reads «timeline only», which points at
nothing. The nearest thing in the repository is `AiCoreMessageRole = 'assistant' | 'user'`
(`src/ai-tools/ai-core.types.ts:5`) — **two** members, in an LLM transport type that is not a
contract definition and does not match the asserted count.

**What the contract does say about turns**, and why it is not enough: Gate 9 requires the lowered
utterance to be appended «as a **USER turn with authority NONE**», E10 repeats it, and
`spoken_transcript` is documented «voice turns only; authority NONE». So a `user` role certainly
exists and a distinction between typed and spoken turns is implied. **That is inference from usage,
not a declared domain** — it yields neither a third member nor an assurance that three is the right
number.

**Consequence, and it is narrow.** `WidgetTimelineTurn.role` has no `CHECK`, so **33 of 34** are
generated and the resume gate's `CHECKS: 34/34` does not hold. The migration stays out of the deploy
path. Nothing else in K3 is blocked by this: the tables, columns, keys, indexes and the other 33
constraints are all generated and verified.

**What a ruling needs to settle:** the exact members of a timeline turn's role. The natural
candidates are a two-member `user` / `assistant` domain matching the existing transport type, or a
three-member domain adding a system/tool turn — but which one is a semantic decision about what the
timeline records, and the contract has never made it.

---

## F-ENUM-CARDINALITY — the adopted mapping and the certified contract disagree on three closed enums

**Status: PROVEN, reproducible, and it blocks K3's migration.** Found while writing the CHECK
constraints for `MIGRATION 2`. `enum-cardinality-check.mjs` reproduces it.

§5.5 of the mapping lists seventeen enum sets that the D12 `CHECK` constraints are written over,
each with a member count and a source. Ten of them name a type the certified contract declares.
**Seven agree. Three do not** — and each of the three cites the contract section it contradicts:

| set | mapping says | the contract declares | mapping cites |
|---|---:|---:|---|
| `LifecycleState` | 8 | **10** — adds `BODY_DROPPED`, `REDACTED` | §4.1 |
| `ChannelId` | 5 | **11** — `pwa native-shell telegram-miniapp telegram-bot web-push realtime-voice guest-chat web-public public-community sms email` | §4.5 |
| `RenderTier` | 3 | **7** — `RICH_INTERACTIVE RICH_CONSTRAINED ANNOUNCEMENT SPOKEN TEXT_ONLY PUBLIC_READ ANONYMOUS_CHAT` | §4.5 |

### Why it cannot be resolved by choosing quietly

A `CHECK` narrower than the contract does not fail at review — it fails at `INSERT`, in production,
on the first envelope that uses a member the database was not told about. A `CHECK` written to the
contract instead makes the mapping's own §5.5 table wrong. Either way a document the owner signed
stops describing the system, and **the difference decides what the database will accept.**

Nothing caught it. `mapping-vs-contract-check.mjs` passes 14/14 and never compares a member count;
`widget-schema-count.mjs` counts `CHECK` annotations without resolving what any of them admits. So
three enums could differ by up to six members with every gate green. That gap is now closed by
`enum-cardinality-check.mjs`, which fails while the disagreement stands.

### And seven of the seventeen have no members anywhere

`TurnRole` (3), `FreshnessClass` (4), `ConfirmationOfKind` (3), `IntentReceiptOutcome` (4),
`TombstoneStore` (2), `GapOwnerState` (3), `MechanismGapStatus` (4) are not contract types. Three
spell their members out in the §5.5 table and can be written as constraints today. **Four give only
a count** — `TurnRole`, `FreshnessClass`, `ConfirmationOfKind`, `MechanismGapStatus` — and a count
cannot become a `CHECK`. `FreshnessClass` and `ConfirmationOfKind` point at contract sections (§4.1,
§0.13 F74) that use the concept without declaring a named union, so their members are recoverable by
reading; `TurnRole` cites only "timeline only".

### What is recommended, and why it is still the owner's

**The contract should win on all three.** It is the certified artifact, the mapping cites it as the
source rather than claiming its own authority, and a database narrower than the contract is the
failure mode that cannot be caught before production. On that reading §5.5's three rows are
transcription errors in a summary table, not decisions — which is the least disruptive explanation
and the one most consistent with how the table is written.

But it is **not** mine to apply: it changes what the production database accepts, and the owner's
stop rule names a proven schema contradiction explicitly. So K3's migration stops here, with the
generated SQL retained and **removed from `prisma/migrations/` so no deploy can pick it up
incomplete**.

### What is ready and waiting

Both migrations are generated, validated and staged under
`evidence/maya-chat-first-ux/k3-migrations-staged/`:

```
MIGRATION 1  widget_layer_ledgers   3 CREATE TABLE   0 FK   0 DROP
MIGRATION 2  widget_layer_runtime  10 CREATE TABLE  16 FK   0 DROP   16 ALTER, all on Widget* tables
```

They match the envelope exactly (3 + 10 models, 16 FK, 10 → `Tenant`, 6 widget → widget), no
business table is touched, and both schema stages pass `prisma validate`. **Six back-relations had
to be added** that the D12 block omits — it declares only the owning side of each widget → widget
relation, so as printed it does not load in Prisma at all. That is a defect of the printed block,
not of the design, and it is fixed in the staged schema.

The 34 `CHECK` constraints are the only thing outstanding: 27 are writable now (23 from the
contract's own unions, 4 from members the §5.5 table spells out), and **7 are blocked** — 3 by the
cardinality disagreement and 4 by having no members declared anywhere.

---

## F-MOMENT-ENUMERATION — the contract fixes a cardinality it never enumerates

**Filed:** wave 5, during K13. **Classification:** documentation gap in the certified corpus.
**Does not grow the plan.** **No owner decision is blocked by it.**

§4.9.3 states, normatively, that `MOMENT_REGISTRY` carries **exactly twelve** rows, and that "a
moment absent from `MOMENT_REGISTRY` cannot be emitted". **It never names the twelve.** Nor does any
other document in the certified corpus: §triage-135 names three of them in passing
(`appointment_reminder`, `wanted_slot_available`, `native_feedback_invitation`), the UX architecture
records that a verification pass "confirmed 12 proactive moments" against the repository, and the
passage that named them did not survive into the corpus.

This is the exact shape the wave-2 enum ruling addresses: a count without members. Twelve plausible
names typed into the registry would have been indistinguishable from twelve derived ones, and the
ruling forbids filling to a count.

**What K13 did instead.** Derived the set from three sources, each admissible under the ruling's own
terms, and checked the cardinality afterwards rather than aiming at it:

1. `Package2InboxType` — a normative union whose exact domain is fixed by the total
   `Record<Package2InboxType, string>` that keys `PACKAGE2_CAPABILITY_BY_TYPE` (21 members)
2. the certified surface inventory's 52 notification surfaces — a moment is scheduler-emitted
3. `ProactiveProvenance.artefact_kind` — a six-member closed union; a type with no canonical
   artefact row cannot carry a provenance

The intersection is **twelve**, and it contains all three moments the triage document names. The
derivation is `evidence/maya-chat-first-ux/derive-canonical-moments.mjs`, re-run by the wave-5 gate
and by the suite, so neither source can move without the registry failing.

**What remains for the owner, and it is not urgent.** §4.9.4 PR4 is explicit that the registry's
*content* — which moments exist, what each may say, and to whom — "rests on review discipline at
the point a moment is added to the registry, and this contract does not fake a mechanism for it."
The derived twelve are therefore a **defensible reconstruction, not an owner decision**. Two rows
are the ones a reviewer would look at first:

- **`team_message` is excluded** on a type-level ground, not an editorial one: a message a human
  wrote has no canonical artefact row among the six kinds, so it cannot carry a `ProactiveProvenance`.
  The `TeamCommunicationsScheduler` does fan it out on a schedule, so a reviewer could disagree.
- **`birthday_alert` is mapped to `artefact_kind: 'opportunity'`**, which fits (a winback occasion)
  but is the loosest of the twelve assignments.

Moving either changes the count, which the start-up assertion then rejects — so a change here is a
contract amendment, not a config edit. **Recorded, not decided.** Nothing in wave 6 depends on it.

---

## F-WAVE6-CUTOVER — three packages at their cutover condition, nothing deleted

**Filed:** wave 6. **Classification:** the plan's own condition, reached and reported.
**No owner decision is required to proceed; one is required to go further.**

Wave 6 is the only wave permitted to delete. It deleted nothing. §7.1's third condition — *the
legacy surface has been observed unused for the agreed window* — is a statement about what real
users did not do, over wall-clock time, against a surface that was live and logging. No artefact a
repository can hold is that observation, and `PRODUCTION EFFECTS FOR PROOF` is 0.

Six adversarial verifiers were instructed to refute that conclusion. They narrowed a great deal
around it and the kernel stood.

**The window is fully specified and simply has not been entered.** D10's ledger state machine:
`MAPPED → PARITY_PROVEN → ENTRY_POINT_DARK (14 days) → ROUTE_SEALED (30 days; 45 for period-close)
→ DELETED`, one-step rollback at each transition. Entering `ENTRY_POINT_DARK` is a production
config change; leaving it is a production observation.

### What each package needs, exactly

| package | the one thing it is waiting on |
|---|---|
| **K14** | `bot.py` executable — the ~45 command bodies live there, and it is read-only and undeployable by constraint |
| **K15** | an edit to `app.html`, the shipped 2.7 MB source-less PWA, to drive 192 client-side authority values to 0; and a recorded unreachability probe for `maya-os-site/index.html` |
| **K16** | 437 rows entering and leaving `ENTRY_POINT_DARK`; 0 retirable today; 0 deleted |

### What would unblock it, and what would not

**Would:** authorising a production cutover window — entering `ENTRY_POINT_DARK` for a first batch
of rows, with the ledger recording each transition and its rollback. The evidence files the
evaluator reads are named and empty:
`dark-window-observations.json`, `rollback-register.json`, `deep-link-map.json`,
`successor-map.json`, `parity-fixtures.json`, `a11y-conformance.json`, `authority-proofs.json`,
`maya-os-site-unreachable-probe.json`. The day any is written with real records, the evaluator
changes its answer without being edited — verified by feeding it synthetic records and watching a
row turn retirable, then removing them and watching it revert.

**Would not:** relabelling the simulated K13 delivery window as a production observation; treating
a document that *describes* the dark window as a record of one; or granting condition (1) — an
adversarial pass proved that granting parity to all 80 original K16 candidates leaves deletable at
**0**, a delta of exactly zero. The binding conjuncts are (2) and (3).

**Recorded, not decided.** Wave 6 stops here, as instructed, without substituting evidence.
