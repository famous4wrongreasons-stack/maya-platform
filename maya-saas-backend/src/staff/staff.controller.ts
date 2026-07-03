import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { CurrentUser } from '../decorators/current-user.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { StaffService } from './staff.service';

@ApiTags('staff')
@ApiBearerAuth()
@TenantScoped()
@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @ApiOperation({ summary: 'List staff from the tenant CRM adapter' })
  listStaff(@CurrentUser() user: AuthenticatedUser) {
    return this.staffService.listStaff(user.tenantId!);
  }
}
