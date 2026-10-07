import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { CANDIDATE_LIMITS } from './current-candidate-budget.mjs';
const hash = (value) => createHash('sha256').update(value).digest('hex');
export const CURRENT_CORPUS =
  'datasets/conversation-intelligence/current-candidate-development-20261007.json';
const GROUPS = [
  'booking',
  'personal',
  'admin',
  'staff_config',
  'bi',
  'lifecycle',
  'occupancy',
  'goods',
];
const RUNTIME_SOURCES = [
  'src/ai-tools/ai-core-model.service.ts',
  'src/ai-tools/planner-wire-context.ts',
  'src/conversation-intelligence/conversation-intelligence.service.ts',
  'src/widgets/composition/chat-read.trigger.ts',
  'src/ai-tools/ai-core.service.ts',
  'src/appointments/appointments.service.ts',
  'src/crm/crm.service.ts',
  'src/crm/crm-request.errors.ts',
  'src/crm/yclients-goods-read.ts',
  'src/crm/adapters/yclients-crm.adapter.ts',
  'src/ai-tools/ai-tool-registry.service.ts',
  'src/orchestration/c9.registry.ts',
  'src/conversation-intelligence/conversation-taxonomy.ts',
  'scripts/conversation-qualification/current-candidate-budget.mjs',
  'scripts/conversation-qualification/current-candidate.mjs',
  'scripts/conversation-qualification/current-candidate-offline.mjs',
  'scripts/conversation-qualification/current-candidate-serializer.ts',
  'src/ai-tools/ai-tool.catalog.ts',
  'scripts/conversation-qualification/replay.mjs',
];

/** New authored development corpus, never an independent holdout. Fixture
 * requirements are explicit, not falsely reported as implemented HTTP seeders. */
export function freezeCurrentCandidate(backend, candidateCommit) {
  if (!/^[a-f0-9]{40}$/.test(candidateCommit))
    throw new Error('candidate_commit_required');
  const read = (name) => {
    const path = resolve(backend, name),
      rel = relative(backend, path);
    if (isAbsolute(rel) || rel.startsWith('..'))
      throw new Error('candidate_source_path');
    return readFileSync(path);
  };
  const source = read(CURRENT_CORPUS),
    corpus = JSON.parse(source);
  if (
    corpus.contract !== 'maya.current-candidate-corpus/1' ||
    corpus.split !== 'dev' ||
    corpus.dialogs !== 24 ||
    corpus.families !== 8 ||
    corpus.cases?.length !== 24 ||
    corpus.rubric?.http200IsPass !== false ||
    corpus.rubric?.zeroModelPathCountsAsRealModelCoverage !== false
  )
    throw new Error('candidate_corpus_contract');
  const ids = new Set(),
    sources = new Set([...RUNTIME_SOURCES, CURRENT_CORPUS]);
  for (const group of GROUPS) {
    const rows = corpus.cases.filter((c) => c.group === group);
    if (
      rows.length !== 3 ||
      ['ordinary', 'correction', 'negative'].some(
        (v) => rows.filter((c) => c.variant === v).length !== 1,
      )
    )
      throw new Error('candidate_group_coverage');
  }
  for (const item of corpus.cases) {
    if (
      !/^current-[a-z_]+-(ordinary|correction|negative)$/.test(item.id) ||
      ids.has(item.id) ||
      !GROUPS.includes(item.group) ||
      item.familyId !== `current-${item.group}` ||
      !['client', 'owner', 'admin', 'employee'].includes(item.role) ||
      !Array.isArray(item.userTurns) ||
      !item.userTurns.length ||
      item.userTurns.length > 4 ||
      item.userTurns.some(
        (t) => typeof t !== 'string' || !t.trim() || t.length > 2000,
      ) ||
      !Array.isArray(item.reviewChecks) ||
      !item.reviewChecks.length ||
      item.reviewChecks.some((t) => typeof t !== 'string') ||
      item.provenance?.kind !== 'AUTHORED_DEVELOPMENT_VARIANT_NOT_HOLDOUT' ||
      item.fixture?.kind !== 'SYNTHETIC_REQUIREMENTS_NOT_HTTP_SEED' ||
      item.fixture?.httpBinding !== 'NOT_IMPLEMENTED_FOR_THIS_MANIFEST'
    )
      throw new Error('candidate_case_contract');
    ids.add(item.id);
    sources.add(item.provenance.sourceProofFile);
  }
  const turns = corpus.cases.reduce((n, c) => n + c.userTurns.length, 0);
  if (turns !== corpus.userTurns || turns > CANDIDATE_LIMITS.turns)
    throw new Error('candidate_turn_count');
  if (
    hash(read(corpus.historicalCorpus.path)) !== corpus.historicalCorpus.sha256
  )
    throw new Error('candidate_historical_source_changed');
  sources.add(corpus.historicalCorpus.path);
  const manifest = {
    version: 1,
    purpose: 'pilot_calibration_not_qualification',
    status: 'OFFLINE_MECHANICS_ONLY_HTTP_BINDINGS_PENDING',
    split: 'dev',
    candidateCommit,
    sourceSha256: hash(source),
    sourceHashes: Object.fromEntries(
      [...sources].sort().map((n) => [n, hash(read(n))]),
    ),
    roles: [...new Set(corpus.cases.map((c) => c.role))],
    dialogs: 24,
    families: 8,
    independentFamilies: 0,
    userTurns: turns,
    limits: CANDIDATE_LIMITS,
    rubric: corpus.rubric,
    paidAuthorized: false,
    currentPricesVerified: false,
    cases: corpus.cases.map((c) => ({
      ...c,
      expectedIntents: [],
      sourceCaseSha256: hash(JSON.stringify(c)),
    })),
  };
  return { ...manifest, manifestSha256: hash(JSON.stringify(manifest)) };
}
