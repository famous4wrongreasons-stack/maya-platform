import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PACKAGE5_WAVE4_REGISTRATIONS } from './package5-wave4-executable.contract';

const read = (path: string) =>
  readFileSync(join(process.cwd(), 'src', path), 'utf8');

describe('Package 5 Wave 4 ownership/bypass ratchet', () => {
  const canonical = read('package5-wave4/package5-wave4.service.ts');
  const cutover = read(
    'package5-wave4/package5-wave4-canonical-cutover.service.ts',
  );
  const module = read('package5-wave4/package5-wave4.module.ts');
  const businessContent = read('business-content/business-content.service.ts');
  const businessController = read(
    'business-content/business-content.controller.ts',
  );
  const internalCalendar = read(
    'internal-calendar/internal-calendar.service.ts',
  );
  const calendarController = read(
    'internal-calendar/internal-calendar.controller.ts',
  );
  const branding = read('branding/branding.service.ts');
  const onboarding = read('onboarding/ai-onboarding.service.ts');

  it('pins 12 governed actions and one external object write', () => {
    expect(PACKAGE5_WAVE4_REGISTRATIONS).toHaveLength(12);
    expect(
      PACKAGE5_WAVE4_REGISTRATIONS.filter(
        (row) => row.authorityClass === 'AC2',
      ).map((row) => row.actionClass),
    ).toEqual(['upload_provider_avatar']);
  });

  it('keeps P4-09 value-bearing offer authority outside Wave 4', () => {
    expect(canonical).toContain("kind: 'inventory'");
    expect(canonical).toContain(
      "throw new ConflictException('Value-bearing offer belongs to P4-09')",
    );
    expect(canonical).not.toMatch(
      /tenantCatalogItemValueVersion\.(create|update|delete|upsert)/,
    );
    expect(businessContent).toContain(
      'this.canonicalValueConfiguration.createOffer',
    );
    expect(businessContent).toContain(
      'this.canonicalValueConfiguration.updateOffer',
    );
  });

  it('keeps review acceptance as AC4 rather than fabricating an action', () => {
    expect(
      PACKAGE5_WAVE4_REGISTRATIONS.map((row) => row.operation),
    ).not.toContain('ingest_business_review');
    expect(canonical).toContain('class Package5Wave4ReviewFactService');
    expect(canonical).not.toMatch(/businessReview\.(update|updateMany|upsert)/);
    expect(businessContent).toContain('this.reviewFacts.accept');
    expect(businessContent).not.toMatch(
      /businessReview\.(create|update|updateMany|upsert|delete|deleteMany)/,
    );
  });

  it('makes archive and prospective-only behavior explicit', () => {
    expect(canonical).toContain("case 'archive_inventory_item'");
    expect(canonical).toContain("case 'archive_internal_service'");
    expect(canonical).not.toMatch(/tenantCatalogItem\.delete/);
    expect(canonical).not.toMatch(/appointment\.(update|updateMany|delete)/);
    expect(canonical).not.toMatch(/totalPriceKopecks\s*:/);
  });

  it('keeps raw avatar bytes outside ActionExecution material', () => {
    const requestStart = canonical.indexOf(
      'const request: TrustedActionExecutionRequestV1',
    );
    const request = canonical.slice(
      requestStart,
      canonical.indexOf('evidenceRefs:', requestStart),
    );
    expect(request).not.toMatch(/bytes|mimeType|displayName|description|note/);
    expect(request).toContain('providerObjectContentHash');
    expect(request).toContain('providerRequestIdentityHash');
  });

  it('makes Action Engine the production owner for all 12 actions', () => {
    expect(module).toContain('Package5Wave4CanonicalCutoverService');
    expect(cutover).toContain("'execute'");
    expect(cutover).toContain('this.executor.resume(prepared)');
    expect(cutover).toContain('this.executor.execute(prepared)');
    expect(businessContent).toContain(
      'this.canonicalWave4.createInventoryItem',
    );
    expect(businessContent).toContain(
      'this.canonicalWave4.updateInventoryItem',
    );
    expect(businessContent).toContain(
      'this.canonicalWave4.archiveInventoryItem',
    );
    expect(businessContent).not.toMatch(
      /tenantCatalogItem\.(create|update|upsert|delete|deleteMany)/,
    );
    for (const ownerCall of [
      'createService',
      'updateService',
      'archiveService',
      'createProvider',
      'updateProvider',
      'replaceWeeklyAvailability',
      'createTimeOff',
      'deleteTimeOff',
      'uploadProviderAvatar',
    ]) {
      expect(calendarController).toContain(`this.canonicalWave4.${ownerCall}`);
    }
    expect(calendarController).not.toMatch(
      /this\.(?:internalCalendarService|brandingService)\.(?:createService|updateService|deactivateService|createProvider|updateProvider|replaceWeeklyAvailability|createTimeOff|deleteTimeOff|uploadProviderAvatar)/,
    );
    expect(branding).not.toContain('async uploadProviderAvatar');
    expect(businessController.match(/idempotency-key/g)).toHaveLength(3);
    expect(calendarController.match(/idempotency-key/g)).toHaveLength(9);
  });

  it('keeps AI confirmation outside direct calendar provisioning', () => {
    expect(onboarding).not.toContain('provisionInternalCalendar');
    expect(onboarding).not.toContain('internalCalendarService');
    expect(onboarding).toContain('this.confirmation.confirm');
    expect(internalCalendar).toContain('async bootstrapCreateProvider');
    expect(internalCalendar).toContain('async bootstrapCreateService');
    expect(internalCalendar).not.toMatch(/\n\s{2}async createService\(/);
    expect(internalCalendar).not.toMatch(/\n\s{2}async updateService\(/);
    expect(internalCalendar).not.toMatch(/\n\s{2}async createProvider\(/);
    expect(internalCalendar).not.toMatch(/\n\s{2}async updateProvider\(/);
    expect(internalCalendar).not.toMatch(
      /\n\s{2}async replaceWeeklyAvailability\(/,
    );
    expect(internalCalendar).not.toMatch(/\n\s{2}async createTimeOff\(/);
    expect(internalCalendar).not.toMatch(/\n\s{2}async deleteTimeOff\(/);
    expect(canonical).not.toContain('AiOnboardingDraft');
  });
});
