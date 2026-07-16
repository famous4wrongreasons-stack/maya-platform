import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { UserRole } from '../common/domain.enums';
import { Roles } from '../decorators/roles.decorator';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminCatalogController {
  constructor(private readonly adminService: AdminService) {}

  @Get('plans')
  @Roles(UserRole.PLATFORM_OWNER)
  @ApiOperation({ summary: 'List available subscription plans for onboarding' })
  listPlans() {
    return this.adminService.listPlans();
  }
}
