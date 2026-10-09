# 48/81 offline implementation — resumed checkpoint

Status: **SCRIPTED SYNTHETIC, HTTP/PG PROOF PENDING, NOT MODEL ACCEPTANCE**.
Resumed from `863d1f80bac056dd354973f8f8b54fa72c9216b1` in the isolated
`maya-full-offline` worktree. The frozen 9/18 candidate and its prepared handoff
remain unchanged. No desktop input, credential access or paid run is part of
this work.

The closed `core-offline-48-20261009/1` profile now wires all 48 cases / 81 user
turns through the existing HTTP probe and candidate broker. Dataset SHA-256:
`9c8db1420c489169a474b04dd43933110461fe3630e3ada2fb0e8dc40e7eb15b`.
Its 33 source-family references describe lineage, not independent trials.
The script uses finite planner responses and existing application parsers,
authorization, owners and source fixtures. Live mode, admission, permits and
credential input remain rejected for this profile. Only its local scripted
transport has zero inter-attempt delay; paid profiles retain 6000 ms.

The exact predeclared revoked-membership case expects an actual HTTP 401,
without a fabricated assistant reply, history advance, model call or source
call. Other HTTP failures stop the run. Semantic failures may skip only later
dependent turns in the same case. Report validation binds ordered assessments
to actual responses and requires unchanged business hashes; a balanced turn
count alone cannot establish completion.

## Completed local checks

- 92 Node tests passed across profile, scripted transport, strict report,
  refusal, replay, usage and finite assessment suites.
- 19 fixture Jest tests passed; 6 candidate broker loopback tests passed.
- Widgets-live TypeScript check passed after fixing six profile-union narrowing
  errors. Scoped lint of the three changed TypeScript files passed.
- The attempted combined MJS/TypeScript lint did not pass: 12 MJS files were
  excluded by the existing typed project configuration. This is not a lint pass
  for MJS; those files are checked by parsing, formatting and targeted tests.
- Independent source review found no remaining material blocker; its report
  hardening finding was fixed and covered by regression tests. The reviewer ran
  no services, network or tests.

## Limits that remain explicit

Only the original nine union cases have finite semantic assessments. The other
39 are **UNGRADED** transport/source-mechanics checks; their `expectedBoundary`
descriptions are not domain-specific acceptance oracles. Setup, preflight and
the declared controlled occupancy transition are fixture writes outside the
per-turn business-effects baseline. The `sourceReads` count covers the synthetic
adapter, not every SQL query or source owner.

Current C7 October facts do not establish current-week/year measurements; the
existing C8 30-day rule does not establish a two-month ranking. Goods item 123
does not establish a stock scan. Missing review/inventory configuration does not
establish a verified empty list. The current price-update semantic route is
unreachable through the canonical intent mapping; the script records this as a
limitation and uses the actual catalog read, without fabricating a preview.

The execution guard was removed after wiring and local checks. A single bounded,
serial local HTTP/PG proof is the next step. Until its raw evidence is recorded,
this checkpoint does not establish executable coverage of all 48 cases, model
quality, real YCLIENTS integration, broad MAYA completion or C10 completion.

## First actual HTTP/PG attempt

`/private/tmp/maya-offline48-http-20261009-r1`, source
`211febbe7ad0cebf8ae20bc6dfc4677badded2bd`, failed after 13 attempted turns:
12 reply-bearing HTTP 201 responses, one unresolved HTTP 503 at
`followup-owner-topic-switch` turn 2, and 68 unexecuted turns. The broker latched
the transport refusal and made zero upstream calls. All six owned process groups
were absent; broker closed, PostgreSQL stopped, postmaster PID absent and source
pins unchanged. This failed attempt is retained, not acceptance.

The actual AiCore privacy projection was reproduced locally: projecting the
restored branch semantic plan before user history replaces the previous branch
label with an opaque `[reference removed]` token. The original finite fixture
matcher rejected that valid projected form. The fixture now permits reference
tokens only for the two branch labels in their seven exact frozen positions, separately from name
tokens, and preserves the observed token when returning to the branch topic.
Changed branches, wrong token classes and appended text remain rejected. The
updated model suite passed 10/10 tests. No application or privacy code changed.

## Second actual HTTP/PG attempt

`/private/tmp/maya-offline48-http-20261009-r2` reached 76 attempted turns:
74 reply-bearing HTTP 201 responses, one expected revoked-membership HTTP 401,
and one unresolved HTTP 503 at `utt-inventory.stock-074` turn 1. Five turns were
unexecuted. The stock owner returned its real `configured:false` /
`source:not_configured` result; the script then emitted a bare null tool, leaving
the application's required-source gate pending (`ai_core_required_tool_missing`).
The failed proof is retained. There were zero upstream calls, unchanged source
pins, and confirmed broker/PostgreSQL shutdown with all owned groups absent.

For the two existing inventory/review READ tools only, an actual result with both
unconfigured markers now produces the explicit source limitation in canonical
planner clarification fields. Other shapes do not get this treatment. This is
not a verified empty result or a repair to the application's required-tool logic.
The fixture also preserves the observed stock branch reference. The model suite
again passed 10/10 tests, including negative controls for unproven configuration.
