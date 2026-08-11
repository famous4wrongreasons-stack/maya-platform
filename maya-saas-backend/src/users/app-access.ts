import { UserRole } from '../common/domain.enums';

export type AppMode = 'platform' | 'owner' | 'staff' | 'client';
export type AppModeAccess = 'granted' | 'preview';

export type AppModeDescriptor = {
  mode: AppMode;
  access: AppModeAccess;
  tenant_id: string | null;
  role: UserRole;
  profile_linked: boolean;
};

export type AppAccessContext = {
  schema_version: 1;
  default_mode: AppMode | null;
  available_modes: AppModeDescriptor[];
  can_switch_mode: boolean;
  chooser_required: boolean;
};

type BuildAppAccessInput = {
  tenantId: string | null;
  role: UserRole;
  staffProfileLinked: boolean;
  customerProfileLinked: boolean;
  clientLookupPhoneLinked: boolean;
};

const PLATFORM_ROLES = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.PLATFORM_ADMIN,
]);

const OWNER_ROLES = new Set<UserRole>([
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
]);

const STAFF_ROLES = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.BRANCH_MANAGER,
  UserRole.PROVIDER,
  UserRole.EMPLOYEE,
  UserRole.STAFF,
  UserRole.ACCOUNTANT,
]);

const CLIENT_ROLES = new Set<UserRole>([UserRole.CUSTOMER, UserRole.CLIENT]);

/**
 * Derives native app modes exclusively from server-owned access records.
 * A client may select a returned mode, but it cannot create a capability by
 * sending a mode name of its own.
 */
export function buildAppAccessContext({
  tenantId,
  role,
  staffProfileLinked,
  customerProfileLinked,
  clientLookupPhoneLinked,
}: BuildAppAccessInput): AppAccessContext {
  const availableModes: AppModeDescriptor[] = [];

  if (!tenantId && PLATFORM_ROLES.has(role)) {
    availableModes.push({
      mode: 'platform',
      access: 'granted',
      tenant_id: null,
      role,
      profile_linked: true,
    });
  }

  if (tenantId && OWNER_ROLES.has(role)) {
    availableModes.push({
      mode: 'owner',
      access: 'granted',
      tenant_id: tenantId,
      role,
      profile_linked: true,
    });

    if (staffProfileLinked) {
      availableModes.push({
        mode: 'staff',
        access: 'granted',
        tenant_id: tenantId,
        role,
        profile_linked: true,
      });
    }
  } else if (tenantId && STAFF_ROLES.has(role)) {
    availableModes.push({
      mode: 'staff',
      access: 'granted',
      tenant_id: tenantId,
      role,
      profile_linked: staffProfileLinked,
    });
  }

  const hasBusinessMode = availableModes.some(
    ({ mode }) => mode === 'owner' || mode === 'staff',
  );
  const clientIdentityLinked = customerProfileLinked || clientLookupPhoneLinked;
  const hasClientAccess = clientIdentityLinked || CLIENT_ROLES.has(role);
  const canUseClientSurface =
    OWNER_ROLES.has(role) || STAFF_ROLES.has(role) || CLIENT_ROLES.has(role);

  if (tenantId && canUseClientSurface && (hasClientAccess || hasBusinessMode)) {
    availableModes.push({
      mode: 'client',
      access: hasClientAccess ? 'granted' : 'preview',
      tenant_id: tenantId,
      role,
      profile_linked: clientIdentityLinked,
    });
  }

  return {
    schema_version: 1,
    default_mode: availableModes[0]?.mode ?? null,
    available_modes: availableModes,
    can_switch_mode: availableModes.length > 1,
    chooser_required: availableModes.length > 1,
  };
}
