import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { QuotaResource } from '../quotas/quota-resource';
import { RequiresQuota } from '../quotas/requires-quota.decorator';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';

@ApiTags('branches')
@ApiBearerAuth()
@TenantScoped()
@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  @ApiOperation({ summary: 'List branches for the current tenant' })
  listBranches(@CurrentUser() user: AuthenticatedUser) {
    return this.branchesService.listForTenant(user.tenantId!);
  }

  @Post()
  @Roles(
    UserRole.TENANT_OWNER,
    UserRole.BUSINESS_OWNER,
    UserRole.TENANT_ADMIN,
    UserRole.ADMINISTRATOR,
  )
  @RequiresQuota(QuotaResource.BRANCHES)
  @ApiOperation({ summary: 'Create a branch within the current plan quota' })
  createBranch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBranchDto,
  ) {
    return this.branchesService.createForTenant(
      user.tenantId!,
      user.userId,
      dto,
    );
  }
}
