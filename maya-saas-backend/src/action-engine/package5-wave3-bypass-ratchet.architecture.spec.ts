import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PACKAGE5_WAVE3_REGISTRATIONS } from './package5-wave3-executable.contract';
import { PACKAGE5_WAVE3_MAX_CRM_TEAM_CHILDREN } from '../package5-wave3/package5-wave3.service';

const read = (path: string) =>
  readFileSync(join(process.cwd(), 'src', path), 'utf8');

describe('Package 5 Wave 3 ownership/bypass ratchet', () => {
  const canonical = read('package5-wave3/package5-wave3.service.ts');
  const crm = read('crm/crm.service.ts');
  const customers = read('customers/customers.service.ts');
  const aiTool = read('ai-tools/ai-tool-handler.service.ts');

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

  it('pins current production owners until the separate cutover cycle', () => {
    expect(aiTool).toContain('applyStaffScheduleDayChange');
    expect(crm).toContain('async stageIntegration');
    expect(crm).toContain('async disconnectIntegration');
    expect(customers).toContain('async updateOwnProfile');
    expect(customers).toContain('async updateNotes');
  });

  it('requires exact Client ownership, P02/P03 hold and append-only consent', () => {
    expect(canonical).toContain('client.userId !== actorUserId');
    expect(canonical).toContain('unresolvedClientIdentityHold.findFirst');
    expect(canonical).toContain('clientConsentFact.create');
    expect(canonical).not.toMatch(/clientConsentFact\.(update|delete|upsert)/);
  });
});
