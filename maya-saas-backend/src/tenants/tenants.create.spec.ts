import { ForbiddenException } from '@nestjs/common';
import { TenantsService } from './tenants.service';

describe('TenantsService legacy creation closure', () => {
  const service = Object.create(TenantsService.prototype) as TenantsService;
  it('cannot remain an alternate tenant creation owner', async () => {
    await expect(
      service.createTenant({ name: 'Synthetic', slug: 'synthetic' }),
    ).rejects.toThrow(ForbiddenException);
  });
  it('cannot physically compensate a failed trial', async () => {
    await expect(service.deleteFailedTrialTenant('tenant')).rejects.toThrow(
      ForbiddenException,
    );
  });
  it('preserves reserved hostname validation for canonical initiators', () => {
    for (const slug of ['app', 'api', 'admin', 'billing'])
      expect(() => service.assertHostNamesAllowed({ slug })).toThrow();
    expect(() =>
      service.assertHostNamesAllowed({ slug: 'synthetic-studio' }),
    ).not.toThrow();
  });
});
