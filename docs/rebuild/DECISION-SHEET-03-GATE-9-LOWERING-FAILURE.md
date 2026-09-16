# DECISION SHEET 03 — Gate 9 (Lowering): what happens when a tap cannot be lowered

**Status: OPEN — owner ruling required.** One question. Nothing below is implemented.

## Why this is on the owner's desk

§3.9 of the certified contract (MAYA-WIDGET-CONTRACT-V1.md, line 4345) defines Gate 9 as a
**write**, not a check:

> `rendered_utterance = render(utterance_template, server-resolved canonical labels)` is appended to
> the conversation as a **USER turn with authority NONE**. **This is the first durable write of the
> whole sequence.** From here the path is byte-identical to a typed message.
> Refusal column: **—**

The refusal column is empty, but a lowering can fail to render in two cases the contract itself
creates:

1. **The template is gone.** `utterance_template` is `CONVERSATION_CONTENT` (line 5132), so an
   erasure nulls it on a record whose token may still be unexpired.
2. **A label cannot be resolved.** A submitted option id has no canonical label in
   `selectionDomainLabelsJson`, because its source was removed or erased.

Gate 9 is also what feeds Gate 10. Gate 10 compares the router's reading of `rendered_utterance` with
the record's capability, and with no lowering there is no utterance. The owner's
**REFUSAL ON EFFECT-CLASS DIVERGENCE** is therefore wired but receives no input on the tap path.

## Where things stand — corrected

The wiring commit (6dc37bc8) replaced Gate 9's refusing stub with a function that returned `pass` and
wrote nothing, and counted it as wired. That was wrong, and it was not the only overstatement. The
clause-by-clause audit (`evidence/maya-chat-first-ux/gate-conformance-audit.json`) found:

```
GATES CONFORMING TO §3.9 ON THE LIVE PATH:  6/15   gates 1, 2, 3, 4, 5, 14
PARTIAL (reachable, clauses missing):       4      gates 6, 7, 8, 8-R
NOT BUILT:                                  1      gate 9 (now a refusing stub again)
NOT LIVE (no input or no dispatch):         4      gates 10, 11, 12, 13
```

The runtime is dark in production: no plan grants `widgets.runtime`, and no widget table exists
there. Gate 9 refuses everything that reaches it, and Gate 13 dispatches nothing. No submission can
produce a business effect, and nobody is refused who was previously served.

## The question

**When Gate 9 cannot render the utterance, what does the submission get?**

| option | verdict | consequence |
|---|---|---|
| **A** | `SUPERSEDED / handle_stale`, an **existing** code, before anything is written | The person is shown the current widget again. Nothing is appended and no new vocabulary is created. It reads an erased or unresolvable record as stale, which is what it is. |
| **B** | a **new** refusal code for Gate 9 | Changes the certified contract's closed refusal vocabulary, and needs a contract version decision. |
| **C** | lower with a server-side placeholder instead of the canonical label | Violates "server-resolved canonical labels", and puts text in the transcript the person did not see. **Not recommended.** |

**Recommendation: A.** It fails closed, reuses the contract's own vocabulary, writes nothing, and
matches how Gate 11 already treats a noun that no longer resolves.

## Not part of the question — settled by the contract, recorded so they are not re-asked

- The appended turn **stays** even if a later gate (10–13) refuses. It is the first durable write, and
  "byte-identical to a typed message" means a refused typed message also remains in the transcript.
- The turn's authority is NONE, and the turn is never a business fact (G21).
- Turn index allocation and concurrency are implementation, not policy.

## What follows an answer — and what an answer does NOT settle

An answer lets Gate 9 be built on the single admission path: render, append through
`WidgetStoresService.appendTurn`, and store `renderedUtterance` and `selectedLabels` on the record. It
comes with positive, negative, erasure and unresolvable-label tests and a mutation battery. That makes
Gate 10 live.

**It does not make 15/15.** The same audit records work that needs no ruling from the owner, only
implementation against rows the contract already fixes:

- Gate 6: the principal's role (`assertCanExecute` for the 47 catalogue keys) and AE clauses (a)–(e);
- Gates 7, 8 and 8-R: the open clauses listed per gate in the audit;
- Gate 10: a durable audit record in place of the in-memory array;
- Gate 11: a fresh read from the canonical owner on the path;
- Gate 12: the projector that supplies the data subject;
- Gate 13: dispatch instead of a route label.

The figure is claimed only when the audit prints it.
