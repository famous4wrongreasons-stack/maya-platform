import { UserRole } from '../common/domain.enums';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { InternalCalendarController } from './internal-calendar.controller';

describe('InternalCalendarController access policy', () => {
  it('keeps the journal behind tenant manager roles', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      InternalCalendarController,
    ) as UserRole[];

    expect(roles).toEqual([
      UserRole.TENANT_ADMIN,
      UserRole.TENANT_OWNER,
      UserRole.BUSINESS_OWNER,
      UserRole.ADMINISTRATOR,
    ]);
    expect(roles).not.toContain(UserRole.CLIENT);
  });
});
