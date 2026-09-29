import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { WidgetReleaseService } from './widget-release.service';

/** One platform operator entry. Normal JWT/session/global guards remain in force. */
@Controller('platform/widget-release/:tenantId')
@Roles(UserRole.PLATFORM_OWNER)
@TenantScoped({ paramKey: 'tenantId' })
export class WidgetReleaseController {
  constructor(private readonly release: WidgetReleaseService) {}
  @Post('validate')
  validate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
  ) {
    return this.release.validate(actor, tenantId, body);
  }
  @Post('grant')
  grant(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
  ) {
    return this.release.grant(actor, tenantId, body);
  }
  @Post('revoke')
  revoke(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
  ) {
    return this.release.revoke(actor, tenantId, body);
  }
  @Get('status')
  status(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('tenantId') tenantId: string,
  ) {
    return this.release.status(actor, tenantId);
  }
}
