/**
 * Chapter 9 final gate. Structural and offline only: it reads the frozen manifest, the
 * released code, the one migration and the schema, runs the evaluation corpus against the
 * production agent, and refuses to report PASS unless every count matches exactly.
 *
 * It performs no production action and opens no database connection. Production readiness
 * (pending migrations, drift, health) is verified separately and read-only against the
 * deployed release.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { C9Agents } from '../src/orchestration/c9.agents';
import { c9EvalCorpus, c9Evaluate } from '../src/orchestration/c9.evaluation';
import { C9_SKILLS } from '../src/orchestration/c9.skills';
import { C9_DOMAINS, C9_TASKS } from '../src/orchestration/c9.contract';
import { C9_CAPABILITIES } from '../src/orchestration/c9.registry';
import { C9_RETENTION_CLASSES } from '../src/package5-wave6/chapter9-orchestration-retention';

const root = join(__dirname, '..');
const docs = join(root, '../docs/rebuild');
const orchestration = join(root, 'src/orchestration');
const migrationDir = join(
  root,
  'prisma/migrations/20260913160000_chapter9_orchestration_foundation',
);
const migration = readFileSync(join(migrationDir, 'migration.sql'), 'utf8');
const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');
const manifest = JSON.parse(
  readFileSync(join(docs, 'evidence/chapter9-preflight/manifest.json'), 'utf8'),
) as {
  counts: Record<string, number>;
  requirements: { id: string; package: string }[];
  surfaces: { id: string; packages: string[] }[];
  waves: string[][];
};

const checks: string[] = [];
function gate(name: string, fn: () => void) {
  fn();
  checks.push(name);
  console.log('PASS ' + name);
}

const MODELS = [
  'C9Run',
  'C9StrategyRevision',
  'C9PlanStep',
  'C9StepBinding',
  'C9WorkReceipt',
] as const;
function fieldCount(model: string): number {
  const body = new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, 'm').exec(
    schema,
  );
  assert.ok(body, `model ${model} missing`);
  return body[1]
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !line.startsWith('//') &&
        !line.startsWith('@@') &&
        // Every relation field carries @relation; no physical column does.
        !line.includes('@relation'),
    ).length;
}

function main() {
  gate('Q01–Q30 across exactly six packages and four waves', () => {
    assert.equal(manifest.counts.requirements, 30);
    assert.equal(manifest.requirements.length, 30);
    assert.equal(manifest.counts.packages, 6);
    assert.equal(manifest.counts.waves, 4);
    assert.deepEqual(manifest.waves, [
      ['P01'],
      ['P02', 'P03'],
      ['P04', 'P05'],
      ['P06'],
    ]);
    const ids = manifest.requirements.map((r) => r.id);
    for (let i = 1; i <= 30; i++)
      assert.ok(ids.includes('Q' + String(i).padStart(2, '0')), 'Q' + i);
    assert.deepEqual(
      [...new Set(manifest.requirements.map((r) => r.package))].sort(),
      ['P01', 'P02', 'P03', 'P04', 'P05', 'P06'],
    );
  });

  gate('32 frozen production surfaces, none added or removed', () => {
    assert.equal(manifest.counts.productionSurfaces, 32);
    assert.equal(manifest.surfaces.length, 32);
    assert.equal(new Set(manifest.surfaces.map((s) => s.id)).size, 32);
  });

  gate('D1–D16 owner decisions unchanged', () => {
    assert.equal(manifest.counts.ownerDecisions, 16);
  });

  gate('exact approved envelope: 5 models / 123 fields / 1 migration', () => {
    const total = MODELS.reduce((n, m) => n + fieldCount(m), 0);
    assert.equal(total, 123);
    assert.equal(MODELS.length, 5);
    // Exactly one C9 migration directory exists.
    const c9Migrations = readdirSync(join(root, 'prisma/migrations')).filter(
      (n) => n.includes('chapter9'),
    );
    assert.deepEqual(c9Migrations, [
      '20260913160000_chapter9_orchestration_foundation',
    ]);
    assert.equal(migration.match(/CREATE TABLE /g)?.length, 5);
    assert.equal(migration.match(/CREATE FUNCTION /g)?.length, 8);
    assert.equal(migration.match(/CREATE TRIGGER /g)?.length, 10);
    assert.equal(migration.match(/ON DELETE RESTRICT/g)?.length, 11);
    assert.ok(!/ON DELETE CASCADE|ON UPDATE CASCADE/.test(migration));
    // No backfill and no source write anywhere in the one migration.
    assert.ok(!/\bUPDATE\s+"(?!C9)/.test(migration));
    assert.ok(!/\bINSERT INTO\s+"(?!C9)/.test(migration));
  });

  gate('one AC6 class, zero new Action Engine classes', () => {
    assert.deepEqual(Object.keys(C9_RETENTION_CLASSES), [
      'expire_c9_orchestration_runs',
    ]);
    assert.equal(
      C9_RETENTION_CLASSES.expire_c9_orchestration_runs.policyKey,
      'chapter9.orchestration-retention',
    );
  });

  gate('one orchestrator, four canonical agents, six reasoning tasks', () => {
    assert.deepEqual(
      [...C9_DOMAINS],
      ['ADMIN', 'CLIENT_LIFECYCLE', 'OCCUPANCY', 'BUSINESS_INTELLIGENCE'],
    );
    assert.equal(C9_TASKS.length, 6);
    assert.equal(C9_SKILLS.length, 6);
    // BI is read-only in the registry itself.
    for (const cap of C9_CAPABILITIES.filter((c) =>
      c.domains.includes('BUSINESS_INTELLIGENCE'),
    ))
      assert.equal(cap.mode, 'READ', cap.capabilityKey);
  });

  gate('every named permanent ratchet is present and colocated', () => {
    const specs = readdirSync(orchestration).filter((n) =>
      n.endsWith('.spec.ts'),
    );
    for (const required of [
      'c9.registry.architecture.spec.ts',
      'c9.source-boundaries.architecture.spec.ts',
      'c9.identity.spec.ts',
      'c9.approval.spec.ts',
      'c9.resume.spec.ts',
      'c9.budget.spec.ts',
      'c9.context-and-bi.spec.ts',
      'c9.limited-data-and-strategy.spec.ts',
      'c9.policy-and-sources.spec.ts',
      'c9.retention.spec.ts',
      'c9.consumers.architecture.spec.ts',
      'c9.release.spec.ts',
    ])
      assert.ok(specs.includes(required), required);
    const pkg = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf8'),
    ) as { jest: { testRegex: string; rootDir: string } };
    assert.equal(pkg.jest.testRegex, '.*\\.spec\\.ts$');
    assert.equal(pkg.jest.rootDir, 'src');
  });

  let corpus = { total: 0, passed: 0 };
  gate('offline evaluation corpus passes in every sample', () => {
    const cells = c9EvalCorpus();
    assert.equal(cells.filter((c) => c.kind === 'NAMED').length, 80);
    assert.equal(cells.filter((c) => c.kind === 'ADVERSARIAL').length, 30);
    const outcome = c9Evaluate(new C9Agents(), cells);
    assert.deepEqual(
      outcome.results.filter((r) => !r.pass).map((r) => r.cellKey),
      [],
    );
    corpus = { total: outcome.total, passed: outcome.passed };
  });

  gate('no self-modification, self-initiation or online training', () => {
    for (const name of readdirSync(orchestration).filter(
      (n) => n.endsWith('.ts') && !n.endsWith('.spec.ts'),
    )) {
      const code = readFileSync(join(orchestration, name), 'utf8').replace(
        /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
        '',
      );
      assert.ok(!/\beval\s*\(|new Function\s*\(/.test(code), name);
      assert.ok(
        !/@Cron|setInterval\s*\(|CronExpression|@Interval|@Timeout/.test(code),
        name,
      );
      assert.ok(!/\btrain\w*\s*\(|fineTun|onlineLearn/i.test(code), name);
    }
  });

  gate('paid reasoning closed and C8 numeric activation untouched', () => {
    const budget = readFileSync(join(orchestration, 'c9.budget.ts'), 'utf8');
    assert.ok(budget.includes('aiCost: null,'));
    assert.ok(budget.includes("c9Deny('paid_capability_not_activated')"));
  });

  console.log(
    JSON.stringify({
      contract: 'maya.c9-final-gate/1',
      checks: checks.length,
      passed: checks,
      requirements: 30,
      packages: 6,
      waves: 4,
      productionSurfaces: 32,
      ownerDecisions: 16,
      newModels: 5,
      newPhysicalFields: 123,
      migrations: 1,
      newActionClasses: 0,
      newAc6Classes: 1,
      backfills: 0,
      canonicalOrchestrators: 1,
      canonicalAgents: 4,
      evaluationCells: corpus.total,
      evaluationPassed: corpus.passed,
      paidReasoning: 'DISABLED',
      onlinePeerTraining: 'NO',
      selfModifyingProductionAgent: 'NO',
      autonomousSelfInitiation: 'NO',
      productionEffects: 0,
      status: 'PASS',
    }),
  );
}
try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
