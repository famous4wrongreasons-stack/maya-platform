import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const read = (file: string) => readFileSync(join(__dirname, file), 'utf8');
function effects(source: string) {
  const ast = ts.createSourceFile(
    'reader.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const calls: string[] = [];
  const walk = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      /\.(?:create|createMany|upsert|update|updateMany|delete|deleteMany|execute|publish|dispatch|synchronizeCrmTeamAccess|assertCrmStaffAccessActive)\s*$/.test(
        node.expression.getText(ast),
      )
    )
      calls.push(node.expression.getText(ast));
    ts.forEachChild(node, walk);
  };
  walk(ast);
  return calls;
}
describe('C7 P04 permanent staff/goal source boundaries', () => {
  it('has no salary/configuration writer, synchronization, duplicate publisher or adapter import', () => {
    for (const file of [
      'measurement.staff-goal.ts',
      'measurement.staff-goal.facts.ts',
    ]) {
      const source = read(file);
      expect(effects(source)).toEqual([]);
      expect(source).not.toMatch(
        /measurementRevision\.|encryptedDisplayName|encryptedApiToken|providerPayload|from ['"].*crm-adapter\.interface/,
      );
      expect(source).not.toMatch(
        /new Package5Wave1|\b(?:salary_target|monetary_upside|potential_salary)\b|\*\s*0\.5/,
      );
    }
    for (const example of [
      'db.dashboardPreference.upsert({})',
      'db.staff.update({})',
      'crm.synchronizeCrmTeamAccess(tenant)',
      'owner.publish(result)',
    ])
      expect(effects(example)).toHaveLength(1);
  });
  it('the only CRM call is the canonical read and all private goal evidence stays exact', () => {
    const source = read('measurement.staff-goal.ts');
    expect(
      [...source.matchAll(/this\.crm\.(\w+)\(/g)].map((m) => m[1]),
    ).toEqual(['getFinancialSummary']);
    expect(source).toContain('package5Wave1Hash(preference.configJson)');
    expect(source).toContain('staff_targets_rub');
    expect(source).not.toContain('monthly_target_rub');
    expect(source).toContain('pg_advisory_xact_lock_shared');
    expect(source).toContain('FOR UPDATE');
    expect(source).toContain('measurement_staff_goal_configuration_changed');
    expect(source).toContain('measurement_staff_goal_authority_changed');
  });
  it('the synthetic proof is hard-bound before Prisma and builds positive A22 evidence through the canonical owner', () => {
    const proof = read('../../scripts/chapter7-staff-goal-proof.ts');
    for (const boundary of [
      "url.hostname, '127.0.0.1'",
      "url.port, '55517'",
      "url.pathname, '/maya_c7_replay'",
      "url.username, 'maya_c7'",
    ])
      expect(proof.indexOf(boundary)).toBeLessThan(
        proof.indexOf('new PrismaService'),
      );
    expect(proof).toContain('createStandaloneCanonicalActionEngine');
    expect(proof).toContain('planner.buildFinance');
    expect(proof).toContain('executor.execute');
    expect(proof).not.toMatch(
      /(?:dashboardPreference|actionExecution|actionTargetMutation)\.(?:create|upsert|update)\(/,
    );
    expect(proof).not.toContain('dotenv');
  });
});
