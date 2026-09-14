import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

import { PACKAGE5_WAVE5_REGISTRATIONS } from './package5-wave5-executable.contract';

const read = (path: string) =>
  readFileSync(join(process.cwd(), 'src', path), 'utf8');

const isProductionSource = (path: string) =>
  path.endsWith('.ts') && !path.endsWith('.spec.ts');

/** Mask only the method token in the proven node:crypto HMAC chain. */
function maskProvenHmacUpdate(code: string): string {
  const fileName = '/wave5-recovery-surface.ts';
  const source = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true,
  );
  const options: ts.CompilerOptions = { noLib: true, noResolve: true };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (path) => (path === fileName ? source : undefined);
  const checker = ts.createProgram([fileName], options, host).getTypeChecker();
  const tokens: Array<{ start: number; end: number }> = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'update'
    ) {
      const receiver = node.expression.expression;
      const digest = node.parent;
      if (
        ts.isCallExpression(receiver) &&
        ts.isIdentifier(receiver.expression) &&
        receiver.arguments.length === 2 &&
        ts.isStringLiteral(receiver.arguments[0]) &&
        receiver.arguments[0].text === 'sha256' &&
        ts.isPropertyAccessExpression(digest) &&
        digest.name.text === 'digest' &&
        ts.isCallExpression(digest.parent) &&
        digest.parent.arguments.length === 1 &&
        ts.isStringLiteral(digest.parent.arguments[0]) &&
        digest.parent.arguments[0].text === 'hex'
      ) {
        const declarations = checker.getSymbolAtLocation(
          receiver.expression,
        )?.declarations;
        const binding =
          declarations?.length === 1 ? declarations[0] : undefined;
        if (
          binding &&
          ts.isImportSpecifier(binding) &&
          !binding.isTypeOnly &&
          (binding.propertyName ?? binding.name).text === 'createHmac'
        ) {
          const clause = binding.parent.parent;
          const imported = clause.parent;
          if (
            !clause.isTypeOnly &&
            ts.isImportDeclaration(imported) &&
            ts.isStringLiteral(imported.moduleSpecifier) &&
            imported.moduleSpecifier.text === 'node:crypto'
          ) {
            tokens.push({
              start: node.expression.name.getStart(source),
              end: node.expression.name.getEnd(),
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const token of tokens.sort((a, b) => b.start - a.start)) {
    code =
      code.slice(0, token.start) +
      ' '.repeat(token.end - token.start) +
      code.slice(token.end);
  }
  return code;
}

function readSurfaceViolations(code: string): string[] {
  const masked = maskProvenHmacUpdate(code);
  return [
    ...masked
      .slice(masked.indexOf('async report('))
      .matchAll(
        /this\.factPlane\.|\.(create(?:Many)?|update(?:Many)?|upsert|delete(?:Many)?)\s*\(/g,
      ),
  ].map((match) => match[0]);
}

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
      .filter(isProductionSource)
      .filter((path) =>
        /recovery(?:Touchpoint|Conversion)\s*\.(?:create|update|upsert|delete)/.test(
          readFileSync(path, 'utf8'),
        ),
      );
    expect(writers).toEqual([
      join(process.cwd(), 'src/package5-wave5/package5-wave5.service.ts'),
    ]);
    expect(readSurfaceViolations(recovery)).toEqual([]);
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

describe('Wave 5 cryptographic update synchronization regressions', () => {
  const recovery = read('recovery/recovery.service.ts');
  const insertInReport = (statement: string) =>
    recovery.replace(
      'this.assertReportRange(from, to);',
      `this.assertReportRange(from, to);\n${statement}`,
    );

  it('identifies the exact old failing HMAC match and permits only its crypto import binding', () => {
    const oldSurface = recovery.slice(recovery.indexOf('async report('));
    const matches = [
      ...oldSurface.matchAll(/\.(create|update|upsert|delete)\s*\(/g),
    ];
    expect(matches.map((match) => match[0])).toEqual(['.update(']);
    expect(oldSurface).toContain("createHmac('sha256', secret)");
    expect(readSurfaceViolations(recovery)).toEqual([]);
    expect(
      readSurfaceViolations(
        recovery.replace("from 'node:crypto'", "from './business-writer'"),
      ),
    ).toEqual(['.update(']);
    expect(
      readSurfaceViolations(
        recovery.replace(
          'private subjectRefForPhone(phone: string)',
          'private subjectRefForPhone(phone: string, createHmac: Function)',
        ),
      ),
    ).toEqual(['.update(']);
  });

  it('rejects Prisma, business and provider updates next to the permitted HMAC call', () => {
    for (const statement of [
      'await this.prisma.recoveryConversion.update({ data: { touchpointId: next } });',
      'await businessState.update({ attribution: next });',
      'await provider.update({ attribution: next });',
      'await this.prisma.recoveryConversion\n.updateMany({ data: { status: next } });',
    ]) {
      expect(readSurfaceViolations(insertInReport(statement))).toHaveLength(1);
    }
  });

  it('rejects direct attribution mutation even inside the HMAC argument', () => {
    const malicious = recovery.replace(
      "createHmac('sha256', secret)",
      "createHmac('sha256', this.prisma.recoveryConversion.update({ data: { touchpointId: next } }))",
    );
    expect(readSurfaceViolations(malicious)).toEqual(['.update(']);
  });

  it('rejects legacy writes and fact-plane mutation initiated by the report', () => {
    expect(
      readSurfaceViolations(
        insertInReport('await legacyRecovery.update({ touchpointId: next });'),
      ),
    ).toEqual(['.update(']);
    expect(
      readSurfaceViolations(
        insertInReport('await this.factPlane.acceptBooking(observation);'),
      ),
    ).toEqual(['this.factPlane.']);
    expect(
      readSurfaceViolations(
        insertInReport('await this.prisma.recoveryConversion.upsert({});'),
      ),
    ).toEqual(['.upsert(']);
  });

  it('excludes only exact spec files and never a test-named production directory or helper', () => {
    expect(isProductionSource('src/recovery/recovery.service.spec.ts')).toBe(
      false,
    );
    for (const path of [
      'src/test/recovery.service.ts',
      'src/recovery/test-helper.ts',
      'src/recovery/recovery.spec-helper.ts',
    ]) {
      expect(isProductionSource(path)).toBe(true);
    }
  });
});
