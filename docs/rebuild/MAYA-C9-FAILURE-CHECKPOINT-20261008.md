# C9 interruption and late-source checkpoint — 2026-10-08

The standalone Lifecycle reply now rechecks current owner authority and its exact
exposed C8 sources after awaited projection reads. It reuses the existing compound
C9 final check; no second orchestrator, source owner or background admission was
introduced. Runtime and final HTTP fixture: `5d37ad01e9de9220a5440af2a3f687f8f63968e0`.
Initial failing HTTP fixture: `d42dacea`.

The real local HTTP/PostgreSQL failure was reproduced: canonical policy changed
from revision 1 to 2 while delivery of an already read current C8 snapshot was
paused. The standalone response still returned `201 / PARTIAL / current=true`
with one finding. The fix returns exact `400 c9_source_changed`, without that
finding in structured output or prose. The compound path already returned a
bounded `UNCONFIRMED` reply without findings and remains unchanged in behavior.
Saved SETTLED receipts and the original proposal/evidence stay immutable.

## Executed evidence

- **199 tests / nine suites**, production types, focused proof/spec types and
  scoped lint pass. Ten isolated component-clock cases check each root/C7/C8
  validity or retention boundary at minus one millisecond and exactly at expiry.
- **Four actual HTTP cases** pass in two separate Node processes around an
  observed PostgreSQL restart. Concurrent exact requests dispatch one C8 list,
  settle one receipt and save one proposal. Completed replay stays HISTORICAL.
- Genuine C8 list delivery loss saves HELD_UNKNOWN. Exact replay before and after
  restart refuses without discovery, snapshot reads, new receipt or new revision.
  A new explicit request may perform one fresh read; the held receipt is unchanged.
- Standalone and compound late-policy cases preserve the true source-read value,
  source row, saved receipt and revision. Policy transition goes through the
  canonical owner in a separately labelled fixture operation; DB constraints,
  business deadlines and DB clock are unchanged.
- Request-level business writes/outbound effects remain zero. Both owned clusters
  stopped; all owned process groups are absent. **1,815 source hashes** match the
  final committed source. The archive retains both failed and successful attempts.

Evidence: [verification](evidence/maya-development-integration-20261006/c9-failure-20261008/verification.json),
[final HTTP manifest](evidence/maya-development-integration-20261006/c9-failure-20261008/http-attempt2/manifest.json),
[actual outcomes](evidence/maya-development-integration-20261006/c9-failure-20261008/http-attempt2/resume-observations.json).
Independent code and artifact review is recorded in the same archive.

## Exact limits and next deliverable

This proves replay of a persisted HELD_UNKNOWN after loss of delivery, **not an
actually crashed DISPATCHED worker or naturally elapsed lease recovery**. Expiry
checks use component clocks and synthetic independent deadlines; they do not
qualify DB-admissible deadline shapes or natural elapsed HTTP expiry. Current
React was not rerun in this HTTP-only failure slice; its earlier evidence remains
separately qualified. C7 native GET input and the compound model selection are
synthetic. There is no real model or YCLIENTS acceptance, C10 completion, aggregate
certificate, production change, website change, push, merge or deployment.

The owner's next priority is the core conversation on one app/backend candidate:
natural language and actual assistant history → existing C9/agents → authoritative
READ or permitted booking create/move/cancel → coherent response and restart.
Warehouse/OCR/Linux portability and design are deferred. The next deliverable is a
frozen conversational diagnostic and concrete real-model execution prerequisites;
the closed historical paid permit grants no new execution authority. `NOT_ISSUED`.
