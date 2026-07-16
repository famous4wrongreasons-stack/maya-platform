import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { CurrentUser } from '../decorators/current-user.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { BranchesService } from './branches.service';

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
}
