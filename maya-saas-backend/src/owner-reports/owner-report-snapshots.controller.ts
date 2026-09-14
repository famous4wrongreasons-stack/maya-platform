import { OwnerReportDownloadService } from './owner-report-download.service';
import { Controller, Get, Param } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { OwnerReportStore } from './owner-report.store';

@TenantScoped()
@Roles(
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.PLATFORM_OWNER,
  UserRole.PROVIDER,
  UserRole.EMPLOYEE,
  UserRole.STAFF,
)
@Controller('owner-reports')
export class OwnerReportSnapshotsController {
  constructor(
    private readonly store: OwnerReportStore,
    private readonly download: OwnerReportDownloadService,
  ) {}
  @Get()
  list(@CurrentUser() actor: AuthenticatedUser) {
    return this.store.snapshots(actor.tenantId!, actor.userId);
  }
  @Get('admin-help')
  @Roles(
    UserRole.TENANT_OWNER,
    UserRole.BUSINESS_OWNER,
    UserRole.TENANT_ADMIN,
    UserRole.ADMINISTRATOR,
    UserRole.PLATFORM_OWNER,
  )
  help() {
    return this.download.staticHelp();
  }
  @Get(':id/download')
  async pdf(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.download.snapshot(
      await this.store.snapshot(actor.tenantId!, actor.userId, id),
    );
  }
  @Get(':id/snapshot')
  snapshot(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.store.snapshot(actor.tenantId!, actor.userId, id);
  }
}
