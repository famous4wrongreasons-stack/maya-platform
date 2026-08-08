import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { IngestInboxItemDto, RegisterPushTokenDto } from './dto/inbox.dto';
import { InboxService } from './inbox.service';

const INBOX_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.BRANCH_MANAGER,
  UserRole.PROVIDER,
  UserRole.EMPLOYEE,
  UserRole.STAFF,
  UserRole.PLATFORM_OWNER,
] as const;

@ApiTags('inbox')
@Controller('inbox')
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}

  @Public()
  @Post('internal/ingest')
  @ApiOperation({
    summary: 'Legacy bot dual-write of persistent inbox items (bridge token)',
  })
  ingest(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: IngestInboxItemDto,
  ) {
    this.inboxService.assertBridgeToken(bridgeToken);
    return this.inboxService.ingest(dto);
  }

  @ApiBearerAuth()
  @TenantScoped()
  @Roles(...INBOX_ROLES)
  @Get()
  @ApiOperation({ summary: 'List persistent MAYA inbox items for the current user' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ) {
    return this.inboxService.listForUser(
      user.tenantId!,
      user.userId,
      Number(limit) || 50,
    );
  }

  @ApiBearerAuth()
  @TenantScoped()
  @Roles(...INBOX_ROLES)
  @Post('devices')
  @ApiOperation({ summary: 'Register a native/web push device token' })
  registerDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterPushTokenDto,
  ) {
    return this.inboxService.registerDevice(user.tenantId!, user.userId, dto);
  }

  @ApiBearerAuth()
  @TenantScoped()
  @Roles(...INBOX_ROLES)
  @Post(':id/read')
  @ApiOperation({ summary: 'Mark one inbox item as read' })
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.inboxService.markRead(user.tenantId!, user.userId, id);
  }
}
