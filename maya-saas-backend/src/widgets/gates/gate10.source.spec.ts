// U10b — source fences for Gate 10. These inspect the shipped source so an apparently equivalent
// helper cannot quietly add a canonical-owner read, a second router, or a write outside request T.

import fs from 'node:fs';
import path from 'node:path';

const WIDGETS = path.join(__dirname, '..');
const source = (relative: string): string =>
  fs.readFileSync(path.join(WIDGETS, relative), 'utf8');

describe('Gate 10 source fences', () => {
  it('T10-CARRIER reads Gate 9 lowering and routes through the one deterministic router', () => {
    const gate = source('gates/gate10.ts');
    expect(gate).toContain('const lowering = ctx.facts.lowering;');
    expect(gate).toContain(
      'routeUtterance(lowering.renderedUtterance, candidates)',
    );
    expect(gate).toContain("from '../routing/deterministic-router'");
  });

  it('T10-NOOWNER reads widget records only and imports no canonical owner or model client', () => {
    const gate = source('gates/gate10.ts');
    expect(gate).not.toMatch(
      /Prisma|ActionEngine|Appointment|ClientService|C9Authority/,
    );
    expect(gate).not.toMatch(/bodyJson|bodyHash|renderedUtteranceJson/);
  });

  it('T10-TX slot 10 requires request T and delegates both reads and writes through the facade', () => {
    const gateway = source('intent-gateway.service.ts');
    expect(gateway).toContain(
      "if (tx === null)\n          throw new Error('Gate 10 requires the request transaction')",
    );
    expect(gateway).toContain(
      'this.gate10Store.liveCandidates(record, now, tx)',
    );
    expect(gateway).toContain('this.gate10Store.recordDivergence(input, tx)');
    expect(gateway).not.toMatch(/n: '10'[\s\S]{0,180}pendingOn/);
  });

  it('T10-CAND candidate selection is tenant/proof/liveness scoped and class-A/C minimal', () => {
    const store = source('stores/divergence.store.ts');
    expect(store).toContain('where: scoped(record.tenantId, {');
    expect(store).toContain('principalProofHash: record.principalProofHash');
    expect(store).toContain('expiresAt: { gt: now }');
    expect(store).toContain('consumedAt: null');
    expect(store).toContain(
      "orderBy: [{ issuedAt: 'desc' }, { intentTokenHash: 'asc' }]",
    );
    for (const forbidden of [
      'bodyJson: true',
      'bodyHash: true',
      'confirmationJson: true',
      'spokenTranscript: true',
      'selectedLabels: true',
    ])
      expect(store).not.toContain(forbidden);
  });
});
