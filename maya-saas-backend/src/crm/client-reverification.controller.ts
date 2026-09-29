import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Post,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { CurrentUser } from '../decorators/current-user.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { ClientReverificationService } from './client-reverification.service';

@Controller('personal-client/reverification')
@TenantScoped()
export class ClientReverificationController {
  constructor(private readonly service: ClientReverificationService) {}
  @Post('challenge')
  issue(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-maya-authority-context') selection: unknown,
    @Body() body: unknown,
  ) {
    this.select(selection);
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length
    )
      throw new BadRequestException('Empty challenge request required');
    return this.service.issue(user);
  }
  @Post('consume')
  consume(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-maya-authority-context') selection: unknown,
    @Body() body: unknown,
  ) {
    this.select(selection);
    return this.service.consume(user, body);
  }
  private select(selection: unknown) {
    if (selection !== 'personal_client')
      throw new ForbiddenException('explicit_personal_client_context_required');
  }
}
