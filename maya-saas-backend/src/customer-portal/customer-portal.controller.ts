import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { RequiresFeature } from '../entitlements/requires-feature.decorator';
import { CustomerPortalService } from './customer-portal.service';

@ApiTags('customer-portal')
@ApiBearerAuth()
@TenantScoped()
@Roles(UserRole.CLIENT, UserRole.CUSTOMER)
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
