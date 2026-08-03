import { Body, Controller, Delete, Get, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuditLogService } from '../audit-log/audit-log.service';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { AllowSubscriptionRequired } from '../decorators/allow-subscription-required.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { CommerceIntegrationService } from './commerce-integration.service';
import { ConnectCommerceIntegrationDto } from './dto/connect-commerce-integration.dto';

const COMMERCE_MANAGEMENT_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
] as const;

@ApiTags('commerce integrations')
@ApiBearerAuth()
@TenantScoped()
@Roles(...COMMERCE_MANAGEMENT_ROLES)
@Controller('integrations/commerce')
export class CommerceIntegrationController {
  constructor(
    private readonly service: CommerceIntegrationService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get()
  @AllowSubscriptionRequired()
  @ApiOperation({ summary: 'Get tenant YooKassa connection status' })
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getStatus(user.tenantId!);
  }

  @Put('yookassa')
  @AllowSubscriptionRequired()
  @ApiOperation({ summary: 'Verify and encrypt tenant YooKassa credentials' })
  async connect(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConnectCommerceIntegrationDto,
  ) {
    const result = await this.service.connect(user.tenantId!, dto);
    await this.auditLogService.log({
      tenantId: user.tenantId!,
      userId: user.userId,
      action: 'commerce.yookassa.connected',
      entityType: 'commerce_integration',
      entityId: result.connection.id,
      metadata: { provider: 'yookassa' },
    });
    return result;
  }

  @Post('yookassa/recheck')
  @AllowSubscriptionRequired()
  @ApiOperation({ summary: 'Recheck encrypted tenant YooKassa credentials' })
  async recheck(@CurrentUser() user: AuthenticatedUser) {
    const result = await this.service.recheck(user.tenantId!);
    await this.auditLogService.log({
      tenantId: user.tenantId!,
      userId: user.userId,
      action: 'commerce.yookassa.rechecked',
      entityType: 'commerce_integration',
      entityId: result.connection.id,
      metadata: { provider: 'yookassa' },
    });
    return result;
  }

  @Delete('yookassa')
  @AllowSubscriptionRequired()
  @ApiOperation({ summary: 'Remove tenant YooKassa credentials' })
  async disconnect(@CurrentUser() user: AuthenticatedUser) {
    const result = await this.service.disconnect(user.tenantId!);
    await this.auditLogService.log({
      tenantId: user.tenantId!,
      userId: user.userId,
      action: 'commerce.yookassa.disconnected',
      entityType: 'commerce_integration',
      entityId: user.tenantId!,
      metadata: { provider: 'yookassa' },
    });
    return result;
  }
}
