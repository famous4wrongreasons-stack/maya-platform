import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string): string =>
  fs.readFileSync(path.join(__dirname, relative), 'utf8');

describe('U13a — Gate 13 architecture barriers', () => {
  const router = read('effect-router.service.ts');
  const input = read('routing-input.ts');
  const control = read('../control/control-registry.service.ts');
  const audit = read('../stores/intent-audit.store.ts');
  const commitOwner = read('../owner-ports/commit-booking.adapter.ts');

  it('B15/B28 has one closed seven-literal effect switch and no NONE/default edge', () => {
    const switchBody = router.slice(
      router.indexOf('switch (effect)'),
      router.indexOf('\n  private control('),
    );
    expect(switchBody).toMatch(/case 'NAVIGATE'/);
    expect(switchBody).toMatch(/case 'REFINE'/);
    expect(switchBody).toMatch(/case 'CONTROL'/);
    expect(switchBody).toMatch(/case 'DRAFT'/);
    expect(switchBody).toMatch(/case 'REQUEST_APPROVAL'/);
    expect(switchBody).toMatch(/case 'HANDOFF'/);
    expect(switchBody).toMatch(/case 'COMMIT'/);
    expect(switchBody).not.toMatch(/case 'NONE'/);
    expect(switchBody).not.toMatch(/default\s*:/);
  });

  it('AMB-54 resolves the destination before the claim and executes only after the winning CAS', () => {
    const lookup = router.indexOf('const destination = this.destination');
    const claim = router.indexOf('await this.stores.claimIntentRecord');
    const execute = router.indexOf('const routed = await destination()');
    const receipt = router.indexOf('await this.stores.writeReceipt');
    expect(lookup).toBeGreaterThan(0);
    expect(lookup).toBeLessThan(claim);
    expect(claim).toBeLessThan(execute);
    expect(execute).toBeLessThan(receipt);
  });

  it('B19 obtains a CONTROL destination only through subjectOf, never direct handoff/capability reads', () => {
    const controlBranch = router.slice(router.indexOf('  private control('));
    expect(controlBranch).toContain('subjectOf(input.record)');
    expect(controlBranch).not.toMatch(
      /record\.(?:handoffSpace|handoffKey|capabilitySpace|capabilityKey)/,
    );
  });

  it('B14/F15 routing input carries no conversation, body, submission, profile or free-input value', () => {
    const declared = input.slice(
      input.indexOf('export interface RoutingInput'),
      input.indexOf('\n}\n', input.indexOf('export interface RoutingInput')),
    );
    for (const forbidden of [
      'utteranceTemplate',
      'renderedUtterance',
      'selectedLabels',
      'selectionDomainLabelsJson',
      'spokenTranscript',
      'bodyJson',
      'submission',
      'profileId',
      'inputs',
    ])
      expect(declared).not.toContain(forbidden);
  });

  it('B15/R5b router and handler have no canonical owner or Action Engine service import', () => {
    for (const source of [router, control]) {
      expect(source).not.toMatch(/from ['"].*action-engine/);
      expect(source).not.toMatch(
        /from ['"].*(appointments|crm|communication-delivery|orchestration)\//,
      );
      expect(source).not.toMatch(
        /\b(ActionEngine|AppointmentsService|C9Store|Prisma\.[A-Z])/,
      );
    }
  });

  it('R3.2.4 keeps principal and tenant inside the handler query; dismiss is cancelled-only', () => {
    expect(control).toMatch(
      /where:\s*\{[\s\S]*tenantId: args\.tenantId,[\s\S]*intentRecords:[\s\S]*principalProofHash: args\.principalProofHash/,
    );
    expect(control).toMatch(/lifecycleState: 'LIVE'/);
    expect(control).toMatch(/lifecycleState: 'CANCELLED'/);
    expect(control).toMatch(/state: 'cancelled'/);
    expect(control).not.toMatch(/state: 'dismissed'/);
  });

  it('B-29 writes no utterance echo and reconciles only ACCEPTED without a receipt ref', () => {
    expect(audit).toMatch(/utteranceEcho: null/);
    expect(audit).toMatch(/outcome: 'ACCEPTED',[\s\S]*actionReceiptRef: null/);
    expect(audit).toMatch(
      /data: \{ actionReceiptRef: input\.actionReceiptRef \}/,
    );
  });

  it('P-27/U13c observes the canonical execution without widget authority or controlled fixture mode', () => {
    expect(commitOwner).toContain('withActionInvocationReceipt');
    expect(commitOwner).toContain(
      'key: record.confirmationIdempotencyKey as string',
    );
    expect(commitOwner).not.toMatch(/widgetId\s*:/);

    const productionFiles = (directory: string): string[] =>
      fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return productionFiles(full);
        return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
          ? [full]
          : [];
      });
    const violations = productionFiles(path.resolve(__dirname, '../..'))
      .filter((file) =>
        /controlledFixtureMode\s*:\s*true/.test(fs.readFileSync(file, 'utf8')),
      )
      .map((file) => path.relative(path.resolve(__dirname, '../..'), file));
    expect(violations).toEqual([]);
  });
});
