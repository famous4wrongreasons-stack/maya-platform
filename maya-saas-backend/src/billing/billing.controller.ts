import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { AllowSubscriptionRequired } from '../decorators/allow-subscription-required.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { BillingService } from './billing.service';
import { CreateBillingCheckoutDto } from './dto/create-billing-checkout.dto';

/** Кто распоряжается подпиской СВОЕГО бизнеса. */
const SELF_BILLING_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
];

@ApiTags('billing')
@Controller()
@AllowSubscriptionRequired()
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  @Public()
  @Get('billing/plans')
  @ApiOperation({ summary: 'List plans available after a trial ends' })
  listPlans() {
    return this.subscriptionsService.listPublicPlans();
  }

  /**
   * 🔴 Подписка своего бизнеса — самообслуживание.
   *
   * Административные роуты ниже лежат под admin/tenants/:id и открыты только
   * платформе и tenant_admin. Владелец салона (tenant_owner / business_owner)
   * не мог начать оплату ВООБЩЕ — то есть продать подписку было физически
   * нечем. Здесь идентификатора в адресе нет: тенант берётся из сессии, чужой
   * подставить некуда.
   */
  @Get('billing/subscription')
  @ApiBearerAuth()
  @Roles(...SELF_BILLING_ROLES)
  @TenantScoped()
  @ApiOperation({ summary: 'Read the current tenant subscription' })
  mySubscription(@CurrentUser() actor: AuthenticatedUser) {
    return this.billingService.getSubscriptionSummary(actor.tenantId!);
  }

  @Post('billing/checkout')
  @ApiBearerAuth()
  @Roles(...SELF_BILLING_ROLES)
  @TenantScoped()
  @ApiOperation({ summary: 'Start a checkout for the current tenant' })
  myCheckout(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateBillingCheckoutDto,
  ) {
    return this.billingService.createCheckout(actor.tenantId!, dto);
  }

  @Get('billing/payments')
  @ApiBearerAuth()
  @Roles(...SELF_BILLING_ROLES)
  @TenantScoped()
  @ApiOperation({ summary: 'List payments of the current tenant' })
  myPayments(@CurrentUser() actor: AuthenticatedUser) {
    return this.billingService.listTenantPayments(actor.tenantId!);
  }

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
  @TenantScoped({ paramKey: 'id', requireTenant: false })
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
