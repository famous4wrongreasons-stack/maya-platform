# Datasets

The deterministic generator is
`scripts/conversation-intelligence-dataset.ts`. It produces synthetic,
privacy-safe development and evaluation artifacts. It is not a replacement for
curated, consented production-language evaluation.

## Generated Corpus

| Artifact            |   Size | Purpose                                                                                                                    |
| ------------------- | -----: | -------------------------------------------------------------------------------------------------------------------------- |
| `utterances.jsonl`  | 11,352 | Formal, neutral, conversational, slang, short, verbose, typo, contextual, polite, command, question and indirect variants. |
| `adversarial.jsonl` |    600 | Ambiguity, correction, negation, permission probes, unsafe actions, voice noise and mixed language.                        |
| `multi-turn.jsonl`  |  1,050 | Three-to-fifteen-turn context carry-over, replacement, topic switching and confirmation behavior.                          |
| `contrastive.jsonl` |    600 | Lexically similar but semantically different intent pairs.                                                                 |

The main corpus currently contains 10,443 normalized unique utterances, 3,255
unique three-token openings and a maximum opening share of 0.86%. Related
variants share `family_id`; train/dev/test assignment is performed at the family
level to prevent template leakage.

Every utterance carries canonical intent, domain, entities, role, action, data
source, permission, capability readiness and response rule. Contextual rows also
store the previous turn and explicit carry/replace expectations.

## Quality Gates

`npm run ci:dataset:validate` rejects:

- missing, malformed or duplicate records;
- fewer than 10,000 unique utterances;
- weak structural diversity or one dominant opening;
- split leakage inside a phrase family;
- unknown intent, domain, permission or entity slot;
- machine-oriented canonical tokens leaked into user language;
- incomplete policy, language or entity contracts;
- capability/tool/readiness mismatches;
- stale or modified files through SHA-256 manifest validation.

## Privacy

Examples use synthetic people, branches, services and opaque references. Never
add production names, phones, emails, credentials, API tokens or raw chat logs
to these files. Real-traffic evaluation must use consented, redacted and
access-controlled fixtures outside the repository.

## Scoped reconciliation (2026-10-05)

`npm run ci:dataset:sync` preserves existing active examples and their family
splits, adds missing current intent families, refreshes source-owned metadata,
and archives retired-intent examples in `archive-retired-intents.jsonl`. Use
`-- --directory=/absolute/scratch/path` to reconcile a copy before applying it.
The original `generate` mode remains available for explicitly requested new
corpora; it is not needed for ordinary source synchronization.

CF5 deliberately retired `marketing.find_audience`, `marketing.preview_campaign`
and `marketing.send_campaign` (source commit `21638094`). Their 646 examples
remain in the archive as future campaign regression material, outside scored
sets. Current high-risk and read/action distinction scenarios use canonical
Client booking instead, with new IDs. This change is based on the runtime
contract, not on predictions or measured model performance.

This reconciliation preserves 10,824 ordinary utterances and 2,000 evaluation
rows unchanged. It adds 132 examples for each missing current family
(`clients.dormant_list`, `notifications.appointments_read`,
`operations.journal_day`, and the new staff-only `company.business_rules`).
Only the 50 adversarial, 150 multi-turn and 50 contrastive retired-action rows
are replaced. Total active corpus: 13,602 rows; archived: 646 rows.

The validator also checks full exported intent definitions, utterance role
authority and adversarial/multi-turn intent references. A negative scratch
check confirms that a retired adversarial intent is refused. `sync` is
idempotent. The evaluator self-test is scorer integrity only
(`acceptance_evidence: ineligible_scorer_integrity_only`); no live-model
semantic acceptance follows from these checks.
