import { UserRole } from '../common/domain.enums';
import { buildAppAccessContext } from './app-access';

describe('buildAppAccessContext', () => {
  it('keeps a non-bookable administrator in staff mode', () => {
    const result = buildAppAccessContext({
      tenantId: 'tenant-1',
      role: UserRole.ADMINISTRATOR,
      staffProfileLinked: false,
      customerProfileLinked: false,
      clientLookupPhoneLinked: false,
    });

    expect(result.default_mode).toBe('staff');
    expect(result.available_modes).toEqual([
      expect.objectContaining({
        mode: 'staff',
        access: 'granted',
        profile_linked: false,
      }),
      expect.objectContaining({
        mode: 'client',
        access: 'preview',
      }),
    ]);
  });

  it('does not turn a linked staff profile into owner access', () => {
    const result = buildAppAccessContext({
      tenantId: 'tenant-1',
      role: UserRole.STAFF,
      staffProfileLinked: true,
      customerProfileLinked: true,
      clientLookupPhoneLinked: true,
    });

    expect(result.available_modes.map(({ mode }) => mode)).toEqual([
      'staff',
      'client',
    ]);
    expect(result.available_modes).not.toContainEqual(
      expect.objectContaining({ mode: 'owner' }),
    );
  });

  it('does not expose tenant modes to an integration identity', () => {
    const result = buildAppAccessContext({
      tenantId: 'tenant-1',
      role: UserRole.INTEGRATION_SERVICE,
      staffProfileLinked: true,
      customerProfileLinked: false,
      clientLookupPhoneLinked: true,
    });

    expect(result).toEqual({
      schema_version: 1,
      default_mode: null,
      available_modes: [],
      can_switch_mode: false,
      chooser_required: false,
    });
  });

  it('grants a business user client mode when their own CRM lookup phone is linked', () => {
    const result = buildAppAccessContext({
      tenantId: 'tenant-1',
      role: UserRole.TENANT_OWNER,
      staffProfileLinked: true,
      customerProfileLinked: false,
      clientLookupPhoneLinked: true,
    });

    expect(result.available_modes).toContainEqual(
      expect.objectContaining({
        mode: 'client',
        access: 'granted',
        profile_linked: true,
      }),
    );
  });
});
