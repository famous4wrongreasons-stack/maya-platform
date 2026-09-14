import { Controller, Get, Query } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { TenantAuditReadService } from './tenant-audit-read.service';
import type { TenantAuditQuery } from './tenant-audit-read.service';

@TenantScoped()
@Roles(UserRole.TENANT_OWNER, UserRole.BUSINESS_OWNER)
@Controller('audit')
export class TenantAuditReadController {
  constructor(private readonly reader: TenantAuditReadService) {}
  @Get()
  read(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: TenantAuditQuery,
  ) {
    return this.reader.read(actor.tenantId!, actor.userId, query);
  }
}
