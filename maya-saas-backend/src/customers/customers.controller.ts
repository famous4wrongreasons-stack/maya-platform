import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { RequiresFeature } from '../entitlements/requires-feature.decorator';
import { CustomersService } from './customers.service';
import { UpdateCustomerNotesDto } from './dto/update-customer-notes.dto';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';

const CUSTOMER_MANAGER_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
] as const;

@ApiTags('customers')
@ApiBearerAuth()
@TenantScoped()
@RequiresFeature('customers.core')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get('me/profile')
  @ApiOperation({ summary: 'Get the current customer consent profile' })
  getOwnProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.customersService.getOwnProfile(user.tenantId!, user.userId);
  }

  @Patch('me/profile')
  @ApiOperation({ summary: 'Update the current customer consent profile' })
  updateOwnProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCustomerProfileDto,
  ) {
    return this.customersService.updateOwnProfile(
      user.tenantId!,
      user.userId,
      dto,
    );
  }

  @Get()
  @Roles(...CUSTOMER_MANAGER_ROLES)
  @ApiOperation({ summary: 'List tenant-scoped customer records' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') rawLimit?: string,
  ) {
    return this.customersService.listCustomers(
      user.tenantId!,
      Number(rawLimit || 50),
    );
  }

  @Get(':userId')
  @Roles(...CUSTOMER_MANAGER_ROLES)
  @ApiOperation({ summary: 'Get one tenant-scoped customer record' })
  getCustomer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    return this.customersService.getCustomer(user.tenantId!, userId);
  }

  @Patch(':userId/notes')
  @Roles(...CUSTOMER_MANAGER_ROLES)
  @ApiOperation({ summary: 'Update encrypted internal customer notes' })
  updateNotes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: UpdateCustomerNotesDto,
  ) {
    return this.customersService.updateNotes(
      user.tenantId!,
      user.userId,
      userId,
      dto,
    );
  }
}
