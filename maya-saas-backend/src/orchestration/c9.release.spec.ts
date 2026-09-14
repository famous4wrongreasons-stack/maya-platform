/**
 * P06 permanent release ratchet (mapping §13, §15).
 * The frozen manifest is checked against the code, every C9 ratchet is wired into the
 * mandatory suite, the offline evaluation corpus runs here rather than in an optional
 * script, and the things Chapter 9 promised never to become stay impossible: no
 * self-modifying prompt or policy, no autonomous self-initiation, no recurring
 * orchestration, no revived Python auto-effects and no online peer training.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { C9Agents } from './c9.agents';
import {
  c9EvalCorpus,
  c9Evaluate,
  C9_EVAL_CONTEXTS,
  C9_EVAL_VERTICALS,
} from './c9.evaluation';
import { C9_SKILLS, C9_SKILL_MANIFEST_HASH, c9Skill } from './c9.skills';
import { C9_DOMAINS, C9_TASKS, C9_ROUTES } from './c9.contract';
import { C9_CAPABILITIES, C9_REGISTRY_HASH } from './c9.registry';

const dir = __dirname;
const manifest = JSON.parse(
  readFileSync(
    join(
      dir,
      '../../../docs/rebuild/evidence/chapter9-preflight/manifest.json',
    ),
    'utf8',
  ),
) as {
  counts: Record<string, number>;
  requirements: { id: string; package: string }[];
  surfaces: { id: string }[];
  waves: string[][];
};
const production = readdirSync(dir).filter(
  (n) => n.endsWith('.ts') && !n.endsWith('.spec.ts'),
);
const specs = readdirSync(dir).filter((n) => n.endsWith('.spec.ts'));
const strip = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
const read = (name: string) => readFileSync(join(dir, name), 'utf8');

describe('c9 release gate', () => {
  test('the frozen manifest still matches the released code', () => {
    expect(manifest.counts).toMatchObject({
      requirements: 30,
      packages: 6,
      waves: 4,
      productionSurfaces: 32,
      ownerDecisions: 16,
    });
    expect(manifest.requirements).toHaveLength(30);
    expect(manifest.surfaces).toHaveLength(32);
    expect(manifest.waves).toEqual([
      ['P01'],
      ['P02', 'P03'],
      ['P04', 'P05'],
      ['P06'],
    ]);
    // Every requirement belongs to exactly one of the six packages.
    const packages = new Set(manifest.requirements.map((r) => r.package));
    expect([...packages].sort()).toEqual([
      'P01',
      'P02',
      'P03',
      'P04',
      'P05',
      'P06',
    ]);
    // One coordinator, four canonical domains, no fifth agent.
    expect([...C9_DOMAINS]).toEqual([
      'ADMIN',
      'CLIENT_LIFECYCLE',
      'OCCUPANCY',
      'BUSINESS_INTELLIGENCE',
    ]);
    expect([...C9_TASKS]).toHaveLength(6);
  });

  test('every C9 ratchet named by the mapping is wired into the mandatory suite', () => {
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
      expect(specs).toContain(required);
    // They are colocated under src/, so the existing testRegex includes them all.
    const pkg = JSON.parse(
      readFileSync(join(dir, '../../package.json'), 'utf8'),
    ) as { jest: { testRegex: string; rootDir: string } };
    expect(pkg.jest).toMatchObject({
      testRegex: '.*\\.spec\\.ts$',
      rootDir: 'src',
    });
  });

  test('the offline evaluation corpus passes in every sample', () => {
    const corpus = c9EvalCorpus();
    // 4 domains x 4 verticals x 5 outcome contexts, plus one adversarial cell per Q.
    expect(C9_EVAL_VERTICALS).toHaveLength(4);
    expect(C9_EVAL_CONTEXTS).toHaveLength(5);
    expect(corpus.filter((c) => c.kind === 'NAMED')).toHaveLength(80);
    expect(corpus.filter((c) => c.kind === 'ADVERSARIAL')).toHaveLength(30);
    expect(new Set(corpus.map((c) => c.cellKey)).size).toBe(corpus.length);
    const outcome = c9Evaluate(new C9Agents(), corpus);
    // No average may hide one unsafe answer: every cell must pass.
    expect(
      outcome.results
        .filter((r) => !r.pass)
        .map((r) => [r.cellKey, r.failures]),
    ).toEqual([]);
    expect(outcome.passed).toBe(outcome.total);
  });

  test('reasoning bundles are released artifacts with immutable digests', () => {
    expect(C9_SKILLS).toHaveLength(6);
    for (const skill of C9_SKILLS)
      for (const key of [
        'skillHash',
        'promptHash',
        'modelConfigHash',
        'evaluationManifestHash',
      ])
        expect(skill[key]).toMatch(/^[a-f0-9]{64}$/);
    expect(C9_SKILL_MANIFEST_HASH).toMatch(/^[a-f0-9]{64}$/);
    // A BI bundle cannot express a proposal at all.
    expect(c9Skill('c9.bi').maxProposedIntents).toBe(0);
    expect(c9Skill('c9.bi').allowedModes).toEqual(['READ']);
    expect(() => c9Skill('c9.invented')).toThrow(
      'c9_unregistered_skill_bundle',
    );
    // Digests are derived from released content, so no prompt text is stored in a row.
    const source = read('c9.skills.ts');
    expect(source).toContain('instructionKey');
    expect(strip(source)).not.toMatch(/You are |Ты — |system:\s*`/);
  });

  test('nothing in C9 can modify its own prompt, policy or registry at runtime', () => {
    for (const name of production) {
      const code = strip(read(name));
      expect({
        name,
        dynamic: /\beval\s*\(|new Function\s*\(/.test(code),
      }).toEqual({
        name,
        dynamic: false,
      });
    }
    // The registry and the bundles are frozen released code, not editable rows.
    expect(read('c9.registry.ts')).toContain('Object.freeze');
    expect(read('c9.skills.ts')).toContain('Object.freeze');
    expect(C9_REGISTRY_HASH).toMatch(/^[a-f0-9]{64}$/);
    expect(C9_CAPABILITIES.length).toBeGreaterThan(0);
    // Persisting a skill or registry would need a table; the schema has none, and the
    // only tables C9 may write are its own five derived ones.
    const schema = readFileSync(
      join(dir, '../../prisma/schema.prisma'),
      'utf8',
    );
    for (const forbidden of [
      'model C9Skill',
      'model C9Registry',
      'model C9Prompt',
    ])
      expect(schema).not.toContain(forbidden);
    expect(read('c9.store.ts')).toContain(
      "if (!C9_TABLES.includes(table)) c9Deny('table');",
    );
  });

  test('C9 never initiates itself, schedules itself or trains online', () => {
    for (const name of production) {
      const code = strip(read(name));
      // No scheduler, no timer, no recurring orchestration anywhere in the package.
      expect({
        name,
        recurring:
          /@Cron|setInterval\s*\(|setTimeout\s*\(|CronExpression|@Interval|@Timeout/.test(
            code,
          ),
      }).toEqual({ name, recurring: false });
      // No training, no fine-tuning, no promotion from production outcomes.
      expect({
        name,
        training: /\btrain\w*\s*\(|fineTun|reinforc|onlineLearn/i.test(code),
      }).toEqual({ name, training: false });
    }
    // Every run begins from an explicit, signed, expiring user request event.
    expect(read('c9.identity.ts')).toContain("purpose: 'c9_request_v1'");
    expect(read('c9.store.ts')).toContain(
      'this.identity.verify(eventToken, p, now)',
    );
    // A run is entered by an explicit request or by an explicitly selected Opportunity,
    // and the database admits nothing else — there is no timer or scan entry point.
    expect(read('c9.store.ts')).toContain(
      "entryKind: entry ? 'SELECTED_OPPORTUNITY' : 'EXPLICIT_REQUEST',",
    );
    expect(
      readFileSync(
        join(
          dir,
          '../../prisma/migrations/20260913160000_chapter9_orchestration_foundation/migration.sql',
        ),
        'utf8',
      ),
    ).toContain(`"entryKind"='EXPLICIT_REQUEST'`);
  });

  test('routing stays bounded and no retired path is revived', () => {
    for (const [objective, domains] of Object.entries(C9_ROUTES)) {
      expect(objective).toMatch(/^c9\./);
      expect(domains.length).toBeGreaterThan(0);
      expect(domains.length).toBeLessThanOrEqual(2);
    }
    for (const name of production) {
      const code = strip(read(name));
      // The retired 10-agent roster and the AiBrainSession plan owner stay retired.
      expect({
        name,
        legacy: /AiBrainSession|planJson|owner_ai\.py|growth_engine/.test(code),
      }).toEqual({ name, legacy: false });
    }
  });

  test('paid reasoning is closed unless a verified price and cap are configured', () => {
    expect(read('c9.budget.ts')).toContain(
      "c9Deny('paid_capability_not_activated')",
    );
    expect(read('c9.allowance.ts')).toContain('c9AiCostConfig');
    expect(read('c9.work.ts')).toContain(
      'c9PriceAdmission(manifest, input.priceBasis, now)',
    );
    // The default released manifest funds nothing.
    expect(read('c9.budget.ts')).toContain('aiCost: null,');
  });
});
