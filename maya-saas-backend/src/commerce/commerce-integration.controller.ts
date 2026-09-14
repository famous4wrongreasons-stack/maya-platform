import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

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
  constructor(private readonly service: CommerceIntegrationService) {}

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
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.connect(
      user.tenantId!,
      user.userId,
      dto,
      idempotencyKey,
    );
  }

  @Post('yookassa/recheck')
  @AllowSubscriptionRequired()
  @ApiOperation({ summary: 'Recheck encrypted tenant YooKassa credentials' })
  async recheck(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.recheck(user.tenantId!, user.userId, idempotencyKey);
  }

  @Delete('yookassa')
  @AllowSubscriptionRequired()
  @ApiOperation({ summary: 'Remove tenant YooKassa credentials' })
  async disconnect(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.disconnect(user.tenantId!, user.userId, idempotencyKey);
  }
}
