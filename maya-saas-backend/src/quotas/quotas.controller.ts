import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { QuotaService } from './quota.service';

@ApiTags('quotas')
@ApiBearerAuth()
@TenantScoped()
@Roles(
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.BRANCH_MANAGER,
)
@Controller('quotas')
export class QuotasController {
  constructor(private readonly quotas: QuotaService) {}

  @Get()
  @ApiOperation({ summary: 'Read current plan usage and creation limits' })
  async getUsage(@CurrentUser() user: AuthenticatedUser) {
    const usage = await this.quotas.getUsage(user.tenantId!);

    return {
      tenant_id: usage.tenantId,
      plan: usage.plan,
      branches: {
        used: usage.branches.current,
        limit: usage.branches.limit,
        remaining: Math.max(usage.branches.limit - usage.branches.current, 0),
      },
      staff: {
        used: usage.staff.current,
        limit: usage.staff.limit,
        remaining: Math.max(usage.staff.limit - usage.staff.current, 0),
      },
      white_label_enabled: usage.isWhiteLabelEnabled,
    };
  }
}
