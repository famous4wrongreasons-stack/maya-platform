import { readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');
const BACKEND_ROOT = resolve(SRC_ROOT, '..');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

function productionTypescriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return productionTypescriptFiles(path);
    return entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.spec.ts')
      ? [path]
      : [];
  });
}

describe('canonical ActionExecution ingress ratchet', () => {
  it('routes every production runtime creation through canonical ingress', () => {
    const runtime = source(join(__dirname, 'action-engine.runtime.ts'));

    expect(runtime.match(/canonicalIngress\.createExecution\(/g)).toHaveLength(
      2,
    );
    expect(runtime).not.toMatch(/kernel\.create(?:Canonical)?Execution\(/);
    expect(runtime).not.toContain('createExecutionForControlledFixture');
  });

  it('keeps direct durable ActionExecution creation inside the guarded kernel', () => {
    const creators = productionTypescriptFiles(SRC_ROOT).filter((path) =>
      source(path).includes('actionExecution.create({'),
    );
    expect(creators.map((path) => basename(path))).toEqual([
      'action-engine.kernel.ts',
    ]);

    const canonicalKernelCallers = productionTypescriptFiles(SRC_ROOT).filter(
      (path) => source(path).includes('.createCanonicalExecution('),
    );
    expect(canonicalKernelCallers.map((path) => basename(path))).toEqual([
      'action-engine.ingress.ts',
    ]);

    const controlledFixtureCallers = productionTypescriptFiles(SRC_ROOT).filter(
      (path) => source(path).includes('.createExecutionForControlledFixture('),
    );
    expect(controlledFixtureCallers.map((path) => basename(path))).toEqual([
      'action-engine.kernel.ts',
    ]);
  });

  it('allows direct kernel fixtures only behind the explicit controlled gate', () => {
    const kernel = source(join(__dirname, 'action-engine.kernel.ts'));
    expect(kernel).toContain('controlledFixtureMode?: boolean');
    expect(kernel).toContain('assertControlledFixtureMode()');

    for (const relativePath of [
      'scripts/action-engine-kernel-proof.ts',
      'scripts/appointment-action-engine-proof.ts',
      'scripts/communication-delivery-foundation-proof.ts',
    ]) {
      const fixture = source(join(BACKEND_ROOT, relativePath));
      expect(fixture).toContain('controlledFixtureMode: true');
      expect(fixture).not.toMatch(/\.createExecution\(/);
    }
  });

  it('wires resolver, ingress and kernel through the Nest module', () => {
    const moduleSource = source(join(__dirname, 'action-engine.module.ts'));
    expect(moduleSource).toContain('imports: [EntitlementsModule]');
    expect(moduleSource).toContain('provide: CanonicalActionPolicyResolver');
    expect(moduleSource).toContain('provide: ActionEngineKernel');
    expect(moduleSource).toContain('CanonicalActionIngressService');
    expect(moduleSource).toContain('ActionEngineRuntimeService');
  });

  it('keeps migrated appointment and communication executors behind runtime', () => {
    const crm = source(join(SRC_ROOT, 'crm', 'crm.service.ts'));
    const communication = source(
      join(
        SRC_ROOT,
        'communication-delivery',
        'communication-delivery.service.ts',
      ),
    );
    const shadow = source(
      join(SRC_ROOT, 'communication-shadow', 'communication-shadow.service.ts'),
    );

    for (const migratedPath of [crm, communication, shadow]) {
      expect(migratedPath).not.toContain('ActionEngineKernel');
      expect(migratedPath).not.toContain('actionExecution.create');
    }
    expect(crm).toContain('ActionEngineRuntimeService');
    expect(communication).toContain('ActionEngineRuntimeService');
    expect(shadow).toContain('ActionEngineRuntimeService');
    expect(communication).toMatch(
      /sourceRef: 'marketing\.sendCampaign',[\s\S]{0,120}actorUserId: input\.actorUserId/,
    );
  });

  it('keeps A08 payment write disabled before Action Engine dispatch', () => {
    const crm = source(join(SRC_ROOT, 'crm', 'crm.service.ts'));
    expect(crm).toContain(
      'Visit payment write is deferred. Complete the payment manually in YClients.',
    );
    expect(crm).toContain(
      "code: 'visit_payment_write_provider_contract_deferred'",
    );
  });

  it('keeps P4-02 loyalty adjustment behind canonical shadow without executable cutover', () => {
    const loyalty = source(join(SRC_ROOT, 'loyalty', 'loyalty.service.ts'));
    const controller = source(
      join(SRC_ROOT, 'loyalty', 'loyalty.controller.ts'),
    );
    const aiHandler = source(
      join(SRC_ROOT, 'ai-tools', 'ai-tool-handler.service.ts'),
    );

    expect(loyalty).toContain('ActionEngineRuntimeService');
    expect(loyalty).toContain('this.actionEngine.planShadow({');
    expect(loyalty).toContain(
      "capability: 'loyalty.internal-adjust.shadow.v1'",
    );
    expect(loyalty).not.toMatch(
      /this\.actionEngine\.(?:execute|executeWithReceipt)\(/,
    );
    expect(loyalty).not.toContain('actionExecution.create');
    expect(controller).toContain("sourceRef: 'http.admin-loyalty.adjust'");
    expect(aiHandler).toContain("sourceRef: 'ai-tool.loyalty.internal.adjust'");

    const directLedgerOwners = productionTypescriptFiles(SRC_ROOT).filter(
      (path) => source(path).includes('loyaltyTransaction.create'),
    );
    expect(directLedgerOwners.map((path) => basename(path))).toEqual([
      'loyalty.service.ts',
    ]);
  });
});
