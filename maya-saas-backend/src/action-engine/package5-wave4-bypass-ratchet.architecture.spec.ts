import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PACKAGE5_WAVE4_REGISTRATIONS } from './package5-wave4-executable.contract';

const read = (path: string) =>
  readFileSync(join(process.cwd(), 'src', path), 'utf8');

describe('Package 5 Wave 4 ownership/bypass ratchet', () => {
  const canonical = read('package5-wave4/package5-wave4.service.ts');
  const businessContent = read('business-content/business-content.service.ts');
  const internalCalendar = read(
    'internal-calendar/internal-calendar.service.ts',
  );
  const calendarController = read(
    'internal-calendar/internal-calendar.controller.ts',
  );
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

  it('pins current production owners until the separate cutover cycle', () => {
    expect(businessContent).toContain('private async createInventoryItem');
    expect(businessContent).toContain('private async updateInventoryItem');
    expect(businessContent).toContain('private async deleteInventoryItem');
    expect(internalCalendar).toContain('async createService');
    expect(internalCalendar).toContain('async replaceWeeklyAvailability');
    expect(calendarController).toContain(
      'this.brandingService.uploadProviderAvatar',
    );
  });

  it('keeps pre-tenant calendar provisioning narrowly classified under A26', () => {
    expect(onboarding).toContain('private async provisionInternalCalendar');
    expect(onboarding).toContain('createdTenantId');
    expect(canonical).not.toContain('AiOnboardingDraft');
  });
});
