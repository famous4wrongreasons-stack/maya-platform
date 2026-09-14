import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { NativeFeedbackService } from './native-feedback.service';
@Controller('native-feedback')
@TenantScoped()
@Roles(
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
)
export class NativeFeedbackController {
  constructor(private readonly owner: NativeFeedbackService) {}
  @Get() page(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('cursor') cursor?: string,
  ) {
    return this.owner.managementPage(actor.tenantId!, actor.userId, cursor);
  }
  @Post('requests') request(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() value: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.owner.request(actor.tenantId!, actor.userId, value, key);
  }
  @Get('requests/:id') read(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.owner.readManagement(actor.tenantId!, actor.userId, id);
  }
}
