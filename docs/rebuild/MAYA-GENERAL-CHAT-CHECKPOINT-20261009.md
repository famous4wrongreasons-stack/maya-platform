# General chat before source-access refusal — 2026-10-09

MAYA can now explain a financial term to a principal whose assistant profile is
available but whose financial source is unavailable. A lexical hint such as
«средний чек» no longer rejects the question before the existing semantic planner.
No CRM read, new planner, capability, permission or external effect is added.

Composition baseline: **`2c2523fc182e24ddd6c7e4f26c02e75b33a08199`**.
Product runtime: **`e2ff6395486da105a5affba459b6b9c6ee72e9ac`**.
Final actual HTTP proof source: **`918b3525dab775a7beedb090366066d8ec0c2902`**.
Post-proof driver-only correction: **`57af858d77fadbee2d417becd45806c6dd62525b`**.
Branch: `codex/maya-conversation-continuation-20261009`.

## Reproduced defect and bounded change

Before changing product code, two unchanged corpus examples,
`utt-general.explain_term-016` and `utt-general.explain_term-024`, returned a
role/tariff refusal instead of explaining average check. Both are existing
training examples for an employee; neither requests actual salon figures.
The [baseline RED](evidence/maya-conversation-continuation-20261009/baseline-red.log)
records two failed assertions. This is a reproduced runtime-routing defect with
scripted semantic decisions, not a model-quality or holdout result.

The existing closed-source guard now runs after semantic classification, before
domain delegation or tool dispatch. Only a nonempty plan entirely composed of
class-A general/small-talk answers, with no tool call and no confirmation, can
lift that lexical requirement. Mixed general/data plans, denied/unavailable
data tasks, missing/invalid plans and model failure retain controlled refusal.
An empty available-tool profile retains its original pre-model boundary.

The existing model service, semantic taxonomy, C9, tool policy, AE, schemas and
retention owners are unchanged. Classification now occurs before some protected
source refusals when a tool profile exists. One `model.decide` can contain both
planning and final-prose upstream calls; no claim of one upstream call is made.
Existing bounded stage retries are unchanged. No paid call was made here.

## Verified result

- **508/508 component tests in five suites**: AiCore, model, conversation
  intelligence, pricing and occupancy. [Final result](evidence/maya-conversation-continuation-20261009/targeted-r4.json).
- Production and full widgets-live types, scoped lint and backend/preflight
  builds pass. [Checks](evidence/maya-conversation-continuation-20261009/checks-r2.json),
  [builds](evidence/maya-conversation-continuation-20261009/build-results.json).
- **3/3 actual auth/HTTP/PG cases** pass on the final proof source.
  [Manifest](evidence/maya-conversation-continuation-20261009/http-r3/manifest.json),
  [Jest](evidence/maya-conversation-continuation-20261009/http-r3/http-jest.json),
  [actual responses](evidence/maya-conversation-continuation-20261009/http-r3/conversation.json).

The HTTP proof uses the exact existing `016` utterance and a canonical employee
with a Staff link. One conversation receives an explanation, refuses a request
for actual revenue, then explains the term again. A history GET restores the six
saved user/assistant turns. A fourth mixed request refuses without substituting
public catalog facts. All four admitted chat requests return 201 with the same
conversation ID. Foreign conversation access returns **409
`conversation_scope_conflict`**; suspended membership returns **401
`Active tenant membership is required`** before further model work.

There are four scripted model decisions, **zero tool executions, zero C9 READs,
zero external fetches**, and zero AE/tool-execution/delivery rows in the owned
proof database. The existing app/auth/history/PG owners run without replacement;
only model decisions are scripted through the actual parser. No CRM/provider
fixture or real business mutation is needed for this slice.

Component controls additionally cover four roles, owner client-audience tool
filtering, native/web clarification, null/error/invalid planning, mixed and denied
tasks, attempted public-tool substitution and unexpected tools in a general plan.
The `024` example has component coverage only. Original48/frozen9 and their
classification totals are unchanged.

## Attempts, review and limits

HTTP R1 is **FAIL**: the test employee lacked its required Staff link, so current
principal resolution refused before model work. Its old `conversation.json`
incorrectly said `passed` because only the last negative check had succeeded;
the manifest and Jest result correctly fail it. That projection is explicitly
excluded from acceptance. The fixture now requires all three checkpoints and
a real prior conversation; R2 passes, and R3 additionally asserts exact 409/401
responses rather than accepting arbitrary server errors.

Earlier component failures are retained: old pre-model call-count expectations
were updated while preserving refusal/no-read assertions; a new client-audience
test initially expected a substituted role, then was corrected to the existing
actual-owner role, admin persona and filtered tools. One fixture lint error was
fixed. These attempts are not counted as passing qualifications.

Independent review found no product/source or final evidence blocker, verified
all 12 R3 source hashes against its exact Git commit and confirmed runtime bytes
unchanged from `e2ff6395`. After that proof, a driver-only correction passes named
signals to cancellation handling, retains `cancelledBy`, cleans listeners and
rejects a cancelled run after cleanup. An active-stage cancellation may have
terminal status `failed` with `cancelledBy`; no interruption test is claimed.
The driver correction has syntax/source review only and does not rebind R3.

All three owned PG clusters stopped. Final source, corpus/launcher preservation,
artifact and cleanup checks are recorded in
[final-verification.json](evidence/maya-conversation-continuation-20261009/final-verification.json).
The [independent review record](evidence/maya-conversation-continuation-20261009/independent-review.json)
preserves the exact qualification and post-proof driver boundary.

The [candidate ancestry](evidence/maya-conversation-continuation-20261009/candidate-inheritance.json)
includes all earlier registered task-2 heads in the full `2c2523fc` baseline except
`codex/maya-union-handoff-20261009` at
`3faa0c4f8934c8c67a8fc564936c3f8070ce8a67`; that frozen launcher/handoff lane remains
separate. No working website, frozen9, launcher, key, real model/YCLIENTS,
production, push or merge was touched. No browser/restart/general-language or
full-MAYA/C10 acceptance is claimed; `NOT_ISSUED`.
