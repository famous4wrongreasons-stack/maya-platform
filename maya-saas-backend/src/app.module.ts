import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';

import { AdminModule } from './admin/admin.module';
import { AiToolsModule } from './ai-tools/ai-tools.module';
import { AnalyticsHttpModule } from './analytics/analytics-http.module';
import { OperationsAnalyticsModule } from './analytics/operations-analytics.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppointmentsModule } from './appointments/appointments.module';
import { AppointmentNotificationsModule } from './appointment-notifications/appointment-notifications.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AuthorizationDenialInterceptor } from './audit-log/authorization-denial.interceptor';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { BranchesModule } from './branches/branches.module';
import { BrandingModule } from './branding/branding.module';
import { BusinessContentModule } from './business-content/business-content.module';
import { CommerceModule } from './commerce/commerce.module';
import { CrmModule } from './crm/crm.module';
import { CustomersModule } from './customers/customers.module';
import { CustomerPortalModule } from './customer-portal/customer-portal.module';
import { DashboardPreferencesModule } from './dashboard-preferences/dashboard-preferences.module';
import { EncryptionModule } from './encryption/encryption.module';
import { EntitlementsModule } from './entitlements/entitlements.module';
import { ExpensesModule } from './expenses/expenses.module';
import { FeatureGuard } from './entitlements/feature.guard';
import { InternalCalendarModule } from './internal-calendar/internal-calendar.module';
import { EventsModule } from './events/events.module';
import { InboxModule } from './inbox/inbox.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { OwnerReportsModule } from './owner-reports/owner-reports.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { TenantAccessGuard } from './guards/tenant-access.guard';
import { SubscriptionAccessGuard } from './guards/subscription-access.guard';
import { PrismaModule } from './prisma/prisma.module';
import { QuotaGuard } from './quotas/quota.guard';
import { QuotasModule } from './quotas/quotas.module';
import { RecoveryModule } from './recovery/recovery.module';
import { ReferralsModule } from './referrals/referrals.module';
import { ServicesModule } from './services/services.module';
import { StaffModule } from './staff/staff.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { TenantResolutionMiddleware } from './tenancy/tenant-resolution.middleware';
import { validateRuntimeConfig } from './config/runtime-config';
import { RequestMetricsInterceptor } from './request-metrics.interceptor';
import { SystemMetricsService } from './system-metrics.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateRuntimeConfig,
    }),
    PrismaModule,
    QuotasModule,
    TenancyModule,
    EntitlementsModule,
    ExpensesModule,
    EncryptionModule,
    SubscriptionsModule,
    TenantsModule,
    UsersModule,
    AuthModule,
    BillingModule,
    BrandingModule,
    BusinessContentModule,
    CommerceModule,
    BranchesModule,
    CrmModule,
    CustomersModule,
    CustomerPortalModule,
    DashboardPreferencesModule,
    InternalCalendarModule,
    EventsModule,
    InboxModule,
    LoyaltyModule,
    OwnerReportsModule,
    ServicesModule,
    StaffModule,
    AppointmentsModule,
    AppointmentNotificationsModule,
    AuditLogModule,
    OnboardingModule,
    AdminModule,
    OperationsAnalyticsModule,
    AnalyticsHttpModule,
    RecoveryModule,
    ReferralsModule,
    AiToolsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    SystemMetricsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestMetricsInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuthorizationDenialInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantAccessGuard,
    },
    {
      provide: APP_GUARD,
      useClass: SubscriptionAccessGuard,
    },
    {
      provide: APP_GUARD,
      useClass: FeatureGuard,
    },
    {
      provide: APP_GUARD,
      useClass: QuotaGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantResolutionMiddleware).forRoutes('*path');
  }
}
