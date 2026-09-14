import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { C8ReadService } from './c8.read';
import type { C8ReadQuery } from './c8.read';

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
@Controller('analytics')
export class C8Controller {
  constructor(private readonly reader: C8ReadService) {}
  @Get('valuations') list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: C8ReadQuery,
  ) {
    return this.reader.list(actor.tenantId!, actor.userId, query);
  }
  @Get('valuation-models/readiness') readiness(
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reader.readiness(actor.tenantId!, actor.userId);
  }
  @Post('valuations/compute') compute(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    return this.reader.compute(actor.tenantId!, actor.userId, body);
  }
  @Get('valuations/:id') snapshot(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Query('offset') offset?: string,
  ) {
    return this.reader.snapshot(actor.tenantId!, actor.userId, id, offset);
  }
}
