import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIR = __dirname;
const SRC_DIR = join(DIR, '..');
const SHADOW_CLI = join(DIR, '..', '..', 'scripts', 'opportunity-shadow.ts');
const LIFECYCLE_SHADOW_CLI = join(
  DIR,
  '..',
  '..',
  'scripts',
  'opportunity-lifecycle-shadow.ts',
);
const LIFECYCLE_RUN_CLI = join(
  DIR,
  '..',
  '..',
  'scripts',
  'opportunity-lifecycle-run.ts',
);
const PACKAGE = join(DIR, '..', '..', 'package.json');
const PREFLIGHT_TSCONFIG = join(DIR, '..', '..', 'tsconfig.preflight.json');
const DEPLOY_SCRIPT = join(DIR, '..', '..', 'deploy', 'vps', 'deploy.sh');
const LIFECYCLE_FILE = join(DIR, 'opportunity.lifecycle.ts');
const SCHEMA = join(DIR, '..', '..', 'prisma', 'schema.prisma');
const productionFiles = readdirSync(DIR)
  .filter((entry) => entry.endsWith('.ts') && !entry.endsWith('.spec.ts'))
  .map((entry) => join(DIR, entry));

function productionTypeScriptFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return productionTypeScriptFiles(path);
    if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts')) return [];
    return [path];
  });
}

function importedPaths(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [
    ...source.matchAll(
      /^\s*(?:import|export)\b[^;]*?from\s+['"]([^'"]+)['"]/gm,
    ),
  ].map((match) => match[1]);
}

describe('Chapter 5 opportunity boundary', () => {
  it('confines persistence to the lifecycle owner', () => {
    const persistenceOffenders = productionFiles
      .filter((file) => file !== LIFECYCLE_FILE)
      .flatMap((file) =>
        importedPaths(file)
          .filter((path) => /prisma|repository|database|storage/i.test(path))
          .map((path) => `${file.replace(`${DIR}/`, '')} -> ${path}`),
      );
    const lifecycleImports = importedPaths(LIFECYCLE_FILE);

    expect(persistenceOffenders).toEqual([]);
    expect(lifecycleImports).toContain('@prisma/client');
    expect(
      lifecycleImports.filter(
        (path) =>
          !path.startsWith('.') &&
          !path.startsWith('node:') &&
          path !== '@prisma/client',
      ),
    ).toEqual([]);
  });

  it('does not import side-effect, transport, model or agent runtime owners', () => {
    const forbidden =
      /@nestjs|appointments|marketing|recovery|inbox|notifications|telegram|email|sms|loyalty|expenses|billing|commerce|internal-calendar|crm\.service|ai-tools|ai-brain|llm|prompt|agent-runtime|campaign|messag|provider/i;
    const offenders = productionFiles.flatMap((file) =>
      importedPaths(file)
        .filter((path) => forbidden.test(path))
        .map((path) => `${file.replace(`${DIR}/`, '')} -> ${path}`),
    );

    expect(offenders).toEqual([]);
  });

  it('does not expose an execution API or a mutable action state', () => {
    const contract = readFileSync(join(DIR, 'opportunity.contract.ts'), 'utf8');
    const engine = readFileSync(join(DIR, 'opportunity.engine.ts'), 'utf8');
    const lifecycle = readFileSync(LIFECYCLE_FILE, 'utf8');
    const schema = readFileSync(SCHEMA, 'utf8');

    expect(contract).toMatch(/dryRun:\s*true/);
    expect(contract).toMatch(/state:\s*'proposed'/);
    expect(contract).not.toMatch(/state:\s*'execut/);
    expect(engine).not.toMatch(/\bexecute\s*\(/);
    expect(engine).not.toMatch(/\.send\s*\(|\.publish\s*\(|\.write\s*\(/);
    expect(lifecycle).not.toMatch(
      /retryCount|providerOutcome|deliveryState|actionAttempt|approvalState/,
    );
    expect(schema).not.toMatch(/model\s+ActionIntent\b/);
  });

  it('never consumes untrusted request text as policy, route or task context', () => {
    const engine = readFileSync(join(DIR, 'opportunity.engine.ts'), 'utf8');

    expect(engine).not.toMatch(/\.untrustedText\b/);
    expect(engine).not.toMatch(/JSON\.parse\([^)]*untrusted/i);
  });

  it('keeps deferred predictions and invented valuation out of canonical types', () => {
    const contract = readFileSync(join(DIR, 'opportunity.contract.ts'), 'utf8');

    expect(contract).not.toMatch(
      /no_show_risk|revenue_anomaly|lost_revenue|underloaded_staff|reputation_opportunity/,
    );
    expect(contract).not.toMatch(
      /lostRevenue|recoveredRevenue|expectedRecovery|valuationAmount|churnProbability/,
    );
  });

  it('keeps the production shadow edge read-only and outside queue ownership', () => {
    const source = readFileSync(SHADOW_CLI, 'utf8');

    expect(source).toMatch(/SET TRANSACTION READ ONLY/);
    expect(source).not.toMatch(
      /\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/,
    );
    expect(source).not.toMatch(
      /claimBatch|processedAt|sendCampaign|publishInbox/,
    );
    expect(source).not.toMatch(/\.send\s*\(|\.publish\s*\(/);
  });

  it('confines explicit shadow persistence to lifecycle tables and zero execution', () => {
    const source = readFileSync(LIFECYCLE_SHADOW_CLI, 'utf8');

    expect(source).toMatch(/--confirm=/);
    expect(source).toMatch(/OpportunityLifecycleRepository/);
    expect(source).toMatch(/readOpportunityShadowRows/);
    expect(source).not.toMatch(
      /appointments|marketing|recovery|inbox|notifications|telegram|email|sms|loyalty|expenses|billing|commerce|campaign|provider/i,
    );
    expect(source).not.toMatch(/\.send\s*\(|\.publish\s*\(/);
    expect(source).not.toMatch(
      /retryCount|providerOutcome|deliveryState|actionAttempt|approvalState/,
    );
    expect(source).toMatch(/persisted:\s*0/);
    expect(source).toMatch(/executed:\s*0/);
    expect(source).toMatch(/external_actions_executed:\s*0/);
  });

  it('packages one immutable production lifecycle invocation with zero side effects', () => {
    const source = readFileSync(LIFECYCLE_RUN_CLI, 'utf8');
    const packageJson = JSON.parse(readFileSync(PACKAGE, 'utf8')) as {
      scripts: Record<string, string>;
    };
    const preflight = readFileSync(PREFLIGHT_TSCONFIG, 'utf8');
    const deploy = readFileSync(DEPLOY_SCRIPT, 'utf8');

    expect(source).toMatch(/--confirm=/);
    expect(source).toMatch(/chapter5-lifecycle-only/);
    expect(source).toMatch(/OpportunityLifecycleRunner/);
    expect(source).toMatch(/runAsSystemTenant/);
    expect(source).toMatch(/OPPORTUNITY_LIFECYCLE_ENABLED/);
    expect(source).toMatch(
      /action_intents_executed:\s*result\.actionIntentsExecuted/,
    );
    expect(source).toMatch(
      /external_side_effects:\s*result\.externalSideEffects/,
    );
    expect(source).not.toMatch(/\.send\s*\(|\.publish\s*\(/);
    expect(packageJson.scripts['opportunity:lifecycle:run']).toBe(
      'node dist/scripts/opportunity-lifecycle-run.js',
    );
    expect(packageJson.scripts['opportunity:lifecycle:run']).not.toMatch(
      /ts-node/,
    );
    expect(preflight).toContain('scripts/opportunity-lifecycle-run.ts');
    expect(deploy).toContain('dist/scripts/opportunity-lifecycle-run.js');
  });

  it('keeps canonical Opportunity semantics under one production owner', () => {
    const legacyDecisionOwners = [
      'UpsellOpportunity',
      'historicalAddonOpportunity',
      'collectUpsellOpportunities',
      'analyticsRecommendation',
      'booking.upsell.suggest',
      'marketing.audience.find',
      'marketing.campaign.preview',
      'marketing.campaign.send',
    ];
    const productionReachable = productionTypeScriptFiles(SRC_DIR).filter(
      (file) => !file.includes(`${join(SRC_DIR, 'marketing')}/`),
    );
    const offenders = productionReachable.flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return legacyDecisionOwners
        .filter((owner) => source.includes(owner))
        .map((owner) => `${file.replace(`${SRC_DIR}/`, '')} -> ${owner}`);
    });
    const rootModules = [
      join(SRC_DIR, 'app.module.ts'),
      join(SRC_DIR, 'ai-tools', 'ai-tools.module.ts'),
    ].map((file) => readFileSync(file, 'utf8'));

    expect(offenders).toEqual([]);
    // B35 registers only the immutable bulk command owner; it does not restore
    // the retired marketing Opportunity discovery/decision architecture.
    expect(rootModules[1]).not.toMatch(
      /MarketingModule|MarketingService|\.\.\/marketing\//,
    );
    const marketingModule = readFileSync(
      join(SRC_DIR, 'marketing', 'marketing.module.ts'),
      'utf8',
    );
    expect(marketingModule).toContain('exports: [CanonicalBulkService]');
    expect(marketingModule).not.toMatch(
      /\bMarketingService\b|RecoveryService|OpportunityService|CrmService/,
    );
    expect(rootModules[0]).not.toMatch(/\bMarketingService\b/);
  });
});
