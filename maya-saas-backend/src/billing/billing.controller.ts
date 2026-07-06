import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { UserRole } from '../common/domain.enums';
import { Public } from '../decorators/public.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { BillingService } from './billing.service';
import { CreateBillingCheckoutDto } from './dto/create-billing-checkout.dto';

@ApiTags('billing')
@Controller()
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('admin/tenants/:id/billing/checkout')
  @ApiBearerAuth()
  @Roles(UserRole.PLATFORM_OWNER, UserRole.TENANT_ADMIN)
  @TenantScoped({ paramKey: 'id', requireTenant: false })
  @ApiOperation({ summary: 'Create a YooKassa checkout for tenant billing' })
  createCheckout(
    @Param('id') tenantId: string,
    @Body() dto: CreateBillingCheckoutDto,
  ) {
    return this.billingService.createCheckout(tenantId, dto);
  }

  @Get('admin/tenants/:id/billing/payments')
  @ApiBearerAuth()
  @Roles(UserRole.PLATFORM_OWNER, UserRole.TENANT_ADMIN)
  @TenantScoped({ paramKey: 'id', requireTenant: false })
  @ApiOperation({ summary: 'List recent tenant billing payments' })
  listPayments(@Param('id') tenantId: string) {
    return this.billingService.listTenantPayments(tenantId);
  }

  @Post('admin/tenants/:id/billing/charge')
  @ApiBearerAuth()
  @Roles(UserRole.PLATFORM_OWNER)
  @ApiOperation({ summary: 'Charge tenant using a saved YooKassa method' })
  chargeTenant(@Param('id') tenantId: string) {
    return this.billingService.chargeTenant(tenantId);
  }

  @Post('admin/billing/run-due')
  @ApiBearerAuth()
  @Roles(UserRole.PLATFORM_OWNER)
  @ApiOperation({ summary: 'Charge due tenants or mark them past_due' })
  runDueBilling() {
    return this.billingService.runDueBilling();
  }

  @Public()
  @Post('billing/yookassa/webhook')
  @ApiOperation({ summary: 'Receive YooKassa payment notifications' })
  handleYooKassaWebhook(@Body() payload: Record<string, unknown>) {
    return this.billingService.handleYooKassaWebhook(payload);
  }
}
