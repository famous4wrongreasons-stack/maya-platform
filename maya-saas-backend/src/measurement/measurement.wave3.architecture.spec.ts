import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const read = (name: string) => readFileSync(join(__dirname, name), 'utf8');

describe('C7 Wave 3 canonical source read capabilities', () => {
  it('injects only the existing verified Action Engine input reader', () => {
    const code = read('measurement.module.ts');
    const ast = ts.createSourceFile(
      'module.ts',
      code,
      ts.ScriptTarget.Latest,
      true,
    );
    const imports: string[] = [];
    const accesses: string[] = [];
    const escapedKernel: string[] = [];
    const walk = (node: ts.Node) => {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text.includes('action-engine')
      ) {
        imports.push(node.moduleSpecifier.text);
      }
      if (ts.isIdentifier(node) && node.text === 'kernel') {
        if (ts.isParameter(node.parent) && node.parent.name === node) {
          // Factory dependency stays inside the factory.
        } else if (
          ts.isPropertyAccessExpression(node.parent) &&
          node.parent.expression === node
        ) {
          accesses.push(node.parent.name.text);
        } else escapedKernel.push(node.parent.getText(ast));
      }
      ts.forEachChild(node, walk);
    };
    walk(ast);
    expect(imports.sort()).toEqual([
      '../action-engine/action-engine.kernel',
      '../action-engine/action-engine.module',
    ]);
    expect(accesses).toEqual(['readTrustedNormalizedInput']);
    expect(escapedKernel).toEqual([]);
    expect(code).toContain('Object.freeze(');
    expect(code).toContain('new MeasurementOutcomesReader(');
  });

  it('readers have no source writer, effect executor, secret or duplicate decryptor', () => {
    for (const name of readdirSync(__dirname).filter(
      (name) =>
        name.startsWith('measurement.outcomes') ||
        name.startsWith('measurement.staff-goal'),
    )) {
      if (!name.endsWith('.ts') || name.endsWith('.spec.ts')) continue;
      const source = read(name);
      expect(source).not.toMatch(
        /\.(?:create|createMany|upsert|update|updateMany|delete|deleteMany|execute|dispatch|claimExecution|sendMessage)\s*\(/,
      );
      expect(source).not.toMatch(
        /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+"(?:Appointment|Client|ActionExecution|RecoveryConversion|DashboardPreference|MarketingCampaign|Staff)"/i,
      );
      expect(source).not.toMatch(
        /from ['"].*(?:action-engine|encryption|communication-delivery|openai|anthropic|crm-adapter\.interface)[^'"]*['"]/,
      );
      expect(source).not.toMatch(
        /decryptNormalizedPayload|decryptString|createDecipher|process\.env|ConfigService|assertCrmStaffAccessActive/,
      );
    }
  });

  it('shares publication and keeps remote payroll reads outside its transaction', () => {
    const sources = read('measurement.sources.ts');
    expect(sources).toContain('this.outcomes.read(tenantId, i, db)');
    expect(sources).toContain('this.staffGoal.read(tenantId, i)');
    expect(sources).toContain(
      'this.staffGoal.assertPreparedCurrent(tenantId, i, result, tx)',
    );
    const service = read('measurement.service.ts');
    const compute = service
      .split('async compute(')[1]
      .split('async current(')[0];
    expect(compute.indexOf('this.sources.prepare')).toBeLessThan(
      compute.indexOf('this.prisma.$transaction'),
    );
    expect(compute).toContain('this.sources.assertPreparedCurrent');
    expect(compute).toContain("reasons: ['source_subject_changed']");
  });
});
