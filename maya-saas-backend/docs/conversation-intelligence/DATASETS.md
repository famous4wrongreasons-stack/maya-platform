# Datasets

The deterministic generator is
`scripts/conversation-intelligence-dataset.ts`. It produces synthetic,
privacy-safe development and evaluation artifacts. It is not a replacement for
curated, consented production-language evaluation.

## Generated Corpus

| Artifact            |   Size | Purpose                                                                                                                    |
| ------------------- | -----: | -------------------------------------------------------------------------------------------------------------------------- |
| `utterances.jsonl`  | 10,956 | Formal, neutral, conversational, slang, short, verbose, typo, contextual, polite, command, question and indirect variants. |
| `adversarial.jsonl` |    600 | Ambiguity, correction, negation, permission probes, unsafe actions, voice noise and mixed language.                        |
| `multi-turn.jsonl`  |  1,050 | Three-to-fifteen-turn context carry-over, replacement, topic switching and confirmation behavior.                          |
| `contrastive.jsonl` |    600 | Lexically similar but semantically different intent pairs.                                                                 |

The main corpus currently contains 10,080 normalized unique utterances, 3,195
unique three-token openings and a maximum opening share of 0.84%. Related
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
