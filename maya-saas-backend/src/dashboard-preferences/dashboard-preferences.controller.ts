import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { RequiresFeature } from '../entitlements/requires-feature.decorator';
import { DashboardPreferencesService } from './dashboard-preferences.service';
import { UpdateFinanceDashboardDto } from './dto/update-finance-dashboard.dto';

const FINANCE_DASHBOARD_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.ACCOUNTANT,
] as const;

@ApiTags('dashboard-preferences')
@ApiBearerAuth()
@TenantScoped()
@RequiresFeature('analytics.business')
@Roles(...FINANCE_DASHBOARD_ROLES)
@Controller('me/dashboard')
export class DashboardPreferencesController {
  constructor(private readonly service: DashboardPreferencesService) {}

  @Get('finance')
  @ApiOperation({ summary: 'Get personal finance dashboard configuration' })
  getFinance(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getFinance(user.tenantId!, user.userId);
  }

  @Patch('finance')
  @ApiOperation({ summary: 'Update personal finance dashboard configuration' })
  updateFinance(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateFinanceDashboardDto,
  ) {
    return this.service.updateFinance(user.tenantId!, user.userId, dto);
  }
}
