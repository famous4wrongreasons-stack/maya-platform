import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { PACKAGE5_WAVE3_REGISTRATIONS } from './package5-wave3-executable.contract';
import { PACKAGE5_WAVE3_MAX_CRM_TEAM_CHILDREN } from '../package5-wave3/package5-wave3.service';

const read = (path: string) =>
  readFileSync(join(process.cwd(), 'src', path), 'utf8');

describe('Package 5 Wave 3 ownership/bypass ratchet', () => {
  const canonical = read('package5-wave3/package5-wave3.service.ts');
  const crm = read('crm/crm.service.ts');
  const customers = read('customers/customers.service.ts');
  const aiTool = read('ai-tools/ai-tool-handler.service.ts');
  const controller = read('crm/crm-integration.controller.ts');
  const admin = read('admin/admin.service.ts');
  const cutover = read(
    'package5-wave3/package5-wave3-canonical-cutover.service.ts',
  );
  const module = read('crm/crm.module.ts');

  it('executes the actual R03 native schedule boundary and adversarial writer ratchet', () => {
    const proof = spawnSync(
      'python3',
      [join(process.cwd(), '../ai администратор/test_package5_wave_rb_r03.py')],
      {
        encoding: 'utf8',
        timeout: 30_000,
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
      },
    );
    expect({ status: proof.status, error: proof.error?.message }).toEqual({
      status: 0,
      error: undefined,
    });
    expect(proof.stderr).toContain('Ran 6 tests');
  });

  it('pins exact action inventory and the only external write', () => {
    expect(PACKAGE5_WAVE3_REGISTRATIONS).toHaveLength(8);
    expect(
      PACKAGE5_WAVE3_REGISTRATIONS.filter(
        (row) => row.authorityClass === 'AC2',
      ).map((row) => row.actionClass),
    ).toEqual(['update_external_staff_schedule_day']);
  });

  it('keeps raw CRM credentials and encrypted notes outside ActionExecution input', () => {
    const requestStart = canonical.indexOf(
      'const request: TrustedActionExecutionRequestV1',
    );
    const request = canonical.slice(
      requestStart,
      canonical.indexOf('evidenceRefs:', requestStart),
    );
    expect(request).not.toMatch(/encryptedApiToken|encryptedNotes|slots:/);
    expect(request).toContain('credentialFingerprint');
    expect(request).toContain('providerSnapshotHash');
  });

  it('pins the existing production import bound without promoting previews to owners', () => {
    expect(PACKAGE5_WAVE3_MAX_CRM_TEAM_CHILDREN).toBe(50);
    expect(crm).toContain('items: team.slice(0, 50)');
    expect(crm).toContain('this.reconcileCrmTeamAccess');
    expect(canonical).not.toMatch(/services\.create|tenantCatalogItem\.create/);
  });

  it('keeps AC4/AC5 observation and identity projection outside fabricated actions', () => {
    expect(crm).toContain('async recheckIntegration');
    expect(crm).toContain('private async reconcileCrmTeamAccess');
    expect(
      PACKAGE5_WAVE3_REGISTRATIONS.map((row) => row.operation),
    ).not.toContain('recheck_crm_integration');
    expect(
      PACKAGE5_WAVE3_REGISTRATIONS.map((row) => row.operation),
    ).not.toContain('register_crm_client');
  });

  it('pins Action Engine ownership on every production initiator', () => {
    expect(cutover).toContain('this.planner.build(');
    expect(cutover).toContain("'execute'");
    expect(controller).toContain('this.canonicalWave3.installCrmCredentials');
    expect(controller).toContain('this.canonicalWave3.activateCrmIntegration');
    expect(controller).toContain(
      'this.canonicalWave3.disconnectCrmIntegration',
    );
    expect(aiTool).toContain(
      'this.requireCanonicalWave3().updateExternalStaffScheduleDay',
    );
    expect(customers).toContain('this.canonicalWave3.updateClientLocale');
    expect(customers).toContain('this.canonicalWave3.recordClientConsent');
    expect(customers).toContain('this.canonicalWave3.updateClientNotes');
    expect(admin).toContain('this.canonicalWave3.installCrmCredentials');
    expect(module).toContain('Package5Wave3CanonicalCutoverService');
  });

  it('forbids legacy business mutation owners and fallback methods', () => {
    expect(crm).not.toMatch(
      /async (stageIntegration|connectAndActivateIntegration|activateIntegration|disconnectIntegration)/,
    );
    expect(customers).not.toMatch(
      /customerProfile\.(create|update|upsert|delete|deleteMany|updateMany)/,
    );
    expect(aiTool).not.toContain('this.crmService.applyStaffScheduleDayChange');
    expect(admin).not.toContain(
      'this.crmService.connectAndActivateIntegration',
    );
    expect(crm).toContain('async ensureBootstrapMockIntegration');
    expect(crm).toContain('provider !== CrmProvider.MOCK');
  });

  it('requires exact Client ownership, P02/P03 hold and append-only consent', () => {
    expect(canonical).toContain('client.userId !== actorUserId');
    expect(canonical).toContain('unresolvedClientIdentityHold.findFirst');
    expect(canonical).toContain('clientConsentFact.create');
    expect(canonical).not.toMatch(/clientConsentFact\.(update|delete|upsert)/);
  });
});
