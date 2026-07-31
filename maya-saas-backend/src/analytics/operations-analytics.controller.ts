import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { RequiresFeature } from '../entitlements/requires-feature.decorator';
import { AnalyticsRangeQueryDto } from './dto/analytics-range-query.dto';
import { OperationsAnalyticsService } from './operations-analytics.service';

const BUSINESS_ANALYTICS_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.ACCOUNTANT,
] as const;

const BUSINESS_FINANCE_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.ACCOUNTANT,
] as const;

const EMPLOYEE_ANALYTICS_ROLES = [
  UserRole.PROVIDER,
  UserRole.EMPLOYEE,
  UserRole.STAFF,
] as const;

@ApiTags('analytics')
@ApiBearerAuth()
@TenantScoped()
@Controller('analytics')
export class OperationsAnalyticsController {
  constructor(private readonly analytics: OperationsAnalyticsService) {}

  @Get('business')
  @Roles(...BUSINESS_ANALYTICS_ROLES)
  @RequiresFeature('analytics.business')
  @ApiOperation({ summary: 'Get tenant business operational analytics' })
  getBusiness(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AnalyticsRangeQueryDto,
  ) {
    return this.analytics.getBusinessOverview(user.tenantId!, query);
  }

  @Get('business/finance')
  @Roles(...BUSINESS_FINANCE_ROLES)
  @RequiresFeature('analytics.business')
  @ApiOperation({
    summary: 'Get verified tenant finance and payroll from the external CRM',
  })
  getBusinessFinance(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AnalyticsRangeQueryDto,
  ) {
    return this.analytics.getBusinessFinance(user.tenantId!, query);
  }

  @Get('me')
  @Roles(...EMPLOYEE_ANALYTICS_ROLES)
  @RequiresFeature('analytics.employee')
  @ApiOperation({ summary: 'Get employee-scoped operational analytics' })
  getMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AnalyticsRangeQueryDto,
  ) {
    return this.analytics.getEmployeeOverview(
      user.tenantId!,
      user.userId,
      query,
    );
  }
}
