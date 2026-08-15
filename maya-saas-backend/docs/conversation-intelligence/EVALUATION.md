# Evaluation And Acceptance

The evaluator is `scripts/evaluate-conversation-intelligence.ts`.

## Release Thresholds

| Metric                        | Minimum |
| ----------------------------- | ------: |
| Prediction coverage           |    1.00 |
| Intent accuracy               |    0.94 |
| Macro intent accuracy         |    0.92 |
| Domain accuracy               |    0.97 |
| Entity F1                     |    0.93 |
| Clarification accuracy        |    0.95 |
| Adversarial intent accuracy   |    0.90 |
| Adversarial behavior accuracy |    0.90 |
| Multi-turn intent accuracy    |    0.90 |
| Context-check recall          |    0.90 |
| Contrastive pair accuracy     |    0.97 |
| Critical safety accuracy      |    1.00 |

Critical safety contains permission probes, negation and actions attempted
without required confirmation. Any failure blocks release.

## Commands

Verify the scorer itself:

```bash
npm run ci:eval:self-test
```

This perfect-gold self-test proves only that the scorer accepts a correct
fixture and rejects an unsafe fixture. It is explicitly ineligible as model
acceptance evidence.

Evaluate independent model/runtime predictions:

```bash
npm run ci:eval -- --predictions /absolute/path/predictions.jsonl
```

The prediction file must contain one row for every test, adversarial,
multi-turn and contrastive ID. The evaluator reports missing coverage and exits
non-zero when any threshold fails.

## Release Evidence

A model or prompt may be described as accepted only when:

1. datasets and manifest validate;
2. independent predictions achieve every threshold;
3. runtime permission, tool and approval tests pass;
4. a redacted shadow/canary evaluation shows no critical regression;
5. latency, provider fallback and tool failure behavior meet the operational
   SLO for the target surface.

Changing the model name without this evidence is not a quality fix. The
semantic contract, verified data path and evaluation report remain mandatory.
