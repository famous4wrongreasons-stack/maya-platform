import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { RequiresFeature } from '../entitlements/requires-feature.decorator';
import { CustomerPortalService } from './customer-portal.service';

// A tenant user can also be a customer of the same business. The endpoint is
// self-scoped by the authenticated user id, so allowing business roles here
// changes the available surface without widening access to another customer.
const CUSTOMER_PORTAL_ROLES = [
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
] as const;

@ApiTags('customer-portal')
@ApiBearerAuth()
@TenantScoped()
@Roles(...CUSTOMER_PORTAL_ROLES)
@RequiresFeature('customer.portal')
@Controller('customer-portal')
export class CustomerPortalController {
  constructor(private readonly customerPortal: CustomerPortalService) {}

  @Get()
  @ApiOperation({
    summary: 'Get a resilient tenant-scoped customer cabinet overview',
  })
  getOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.customerPortal.getOverview(user.tenantId!, user.userId);
  }
}
