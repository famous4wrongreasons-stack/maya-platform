# DECISION SHEET 06 — what Contract V1.1 could not carry without you

**Status: OPEN — four STOPs and two step-5 questions. Contract V1.1 ships without them, and work outside these six
items continues.**

Record: `docs/rebuild/MAYA-WIDGET-CONTRACT-V1.1-DECISION-RECORD.md` (D.4) and Annex C of the contract (C.6). Each STOP
holds one item only. Nothing of these six is in the contract body.

Why none of them is decided here: your rule for the transfer was «STOP только на этом пункте» wherever an item needs
meaning the published text does not carry, or a new owner, business or security decision. Each item below meets that
test. Answering one inside the transfer would widen R-01 or a Block A reading beyond its words.

A former fifth STOP, R-04's staff revoke-only door against the route count, is closed. R-04 approved the door, so
V1.1 counts it beside the programme's three routes, states every limit of the ruling as a fence, and names the one
Action Engine branch the door needs (§3.5 R3.5.5 (a)–(j), row P-34).

---

## S6-1 · A7 (release-notes card and broadcast template catalogue), as a whole

**What is known.** A7 says «Build the S-352 release-notes card with a working seen-state write» and «Build the tenant
broadcast template catalogue … that only pre-fills `b35.preview`», and puts both READ keys on R-01's list. Transfer
runs into three gaps:
- There is no canonical owner for tenant release notes. The only producer is a text constant in the legacy bot, and
  R-01 forbids new business owners.
- «A working seen-state write» is a persisted per-person write. R-01 is reads only, and `control.widget.dismiss` only
  marks one delivered card.
- The template catalogue exists only in legacy Python. That makes it a read still to be built (S6-2).

**Why it is not decided here.** Every way through needs either a new owner and a write authority, or a re-signed
parity row. Both are yours.

**Options.**
- **A · Name a canonical owner for tenant release notes and authorise a persisted seen-state write.** Full parity with
  the legacy card, at the cost of new owner code and a write outside R-01.
- **B · Re-sign S-352 as an on-request card (recommended).** «Seen» becomes the per-emission dismiss only. No new owner
  and no write; the card no longer remembers across sessions.
- **C · Withdraw S-352 from chat parity.** `/whats_new` stays in the bot until K16.

The template catalogue follows S6-2 whichever option is chosen. Until you answer, `/whats_new` stays NOT RETIRED.

**Recommendation: B.** It keeps R-01 as ruled and still retires the legacy command.

---

## S6-2 · Reads still to be built inside an existing owner: CAP-47, SC-21, SC-22 (summary), SC-24, A7's catalogue key

**What is known.** R-01 admits «set read-only C9 keys для уже существующих canonical business owners». Each of the
fifteen transferred keys reads an owner method that returns its data today. These five do not:
- **CAP-47, the waitlist read.** `ClientWantedSlotService` has no read method, only a stub referral read, `add` and
  `matchAvailable`. Block B G2-42 already fixes where the read would go.
- **SC-21, SC-22 (summary), SC-24.** These would be new C7 measurement kinds, not C9 keys.
- **A7's template catalogue.** It has no canonical model at all.

**Why it is not decided here.** «Already existing owner» can mean that the owner exists, or that the read exists.
The transfer used the narrower reading. The wider one builds new reads in the owner's name, which R-01's words do not
settle.

**Options.**
- **A · Admit reads to be built inside an existing owner**, key by key, through a later contract version bump. New C7
  kinds are included.
- **B · Only reads that exist today.** All five rows stay open or are re-dispositioned.
- **C · Admit CAP-47 only (recommended).** Block B G2-42 already places its read in an existing owner. The C7 kinds and
  the catalogue stay out.

**Recommendation: C.** The owner, the method's home and its role fence are already approved text. The other four would
add measurement kinds or a model.

---

## S6-3 · `catalog.staff.read` output version 2 (CAP-06, CAP-46)

**What is known.** Version 2 would add staff rating and salon links to an existing AI-tool catalogue key. The handler
strips the rating today and does not read the links, and its output reaches the model. R-01 adds new read keys; it
does not speak to changing an existing key's output.

**Why it is not decided here.** It widens model-visible output of the conversational AI surface. R-01 defers that
surface to the future Conversational CRM Control / YCLIENTS Full API Capability Audit.

**Options.**
- **A · Yes.** An output version in a later version bump, with its own fence test.
- **B · No, leave it to the audit (recommended).** CAP-06 and CAP-46 stay open.

**Recommendation: B.** It is the reading R-01's own last sentence points to.

---

## S6-4 · A5 (detail re-projection), as a whole

**What is known.** A5 has Gate 13 evaluate a `detail` target's source capability for the live principal, while it
decides that tap. A tap on a `detail` target carries no capability on its own intent record: the contract admits one
only for class `c` (§0.12). So the only record Gate 13 could read is the emitting envelope's
`provenance.source_capability`, which is not `AUDIT_RETAINED`, and its value would decide that same tap. The contract's
erasure test (§0.4 F15) fails that read. A `detail` branch that only refused would switch off the certified detail
route (FR-13), which A5 does not say.

The approved A4 successor (R3.9.4) reads the same envelope field, and that read is lawful. It happens at a refusal,
where the refused tap reaches no later gate, and the value is sealed at mint into the remedy's own intent record,
which is `AUDIT_RETAINED` and is all the remedy's tap reads. A5 has no such member to seal into.

**Why it is not decided here.** Making the read legal means adding an `AUDIT_RETAINED` record of the source
capability, sealed at mint the way R3.9.4 seals its remedy's, or reclassifying the envelope field. Either is an
erasure-class decision, and that is a privacy decision. Refusing instead would change a certified route.

**Options.**
- **A · Approve an `AUDIT_RETAINED` source-capability member (recommended)**, sealed at mint on the intent record of
  a `NAVIGATE` whose target class is `detail`, or that erasure class for `provenance.source_capability`. A5 then
  transfers whole in a later version bump.
- **B · Re-sign A5** in a form that does not read the source capability at Gate 13.

**Recommendation: A.** One capability key per detail tap is audit data, not conversation content, and it keeps A5's
safety check as approved.

---

## S6-5 · Q-1 — do `REFINE` and `DRAFT` on client-data read keys get A1's treatment?

**What is known.** A1 says the predicate split «comes back if R-01 registers a client-data refine». R-01 now registers
nine `personal_data` keys. R3.5.1 still forces a class-`s` `HANDOFF` for a `REFINE` on any of them. This does not block
V1.1. It blocks every step-5 successor that refines a client-data read in chat.

**Why it is not decided here.** It moves personal-data reads from the secure surface into chat refinement.

**Options.**
- **A · Yes, for named keys,** carried by a later version bump.
- **B · No (recommended).** They stay handoff-only. Refinement happens on the secure surface.

**Recommendation: B**, until a signed K1 row needs a specific client-data refine in chat. Then name that key under A.

---

## S6-6 · Q-2 — which R-01 keys join which owner classes?

**What is known.** No F36a key belongs to a §2.4 owner class, so the kind registry lets them feed only `CHOICE`, `FORM`
and `LIMITATION`. `SCHEDULE`, `CLIENT_LIST`, `METRIC`, `REPORT` and `ARTIFACT` successors on these keys need owner-class
rows that R-01 does not state. This does not block V1.1. It blocks those step-5 successors.

**Why it is not decided here.** An owner-class row decides which widget may present which business data. That is
product scope, and R-01 did not rule on it.

**Options.**
- **A · Name the rows per G2 successor at step 5 (recommended),** carried together by one later version bump.
- **B · None.** Those successors stay unbuilt.

**Recommendation: A.** The rows then follow signed K1 successors instead of being guessed ahead of them.
