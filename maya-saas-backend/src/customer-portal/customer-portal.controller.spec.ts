import { UserRole } from '../common/domain.enums';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { CustomerPortalController } from './customer-portal.controller';

describe('CustomerPortalController access policy', () => {
  it('allows every tenant person to open only their own customer surface', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      CustomerPortalController,
    ) as UserRole[];

    expect(roles).toEqual([
      UserRole.CLIENT,
      UserRole.CUSTOMER,
      UserRole.TENANT_OWNER,
      UserRole.BUSINESS_OWNER,
      UserRole.TENANT_ADMIN,
      UserRole.ADMINISTRATOR,
      UserRole.MANAGER,
      UserRole.BRANCH_MANAGER,
      UserRole.PROVIDER,
      UserRole.EMPLOYEE,
      UserRole.STAFF,
      UserRole.ACCOUNTANT,
    ]);
    expect(roles).not.toContain(UserRole.PLATFORM_OWNER);
    expect(roles).not.toContain(UserRole.INTEGRATION_SERVICE);
  });
});
