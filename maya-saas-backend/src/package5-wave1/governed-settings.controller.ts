import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { GovernedSettingsReadService } from './governed-settings.read';
import { Package5Wave1CanonicalCutoverService } from './package5-wave1-canonical-cutover.service';

@Controller('governed-settings')
@TenantScoped()
@Roles(
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.BRANCH_MANAGER,
  UserRole.ACCOUNTANT,
  UserRole.PROVIDER,
  UserRole.EMPLOYEE,
  UserRole.STAFF,
)
export class GovernedSettingsController {
  constructor(
    private readonly read: GovernedSettingsReadService,
    private readonly canonical: Package5Wave1CanonicalCutoverService,
  ) {}
  @Get('personal')
  personal(@CurrentUser() actor: AuthenticatedUser) {
    return this.read.readPersonal(actor.tenantId!, actor.userId);
  }
  @Get('tenant/:namespace')
  configuration(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('namespace') namespace: string,
  ) {
    return this.read.read(actor.tenantId!, actor.userId, namespace);
  }
  @Post('personal')
  mute(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() command: unknown,
    @Headers('idempotency-key') identity: string | undefined,
  ) {
    return this.canonical.updateGoverned(
      actor.tenantId!,
      actor.userId,
      'staff_notification_preferences',
      command,
      identity,
    );
  }
  @Post('tenant')
  @Roles(UserRole.TENANT_OWNER, UserRole.BUSINESS_OWNER)
  tenant(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() command: unknown,
    @Headers('idempotency-key') identity: string | undefined,
  ) {
    return this.canonical.updateGoverned(
      actor.tenantId!,
      actor.userId,
      'tenant_business_configuration',
      command,
      identity,
    );
  }
}
