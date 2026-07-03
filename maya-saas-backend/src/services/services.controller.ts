import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { CurrentUser } from '../decorators/current-user.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { ServicesService } from './services.service';

@ApiTags('services')
@ApiBearerAuth()
@TenantScoped()
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  @ApiOperation({ summary: 'List services from the tenant CRM adapter' })
  listServices(@CurrentUser() user: AuthenticatedUser) {
    return this.servicesService.listServices(user.tenantId!);
  }
}
