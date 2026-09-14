import { Controller, Get, Param, Query } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { MeasurementReadService } from './measurement.read.service';
import type { MeasurementReadQuery } from './measurement.read.service';

@TenantScoped()
@Roles(
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.ACCOUNTANT,
  UserRole.BRANCH_MANAGER,
  UserRole.PROVIDER,
  UserRole.EMPLOYEE,
  UserRole.STAFF,
)
@Controller('analytics/measurements')
export class MeasurementController {
  constructor(private readonly reader: MeasurementReadService) {}
  @Get()
  read(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: MeasurementReadQuery,
  ) {
    return this.reader.read(actor.tenantId!, actor.userId, query);
  }
  @Get(':id')
  snapshot(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.reader.snapshot(actor.tenantId!, actor.userId, id);
  }
}
