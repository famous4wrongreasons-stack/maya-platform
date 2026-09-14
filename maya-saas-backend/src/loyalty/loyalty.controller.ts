import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { RequiresFeature } from '../entitlements/requires-feature.decorator';
import { AdjustLoyaltyDto } from './dto/adjust-loyalty.dto';
import { LoyaltyService } from './loyalty.service';

const LOYALTY_MANAGER_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
] as const;

@ApiTags('loyalty')
@ApiBearerAuth()
@TenantScoped()
@RequiresFeature('loyalty')
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the authoritative current loyalty balance' })
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.loyaltyService.getForUser(user.tenantId!, user.userId);
  }

  @Get('me/transactions')
  @ApiOperation({ summary: 'Get the current client internal loyalty ledger' })
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') rawLimit?: string,
  ) {
    return this.loyaltyService.listTransactions(
      user.tenantId!,
      user.userId,
      Number(rawLimit || 50),
    );
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@TenantScoped()
@RequiresFeature('loyalty')
@Roles(...LOYALTY_MANAGER_ROLES)
@Controller('admin/loyalty')
export class AdminLoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get(':userId')
  @ApiOperation({ summary: 'Get one tenant customer loyalty balance' })
  getCustomer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    return this.loyaltyService.getStateForUser(user.tenantId!, userId);
  }

  @Post(':userId/adjust')
  @ApiOperation({
    summary: 'Adjust an internal-calendar loyalty balance idempotently',
  })
  adjustCustomer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: AdjustLoyaltyDto,
  ) {
    return this.loyaltyService.adjustInternalBalance({
      tenantId: user.tenantId!,
      targetUserId: userId,
      actorUserId: user.userId,
      sourceRef: 'http.admin-loyalty.adjust',
      dto,
    });
  }
}
