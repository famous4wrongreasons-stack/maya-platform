# DECISION SHEET 07 — gates live scope under Contract V1.1: the honest count and five questions

**Status: OPEN — five items, OD-1 to OD-5. Waves 0–5 of the gates programme go ahead without them.**

Record: the gates plan for Contract V1.1 (§0.3–§0.5, Appendix A). Hosts, paths and database names are withheld here.

Why none of them is decided here: each needs meaning V1.1 does not carry, a privacy or security decision, or a ruling
on what your «15/15» counts, which is Sheet 06's test. OD-1 and OD-2 are hard: Wave 6 starts only after both. OD-3
decides how the second number is printed. OD-4 cannot change this cycle's count; OD-5 matters only to Gate 12's.

---

## Re-baseline · 6/15 becomes 0/15

The last audit reported 6/15 (Gates 1, 2, 3, 4, 5, 14). It was scored against V1's clause lists and counted a gate
module being present. Against V1.1, where only live-path evidence counts, none of the six is complete. Gate 1 neither
verifies the seal nor matches `widget_id`. Gate 2 is a constant pass, with no proof the session resolves exactly as for
a typed message. Gate 3 compares a local hash, not the principal proof hash. Gate 4 never calls the tenancy owner's
check. Gate 5 lacks the superseded outcome, the successor and the level derivation. Gate 14's module exists, but no
widget submission can reach it before an actuating intent may be minted. Nothing was removed; the old count was wrong.

## Ceilings

«Strict»: every clause is proven on the live path, or is a defence-in-depth refusal proven there. «U-class» also counts
a clause that can have no conformant input this cycle, by certified text or settled scope (OD-3).

| Stage | Strict | Counting U-class (only with OD-3 A) |
|---|---|---|
| After Wave 5, no answer needed | **3/15**: Gates 1, 2, 4 | **6/15**: adds 3, 5, 10 |
| After Wave 6, OD-1 and OD-2 answered | **up to 7/15**: adds 6, 7, 12, 14 | **up to 12/15**: adds 8-R, 11. **13/15** only if P-17 (delivery resolve) and landing-route verification land |

Conditions: Gate 3 (U) and Gate 7 need the moment-tick minter; Gate 6 needs landing-route verification and the run
minter; Gate 12 needs OD-5 or its reading. A late delivery leaves its clauses `false`, never U.

**Strict 15/15 is not reachable this cycle under any answer.** Gates 3, 5, 8, 8-R, 10, 11 and 13 hold U-class clauses
(S7-3) that no answer turns into live proof this cycle. Gate 8 also has bounds and normalizer clauses with no registered
source. Gate 9's clause 9.6 needs typed chat to persist user turns through the same writer, not built this cycle.
**With U-class counted, 15/15 is not reachable either:** Gates 8 and 9 stay short, and Gate 13 needs P-17.

## What Waves 0–5 deliver with no answer

- 46 units. The admission pipeline ends fully built, with no pending slot.
- Live evidence over HTTP and on the production binary, on non-actuating records minted by production triggers,
  chiefly a registered capability read with no model call. The model is never stubbed.
- The interim re-audit `3/15 · WITH U-CLASS 6/15`, the second number marked «U not accepted» until OD-3 is answered.
- No `DRAFT`, `REQUEST_APPROVAL` or `COMMIT` is minted before discharge (A2.2): actuating clauses stay blocked.
- Production stays dark: `widgets.runtime` reaches only fixture tenants on proof databases; deploys stay blocked (S5-1).

---

## S7-1 · OD-1 — S6-4 (A5), and the fail-closed NAVIGATE edge meanwhile

**What is known.**
- S6-4 is unanswered and changes no clause: rows 12 and 13 still send a `NAVIGATE` tap through the projector.
- For `detail` and `w` targets that edge cannot be built within V1.1: re-projecting them reads
  `provenance.source_capability`, which fails the erasure test (§0.4 F15). S6-4 A would make that read lawful.
- So the plan builds the edge fail-closed: a `NAVIGATE` tap answers `degraded`, a text turn with zero reads. This is a
  plan deviation, DEV-1, not the STOP, and it departs from certified rows 12 and 13.
- Three clauses stay `false` (Gate 12's NAVIGATE half and K16 check, Gate 13's NAVIGATE edge), so Gates 12 and 13
  cannot complete. P-01 cannot discharge over a partial mechanism (A2.6(3)), so actuation stays blocked.

**Why it is not decided here.** Making the read lawful is an erasure-class, privacy decision. Refusing the tap would
change a certified route. A deviation from certified rows needs your acceptance.

**Options.** You are asked (i) S6-4, A or B as on Sheet 06, and (ii) whether DEV-1 stands meanwhile.
- **A · S6-4 A, and accept DEV-1 until the version bump carries it (recommended).** Wave 6 adds the sealed
  source-capability member (a new migration by default), builds the NAVIGATE half of Gates 12 and 13, closes DEV-1.
- **B · S6-4 B (re-sign A5), and accept DEV-1.** A5's check goes, but re-projection still needs the read, so DEV-1
  stays unless the re-signed text also changes rows 12 and 13 for `detail` and `w`.
- **C · Reject DEV-1: build the certified edge now, without A5's check.** For `detail` and `w` it still needs the same
  read, so it waits for S6-4 A in any case.

**Recommendation: A.** It matches Sheet 06, and it alone closes DEV-1 without changing a certified route. With no
answer, DEV-1 stands, nothing actuates in chat, and the strict ceiling stays 3/15.

---

## S7-2 · OD-2 — when does «the named mechanism exists» discharge P-01 and P-30?

**What is known.**
- A2.7(a) discharges a gap row only when «the named mechanism exists». A2.6(2) and (3) forbid softening a rule or
  discharging a partial mechanism. Until P-01 discharges, nothing actuating may be minted (A2.2).
- Even after OD-1, each row holds a part with no conformant content this cycle, by settled scope, not missing code:
  - P-01: Step 0's voice door matches on `speech_aliases` or `ordinal`, which the record does not declare, while the
    settled ruling sends voice through the typed path. Step 0 for web push (K13) and Telegram is in the same position;
    Telegram carries no callback tokens, and its ingress is P-33.
  - P-30: Gate 8-R's closed affirmation vocabulary waits for a spoken carrier.

**Why it is not decided here.** It is a reading of the discharge rule. The wide reading discharges a partial mechanism,
which A2.6(3)'s words forbid; splitting the rows changes the contract.

**Options.**
- **A · Record a reading:** a mechanism that is built, build-tested and fail-closed, and misses only content or a
  carrier you settled out of cycle, counts as existing. The carve-outs are listed in the discharge commit.
- **B · Keep P-01 and P-30 pending.** No in-chat actuation this cycle.
- **C · Split both rows in a version bump (recommended).** P-01 becomes the pwa/native JWT widget route plus one Step 0
  row per carrier; P-30 the record fields plus the spoken-readback path. Whole rows discharge; the rest stay open.

**Recommendation: C.** Every discharged row is whole, so A2.6 stays intact, and the split rides OD-1's version bump.

---

## S7-3 · OD-3 — do U-class clauses count toward «15/15»?

**What is known.** Only certified text or settled scope makes a clause U-class, never an engineering choice or a late
package. Four duties hold: a build or mint test proves no production path produces the input; a live HTTP test on a
labelled injected record shows the gate's ruled outcome and no owner call (at gateway level, disclosed, for G3-c2 and
G3-f, which have no HTTP carrier); the mechanism is complete, mutants killed; the audit row quotes the basis.

| Gate | U-class candidates | Why no conformant input |
|---|---|---|
| 3 | G3-c2 client-link unlink/relink; G3-f forwarded Telegram message | Telegram carries no callback tokens (K14-10) |
| 5 | G5-f shortfall with deep link | A conformant fitter withholds any intent above the session level, and a level change fails Gate 3 first (K6, F53) |
| 8 | G8-5p safe text over phone values | No phone field is minted this cycle |
| 8-R | R-2…R-5; R-7's required half; R-1a's spoken half | No spoken carrier this cycle |
| 10 | 10.R5 | Class `c` is permitted on no kind |
| 11 | G11-I4, I5, I6, I10 | Approval decisions come later (SH-11) |
| 13 | G13-R7, I1, I2; I9's approver half | Same |

Not U-class: Gate 8's bounds, normalizer and deny clauses rest on an unapproved engineering choice and stay `false`;
Gate 13's delivery-resolve case waits on a package (P-17).

**Why it is not decided here.** Whether U-class meets your «15/15» is a question about your own acceptance measure.

**Options.**
- **A · Accept U-class, printed separately (recommended):** `LIVE CONTRACT-COMPLETE n/15 · WITH U-CLASS m/15`.
- **B · Bring them into scope:** a phone, bounds and normalizer owner with 152-FZ handling; a spoken carrier with
  vocabulary, locale and the transcript-logging fix; approvals with their row. Each needs a version bump outside step 3.
- **C · Keep those gates partial.** Only the strict number is reported, at most 7/15.

**Recommendation: A.** The strict number never includes U, both are always printed, and each U row quotes its basis.

---

## S7-4 · OD-4 — Gate 5's deep link and step-up

**What is known.** Row 5 and R3.4.5 require a deep link or step-up path, landing after verification; step-up is P-12,
which has no package. The only signed handle, `HandoffTarget`, is Gate 13's answer to an admitted `HANDOFF`: issued at
Gate 5 it would come before Gate 6's destination fences, so the plan does not reuse it, and Gate 5 refuses with the
code alone. No conformant shortfall exists this cycle (K6, F53), so even a built route could not be proven live.

**Why it is not decided here.** A new route is a contract change; where a handle may be issued is a security decision.

**Options.**
- **A · Name the route and response member in a version bump,** with P-12 packaged for step-up floors.
- **B · Accept G5-f as U-class this cycle (recommended),** under OD-3 A.

**Recommendation: B.** A still needs P-12 and a conformant shortfall, so it cannot make Gate 5 strict this cycle.

---

## S7-5 · OD-5 — AMB-48(vi): how narrowing by principal reaches the projector. Conditional

**What is known.** The contract does not say how narrowing that depends on the principal reaches
`data_scope.masked_fields`. So no projector row whose owner narrows by principal is registered (`staff.journal.own.read`
under R-02; role- or branch-scoped measurement reads). Gate 12 is evidenced on unnarrowed rows, and the audit says so.
It changes the count only if the re-audit reads G12-R5, «masked body, never a leak», as needing a narrowed projection.

**Why it is not decided here.** Naming the carrier is a contract change, and scoping the clause is a reading of it.

**Options.**
- **A · Name the composer-input carrier in a version bump.** Narrowed rows become registrable and evidenced.
- **B · Scope G12-R5 to owner-shaped output.** «Never a leak» is proven on what owners return; narrowed rows wait.

**Recommendation: B this cycle.** No unit registers a narrowed row yet; take A when a signed successor needs one.
