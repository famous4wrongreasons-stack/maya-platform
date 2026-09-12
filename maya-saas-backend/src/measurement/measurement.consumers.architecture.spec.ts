import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(__dirname, '../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('C7 P06 permanent consumer and release boundaries', () => {
  it('HTTP, tools, review readers and report publication use the shared owner', () => {
    for (const module of [
      'ai-tools/ai-tools.module.ts',
      'analytics/analytics-http.module.ts',
      'business-content/business-content.module.ts',
      'owner-reports/owner-reports.module.ts',
    ])
      expect(read(`src/${module}`)).toContain('MeasurementModule');
    expect(read('src/measurement/measurement.module.ts')).toContain(
      'MeasurementController',
    );
    expect(read('src/measurement/measurement.read.service.ts')).toContain(
      'this.measurement.observe(intent)',
    );
    expect(read('src/measurement/measurement.report.ts')).toContain(
      'this.measurement.reportSnapshot',
    );
    expect(read('src/owner-reports/owner-reports.service.ts')).toContain(
      'measurementReports.snapshot',
    );
    const handler = read('src/ai-tools/ai-tool-handler.service.ts');
    for (const name of [
      'readBusinessProfit',
      'readTeamKpi',
      'readRecoveredReport',
    ]) {
      const section = handler
        .split(`private async ${name}(`)[1]
        .split(/\n {2}private /)[0];
      expect(section).toContain('this.measurementRead.');
      expect(section).not.toMatch(
        /(?:getFinancialSummary|\.reduce|\.create|\.upsert|\.update|\.delete)\s*\(/,
      );
    }
    expect(handler).not.toMatch(
      /computePeriodMoneyMotivation|toMotivationVisit|target_progress\s*[:=]/,
    );
  });
  it('read-only controllers cannot admit business, delivery or derived effects', () => {
    for (const file of [
      'measurement/measurement.controller.ts',
      'audit-log/tenant-audit-read.controller.ts',
    ]) {
      const source = read(`src/${file}`);
      expect(source).toContain('@TenantScoped()');
      expect(source).not.toMatch(
        /@(Post|Put|Patch|Delete)\(|\.admit\(|\.resume\(|executeAction\(|sendMessage\(/,
      );
    }
    const reader = read('src/measurement/measurement.read.service.ts');
    expect(reader).not.toMatch(
      /\.admit\(|\.resume\(|\.reportSnapshot\(|\.(create|upsert|update|delete)(Many)?\(/,
    );
    expect(reader).toContain('measurement_feature_denied');
    expect(reader).toContain('measurement_membership_revoked');
    expect(reader).toContain('measurement_staff_scope_denied');
    expect(reader).toContain('canonicalUtcTransaction');
  });
  it('AI cannot consume raw evidence, identifiers or arbitrary source labels', () => {
    const presenter = read('src/measurement/measurement.presentation.ts');
    expect(presenter).toContain("metric.unit !== 'label'");
    expect(presenter).toContain('source_group_');
    expect(presenter).not.toContain('...metric.dimensions');
    expect(read('src/ai-tools/ai-tool-handler.service.ts')).toContain(
      'measurementForAi',
    );
    expect(read('src/ai-tools/ai-core-model.service.ts')).not.toContain(
      'MONEY_MOTIVATION_DEFAULT',
    );
    expect(read('src/ai-tools/ai-core.service.ts')).not.toContain(
      'Прибыль уже можно считать',
    );
  });
  it('tenant audit has exact current owner authority, bounded read and safe fields only', () => {
    const source = read('src/audit-log/tenant-audit-read.service.ts');
    expect(source).toContain("['tenant_owner', 'business_owner']");
    expect(source).toContain("scope: 'tenant'");
    expect(source).toContain('31 * 86400000');
    expect(source).not.toMatch(
      /metadataJson\s*:\s*true|entityId\s*:\s*true|actorUserId\s*:\s*true|\.create\(/,
    );
    expect(read('src/audit-log/audit-log.module.ts')).toContain(
      'TenantAuditReadController',
    );
  });
  it('frozen Q22/S32 manifest and all architectural suites remain mandatory', () => {
    const manifest: unknown = JSON.parse(
      read(
        '../docs/rebuild/evidence/chapter7-preflight/production-surface-manifest.json',
      ),
    );
    expect((manifest as { surfaces: unknown[] }).surfaces).toHaveLength(32);
    expect(
      JSON.parse(
        read('../docs/rebuild/evidence/chapter7-preflight/requirements.json'),
      ),
    ).toHaveLength(22);
    const pkg = JSON.parse(read('package.json')) as {
      scripts: { test: string };
      jest: { testRegex: string; testPathIgnorePatterns?: string[] };
    };
    expect(pkg.scripts.test).toBe('jest');
    expect(pkg.jest.testRegex).toContain('spec');
    expect(pkg.jest.testPathIgnorePatterns ?? []).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/measurement|architecture|ratchet/),
      ]),
    );
    const deploy = read('deploy/vps/deploy.sh');
    expect(deploy).toContain('npm test');
    expect(deploy).toContain('relay-release.cjs');
    expect(deploy).toContain('chapter7-consumers/verify-live.cjs');
  });
});
