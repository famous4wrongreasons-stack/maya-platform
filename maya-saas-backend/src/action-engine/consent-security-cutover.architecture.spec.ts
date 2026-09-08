import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Prisma } from '@prisma/client';
const root = resolve(__dirname, '../../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');
describe('approved incident schema and controlled operational initiator', () => {
  it('adds exactly the approved twelve physical fields', () => {
    const model = Prisma.dmmf.datamodel.models.find(
      (m) => m.name === 'ClientConsentInvalidation',
    )!;
    expect(
      model.fields
        .filter((f) => f.kind !== 'object')
        .map((f) => f.name)
        .sort(),
    ).toEqual(
      [
        'id',
        'tenantId',
        'clientId',
        'consentFactId',
        'invalidatedLinkId',
        'actionExecutionId',
        'authorizedByUserId',
        'reasonCode',
        'policyVersion',
        'evidenceSetHash',
        'authorityEvidenceJson',
        'invalidatedAt',
      ].sort(),
    );
  });
  it('authenticates through existing owners and delegates every security write to A18', () => {
    const code = read(
      'maya-saas-backend/scripts/a18-consent-security-remediation.ts',
    );
    for (const marker of [
      "['is-active', 'maya-saas']",
      "'inactive'",
      'app.get(AuthService).login(',
      '.verify<',
      "Parameters<JwtStrategy['validate']>[0]",
      'app.get(JwtStrategy).validate(payload)',
      'owner.admit(actor, command)',
      'owner.execute(actor, execution.id, command.tenantId)',
      'AuthSessionService).logout(actor)',
      'await app.close()',
    ])
      expect(code).toContain(marker);
    expect(code).not.toMatch(
      /\.sign\(|signAsync|prisma\.|\$executeRaw|clientConsentInvalidation\.(create|update)|clientChannelLink\.(create|update)/,
    );
    for (const flag of [
      'OWNER_REPORTS_SCHEDULER_ENABLED',
      'BILLING_SCHEDULER_ENABLED',
      'APPOINTMENT_REMINDERS_SCHEDULER_ENABLED',
      'INGESTION_QUARANTINE_RETENTION_ENABLED',
      'CRM_RECONCILIATION_SCHEDULER_ENABLED',
    ])
      expect(code).toContain(flag);
    expect(code).toContain("process.env[name] = 'false'");
  });
  it('keeps preparation behind every existing mandatory gate and before activation', () => {
    const script = read('maya-saas-backend/deploy/vps/deploy.sh');
    const boundary = script.indexOf(
      'if [ "${MAYA_DEPLOY_PREPARE_ONLY:-0}" = "1" ]',
    );
    expect(boundary).toBeGreaterThan(0);
    for (const gate of [
      'npm run lint',
      'npm run typecheck',
      'npm run typecheck:scripts',
      'npm test',
      'migrate deploy',
      '--from-config-datasource --to-schema prisma/schema.prisma --exit-code',
    ])
      expect(script.indexOf(gate)).toBeLessThan(boundary);
    expect(boundary).toBeLessThan(script.indexOf('PORT=3199 nohup'));
    expect(boundary).toBeLessThan(script.indexOf("sudo -n ln -sfn '$REL'"));
    expect(script.slice(boundary, script.indexOf('step "9/10'))).toContain(
      'exit 0',
    );
  });
});
