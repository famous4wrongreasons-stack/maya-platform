# Chat-First Gate Programme — Wave 4 closure

**Branch:** `codex/maya-identity-consent-20260913`

**Decision:** K13 required-cells Option A

**Production deployment:** none

**Real business/provider/message effects:** zero

## Delivered units

The final integrated order is:

1. journal-date contract ruling;
2. `P-RESOLVE`;
3. `P-JOURNAL-PROJECTION`;
4. `P-MT2a`;
5. `P-B4-SHELL-WIRE`;
6. `P-TYPED`;
7. `P-MT1`;
8. `U11b`;
9. `U13b`;
10. K13 typed composition-input ruling;
11. `P-MT3`;
12. `CKPT-W4`.

No database model, physical field, Action Engine class or migration was added by the K13 ruling or
`P-MT3`. The twelve K13 moments and the existing widget kinds remain unchanged.

## K13 composition contract

`MomentCompositionInput` is a closed, server-owned typed carrier between a canonical source owner
and the projector. Registry startup validates every required input name and leaf type for all twelve
moments. The client, shell and LLM cannot supply or override composition inputs. Missing, unknown or
wrongly typed input refuses or suppresses before projection. The projected body still passes the
existing strict widget-kind schema.

Permanent executable counterfactuals cover:

- missing required input;
- unknown required input at registry startup;
- wrong input type;
- client or LLM producer substitution;
- valid canonical input and strict projection;
- a final body carrying an undeclared member.

`OperationalAlertRun` remains the shift-reminder source owner. Its narrow optional post-admission
port may request presentation only after the canonical run exists. The widget path can neither admit
the alert nor alter operational delivery.

## Runtime results

- the first live read-only widget path is ready locally;
- `operations.journal.read` projects through the single canonical read port into the existing
  `SCHEDULE` kind;
- the shell ingests and renders only authorized complete envelopes;
- the interactive selector path remains live;
- the shift-reminder K13 moment mints a restricted `web-push` envelope only for the exact entitled
  tenant and recipient;
- a token minted for principal A is inert for principal B;
- A2.2 remains in force: `DRAFT`, `REQUEST_APPROVAL` and `COMMIT` are not made mintable;
- no projector or widget becomes a business-fact owner.

## CKPT-W4 evidence

| Gate | Result |
|---|---|
| Targeted P-MT3 / architecture regression | 8 suites / 204 tests PASS |
| PostgreSQL widgets live corpus | 20 suites / 320 tests PASS |
| Production-binary HTTP corpus | 14/14 cases PASS; health 200 |
| Full backend regression | 557 suites / 5252 tests PASS |
| Gateway architecture | 10/10 PASS |
| Gate audit + counterfactual self-test | PASS (165 clause keys; 4 positive / 14 negative cases) |
| Mutation scheduling/receipt self-test | PASS (30 batteries / 46 jobs / 348 declarations) |
| P-MT3 mutation battery | 7/7 killed; zero unexpected survivors |
| Lint | PASS (zero errors) |
| Application / scripts / widgets-live typechecks | PASS |
| Build / preflight | PASS |
| Prisma validation | PASS |
| Pending migrations on the owned proof DB | 0 (98/98 applied) |
| Schema changes in Wave 4 | 0 |

The supported repository/CI runtime remains Node 22. A post-commit local run under Node 24.15 exited
with process status 139 after the first Python segment, without an assertion failure. This preserves
the known Node 24 compatibility defect as unresolved evidence; it is not converted into a PASS. The
canonical final-head full-regression receipt must come from the Node 22 Platform CI job.

The mutation workflow is deliberately fail closed for a missing/duplicate/stale partition, a reduced
test selection, a worker crash, a red baseline, a vacuous kill or any surviving mutant. Canonical CI
receipts are required against the closure commit before the verdict is reported to the owner.

## Verdict

```yaml
WAVE 4 CERTIFIED: YES
K13 REQUIRED-CELLS: PASS
FIRST LIVE READ-ONLY WIDGET PATH: READY
JOURNAL → SCHEDULE WIDGET: PASS
INTERACTIVE SELECTOR PATH: PASS
A2.2 BACKSTOP: PRESERVED
UNEXPECTED SURVIVING MUTANTS: 0
FULL REGRESSION: PASS
PRODUCTION DEPLOYMENT: NO
REAL BUSINESS EFFECTS: 0
WAVE 5 STARTED: NO
```
