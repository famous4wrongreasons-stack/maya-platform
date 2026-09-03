import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { PACKAGE5_WAVE5_REGISTRATIONS } from './package5-wave5-executable.contract';

const read = (path: string) =>
  readFileSync(join(process.cwd(), 'src', path), 'utf8');

describe('Package 5 Wave 5 fact-plane and bypass ratchet', () => {
  const canonical = read('package5-wave5/package5-wave5.service.ts');
  const recovery = read('recovery/recovery.service.ts');
  const recoveryController = read('recovery/recovery.controller.ts');
  const shadowIngestion = read('crm/shadow-ingestion.service.ts');
  const reconciliation = read('crm/appointment-reconciliation.service.ts');
  const catchup = read('crm/quarantine-catchup.service.ts');
  const change = read('crm/appointment-change.service.ts');
  const mirror = read('crm/appointment-mirror.service.ts');
  const eventStore = read('events/event-store.service.ts');
  const appModule = read('app.module.ts');
  const recoveryModule = read('recovery/recovery.module.ts');
  const cutover = read(
    'package5-wave5/package5-wave5-canonical-cutover.service.ts',
  );

  it('registers exactly one governed command without fabricating actions for facts', () => {
    expect(PACKAGE5_WAVE5_REGISTRATIONS).toHaveLength(1);
    expect(PACKAGE5_WAVE5_REGISTRATIONS[0]).toMatchObject({
      family: 'A29',
      authorityClass: 'AC1',
      actionClass: 'correct_recovery_attribution',
    });
    expect(
      PACKAGE5_WAVE5_REGISTRATIONS.map((row) => row.actionClass),
    ).not.toEqual(
      expect.arrayContaining([
        'ingest_recovery_touchpoint',
        'observe_recovery_booking',
        'ingest_crm_webhook',
        'run_crm_reconciliation',
      ]),
    );
  });

  it('keeps A29 source acceptance in AC4/AC5 with immutable DomainEvent evidence', () => {
    const factPlane = canonical.slice(
      canonical.indexOf('class Package5Wave5RecoveryFactPlaneService'),
      canonical.indexOf('class Package5Wave5ShadowService'),
    );
    expect(factPlane).toContain('tx.domainEvent.create');
    expect(factPlane).toContain(
      'Prisma.TransactionIsolationLevel.Serializable',
    );
    expect(factPlane).toContain('pg_advisory_xact_lock');
    expect(factPlane).not.toMatch(/actionExecution\.(create|update|upsert)/);
    expect(factPlane).not.toMatch(
      /domainEvent\.(update|updateMany|delete|deleteMany)/,
    );
    expect(factPlane).not.toMatch(
      /\bphone\b|\bemail\b|rawPayload|providerPayload/,
    );
  });

  it('removes all four legacy A29 mutation groups and connects production ownership', () => {
    expect(recovery).toContain('async ingestTouchpoint');
    expect(recovery).toContain('async recordConsentSafeTouchpoint');
    expect(recovery).toContain('async recordBooking');
    expect(recovery).toContain('async markBookingStatus');
    expect(recovery).toContain('this.factPlane.acceptTouchpoint');
    expect(recovery).toContain('this.factPlane.acceptBooking');
    expect(recovery).toContain('this.factPlane.acceptBookingStatus');
    expect(recovery).not.toMatch(
      /recovery(?:Touchpoint|Conversion)\s*\.(create|update|upsert|delete)/,
    );
    expect(recoveryController).toContain(
      'this.canonical.correctRecoveryAttribution',
    );
    expect(recoveryController).toContain(
      '@Roles(UserRole.TENANT_OWNER, UserRole.BUSINESS_OWNER)',
    );
    expect(recoveryModule).toContain(
      'imports: [CrmModule, Package5Wave5Module]',
    );
    expect(appModule).toContain('RecoveryModule');
    expect(cutover).toContain('this.planner.build');
    expect(cutover).toContain('this.ingress.createExecution');
    expect(cutover).toContain('this.kernel.decideApproval');
    expect(cutover).toContain('this.executor.resume(prepared)');
    expect(cutover).toContain('this.executor.execute(prepared)');
    expect(cutover).not.toMatch(
      /this\.prisma|recoveryConversion|recoveryTouchpoint/,
    );
  });

  it('allows recovery projection writers only in the exact canonical Wave 5 file', () => {
    const visit = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? visit(join(directory, entry.name))
          : [join(directory, entry.name)],
      );
    const writers = visit(join(process.cwd(), 'src'))
      .filter((path) => path.endsWith('.ts') && !path.endsWith('.spec.ts'))
      .filter((path) =>
        /recovery(?:Touchpoint|Conversion)\s*\.(?:create|update|upsert|delete)/.test(
          readFileSync(path, 'utf8'),
        ),
      );
    expect(writers).toEqual([
      join(process.cwd(), 'src/package5-wave5/package5-wave5.service.ts'),
    ]);
    const report = recovery.slice(recovery.indexOf('async report('));
    expect(report).not.toMatch(
      /this\.factPlane\.|\.(create|update|upsert|delete)\s*\(/,
    );
  });

  it('keeps webhook, scheduler and catch-up as A31 triggers of one comparator', () => {
    expect(shadowIngestion).toContain('this.changeService.applyObservation');
    expect(reconciliation).toContain('this.changeService.applyObservation');
    expect(catchup).toContain('this.changeService.applyObservation');
    for (const trigger of [shadowIngestion, reconciliation, catchup]) {
      expect(trigger).not.toMatch(
        /(?:this\.prisma|tx)\.appointment\.(create|update|upsert|delete)/,
      );
      expect(trigger).not.toMatch(
        /(?:this\.prisma|tx)\.domainEvent\.(create|update|upsert|delete)/,
      );
    }
    expect(change).toContain('tx.appointment.create');
    expect(change).toContain('tx.appointment.update');
    expect(change).toContain('this.eventStore.append');
    expect(change).toContain('FOR UPDATE');
  });

  it('keeps bootstrap and event storage as narrow fact-plane owners', () => {
    expect(mirror).toContain('async bootstrap');
    expect(mirror).toContain('apply: boolean');
    expect(mirror).not.toMatch(/domainEvent\.(create|update|upsert|delete)/);
    expect(eventStore).toContain('db.domainEvent.create');
    expect(eventStore).not.toMatch(
      /recoveryConversion\.|recoveryTouchpoint\.|loyaltyTransaction\.|billingPayment\./,
    );
  });

  it('keeps the production boundary narrow and provider-read-only', () => {
    expect(canonical).toContain('unknownApplicable: false');
    expect(canonical).toContain("reconciliationState: 'NOT_REQUIRED'");
    expect(canonical).not.toMatch(
      /crmService|provider\.dispatch|providerWrites:\s*1/,
    );
    expect(canonical).toContain('OWNER_APPROVAL_REQUIRED');
    expect(canonical).toContain('sourceEvidenceHash');
    expect(canonical).toContain('immutableSourceFacts: true');
  });
});
